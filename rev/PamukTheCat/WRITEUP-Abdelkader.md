<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/rev/PamukTheCat -->
<!-- (full solve.py and handout/ live there) -->

# PamukTheCat (rev)

| Field    | Value                                                                |
| -------- | -------------------------------------------------------------------- |
| Category | rev                                                                  |
| Target   | `nc 34.77.68.154 10103` — Linux x86-64 PIE, stripped, ~14 KB        |
| Flag     | `HASBL{P4MUK_TH3_M4ST3R_H4CK3R}`                                     |

## Description

> Fight alongside with Pamuk, in order to end the homework once and for all...

A little game with a story intro about Pamuk, a cat whose hacker brother
falls asleep at his desk so the cat puts on the magical red hoodie and
takes a shot at the homework. The game has the shape of a JRPG: a
welcome screen, a stats panel, a market, random encounters, and a boss
fight. The flag is read off `./flag.txt` *only* if you beat the boss
("Homework"), and Homework's stats are tuned so that a clean playthrough
with the visible swords doesn't work. There's a hidden menu choice that
fixes the imbalance.

## TL;DR

```
Menu:                       Hidden:
  1  Fight Homework            10  → if (XP >= 18.0 && Coins > 599)
  2  Market                              Player.Damage = 99999
  3  Random enemy           Sword 4? — sword id 5 is sitting in the table
  4  (Exit / give up)         at index 4 with Damage=99999, but its price
                              slot is 0, and the market rejects price==0.
```

1. Market → buy Wooden sword (100c → Damage = 20).
2. Grind ~7–10 random fights, pacing one per ~1.1 s so `srand(time(NULL))`
   reseeds and you don't keep drawing the same enemy.
3. Once `XP >= 18.0` and `Coins > 599`, send `10`. The hidden case in the
   choice switch sets `Player.Damage = 99999`.
