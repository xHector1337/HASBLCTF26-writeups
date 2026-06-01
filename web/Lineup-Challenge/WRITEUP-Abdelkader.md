<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/web/lineup-challenge -->
<!-- (full solve.py lives there) -->

# Lineup Challenge (web)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Category | web                                                            |
| URL      | `http://34.77.68.154:10204/` (now offline)                     |
| Server   | Next.js (`X-Powered-By: Next.js`, `x-nextjs-cache: HIT`)       |
| Flag     | `HASBL{7h1s_734m_C4n_W1n_Ch4mp10ns_L34gu3}`                    |

> **Flag note.** The server's `POST /api/submit` returns
> `HASBL{7his_734m_C4n_Win_Ch4mpi0ns_L34gu3}` byte-for-byte on the
> correct lineup, but the CTF platform accepted the heavily-leeted form
> `HASBL{7h1s_734m_C4n_W1n_Ch4mp10ns_L34gu3}` (every `i` → `1`). Both
> spellings are documented below; the leet form is the one that scored.

## Description

A 4-2-3-1 formation pitch with 11 slot IDs (`GK, RB, CB1, CB2, LB, CDM1,
CDM2, CAM, RW, LW, ST`), a static `/players.txt` of 50 candidates
(`NAME,POSITION,AGE,NATIONALITY,CLUB,LEAGUE`), and a single endpoint:

```
POST /api/submit  { "lineup": { "<slot>": "<player name>", … } }
```

The page also advertises five hints (`#1`…`#5`) hidden across the site.
The intended path is to find the hints, narrow the 50-row CSV down to
the unique answer per slot, then submit. Brute force across the
position-matched residual works in seconds.

## TL;DR

```
$ ./solve.py
[+] hints collected from sourcemap / robots.txt / /secret-lineup / X-Hint-5 header
[+] residual search space after hint pruning: 12,960 ordered tuples
[+] correct lineup found on attempt #13 (~1 s with 30 workers)
HASBL{7h1s_734m_C4n_W1n_Ch4mp10ns_L34gu3}
```

Final lineup:

| Pos | Player | Locked by |
|-----|--------|-----------|
| GK   | Wojciech Szczęsny       | HINT #1 (JS sourcemap): "GK is Polish"           |
| RB   | Trent Alexander-Arnold  | HINT #5 (`X-Hint-5:` header): "English + La Liga" |
| CB1  | Virgil van Dijk         | brute force                                      |
| CB2  | William Saliba          | brute force                                      |
| LB   | Theo Hernandez          | brute force                                      |
| CDM1 | Rodri                   | brute force                                      |
| CDM2 | Aurélien Tchouaméni     | brute force                                      |
| CAM  | Florian Wirtz           | HINT #4 (hidden `<span>` on `/secret-lineup`): "German + PL + 23y" |
| RW   | Bukayo Saka             | brute force                                      |
| LW   | Vinicius Jr             | HINT #3 (`/robots.txt` comment): "Brazilian + Spanish club" |
| ST   | Erling Haaland          | brute force                                      |

## Recon

### Step 1 — framework + endpoint

`X-Powered-By: Next.js`, `x-nextjs-cache: HIT`. The home page renders
the pitch; `POST /api/submit` accepts JSON of the form
`{"lineup": {"GK": "...", ...}}`. Partial submissions yield
`"Position GK is empty"` (then `RB`, `CB1`, …) — the validator walks
the slot list in canonical order. All 11 filled returns either
`{"success": true, "flag": "..."}` or `"Incorrect lineup. Keep trying!"`
with no per-position feedback. So you have to commit a full 11-tuple
per request, and the only signal is the binary check.

### Step 2 — hints, 4 of 5 found

* **#5** — set by middleware on *every* response as the `X-Hint-5:`
  header. Plain HTTP-layer side channel; visible on any `curl -I`.
* **#3** — embedded in `/robots.txt` as a `# HINT #3:` comment;
  `Disallow: /secret-lineup` in the same file points at hint #4.
* **#4** — a `<span style="display:none">HINT #4: …</span>` on
  `/secret-lineup` (a Next.js route marked `noindex`).
* **#1** — recovered from the JS sourcemap at
  `/_next/static/chunks/app/page-70f8cfa1836964c8.js.map`. Sourcemaps
  ship in production so the original `src/app/page.js` is readable;
  it contained `/* HINT #1: The Goalkeeper is Polish. */`.
