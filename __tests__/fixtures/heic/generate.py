# __tests__/fixtures/heic/generate.py
#
# Regenerates the HEIC test fixtures in this folder. They are SYNTHETIC — flat colour blocks drawn
# here, encoded with x265 (HEVC) exactly as an iPhone encodes its photos — so they carry no one's
# personal photos and no third-party licence. Dedicated to the public domain (CC0) by the author.
#
#   python -m venv .venv && .venv/Scripts/pip install pillow pillow-heif   # pillow-heif 1.8.0 used
#   .venv/Scripts/python generate.py
#
# Files:
#   plain.heic          48×32, solid green.
#   orientation-6.heic  stored 64×32 (left red, right blue) with EXIF Orientation 6; pillow-heif
#                       writes that as an `irot` transform, as an iPhone does. Decoded upright it is
#                       32×64 with RED ON TOP and BLUE AT THE BOTTOM.
#   burst.heic          two top-level images: a 24×40 red one FIRST in the file, and a 40×24 green
#                       one flagged PRIMARY. A converter that takes "the first image" gets it wrong.
from PIL import Image
import pillow_heif

pillow_heif.register_heif_opener()

im = Image.new("RGB", (64, 32), (220, 30, 30))
im.paste((30, 30, 220), (32, 0, 64, 32))
exif = Image.Exif()
exif[0x0112] = 6
im.save("orientation-6.heic", quality=90, exif=exif.tobytes())

Image.new("RGB", (48, 32), (30, 200, 60)).save("plain.heic", quality=90)

a = Image.new("RGB", (24, 40), (220, 30, 30))
b = Image.new("RGB", (40, 24), (30, 200, 60))
hf = pillow_heif.from_pillow(a)
hf.add_from_pillow(b)
hf.save("burst.heic", quality=90, primary_index=1)
