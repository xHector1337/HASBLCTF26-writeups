<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/crypto/script-kiddie -->
<!-- (full solve.py and handout/ live there) -->

# script-kiddie (crypto)

| Field    | Value                                                            |
| -------- | ---------------------------------------------------------------- |
| Category | crypto                                                           |
| Handout  | `chall.py` (matrix-cipher encryptor) + `output.txt` (ciphertext + debug print) |
| Flag     | `HASBL{3V3RY_SCR1P73R_C4N_40LV3_17}`                              |

## Description

> *Every scripter can solve it.*

```python
# chall.py (trimmed)
def fill_matrix(pt):
    matrix = [[0]*20 for _ in range(20)]
    L = len(pt)
    for i in range(20):
        for j in range(20):
            matrix[i][j] = (31 * (i+1) * ord(pt[j % L])) % 256
    return matrix

def key_creation(mtx):
    r0 = sum(mtx[i][0] for i in range(20)) % 20
    r1 = (sum(mtx[i][1] for i in range(20)) + 7) % 20
    r2 = (sum(mtx[i][2] for i in range(20)) + 13) % 20
    key = [[0]*20 for _ in range(3)]
    for j in range(20):
        key[0][j] = mtx[r0][j]
        key[1][j] = mtx[r1][j]
        key[2][j] = mtx[r2][j]
    return key, (r0, r1, r2)

def build_round_key(key):
    full = [[1 if i == j else 0 for j in range(20)] for i in range(20)]
    for k in range(20):
        for j in range(3):
            full[k][j] = key[j][k]
    return full

def matrix_rounds(mtx):
    for _ in range(3):
        key, _ = key_creation(mtx)
        full_key = build_round_key(key)
        mtx = multiplication(mtx, full_key)
    return mtx

def final_xor(mtx, pt):
    key_stream = [ord(c) for c in pt[:4]] * 100
    flattened = [b for row in mtx for b in row]
    return "".join(f"{x ^ key_stream[i]:02x}" for i, x in enumerate(flattened))

def encrypt(data):
    initial_mtx = fill_matrix(data)
    _, (r0, r1, r2) = key_creation(initial_mtx)
    factor = 31 * (r0 + 1)
    debug_row = [(factor * ord(data[j])) % 256 for j in range(len(data))]
    print(f"[debug] Round 1 selected row index: {r0}")
    print(f"[debug] Initial matrix row {r0} (extended): {debug_row}")
    mtx = matrix_rounds(initial_mtx)
    return final_xor(mtx, data)
```

Looks heavy: 20x20 matrices, three rounds of mod-256 matrix
multiplication, derived round keys, a 4-byte plaintext XOR keystream
folded in at the end. Total ciphertext: 400 bytes (the flattened
matrix). The handout prints the ciphertext as hex, then —
*helpfully* — also prints a debug line for round 1 that gives away
the plaintext.

## TL;DR

The `[debug]` line in `output.txt` is

```
Initial matrix row 4 (extended): [152, 91, 65, 246, 4, 121, …]
```

