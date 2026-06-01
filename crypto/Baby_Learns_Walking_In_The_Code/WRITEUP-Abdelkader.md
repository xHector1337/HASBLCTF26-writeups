<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/crypto/baby-learns-walking -->
<!-- (full solve.py and handout/ live there) -->

# baby-learns-walking-in-the-code (crypto)

| Field    | Value                                                            |
| -------- | ---------------------------------------------------------------- |
| Category | crypto                                                           |
| Handout  | `chall.py` (one for-loop encryptor) + `output.txt` (hex tokens)  |
| Flag     | `HASBL{1_F33L_D1ZZY_WH3N_1_S33_4_L00P}`                          |

## Description

> *I feel dizzy when I see a loop.*

```python
# chall.py
def encrypt(pt):
    ct = []
    for i, char in enumerate(pt):
        res = (ord(char) * 1337 + i) ^ 0x42
        ct.append(hex(res))
    return "".join(ct).replace("0x", " ")
```

```
# output.txt
 1784a 15338 1b13f 158f7 18cb2 2822a ffad 1f06c 16ddc 10a26 10a27
 18cb5 1f071 16373 ffb5 1d65b 1d658 1d0a0 1f07b 1c630 1785e 10a32
 19736 1f07c 10043 1f002 1b1d7 10a34 10a35 1f006 10ff0 1f004 18d4e
 fa93 fa90 1a1b1 28cbb
```

37 tokens of variable-width hex, leading space because the first
`"0x"` got replaced.

## TL;DR

Every operation is invertible byte-by-byte:

```python
ord_ch = ((int(token, 16) ^ 0x42) - i) // 1337
```

XOR is its own inverse, subtraction undoes the index addition, integer
division undoes the multiply (no remainder — printable ASCII × 1337 +
small index is always < 2^17, the multiply lands cleanly).

```
$ ./solve.py
HASBL{1_F33L_D1ZZY_WH3N_1_S33_4_L00P}
```

## Recon

### Step 1 — read the loop

Three operations applied to each character:

1. `* 1337` — multiply by a small odd constant.
2. `+ i` — add the position index (`enumerate` gives `i = 0, 1, 2, …`).
3. `^ 0x42` — XOR with a fixed mask.

None of these depends on a secret — they're all in the source. The
"cipher" is a fence-post-with-XOR: a one-byte XOR cover, with
position-dependent salt to defeat a pure byte-substitution attack.

### Step 2 — parse the token stream

`hex(0xff) → "0xff"`. The encryptor produces `"0x1784a0x153380x1b13f…"`,
then does `.replace("0x", " ")`. Result: a single string starting
with a space, with each hex token separated by a single space.

```python
tokens = text.split()           # 37 entries
nums   = [int(t, 16) for t in tokens]
```

### Step 3 — invert each byte

For each `(i, v)`:

```
v = (ord(ch) * 1337 + i) ^ 0x42
↓
ord(ch) = ((v ^ 0x42) - i) // 1337
```

Sanity check: `printable_ascii * 1337 ≤ 126 * 1337 = 168 462 ≈ 2^17.4`,
and `i < 50` for any sensible flag. The product `(v XOR 0x42)` minus
`i` is therefore a clean integer multiple of 1337 with no
ambiguity — `divmod` returns remainder 0 every position.

### Step 4 — print

```
HASBL{1_F33L_D1ZZY_WH3N_1_S33_4_L00P}
```

37 bytes — matches the 37-token stream verbatim.

## Flag

```
HASBL{1_F33L_D1ZZY_WH3N_1_S33_4_L00P}
```

*"I feel dizzy when I see a loop"* — the cipher *is* the loop, and
the loop reads its own secret.

## Defender notes

* **No key, no secret.** The author hardcoded `1337`, `0x42`, and the
  per-position index. There's no key material the attacker needs to
  guess — every operation is in the source. If your "cipher" is a
  for-loop full of literal constants, you have an encoding, not a
  cipher.
* **Position-dependent salt is not authentication.** The `+ i` term
  defeats the simplest possible attack ("the same byte at two
  positions has the same ciphertext"), but does nothing to prevent the
  per-byte inversion. The same byte at positions `i` and `j` produces
  ciphertexts that differ by exactly `(i - j) XOR-modulated`, which is
  exactly the trace the inversion needs.
* **`x | tr 0x ' '` cipher format is a parser footgun, not security.**
  Replacing `"0x"` with a space makes the output *look* novel, but
  `text.split()` undoes it in one call. Variable-width hex tokens are
  fine for the encoder (no field-width to worry about), trivial for
  the decoder — the only thing this "format" buys is human
  illegibility, and only briefly.
* **XOR-then-multiply-then-XOR keystreams are the real version of
  this idea.** A genuine stream cipher (RC4, ChaCha20, Salsa20)
  derives a per-byte keystream from a *secret* and combines it with
  the plaintext via XOR. The construction in `chall.py` is what
  happens when you take the structure of a stream cipher and remove
  every secret from it. The lesson generalises: every term in a
  cipher that an attacker can read from the source is one fewer term
  contributing security.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/crypto/baby-learns-walking/solve.py) — argparse-driven solver. Reads
  `output.txt`, splits on whitespace, inverts each token, prints the
  flag. Standard library only.
* [`handout/chall.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/crypto/baby-learns-walking/handout/chall.py) — original encryptor.
* [`handout/output.txt`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/crypto/baby-learns-walking/handout/output.txt) — the space-separated
  hex tokens.

## Requirements

Python 3.9+; standard library only.
