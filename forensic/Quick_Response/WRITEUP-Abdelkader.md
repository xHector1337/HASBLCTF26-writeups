<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/forensic/quick-response -->
<!-- (full solve.py and handout/ live there) -->

# Quick Response (forensic)

| Field    | Value                                                       |
| -------- | ----------------------------------------------------------- |
| Category | forensic                                                    |
| File     | `QR_Code_Holy` — 222×222 JPEG (51 KB), `gd-jpeg v1.0 q=100` |
| Flag     | `HASBL{Terry_Davis_1s_th3_b35t}`                            |

## Description

> Terry Davis and Quick Response
>
> Format the flag you found correctly. Format: HASBL{...}

A small JPEG of a QR code with **Terry A. Davis's portrait** dithered
over the data modules. The three big corner squares (finder patterns)
are intact, the timing patterns are still recognisable, and despite the
visual overlay the QR decoder pulls the payload on the first try
thanks to Reed–Solomon error correction.

`file` and a glance at the image:

```
$ file QR_Code_Holy
JPEG image data, JFIF standard 1.01, density 96x96, comment:
"CREATOR: gd-jpeg v1.0 (using IJG JPEG v80), quality = 100",
baseline, precision 8, 222x222, components 3
```

![](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/forensic/quick-response/handout/QR_Code_Holy)

## TL;DR

`zbar`/`pyzbar` decodes the QR straight off the JPEG:

```python
from pyzbar import pyzbar
from PIL import Image

print(pyzbar.decode(Image.open("QR_Code_Holy"))[0].data)
# b'Terry_Davis_1s_th3_b35t'
```

Wrap with the requested format:

```
HASBL{Terry_Davis_1s_th3_b35t}
```

## Why this works despite the overlay

QR codes ship with one of four error-correction levels — **L (~7%),
M (~15%), Q (~25%), H (~30%)** — using Reed–Solomon. The portrait
covers the data modules but the *bounding* structure is largely
intact:

* The three **finder patterns** in the top-left, top-right and
  bottom-left corners are the high-contrast `7×7` "bullseyes" the
  decoder uses to find the code's centre and rotation. They're
  preserved exactly here.
* The **timing patterns** — the alternating black/white run across
  row 6 / column 6 — survive enough for zbar to estimate the module
  size.
* The **format-information ring** around each finder (with mask + ECC
  level encoded twice for redundancy) is mostly intact, so the
  decoder knows which XOR mask to use *before* it tries to recover
  data bits.

That leaves the data modules, which are visually destroyed by the
portrait but only need *enough* surviving modules to fall under the
ECC budget. The string `Terry_Davis_1s_th3_b35t` is 23 alphanumeric
characters; with QR's alphanumeric encoding mode that's `≈ 23 * 5.5
≈ 127 bits` of data plus a small mode/length header. Even at ECC level
H (30% recovery), the symbol has plenty of headroom over what the
overlay actually obscures, because the overlay is dithered — *individual
pixels* are perturbed, but *most modules* are still readable on
average.

So the dev's "let me put a face inside the QR" stunt looks impressive
but is *exactly* what QR was designed to absorb. The same trick is
used commercially for logo-in-QR designs.

## Exploit (such as it is)

```
$ ./solve.py
HASBL{Terry_Davis_1s_th3_b35t}
```

That's the entire challenge.

If `pyzbar` had refused to lock — which happens with heavier overlays
or low-resolution scans — the next moves would be:

1. **Upscale + threshold.** `Image.resize((888, 888), Image.NEAREST)`
   then `ImageOps.grayscale().point(lambda p: 0 if p < 128 else 255)`.
2. **Median filter** to suppress per-pixel noise without smearing
   module boundaries.
3. **Manual module extraction.** A 222×222 image with a `25×25` QR
   means each module is ~8.88 pixels. Sample the centre pixel of
   each module, threshold against the finder-pattern average, and
   feed the raw module matrix into a soft-decision QR decoder
   (`qrtools`, `quirc`, or hand-rolled). For this particular image
   none of that is necessary — but it's the staircase a forensic
   reviewer would walk if zbar had bailed.

## Flag

```
HASBL{Terry_Davis_1s_th3_b35t}
```

The flag content (`Terry_Davis_1s_th3_b35t` — "Terry Davis is the
best") is the second half of the joke. Terry A. Davis was the creator
of **TempleOS**, the famously eccentric "divine operating system" he
built single-handedly over a decade in his own dialect of C
(*HolyC*), with the explicit goal of producing "God's third temple"
in software. The image filename `QR_Code_Holy` is the tell —
"Holy" → HolyC → Terry. The challenge title doubles as the payload:
"Quick Response" *is* what QR stands for, and **also** is what Terry
was famous for — endless rapid-fire monologues on his livestreams.

## Defender notes

* **A logo inside a QR is not a redaction primitive.** ECC level H
  is published *for* this use case (logo-in-QR). If you're using
  visual occlusion to hide a payload, you need to clobber *more
  modules than the ECC budget tolerates*, which is harder to do
  consistently than it looks. The conservative ceiling is "destroy
  every fifth module"; everything below that is decodable by a
  forgiving reader.
* **JPEG at q=100 vs. PNG.** The handout is JPEG at quality 100
  (gd-jpeg). That's effectively lossless for the visible modules
  but introduces 8×8 block boundaries that *can* misalign the
  edge between two adjacent modules. If you wanted to make this
  challenge harder, dither the portrait, then save as JPEG q≈75 —
  the chroma subsampling will start eating module corners and
  zbar's first-try success rate drops sharply.
* **"Looks like noise" ≠ "is noise".** The face on the modules is
  intentional decoration. A naïve player might assume the QR is
  *partially* destroyed and try to reconstruct it manually; the
  intended path is "scan it with a phone." Phrase the challenge in a
  way that doesn't accidentally teach players to over-engineer.
* **CC-license / attribution.** Recognisable portraits of real
  people deserve attribution in challenge metadata. Terry Davis
  passed away in 2018; his image is widely-circulated but using it
  without a credit line is a minor faux pas.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/forensic/quick-response/solve.py) — argparse-driven solver. Defaults to
  `handout/QR_Code_Holy`; uses pyzbar + Pillow.
* [`handout/QR_Code_Holy`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/forensic/quick-response/handout/QR_Code_Holy) — original JPEG.

## Requirements

```
pip install pyzbar Pillow
```

(zbar's native library is bundled with `pyzbar` on most platforms;
on macOS you may need `brew install zbar` first.)
