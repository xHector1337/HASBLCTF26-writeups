# HASBL CTF Writeup - T/I Forum

| Field | Details |
|-------|---------|
| **Challenge** | T/I Forum |
| **Difficulty** | Easy |
| **Author** | interr (Muhammed Efe Erdoğan) |
| **Hint** | None |
| **Flag** | `HASBL{3v3n_4_B4by_C4n_Find_7h47}` |

---

## Solution

When we first enter the website, we are greeted by a forum platform. Upon examining the site structure, we notice that each topic in the forum is hosted on a separate HTML page; however, this doesn't initially lead us anywhere. We also notice some admin-only private topics, which suggests that the flag might be hidden there. After analyzing the general structure, we proceed to log into the website.

---

## Finding The Vulnerability

Since no obvious vulnerabilities are visible on the surface, we perform a directory brute-force attack using Gobuster. The scan yields the following results:

```
/index.html           (Status: 200) [Size: 19128]
/index.html           (Status: 200) [Size: 19128]
/login.html           (Status: 200) [Size: 6612]
/robots.txt           (Status: 200) [Size: 42]
/robots.txt           (Status: 200) [Size: 42]
```

According to the Gobuster results, the robots.txt file is accessible. When we inspect its content, we find the following directive:

```
User-agent: *
Disallow: /secret_page.html
```

This reveals a hidden page: /secret_page.html. Upon navigating to this page, we encounter a string displayed on the screen: **c3VwZXJfc2VjcmV0X2FkbWluXzIwMjY=**

It is quite obvious that this string is Base64 encoded. Once decoded, it reveals the following cleartext secret: **super_secret_admin_2026**

---

## Finding Where to Use the Secret

Our next step is to find where to input this discovered secret. Returning to the website and inspecting the browser cookies, we notice an admin cookie.

Initially, we try changing its value from false to true, but nothing happens. We then consider that the secret we found might be the intended value for this cookie. We replace the cookie's value with our decoded secret (super_secret_admin_2026) and refresh the page (F5). The modification works perfectly, and the flag appears right on the screen.

---

## Flag

```
HASBL{3v3n_4_B4by_C4n_Find_7h47}
```
