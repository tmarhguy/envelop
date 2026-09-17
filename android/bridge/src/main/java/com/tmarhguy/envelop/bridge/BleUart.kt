package com.tmarhguy.envelop.bridge

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
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
    private var gatt: BluetoothGatt? = null
    private var rx: BluetoothGattCharacteristic? = null
    private val writes = ArrayDeque<ByteArray>()
    private var writing = false

    fun start() {
        require(adapter?.isEnabled == true) { "Bluetooth is off" }
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE)).build()
        adapter.bluetoothLeScanner.startScan(listOf(filter),
            ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scan)
    }
    fun close() {
        runCatching { adapter?.bluetoothLeScanner?.stopScan(scan) }
        gatt?.disconnect(); gatt?.close(); gatt = null
        if (!disconnected.isCompleted) disconnected.complete(Unit)
    }
    @Synchronized fun send(bytes: ByteArray): Boolean {
        val chunks = bytes.asIterable().chunked(20).map { it.toByteArray() }
        if (writes.size + chunks.size > 256) return false
        writes.addAll(chunks); drain()
        return true
    }
    @Synchronized private fun drain() {
        if (writing) return
        val characteristic = rx ?: return
        val chunk = writes.removeFirstOrNull() ?: return
        writing = true
        val current = gatt ?: return
        if (Build.VERSION.SDK_INT >= 33) {
            if (current.writeCharacteristic(characteristic, chunk, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE) != BluetoothStatusCodes.SUCCESS) writing = false
        } else {
            characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            characteristic.value = chunk
            if (!current.writeCharacteristic(characteristic)) writing = false
        }
        if (!writing) drain()
    }
    private val scan = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val name = result.scanRecord?.deviceName ?: result.device.name ?: ""
            if (name.isNotEmpty() && !name.startsWith("Envelop", true) && !name.startsWith("Tomato", true)) return
            adapter.bluetoothLeScanner.stopScan(this)
            gatt = if (Build.VERSION.SDK_INT >= 23) result.device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
                else result.device.connectGatt(context, false, callback)
        }
        override fun onScanFailed(errorCode: Int) {
            if (!ready.isCompleted) ready.completeExceptionally(IllegalStateException("BLE scan failed ($errorCode)"))
        }
    }
    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
                gatt.discoverServices()
            } else if (status != BluetoothGatt.GATT_SUCCESS || newState == BluetoothProfile.STATE_DISCONNECTED) {
                if (!ready.isCompleted) ready.completeExceptionally(
                    IllegalStateException(if (status == BluetoothGatt.GATT_SUCCESS) "Tomato disconnected" else "BLE connection failed ($status)")
                )
                if (!disconnected.isCompleted) disconnected.complete(Unit)
            }
        }
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            val service = gatt.getService(SERVICE)
            val rxCharacteristic = service?.getCharacteristic(RX)
            val tx = service?.getCharacteristic(TX)
            val canWriteWithoutResponse = ((rxCharacteristic?.properties ?: 0) and
                BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
            val canNotify = ((tx?.properties ?: 0) and
                BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0
            val descriptor = tx?.getDescriptor(CCCD)
            if (status != BluetoothGatt.GATT_SUCCESS || rxCharacteristic == null || tx == null ||
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
            synchronized(this@BleUart) { writing = false; drain() }
        }
    }
    companion object {
        val SERVICE: UUID = UUID.fromString("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
        val RX: UUID = UUID.fromString("6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
        val TX: UUID = UUID.fromString("6E400003-B5A3-F393-E0A9-E50E24DCCA9E")
        val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }
}
