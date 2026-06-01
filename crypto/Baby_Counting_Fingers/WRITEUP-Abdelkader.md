<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/crypto/baby-counting-fingers -->
<!-- (full solve.py and handout/ live there) -->

# baby-counting-fingers (crypto)

| Field    | Value                                                            |
| -------- | ---------------------------------------------------------------- |
| Category | crypto                                                           |
| Handout  | `chall.py` (the encryptor) + `output.txt` (list of 36 ints)      |
| Flag     | `hasbl{F1NG3R_C0UN7IN6_15_1N5I6H7FUL}`                           |

## Description

> Each character is encrypted with one of five "fingers" — a rotating
> `(q, n)` pair. *Count the fingers, count the characters.*

```python
# chall.py (trimmed)
q_list = [31, 71, 19, 97, 47]
n_list = [127, 131, 137, 139, 149]

def encrypt(pt):
    ct = []
    for i, ch in enumerate(pt):
        finger = i % 5
        q = q_list[finger]
        n = n_list[finger]
        c = (ord(ch) * q) % n
        ct.append(c)
    return ct
```

```
# output.txt
[49, 75, 130, 54, 10, 3, 123, 109, 60, 59, 57, 58, 24, 105, 21,
 95, 36, 86, 131, 90, 23, 64, 109, 137, 144, 122, 36, 48, 131, 5,
 73, 106, 97, 44, 145, 65]
```

## TL;DR

Every `n_i` is prime and every `q_i` is coprime to its paired `n_i`,
so the map `ord(ch) → (ord(ch)·q) mod n` is a bijection on `Z_n`.
Better, every `n_i > 95`, the size of the printable-ASCII range — so
no two printable characters collide on the same ciphertext byte.
A 95-element brute force per position recovers the character without
any modular inverse work.

```python
flag = []
for i, c in enumerate(ct):
    q, n = q_list[i % 5], n_list[i % 5]
    flag.append(next(chr(o) for o in range(32, 127) if (o*q) % n == c))
print("".join(flag))     # hasbl{F1NG3R_C0UN7IN6_15_1N5I6H7FUL}
```

## Recon

### Step 1 — characterise the cipher

Each position `i` is encrypted independently of every other position.
The keystream isn't a stream at all — it's a static lookup of
`(q, n) = (q_list[i mod 5], n_list[i mod 5])`. There are only five
distinct (q, n) pairs in the whole cipher, and every byte goes through
the same per-position rule.

### Step 2 — bijectivity

For the map `f_q,n(x) = (x · q) mod n` to be a bijection on `Z_n`, the
condition is `gcd(q, n) = 1`.

| pair | q  | n   | gcd  | n > 95?       |
|:-:|:--:|:---:|:----:|:--------------|
| 0 | 31 | 127 | 1    | yes (prime)   |
| 1 | 71 | 131 | 1    | yes (prime)   |
| 2 | 19 | 137 | 1    | yes (prime)   |
| 3 | 97 | 139 | 1    | yes (prime)   |
| 4 | 47 | 149 | 1    | yes (prime)   |

All `n` prime, all `q` coprime, so each position's map is a permutation
of `Z_n`. And every `n` exceeds the printable-ASCII range `[0x20,
0x7E]` (size 95), so within the plaintext alphabet there are *no*
collisions either. Two different printable chars can never produce the
same ciphertext at the same position.

### Step 3 — invert without inverses

Computing `q⁻¹ mod n` and doing `ord = c · q⁻¹ mod n` is the textbook
approach. It's a hair faster than the brute force, but the brute force
is more obviously correct and runs in milliseconds:

```python
for c in ct:
    q, n = q_list[i % 5], n_list[i % 5]
    for o in range(32, 127):
        if (o * q) % n == c:
            flag.append(chr(o)); break
```

95 × 36 = 3420 trial multiplications. Done before the script reaches
`print`.

### Step 4 — decode

```
$ ./solve.py
hasbl{F1NG3R_C0UN7IN6_15_1N5I6H7FUL}
```

*"Finger counting is insightful"* — the joke is that the cipher's
five-finger rotation has a trivial defeat (the per-position map is a
unique bijection), and you don't even need to be clever about
counting which finger goes where, because brute force handles all
five at once.

## Flag

```
hasbl{F1NG3R_C0UN7IN6_15_1N5I6H7FUL}
```

## Defender notes

* **Per-position bijections on a small alphabet leak the alphabet.**
  Whether the per-position map is `affine`, `affine-rotor`, `S-box`,
  or any other deterministic permutation on `Z_n` with `n > |alphabet|`,
  the moment the alphabet is bounded (here, printable ASCII is 95
  chars) you can solve each position independently in `O(|alphabet|)`.
  A one-time-pad-like construction needs the *plaintext* indeterminacy
  to come from key entropy, not from per-position permutations of a
  known alphabet.
* **`mod n` with `n` prime is overkill if `n > |alphabet|`.** The
  challenge could have used `n = 256` (one byte) and the map would
  still be a bijection (any odd `q` is invertible mod `2^k`). The
  prime moduli look defensive but don't add security here — the
  bijection property is doing all the work, and a known-cleartext crib
  on a single byte recovers the per-position mapping for *every*
  position with that `(q, n)`.
* **Five "fingers" buys you nothing.** Rotating through 5 keys at known
  positions is the worst kind of "polyalphabetic" — the period is
  trivially known, so the cipher is effectively five independent
  monoalphabetic substitutions on subsequences of length `⌈L/5⌉`. Real
  polyalphabetic strength comes from key length comparable to the
  plaintext length (Vigenère with `key length ≈ plaintext length`) and
  a key with high entropy — both of which collapse to one-time-pad in
  the limit.
* **Brute force vs modular inverse.** The brute-force approach used
  here is `O(95)` per position; modular inverse is `O(log n)` once,
  then `O(1)` per position. Both are instant on a 36-byte ciphertext.
  Use modular inverse when the alphabet might not be printable ASCII
  (e.g., arbitrary bytes) — that case is where brute force breaks
  uniqueness.

## Files

* [`solve.py`](./solve.py) — argparse-driven solver. Reads `output.txt`,
  parses the python-list-of-ints literally, brute-forces each position
  over `[0x20, 0x7E]`, prints the flag. Standard library only.
* [`handout/chall.py`](./handout/chall.py) — original encryptor.
* [`handout/output.txt`](./handout/output.txt) — the ciphertext list.

## Requirements

Python 3.9+; standard library only.
