<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/forensic/pamuk -->
<!-- (full solve.py and handout/ live there) -->

# our sweet cat, Pamuk (forensic)

| Field    | Value                                                            |
| -------- | ---------------------------------------------------------------- |
| Category | forensic                                                         |
| File     | `pamuk.txt` — 821 KB single-line ASCII, base64-encoded JPEG     |
| Flag     | `HASBL{P4muk_w1th_gl4s5e5}`                                      |

## Description

> We recommend using OCR, but you can also achieve the same result in
> other ways.

A `.txt` file that's secretly a JPEG, and a JPEG that's secretly a
hex-encoded flag drawn into the pixels. Two layers, both immediately
recognisable by their fingerprints.

## TL;DR

```
$ head -c 16 pamuk.txt
/9j/4AAQSkZJRg
                ← /9j/4AAQ is base64('FF D8 FF E0') = JPEG SOI + JFIF APP0

$ python3 -c "import base64; open('pamuk.jpg','wb').write(base64.b64decode(open('pamuk.txt').read()))"

$ file pamuk.jpg
JPEG image data, JFIF standard 1.01, ..., 1408x768, components 3
```

Open the JPEG — Pamuk the cat (the same Scottish-fold from the
*PamukTheCat* rev challenge) in sunglasses, with a red text overlay:

```
484153424c7b50346d756b5f773174685f676c34733565357d
```

A clean 50-char lowercase hex string. `bytes.fromhex(...)` gives:

```
H  A  S  B  L  {  P  4  m  u  k  _  w  1  t  h  _  g  l  4  s  5  e  5  }
48 41 53 42 4c 7b 50 34 6d 75 6b 5f 77 31 74 68 5f 67 6c 34 73 35 65 35 7d
```

```
HASBL{P4muk_w1th_gl4s5e5}
```

## Recon

### Layer 1 — recognising base64 of a JPEG

`/9j/4AAQ` is the **most common base64 fingerprint in the world**.

- Bytes `FF D8 FF E0` (JPEG SOI + JFIF APP0) in binary:
  `11111111 11011000 11111111 11100000`.
- Base64 quanta: take 6 bits at a time:
  `111111 111101 100011 111111 111000 0000…`
  → indices `63, 61, 35, 63, 56, 0…`
  → chars `/ 9 j / 4 A …`

So any base64 that starts with `/9j/4A` is the encoding of a JPEG. Once
you see it in the first few bytes, you decode and move on.

```python
import base64
img = base64.b64decode(open("pamuk.txt").read().strip())
assert img[:4] == b"\xff\xd8\xff\xe0"
open("pamuk.jpg", "wb").write(img)
```

This is the same `file(1) → "JPEG image data"` move that solved the
other forensic challenges in this set; the difference here is that the
file extension is `.txt`, and `file(1)` honestly reports "ASCII text"
on the wrapper. The base64 prefix is the only tell from the bytes
themselves.

### Layer 2 — reading the hex off the image

The decoded image is a single photo of Pamuk standing on his back legs
in sunglasses (the meme), with a thin red string overlayed in the
middle of the frame. Two viable paths:

1. **OCR it.** `tesseract pamuk.jpg - --psm 6` returns the hex run.
   The font is a clean sans-serif, the colour contrast (red on
   off-white concrete) is high, and the characters are restricted to
   `[0-9a-f]`. Modern Tesseract handles it on the first pass.
2. **Read it by eye.** 50 hex characters is the same length as
   typing a phone number twice — a few minutes of careful
   transcription. The hint even says "you can also achieve the same
   result in other ways," explicitly inviting the human path.

Both yield the same string:

```
484153424c7b50346d756b5f773174685f676c34733565357d
```

The shape immediately says "ASCII hex of a flag":

- 50 characters → 25 bytes — exactly the length of `HASBL{` (6) +
  `whatever` (18) + `}` (1) = 25 for an 18-character payload.
- `484153424c7b…7d` — the trailing `7b…7d` is the unmistakable
  `{…}` enclosure; the leading `4841534242` ... wait, `48 41 53 42 4C`
  is **"HASBL"** exactly. So even before decoding the whole thing,
  the first 10 hex characters are visibly "the prefix `HASBL`."

A `bytes.fromhex` finishes the job.

### Why the hint about OCR

The intended path for less-experienced players is OCR: open the
image, run tesseract, get a hex string, decode. The "other ways"
caveat is the dev acknowledging that anyone who's done enough of
these can just look at the image, see "HASBL" inside the first few
hex bytes, and finish by hand.

A more adversarial version of this challenge would:

- Use a thinner / cursive font so OCR struggles.
- Stretch the hex string across colour blends so contrast varies.
- Break the string across two non-collinear lines so a single OCR
  pass returns out-of-order tokens.

None of those are done here; the challenge is genuinely beginner-
friendly and just wants the player to see the layers.

## Flag

```
HASBL{P4muk_w1th_gl4s5e5}
```

"Pamuk with glasses" — the photo and the flag are the same joke.

## Defender notes

* **`/9j/4A` is a known fingerprint and a *deliberate* one.** Base64
  doesn't have to lead with that — the JPEG bytes do, and base64 is
  deterministic. If you want the base64 wrapper to *not* look like
  base64 of a JPEG, prepend a few junk bytes before encoding, or use
  a different scheme (base32, base85). For a CTF the giveaway is
  fine; for a real-world "hide a JPEG in a text file" attempt, it's
  a signature antivirus will catch on sight.
* **`.txt` vs. `.jpg` is a YARA / MIME signal, not a security
  primitive.** Web servers should always verify file *contents*
  (sniffed magic bytes) against the *declared* MIME type and the
  filename extension, and reject mismatches. Storing a JPEG as
  `pamuk.txt` and serving it without re-encoding is a classic
  upload-pivot.
* **Pixel-text-as-a-payload is OCR-able by default.** Every modern
  phone OS, every cloud OCR API, and `tesseract` itself recover
  high-contrast hex strings in milliseconds. If you want OCR-
  resistance you need either: (a) a CAPTCHA-style distortion which
  makes the challenge frustrating, or (b) move to a redundancy-coded
  visual channel (e.g., a QR code with the hex string — back to the
  *Quick Response* challenge, but inverted: "the flag is encoded
  *inside* a QR that's *inside* a photo").
* **Two-layer base64-then-image** is the *most common* CTF wrapper
  pattern. Players who've seen it once recognise the `/9j/4A`,
  `iVBORw0KGgo`, `R0lGODlh`, and similar prefixes (JPEG, PNG, GIF
  respectively) immediately. As a teaching pattern this is fine —
  it builds the "recognise file magic" muscle — but it's not a way
  to *slow* an experienced player.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/forensic/pamuk/solve.py) — argparse-driven solver. Base64-decodes
  the JPEG, writes it out, and prints the flag from the embedded
  hex. `--ocr` flag (optional) re-derives the hex via
  `tesseract --psm 6` for the literal "use OCR" walkthrough.
* [`handout/pamuk.txt`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/forensic/pamuk/handout/pamuk.txt) — original base64 blob.

## Requirements

Python 3.9+; standard library only. (`--ocr` mode wants
`tesseract` on `PATH`.)
