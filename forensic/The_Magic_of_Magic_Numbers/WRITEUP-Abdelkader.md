<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/forensic/magic-numbers -->
<!-- (full solve.py and handout/ live there) -->

# The Magic of "Magic Numbers" (forensic)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Category | forensic                                                       |
| File     | `Aphelios.bin` — 198,113 bytes, `file` says only "data"        |
| Flag     | `HASBL{L3ague_0f_Leg4nd5}`                                     |

## Description

> Magic Numbers and Aphelios...

Two layers, both built around the literal definition of "magic
number." First the file's *header* magic has been surgically removed,
so nothing on disk will open it. Second, once you repair it back to a
JPEG, the *metadata* contains a base64-magic-prefix that decodes to
the flag — alongside a decoy in the JFIF comment segment.

## TL;DR

```
$ file Aphelios.bin
Aphelios.bin: data        ← magic broken

$ xxd Aphelios.bin | head -1
00000000: 0000 0000 0010 5858 5858 0001 0101 0048  ......XXXX.....H

# Patch [0:4] = FF D8 FF E0 and [6:10] = "JFIF"
# → file is a valid 1215×717 JPEG of Aphelios + Alune (League of Legends)
# → flag is in the XMP <xmpRights:UsageTerms>:
#       base64('SEFTQkx7TDNhZ3VlXzBmX0xlZzRuZDV9') → HASBL{L3ague_0f_Leg4nd5}
# The JFIF COM segment has SEFTQkxfTmljZS1UcnkhIQ== = HASBL_Nice-Try!! (decoy)
```

## Recon

### Step 1 — recognising the *shape* of the broken header

A JFIF JPEG has a fully-specified opener. The first 20 bytes of a
clean JFIF (no thumbnail) are:

```
FF D8           SOI                              ; "magic" marker
FF E0 <len_hi> <len_lo>     APP0 marker + segment length (BE, includes len)
"JFIF\0"        identifier (5 bytes)
<vmaj> <vmin>   version (typically 01 01)
<units>         0=no units, 1=pixels/inch, 2=pixels/cm
<x_dens_hi> <x_dens_lo>     X density (BE)
<y_dens_hi> <y_dens_lo>     Y density (BE)
<thumb_w> <thumb_h>         thumbnail size (00 00 = none)
```

Now look at the file:

```
offset:      0 1 2 3   4 5    6 7 8 9   10  11 12   13   14 15   16 17   18 19
expected:   FF D8 FF E0  00 10  4A 46 49 46  00  01 01   00   00 48  00 48   00 00
got:        00 00 00 00  00 10  58 58 58 58  00  01 01   01   00 48  00 48   00 00
            └─ broken ─┘                └─ "XXXX" ─┘                ↑ also off by 1
```

Two clean swaps:

* Bytes **0..3** zeroed out — should be `FF D8 FF E0`.
* Bytes **6..9** changed to ASCII `"XXXX"` — should be `"JFIF"`
  (`4A 46 49 46`).

Everything else lines up: the segment length `0x0010` at bytes 4–5
matches what JFIF APP0 always says, the JFIF version bytes `01 01`
are intact, the density bytes `00 48 00 48` decode to **72 DPI**, and
the segment immediately after (offset `0x14`) is a valid APP2 ICC
profile (`FF E2 0C 58 ICC_PROFILE\0…`). So the corruption is *purely
cosmetic* — it stops `file(1)` from identifying the format, but
nothing else.

```python
b = bytearray(open("Aphelios.bin","rb").read())
b[0:4]  = b"\xFF\xD8\xFF\xE0"
b[6:10] = b"JFIF"
open("aphelios.jpg","wb").write(b)
```

```
$ file aphelios.jpg
JPEG image data, JFIF standard 1.01, …, 1215x717, components 3, comment: "SEFTQkxfTmljZS1UcnkhIQ=="
```

Open it: Aphelios and his moon-bound sister Alune from League of
Legends, the splash for one of their skins.

### Step 2 — walking the JPEG segment chain

There are five metadata containers in this file. Listing them via a
hand-rolled segment walker:

| offset    | marker | length  | content                                                       |
|----------:|:------:|--------:|:--------------------------------------------------------------|
| `0x00014` | APP2   |  0xC58  | ICC color profile (sRGB / IEC, HP-authored)                   |
| `0x00C6E` | APP13  |  0x24   | Photoshop 3.0 Image Resource Block (empty)                    |
| `0x00C94` | **APP1**   | **0xEF8**   | **XMP** (`<x:xmpmeta xmlns:x='adobe:ns:meta/'>`)              |
| `0x01B8E` | APP1   |  0x18   | EXIF TIFF — `direntries=0` (empty)                            |
| `0x01BA8` | COM    |  0x1A   | `SEFTQkxfTmljZS1UcnkhIQ==`  → base64 → `HASBL_Nice-Try!!` (decoy) |

The COM segment is loud — `file` even prints it. Same pattern as the
*Logo* challenge in this set: dev puts a wink-base64 in the obvious
JFIF comment, parks the real flag one container deeper, in the XMP.

### Step 3 — the XMP `UsageTerms` field

Compacted XMP body (whitespace stripped for readability):

