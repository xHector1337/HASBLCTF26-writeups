<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/crypto/vic -->
<!-- (full solve.py and handout/ live there) -->

# V-ery I-nteresting EnC-ryption (crypto)

| Field    | Value                                                            |
| -------- | ---------------------------------------------------------------- |
| Category | crypto                                                           |
| Handout  | `chall.py` (VIC implementation) + `output.txt` (KEY + CIPHERTEXT) |
| Flag     | `HASBL{V1C_15_N07_JUST_4_C1PH3R}`                                |

## Description

The challenge name is a triple acrostic — `V-ery I-nteresting
EnC-ryption` spells **VIC**, the Soviet hand-cipher used by KGB illegal
[Reino Häyhänen](https://en.wikipedia.org/wiki/Reino_H%C3%A4yh%C3%A4nen)
and named after his handler "Victor." This challenge implements a
faithful textbook VIC variant: special-character → word substitution,
straddling-checkerboard digit encoding, then a chain-addition
keystream added mod 10.

```python
# chall.py (key bits)
CHECKERBOARD_SINGLE       = list("ETAOINSH")
CHECKERBOARD_SINGLE_CODES = ["0","1","2","4","5","7","8","9"]
CHECKERBOARD_ROW3         = list("RDBCFGJKLM")   # codes 30..39
CHECKERBOARD_ROW6         = list("PQUVWXYZ")     # codes 60..67

SPECIAL_TO_WORD = {
    "{": "LCURL", "}": "RCURL", "_": "SCORE",
    "0": "ZERO",  "1": "ONE",   …,  "9": "NINE",
}

KEY = "PHANTOM"

def encrypt(plaintext, key):
    preprocessed = preprocess(plaintext)              # specials -> words
    encoded      = checkerboard_encode(preprocessed)  # letters -> digits
    return add_keystream(encoded, key)                 # + keystream mod 10
```

```
# output.txt
KEY:        PHANTOM
CIPHERTEXT: 498617096752072960505459675014205450305667501423412988
            064723675014294044925927261862072417698459212283351426
            145617881454
```

(120 digits, single line in the handout.)

## TL;DR

VIC is mechanically invertible end-to-end:

1. Build the chain-addition keystream from `"PHANTOM"`'s letter
   indices (P=15, H=7, A=0, N=13, T=19, O=14, M=12, then
   `(prev + cur) mod 10` ad infinitum until the keystream matches the
   ciphertext length).
2. Subtract the keystream digit-by-digit (mod 10).
3. Parse the resulting digit string against the straddling
   checkerboard: '3' and '6' consume two digits, every other digit
   consumes one.
4. Walk the recovered letter string left-to-right with longest-
   prefix matching against the SPECIAL_TO_WORD dictionary: `LCURL →
   {`, `RCURL → }`, `SCORE → _`, `ONE → 1`, `FIVE → 5`, `SEVEN → 7`,
   etc. Anything that isn't one of those words is a literal letter.

The decoded letter string before the special-undo is:

```
HASBLLCURLVONECSCOREONEFIVESCORENZEROSEVENSCOREJUSTSCOREFOURSCORECONEPHTHREERRCURL
```

Walking that left-to-right:

```
HASBL    -> "HASBL"
LCURL    -> "{"
V        -> "V"
ONE      -> "1"
C        -> "C"
SCORE    -> "_"
ONE      -> "1"
FIVE     -> "5"
SCORE    -> "_"
N        -> "N"
ZERO     -> "0"
SEVEN    -> "7"
SCORE    -> "_"
JUST     -> "JUST"          (no SPECIAL_TO_WORD match, so 4 literal letters)
SCORE    -> "_"
FOUR     -> "4"
SCORE    -> "_"
C        -> "C"
ONE      -> "1"
PH       -> "PH"            (no match -> literal)
THREE    -> "3"
R        -> "R"
RCURL    -> "}"
```

Concatenated:

```
HASBL{V1C_15_N07_JUST_4_C1PH3R}
```

```
$ ./solve.py
HASBL{V1C_15_N07_JUST_4_C1PH3R}
```

## Recon

### Step 1 — recognise the cipher

Three telltale features pin it as VIC:

* Special-to-word substitution table with `LCURL`/`RCURL`/`SCORE`
  plus `ZERO`/`ONE`/…/`NINE` — the "spelt-out specials" half of VIC.
* Two-digit codes prefixed by `3` and `6`, with single-digit codes
  for the highest-frequency English letters (E, T, A, O, I, N, S, H)
  — that's a *straddling checkerboard*, optimised so common letters
  cost one digit and rarer ones cost two. The specific letter-to-row
  assignment varies per VIC variant; this one matches the textbook
  Soviet construction.
* `chain_addition(seq, length)` extending a small seed by
  `(seq[-2] + seq[-1]) % 10` — the "chain addition" keystream, a
  Fibonacci-mod-10 generator, again straight out of the VIC manual.

### Step 2 — generate the keystream

The seed for "PHANTOM":

```
P=15, H=7, A=0, N=13, T=19, O=14, M=12
```

`chain_addition` extends this seed by repeatedly appending
`(last + previous-to-last) % 10`. The first many values are:

```
15, 7, 0, 13, 19, 14, 12,
( 14 + 12 ) % 10 = 6,
( 12 +  6 ) % 10 = 8,
(  6 +  8 ) % 10 = 4,
…
```

The seed values 15, 13, 19, 14, 12 are >= 10; they only become
modulo-10 once they fold into the chain. So the keystream is a
"mod-10 stream" only after the initial seed positions.

The original encryption adds `(digit + ks[i]) % 10`. To invert,
subtract.

### Step 3 — checkerboard parsing

After subtraction, the digit string is:

```
9 2 8 3 2 3 8 3 8 3 3 6 2 3 0 3 8 6 3 4 7 0 3 3 8 3 3 4 3 0
0 4 7 0 3 4 5 6 3 0 8 3 3 4 3 0 0 7 6 7 0 3 0 4 8 0 6 3 0 7
8 3 3 4 3 0 0 3 6 6 2 8 1 8 3 3 4 3 0 0 3 4 4 6 2 3 0 8 3 3
4 3 0 0 3 3 4 7 0 6 0 9 1 9 3 0 0 0 3 0 3 3 6 2 3 0 3 8
```

Reading left-to-right under the checkerboard rule (a `3` or a `6`
consumes the next digit too):

```
9    -> H        (single)
2    -> A        (single)
8    -> S        (single)
3,2  -> B        (row 3 + offset 2)
3,8  -> L        (row 3 + offset 8)
3,8  -> L        (row 3 + offset 8)
3,3  -> C        (row 3 + offset 3)
6,2  -> U        (row 6 + offset 2)
...
```

Concatenated:

```
HASBLLCURLVONECSCOREONEFIVESCORENZEROSEVENSCOREJUSTSCOREFOURSCORECONEPHTHREERRCURL
```

### Step 4 — undo specials with greedy longest match

The substitution dictionary has tokens of length 5 (`LCURL`, `RCURL`,
`SCORE`, `THREE`, `SEVEN`, `EIGHT`), 4 (`FOUR`, `FIVE`, `NINE`), and
3 (`ONE`, `TWO`, `SIX`). A left-to-right longest-match parser
disambiguates correctly:

```python
i = 0
while i < len(letters):
    for L in (5, 4, 3):
        token = letters[i:i + L]
        if token in WORD_TO_SPECIAL:
            out.append(WORD_TO_SPECIAL[token]); i += L; break
    else:
        out.append(letters[i]); i += 1
```

Anything that isn't one of those words is a literal letter. (The
plaintext contains the literal word `JUST` and the bigram `PH` —
neither is in the dictionary, so they fall through as letters.)

