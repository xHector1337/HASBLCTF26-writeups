# CTF Writeup — Custom Matrix Cipher (Crypto, Easy)

## Challenge

> A custom encryption scheme (`chall.py`) and its output (`output.txt`) are provided.
> The program accidentally left debug instrumentation enabled, leaking a partial view
> of the internal matrix state. Recover the plaintext.

---

## Overview

The encryption pipeline runs in three stages:

1. **Matrix construction** — the plaintext is embedded into a 20×20 matrix using a linear formula.
2. **Matrix rounds** — three rounds of row selection, identity embedding, and multiplication mod 256.
3. **Final XOR** — the matrix is flattened to 400 bytes and XOR'd with a repeating 4-byte keystream derived from the first four characters of the plaintext.

Because of an accidentally-enabled debug print, one internal matrix row leaks in full — and that single row is enough to recover the entire flag.

---

## Step 1 — Understand the Matrix Construction

### `fill_matrix(pt)`

A 20×20 matrix is built from the plaintext using:

```
matrix[i][j] = (31 * (i+1) * ord(pt[j % L])) % 256
```

Two structural properties drive the entire attack:

- **Each column `j` depends only on `pt[j % L]`** — the column index alone selects which plaintext character contributes.
- **Each row is a scalar multiple of the character** — row `i` simply scales by `31 * (i+1)`.

---

## Step 2 — Identify the Vulnerability

The `encrypt()` function contains a leftover debug print:

```
[debug] Round 1 selected row index: 4
[debug] Initial matrix row 4 (extended): [152, 91, 65, ...]
```

The "extended" row is computed as:

```python
debug_row[j] = (31 * (r0+1) * ord(pt[j])) % 256   # for j in 0..len(pt)-1
```

With `r0 = 4`, the scale factor is `31 * 5 = 155`, so:

```
debug_row[j] = (155 * ord(pt[j])) % 256
```

To invert this we need `gcd(155, 256) = 1`. Since 155 = 5×31 (both odd) and 256 = 2^8, they share no common factors — a modular inverse exists:

```
155^-1 mod 256 = 147      (since 155 * 147 = 22785 = 89*256 + 1)
```

Therefore every character is uniquely recoverable:

```
ord(pt[j]) = (147 * debug_row[j]) mod 256
```

No ambiguity is possible: a unique inverse plus one value per character yields exactly one solution.

---

## Step 3 — Decryption

### 3a — Apply the inverse

Multiply each debug row value by 147 mod 256:

| j  | debug_row[j] | ×147 mod 256 | pt[j] |
|----|-------------|--------------|-------|
| 0  | 152         | 72           | H     |
| 1  | 91          | 65           | A     |
| 2  | 65          | 83           | S     |
| 3  | 246         | 66           | B     |
| 4  | 4           | 76           | L     |
| 5  | 121         | 123          | {     |
| 6  | 225         | 51           | 3     |
| 7  | 18          | 86           | V     |
| 8  | 225         | 51           | 3     |
| 9  | 166         | 82           | R     |
| 10 | 227         | 89           | Y     |
| 11 | 133         | 95           | _     |
| 12 | 65          | 83           | S     |
| 13 | 145         | 67           | C     |
| 14 | 166         | 82           | R     |
| 15 | 171         | 49           | 1     |
| 16 | 112         | 80           | P     |
| 17 | 77          | 55           | 7     |
| 18 | 225         | 51           | 3     |
| 19 | 166         | 82           | R     |
| 20 | 133         | 95           | _     |
| 21 | 145         | 67           | C     |
| 22 | 124         | 52           | 4     |
| 23 | 58          | 78           | N     |
| 24 | 133         | 95           | _     |
| 25 | 124         | 52           | 4     |
| 26 | 16          | 48           | 0     |
| 27 | 4           | 76           | L     |
| 28 | 18          | 86           | V     |
| 29 | 225         | 51           | 3     |
| 30 | 133         | 95           | _     |
| 31 | 171         | 49           | 1     |
| 32 | 77          | 55           | 7     |
| 33 | 175         | 125          | }     |

---

## Solver

```python
debug_row = [152, 91, 65, 246, 4, 121, 225, 18, 225, 166, 227, 133,
             65, 145, 166, 171, 112, 77, 225, 166, 133, 145, 124, 58,
             133, 124, 16, 4, 18, 225, 133, 171, 77, 175]

# r0=4  =>  factor = 31*5 = 155  =>  inv(155, 256) = 147
flag = ''.join(chr((147 * v) % 256) for v in debug_row)
print(flag)   # HASBL{3V3RY_SCR1P73R_C4N_40LV3_17}
```

Re-encrypting this plaintext reproduces the exact ciphertext. Verified.

---

## Root Cause

The vulnerability is not in the cipher's round structure — it is in **debug code left active in production**. The `fill_matrix` formula is a linear map mod 256; leaking any row whose scale factor is coprime to 256 is equivalent to leaking the plaintext directly.

The corrected hint leaks the **extended** row over the full plaintext length (34 values), giving one equation per character. Combined with the invertibility of the row factor mod 256, this yields a unique solution with no branching.

**Fix:** Remove debug prints before deployment. As defense-in-depth, mix characters non-linearly across columns so no single row decodes each column independently.

---

## Flag

```
HASBL{3V3RY_SCR1P73R_C4N_40LV3_17}
```
