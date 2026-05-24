# CTF Writeup — Obfuscation Cipher (Crypto, Easy)

## Challenge

> A custom encryption scheme (`chall.py`) and its output (`output.txt`) are provided.
> The flag format is `HASBL{}`.
> Recover the plaintext.

---

## Overview

The pipeline has two distinct stages:

1. **Obfuscation** — the plaintext is scrambled by a custom `obf()` function that also prepends a fixed junk header.
2. **Encryption** — every character of the obfuscated string is independently mapped through a modular multiplication: `(ord(ch) * 0xDEADBEEF) % 0x1337`.

Both stages are independently invertible, so we reverse them in order: decrypt the modular multiplication first, then undo the scramble.

---

## Step 1 — Understand the Encryption

Each character is encrypted as:

```python
val = (ord(ch) * 0xDEADBEEF) % 0x1337
```

Constants in decimal:

| Constant     | Hex          | Decimal    |
|--------------|--------------|------------|
| Multiplier   | `0xDEADBEEF` | 3735928559 |
| Modulus      | `0x1337`     | 4919       |

Since 4919 is prime and `gcd(0xDEADBEEF mod 4919, 4919) = 1`, the multiplier has a unique modular inverse — making every value individually reversible.

```
MULT % MOD  = 3735928559 % 4919 = 2168
inv(2168, 4919) = 4649     (since 2168 * 4649 ≡ 1 mod 4919)
```

Decryption is therefore:

```
ord(ch) = (val * 4649) % 4919
```

---

## Step 2 — Understand the Obfuscation

`obf()` prepends a fixed 57-character junk header before the scrambled flag:

```
aaaaaaaaaaaabbbbbbbbbbbJohnDoeaaaaaaaaaaaaabbbbbbbbbbbbb
```

This is immediately identifiable in the ciphertext — the first 12 values are all `3698` (encrypting `'a'`) and the next 11 are all `947` (encrypting `'b'`), followed by `JohnDoe`.

After stripping the header, the remaining characters are the scrambled flag. For a flag of even length `L`, the scramble works as follows:

```
output = pt[L-1], pt[L-2], ..., pt[L//2],   ← back half, reversed
         pt[0],   pt[1],   ..., pt[L//2-1]   ← front half, in order
```

To reverse it, split the scrambled string down the middle. The first half is the back of the original flag (reversed), and the second half is the front:

```
flag = second_half + reverse(first_half)
```

---

## Step 3 — Decryption

### 3a — Invert the modular multiplication

Apply `ord(ch) = (val * 4649) % 4919` to every ciphertext value. The leading repeated values immediately decode to the junk header, confirming the inverse is correct.

Decrypted obfuscated string:

```
aaaaaaaaaaaabbbbbbbbbbbJohnDoe}N017PYRCN3_D3HASBL{0BFU5C47
```

### 3b — Strip the header

Remove the fixed 57-character prefix. What remains is the 28-character scrambled flag:

```
}N017PYRCN3_D3HASBL{0BFU5C47
```

### 3c — Reverse the scramble

Split into two halves of length 14:

```
first_half  = "}N017PYRCN3_D3"   ← corresponds to pt[27..14] (reversed)
second_half = "HASBL{0BFU5C47"   ← corresponds to pt[0..13]
```

Reconstruct:

```
flag = second_half + reverse(first_half)
     = "HASBL{0BFU5C47" + "3D_3NCRYP710N}"
     = "HASBL{0BFU5C473D_3NCRYP710N}"
```

---

## Solver

```python
python3 solver.py
```

Re-encrypting this plaintext reproduces the exact ciphertext. Verified.

---

## Root Cause

The cipher has two independent weaknesses. First, the modular multiplication uses a fixed public multiplier with a trivially computable inverse — it provides no security beyond obscuring character values. Second, the obfuscation is a deterministic permutation with a hardcoded junk prefix, making the structure immediately recognizable from repeated ciphertext values alone.

**Fix:** Replace the character-by-character modular map with a proper symmetric cipher (e.g. AES) and remove the identifiable fixed header. Obfuscation that does not depend on a secret key contributes nothing to security.

---

## Flag

```
HASBL{0BFU5C473D_3NCRYP710N}
```
