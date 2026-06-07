# HASBL CTF Writeup - Arena.exe

| Field | Details |
|-------|---------|
| **Challenge** | Arena.exe |
| **Difficulty** | Medium |
| **Author** | interr (Muhammed Efe Erdoğan) |
| **Hint** | None |
| **Flag** | `HASBL{7his_S33d_Is_S0_Lucky}` |

---

## Solution

When we enter the website, we are greeted by a game menu called Arena.exe. The screen displays "Start" and "Shop" buttons. The gameplay is quite simple: we earn coins by shooting enemies that approach from all directions, and the game progressively gets harder. In the shop, we can purchase various boosts. However, the most critical item here is the Intel File. The Intel File costs 9999 coins in the shop, meaning it is practically impossible to obtain it just by playing the game normally. Therefore, we must find an alternative way to acquire it.

---

## Finding The Vulnerability

When we inspect the source code of the website, the following lines immediately catch our attention:

```
const state = {  
  coins: parseInt(localStorage.getItem('coins') || '0'),  
  highScore: parseInt(localStorage.getItem('highScore') || '0'),  
  levels: JSON.parse(localStorage.getItem('levels') || '{"speed":0,"fire":0,"hint":0}')
};
```

From this code snippet, we learn that the in-game stats are stored directly in the browser's localStorage. By opening the browser console and executing the command localStorage.setItem('coins', 9999), we can easily modify our balance to 9999 coins. Once we buy the item with our modified balance, we uncover the clue written inside the Intel File: "Negative leet as seed"

"Negative leet" implies the number -1337, and we are expected to provide this as a seed. We continue inspecting the website to find out where we can input this seed value. Analyzing the source code a bit further reveals that a seed is randomly generated at the beginning of each session to control the game's randomness. We can clearly observe this behavior by capturing the HTTP requests and responses sent after clicking the "Start" button:

- Request: `{"seed":7187}`
- Response: `{"status":"ok","seed":7187,"message":"Game starting."}`

---

## Exposing The Vulnerability

Since sending a raw, generic request might result in a "Not Allowed" error due to missing browser headers, the most reliable method is to replicate an authentic browser request.

To do this, we open the browser's Developer Tools (F12), navigate to the Network tab, and click the "Start" button in the game. We then locate the outgoing POST request to /api/start, right-click it, and select "Copy as cURL".

This provides us with the exact request structure used by the browser. All that is left to do is modify the payload at the very end, changing the original random seed (e.g., 1092) to our target seed, -1337.

```
curl 'http://websiteUrlHere/api/start' \
  -X POST \
  -H 'User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:151.0) Gecko/20100101 Firefox/151.0' \
  -H 'Accept: */*' \
  -H 'Accept-Language: tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7' \
  -H 'Accept-Encoding: gzip, deflate, br, zstd' \
  -H 'Referer: http://localhost:8080/' \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:8080' \
  -H 'Sec-GPC: 1' \
  -H 'Connection: keep-alive' \
  -H 'Sec-Fetch-Dest: empty' \
  -H 'Sec-Fetch-Mode: cors' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Priority: u=0' \
  --data-raw '{"seed":-1337}'
```

Upon executing this command in the terminal, the server accepts our malicious seed and returns the flag in the response.

---

## Flag

```
HASBL{7his_S33d_Is_S0_Lucky}
```