```xml
<rdf:Description rdf:about=''
   xmlns:xmpRights='http://ns.adobe.com/xap/1.0/rights/'>
  <xmpRights:Marked>False</xmpRights:Marked>
  <xmpRights:UsageTerms>
    <rdf:Alt>
      <rdf:li xml:lang='x-default'>SEFTQkx7TDNhZ3VlXzBmX0xlZzRuZDV9</rdf:li>
    </rdf:Alt>
  </xmpRights:UsageTerms>
</rdf:Description>
```

The `<rdf:li>` payload is `SEFTQkx7TDNhZ3VlXzBmX0xlZzRuZDV9`. As ever,
the **`SEFTQkx7`** prefix is the canonical base64 fingerprint of a
flag starting with `HASBL{` — `'H' = 0x48`, `'A' = 0x41`, `'S' = 0x53`
in 6-bit base64 groups gives indices 18/4/5/19 → `S`/`E`/`F`/`T`,
and `'B' = 0x42`, `'L' = 0x4C`, `'{' = 0x7B` → `Qkx7`. You can read
the prefix without decoding.

```
base64.b64decode("SEFTQkx7TDNhZ3VlXzBmX0xlZzRuZDV9")
b'HASBL{L3ague_0f_Leg4nd5}'
```

### Why XMP, specifically

XMP (Adobe's Extensible Metadata Platform) is RDF/XML embedded in an
APP1 segment whose payload is preceded by the null-terminated string
`http://ns.adobe.com/xap/1.0/`. It's a recognised standard, every
photo tool will read it, and `exiftool -xmpRights:UsageTerms
aphelios.jpg` returns the base64 in one shot:

```
$ exiftool -xmpRights:UsageTerms aphelios.jpg
Usage Terms                     : SEFTQkx7TDNhZ3VlXzBmX0xlZzRuZDV9
```

The advantage from the dev's side: hiding in `xmpRights:UsageTerms`
specifically reads naturally in a photo of a fictional character —
"usage terms" is exactly the field a copyright-aware photographer
would fill in, so the field's *presence* doesn't look out of place.
Players who only run `exiftool -a -u aphelios.jpg` get a wall of
XMP output with the base64 buried in the middle; they have to know
to grep for the prefix or to read the full block.

## Flag

```
HASBL{L3ague_0f_Leg4nd5}
```

(*"League of Legends"* — leet-spoken, matching the picture and the
title-drop of Aphelios.)

## Defender notes

* **Magic-number ablation is a one-line attack and a one-line fix.**
  Zeroing the first four bytes of a JPEG defeats `file(1)`,
  thumbnailers, web previewers, and the OS shell — every player who
  knows the JFIF header pattern fixes it in seconds. For a CTF this
  is appropriate; in a real malware-distribution context, AV's
  emulator will reconstruct the header before the magic check
  applies, so this isn't a hiding primitive.
* **The "XXXX" choice is on the nose.** `4A 46 49 46` ("JFIF") and
  `58 58 58 58` ("XXXX") are both 4-byte ASCII; the second is a
  rebar-poking-out-of-concrete cue that "this used to be a
  human-readable identifier." If you wanted to obscure the recovery,
  zero the JFIF identifier as well as the SOI — players would then
  have to recognise the JFIF *shape* (segment length 0x0010,
  density bytes, etc.) rather than just spotting "what should this
  string be."
* **Two-comment misdirection (decoy in COM, flag in XMP) is a known
  pattern.** Same trick as the *Logo* challenge: dev relies on
  players gravitating to the obvious comment. The countermove for a
  defender (i.e., the player) is "always check *both* of XMP and
  COM, and treat each base64 string by its prefix shape." For a
  dev who wants to keep using this pattern, *encrypt* one with a key
  derived from the other so neither is read alone — that's the
  durable variant.
* **`xmpRights:UsageTerms` is a great hiding spot for "real" data.**
  Most photographers leave it empty. Exiftool reads it, but it's
  rarely the first field someone grabs. For exfiltration via image
  uploads (a real-world threat), `UsageTerms` is a 256-byte channel
  per upload that survives most image processors that strip
  *invisible* metadata but keep "legitimate" XMP rights tags. Strip
  metadata aggressively before publishing user-uploaded images.
* **The corrupted header is a self-describing repair task.** Every
  byte you need to put back is determined by *the bytes that
  weren't touched*: the segment length `0010` tells you it's APP0
  with a 16-byte body, the density and units fields tell you JFIF
  version `01 01`, and the next-segment marker `FF E2` confirms
  alignment. Even if the dev had zeroed *more* bytes, the structure
  is rigid enough that a careful reader can reconstruct it. This is
  the most satisfying class of forensic challenge: "you don't need a
  tool, you need to know the format."

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/forensic/magic-numbers/solve.py) — argparse-driven solver. Patches the magic
  in-memory, writes the repaired JPEG, walks the segment chain by hand
  to find the XMP, then pulls the `xmpRights:UsageTerms` value and
  base64-decodes it. Standard library only.
* [`handout/Aphelios.bin`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/forensic/magic-numbers/handout/Aphelios.bin) — original file with
  the corrupted header.

## Requirements

Python 3.9+; standard library only.
