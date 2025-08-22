// backend/server.js
import express from "express";
import fs from "fs";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import path from "path";
import multer from "multer";
import { makeSessionMiddleware } from "./redis-session-optional.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);

const USERS_FILE = "./users.json";
const DATA_DIR = "./data";
const UPLOAD_DIR = "./uploads";
const ARCHIVE_SUFFIX = "_archive.json"; // z.B. Technik_archive.json
const CLIENT_ORIGINS = [
  process.env.CLIENT_ORIGIN || "http://localhost:5173",
  "http://localhost:5174",
  "https://checkbellapp.vercel.app",
  "https://checkbellapp.vercel.app/",
];

// Abteilungen für den Scheduler
const ALL_DEPARTMENTS = ["Leitstand", "Technik", "Qualität", "Logistik"];

// ----- Ordner anlegen -----
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
ensureDir(DATA_DIR);
ensureDir(UPLOAD_DIR);

// SECURITY: in production we strongly recommend SESSION_SECRET be set.
// Previously we aborted startup if SESSION_SECRET was missing which causes
// hosted containers to exit. For now we only log a clear warning so the
// app can start; please set SESSION_SECRET in your Render/host environment
// for secure sessions.
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  console.error("WARNING: SESSION_SECRET is NOT set in production. Set process.env.SESSION_SECRET to a strong secret in your host environment.");
}

// ----- CORS / JSON / Sessions -----
// Basic security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin(origin, cb) {
      // Preflight/Server-zu-Server ohne Origin erlauben
      if (!origin) return cb(null, true);
      if (CLIENT_ORIGINS.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-user"],
    exposedHeaders: ["Content-Disposition"],
  })
);

// Rate limiting (global + auth specific)
const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 400 });
app.use(globalLimiter);

const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { message: 'Zu viele Loginversuche, bitte später erneut versuchen' } });

// JSON-Parser
app.use(bodyParser.json());

// Sessions (MemoryStore für Dev oder Redis wenn REDIS_URL gesetzt)
// makeSessionMiddleware is async (per redis-session-optional.js). Use top-level await
// to initialize it and provide a clear in-memory fallback on any error.
try {
  const sessionMiddleware = await makeSessionMiddleware();
  app.use(sessionMiddleware);
} catch (e) {
  console.error('Session middleware initialization failed, falling back to in-memory sessions:', e && e.message ? e.message : e);
  try {
    const mod = await import('express-session');
    const fallback = mod && mod.default ? mod.default : mod;
    app.use(
      fallback({
        secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
          secure: process.env.NODE_ENV === 'production',
        },
      })
    );
  } catch (err) {
    console.error('Failed to initialize fallback session middleware:', err && err.message ? err.message : err);
  }
}

// Static /uploads mit passenden Headern
// Serve uploads but restrict CORS exposure
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    setHeaders: (res, pathFile) => {
      // In prod only allow configured client origin; for dev allow localhost
      const allowed = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
      res.setHeader("Access-Control-Allow-Origin", allowed);
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    },
  })
);

// ----- Multer Upload (15MB, mehrere Felder) -----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname),
});
// Allow only common safe types
const ALLOWED_MIMES = ["image/png", "image/jpeg", "image/jpg", "application/pdf"];
function fileFilter(req, file, cb) {
  if (ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
  return cb(new Error('Ungültiger Dateityp'));
}
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
});

// ----- JSON-Helper -----
function readJSON(filePath) {
  return fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf8"))
    : Array.isArray(filePath) ? [] : ({}); // Fallback ist egal, wir casten unten ohnehin
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ----- In-Process File-Lock (seriell pro Datei) -----
const fileLocks = new Map();
async function withFileLock(filePath, fn) {
  const prev = fileLocks.get(filePath) || Promise.resolve();
  let release;
  const next = new Promise((res) => (release = res));
  fileLocks.set(filePath, prev.then(() => next));
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (fileLocks.get(filePath) === next) fileLocks.delete(filePath);
  }
}

/* =========================
   Benutzer-Helpers / Admin
   ========================= */
function getUsersArray() {
  const arr = readJSON(USERS_FILE);
  return Array.isArray(arr)
    ? arr.map((u) => ({
        ...u,
        isAdmin: !!u.isAdmin,
        mustChangePassword: !!u.mustChangePassword,
      }))
    : [];
}
function saveUsersArray(arr) {
  writeJSON(USERS_FILE, arr);
}

function ensureInitialAdmin() {
  let users = getUsersArray();
  const hasAdmin = users.some((u) => u.isAdmin);
  if (!users.length || !hasAdmin) {
    const username = "admin";
    const defaultPw = process.env.ADMIN_DEFAULT_PASSWORD || "admin123";
    const hashed = bcrypt.hashSync(defaultPw, 10);
    const now = new Date().toISOString();
    const exists = users.find((u) => u.username === username);
    if (!exists) {
      users.push({
        username,
        password: hashed,
        isAdmin: true,
        mustChangePassword: true,
        createdAt: now,
      });
    } else {
      users = users.map((u) =>
        u.username === username
          ? { ...u, isAdmin: true, password: hashed, mustChangePassword: true }
          : u
      );
    }
    saveUsersArray(users);
    console.log(`🔐 Default-Admin bereit: ${username} / ${defaultPw}`);
  }
}
ensureInitialAdmin();

/**
 * Session/Benutzer-Kontext:
 * - bevorzugt Session (req.session.user)
 * - fallback: x-user Header (nur für alte Clients)
 */
