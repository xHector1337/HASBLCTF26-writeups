<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/rev/baby-go -->
<!-- (full solve.py and handout/ live there) -->

# baby-go (rev)

| Field    | Value                                                         |
| -------- | ------------------------------------------------------------- |
| Category | rev                                                           |
| Target   | `main` — 2.1 MB Linux x86-64 ELF, statically linked, **not stripped** |
| Build    | Go (debug info preserved → all symbols visible)               |
| Flag     | `HASBL{B4BY_G0L4NG_1111}`                                     |

## Description

A single Linux x86-64 binary, no source, no remote. `file` immediately
gives away the genre:

```
$ file main
ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked,
BuildID[sha1]=…, with debug_info, not stripped
```

A Go program with full debug info — `main.main` is right there with its
real symbol name. There is no anti-debug, no packing, and no runtime key
derivation. The "challenge" is recognising that the constant the program
parades around with isn't being checked against anything — it *is* the
flag.

## TL;DR

`main.main` is a 32-iteration loop that, for each byte of a hard-coded
constant at `.rodata:0x004baf62`, calls

```go
fmt.Fprintf(os.Stdout, "Did you do your homework?!?!?%x!?!\n", byte)
```

The constant is `SEFTQkx7QjRCWV9HMEw0TkdfMTExMX0=` — 32 chars, ends in
`=`, only alphanumerics, classic **base64**. Decoding it:

```
$ python3 -c "import base64; print(base64.b64decode('SEFTQkx7QjRCWV9HMEw0TkdfMTExMX0='))"
b'HASBL{B4BY_G0L4NG_1111}'
```

The challenge name is *baby-go* and the decoded text reads, in leet,
**"BABY GOLANG 1111"**. That's the flag.

```
$ ./solve.py
HASBL{B4BY_G0L4NG_1111}
```

## Recon

### Symbols in plain sight

```
$ r2 -q -c 'aaa; afl~main\.' main
0x004931e0    6 139          sym.main.main
```

(Plus `runtime.main.func1` / `func2`, the standard Go scheduler shims.)

`sym.main.main` is 139 bytes of straight-line code with one short
backedge — no function calls into a "check" routine, no `bytes.Equal`,
nothing the dev tried to hide.

### Disassembly of `main.main`

```nasm
sym.main.main:
  cmp   rsp, [r14+0x10]              ; standard Go stack check
  jbe   .grow                        ;   "
  push  rbp
  mov   rbp, rsp
  sub   rsp, 0x50
  xor   eax, eax                     ; i = 0
  jmp   .check

.body:
  lea   rdx, [0x004baf62]            ; rdx = "SEFT…1MX0="
  movzx edx, byte [rdx + rax]        ; edx = encoded[i]

  lea   r10, [0x0049d620]            ; iface descriptor for uint64
  mov   [rsp+0x40], r10              ;   half of fmt argument tuple

  lea   r10, obj.runtime.staticuint64s ; Go runtime's pre-boxed 0..255
  lea   rdx, [r10 + rdx*8]           ; &staticuint64s[edx]
  mov   [rsp+0x48], rdx              ;   other half of fmt tuple

  mov   rbx, qword [os.Stdout]
  lea   rdx, [rax + 1]
  mov   [rsp+0x38], rdx              ; save i+1
  lea   rax, go:itab.*os.File,io.Writer
  lea   rcx, [0x004bbb32]            ; "Did you do your homework?!?!?%x!?!\n"
  mov   edi, 0x23                    ; len(fmt) = 35
  lea   rsi, [rsp+0x40]              ; argv slice
  mov   r8d, 1                       ; argc = 1
  mov   r9, r8                       ; cap = 1
  call  fmt.Fprintf

  mov   rax, qword [rsp+0x38]        ; i = i+1
.check:
  cmp   rax, 0x20                    ; i < 32?
  jl    .body
  add   rsp, 0x50
  pop   rbp
  ret
```

Two things to notice:

1. **The loop bound is `0x20 = 32`** — the exact length of the encoded
   constant. Whatever's at `0x004baf62`, it's used in full.