4. Send `1`. Pamuk attacks first; 99999 ≥ 9337 (Homework's HP); the boss
   dies before retaliating; `printf("Congratulations… your flag: %s\n", buf)`.

```
$ ./solve.py
=> Homework: You were not bad at all. Here's your flag: HASBL{P4MUK_TH3_M4ST3R_H4CK3R}
```

## Recon

### Player & Enemy structs

Both are 20-byte malloc'd objects (`fcn.00001a4a`). Field layouts
recovered from the printf/fight code:

```c
struct Player {        // [0x4108]
    int32_t  health;   // +0    init 100
    float    xp;       // +4    init 0.0
    uint32_t coins;    // +8    init 150
    uint32_t damage;   // +0xC  init 0
    uint8_t  sword_id; // +0x10 init 0
};

struct Enemy {         // [0x4110] random, [0x4118] Homework
    uint8_t  type;     // +0
    int32_t  health;   // +4
    uint32_t damage;   // +8
    float    xp_reward;// +0xC
    uint32_t coin_rwd; // +0x10
};
```

### Menu dispatch (`fcn.0000167e`)

```nasm
scanf("%u", &choice)
cmp eax, 0xA
je  .cheat                     ; 10 → hidden cheat
ja  .unknown
cmp eax, 3
je  .random_enemy
ja  .unknown
cmp eax, 1
je  .fight_homework
cmp eax, 2
je  .market
jmp .unknown
```

`10` is not on the printed menu, but it's a first-class case in the
switch. That's the giveaway.

### Fight Homework (`choice 1`, gate)

```nasm
movss   xmm0, [Player+4]              ; XP (float)
cvtss2sd xmm1, xmm0                   ; widen to double
movsd   xmm0, qword [.rodata+0x23E8]  ; 0x402F99999999999A == 15.8
comisd  xmm0, xmm1
jb      .open_flag_txt                ; if 15.8 < XP, fight + flag
```

After the gate, `fcn.00001343(Homework)` runs the fight loop; on win,
`./flag.txt` is `open`/`read`/`printf`'d.

### Homework's stats

Inside the player/enemy initialiser (`fcn.00001a4a`):

```nasm
mov dword [Homework + 4],    0x2479      ; HP        = 9337
mov dword [Homework + 8],    0x63        ; Damage    = 99
mov dword [Homework + 0x10], 0x1869F     ; Coin rwd  = 99999
movss [Homework + 0xC], dword [0x23F4]   ; XP reward = float 0x44A72000 = 1337.0
```

99 damage per round, Pamuk has 100 HP. With the best *visible* sword
(Diamond at Damage 250) you'd need ⌈9337/250⌉ = 38 rounds; Homework gets
37 attacks; Pamuk dies after **2**. So the visible swords can't win on
their own. Either you out-damage Homework in one hit, or you stack
some other trick.

### The random enemy table

`fcn.00001251` does `srand(time(NULL)); type = rand() % 4; …` then
populates the enemy from three parallel `.rodata` tables at `0x40D0`,
`0x40E0`, `0x40F0`:

| type | Dmg | XP   | Coins |
|:----:|:---:|:----:|:-----:|
| 0    | 20  | 6.5  | 125   |
| 1    | 15  | 3.5  | 70    |
| 2    | 10  | 4.0  | 85    |
| 3    | 5   | 0.5  | 15    |

Two consequences:

* **Re-seeding every call** means back-to-back fights *in the same
  second* draw the same type. The solver paces with `time.sleep(1.1)`
  to vary the draws.
* **Enemy HP is always 100.** Fixed.

### The fight loop (`fcn.00001343`)

```c
while (1) {
    if (player.health <= 0) { puts("You have lost the fight!"); exit(-1); }
    printf("[!] Pamuk's Health: %%%d\n[!] Pamuk Attacks!\n", player.health);
    enemy.health -= player.damage;
    if (enemy.health <= 0) {                      // WIN
        puts("You have won the fight!");
        player.coins  += enemy.coin_reward;
        player.xp     += enemy.xp_reward;
        player.damage += 3;                       // per-win damage bump
        if (player.health <= 70)        player.health += 30;
        else if (player.health <= 99)   player.health = 100;
        return;
    }
    printf("[!] Enemy's Health: %%%d\n[!] Enemy Attacks!\n", enemy.health);
    player.health -= enemy.damage;
}
```

Pamuk attacks first; the heal is the only mechanism that nudges HP back
up. Importantly, the `<= 70` and `<= 99` branches use sequential `if/
else if`, so:

* finish a fight on 50 HP → `+30` → 80
* finish on 80 HP → not `<= 70` → check 80 `<= 99` → set to **100**

That second branch is the only way to recover *fully*. So you only get
back to 100 HP if you take ≤ 20 damage in the fight (type-3 enemy with
Wooden sword: 4 × 5 = 20).

### The market (`fcn.000014B6`) and the dummy sword

The choice/price/damage tables sit at `0x4080`, `0x4090`, `0x40B0`:

| idx | sword id (`@0x4080+i`) | damage (`@0x4090+i*4`) | price (`@0x40B0+i*4`) |
|:---:|:----------------------:|:----------------------:|:---------------------:|
|  0  | 0                      | 0                      | 0                     |
|  1  | **1**  (Wooden)        | **20**                 | **100**               |
|  2  | **2**  (Iron)          | **40**                 | **200**               |
|  3  | **3**  (Diamond)       | **250**                | **1000**              |
|  4  | **5**  (hidden!)       | **99999**              | **0**                 |

The selection loop iterates `i = 1..4`, comparing each `byte[0x4080+i]`
against the user's input. Index 4 holds **sword id 5** with damage 99999
and price 0 — a dummy that *could* one-shot Homework. But the market
gates the buy with an explicit `if (price == 0) → "Unknown choice!"`,
so naïvely typing `5` at the shop just bounces you out.

This is a misdirection: it tells you the dev *wanted* 99999 to exist;
it just isn't wired to the shop. The 99999 number turns up again in
`Damage[5]` and in the cheat's data slot `[0x40A4]`, which finally
*does* set it on the player.

### The hidden case (`choice 10`)

```nasm
.cheat:
    movss   xmm0, [Player + 4]
    comiss  xmm0, dword [.rodata+0x23F0]  ; float 18.0
    jb      .done                          ; XP < 18 → silently bail
    mov     eax, [Player + 8]
    cmp     eax, 0x257                     ; 599
    jbe     .done                          ; Coins <= 599 → silently bail
    mov     edx, dword [0x40A4]            ; 99999
    mov     [Player + 0xC], edx            ; Player.Damage = 99999
```

Two AND'd conditions, both silent on failure (you just return to the
menu with the same stats). XP ≥ 18.0 is small change in random fights;
Coins > 599 forces you to also grind for money.

## Grinding strategy

Per-fight outcomes with the **Wooden sword (Damage = 20)** vs an
enemy with HP = 100: Pamuk needs ⌈100/20⌉ = **5 hits** to kill, the
enemy gets **4 attacks** in. So Pamuk loses `4 × X` HP per fight, then
heals.

| Enemy type | HP loss | End HP | Heal rule         | HP after win |
|:----------:|:-------:|:------:|:------------------|:------------:|
| 0 (20 dmg) |   80    |  20    | ≤70 → +30         | **50**       |
| 1 (15 dmg) |   60    |  40    | ≤70 → +30         | **70**       |
| 2 (10 dmg) |   40    |  60    | ≤70 → +30         | **90**       |
| 3 (5 dmg)  |   20    |  80    | not ≤70; ≤99 → 100| **100**      |