app.use((req, res, next) => {
  const users = getUsersArray();
  let current = req.session?.user || null;

  if (!current) {
    const actingUser = String(req.headers["x-user"] || "").trim();
    if (actingUser) {
      const u = users.find((x) => x.username === actingUser);
      if (u) {
        current = {
          username: u.username,
          isAdmin: !!u.isAdmin,
          mustChangePassword: !!u.mustChangePassword,
        };
      }
    }
  }
  req.currentUser = current;
  req._users = users;
  next();
});

function requireAuth(req, res, next) {
  if (!req.currentUser?.username) {
    return res.status(401).json({ message: "Nicht eingeloggt" });
  }
  next();
}
function requireAdmin(req, res, next) {
  if (!req.currentUser?.isAdmin) {
    return res.status(403).json({ message: "Admin erforderlich" });
  }
  next();
}

// Kompatibilität: altes anhangDateiUrl -> anhaenge[]
function normalizeItem(item) {
  const copy = { ...item };
  if (!Array.isArray(copy.notizen)) copy.notizen = [];
  if (!Array.isArray(copy.anhaenge)) {
    copy.anhaenge = [];
    if (copy.anhangDateiUrl) {
      copy.anhaenge.push({
        name: copy.anhangDateiUrl.split("/").pop(),
        url: copy.anhangDateiUrl,
        type: "application/octet-stream",
      });
    }
  }
  return copy;
}
function normalizeList(list) {
  return list.map((x) => normalizeItem(x));
}

// 🔁 Sync: Änderungen von Task zurück in Leitstand-Meldung
async function syncToQuelle(originalId, quelleAbteilung, changes) {
  if (!originalId || !quelleAbteilung) return;
  const pfadQuelle = path.join(DATA_DIR, `${quelleAbteilung}_meldungen.json`);
  await withFileLock(pfadQuelle, async () => {
    if (!fs.existsSync(pfadQuelle)) return;
    const datenQuelle = readJSON(pfadQuelle);
    const qi = datenQuelle.findIndex((t) => String(t.id) === String(originalId));
    if (qi === -1) return;
    const src = datenQuelle[qi];
    datenQuelle[qi] = {
      ...src,
      status: changes.status ?? src.status,
      completed:
        typeof changes.completed === "boolean" ? changes.completed : src.completed,
      completedAt: changes.completedAt ?? src.completedAt,
      erledigtVon: changes.erledigtVon ?? src.erledigtVon,
      beschreibung: changes.beschreibung ?? src.beschreibung,
      notizen: Array.isArray(changes.notizen) ? changes.notizen : src.notizen,
    };
    writeJSON(pfadQuelle, datenQuelle);
  });
}

// ✅ Ping
app.get("/", (req, res) => res.send("✅ Backend läuft!"));

// Health endpoint used by load balancers / hosting health checks
app.get('/api/health', (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'development' });
});

// ============= Auth (Session) =============
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ message: "username und password sind Pflicht" });

  const users = getUsersArray();
  if (users.find((u) => u.username === username)) {
    return res.status(400).json({ message: "Benutzer existiert bereits" });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({
    username,
    password: hashedPassword,
    isAdmin: false,
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  });
  saveUsersArray(users);
  res.json({ message: "Erfolgreich registriert" });
});

app.post("/api/login", authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const users = getUsersArray();
  const user = users.find((u) => u.username === username);
  if (!user) return res.status(401).json({ message: "Benutzer nicht gefunden" });

  const ok = await bcrypt.compare(String(password), user.password);
  if (!ok) return res.status(401).json({ message: "Falsches Passwort" });

  const payload = {
    username: user.username,
    isAdmin: !!user.isAdmin,
    mustChangePassword: !!user.mustChangePassword,
  };
  req.session.user = payload;
  res.json(payload);
});

app.post("/api/logout", (req, res) => {
  req.session?.destroy(() => res.json({ ok: true }));
});

// Wer bin ich?
app.get("/api/users/me", (req, res) => {
  if (!req.currentUser) return res.status(401).json({ message: "Nicht eingeloggt" });
  res.json(req.currentUser);
});

// Online-Users (nur Admin) – Sessions auslesen
app.get("/api/users/online", requireAdmin, (req, res) => {
  const store = req.sessionStore;
  if (!store || typeof store.all !== "function") {
    return res.json({ online: [] });
  }
  store.all((err, sessions) => {
    if (err) return res.status(500).json({ message: "Session-Store Fehler" });
    const set = new Set();
    for (const s of Object.values(sessions || {})) {
      try {
        const sess = typeof s === "string" ? JSON.parse(s) : s;
        const name = sess?.user?.username;
        if (name) set.add(name);
      } catch {}
    }
    res.json({ online: [...set] });
  });
});

/* ============= Admin – Endpunkte ============= */
app.get("/api/users", requireAdmin, (req, res) => {
  const users = req._users.map(
    ({ username, isAdmin, createdAt, mustChangePassword }) => ({
      username,
      isAdmin: !!isAdmin,
      mustChangePassword: !!mustChangePassword,
      createdAt: createdAt || null,
    })
  );
  res.json(users);
});

app.post("/api/users", requireAdmin, async (req, res) => {
  const { username, password, isAdmin } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ message: "username und password sind Pflicht" });

  const users = req._users;
  if (users.find((u) => u.username === username))
    return res.status(400).json({ message: "Benutzer existiert bereits" });

  const hashedPassword = await bcrypt.hash(String(password), 10);
  users.push({
    username,
    password: hashedPassword,
    isAdmin: !!isAdmin,
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  });
  saveUsersArray(users);
  res.json({ username, isAdmin: !!isAdmin, mustChangePassword: true });
});

