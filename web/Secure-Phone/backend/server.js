const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const BASE_DIR = __dirname;
require('dotenv').config({
  path: process.env.DOTENV_PATH || path.join(BASE_DIR, '.env'),
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';

const CONFIG_DIR = path.join(BASE_DIR, 'config');
const DATA_DIR = path.join(BASE_DIR, 'data');
const GALLERY_DIR = path.join(DATA_DIR, 'gallery');

const MAPPING_FILE_RELATIVE = 'mapping.txt';
const MAPPING_FILE_ABS = path.join(CONFIG_DIR, MAPPING_FILE_RELATIVE);

function randomFourDigitCode() {
  const n = crypto.randomInt(0, 10000);
  return String(n).padStart(4, '0');
}

function generateMapping() {
  const codes = new Set();
  while (codes.size < 4) codes.add(randomFourDigitCode());
  const [codeOr, codeAnd, codeEq, codeOne] = [...codes];
  return {
    codeOr,
    codeAnd,
    codeEq,
    codeOne,
  };
}

function ensureFiles(mapping) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(GALLERY_DIR, { recursive: true });

  const mappingContent = `${mapping.codeOr}\n${mapping.codeAnd}\n${mapping.codeEq}\n${mapping.codeOne}\n`;
  fs.writeFileSync(MAPPING_FILE_ABS, mappingContent, 'utf8');

  // Tiny 1x1 JPEGs, generated from a known-safe base64 string.
  // (No copyrighted content.)
  const tinyJpegBase64 =
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8Aqf/Z';

  const photoNames = [
    'photo1.jpg',
    'photo2.jpg',
    'photo3.jpg',
    'photo4.jpg',
    'photo5.jpg',
    'photo6.jpg',
  ];
  for (const name of photoNames) {
    const p = path.join(GALLERY_DIR, name);
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, Buffer.from(tinyJpegBase64, 'base64'));
    }
  }
}

function loadFlag() {
  const envFlag = process.env.FLAG ? String(process.env.FLAG).trim() : '';
  if (envFlag) return envFlag;

  const flagPath = process.env.FLAG_PATH || path.join(BASE_DIR, 'flag.txt');
  try {
    const fileFlag = fs.readFileSync(flagPath, 'utf8').trim();
    if (fileFlag) return fileFlag;
  } catch (e) {
    // Fall through to error below.
  }

  throw new Error(`FLAG not set. Provide FLAG env or create ${flagPath}.`);
}

function initDb() {
  const dbPath = process.env.DB_PATH || path.join(BASE_DIR, 'data.db');
  const db = new Database(dbPath);
  const flag = loadFlag();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      pin TEXT,
      flag TEXT
    );
  `);

  db.prepare(
    'INSERT INTO users (id, pin, flag) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET pin=excluded.pin, flag=excluded.flag'
  ).run('GECERSIZ_SIFRE', flag);

  return db;
}

const mapping = generateMapping();
ensureFiles(mapping);
const db = initDb();

const app = express();
app.set('trust proxy', 1);

app.use(express.json());
app.use(
  session({
    name: 'PHONESESSID',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60,
    },
  })
);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    sessionId: req.sessionID,
    mappingActivated: Boolean(req.session.mappingActivated),
  });
});

app.get('/api/devlogs', (req, res) => {
  const idRaw = req.query.id;
  const id = Number(idRaw);

  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  // "Protected" devlogs: ids 1..5 are forbidden.
  if (id >= 1 && id <= 5) return res.status(403).json({ error: 'Forbidden' });

  // IDOR: id=0 leaks the logs.
  if (id === 0) {
    return res.json([
      {
        from: 'dev_a',
        to: 'dev_b',
        message:
          'New PIN system is active. Mapping combinations are loaded. Did we patch the gallery path traversal bug yet?',
        timestamp: '2024-01-15 03:22:11',
      },
      {
        from: 'dev_b',
        to: 'dev_a',
        message:
          'Not yet. It slipped to the next sprint. /config/mapping.txt will remain accessible until sprint end.',
        timestamp: '2024-01-15 03:25:44',
      },
    ]);
  }

  return res.status(404).json({ error: 'Not found' });
});

app.get('/api/gallery', (req, res) => {
  const file = String(req.query.file || '');

  // Intentional vulnerability: no sanitization.
  const targetPath = path.join(GALLERY_DIR, file);

  // Session activation hook: accessing mapping enables "secure" parsing mode.
  if (file.includes('../') && file.includes('config/mapping.txt')) {
    req.session.mappingActivated = true;
  }

  try {
    const data = fs.readFileSync(targetPath);

    if (targetPath.endsWith('.jpg') || targetPath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (targetPath.endsWith('.txt')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    } else {
      res.setHeader('Content-Type', 'application/octet-stream');
    }

    return res.send(data);
  } catch (e) {
    return res.status(404).send('Not found');
  }
});

function applyNumericMapping(input) {
  let out = String(input);
  out = out.replaceAll(mapping.codeOr, ' OR ');
  out = out.replaceAll(mapping.codeAnd, ' AND ');
  out = out.replaceAll(mapping.codeEq, ' = ');
  out = out.replaceAll(mapping.codeOne, '1');
  return out;
}

function rateLimitCheck(req, input) {
  const s = req.session;
  const now = Date.now();

  if (!s.failedAttempts) s.failedAttempts = 0;
  if (!s.lockUntil) s.lockUntil = 0;

  if (s.lockUntil && now >= s.lockUntil) {
    s.failedAttempts = 0;
    s.lockUntil = 0;
  }

  if (now < s.lockUntil) {
    const seconds = Math.ceil((s.lockUntil - now) / 1000);
    return { blocked: true, status: 429, message: `Too many attempts. Wait ${seconds}s.` };
  }

  const len = String(input).length;
  if (len < 5) return { blocked: false };

  if (s.failedAttempts >= 5) {
    s.lockUntil = now + 30_000;
    return { blocked: true, status: 429, message: 'Too many attempts. Wait 30 seconds.' };
  }

  return { blocked: false };
}

app.post('/api/unlock', (req, res) => {
  const pin = req.body && typeof req.body.pin === 'string' ? req.body.pin : '';

  // Backend-side sanity: keep it digits-only.
  if (!/^[0-9]*$/.test(pin)) {
    return res.status(400).json({ success: false, message: 'Digits 0-9 only' });
  }

  const rl = rateLimitCheck(req, pin);
  if (rl.blocked) return res.status(rl.status).json({ success: false, message: rl.message });

  if (!req.session.mappingActivated) {
    // Literal compare mode: always fails.
    req.session.failedAttempts = (req.session.failedAttempts || 0) + (pin.length >= 5 ? 1 : 0);
    return res.json({ success: false, message: 'Incorrect PIN' });
  }

  const parsedInput = applyNumericMapping(pin);
  const sql = `SELECT flag FROM users WHERE pin = ${parsedInput}`;

  try {
    const row = db.prepare(sql).get();
    if (row && row.flag) {
      req.session.failedAttempts = 0;
      req.session.lockUntil = 0;
      return res.json({ success: true, flag: row.flag });
    }

    req.session.failedAttempts = (req.session.failedAttempts || 0) + (pin.length >= 5 ? 1 : 0);
    return res.json({ success: false, message: 'Incorrect PIN' });
  } catch (err) {
    // Intentional: raw SQLite error message for player feedback.
    return res.status(500).type('text/plain').send(String(err && err.message ? err.message : err));
  }
});

app.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`);
  console.log(`[backend] mapping codes (server-side):`, mapping);
});