* **#2** — never found despite exhaustive probing (every chunk
  sourcemap, all four HTTP methods on `/api/submit`, the homepage RSC
  payload, the 404 body, build manifests, ETag-decode, raw-socket
  duplicate-header inspection, encoding / header / cookie variants).
  Either hidden in a spot I missed or simply not required — the brute
  force closes the gap.

### Step 3 — hint → CSV row collapse

Reading `/players.txt` and applying each hint as a row filter:

| Hint           | Filter                              | Unique row         |
|----------------|-------------------------------------|--------------------|
| #1 (Polish GK) | `POSITION=GK ∧ NATIONALITY=Poland`  | Wojciech Szczęsny  |
| #5 (English RB in La Liga) | `POSITION=RB ∧ NATIONALITY=England ∧ LEAGUE="La Liga"` | Trent Alexander-Arnold |
| #4 (German CAM, PL, 23)    | `POSITION=CAM ∧ NATIONALITY=Germany ∧ LEAGUE="Premier League" ∧ AGE=23` | Florian Wirtz |
| #3 (Brazilian LW, Spain)   | `POSITION=LW ∧ NATIONALITY=Brazil ∧ CLUB ∈ Spanish clubs` | Vinicius Jr |

Each filter lands on exactly one player — no ambiguity. Raphinha is
Brazilian but registered as RW; that's the LW-vs-RW disambiguation the
hint quietly relies on.

### Step 4 — brute the residual

7 slots remain: `CB1, CB2, LB, CDM1, CDM2, RW, ST`. Candidate pools
after the slot-match filter:

* CB pool of 6 → P(6,2) = 30 ordered (CB1, CB2) pairs
* CDM pool of 4 → P(4,2) = 12 ordered (CDM1, CDM2) pairs
* LB pool of 3
* RW pool of 4
* ST pool of 3

Total: `30 · 12 · 3 · 4 · 3 = 12,960` ordered tuples. With 30
concurrent POSTs the correct one lands in ~1 second (combo 13 in this
run — the obvious "current best XI" guess fires nearly first).

### Step 5 — flag string mismatch

`/api/submit` returns the flag with `i`s intact:

```
HASBL{7his_734m_C4n_Win_Ch4mpi0ns_L34gu3}
```

The CTF platform's expected flag uses `1` for every `i`:

```
HASBL{7h1s_734m_C4n_W1n_Ch4mp10ns_L34gu3}
```

The discrepancy is a server-side typo in the challenge's flag-template
string. Players who copy from the response and paste verbatim fail
submission; players who normalise to the platform's "every-i-is-1"
convention pass.

## Flag

```
HASBL{7h1s_734m_C4n_W1n_Ch4mp10ns_L34gu3}
```

*"This team can win Champions League"* — the elite-XI premise of the
challenge.

## Defender notes

* **Production sourcemaps are a free hint shop.** `next.config.js`
  controls `productionBrowserSourceMaps`; leaving it at the default
  `true` ships your *original source code* (including comments) to
  every visitor. For an app whose security model relies on UI logic
  staying opaque, that's a complete capitulation.
* **HTTP-header hints leak via every byte of every response.** Setting
  `X-Hint-5:` on every route from middleware means the leak survives
  caching, prefetching, and HEAD probes. Once a player runs `curl -I`,
  they've farmed every route's headers in a few seconds.
* **`noindex` is search-engine guidance, not access control.** The
  `/secret-lineup` route had a noindex meta tag but was world-readable.
  Robots.txt's `Disallow:` lines amplify the leak by naming the routes
  you don't want indexed. Robots.txt should be empty (or absent) on
  CTF-style challenges; the only "secret" route guarantee is server-side
  authorisation.
* **Server-side flag strings need a "spelling sanity test."** The flag
  the validator emits must round-trip through the platform's checker.
  A `flag_check.py` that asserts `app_flag == platform_flag` in CI
  catches the `i`-vs-`1` typo before deployment.
* **All-or-nothing validators reveal residual entropy.** Returning only
  `success/fail` after 11 fields is the right move — per-field
  feedback would let an attacker pick off slots one at a time. But
  combined with a 12,960-tuple residual space and an unrate-limited
  endpoint, the binary signal is still trivially exhausted. Pair the
  binary check with rate limiting (or proof-of-work) for that
  defence to actually bite.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/lineup-challenge/solve.py) — argparse-driven solver. Pulls
  `/players.txt`, applies the four hint filters, brute-forces the
  residual 12,960-tuple search space with 30 concurrent workers, prints
  the platform-form flag. Standard library only (`urllib.request`,
  `concurrent.futures`, `csv`).

## Requirements

Python 3.9+; standard library only.
