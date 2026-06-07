# HASBL CTF Writeup - DTeam

| Field | Details |
|-------|---------|
| **Challenge** | DTeam |
| **Difficulty** | Hard |
| **Author** | interr (Muhammed Efe Erdoğan) |
| **Hint** | This website is a bit forgetful, It processes your identity, looks at it again, and somehow processes it one more time |
| **Flag** | `HASBL{7his_W3bsi73_L00ks_S0_F4mili4r}` |

---

## Solution

Upon entering the site, we are greeted by a store page where we can purchase some "highly original" games. After registering and logging in, we begin our reconnaissance.

We notice a promotional code entry section, but it seems secure against common vulnerabilities. The most intriguing feature of the site is the ability to download a purchase invoice as a PDF. This functionality suggests a potential entry point for an attack.

The PDF invoice includes our "DTeam" username. To test for template injection, we create a new account with the username `{{7*7}}`. Upon checking the generated invoice, we see the value `49` instead of the literal string. This confirms a Server-Side Template Injection (SSTI) vulnerability.

However, we cannot use a standard payload to read `flag.txt` directly through the username, as the registration form enforces a `30-character limit` on the username field.

---

## Finding The Correct Payload

Looking at the invoice download link, we see the endpoint is `/download_invoice`. This gives us an idea: what if we can split the SSTI payload by utilizing URL parameters?

To test this hypothesis, we register a new user with the following name:
`{{request.args.c|safe}}` (This fits within the 30-character limit).

This payload tells the Jinja2 engine to look for a parameter named `c` in the URL and render it. Now, we follow these steps:

- Add a free game to the cart.
- Complete the checkout process.
- Copy the "Download Invoice" link and append our malicious payload to the `c` parameter.

The final URL should look like this:

```
http://<challenge-url>/download_invoice?c={{lipsum.__globals__.os.popen('cat /flag.txt').read()}}
```

After navigating to the modified URL, we open the downloaded PDF. In the customer name section, the flag is successfully rendered.

---

## Flag

```
HASBL{7his_W3bsi73_L00ks_S0_F4mili4r}
```
