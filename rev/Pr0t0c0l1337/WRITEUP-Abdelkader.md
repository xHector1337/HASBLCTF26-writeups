<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/rev/Pr0t0c0l1337 -->
<!-- (full solve.py and handout/ live there) -->

# Pr0t0c0l1337 (rev)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Category | rev                                                            |
| Target   | `nc 34.77.68.154 10102` — Linux x86-64 PIE, stripped, ~14 KB   |
| Flag     | `HASBL{TH3_PR0T0C0L_1337_IS_ACTIVATED}`                        |

## Description

> Activate the Pr0t0c0l1337

The server is a thin nc-style shim around a custom binary that prompts
"Say the magic words:" and reads up to 256 bytes from stdin. Whatever
you say has to satisfy a hand-rolled binary protocol before it'll dispense
the flag. Send the wrong format and you get a printf'd error message;
send the *almost*-right format and you get nothing at all — which makes
this challenge sneakier than it looks.

## TL;DR

The parser at `.text:0x11e5` accepts:

```
offset  length  value          meaning
------  ------  -------------  ---------------------------------------
0       2       52 27          magic header (uint16 LE == 0x2752)
2       144     84 × 144       padding — exactly 0x90 (=144) bytes of \x84
146     4       72 6F 6F 74    keyword "root"     ← NOT "rot"
150     1       cmd            00=pong, 01=msg, 02=exit, 03=flag
```

Hit it with `\x52\x27 + \x84*144 + "root" + \x03`:

```
$ ./solve.py
Congratulations! Here's your flag: HASBL{TH3_PR0T0C0L_1337_IS_ACTIVATED}
```

The challenge title is the giveaway — "activate the **root** protocol."

## Recon

`file` and `strings`:

```
$ file 'main (1)'
ELF 64-bit LSB pie executable, x86-64, dynamically linked, stripped

$ strings -n 6 main
Say the magic words:
Invalid Magic Header: 0x%04x
Invalid payload! j = %d
pong
You're the only person that can help yourself.
./flag.txt
Couldn't open up the flag.txt file. Contact to an administrator!
malloc failed.
Congratulations! Here's your flag: %s
Invalid command!
```

Five distinct response paths — but **only three of them are reached
through the protocol**: `Invalid Magic Header`, `Invalid payload`, and
the success branch (`Congratulations!`). Both `Invalid command!` and
the puts-only handlers (`pong`, `You're the only person...`) are wired
in but reachable only with a valid magic + padding + keyword combo.

### Reading `main` (0x1189)

The actual `main` is tiny:

```c
char *buf = malloc(0x100);
puts("Say the magic words:");
read(0, buf, 0x100);
parse(buf, 0x100);              // always passes 256, not the read return!
```

`parse` (`fcn.000011e5`) is the whole challenge.

### The parser

#### Stage 1 — magic header (uint16 LE)

```nasm
movzx eax, word [rdi]           ; eax = buf[0..2]
mov   word [var_16h], ax
cmp   word [var_16h], 0x2752
je    .ok                       ; matches → continue
;; else
lea   rax, "Invalid Magic Header: 0x%04x\n"
mov   rdi, rax
call  printf
jmp   .return
```

`0x2752` as uint16 LE is bytes `52 27`. Easy to confirm with a 2-byte
probe:

```
$ printf '\x00\x00' | nc -q1 34.77.68.154 10102
Say the magic words:
Invalid Magic Header: 0x0000
```

#### Stage 2 — padding loop (exactly 0x90 bytes of `\x84`)

```nasm
mov   qword [var_10h], 2        ; i = 2 (skip past magic)
mov   dword [var_14h], 0        ; j = 0
jmp   .check

.body:
  mov   al, byte [rdi + var_10h]
  cmp   al, 0x84
  jne   .invalid_payload
  inc   dword [var_14h]
  add   qword [var_10h], 1

.check:
  cmp   qword [var_10h], qword [var_30h]
  jae   .done                   ; off the end → done
  cmp   dword [var_14h], 0x90   ; 0x90 = 144 ✓
  jne   .body
  jmp   .done                   ; counter hit 144 → done

.invalid_payload:
  lea   rax, "Invalid payload! j = %d\n"
  mov   esi, dword [var_14h]
  call  printf
  jmp   .return
```

