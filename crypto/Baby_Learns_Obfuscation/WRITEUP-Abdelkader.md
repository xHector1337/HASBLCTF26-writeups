<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/crypto/baby-learns-obfuscation -->
<!-- (full solve.py and handout/ live there) -->

# baby-learns-obfuscation (crypto)

| Field    | Value                                                            |
| -------- | ---------------------------------------------------------------- |
| Category | crypto                                                           |
| Handout  | `chall.py` (the encryptor) + `output.txt` (list of stringified ints) |
| Flag     | `HASBL{0BFU5C473D_3NCRYP710N}`                                    |

## Description

> *Obfuscated Encryption.*

```python
# chall.py (trimmed)
def obf(pt):
    obf_text = ""
    leng = len(pt)
    obf_text += "aaaaaaaaaaaabbbbbbbbbbbJohnDoeaaaaaaaaaaaaabbbbbbbbbbbbb"
    if leng % 2 == 1:
        # buggy odd-length branch (double-emits pt[mid], drops pt[mid+1])
        …
    if leng % 2 == 0:
        i = leng - leng // 2
        j = leng - 1
        while j != (i - 1):           # reverse second half into obf
            obf_text += pt[j]; j -= 1
        j = 0
        while j != i:                 # append first half in order
            obf_text += pt[j]; j += 1
        return obf_text

def encrypt(ptt):
    ct = []
    obf_t = obf(ptt)
    for ch in obf_t:
        val = (ord(ch) * 0xDEADBEEF) % 0x1337
        ct.append(str(val))
    return ct
```

Two layers — a permutation (`obf`) followed by a per-byte modular
multiplication, base-10 stringified. The output (`handout/output.txt`)
is a Python list of stringified integers, 84 entries long.

## TL;DR

* Per-byte map: `c = (ord(ch) * 0xDEADBEEF) % 0x1337`. `0x1337 = 4919`
  is prime, `gcd(0xDEADBEEF, 4919) = 1`, so the map is a bijection on
  `Z_4919`. One precomputed inversion table cracks every byte in O(1).
* The obfuscation layer prepends a 56-byte fixed cleartext prefix
  (`"aaaaaaaaaaaabbbbbbbbbbbJohnDoeaaaaaaaaaaaaabbbbbbbbbbbbb"`) and
  then appends a reordering of the plaintext. For even-length input
  (which we have: 84 - 56 = 28 = even), the layout is
  `reversed(pt[mid:]) || pt[:mid]` where `mid = N // 2`.
* Decryption: invert the per-byte map across all 84 entries, strip
  the prefix, unscramble the 28-byte suffix as
  `pt[:mid] = suffix[mid:]`, `pt[mid:] = reversed(suffix[:mid])`.

```
$ ./solve.py
HASBL{0BFU5C473D_3NCRYP710N}
```

## Recon

### Step 1 — invert the per-byte cipher

The byte-level map is `f(ord) = (ord * 0xDEADBEEF) % 0x1337`. Sanity
checks:

* `0x1337 = 4919` is prime.
* `gcd(0xDEADBEEF, 4919) = 1` (the multiplier is coprime to the
  modulus).
* `4919 > 95` (the printable-ASCII alphabet size).

So the map is a bijection on `Z_4919` and a fortiori injective on the
printable range. Build the lookup table once:

```python
TABLE = {(o * 0xDEADBEEF) % 0x1337: chr(o) for o in range(32, 127)}
```

and apply it across the 84 ciphertext entries to recover the full
obfuscated cleartext (`obf_text`).

### Step 2 — discover the prefix

The handout's `obf()` function prepends a 56-character literal:

```
aaaaaaaaaaaa     (12 'a')
bbbbbbbbbbb      (11 'b')
JohnDoe          (7  chars)
aaaaaaaaaaaaa    (13 'a')
bbbbbbbbbbbbb    (13 'b')
                 ----
                 56 bytes
```

Subtracting 56 from the 84-byte total leaves `N = 28` plaintext bytes
hidden in the suffix. 28 is even, so the *correct* branch of `obf()`
fires (the `% 2 == 1` branch has a known bug — it loops up to but
not including `pt[i]`, then appends `pt[mid]` again, so `pt[i]` is
dropped and `pt[mid]` is doubled — but we never hit that path with
even-length plaintext).

### Step 3 — reverse the permutation

