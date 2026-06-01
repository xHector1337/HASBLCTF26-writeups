<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/rev/DebugMe -->
<!-- (full solve.py and handout/ live there) -->

# DebugMe (rev)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Category | rev                                                            |
| Target   | `DebugMe.exe` — 67 KB Win64 PE32+ console app, **not stripped** |
| Toolchain | MSVC Debug build (PDB path `C:\Users\Terry\Desktop\yks_soru_yazm\rev\DebugMe\x64\Debug\DebugMe.pdb`) |
| Flag     | `HASBL{y0u_d3bugg3d_m3_pr377y_g00d}`                           |

## Description

A small Windows binary whose own startup message reads

```
checking if there's any debuggers...
[-] Attach a debugger! Your goal is debugging me!
```

The story is that the flag is only revealed if a debugger is attached and
manages to navigate three different anti-debug primitives. All three are
real and *would* trap a dynamic-only reverser — but the encrypted flag
bytes and the single-byte key are both static literals embedded in the
worker function, so we never have to run the binary to recover the flag.

## TL;DR

The flag-printing thread (`fcn.140011c00`) starts by initialising a
34-byte stack buffer with thirty-four `mov byte [rbp+disp8], imm8`
instructions at consecutive displacements `rbp+0x08..rbp+0x29`, then
later runs a tight loop

```
xor eax, 0x4A
```

over each byte before `puts`-ing it. Both the cipher bytes and the key
are visible in the disassembly. XOR them together:

```
python3 -c "print(bytes(b^0x4a for b in bytes.fromhex('020b1908063133' \
'7a3f152e79283f2d2d792e1527793a387971537d7d33152d7a7a2e37'.replace('1527793a','15273a38'))).decode())"
# (cleaner, just run solve.py)
```

```
$ ./solve.py
[+] 34 cipher bytes, key=0x4a
HASBL{y0u_d3bugg3d_m3_pr377y_g00d}
```

Leet decode: *"you debugged me pretty good"* — the binary's
self-congratulatory victory message.

## Recon

`file` and a quick `strings` grep do most of the orientation:

```
$ file DebugMe.exe
PE32+ executable (console) x86-64, for MS Windows

$ strings -n 6 DebugMe.exe | grep -iE 'debug|attach|photo|thread|ntdll'
[-] Attach a debugger! Your goal is debugging me!
checking if there's any debuggers...
process photo failed!
malloc failed
Thread failed!
ntdll.dll
NtCreateThreadEx
IsDebuggerPresent
```

`process photo` is MSVC-ese for `Process32First/Process32Next` (the
"Toolhelp32 Snapshot" process-enumeration API). Combined with
`NtCreateThreadEx` from `ntdll.dll`, the silhouette is clear: this
binary scans the process list (looking for `x64dbg.exe`, as it turns
out), uses a low-level thread API to hide work from a debugger, and
checks the PEB directly.

The binary still has all its symbols (the Microsoft Debug build is
recognisable by the `_RTC_*` runtime checks, the `0xCCCCCCCC`
stack-frame fills, and the embedded PDB path).

## Anti-debug primitive #1 — PEB.BeingDebugged

`fcn.1400112da` (called from `main` and from inside the thread) is a
hand-rolled `IsDebuggerPresent` that reads the PEB directly so an API
hook on `kernel32!IsDebuggerPresent` won't catch it:

```nasm
xor rcx, rcx
mov rax, qword [gs:rcx + 0x60]     ; PEB
movzx eax, byte [rax + 2]          ; PEB.BeingDebugged
ret
```

`main`'s control flow:

```nasm
call fcn.1400112da
test eax, eax
jne  0x1400118b0                   ; debugger → continue
lea  rcx, "[-] Attach a debugger! Your goal is debugging me!"
call printf-wrapper
mov  ecx, 1
call ExitProcess                   ; no debugger → game over
```

So *not* running under a debugger short-circuits to the "Attach a
debugger" string and exits. The flag never even gets touched.

## Anti-debug primitive #2 — `push 0; ret` trap

The debugger-attached branch immediately walks into `fcn.1400111cc`,
which forwards to `loc.140012030`:

