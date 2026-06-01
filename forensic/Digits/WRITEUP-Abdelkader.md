<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/forensic/digits -->
<!-- (full solve.py and handout/ live there) -->

# Digits (forensic)

| Field    | Value                                                       |
| -------- | ----------------------------------------------------------- |
| Category | forensic                                                    |
| File     | `digits.bin` — 169,800 bytes of ASCII `0`/`1`, single line  |
| Flag     | `HASBL{Istanbul_1s_b3atiful_c1ty}`                          |

## Description

> Binary? Digits?

The handout is a single-line ASCII file containing nothing but `'0'`
and `'1'` characters — 169,800 of them, no whitespace, no newline.
The challenge name and prompt are both word-play: it's *binary* in the
"digits 0 and 1" sense, not in the executable-ELF sense.

```
$ file digits.bin
ASCII text, with very long lines (65536), with no line terminators

$ head -c 80 digits.bin
1111111111011000111111111110000000000000000100000100101001000110010010
```

Read 8 chars at a time, MSB-first, and the bit stream is a clean
**JPEG**.

## TL;DR

```python
bits = open("digits.bin").read().strip()
data = bytes(int(bits[i:i+8], 2) for i in range(0, len(bits), 8))
open("digits.jpg","wb").write(data)
```

Open `digits.jpg`. The single line of text on the page is the flag:

```
HASBL{Istanbul_1s_b3atiful_c1ty}
```

## Recon

### Picking the encoding without guessing

Three shape checks land you on "8-bit chunks, MSB-first" instantly,
without trying every possibility:

1. **Length divisibility.** `169800 / 8 = 21225` (clean). `/16 =
   10612.5` (not). So **byte-sized** chunks, not 16-bit words. Also
   `/7 = 24257.14…` (not), ruling out 7-bit ASCII without parity. The
   only natural width that fits is 8.

2. **First-32-bit fingerprint.** The first 32 characters are

   ```
   11111111  11011000  11111111  11100000
        FF        D8        FF        E0
   ```

   `FF D8 FF E0` is the **JPEG SOI marker (`FFD8`) immediately
   followed by JFIF APP0 (`FFE0`)** — the most recognisable file
   header in forensics. This *also* tells you the byte order is
   **MSB-first**: LSB-first would have produced `FF 1B FF 07`,
   which is nothing.

3. **Segment-length sanity.** Bytes 4–5 are `00 10` = 16 — the
   length of the JFIF APP0 segment that follows the marker.
   Immediately after, bytes 6–9 are `4A 46 49 46` = `"JFIF"`. So
   you're definitely inside a well-formed JPEG, not just a header
   that happens to start with `FFD8`.

`file(1)` on the *reconstructed* file confirms:

```
$ file digits.jpg
JPEG image data, JFIF standard 1.01, …, 1600x1131, components 3
```

### Why MSB-first

Most "bit-serialised binary blob" challenges use MSB-first because
that's how `xxd -b` / `hexdump -b` format binary, and it's how a
human reading a hex byte left-to-right naturally writes its bits.
For confirmation, you can also check **the JFIF version field** that
follows the `"JFIF\0"` header: it should be `01 01` (or `01 02`) in
the next two bytes. With MSB-first packing it does; with LSB-first it
becomes `80 80`, which isn't a valid JFIF version. The format is
self-describing enough that you can fail-fast on the wrong bit order.

### The image content

The reconstructed 1600×1131 JPEG is a Microsoft-Word-style page with
a single line of black text on a white background:

```
HASBL{Istanbul_1s_b3atiful_c1ty}
```

(*Istanbul is a beautiful city* — leet.)

A Word-page-as-image is a common "I rendered the flag instead of
typing it" trick — the bytes contain no plain-text version of the
flag, so `strings(1)` on the decoded JPEG returns nothing useful;
you have to actually look at the picture.

## Flag

```
HASBL{Istanbul_1s_b3atiful_c1ty}
```

## Defender notes

* **Bit-stream encodings are not crypto.** This is a "did you read
  the prompt" challenge — there's no hidden key, no checksum, no
  arrangement-puzzle. The 8-bit MSB-first reading is the only
  reasonable interpretation, and the JPEG magic confirms it
  immediately. If the goal were to *slow players down*, you'd want
  at least one of:
  - Alternate bit ordering (LSB-first, with the reader having to
    test both and pick the magic-matching one).
  - Non-power-of-2 chunk widths (e.g., 6-bit base64 quanta — would
    require the player to first realise `169800 / 6 = 28300` is
    also clean and pick between 6 and 8).
  - A short XOR or rotate applied to each byte before bit-serialising,
    so the reconstructed file's magic isn't `FFD8FFE0` and the player
    has to figure out the transform from context.
* **"Render the flag as text in a screenshot" is a CTF-classic
  anti-OCR move.** It defeats `strings`, but a modern phone's
  on-device OCR (or `tesseract --psm 6`) recovers it in seconds.
  For challenges where you want the flag to *only* be retrievable by
  a human, distort the text or break it across multiple frames —
  but at that point you're inventing a CAPTCHA, not a CTF.
* **`file(1)`'s line-length warning is a clue.** `with very long
  lines (65536)` is the line-truncation message — the actual file
  has no newlines at all. Any 200 KB single-line ASCII-`01` file is
  basically *announcing* itself as bit-serialised binary; the only
  question is "which encoding flavour."
* **Pair the title with the prompt.** "Digits" + "Binary? Digits?"
  is a deliberately corny pun, but it also leans into the right
  reading: this challenge *isn't* about an ELF or a packed binary;
  it's about literal binary digits. Challenges that lean on
  word-play for the hint should make sure both halves point the
  same direction.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/forensic/digits/solve.py) — argparse-driven solver. Reads the
  ASCII bit stream, packs MSB-first into bytes, writes the JPEG,
  prints the (known) flag for convenience. Standard library only.
* [`handout/digits.bin`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/forensic/digits/handout/digits.bin) — original
  bit-serialised JPEG.

## Requirements

Python 3.9+; standard library only.
