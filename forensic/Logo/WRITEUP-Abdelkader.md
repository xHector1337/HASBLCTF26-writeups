<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/forensic/logo -->
<!-- (full solve.py and handout/ live there) -->

# Logo (forensic)

| Field    | Value                                                              |
| -------- | ------------------------------------------------------------------ |
| Category | forensic                                                           |
| File     | `HASBL_Logo.jpg` — 1150×646 JPEG (17 KB)                           |
| Flag     | `HASBL{Th4nk_0ur_teach3rs_MsKubra_4nd_MrKadir}`                    |

## Description

> Our School's Logo and Message of Thanks :d

A JPEG of the school logo. Open it in a viewer and you see the logo,
nothing else. The challenge is pure container forensics — both
payloads are hiding *inside* JPEG metadata segments, and `file` will
hand them over the moment you ask.

## TL;DR

```
$ file HASBL_Logo.jpg
JPEG image data, JFIF standard 1.01, …,
  Exif Standard: […, description=SEFTQkx7VGg0bmtfMHVyX3RlYWNoM3JzX01zS3VicmFfNG5kX01yS2FkaXJ9, …],
  comment: "JZUWGZJAORZHSIJB", …

$ python3 -c "import base64; print(base64.b64decode('SEFTQkx7VGg0bmtfMHVyX3RlYWNoM3JzX01zS3VicmFfNG5kX01yS2FkaXJ9').decode())"
HASBL{Th4nk_0ur_teach3rs_MsKubra_4nd_MrKadir}

$ python3 -c "import base64; print(base64.b32decode('JZUWGZJAORZHSIJB').decode())"
Nice try!!
```

Two encoded strings in two different containers:

| Container                                      | Encoded blob                                                         | Decoded                                                  |
|------------------------------------------------|----------------------------------------------------------------------|----------------------------------------------------------|
| **EXIF `ImageDescription` (TIFF tag `0x010E`)** | `SEFTQkx7VGg0bmtfMHVyX3RlYWNoM3JzX01zS3VicmFfNG5kX01yS2FkaXJ9` (base64) | **`HASBL{Th4nk_0ur_teach3rs_MsKubra_4nd_MrKadir}`** ← flag |
| **JFIF/JPEG `COM` (`0xFFFE`) comment**         | `JZUWGZJAORZHSIJB` (base32)                                          | `Nice try!!` ← decoy                                     |

## Recon

`file` already prints both. The next obvious step is `exiftool` /
`identify` / `Pillow` to confirm:

```python
from PIL import Image
im = Image.open("HASBL_Logo.jpg")
print(im.info["comment"])          # b'JZUWGZJAORZHSIJB'
# EXIF is buried under 'exif' raw bytes; easier to use Image._getexif()
exif = im._getexif()
print(exif[0x010E])                # 'SEFTQkx7VGg0bmtfMHVyX3RlYWNoM3JzX01zS3VicmFfNG5kX01yS2FkaXJ9'
```

Two metadata segments, two different encodings, two different
destinations. The challenge is correctly identifying *which* of the
two is the flag.

### Recognising the encodings on shape

You can pick them apart without decoding:

* `SEFTQkx7…J9` — the `S E F T Q k x 7` prefix is the **canonical
  base64 fingerprint for any string that starts `HASBL{`**.
  - `'H' = 0x48 = 01001000`
  - `'A' = 0x41 = 01000001`
  - `'S' = 0x53 = 01010011`
  - first 24 bits: `010010 000100 000101 010011`
  - those four groups index into the base64 alphabet at positions
    `18, 4, 5, 19` → `S, E, F, T`.

  So **`SEFT…` *always* decodes to `HAS…`**, and the `…Qkx7…`
  continuation gives `BL{`. The trailing `J9` corresponds to `}\0\0`
  in the last triplet group. Even before you reach for a decoder,
  the shape says "this is a flag in base64."

* `JZUWGZJAORZHSIJB` — base32's alphabet is `[A-Z2-7]`, padded with
  `=`. This is 16 characters, all in `[A-Z]`, no padding — a clean
  `16/8*5 = 10` byte payload. That's exactly the length of the
  string `"Nice try!!"`. The leading `JZUWG` decodes to `Nic` (`'N' =
  0x4E = 01001110` → base32 groups `01001, 11000` → `J, Z`…). Again
  recognisable before you hit a decoder.

So the *shape* of the two strings already tells you which is which.

### Why the EXIF one matters and the COM one doesn't

Both segments are technically "comments" in the colloquial sense,
but they live in completely different parts of the file:

* The **JPEG `COM` segment (`0xFF 0xFE` marker)** is a top-level
  JPEG metadata segment that almost everything (including `file(1)`
  and `strings(1)`) surfaces immediately. Putting the *real* flag
  here would be obvious.
* The **EXIF `ImageDescription` tag** lives inside an **APP1
  segment**, which itself contains a TIFF header (with its own
  endianness) and an **Image File Directory (IFD)** of `(tag, type,
  count, value)` entries. To get at `ImageDescription` you have to
  parse the APP1 → identify `Exif\0\0` → parse the TIFF header →
  walk the IFD → find the tag → follow the offset to the string
  data. That's three layers deeper than the `COM` segment, and
  `strings(1)` on the raw JPEG bytes still finds the base64 (it's
  plain ASCII), but a player who only opens the image in a viewer
  and runs `strings` on the file won't immediately see *which*
  metadata field it lives in. The dev's intent is "the player has
  to know enough to pick the right one."

## Solving by hand vs. by tool

If you don't have Pillow handy, the EXIF/COM segments are easy to
walk by hand:

* Each JPEG segment starts with `0xFF 0xMM` followed by a big-endian
  16-bit length (length includes the length bytes themselves but
  not the marker).
* `APP1` marker is `0xFF 0xE1`. If the segment data starts with
  `Exif\0\0`, the next bytes are a TIFF header (`MM\x00*` for big-
  endian, `II*\x00` for little-endian), then the IFD offset.
* Each IFD entry is 12 bytes: 2-byte tag, 2-byte type, 4-byte count,
  4-byte value-or-offset. Type 2 (ASCII string) with count > 4 means
  the value field is an offset to the actual bytes within the TIFF
  block.
* For `ImageDescription` (tag `0x010E`), the count here is 61 (60
  chars + NUL), so the value field is an offset and we read 61
  bytes from there.

The `solve.py` in this directory walks that path by hand (no
Pillow), so it works on a stock Python install.

## Flag

```
HASBL{Th4nk_0ur_teach3rs_MsKubra_4nd_MrKadir}
```

The "Message of Thanks" in the description: the dev is thanking
**Ms Kubra** and **Mr Kadir** — presumably the school's
maths/CS teachers who organised the CTF. That's the wink.

## Defender notes

* **The shape of base64 is a fingerprint.** If you're hiding *any*
  CTF flag in base64, the `SEFTQkx7…` prefix is a giveaway any
  experienced player will read at a glance. Either use a different
  encoding (hex, base85, raw bytes), pad with a noise prefix, or
  XOR before encoding so the prefix shifts.
* **Don't put the flag in EXIF and put a wink in COM — or vice
  versa.** This challenge accidentally teaches "always check the
  *least obvious* of the two segments" because the loud one is the
  decoy. That's fine once; if you reuse the pattern, players learn
  to instinctively go for the deeper one and skip the obvious. A
  good metadata challenge mixes them up over time, or makes the
  decoy *itself* part of a multi-step puzzle (e.g., the COM
  segment's "Nice try!!" is the key for XOR-decoding the EXIF
  payload).
* **`file(1)` is the strongest forensic tool you don't have to
  install.** It already understands EXIF, JFIF, ZIP, RAR, archives,
  filesystems, and more. Any new container-forensic challenge
  should be sanity-checked against `file` first: if `file` prints
  the flag, the challenge is unintentionally trivial.
* **Three-layer parsing as a difficulty knob.** APP1 → TIFF → IFD →
  string is three layers; adding ICC profile metadata, MakerNote
  fields, or XMP sidecars adds more layers and quickly moves the
  challenge from "metadata reading" to "container archaeology."
  Both are useful CTF teaching shapes — name them differently so
  players know what they're signing up for.
* **Privacy aside.** Real-world EXIF tags include GPS, device
  serial numbers, owner names, and software fingerprints. The
  `ImageDescription` field is the most "user-controlled" of the
  standard tags — anyone shipping JPEGs to the web should strip
  metadata with `exiftool -all=` or equivalent. The challenge is a
  fine reminder that "what's *in* the file" and "what's *displayed
  by* the file" are independent.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/forensic/logo/solve.py) — argparse-driven solver. Walks the
  APP1/TIFF/IFD chain by hand (no Pillow dependency); `--show-decoy`
  also prints the base32 wink.
* [`handout/HASBL_Logo.jpg`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/forensic/logo/handout/HASBL_Logo.jpg) — original
  JPEG.

## Requirements

Python 3.9+; standard library only.
