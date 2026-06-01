<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/crypto/head-team -->
<!-- (full solve.py and handout/ live there) -->

# head-team (crypto)

| Field    | Value                                                            |
| -------- | ---------------------------------------------------------------- |
| Category | crypto                                                           |
| Handout  | `chall.c` (two-LFSR stream cipher in C) + `flag.enc` (hex-ASCII ciphertext) |
| Build    | `gcc -O2 -o streamlock chall.c`                                  |
| Key      | `0xDEADBEEFCAFEBABE`                                             |
| Flag     | `hasbl{H70NL_15_N07_4LW4Y5_53CUR3}`                              |

## Description

> *Compile with `gcc -O2 -o streamlock chall.c`, key
> `0xDEADBEEFCAFEBABE`.*
> *Flag format is `hasbl{}`.*

```c
// chall.c (trimmed)
#ifdef _WIN32
  #include <winsock2.h>
#else
  #include <arpa/inet.h>
#endif

#define TAPS 0x80200003UL
static uint32_t g_state[2];

static inline uint32_t lfsr_step(uint32_t s) {
    return (s & 1u) ? ((s >> 1) ^ TAPS) : (s >> 1);
}

static uint8_t ks_byte(void) {
    uint8_t out = 0;
    for (int i = 0; i < 8; i++) {
        g_state[0] = lfsr_step(g_state[0]);
        g_state[1] = lfsr_step(g_state[1]);
        out = (uint8_t)((out << 1) | ((g_state[0] ^ g_state[1]) & 1u));
    }
    return out;
}

static void init_cipher(uint64_t key) {
    uint32_t hi = (uint32_t)(key >> 32);
    uint32_t lo = (uint32_t)(key & 0xFFFFFFFFULL);

    g_state[0] = htonl(hi);    // <-- htonl on the HIGH half only
    g_state[1] = lo;           // <-- no htonl on the LOW half
}
```

`flag.enc` is 66 hex characters + newline — 33 raw ciphertext bytes
after `bytes.fromhex(...)`.

## TL;DR

The cipher is symmetric (XOR stream), so the same compiled binary
will decrypt with the same key:

```
$ gcc -O2 -o streamlock chall.c
$ python3 -c 'print(open("flag.enc").read().strip())' | xxd -r -p > /tmp/flag.bin
$ ./streamlock 0xDEADBEEFCAFEBABE /tmp/flag.bin /tmp/flag.dec
$ cat /tmp/flag.dec
hasbl{H70NL_15_N07_4LW4Y5_53CUR3}
```

The puzzle is **noticing the `htonl` asymmetry** — `htonl` is applied
to the high half of the key but not the low half. On a little-endian
host (x86_64 Linux is the intended target), `htonl(0xDEADBEEF) =
0xEFBEADDE`, while `0xCAFEBABE` stays put. Re-implementing the
keystream in Python and matching that byte-swap reproduces the C
binary's output exactly.

```
$ ./solve.py
[+] ciphertext: 33 bytes after hex-decode
hasbl{H70NL_15_N07_4LW4Y5_53CUR3}
```

## Recon

### Step 1 — read the C

Two 32-bit LFSRs in Galois form (`TAPS = 0x80200003`), one byte
emitted per 8 steps. The output bit per step is

```
(g_state[0] ^ g_state[1]) & 1
```

i.e. the LSB of the XOR of both states *after* the step. The byte is
packed **MSB-first** (the first emitted bit is the high bit of the
output byte). `process(fin, fout)` just XORs each input byte with one
keystream byte and writes it.

### Step 2 — the `htonl` asymmetry

`init_cipher` does:

```c
g_state[0] = htonl(hi);    // hi = high 32 bits of key
g_state[1] = lo;           //  lo = low  32 bits of key
```

`htonl` is "host to network long" — it byte-swaps if the host is
little-endian (which `gcc -O2 -o streamlock chall.c` on a Linux x86_64
guest is), or is a no-op on big-endian.

So on the intended target:

```
key       = 0xDEADBEEFCAFEBABE
hi        = 0xDEADBEEF
lo        = 0xCAFEBABE
state[0]  = htonl(0xDEADBEEF) = 0xEFBEADDE
state[1]  = 0xCAFEBABE
```

Only the high half is byte-swapped. That's both the title's
"head-team" hint and the entire challenge — a Python re-implementation
that forgets the `htonl` (or applies it to *both* halves, or no halves)
will produce a different keystream and an incorrect decryption.

### Step 3 — the `.enc` is hex-ASCII

```
$ wc -c flag.enc
67  flag.enc
$ head -c 8 flag.enc
6217af38
```

