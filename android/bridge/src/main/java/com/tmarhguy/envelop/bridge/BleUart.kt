package com.tmarhguy.envelop.bridge

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.channels.Channel
import java.util.UUID

@SuppressLint("MissingPermission")
class BleUart(private val context: Context) {
    val incoming = Channel<ByteArray>(Channel.UNLIMITED)
    val ready = CompletableDeferred<Unit>()
    val disconnected = CompletableDeferred<Unit>()
    private val adapter = context.getSystemService(BluetoothManager::class.java).adapter
    private val handler = Handler(Looper.getMainLooper())
    private var gatt: BluetoothGatt? = null
    private var device: BluetoothDevice? = null
    private var rx: BluetoothGattCharacteristic? = null
    private val writes = ArrayDeque<ByteArray>()
    private var writing = false
    private var writeGeneration = 0
    private var connectAttempts = 0
    private var discoverAttempts = 0
    private var closed = false

    fun start() {
        require(adapter?.isEnabled == true) { "Bluetooth is off" }
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE)).build()
        adapter.bluetoothLeScanner.startScan(listOf(filter),
            ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scan)
    }
    fun close() {
        closed = true
        handler.removeCallbacksAndMessages(null)
        runCatching { adapter?.bluetoothLeScanner?.stopScan(scan) }
        val current = gatt
        gatt = null
        rx = null
        current?.disconnect()
        handler.post { runCatching { current?.close() } }
        if (!disconnected.isCompleted) disconnected.complete(Unit)
    }
    @Synchronized fun send(bytes: ByteArray): Boolean {
        val chunks = bytes.asIterable().chunked(20).map { it.toByteArray() }
        if (writes.size + chunks.size > 256) return false
        writes.addAll(chunks)
        handler.post { synchronized(this) { drain() } }
        return true
    }
    @Synchronized private fun drain() {
        if (writing || closed) return
        val characteristic = rx ?: return
        val chunk = writes.removeFirstOrNull() ?: return
        val current = gatt ?: return
        writing = true
        val generation = ++writeGeneration
        val ok = if (Build.VERSION.SDK_INT >= 33) {
            current.writeCharacteristic(characteristic, chunk, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE) ==
                BluetoothStatusCodes.SUCCESS
        } else {
            characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            characteristic.value = chunk
            current.writeCharacteristic(characteristic)
        }
        if (!ok) {
            writing = false
            drain()
            return
        }
        // nRF8001 has tiny without-response buffers; some Transsion stacks never
        // call onCharacteristicWrite for NO_RESPONSE, so pace the next chunk.
        handler.postDelayed({
            synchronized(this) {
                if (writing && writeGeneration == generation) {
                    writing = false
                    drain()
                }
            }
        }, 30)
    }
    private fun connect(target: BluetoothDevice) {
        if (closed) return
        device = target
        gatt = if (Build.VERSION.SDK_INT >= 23) target.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
            else target.connectGatt(context, false, callback)
    }
    private fun retryableConnectStatus(status: Int) =
        status == 133 || status == 62 || status == 8 || status == 19
    private val scan = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val name = result.scanRecord?.deviceName ?: result.device.name ?: ""
            if (name.isNotEmpty() && !name.startsWith("Envelop", true) && !name.startsWith("Tomato", true)) return
            adapter.bluetoothLeScanner.stopScan(this)
            connectAttempts = 0
            connect(result.device)
        }
        override fun onScanFailed(errorCode: Int) {
            if (!ready.isCompleted) ready.completeExceptionally(IllegalStateException("BLE scan failed ($errorCode)"))
        }
    }
    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (closed) return
            if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
                connectAttempts = 0
                discoverAttempts = 0
                // Infinix/Transsion stacks return GATT 133 if discoverServices runs
                // on the connect callback. Give the nRF8001 a moment first.
                gatt.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH)
                handler.postDelayed({
                    if (closed || this@BleUart.gatt !== gatt || ready.isCompleted) return@postDelayed
                    gatt.discoverServices()
                }, 600)
            } else if (status != BluetoothGatt.GATT_SUCCESS || newState == BluetoothProfile.STATE_DISCONNECTED) {
                val retry = !ready.isCompleted && !closed && connectAttempts < 4 && retryableConnectStatus(status)
                if (retry) {
                    connectAttempts++
                    val target = device
                    val delayMs = 400L * connectAttempts
                    handler.postDelayed({
                        if (closed || target == null || ready.isCompleted) return@postDelayed
                        runCatching { gatt.close() }
                        if (this@BleUart.gatt === gatt) this@BleUart.gatt = null
                        connect(target)
                    }, delayMs)
                    return
                }
                if (!ready.isCompleted) ready.completeExceptionally(
                    IllegalStateException(if (status == BluetoothGatt.GATT_SUCCESS) "Tomato disconnected" else "BLE connection failed ($status)")
                )
                if (!disconnected.isCompleted) disconnected.complete(Unit)
            }
        }
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (closed || this@BleUart.gatt !== gatt) return
            if (status != BluetoothGatt.GATT_SUCCESS) {
                if (!ready.isCompleted && discoverAttempts < 3) {
                    discoverAttempts++
                    handler.postDelayed({
                        if (!closed && this@BleUart.gatt === gatt && !ready.isCompleted) gatt.discoverServices()
                    }, 400)
                } else if (!ready.isCompleted) {
                    ready.completeExceptionally(IllegalStateException("Nordic UART service unavailable"))
                }
                return
            }
            val service = gatt.getService(SERVICE)
            val rxCharacteristic = service?.getCharacteristic(RX)
            val tx = service?.getCharacteristic(TX)
            val canWriteWithoutResponse = ((rxCharacteristic?.properties ?: 0) and
                BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
            val canNotify = ((tx?.properties ?: 0) and
                BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0
            val descriptor = tx?.getDescriptor(CCCD)
            if (rxCharacteristic == null || tx == null ||
                !canWriteWithoutResponse || !canNotify || descriptor == null) {
                ready.completeExceptionally(IllegalStateException("Nordic UART service unavailable")); return
            }
            rx = rxCharacteristic
            gatt.setCharacteristicNotification(tx, true)
            val value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            if (Build.VERSION.SDK_INT >= 33) gatt.writeDescriptor(descriptor, value)
            else { descriptor.value = value; gatt.writeDescriptor(descriptor) }
        }
        override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS && !ready.isCompleted) ready.complete(Unit)
            else if (!ready.isCompleted) ready.completeExceptionally(IllegalStateException("Could not enable Tomato notifications"))
        }
        @Deprecated("Deprecated in API 33")
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            incoming.trySend(characteristic.value.copyOf())
        }
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
            incoming.trySend(value.copyOf())
        }
        override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            synchronized(this@BleUart) {
                writing = false
                writeGeneration++
                drain()
            }
        }
    }
    companion object {
        val SERVICE: UUID = UUID.fromString("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
        val RX: UUID = UUID.fromString("6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
        val TX: UUID = UUID.fromString("6E400003-B5A3-F393-E0A9-E50E24DCCA9E")
        val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }
}