app.patch("/api/users/:username/password", requireAdmin, async (req, res) => {
  const target = req.params.username;
  const { newPassword } = req.body || {};
  if (!newPassword) return res.status(400).json({ message: "newPassword fehlt" });

  const users = req._users;
  const u = users.find((x) => x.username === target);
  if (!u) return res.status(404).json({ message: "Benutzer nicht gefunden" });

  u.password = await bcrypt.hash(String(newPassword), 10);
  u.mustChangePassword = true;
  saveUsersArray(users);
  res.json({ ok: true, mustChangePassword: true });
});

app.patch("/api/users/:username/admin", requireAdmin, (req, res) => {
  const target = req.params.username;
  const { isAdmin } = req.body || {};

  const users = req._users;
  const u = users.find((x) => x.username === target);
  if (!u) return res.status(404).json({ message: "Benutzer nicht gefunden" });

  const adminCount = users.filter((x) => x.isAdmin).length;
  if (adminCount <= 1 && u.isAdmin && !isAdmin) {
    return res.status(400).json({ message: "Letzten Admin kann man nicht entfernen" });
  }

  u.isAdmin = !!isAdmin;
  saveUsersArray(users);
  res.json({ username: u.username, isAdmin: !!u.isAdmin });
});

app.delete("/api/users/:username", requireAdmin, (req, res) => {
  const actor = req.currentUser?.username || "";
  const target = req.params.username;

  const users = req._users;
  const idx = users.findIndex((x) => x.username === target);
  if (idx === -1) return res.status(404).json({ message: "Benutzer nicht gefunden" });

  if (users[idx].username === actor)
    return res.status(400).json({ message: "Du kannst dich nicht selbst löschen" });
  const adminCount = users.filter((x) => x.isAdmin).length;
  if (adminCount <= 1 && users[idx].isAdmin) {
    return res.status(400).json({ message: "Letzten Admin kann man nicht löschen" });
  }

  users.splice(idx, 1);
  saveUsersArray(users);
  res.json({ ok: true });
});

app.patch("/api/users/:username/must-change", requireAdmin, (req, res) => {
  const target = req.params.username;
  const { mustChange } = req.body || {};
  const users = req._users;
  const u = users.find((x) => x.username === target);
  if (!u) return res.status(404).json({ message: "Benutzer nicht gefunden" });

  u.mustChangePassword = !!mustChange;
  saveUsersArray(users);
  res.json({ username: u.username, mustChangePassword: u.mustChangePassword });
});

app.patch("/api/users/me/password", requireAuth, async (req, res) => {
  const who = req.currentUser.username;
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword)
    return res.status(400).json({ message: "oldPassword & newPassword sind Pflicht" });

  const users = getUsersArray();
  const me = users.find((u) => u.username === who);
  if (!me) return res.status(404).json({ message: "Benutzer nicht gefunden" });

  const ok = await bcrypt.compare(String(oldPassword), me.password);
  if (!ok) return res.status(401).json({ message: "Altes Passwort falsch" });

  me.password = await bcrypt.hash(String(newPassword), 10);
  me.mustChangePassword = false;
  saveUsersArray(users);

  req.session.user = {
    username: me.username,
    isAdmin: !!me.isAdmin,
    mustChangePassword: false,
  };
  res.json({ ok: true });
});

/* =========================================================
   👤 User Preferences (pro Username)
   ========================================================= */
function canAccessUser(req, targetUsername) {
  return !!req.currentUser &&
    (req.currentUser.isAdmin || req.currentUser.username === targetUsername);
}

function getPrefs(username) {
  const users = getUsersArray();
  const u = users.find((x) => x.username === username);
  if (!u) return { users, index: -1, prefs: null };
  return { users, index: users.indexOf(u), prefs: u.preferences || {} };
}

function mergeScopes(existing = {}, incoming = {}) {
  const out = { ...existing };
  for (const key of Object.keys(incoming)) {
    const val = incoming[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      out[key] = { ...(existing[key] || {}), ...val };
    }
  }
  return out;
}

// GET /api/users/:username/prefs
app.get("/api/users/:username/prefs", requireAuth, (req, res) => {
  const target = req.params.username;
  if (!canAccessUser(req, target)) {
    return res.status(403).json({ message: "Kein Zugriff" });
  }
  const { prefs } = getPrefs(target);
  if (prefs === null) return res.status(404).json({ message: "Benutzer nicht gefunden" });
  return res.json(prefs);
});

// PATCH /api/users/:username/prefs  body: { scope: { ... } }
app.patch("/api/users/:username/prefs", requireAuth, (req, res) => {
  const target = req.params.username;
  if (!canAccessUser(req, target)) {
    return res.status(403).json({ message: "Kein Zugriff" });
  }
  const incoming = req.body || {};
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return res.status(400).json({ message: "Body muss ein Objekt sein" });
  }

  const { users, index, prefs } = getPrefs(target);
  if (index === -1) return res.status(404).json({ message: "Benutzer nicht gefunden" });

  const merged = mergeScopes(prefs || {}, incoming);
  users[index].preferences = merged;
  saveUsersArray(users);
  return res.json(merged);
});