Two things to notice:

1. **The constant is the full 32-bit immediate 0x00000090** (encoded
   `81 7D EC 90 00 00 00`), not a sign-extended `imm8`. So the loop
   wants `var_14h == 144` — *not* `-112`. Easy mistake to make if
   you eyeball the disasm. A probe confirms:
   ```
   $ printf '\x52\x27%s' "$(python3 -c 'print("\x84"*143 + "X", end="")')" | \
       nc -q1 34.77.68.154 10102
   Say the magic words:
   Invalid payload! j = 143
   ```
   So 143 `\x84` bytes get counted before the 144-th byte fails — i.e.,
   we need 144 `\x84` bytes to make the counter hit `0x90`.

2. **The wrong-padding error tells you exactly how many bytes have been
   accepted** (`j = N`). Free oracle for tuning the count.

#### Stage 3 — the keyword, four bytes (the trap)

After the loop exits with `var_10h = 146`, the parser falls through to
*another* fixed-byte check:

```nasm
mov   al, byte [rdi + 146]      ; cmp al, 0x72  ; 'r'
jne   .silent_fail
mov   al, byte [rdi + 147]      ; cmp al, 0x6F  ; 'o'
jne   .silent_fail
mov   al, byte [rdi + 148]      ; cmp al, 0x6F  ; 'o'  ← second 'o' !
jne   .silent_fail
mov   al, byte [rdi + 149]      ; cmp al, 0x74  ; 't'
jne   .silent_fail
add   qword [var_10h], 1        ; var_10h = 150
jmp   .dispatch
```

**This is the trap.** Four sequential `cmp al, ?` checks for
`'r','o','o','t'`. On a quick read it's natural to see "rot" and stop.
The disasm goes:

```
0x12c8: cmp al, 0x72        ; r
0x12df: cmp al, 0x6F        ; o
0x12f6: cmp al, 0x6F        ; o    ← THIS one is easy to miss
0x130d: cmp al, 0x74        ; t
```