which is literally `(155 * ord(pt[j])) % 256` for every `j` (`155 =
31 * (r0 + 1)` with `r0 = 4`). `155` is coprime to `256` (it's odd),
so its modular inverse exists:

```
155^{-1} mod 256 = 147     (because 155 * 147 = 89*256 + 1)
```

and the plaintext is one one-liner away:

```python
flag = "".join(chr((v * 147) % 256) for v in debug_row)
# 'HASBL{3V3RY_SCR1P73R_C4N_40LV3_17}'
```

The three rounds of matrix multiplication, the round-key extraction
ritual, and the final XOR keystream — none of it ever has to run.
The debug print sits at round 1 and leaks the whole plaintext before
the encryption begins.

```
$ ./solve.py
HASBL{3V3RY_SCR1P73R_C4N_40LV3_17}
```

## Recon

### Step 1 — read the debug print

`encrypt(data)` does the following, in order, before the matrix
multiplications run:

```python
initial_mtx = fill_matrix(data)
_, (r0, r1, r2) = key_creation(initial_mtx)
factor = 31 * (r0 + 1)
debug_row = [(factor * ord(data[j])) % 256 for j in range(L)]
print(f"[debug] Round 1 selected row index: {r0}")
print(f"[debug] Initial matrix row {r0} (extended): {debug_row}")
```

So `debug_row` is a **per-position transform of the plaintext** using
the constant `factor = 31 * (r0 + 1)`. The handout's debug print gives
`r0 = 4`, so `factor = 155`.

### Step 2 — `155` is invertible mod 256

`gcd(155, 256) = gcd(odd, 2^8) = 1`, so the multiplicative inverse
exists. Computing it (extended Euclidean, or `pow(155, -1, 256)` in
Python 3.8+):

```
155^{-1} mod 256 = 147

verify: 155 * 147 = 22785, 22785 / 256 = 89 rem 1   ✓
```

### Step 3 — recover the plaintext

For every `j`, `debug_row[j] = (155 * ord(pt[j])) % 256`. Multiply
both sides by `147` (the inverse):

```
ord(pt[j]) = (debug_row[j] * 147) % 256
```

The script:

```python
import ast, re
text = open("handout/output.txt").read()
row  = ast.literal_eval(re.search(r"\[.*?\]", text).group(0))
print("".join(chr((v * 147) % 256) for v in row))
```

Output:

```
HASBL{3V3RY_SCR1P73R_C4N_40LV3_17}
```

### Step 4 — why none of the matrix work matters

The cipher's per-byte structure is the killer detail. Every byte
`pt[j]` is transformed by the *same* factor `(31 * (i+1)) mod 256`
for the row index `i` printed by the debug line. No byte mixes with
any other byte at row-build time. The matrix multiplications that
follow are *additional* mixing on top, but they're moot — the round-1
row leak happens *before* the multiplications run.

Even if the debug print had been on a *later* round, the same
argument would have applied to whatever per-byte expression that row
carries. The lesson is **never print intermediate ciphertext state**,
not "use a heavier cipher."

## Flag

```
HASBL{3V3RY_SCR1P73R_C4N_40LV3_17}
```

*"Every scripter can solve it"* — the debug print makes the whole
challenge a one-line modular inverse.

## Defender notes

* **Debug prints in cryptographic code are catastrophic.** A single
  `print(f"[debug] row {r0}: {row}")` defeated three rounds of matrix
  mixing and a 32-bit keystream XOR. In production code, the obvious
  defense is *strip all debug paths before deployment*; in test code,
  use a structured logger with levels and ensure crypto-state logs
  are off by default. As a habit, treat any intermediate value in a
  block cipher / hash / KDF as plaintext-equivalent.
* **Linear mixing over `Z/256` is fragile.** Matrix multiplication
  mod 256 looks like AES if you squint, but AES's strength comes from
  the *non-linear* S-box, not the linear MixColumns. A pure linear
  cipher over `Z/256` is invertible byte-by-byte whenever the per-row
  factor is odd (coprime to 2), which is almost always — so the
  "rounds" don't add security, just compute time.
* **Independent per-position byte maps don't compose to a cipher.**
  `fill_matrix` is a *deterministic per-byte permutation* of the
  plaintext, parameterised by row index. Each row gives 20 such
  permutations of the plaintext alphabet, all of which are
  individually known-plaintext-recoverable. Without inter-byte
  mixing *before* the per-byte operation, the matrix is just a
  position-indexed alphabet of substitutions.
* **`(31 * (r+1)) mod 256` is *always* odd for any r in 0..19.** That
  means the per-row transform is *always* invertible mod 256
  regardless of which row the debug print picks. The challenge would
  have been just as breakable with `r0 = 7`, `r0 = 11`, anything —
  the inverse table is `{factor: pow(factor, -1, 256)}` for the 20
  possible factors and a single inversion per row.
* **The "scripter" pun is precise.** "Script-kiddie" implies the
  solver doesn't need to understand the math. The whole solver is
  three lines of Python plus the modular inverse. The author's joke
  is that the cipher's superficial complexity (20x20 matrices, three
  rounds, sums-and-derived-row-indices for the round keys) is
  pointless when a one-line debug print spills the plaintext at
  round 1.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/crypto/script-kiddie/solve.py) — argparse-driven solver. Parses the
  debug row out of `output.txt`, multiplies each element by `147`
  (mod 256), prints the flag. Standard library only.
* [`handout/chall.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/crypto/script-kiddie/handout/chall.py) — original encryptor.
* [`handout/output.txt`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/crypto/script-kiddie/handout/output.txt) — the ciphertext +
  debug-print output.

## Requirements

Python 3.9+; standard library only.