The even branch's loop, in plain English:

```python
i = leng - leng // 2          # 14
j = leng - 1                  # 27
while j != (i - 1):           # while j != 13
    obf_text += pt[j]; j -= 1 # appends pt[27], pt[26], ..., pt[14]
                              # stops AT j == 13 without appending it
j = 0
while j != i:                 # while j != 14
    obf_text += pt[j]; j += 1 # appends pt[0..13]
```

So the suffix is `pt[27..14] || pt[0..13]` — i.e. *reversed second
half* + *first half in order*.

Inversion:

```
suffix[:14]  == reversed(pt[14..27])  ->  pt[14..27] = reversed(suffix[:14])
suffix[14:]  == pt[0..13]              ->  pt[0..13]  = suffix[14:]
```

so the recovered plaintext is

```python
pt = suffix[mid:] + suffix[:mid][::-1]
```

### Step 4 — wire it up

```python
ct  = [int(s) for s in eval(open("handout/output.txt").read())]
obf = "".join(TABLE[c] for c in ct)
suffix = obf[len(PREFIX):]
mid = len(suffix) // 2
pt = suffix[mid:] + suffix[:mid][::-1]
print(pt)
```

Output:

```
HASBL{0BFU5C473D_3NCRYP710N}
```

The recovered `obf_text` looks like

```
aaaaaaaaaaaabbbbbbbbbbbJohnDoeaaaaaaaaaaaaabbbbbbbbbbbbb}N017PYRCN3_D3HASBL{0BFU5C47
```

The trailing 28 bytes are `"}N017PYRCN3_D3HASBL{0BFU5C47"` — the
brace-tail-then-prefix layout that the second-half-reverse-plus-first-
half rearrangement gives you.  Slicing as
`suffix[14:] + suffix[:14][::-1]` reconstructs
`HASBL{0BFU5C473D_3NCRYP710N}`.

## Flag

```
HASBL{0BFU5C473D_3NCRYP710N}
```

## Defender notes

* **Padding as a known-plaintext crib is a self-own.** The 56-byte
  literal prefix gives the solver 56 known plaintext/ciphertext pairs
  to validate the inversion table. Even if the per-byte map *weren't*
  obviously invertible, the prefix's `a*12 b*11 a*13 b*13` pattern
  would tell the attacker "this is a deterministic per-byte cipher and
  here is its image on every ASCII byte you care about."
* **Self-modifying / off-by-one obfuscation code is a tell.** The
  odd-length branch of `obf()` is buggy: it double-emits `pt[mid]` and
  drops `pt[mid+1]`. That signals "the obfuscation is hand-rolled and
  the author wasn't *certain* it worked," which is itself a hint that
  there's nothing cryptographically clever underneath. Both branches
  here are deterministic permutations — invertible by construction —
  and the even branch is the only one the challenge ever uses.
* **`p` prime + small modulus is the same kind of "looks defensive,
  isn't" as in `baby-counting-fingers`.** `4919` is a fine modulus for
  a bijection on `Z_4919`, but the alphabet is 95 chars wide and the
  map only ever sees ord values in `[32, 126]`. The size mismatch
  means the per-byte cipher gives at most `⌈log2 95⌉ ≈ 6.6` bits of
  security per byte regardless of how prime the modulus is — and 0
  bits, in fact, because the map is publicly invertible.
* **Modular inverse vs lookup table.** A 95-entry dict comprehension
  builds the inversion table in O(95); the alternative is
  `q⁻¹ = pow(0xDEADBEEF, -1, 0x1337)` and `ord = c · q⁻¹ mod n`. Both
  are fine. For arbitrary alphabets (non-printable), use the modular
  inverse; for printable-ASCII-only, the lookup table is the
  simplest mental model and instantly correct.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/crypto/baby-learns-obfuscation/solve.py) — argparse-driven solver. Reads
  `output.txt`, builds the per-byte inversion table, strips the
  56-byte literal prefix, reconstructs the 28-byte plaintext from the
  reversed-second-half + first-half layout, prints the flag. Standard
  library only.
* [`handout/chall.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/crypto/baby-learns-obfuscation/handout/chall.py) — original encryptor.
* [`handout/output.txt`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/crypto/baby-learns-obfuscation/handout/output.txt) — the ciphertext list.

## Requirements

Python 3.9+; standard library only.
