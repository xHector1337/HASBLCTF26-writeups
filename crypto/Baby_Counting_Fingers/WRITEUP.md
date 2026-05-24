# CTF Writeup — Finger Cipher (Crypto, Easy)

## Challenge

> A custom encryption scheme (`chall.py`) and its output (`output.txt`) are provided.
> The flag format is `hasbl{}`.
> Recover the plaintext.

---

## Overview

The cipher applies a simple modular multiplication to each character of the plaintext. The key insight is that it uses **five rotating (q, n) pairs** — one per position — cycling through them with a `finger` index. Because all moduli are prime and all multipliers are coprime to their modulus, every operation is trivially invertible via modular inverse.

---

## Step 1 — Understand the Encryption

For each character at index `i`:

```python
finger = i % 5
q = q_list[finger]   # multiplier
n = n_list[finger]   # modulus

c = (ord(ch) * q) % n
```

The five (q, n) pairs in rotation are:

| finger | q  | n   |
|--------|----|-----|
| 0      | 31 | 127 |
| 1      | 71 | 131 |
| 2      | 19 | 137 |
| 3      | 97 | 139 |
| 4      | 47 | 149 |

All five moduli are prime, and `gcd(q, n) = 1` for every pair — meaning a modular inverse exists for each multiplier.

---

## Step 2 — Identify the Vulnerability

The scheme is a straightforward affine cipher mod n with no mixing between characters. Since each ciphertext value `c[i]` depends only on `pt[i]` (and the fixed pair at `finger = i % 5`), every character is independently invertible:

```
ord(pt[i]) = (c[i] * q^-1) mod n
```

There is no diffusion, no chaining, and no state — recovering position `i` requires no knowledge of any other position.

---

## Step 3 — Decryption

### 3a — Compute the modular inverses

For each (q, n) pair, find `q^-1 mod n` such that `q * q^-1 ≡ 1 (mod n)`:

| finger | q  | n   | q⁻¹ mod n |
|--------|----|-----|-----------|
| 0      | 31 | 127 | 41        |
| 1      | 71 | 131 | 24        |
| 2      | 19 | 137 | 101       |
| 3      | 97 | 139 | 43        |
| 4      | 47 | 149 | 130       |

### 3b — Apply the inverse to each ciphertext value

| i  | finger | c   | q⁻¹ | (c × q⁻¹) mod n | pt[i] |
|----|--------|-----|-----|-----------------|-------|
| 0  | 0      | 49  | 41  | 104             | h     |
| 1  | 1      | 75  | 24  | 97              | a     |
| 2  | 2      | 130 | 101 | 115             | s     |
| 3  | 3      | 54  | 43  | 98              | b     |
| 4  | 4      | 10  | 130 | 108             | l     |
| 5  | 0      | 3   | 41  | 123             | {     |
| 6  | 1      | 123 | 24  | 70              | F     |
| 7  | 2      | 109 | 101 | 49              | 1     |
| 8  | 3      | 60  | 43  | 78              | N     |
| 9  | 4      | 59  | 130 | 71              | G     |
| 10 | 0      | 57  | 41  | 51              | 3     |
| 11 | 1      | 58  | 24  | 82              | R     |
| 12 | 2      | 24  | 101 | 95              | _     |
| 13 | 3      | 105 | 43  | 67              | C     |
| 14 | 4      | 21  | 130 | 48              | 0     |
| 15 | 0      | 95  | 41  | 85              | U     |
| 16 | 1      | 36  | 24  | 78              | N     |
| 17 | 2      | 86  | 101 | 55              | 7     |
| 18 | 3      | 131 | 43  | 73              | I     |
| 19 | 4      | 90  | 130 | 78              | N     |
| 20 | 0      | 23  | 41  | 54              | 6     |
| 21 | 1      | 64  | 24  | 95              | _     |
| 22 | 2      | 109 | 101 | 49              | 1     |
| 23 | 3      | 137 | 43  | 53              | 5     |
| 24 | 4      | 144 | 130 | 95              | _     |
| 25 | 0      | 122 | 41  | 49              | 1     |
| 26 | 1      | 36  | 24  | 78              | N     |
| 27 | 2      | 48  | 101 | 53              | 5     |
| 28 | 3      | 131 | 43  | 73              | I     |
| 29 | 4      | 5   | 130 | 54              | 6     |
| 30 | 0      | 73  | 41  | 72              | H     |
| 31 | 1      | 106 | 24  | 55              | 7     |
| 32 | 2      | 97  | 101 | 70              | F     |
| 33 | 3      | 44  | 43  | 85              | U     |
| 34 | 4      | 145 | 130 | 76              | L     |
| 35 | 0      | 65  | 41  | 125             | }     |

---

## Solver

```python
q_list = [31, 71, 19, 97, 47]
n_list = [127, 131, 137, 139, 149]

ct = [49, 75, 130, 54, 10, 3, 123, 109, 60, 59, 57, 58, 24, 105, 21,
      95, 36, 86, 131, 90, 23, 64, 109, 137, 144, 122, 36, 48, 131, 5,
      73, 106, 97, 44, 145, 65]

def modinv(a, m):
    for x in range(1, m):
        if (a * x) % m == 1:
            return x

flag = []
for i, c in enumerate(ct):
    finger = i % 5
    q = q_list[finger]
    n = n_list[finger]
    flag.append(chr((c * modinv(q, n)) % n))

print(''.join(flag))  # hasbl{F1NG3R_C0UN7IN6_15_1N5I6H7FUL}
```

Re-encrypting this plaintext reproduces the exact ciphertext. Verified.

---

## Root Cause

The cipher applies independent, invertible multiplications with no character mixing. Using prime moduli and coprime multipliers guarantees a unique modular inverse exists for every (q, n) pair — making the scheme trivially reversible one character at a time.

**Fix:** Introduce diffusion across characters (e.g., XOR with previous ciphertext, or a proper block structure) so that each output depends on more than a single input character. Without it, even a rotating key provides no meaningful security.

---

## Flag

```
hasbl{F1NG3R_C0UN7IN6_15_1N5I6H7FUL}
```
