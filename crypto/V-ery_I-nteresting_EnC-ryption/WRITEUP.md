# CTF Writeup — VIC Cipher (Crypto, Easy)

## Challenge

> An intercepted transmission from a cold-war-era spy network.
> We know the agent's codename. The rest is up to you.
>
> **Key:** `PHANTOM`
>
> **Ciphertext:**
> ```
> 498617096752072960505459675014205450305667501423412988064723675014294044925927261862072417698459212283351426145617881454
> ```

## Overview

The VIC cipher is a hand cipher used by Soviet agents in the 1950s and 60s. It combines two core operations:

1. **Straddling checkerboard** — a substitution table that converts letters into 1- or 2-digit codes, achieving basic compression.
2. **Chain addition** — a keystream generation technique that XORs (mod 10) digit-by-digit over the encoded message.

Because the flag contains non-alphabetic characters (`{}`, `_`, and digits), these are first expanded into letter codewords before enciphering.

---

## Step 1 — Understand the Straddling Checkerboard

The checkerboard maps every letter to a unique digit sequence without ambiguity. High-frequency letters get 1-digit codes; the rest get 2-digit codes using row prefixes `3` and `6`.

```
      0  1  2  3  4  5  6  7  8  9
      E  T  A     O  I     N  S  H
3  |  R  D  B  C  F  G  J  K  L  M
6  |  P  Q  U  V  W  X  Y  Z
```

Columns 3 and 6 in the top row are intentionally empty. Any digit stream starting with `3` or `6` is read as a 2-digit pair. All other digits are single-character codes. This makes the encoding **prefix-free** and uniquely decodable.

---

## Step 2 — Special Character Expansion

Before checkerboard encoding, non-alpha characters are replaced with reserved letter-sequences:

| Character | Expansion |
|-----------|-----------|
| `{`       | `LCURL`   |
| `}`       | `RCURL`   |
| `_`       | `SCORE`   |
| `0`–`9`   | `ZERO`, `ONE`, `TWO`, `THREE`, `FOUR`, `FIVE`, `SIX`, `SEVEN`, `EIGHT`, `NINE` |

Applying this to the flag format `HASBL{V1C_15_N07_JUST_4_C1PH3R}` gives:

```
HASBLLCURLVONECSCOREONEFIVESCORENZEROSEVENSCOREJUSTSCOREFOURSCORECONEPHTHREERRCURL
```

---

## Step 3 — Checkerboard Encoding

Each letter is replaced by its code from the table:

```
H → 9    A → 2    S → 8    B → 32   L → 38   L → 38
C → 31   U → 62   R → 30   L → 38   ...
```

This produces a long digit string. The key property: digits `3` and `6` only appear as row prefixes — never as standalone single-char codes — so parsing is unambiguous.

---

## Step 4 — Chain Addition Keystream

The key `PHANTOM` is seeded by converting each letter to its alphabet index (A=0, B=1, ...):

```
P=15, H=7, A=0, N=13, T=19, O=14, M=12
Seed: [15, 7, 0, 13, 19, 14, 12]
```

The chain addition rule extends this sequence to the required length by repeatedly appending `(seq[-2] + seq[-1]) mod 10`:

```
15, 7, 0, 13, 19, 14, 12, ...
→  15, 7, 0, 3, 9, 4, 2, 6, 8, 6, 0, ...
```

Each digit of the checkerboard-encoded message is then added (mod 10) to the corresponding keystream digit.

---

## Step 5 — Decryption

Given the ciphertext and key, reverse the process:

### 5a — Reconstruct the keystream

Same chain addition from `PHANTOM`:

```python
seed = [15, 7, 0, 13, 19, 14, 12]
keystream = chain_addition(seed, len(ciphertext))
```

### 5b — Subtract keystream (mod 10)

```
stripped[i] = (ciphertext_digit[i] - keystream[i]) mod 10
```

Result:
```
928323838336230386347033833430047034563083343007670304806307833430036628183343003446230833430033470609193000303033623038
```

### 5c — Decode the checkerboard

Parse the digit string using the prefix rule:
- digit is `3` or `6` → read next digit too → 2-char lookup
- otherwise → 1-char lookup

Result:
```
HASBLLCURLVONECSCOREONEFIVESCORENZEROSEVENSCOREJUSTSCOREFOURSCORECONEPHTHREERRCURL
```

### 5d — Collapse word expansions

Match the longest known word substitutions left-to-right:
- `LCURL` → `{`
- `RCURL` → `}`
- `SCORE` → `_`
- `ONE` → `1`, `FIVE` → `5`, etc.

Final result:

```
HASBL{V1C_15_N07_JUST_4_C1PH3R}
```

---

## Solver

```bash
python3 solver.py
```

Output:
```
Keystream removed: 9283238383362303863470338334300470345630833430076703048063078334300366281833430034462308334300334706091930003030336...
Checkerboard decoded: HASBLLCURLVONECSCOREONEFIVESCORE...
Flag: HASBL{V1C_15_N07_JUST_4_C1PH3R}
```

---

## Flag

```
HASBL{V1C_15_N07_JUST_4_C1PH3R}
```