// Komfort-Routen für eigenen User
app.get("/api/users/me/prefs", requireAuth, (req, res) => {
  const target = req.currentUser.username;
  const { prefs } = getPrefs(target);
  if (prefs === null) return res.status(404).json({ message: "Benutzer nicht gefunden" });
  res.json(prefs);
});

app.patch("/api/users/me/prefs", requireAuth, (req, res) => {
  const target = req.currentUser.username;
  const incoming = req.body || {};
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return res.status(400).json({ message: "Body muss ein Objekt sein" });
  }
  const { users, index, prefs } = getPrefs(target);
  if (index === -1) return res.status(404).json({ message: "Benutzer nicht gefunden" });
  const merged = mergeScopes(prefs || {}, incoming);
  users[index].preferences = merged;
  saveUsersArray(users);
  res.json(merged);
});

/* =========================
   Archiv-Helper (mit Locks)
   ========================= */
function archiveFileFor(abteilung) {
  return path.join(DATA_DIR, `${abteilung}${ARCHIVE_SUFFIX}`);
}
async function appendArchive(abteilung, record) {
  const file = archiveFileFor(abteilung);
  await withFileLock(file, async () => {
    const list = readJSON(file);
    list.push(record);
    writeJSON(file, list);
  });
}
async function removeLastArchiveEntry(abteilung, match) {
  const file = archiveFileFor(abteilung);
  return await withFileLock(file, async () => {
    const list = readJSON(file);
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      const same =
        (match.instanceId && r.instanceId === match.instanceId) || r.id === match.id;
      if (same) {
        list.splice(i, 1);
        writeJSON(file, list);
        return true;
      }
    }
    return false;
  });
}

/* =========================================================
   🔁 Wiederkehrende Tasks (Templates)
   ========================================================= */
app.post("/api/:abteilung/recurring/upload", upload.single("anleitung"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Keine Datei hochgeladen" });
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.get("/api/:abteilung/recurring", (req, res) => {
  const file = path.join(DATA_DIR, `${req.params.abteilung}_recurring.json`);
  const list = readJSON(file);
  let changed = false;
  const normalized = list.map((t) => {
    const n = { ...t };
    if (!n.createdAt) {
      n.createdAt = new Date().toISOString();
      changed = true;
    }
    if (!n.createdBy) {
      n.createdBy = "unbekannt";
      changed = true;
    }
    if (n.intervall === "once" && !n.dueDate) n.dueDate = null;
    if (typeof n.vorlaufMin !== "number") {
      n.vorlaufMin = 0;
      changed = true;
    }
    if (typeof n.cooldownHours !== "number") {
      n.cooldownHours = 0;
      changed = true;
    }
    return n;
  });
  if (changed) writeJSON(file, normalized);
  normalized.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json(normalized);
});

app.post("/api/:abteilung/recurring", (req, res) => {
  const { abteilung } = req.params;
  const {
    titel,
    beschreibung,
    zeit,
    intervall, // "daily" | "once"
    dueDate,
    anleitungUrl,
    createdBy,
    vorlaufMin,
    cooldownHours,
  } = req.body;

  if (!titel || !zeit || !intervall) {
    return res
      .status(400)
      .json({ message: "titel, zeit, intervall sind Pflichtfelder" });
  }
  if (intervall === "once" && !dueDate) {
    return res
      .status(400)
      .json({ message: "Bei 'einmalig' ist dueDate (YYYY-MM-DD) Pflicht" });
  }

  const file = path.join(DATA_DIR, `${abteilung}_recurring.json`);
  const list = readJSON(file);

  const num = (v, min = 0, max = 100000) => {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(min, Math.min(max, Math.floor(n)));
    return 0;
  };

  const tpl = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    abteilung,
    titel,
    beschreibung: beschreibung || "",
    zeit,
    intervall,
    dueDate: intervall === "once" ? dueDate || null : null,
    anleitungUrl: anleitungUrl || null,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || "unbekannt",
    vorlaufMin: num(vorlaufMin, 0, 24 * 60),
    cooldownHours: num(cooldownHours, 0, 168),
  };

  list.push(tpl);
  writeJSON(file, list);
  res.json(tpl);
});

app.put("/api/:abteilung/recurring/:id", (req, res) => {
  const { abteilung, id } = req.params;
  const file = path.join(DATA_DIR, `${abteilung}_recurring.json`);
  const list = readJSON(file);
  const i = list.findIndex((t) => t.id === id);
  if (i === -1) return res.status(404).json({ message: "Template nicht gefunden" });

  const num = (v, min = 0, max = 100000) => {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(min, Math.min(max, Math.floor(n)));
    return undefined;
  };

  const next = { ...list[i], ...req.body };
  if (req.body.vorlaufMin !== undefined)
    next.vorlaufMin = num(req.body.vorlaufMin, 0, 24 * 60);
  if (req.body.cooldownHours !== undefined)
    next.cooldownHours = num(req.body.cooldownHours, 0, 168);

  list[i] = next;
  writeJSON(file, list);
  res.json(list[i]);
});

app.delete("/api/:abteilung/recurring/:id", (req, res) => {
  const { abteilung, id } = req.params;
  const file = path.join(DATA_DIR, `${abteilung}_recurring.json`);
  const list = readJSON(file);
  const i = list.findIndex((t) => t.id === id);
  if (i === -1) return res.status(404).json({ message: "Template nicht gefunden" });
  list.splice(i, 1);
  writeJSON(file, list);
  res.json({ message: "Template gelöscht" });
});

// --------- Zeit-/Datum-Helfer ----------
function pad2(n) {
  return n.toString().padStart(2, "0");
}
function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseHM(hm = "00:00") {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm).trim());
  if (!m) return { h: 0, m: 0, total: 0 };
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mi = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return { h, m: mi, total: h * 60 + mi };
}
function getLastCompletionTs(tasks, templateId) {
  let ts = 0;
  for (const t of tasks) {
    if (t.templateId === templateId && t.completed && t.completedAt) {
      const x = new Date(t.completedAt).getTime();
      if (Number.isFinite(x) && x > ts) ts = x;
    }
  }
  return ts || null;
}

