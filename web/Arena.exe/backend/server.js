require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const SECRET_SEED = -1337;
const TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_TOKENS = 2000;
const validTokens = new Map();

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, expiresAt] of validTokens.entries()) {
    if (expiresAt <= now) validTokens.delete(token);
  }
}

app.post("/api/start", (req, res) => {
  const { seed } = req.body;
  if (seed === undefined || seed === null) return res.status(400).json({ error: "Missing seed" });
  const parsed = parseInt(seed, 10);
  if (isNaN(parsed)) return res.status(400).json({ error: "Invalid seed" });
  if (parsed === SECRET_SEED) {
    return res.json({ status: "flag", flag: process.env.FLAG, message: "You found the secret seed." });
  }
  return res.json({ status: "ok", seed: parsed, message: "Game starting." });
});

app.post("/api/buy-hint", (req, res) => {
  const { coins } = req.body;
  if (coins === undefined || coins === null) return res.status(400).json({ error: "Missing coins" });
  if (parseInt(coins, 10) < 9999) return res.status(403).json({ error: "Not enough coins" });
  cleanupExpiredTokens();
  if (validTokens.size >= MAX_TOKENS) {
    return res.status(503).json({ error: "Token pool full" });
  }
  const token = crypto.randomBytes(32).toString("hex");
  validTokens.set(token, Date.now() + TOKEN_TTL_MS);
  return res.json({ status: "ok", token });
});

app.post("/api/hint", (req, res) => {
  const { token } = req.body;
  cleanupExpiredTokens();
  if (!token || !validTokens.has(token)) {
    return res.status(403).json({ error: "Invalid token" });
  }
  validTokens.delete(token);
  return res.json({ hint: process.env.HINT });
});

app.get("/health", (req, res) => res.json({ status: "up" }));

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
