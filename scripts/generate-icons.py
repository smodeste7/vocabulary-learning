#!/usr/bin/env python3
"""Génère les icônes PWA placeholder (bulle de dialogue ambre sur fond nuit) sans dépendance.

Encodeur PNG en pur stdlib (zlib). Produit icons/icon-192.png et icon-512.png.
Le motif « bulle de dialogue » évoque la parole / le vocabulaire (distinct du croissant
de l'app alphabet). À remplacer par de vraies icônes plus tard — la structure ne change pas.

Usage : python3 scripts/generate-icons.py
"""
import struct
import zlib
import os

BG = (0x0f, 0x19, 0x23)      # nuit atlantique
GOLD = (0xe8, 0xa8, 0x38)    # ambre chaud

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(HERE, "icons")


def bubble_pixel(x, y, size):
    """Bulle de dialogue : rectangle arrondi + petite queue en bas à gauche."""
    s = size
    # Corps : rectangle arrondi centré.
    left, right = 0.20 * s, 0.80 * s
    top, bottom = 0.22 * s, 0.62 * s
    rad = 0.12 * s
    in_body = False
    if left <= x <= right and top <= y <= bottom:
        # coins arrondis
        cx = min(max(x, left + rad), right - rad)
        cy = min(max(y, top + rad), bottom - rad)
        if ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 <= rad:
            in_body = True
    # Queue triangulaire vers le bas-gauche.
    in_tail = False
    if bottom - 0.01 * s <= y <= 0.74 * s:
        tx0, tx1 = 0.30 * s, 0.46 * s
        prog = (y - bottom) / (0.74 * s - bottom + 1e-6)
        if tx0 <= x <= (tx1 - prog * (tx1 - tx0)):
            in_tail = True
    if in_body or in_tail:
        return GOLD
    return BG


def write_png(path, size):
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filtre 0 par scanline
        for x in range(size):
            raw.extend(bubble_pixel(x, y, size))

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # RGB 8 bits
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print(f"✓ {os.path.relpath(path, HERE)} ({size}x{size})")


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    write_png(os.path.join(OUT_DIR, "icon-192.png"), 192)
    write_png(os.path.join(OUT_DIR, "icon-512.png"), 512)
    print("Icônes générées. Remplace-les par de vraies icônes quand tu veux.")