async function ensureRecurringInstances(abteilung, opts = { force: false }) {
  const tplFile = path.join(DATA_DIR, `${abteilung}_recurring.json`);
  const tpls = readJSON(tplFile);
  if (!tpls.length) return 0;

  const tasksFile = path.join(DATA_DIR, `${abteilung}_tasks.json`);
  const now = new Date();
  const nowTs = now.getTime();
  const today = todayKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  let created = 0;

  await withFileLock(tasksFile, async () => {
    const tasks = readJSON(tasksFile);

    for (const t of tpls) {
      if (t.intervall === "once") {
        if (t.dueDate !== today) continue;
      } else if (t.intervall !== "daily") {
        continue;
      }

      const lead = Math.max(0, Number(t.vorlaufMin || 0));
      const { total: dueMin } = parseHM(t.zeit || "00:00");
      const allowedFromMin = Math.max(0, dueMin - lead);

      if (!opts.force && nowMin < allowedFromMin) continue;

      const cooldownH = Math.max(0, Number(t.cooldownHours || 0));
      if (!opts.force && cooldownH > 0) {
        const lastDoneTs = getLastCompletionTs(tasks, t.id);
        if (lastDoneTs) {
          const diffH = (nowTs - lastDoneTs) / (1000 * 60 * 60);
          if (diffH < cooldownH) continue;
        }
      }

      const instanceId = `rec_${t.id}_${today}`;
      if (tasks.find((x) => x.instanceId === instanceId)) continue;

      const newTask = normalizeItem({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        instanceId,
        erstelltAm: now.toLocaleString("de-DE"),
        createdAt: now.toISOString(),
        titel: t.titel,
        beschreibung: t.beschreibung || "",
        kategorie: "Betrieb",
        priorität: "mittel",
        status: "offen",
        quelleAbteilung: abteilung,
        zielAbteilung: null,
        completed: false,
        completedAt: null,
        erledigtVon: null,
        anleitungUrl: t.anleitungUrl || null,
        dueDate: `${today} ${t.zeit || "00:00"}`,
        fromRecurring: true,
        templateId: t.id,
        notizen: [],
        anhaenge: [],
      });

      tasks.push(newTask);
      created++;
    }

    if (created) writeJSON(tasksFile, tasks);
  });

  return created;
}

/* =========================================================
   📥 Meldungen / Tasks
   ========================================================= */

// Weiterleiten (Meldung -> Task in Zielabteilung)
app.put("/api/:abteilung/:typ/:idOrIndex/weiterleiten", async (req, res) => {
  const { abteilung, typ, idOrIndex } = req.params;
  const { zielAbteilung } = req.body;
  if (!zielAbteilung) return res.status(400).json({ message: "Zielabteilung fehlt" });

  const pfadQuelle = path.join(DATA_DIR, `${abteilung}_${typ}.json`);
  const zielTyp = typ === "meldungen" ? "tasks" : typ;
  const pfadZiel = path.join(DATA_DIR, `${zielAbteilung}_${zielTyp}.json`);

  if (!fs.existsSync(pfadQuelle)) return res.status(404).json({ message: "Quelle nicht gefunden" });
  const datenQuelle = readJSON(pfadQuelle);

  let i = Number(idOrIndex);
  if (Number.isNaN(i)) i = datenQuelle.findIndex((t) => String(t.id) === String(idOrIndex));
  const aufgabe = datenQuelle[i];
  if (!aufgabe) return res.status(404).json({ message: "Aufgabe nicht gefunden" });

  const kopie = normalizeItem({
    ...aufgabe,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    status: "offen",
    completed: false,
    completedAt: null,
    quelleAbteilung: abteilung,
    zielAbteilung: null,
    originalId: aufgabe.id,
    erstelltAm: new Date().toLocaleString("de-DE"),
    createdAt: new Date().toISOString(),
  });

  await withFileLock(pfadZiel, async () => {
    const datenZiel = readJSON(pfadZiel);
    datenZiel.push(kopie);
    writeJSON(pfadZiel, datenZiel);
  });

  res.json({ message: "Meldung als Task weitergeleitet", task: kopie });
});

// Upload-Felder (Mehrfach + Rückwärtskompatibel)
const uploadFields = upload.fields([
  { name: "anhangDateien", maxCount: 10 },
  { name: "anhangDatei", maxCount: 1 },
]);