```nasm
xor eax, eax
push rax              ; pushes 0 on top of the return address
ret                   ; pops 0 → RIP = 0 → AV
```

Called from straight-line code without any guard, this is an
unconditional crash to `RIP=0`. The only way past it at runtime is for
the debugger to (a) catch the AV exception and rewrite RIP, or (b) NOP
the call and step on. The instruction immediately following the call is

```nasm
jmp loc.140011999                  ; dead-code skip
```

— so a debugger that just lets the crash through and lands in the
exception handler doesn't see the real flag flow either; you have to
*not* take that jump, which means actively patching it or single-stepping
into the code that follows.

## Anti-debug primitive #3 — `NtCreateThreadEx` with `HIDE_FROM_DEBUGGER`

The code after the trap-and-jump is the actual flag flow:

```nasm
lea  rcx, "ntdll.dll"
call GetModuleHandleA
lea  rdx, "NtCreateThreadEx"
mov  rcx, <ntdll>
call GetProcAddress

; pushed in the 7th stack slot:
mov  dword [rsp + 0x30], 4         ; THREAD_CREATE_FLAGS_HIDE_FROM_DEBUGGER
lea  rax, [thread_start = 0x1400113de]
mov  [rsp + 0x20], rax
...
call <NtCreateThreadEx>            ; create the worker thread

call WaitForSingleObject
call CloseHandle
```

`0x4` in `NtCreateThreadEx`'s `CreateFlags` is
**`THREAD_CREATE_FLAGS_HIDE_FROM_DEBUGGER`** — Windows will not deliver
debug events for this thread. So `x64dbg`/`WinDbg` see the parent thread
calling `WaitForSingleObject` on a phantom; the worker that actually
prints the flag runs invisibly.

The worker thread `fcn.140011c00`:

1. Re-checks `PEB.BeingDebugged` and exits on `1`. So even though the
   thread is *invisible to the debugger*, it itself will refuse to work
   if a debugger is present. (Combined with primitive #1, the program
   only ever progresses when a debugger is attached to the **main**
   thread *and* the hidden worker manages to slip past its own check —
   tricky to set up live, irrelevant on paper.)
2. Calls `CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS=2, 0)`, walks
   `Process32First/Process32Next`, comparing each process name against
   `x64dbg.exe` (the UTF-16 literal sits in `.rdata` at `0x14001ad28`).
   If found, exit code 5.
3. Re-checks `PEB.BeingDebugged` *again*.
4. If everything clean, runs the decrypt-and-print loop.

## The flag, statically

The thread builds a 34-byte stack buffer with thirty-four
`mov byte [rbp+disp8], imm8` stores, consecutive `disp8` from `0x08` to
`0x29`. In MSVC Debug builds this idiom is unmistakable:

```nasm
mov byte [rbp + 0x08], 0x02        ; C6 45 08 02
mov byte [rbp + 0x09], 0x0B        ; C6 45 09 0B
mov byte [rbp + 0x0A], 0x19        ; C6 45 0A 19
…
mov byte [rbp + 0x29], 0x37        ; C6 45 29 37
mov byte [rbp + 0x2A], 0x00        ; C6 45 2A 00   ← null terminator
```

Pull the third byte of each `C6 45 ? ?` opcode and you have the cipher.
The 34 bytes are

```
02 0B 19 08 06 31 33 7A 3F 15 2E 79 28 3F 2D 2D
79 2E 15 27 79 15 3A 38 79 7D 7D 33 15 2D 7A 7A 2E 37
```

The decrypt loop is just as visible:

```nasm
loop:
  cmp  qword [rbp + 0x88], 0x22       ; 34
  jae  done
  mov  rax, [rbp + 0x88]
  movzx eax, byte [rbp + rax + 8]
  xor  eax, 0x4A                      ; 83 F0 4A — the key
  mov  rcx, [rbp + 0x88]
  mov  [rbp + rcx + 8], al
  inc  qword [rbp + 0x88]
  jmp  loop
done:
  lea  rcx, [rbp + 8]
  call puts
```

XOR each cipher byte with `0x4A`:

```
0x02^0x4A=0x48 'H'   0x0B^0x4A=0x41 'A'   0x19^0x4A=0x53 'S'
0x08^0x4A=0x42 'B'   0x06^0x4A=0x4C 'L'   0x31^0x4A=0x7B '{'
0x33^0x4A=0x79 'y'   0x7A^0x4A=0x30 '0'   0x3F^0x4A=0x75 'u'
0x15^0x4A=0x5F '_'   …                    0x37^0x4A=0x7D '}'
```

```
HASBL{y0u_d3bugg3d_m3_pr377y_g00d}
```

## Exploit

The recovery is twelve characters of Python:

```python
cipher = bytes([0x02,0x0B,0x19,0x08,0x06,0x31,0x33,0x7A,0x3F,0x15,0x2E,0x79,
                0x28,0x3F,0x2D,0x2D,0x79,0x2E,0x15,0x27,0x79,0x15,0x3A,0x38,
                0x79,0x7D,0x7D,0x33,0x15,0x2D,0x7A,0x7A,0x2E,0x37])
print(bytes(b ^ 0x4A for b in cipher).decode())
# HASBL{y0u_d3bugg3d_m3_pr377y_g00d}
```

[`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/rev/DebugMe/solve.py) ships two methods. `--method hardcoded` does
the obvious thing. `--method scan` (the default) goes further — it
greps the PE for the `(?:\xC6\x45..){30,}` opcode run, pulls the 4th
byte of each `mov byte [rbp+disp8], imm8`, and locates the XOR key by
scanning for `\x83\xF0` (`xor eax, imm8`). That way it survives
recompilation as long as the writer keeps the same MSVC Debug-build
shape.

## Flag

```
HASBL{y0u_d3bugg3d_m3_pr377y_g00d}
```

## Defender notes

* **`THREAD_CREATE_FLAGS_HIDE_FROM_DEBUGGER` is real but cosmetic** —
  it stops the debugger from receiving thread-create/exit and module
  load events, but the thread's instructions are *still* in the
  process's address space and *still* visible in static disasm.
  Anything material to the flag (or to a key derivation) that lives
  inside that thread can be reversed without ever attaching.
* **PEB.BeingDebugged is the easiest check to defeat and the easiest
  check to find.** `xor cl, cl; mov [gs:0x60].BeingDebugged, cl` from
  the debugger side neutralises it, and `grep -E "gs:.{0,8}0x60"` in a
  disasm reliably surfaces it. The check has nuisance value only.
* **MSVC Debug builds tell on themselves.** The `0xCC` stack fills,
  `_RTC_CheckEsp`, the C++ runtime-check tables (the `flag\0` /
  `(\0\0\0\0` / `#\0\0\0` blob at `0x14001ac80` is *not* the flag —
  it's the RTC table entry for a stack variable literally named
  `flag`), and the leftover PDB path are all give-aways. Ship a
  release build with `/O2 /GS- /GL` and `-d:` symbols stripped; better
  still, use a constexpr obfuscator or a key-schedule that's at least
  function-call deep so the cipher bytes aren't a single grep away.
* **Single-byte XOR is theatre.** Any sliding XOR over 0..255 would
  have found the key in microseconds; the bytes have low entropy and
  the recovered plaintext is ASCII. If the goal is to make the flag
  unrecoverable without dynamic instrumentation, the cipher needs at
  *least* state (RC4-like) or a key dependent on something the
  attacker can't statically observe (a TPM-derived value, an attestation
  blob, …).
* **The crash-trap-followed-by-skip pattern is well known.** A
  vectored exception handler, an `INT 2D` / `INT 29h`, or a one-shot
  hardware breakpoint would have been more annoying. As written, the
  trap doesn't even affect the static path, since the call itself is
  a dead instruction once you're reading the disasm rather than
  executing it.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/rev/DebugMe/solve.py) — argparse-driven solver. `--method scan`
  (default) scans the PE for the opcode run; `--method hardcoded`
  uses the constants pulled out of the disasm.
* [`handout/DebugMe.exe`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/rev/DebugMe/handout/DebugMe.exe) — original Win64 PE.

## Requirements

Python 3.9+; standard library only.