The challenge name (`Pr0t0c0l1337`) and the unspoken UNIX trope ("become
root") are both meant to nudge you toward the right keyword — but only
after you notice the doubled byte.

What makes this nastier than the earlier two stages is that the
keyword-mismatch path **doesn't print anything**:

```nasm
jne 0x1347         ; → 0x1347: nop; jmp .return
```

`.return` is shared with the success path:

```nasm
mov   eax, dword [var_4h]
leave
ret
```

`fcn.000011e5` returns to `main`, `main` returns to glibc, glibc tears
down stdio and exits. No printf, no puts, **no output at all**. To a
solver who's used to error-driven oracles, this looks like the server
"hung up without saying anything," and it's tempting to chalk it up to
TCP/stdio buffering weirdness instead of suspecting the protocol. (I
spent twenty minutes here before re-counting the `cmp` instructions.)

#### Stage 4 — command dispatch

After "root" passes, `var_10h = 150`, and:

```c
var_4h = 0;
cmd = buf[150];
dispatch(cmd);          // fcn.0000148f
```

`dispatch` lazily fills a 4-entry function-pointer table at `.bss:0x4060`
(via `fcn.00001450`) and switches on `cmd`:

```c
switch (cmd) {
  case 0:  call [0x4060];           // 0x1356: puts("pong")
  case 1:  call [0x4068];           // 0x136c: puts("You're the only person…")
  case 2:  call [0x4070];           // glibc exit
  case 3:  call [0x4078];           // 0x1390: print_flag
  default: puts("Invalid command!"); exit(1);
}
```

The flag handler is exactly what you'd expect:

```c
fd = open("./flag.txt", O_RDONLY);
if (fd == -1) { puts("Couldn't open up..."); exit(-1); }
buf = malloc(0x100);
read(fd, buf, 0x100);
printf("Congratulations! Here's your flag: %s\n", buf);
free(buf);
exit(0);
```

So `cmd = 0x03` is the prize.

## Exploit

```python
payload = b"\x52\x27" + b"\x84" * 0x90 + b"root" + b"\x03"
# = 2 + 144 + 4 + 1 = 151 bytes
```

End-to-end, with the response:

```
$ ./solve.py
Congratulations! Here's your flag: HASBL{TH3_PR0T0C0L_1337_IS_ACTIVATED}
```

A subtle property worth noting: `main` calls `read(0, buf, 0x100)` and
then *always* passes `0x100` (not the read return) into `parse`. If
your TCP send doesn't deliver all 151 bytes before `read` returns, the
parser will see your prefix followed by malloc'd-but-uninitialised
memory. In practice 151 bytes fit in a single segment and the server's
`read` returns the full payload, but if you ever see "Invalid payload!
j = N" for an `N` smaller than your padding, that's the symptom.

## Flag

```
HASBL{TH3_PR0T0C0L_1337_IS_ACTIVATED}
```

## Defender notes

* **Silent failure is a footgun, not a feature.** The keyword check has
  no error message — it just returns. From the attacker's perspective
  this looks like a buffering bug, not a protocol bug, so the most
  natural reflex is to start fiddling with `TCP_NODELAY`, `SHUT_WR`
  timing, or `stdbuf` instead of re-reading the parser. If you want to
  hide the keyword, *all* failures need to look the same — including
  the magic-mismatch and bad-padding cases. As it stands, the unequal
  treatment is itself a tell that "you got further but tripped on
  something."
* **The padding/oracle leak.** Printing `j = %d` on a wrong-payload
  byte tells the attacker exactly how many bytes have been accepted so
  far, turning the padding length into a free probe. Either drop the
  index from the error, or — better — refuse to bisect by leaking
  *any* parser-internal state in error messages.
* **`cmp al, imm8` followed by `cmp al, imm8` is human-readable to a
  fault.** The keyword is laid out as four separate compares with
  literal hex bytes (`72`, `6F`, `6F`, `74`). A 4-byte `cmp dword
  [rdi+146], 0x746F6F72` would have been one line instead of four and
  much harder to miscount on the first scroll past. The compiler chose
  the long form because the bytes were written as individual `if
  (b[i++] != 'r') return; if (b[i++] != 'o') return; …` checks — which
  is also why the bug exists in the first place. A tight loop over a
  string constant would have been both shorter and obviously correct.
* **Stripped + PIE + `int main(int, char**)` calling
  `parse(buf, 0x100)`.** `main` always passes the buffer *capacity*,
  not the `read` return. Combined with `malloc` (which doesn't
  zero-initialise), this means the parser is partially operating on
  uninitialised heap memory whenever the client sends fewer than 256
  bytes. Not exploitable here, but a great way to import undefined
  behaviour into your protocol checker by accident — pass `read`'s
  return value, or call `memset` after `malloc`.
* **The function-pointer table is overwritable.** `0x4060..0x4080`
  lives in writable `.bss`; the dispatch table is built on first use
  and then trusted forever after. A WHAT-WHERE primitive would walk
  straight into a one-shot RIP control. With a bigger handler set
  this is the start of a real exploit; here it's just a stylistic
  observation.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/rev/Pr0t0c0l1337/solve.py) — argparse-driven solver. Defaults to
  `cmd = 0x03` against the live remote; `--cmd 0x00` etc. flips the
  dispatch byte if you want to confirm the other handlers.
* [`handout/main`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/rev/Pr0t0c0l1337/handout/main) — the original ELF.

## Requirements

Python 3.9+; standard library only.
