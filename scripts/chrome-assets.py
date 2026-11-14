"""Original three-run status mark, generated without vendor assets or image deps."""
from pathlib import Path
import struct
import sys
import zlib

root = Path(sys.argv[1]) / 'icons'
root.mkdir(exist_ok=False)
def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
for size in [16, 32, 48, 128]:
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            colors = []
            for oy in [0.125, 0.375, 0.625, 0.875]:
                for ox in [0.125, 0.375, 0.625, 0.875]:
                    px, py = (x + ox) / size, (y + oy) / size
                    dx, dy = max(abs(px - 0.5) - 0.29, 0), max(abs(py - 0.5) - 0.29, 0)
                    color = (0, 0, 0, 0) if dx * dx + dy * dy > 0.19 ** 2 else (54, 94, 70, 255)
                    for top, width in [(0.27, 0.46), (0.45, 0.32), (0.63, 0.40)]:
                        if 0.26 <= px <= 0.26 + width and top <= py <= top + 0.085:
                            color = (245, 243, 237, 255)
                    colors.append(color)
            row.extend(round(sum(c[i] for c in colors) / len(colors)) for i in range(4))
        rows.append(row)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
    (root / ('icon' + str(size) + '.png')).write_bytes(data)