2. **The format string is `"Did you do your homework?!?!?%x!?!\n"`** —
   pure stdout decoration. The decoded byte goes through Go's normal
   `interface{}` boxing path (`runtime.staticuint64s` is the integer
   small-value cache; `*uint64 = &staticuint64s[i]` is how `%x` ends up
   with the right value), gets printed in hex, and that's the entire
   "challenge."

So the program prints the *bytes* of the constant, one hex value per
line, while the constant itself — the actual content — is just sitting
in `.rodata`.

### The constant

```
$ r2 -q -c 's 0x004baf62; ps 32' main
SEFTQkx7QjRCWV9HMEw0TkdfMTExMX0=
```

32 characters, only `[A-Za-z0-9+/]`, single `=` terminator → base64-with-
padding. Decoding:

| char | b64 val | bits     | byte |
|------|--------:|----------|-----:|
| `S`  | 18      | `010010` | …    |
| `E`  | 4       | `000100` | `0x48` `H` |
| `F`  | 5       | `000101` | `0x41` `A` |
| `T`  | 19      | `010011` | `0x53` `S` |
| `Q`  | 16      | `010000` | `0x42` `B` |
| `k`  | 36      | `100100` | `0x4C` `L` |
| `x`  | 49      | `110001` | `0x7B` `{` |
| `7`  | 59      | `111011` | `0x42` `B` |
| …    | …       | …        | …    |

```
$ python3 -c "import base64; print(base64.b64decode('SEFTQkx7QjRCWV9HMEw0TkdfMTExMX0='))"
b'HASBL{B4BY_G0L4NG_1111}'
```

## Exploit

Two implementations live in [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/rev/baby-go/solve.py):

* **`--method static`** — walk the ELF program headers, translate the
  hard-coded VA `0x004baf62` to a file offset, read 32 bytes, base64
  decode. Doesn't need a Linux host to execute the binary.
* **`--method grep`** — `re.finditer(rb"[A-Za-z0-9+/]{31}=", elf)`,
  base64-decode each match, return the one that contains `{...}`.

Both print the same flag.

```
$ ./solve.py --method static
HASBL{B4BY_G0L4NG_1111}

$ ./solve.py --method grep
HASBL{B4BY_G0L4NG_1111}
```

## Flag

```
HASBL{B4BY_G0L4NG_1111}
```

Decoded: "BABY GOLANG 1111". Matches the *baby-go* challenge name.

## Defender notes

* **Stripping a Go binary is one flag away** (`go build -ldflags="-s -w"`
  plus `garble` for symbol obfuscation). Leaving full debug info on a
  challenge that's supposed to make the reverser *work* hands them the
  function names. Even `objdump -d` would have been enough to spot
  `main.main` here.
* **Encoding ≠ encryption.** Base64 fools nobody. The character-class
  fingerprint is unmistakable: 32 characters of `[A-Za-z0-9+/]` with a
  `=` pad gets caught by any `strings | grep -E …{31}=` one-liner. If
  the dev had wanted the constant to *look* like noise, even single-byte
  XOR would have hidden it from a casual `strings` pass.
* **The loop is a tell.** A loop that walks a 32-byte buffer one byte
  at a time and only `fmt.Fprintf`s — without comparing against
  anything, without XORing it into another array, without feeding it
  into a hash — is unmistakably a print loop. If the goal was a "real"
  flag check, the loop body should at minimum compare against another
  buffer (`memcmp`, `bytes.Equal`, a constant-time comparison).
* **Build tags / DCE.** A Go program that includes a "homework" string
  but does nothing with the user's input has a dead-code smell. A
  release build with `-trimpath` and dead-code elimination would have
  removed the unused branches; here the dev left the placeholder in,
  making the constant easier to spot.
* **Genuinely "baby" challenges should still hide the answer.** If the
  intent is for first-time reversers to learn `r2` / Ghidra workflow,
  at least obfuscate the literal so they have to *do* the workflow.
  Pure base64 reduces the challenge to a `strings` filter.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/rev/baby-go/solve.py) — argparse-driven solver. Defaults to the
  static ELF-parse path; `--method grep` works on any blob containing
  base64.
* [`handout/main`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/rev/baby-go/handout/main) — original Linux x86-64 Go binary.

## Requirements

Python 3.9+; standard library only.