Result:

```
HASBL{V1C_15_N07_JUST_4_C1PH3R}
```

## Flag

```
HASBL{V1C_15_N07_JUST_4_C1PH3R}
```

*"VIC is not just a cipher"* — it's a hand-cipher kit that wraps a
substitution, a re-encoding, and a stream into one paper-and-pencil
procedure. The challenge name's acrostic is the hint.

## Defender notes

* **VIC is invertible by construction.** Every layer (the
  substitution table, the checkerboard, the keystream addition) has
  a published inverse and zero entropy beyond the key. Once the
  attacker recognises the cipher, the only secret is the
  chain-addition seed — here, the literal letter sequence of the
  key. Without an additional key-stretching step (the historical VIC
  used a *six-stage* key schedule: passphrase → numeric → chain
  addition → row transposition → column transposition → final stream)
  the cipher is broken by anyone with a copy of the algorithm.
* **The straddling checkerboard is a frequency-defeating trick, not
  a confidentiality primitive.** Mapping the eight most common
  English letters (ETAOIN-SH) to single digits and the rest to two-
  digit codes prefixed by `3`/`6` flattens the digit-frequency
  histogram, which historically made the post-checkerboard ciphertext
  resistant to digit-frequency analysis. Modern attackers use
  contextual constraints (known cleartext, format strings like
  `HASBL{…}`) directly on the recovered letter string, so the
  flattening doesn't help.
* **Chain addition is a linear PRNG.** `seq[n] = (seq[n-2] + seq[n-1])
  mod 10` is Fibonacci-mod-10. Given enough output digits an attacker
  can recover the seed via two linear equations. The historical VIC
  hid this by stacking multiple chain additions with rearrangements
  between them; the present challenge uses a single round and is
  trivially solvable even without the published key.
* **Triple-letter acrostic challenge names are a tell.** When the
  challenge title spells out a cipher's name in capitals
  (`V-ery I-nteresting EnC-ryption` → `VIC`), it is *always* worth
  spending the 30 seconds to look up that cipher. The same trick
  applies to "Despacito" (DES weak key), "Cascadino Chain" (cascade
  XOR), "Head Team" (htonl), etc. — the author is winking at you.

## Files

* [`solve.py`](./solve.py) — argparse-driven solver. Parses the
  `KEY:` and `CIPHERTEXT:` lines out of `output.txt`, regenerates the
  chain-addition keystream from the key, subtracts it from the digit
  string, runs the checkerboard parser (with the `3`/`6` two-digit
  rule), and undoes the SPECIAL_TO_WORD substitution with
  longest-prefix matching. Standard library only.
* [`handout/chall.py`](./handout/chall.py) — original encryptor.
* [`handout/output.txt`](./handout/output.txt) — `KEY:`/
  `CIPHERTEXT:` lines.

## Requirements

Python 3.9+; standard library only.