// Anlegen (Meldung/Task)
app.post("/api/:abteilung/:typ", uploadFields, async (req, res) => {
  const { abteilung, typ } = req.params;

  let eintrag = {};
  try {
    eintrag = JSON.parse(req.body.eintrag || "{}");
  } catch {
    return res.status(400).json({ message: "Ungültiger 'eintrag'-Body" });
  }

  if (!eintrag.id) {
    eintrag.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  const now = new Date();
  eintrag.erstelltAm = now.toLocaleString("de-DE");
  eintrag.createdAt = now.toISOString();
  eintrag.status = "offen";
  eintrag.quelleAbteilung = abteilung;
  eintrag.completed = false;
  eintrag.completedAt = null;
  if (!Array.isArray(eintrag.notizen)) eintrag.notizen = [];

  const files = [];
  if (req.files?.anhangDateien) files.push(...req.files.anhangDateien);
  if (req.files?.anhangDatei) files.push(...req.files.anhangDatei);
  const anhaenge = files.map((f) => ({
    name: f.originalname,
    url: `/uploads/${f.filename}`,
    type: f.mimetype,
  }));
  if (anhaenge.length) {
    eintrag.anhaenge = anhaenge;
    eintrag.anhangDateiUrl = anhaenge[0].url;
  } else {
    eintrag.anhaenge = [];
  }

  const pfad = path.join(DATA_DIR, `${abteilung}_${typ}.json`);
  if (!fs.existsSync(pfad)) fs.writeFileSync(pfad, "[]");

  await withFileLock(pfad, async () => {
    const daten = readJSON(pfad);
    daten.push(normalizeItem(eintrag));
    writeJSON(pfad, daten);
  });

  res.json({ message: "Eintrag erfolgreich erstellt" });
});

// Abrufen (Status/Tag/Sort) + Materialisierung
app.get("/api/:abteilung/:typ", (req, res) => {
  const { abteilung, typ } = req.params;
  const { day, sort, status } = req.query;

  if (typ === "tasks") ensureRecurringInstances(abteilung);

  const pfad = path.join(DATA_DIR, `${abteilung}_${typ}.json`);
  if (!fs.existsSync(pfad)) return res.json([]);

  let result = normalizeList(readJSON(pfad));

  // Status
  let s = status ? String(status).toLowerCase() : null;
  if (s) {
    result = result.filter((t) => String(t.status || "").toLowerCase() === s);
  }

  // Datumsquelle wählen
  const dateBy =
    (req.query.dateBy === "completed" || req.query.dateBy === "created")
      ? req.query.dateBy
      : (s === "erledigt" ? "completed" : "created");

  const getDate = (item) => {
    return dateBy === "completed"
      ? new Date(item.completedAt || item.createdAt || item.erstelltAm || 0)
      : new Date(item.createdAt || item.erstelltAm || item.completedAt || 0);
  };

  // Tagesfilter
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

  if (day === "today") {
    result = result.filter((i) => {
      const d = getDate(i);
      return d >= startOfDay(now) && d <= endOfDay(now);
    });
  } else if (day === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    result = result.filter((i) => {
      const d = getDate(i);
      return d >= startOfDay(y) && d <= endOfDay(y);
    });
  } else if (day === "last7") {
    const seven = new Date(now);
    seven.setDate(now.getDate() - 6);
    result = result.filter((i) => {
      const d = getDate(i);
      return d >= startOfDay(seven) && d <= endOfDay(now);
    });
  }

  // Sort
  result.sort((a, b) => {
    const da = getDate(a).getTime();
    const db = getDate(b).getTime();
    return sort === "asc" ? da - db : db - da;
  });

  res.json(result);
});

// Löschen
app.delete("/api/:abteilung/:typ/:idOrIndex", async (req, res) => {
  const { abteilung, typ, idOrIndex } = req.params;
  const pfad = path.join(DATA_DIR, `${abteilung}_${typ}.json`);
  if (!fs.existsSync(pfad)) return res.status(404).json({ message: "Datei nicht gefunden" });

  await withFileLock(pfad, async () => {
    const daten = readJSON(pfad);
    let i = /^\d+$/.test(idOrIndex)
      ? Number(idOrIndex)
      : daten.findIndex((t) => String(t.id) === String(idOrIndex));
    if (i < 0 || i >= daten.length)
      return res.status(404).json({ message: "Eintrag nicht gefunden" });
    daten.splice(i, 1);
    writeJSON(pfad, daten);
    res.json({ message: "Eintrag gelöscht" });
  });
});

// Status toggeln (Archiv + Sync)
app.patch("/api/:abteilung/:typ/:idOrIndex/complete", async (req, res) => {
  const { abteilung, typ, idOrIndex } = req.params;
  const { completed, erledigtVon } = req.body;

  const actor =
    (req.currentUser && req.currentUser.username) ||
    String(req.headers["x-user"] || "").trim();

  const pfad = path.join(DATA_DIR, `${abteilung}_${typ}.json`);
  if (!fs.existsSync(pfad)) return res.status(404).json({ message: "Liste nicht gefunden" });

  let task;
  try {
    await withFileLock(pfad, async () => {
      const daten = readJSON(pfad);
      let i = Number(idOrIndex);
      if (Number.isNaN(i)) i = daten.findIndex((t) => String(t.id) === String(idOrIndex));
      if (i < 0 || i >= daten.length) throw new Error("Aufgabe nicht gefunden");

      const t = normalizeItem(daten[i]);
      const nextCompleted = typeof completed === "boolean" ? completed : !Boolean(t.completed);

      t.completed = nextCompleted;
      t.completedAt = nextCompleted ? new Date().toISOString() : null;
      t.status = nextCompleted ? "erledigt" : "offen";

      const finisher = erledigtVon || actor || t.erledigtVon || "unbekannt";
      if (nextCompleted) t.erledigtVon = finisher;

      daten[i] = t;
      writeJSON(pfad, daten);
      task = t;
    });
  } catch (e) {
    return res.status(404).json({ message: e?.message || "Aufgabe nicht gefunden" });
  }

  try {
    if (typ === "tasks" && task.fromRecurring) {
      if (task.completed) {
        await appendArchive(abteilung, {
          id: task.id,
          instanceId: task.instanceId || null,
          templateId: task.templateId || null,
          titel: task.titel,
          beschreibung: task.beschreibung || "",
          quelleAbteilung: task.quelleAbteilung || abteilung,
          dueDate: task.dueDate || null,
          createdAt: task.createdAt || null,
          completedAt: task.completedAt || new Date().toISOString(),
          erledigtVon: task.erledigtVon || null,
          archivedAt: new Date().toISOString(),
          dayKey: new Date().toISOString().slice(0, 10),
        });
      } else {
        await removeLastArchiveEntry(abteilung, {
          instanceId: task.instanceId || null,
          id: task.id,
        });
      }
    }
  } catch (e) {
    console.warn("Archiv-Fehler:", e?.message || e);
  }

  if (typ === "tasks" && task.quelleAbteilung) {
    await syncToQuelle(task.originalId ?? task.id, task.quelleAbteilung, {
      status: task.status,
      completed: task.completed,
      completedAt: task.completedAt,
      erledigtVon: task.erledigtVon,
    });
  }

  res.json(task);
});

// Notiz
app.post("/api/:abteilung/:typ/:idOrIndex/notiz", async (req, res) => {
  const { abteilung, typ, idOrIndex } = req.params;
  const { autor, text } = req.body;
  if (!autor || !text) return res.status(400).json({ message: "Autor oder Text fehlt" });

  const pfad = path.join(DATA_DIR, `${abteilung}_${typ}.json`);
  if (!fs.existsSync(pfad)) return res.status(404).json({ message: "Datei nicht gefunden" });

  let task;
  await withFileLock(pfad, async () => {
    const daten = readJSON(pfad);
    let i = Number(idOrIndex);
    if (Number.isNaN(i)) i = daten.findIndex((t) => String(t.id) === String(idOrIndex));
    if (i < 0 || i >= daten.length) return res.status(404).json({ message: "Eintrag nicht gefunden" });

    const notiz = { autor, text, zeit: new Date().toLocaleString("de-DE") };
    const t = normalizeItem(daten[i]);
    t.notizen.push(notiz);
    daten[i] = t;
    writeJSON(pfad, daten);
    task = t;

    if (typ === "tasks" && t.quelleAbteilung) {
      const pfadQuelle = path.join(DATA_DIR, `${t.quelleAbteilung}_meldungen.json`);
      await withFileLock(pfadQuelle, async () => {
        if (!fs.existsSync(pfadQuelle)) return;
        const dq = readJSON(pfadQuelle);
        const qi = dq.findIndex((x) => String(x.id) === String(t.originalId ?? t.id));
        if (qi !== -1) {
          if (!Array.isArray(dq[qi].notizen)) dq[qi].notizen = [];
          dq[qi].notizen.push(notiz);
          writeJSON(pfadQuelle, dq);
        }
      });
    }
  });

  res.json(task);
});

// Update (append anhaenge)
app.put("/api/:abteilung/:typ/:idOrIndex", uploadFields, async (req, res) => {
  const { abteilung, typ, idOrIndex } = req.params;
  const pfad = path.join(DATA_DIR, `${abteilung}_${typ}.json`);
  if (!fs.existsSync(pfad)) return res.status(404).json({ message: "Datei nicht gefunden" });

  let update = {};
  if (req.is("multipart/form-data")) {
    try {
      update = JSON.parse(req.body.eintrag || "{}");
    } catch {
      return res.status(400).json({ message: "Ungültiger Body" });
    }
  } else {
    update = req.body || {};
  }

  let updated;
  await withFileLock(pfad, async () => {
    const daten = readJSON(pfad);
    let i = Number(idOrIndex);
    if (Number.isNaN(i))
      i = daten.findIndex((t) => String(t.id) === String(idOrIndex));
    if (i < 0 || i >= daten.length)
      return res.status(404).json({ message: "Eintrag nicht gefunden" });

    const before = normalizeItem(daten[i]);
    let after = { ...before, ...update };

    const files = [];
    if (req.files?.anhangDateien) files.push(...req.files.anhangDateien);
    if (req.files?.anhangDatei) files.push(...req.files.anhangDatei);
    const neu = files.map((f) => ({
      name: f.originalname,
      url: `/uploads/${f.filename}`,
      type: f.mimetype,
    }));

    if (!Array.isArray(after.anhaenge)) after.anhaenge = [];
    if (neu.length) after.anhaenge = [...after.anhaenge, ...neu];
    if (after.anhaenge.length > 0) after.anhangDateiUrl = after.anhaenge[0].url;

    daten[i] = normalizeItem(after);
    writeJSON(pfad, daten);
    updated = daten[i];

    if (typ === "tasks" && after.quelleAbteilung) {
      await syncToQuelle(after.originalId ?? after.id, after.quelleAbteilung, {
        beschreibung: after.beschreibung,
      });
    }
  });

  res.json(updated);
});

// Multer-Fehler / Upload error handling
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "Datei zu groß (max. 15 MB)" });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message || "Upload Fehler" });
  }
  if (String(err.message || '').includes('Ungültiger Dateityp')) {
    return res.status(400).json({ message: 'Ungültiger Dateityp. Erlaubt: png,jpg,pdf' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Interner Serverfehler' });
});

/* =========================================================
   ⏰ SERVER-SCHEDULER
   ========================================================= */
async function materializeAll(opts = { force: false }) {
  let total = 0;
  for (const dep of ALL_DEPARTMENTS) {
    total += await ensureRecurringInstances(dep, opts);
  }
  if (total > 0) {
    console.log(
      `🕒 Wiederkehrende Tasks erzeugt: ${total}${opts.force ? " (forced)" : ""}`
    );
  }
}
// Beim Start
materializeAll().catch(console.error);
// Jede Minute
setInterval(() => {
  materializeAll().catch(console.error);
}, 60 * 1000);

// Manueller Trigger
app.post("/api/:abteilung/recurring/materialize-now", async (req, res) => {
  const { abteilung } = req.params;
  const force = String(req.query.force || "").toLowerCase() === "true";
  const count = await ensureRecurringInstances(abteilung, { force });
  res.json({ abteilung, created: count, forced: force });
});

/* =========================================================
   🌱 SEED
   ========================================================= */
function randId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function isoMinusDays(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}
function toDe(d) {
  return d.toLocaleString("de-DE");
}
function buildDemoItems(dep, typ) {
  const cats = ["Betrieb", "Technik", "IT"];
  const prios = ["hoch", "mittel", "niedrig"];
  const out = [];
  for (let i = 0; i < 6; i++) {
    const isDone = i % 3 === 0;
    const d = isoMinusDays(i % 5);
    out.push(
      normalizeItem({
        id: randId(),
        titel: `${typ === "meldungen" ? "Meldung" : "Task"} ${i + 1} – ${dep}`,
        beschreibung: `Beispiel-${typ} #${i + 1} für ${dep}.`,
        kategorie: cats[i % cats.length],
        priorität: prios[i % prios.length],
        erstelltVon: "Seeder",
        erstelltAm: toDe(d),
        createdAt: d.toISOString(),
        status: isDone ? "erledigt" : "offen",
        completed: isDone,
        completedAt: isDone ? d.toISOString() : null,
        quelleAbteilung: dep,
        zielAbteilung: null,
        notizen: [],
        anhaenge: [],
      })
    );
  }
  return out;
}

function seedDepartment(dep, { reset = false } = {}) {
  const tasksFile = path.join(DATA_DIR, `${dep}_tasks.json`);
  const meldFile = path.join(DATA_DIR, `${dep}_meldungen.json`);
  const recFile = path.join(DATA_DIR, `${dep}_recurring.json`);

  if (reset) {
    try { fs.unlinkSync(tasksFile); } catch {}
    try { fs.unlinkSync(meldFile); } catch {}
    try { fs.unlinkSync(recFile); } catch {}
  }

  let tasks = readJSON(tasksFile);
  let melds = readJSON(meldFile);

  if (reset || tasks.length === 0) {
    tasks = buildDemoItems(dep, "tasks");
    writeJSON(tasksFile, tasks);
  }
  if (reset || melds.length === 0) {
    melds = buildDemoItems(dep, "meldungen");
    writeJSON(meldFile, melds);
  }

  let recs = readJSON(recFile);
  if (reset || recs.length === 0) {
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");

    recs = [
      {
        id: randId(),
        abteilung: dep,
        titel: "Tägliche Anlagenrunde",
        beschreibung: "Standardprüfung am Morgen.",
        zeit: "09:00",
        intervall: "daily",
        dueDate: null,
        anleitungUrl: null,
        createdAt: new Date().toISOString(),
        createdBy: "Seeder",
        vorlaufMin: 480,
        cooldownHours: 8,
      },
      {
        id: randId(),
        abteilung: dep,
        titel: "Abend-Checkliste",
        beschreibung: "Täglicher Abschluss vor Schichtende.",
        zeit: "21:00",
        intervall: "daily",
        dueDate: null,
        anleitungUrl: null,
        createdAt: new Date().toISOString(),
        createdBy: "Seeder",
        vorlaufMin: 480,
        cooldownHours: 8,
      },
      {
        id: randId(),
        abteilung: dep,
        titel: "Einmalige Sonderprüfung",
        beschreibung: "Nur morgen fällig.",
        zeit: "10:30",
        intervall: "once",
        dueDate: `${yyyy}-${mm}-${dd}`,
        anleitungUrl: null,
        createdAt: new Date().toISOString(),
        createdBy: "Seeder",
        vorlaufMin: 120,
        cooldownHours: 0,
      },
    ];
    writeJSON(recFile, recs);
  }

  return {
    dep,
    tasksCount: tasks.length,
    meldungenCount: melds.length,
    recurringCount: recs.length,
  };
}

// Seed-Route (GET/POST)
// Seed-Route (GET/POST) - guarded in production
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
  app.all('/api/seed', (req, res) => res.status(403).json({ message: 'Seed route forbidden in production' }));
} else {
  app.all("/api/seed", (req, res) => {
    const reset =
      String(req.query.reset || req.body?.reset || "false").toLowerCase() === "true";
    const force =
      String(req.query.force || req.body?.force || "false").toLowerCase() === "true";

    const summary = [];
    for (const dep of ALL_DEPARTMENTS) {
      summary.push(seedDepartment(dep, { reset }));
      ensureRecurringInstances(dep, { force }).catch(() => {});
    }

    res.json({ ok: true, reset, force, summary });
  });
}

// Server
app.listen(PORT, () => {
  console.log(`✅ Server läuft auf http://localhost:${PORT}`);
});