67 bytes = 66 hex chars + trailing `\n`. 66 / 2 = 33 raw bytes of
actual ciphertext. The author published the cipher's binary output
hex-encoded for safe transport over a text channel — every solver
either pipes through `xxd -r -p` before feeding the binary, or
hex-decodes in Python.

### Step 4 — re-implement and decrypt

```python
import socket  # for htonl

TAPS = 0x80200003
class Cipher:
    def __init__(self, key):
        hi = (key >> 32) & 0xFFFFFFFF
        lo = key & 0xFFFFFFFF
        self.state = [socket.htonl(hi), lo]
    @staticmethod
    def step(s):
        return ((s >> 1) ^ TAPS) & 0xFFFFFFFF if (s & 1) else (s >> 1)
    def kbyte(self):
        out = 0
        for _ in range(8):
            self.state[0] = self.step(self.state[0])
            self.state[1] = self.step(self.state[1])
            out = ((out << 1) | ((self.state[0] ^ self.state[1]) & 1)) & 0xFF
        return out

ct = bytes.fromhex(open("handout/flag.enc").read().strip())
c  = Cipher(0xDEADBEEFCAFEBABE)
pt = bytes(b ^ c.kbyte() for b in ct)
print(pt)
# b'hasbl{H70NL_15_N07_4LW4Y5_53CUR3}'
```

### Step 5 — sanity cross-check with the actual binary

Build the C with the published command and decrypt the same input:

```
$ gcc -O2 -o streamlock chall.c
$ python3 -c "open('/tmp/flag.bin','wb').write(bytes.fromhex(open('handout/flag.enc').read().strip()))"
$ ./streamlock 0xDEADBEEFCAFEBABE /tmp/flag.bin /tmp/flag.dec
$ cat /tmp/flag.dec
hasbl{H70NL_15_N07_4LW4Y5_53CUR3}
```

Identical to the Python output. Confirms the keystream model.

## Flag

```
hasbl{H70NL_15_N07_4LW4Y5_53CUR3}
```

*"`htonl` is not always secure"* — the asymmetry is the bug, the
title is the hint, and the flag is the confession.

## Defender notes

* **Endianness asymmetries in key schedules are a classic
  reproducibility bug, not a security feature.** The C code as
  written *will* compile and run on both little- and big-endian
  hosts, but it will produce *different ciphertexts* on the two,
  because `htonl` is a no-op on big-endian. If a CTF tomorrow shipped
  the same binary built for ARM64 BE, the published ciphertext would
  *not* decrypt. The lesson: cipher state initialisation must be
  defined in terms of the byte representation, not host-endian-
  dependent integer fields. `memcpy(state, &key, 8)` after fixing the
  byte order explicitly is the safer pattern.
* **Two 32-bit Galois LFSRs XOR-combined isn't a stream cipher.**
  Both LFSRs have the same `TAPS`, so they're isomorphic; the combined
  output is a single linear function of the joint 64-bit state. Any
  64 keystream bits in a row uniquely determine the entire keystream
  forever — the Berlekamp-Massey attack recovers the state in
  O(L^2) bit-operations where L is the joint state size. For
  comparison, a known-plaintext attack with the 12-byte fixed prefix
  `hasbl{` and the 1-byte closing `}` gives the solver 13×8 = 104
  bits of keystream — already more than enough.
* **Stream ciphers without authentication leak under bit-flip.** XOR
  with the keystream means every bit-flip in the ciphertext is a
  predictable bit-flip in the plaintext. For a CTF this is a feature
  (the solver flips bits to verify the model), but for a real-world
  message it's the reason modern AEAD constructions exist (AES-GCM,
  ChaCha20-Poly1305): authentication is not optional.
* **The "head-team" pun.** "Head" = the high half of the key. "Team"
  =  "host-to-end" / "head-toe-night" / "host endianness vs network
  endianness." The title is pointing at the `htonl` asymmetry the
  whole time — once you see it, every other layer of the challenge
  falls open.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/crypto/head-team/solve.py) — argparse-driven solver. Re-implements
  the two-LFSR Galois keystream in Python, applies `socket.htonl` to
  match the C side's byte-swap on little-endian hosts, hex-decodes
  the `.enc` file, XORs and prints the flag. Standard library only.
* [`handout/chall.c`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/crypto/head-team/handout/chall.c) — original C source.
* [`handout/flag.enc`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/crypto/head-team/handout/flag.enc) — the hex-ASCII
  ciphertext.

## Requirements

Python 3.9+; standard library only. (For the C cross-check: `gcc`.)
