# CTF Writeup — Linear Cipher (Crypto, Easy)

## Challenge

> A custom encryption scheme (`chall.py`) and its output (`output.txt`) are provided.
> Recover the plaintext flag.

---

## Overview

Each character is encrypted by a single arithmetic expression that combines three operations: a fixed multiply, a position-dependent add, and a constant XOR. Because all three operations are trivially invertible and none of them mix characters with each other, every ciphertext value decrypts independently with no interaction between positions.

---

## Step 1 — Understand the Encryption

For each character at index `i`:

```python
res = (ord(char) * 1337 + i) ^ 0x42
```

Written out:

1. Multiply the character's ASCII value by `1337`
2. Add the position index `i`
3. XOR the result with `0x42`

The output is a list of hex values, one per character.

---

## Step 2 — Identify the Vulnerability

The formula is a straightforward linear map with no state and no cross-character dependency. Each output value is a function of exactly one input character and its index — both of which are either known (the index) or being solved for (the character).

Inverting is three steps in reverse:

```
inner = res ^ 0x42          # undo XOR (self-inverse)
inner = inner - i           # undo position addition
ord(char) = inner / 1337    # undo multiplication
```

For this to yield a valid character, `(res ^ 0x42 - i)` must be exactly divisible by `1337`. All 37 values in the output satisfy this condition, confirming the scheme.

---

## Step 3 — Decryption

Apply the inverse formula to each ciphertext value:

| i  | val (hex) | `val ^ 0x42` | `− i`  | `÷ 1337` | char |
|----|-----------|-------------|--------|----------|------|
| 0  | `1784a`   | 96264       | 96264  | 72       | H    |
| 1  | `15338`   | 86906       | 86905  | 65       | A    |
| 2  | `1b13f`   | 110973      | 110971 | 83       | S    |
| 3  | `158f7`   | 88245       | 88242  | 66       | B    |
| 4  | `18cb2`   | 101616      | 101612 | 76       | L    |
| 5  | `2822a`   | 164456      | 164451 | 123      | {    |
| 6  | `ffad`    | 65519       | 65513  | 49       | 1    |
| 7  | `1f06c`   | 127022      | 127015 | 95       | _    |
| 8  | `16ddc`   | 93598       | 93590  | 70       | F    |
| 9  | `10a26`   | 68196       | 68187  | 51       | 3    |
| 10 | `10a27`   | 68197       | 68187  | 51       | 3    |
| 11 | `18cb5`   | 101619      | 101612 | 76       | L    |
| 12 | `1f071`   | 127027      | 127015 | 95       | _    |
| 13 | `16373`   | 90929       | 90916  | 68       | D    |
| 14 | `ffb5`    | 65527       | 65513  | 49       | 1    |
| 15 | `1d65b`   | 120345      | 120330 | 90       | Z    |
| 16 | `1d658`   | 120346      | 120330 | 90       | Z    |
| 17 | `1d0a0`   | 119010      | 118993 | 89       | Y    |
| 18 | `1f07b`   | 127037      | 127015 | 95       | _    |
| 19 | `1c630`   | 116338      | 116319 | 87       | W    |
| 20 | `1785e`   | 96284       | 96264  | 72       | H    |
| 21 | `10a32`   | 68208       | 68187  | 51       | 3    |
| 22 | `19736`   | 104308      | 104286 | 78       | N    |
| 23 | `1f07c`   | 127038      | 127015 | 95       | _    |
| 24 | `10043`   | 65537       | 65513  | 49       | 1    |
| 25 | `1f002`   | 127040      | 127015 | 95       | _    |
| 26 | `1b1d7`   | 110997      | 110971 | 83       | S    |
| 27 | `10a34`   | 68210       | 68187  | 51       | 3    |
| 28 | `10a35`   | 68211       | 68187  | 51       | 3    |
| 29 | `1f006`   | 127044      | 127015 | 95       | _    |
| 30 | `10ff0`   | 69554       | 69524  | 52       | 4    |
| 31 | `1f004`   | 127046      | 127015 | 95       | _    |
| 32 | `18d4e`   | 101654      | 101612 | 76       | L    |
| 33 | `fa93`    | 64209       | 64176  | 48       | 0    |
| 34 | `fa90`    | 64210       | 64176  | 48       | 0    |
| 35 | `1a1b1`   | 106995      | 106960 | 80       | P    |
| 36 | `28cbb`   | 167161      | 167125 | 125      | }    |

---

## Solver

```python
python3 solver.py
---

## Root Cause

The encryption is a position-keyed linear map with no diffusion. XOR with a constant (`0x42`) is self-inverse; adding the index `i` is undone by subtracting it; and dividing by `1337` is valid because the construction guarantees the result is always an integer. None of these operations depend on any secret — the multiplier, the XOR constant, and the index are all visible in the source.

**Fix:** Replace the fixed public multiplier with a secret key and use a construction that mixes characters together (e.g. a stream cipher or block cipher in CBC mode), so that knowing the algorithm without the key still leaves the plaintext unrecoverable.

---

## Flag

```
HASBL{1_F33L_D1ZZY_WH3N_1_S33_4_L00P}
```