The trap: from HP = 50 you survive only type 2 / type 3 next; a
follow-up type 0 deals 80 across 4 rounds and the round-5 entry check
finds `HP <= 0` → `exit(-1)`. That's the *only* failure mode the
solver has to handle.

The per-win `damage += 3` bump *seems* helpful but doesn't cut hits
until Damage ≥ 25 (5 → 4 hits) or 34 (4 → 3 hits) or 50 (3 → 2 hits),
so the first ~2 fights are still 5-hitters. After a couple of wins
you're at 26–32 Damage, which trims the danger window a little.

The solver paces ~1.1 s between fights so `srand(time())` reseeds
naturally; expected per-fight XP is `(6.5+3.5+4.0+0.5)/4 ≈ 3.6`, expected
coin reward `~73.75`. So about 5 fights for the XP gate, 8 for the
coin gate — call it 8 on average. We just try until we get lucky on
the sequencing; here's a successful run:

```
fight  1: HP=100 XP=4.0  Coins=135  Dmg=23
fight  2: HP=90  XP=8.0  Coins=220  Dmg=26
fight  3: HP=80  XP=12.0 Coins=305  Dmg=29
fight  4: HP=80  XP=16.0 Coins=390  Dmg=32
fight  5: HP=80  XP=19.5 Coins=460  Dmg=35
fight  6: HP=65  XP=26.0 Coins=585  Dmg=38
fight  7: HP=55  XP=32.5 Coins=710  Dmg=41
after cheat: Dmg=99999
=> Homework: You were not bad at all. Here's your flag: HASBL{P4MUK_TH3_M4ST3R_H4CK3R}
```

## Exploit

The solver in [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/rev/PamukTheCat/solve.py) automates the whole loop and
retries on `"You have lost the fight!"`. End-to-end:

```python
buy_wooden()                                                # cost 100
while xp < 18.0 or coins <= 599:
    fight_random()
    time.sleep(1.1)                                         # vary srand seed
cheat_choice_10()                                           # damage = 99999
fight_homework()                                            # one-shot → flag
```

## Flag

```
HASBL{P4MUK_TH3_M4ST3R_H4CK3R}
```

## Defender notes

* **A "hidden" switch case is the same as "always on."** If choice 10
  isn't supposed to be reachable, it shouldn't be a `je` next to choice
  3 in the dispatch tree. Move secrets behind state changes (e.g. a
  prior fight outcome), not behind menu numbers that don't render. As
  written, it's a 30-second `strings | grep` away.
* **The dummy sword leaks the cheat damage value.** Sword id 5 with
  damage 99999 isn't reachable through the market, but the constant
  `99999 = 0x1869F` shows up in three places: the sword table, the
  Homework's coin reward, and the cheat's source slot. Any one of those
  rings the bell. Use distinct nonces for unrelated subsystems; reusing
  `0x1869F` across them connects the dots for the reverser.
* **Silent failure in the cheat path is good *and* bad.** Returning
  to the menu without an error message means a casual `cat | nc` user
  never trips it, which is fine — but it also means the developer's
  own test of "does it return to the menu?" would pass either way.
  Combined with the price-0 silent-reject in the market (which uses the
  same `"Unknown choice!"` string for at least three orthogonal
  rejection reasons), the program is gaslighting itself.
* **Per-fight `srand(time(NULL))` is a degenerate RNG.** It's
  reproducible (just align to `time()`), batch-correlated, and a
  remote attacker who knows the host's local time gets ~50/50 odds of
  predicting the next enemy. Seed once at boot, or pull from `getrandom`
  / `/dev/urandom`. Resampling the wall clock is a fingerprint, not a
  random source.
* **Health regen with two narrow `if`s is brittle.** The
  `<= 70 → +30` branch can leave the player on 70 HP exactly, and the
  `<= 99 → 100` branch only fires when you finish above 70 — so finishing
  on 70 stays on 70 and the next type-0 fight kills you. A simpler
  `health = min(100, health + max(30, 100 - health))` ladder would
  remove the "stuck at HP 50/70" trap entirely. The current code is
  arithmetically correct but creates surprising states.
* **`9337 HP` plus `99 damage per round` is a math puzzle, not a game
  balance.** If you intend the cheat to be the only path through, mark
  the cheat as such (a secret to find), and leave the visible swords
  tuned to *not* one-shot the boss. Right now Iron and Diamond exist
  but are dominated by either Wooden+grind or the cheat — they don't
  serve any strategic role.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/rev/PamukTheCat/solve.py) — argparse-driven solver. Defaults to
  `nc 34.77.68.154 10103`, with `--attempts`, `--max-fights`, and
  `--fight-spacing` knobs.
* [`handout/main`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/rev/PamukTheCat/handout/main) — original ELF.

## Requirements

Python 3.9+; standard library only.
