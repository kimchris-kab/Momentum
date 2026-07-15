#!/usr/bin/env python3
"""Generate PWA/Android app icons for Momentum with zero external dependencies
(pure-stdlib PNG encoder) — a gold spark/flame mark on the app's dark surface."""
import os
import struct
import zlib

BG = (0x14, 0x13, 0x1F)   # app background
GOLD = (0xE8, 0xB7, 0x5D)  # accent gold
GOLD2 = (0xE8, 0x94, 0x6F)  # warm accent (gradient partner)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT_DIR, exist_ok=True)


def lerp(a, b, t):
    return a + (b - a) * t


def write_png(path, size, pixels_rgba):
    width = height = size
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 per scanline
        row_start = y * width * 4
        raw.extend(pixels_rgba[row_start:row_start + width * 4])

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))


def make_icon(size, maskable=False):
    px = bytearray(size * size * 4)
    cx = cy = size / 2
    # radius of the drawn mark; maskable icons need extra safe-zone padding
    r = size * (0.30 if maskable else 0.36)

    for y in range(size):
        for x in range(size):
            i = (y * size + x) * 4
            # rounded-square dark background (fully opaque edge-to-edge — required for maskable)
            px[i:i + 4] = bytes((*BG, 255))

            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            if dist <= r:
                # soft radial gradient from gold to warm-gold, gives a "spark" look
                t = min(1.0, dist / r)
                col = tuple(int(lerp(GOLD[k], GOLD2[k], t)) for k in range(3))
                # antialias the outer edge over ~1.5px
                edge = r - dist
                a = 255 if edge > 1.5 else max(0, min(255, int(edge / 1.5 * 255)))
                if a == 255:
                    px[i:i + 4] = bytes((*col, 255))
                else:
                    bgc = px[i:i + 3]
                    blended = tuple(int(lerp(bgc[k], col[k], a / 255)) for k in range(3))
                    px[i:i + 4] = bytes((*blended, 255))

            # small inner dark "flame notch" near the top to suggest a spark/flame silhouette
            nx, ny = x - cx, y - (cy - r * 0.32)
            ndist = (nx * nx + ny * ny) ** 0.5
            if ndist <= r * 0.30 and dist <= r:
                t = min(1.0, ndist / (r * 0.30))
                edge = r * 0.30 - ndist
                a = 255 if edge > 1.5 else max(0, min(255, int(edge / 1.5 * 255)))
                if a == 255:
                    px[i:i + 4] = bytes((*BG, 255))
                else:
                    cur = px[i:i + 3]
                    blended = tuple(int(lerp(cur[k], BG[k], a / 255)) for k in range(3))
                    px[i:i + 4] = bytes((*blended, 255))

    return px


for size, name, maskable in [
    (192, "icon-192.png", False),
    (512, "icon-512.png", False),
    (512, "icon-512-maskable.png", True),
]:
    write_png(os.path.join(OUT_DIR, name), size, make_icon(size, maskable))
    print("wrote", name)
