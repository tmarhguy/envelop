"""Compile the portable Tomato parser and validate the same vectors as Swift."""
import ctypes as c
import json
import pathlib
import subprocess
import tempfile
root = pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory() as tmp:
    lib = pathlib.Path(tmp) / 'envelop.dylib'
    subprocess.run(['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', '-shared', '-fPIC', str(root/'tomato/protocol/envelop.c'), '-o', str(lib)], check=True)
    api = c.CDLL(str(lib))
    class Parser(c.Structure):
        _fields_ = [('bytes', c.c_uint8 * 522), ('used', c.c_size_t)]
    callback_type = c.CFUNCTYPE(None, c.c_void_p, c.c_uint8, c.c_uint16, c.POINTER(c.c_uint8), c.c_size_t)
    api.envelop_feed.argtypes = [c.POINTER(Parser), c.c_char_p, c.c_size_t, callback_type, c.c_void_p]
    api.envelop_encode.argtypes = [c.c_uint8, c.c_uint16, c.c_char_p, c.c_size_t, c.c_void_p, c.c_size_t]
    api.envelop_encode.restype = c.c_size_t
    vectors = json.loads((root/'protocol/test-vectors/frames.json').read_text())
    for v in vectors:
        frame, payload = bytes.fromhex(v['frame_hex']), bytes.fromhex(v['payload_hex'])
        out = c.create_string_buffer(522)
        n = api.envelop_encode(v['type'], v['route'], payload, len(payload), out, 522)
        assert out.raw[:n] == frame
        for split in range(len(frame)+1):
            got = []
            cb = callback_type(lambda _, typ, route, data, count: got.append((typ, route, bytes(data[:count]))))
            parser = Parser()
            for part in (frame[:split], frame[split:]):
                api.envelop_feed(c.byref(parser), part, len(part), cb, None)
            assert got == [(v['type'], v['route'], payload)]
        got = []
        corrupt = bytearray(frame); corrupt[-1] ^= 1
        stream = b'noise' + bytes(corrupt) + frame
        api.envelop_feed(c.byref(Parser()), stream, len(stream), cb, None)
        assert got == [(v['type'], v['route'], payload)]
    print(f'C codec: {len(vectors)} shared vectors, all splits and CRC recovery passed')
