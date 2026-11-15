// Mindmap-API: Anmeldung per Kürzel, Benutzerverwaltung für Admins, Mindmaps pro Benutzer.
// Daten liegen in Netlify Blobs (Store "mindmap").
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// Erstes Admin-Konto. Gilt nur, solange noch kein Benutzer "admin" existiert.
// Nach der ersten Anmeldung muss das Passwort geändert werden.
const BOOT = { kuerzel: "admin", salt: "LNxT8UJ6Cp49DEyHnYXr8w==", hash: "eze4y86gjfTBUvU11lkmJFeTYdjKQ/pKau0SrhUy4aTgxpCTSFExnkiM3outqgHcYrEq1oW68Aasbi630PSRCQ==" };

const TOKEN_DAYS = 30;
const MAX_TREE_BYTES = 1_500_000;
const store = () => getStore({ name: "mindmap", consistency: "strong" });

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const fail = (error, status = 400) => json({ error }, status);

const normK = (k) => String(k ?? "").trim().toLowerCase();
const validK = (k) => /^[a-z0-9][a-z0-9._-]{1,23}$/.test(k);
const validId = (id) => /^[A-Za-z0-9_-]{4,64}$/.test(id);
const SCRYPT = { N: 16384, r: 8, p: 1 };

function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString("base64");
  return { salt, hash: crypto.scryptSync(String(pw), salt, 64, SCRYPT).toString("base64") };
}
function checkPw(pw, rec) {
  if (!rec?.salt || !rec?.hash) return false;
  const h = crypto.scryptSync(String(pw ?? ""), rec.salt, 64, SCRYPT);
  const b = Buffer.from(rec.hash, "base64");
  return b.length === h.length && crypto.timingSafeEqual(b, h);
}
function pwProblem(pw) {
  if (typeof pw !== "string" || pw.length < 8) return "Das Passwort braucht mindestens 8 Zeichen.";
  if (pw.length > 200) return "Das Passwort ist zu lang.";
  return null;
}

async function secret(s) {
  let d = await s.get("meta/secret", { type: "json" });
  if (!d) {
    await s.setJSON("meta/secret", { secret: crypto.randomBytes(32).toString("base64") }, { onlyIfNew: true });
    d = await s.get("meta/secret", { type: "json" });
  }
  return d.secret;
}
async function signToken(s, u) {
  const body = Buffer.from(JSON.stringify({ k: u.kuerzel, v: u.tv || 0, exp: Date.now() + TOKEN_DAYS * 864e5 })).toString("base64url");
  const sig = crypto.createHmac("sha256", await secret(s)).update(body).digest("base64url");
  return `${body}.${sig}`;
}
async function readToken(s, token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const want = crypto.createHmac("sha256", await secret(s)).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
async function currentUser(req, s) {
  const h = req.headers.get("authorization") || "";
  const p = await readToken(s, h.startsWith("Bearer ") ? h.slice(7) : "");
  if (!p || !validK(p.k)) return null;
  const u = await s.get(`users/${p.k}`, { type: "json" });
  if (!u || u.disabled || (u.tv || 0) !== p.v) return null;
  return u;
}
const pub = (u) => ({ kuerzel: u.kuerzel, name: u.name || "", role: u.role, mustChange: !!u.mustChange });

async function body(req) {
  try { return await req.json(); } catch { return {}; }
}
function countNodes(t) {
  let n = 0;
  const walk = (x, d) => { if (d > 60) return; (Array.isArray(x?.children) ? x.children : []).forEach((c) => { n++; walk(c, d + 1); }); };
  walk(t, 0);
  return n;
}
async function listMaps(s, k) {
  const { blobs } = await s.list({ prefix: `maps/${k}/` });
  const metas = await Promise.all(blobs.map(async (b) => {
    const m = await s.getMetadata(b.key);
    const id = b.key.slice(`maps/${k}/`.length);
    return m ? { id, title: m.metadata?.title || "", count: m.metadata?.count || 0, updated: m.metadata?.updated || 0, created: m.metadata?.created || 0 } : null;
  }));
  return metas.filter(Boolean).sort((a, b) => b.updated - a.updated);
}
async function adminCount(s) {
  const { blobs } = await s.list({ prefix: "users/" });
  const us = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return us.filter((u) => u && u.role === "admin" && !u.disabled).length;
}

async function login(req, s) {
  const { kuerzel, password } = await body(req);
  const k = normK(kuerzel);
  const wrong = () => fail("Kürzel oder Passwort ist falsch.", 401);
  if (!validK(k)) return wrong();
  const lock = (await s.get(`lock/${k}`, { type: "json" })) || { n: 0, until: 0 };
  if (lock.until > Date.now()) {
    const min = Math.ceil((lock.until - Date.now()) / 60000);
    return fail(`Zu viele Fehlversuche. Versuche es in ${min} Minute${min === 1 ? "" : "n"} wieder.`, 429);
  }
  let u = await s.get(`users/${k}`, { type: "json" });
  let ok = false;
  if (u) ok = !u.disabled && checkPw(password, u);
  else if (k === BOOT.kuerzel && checkPw(password, BOOT)) {
    u = { kuerzel: k, name: "Administrator", role: "admin", salt: BOOT.salt, hash: BOOT.hash, mustChange: true, tv: 0, created: Date.now() };
    await s.setJSON(`users/${k}`, u, { onlyIfNew: true });
    u = await s.get(`users/${k}`, { type: "json" });
    ok = !!u && checkPw(password, u);
  }
  if (!ok) {
    const n = lock.n + 1;
    await s.setJSON(`lock/${k}`, n >= 8 ? { n: 0, until: Date.now() + 10 * 60000 } : { n, until: 0 });
    return wrong();
  }
  if (lock.n) await s.delete(`lock/${k}`);
  return json({ token: await signToken(s, u), user: pub(u) });
}

export default async (req) => {
  const s = store();
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const m = req.method;
  try {
    if (parts[0] === "login" && m === "POST") return await login(req, s);

    const u = await currentUser(req, s);
    if (!u) return fail("Nicht angemeldet.", 401);
    const k = u.kuerzel;

    if (parts[0] === "me" && m === "GET") return json(pub(u));

    if (parts[0] === "password" && m === "POST") {
      const { oldPassword, newPassword } = await body(req);
      if (!checkPw(oldPassword, u)) return fail("Das bisherige Passwort stimmt nicht.", 403);
      const p = pwProblem(newPassword);
      if (p) return fail(p);
      if (newPassword === oldPassword) return fail("Das neue Passwort muss sich vom bisherigen unterscheiden.");
      const nu = { ...u, ...hashPw(newPassword), mustChange: false, tv: (u.tv || 0) + 1 };
      await s.setJSON(`users/${k}`, nu);
      return json({ token: await signToken(s, nu), user: pub(nu) });
    }

    if (parts[0] === "maps") {
      const id = parts[1];
      if (!id && m === "GET") return json({ maps: await listMaps(s, k) });
      if (!id || !validId(id) || parts.length > 2) return fail("Unbekannte Mindmap.", 404);
      const key = `maps/${k}/${id}`;
      if (m === "GET") {
        const d = await s.get(key, { type: "json" });
        return d ? json(d) : fail("Diese Mindmap gibt es nicht mehr.", 404);
      }
      if (m === "PUT") {
        const raw = await req.text();
        if (raw.length > MAX_TREE_BYTES) return fail("Die Mindmap ist zu gross zum Speichern.", 413);
        let tree;
        try { tree = JSON.parse(raw).tree; } catch { return fail("Ungültige Daten."); }
        if (!tree || typeof tree !== "object" || !Array.isArray(tree.children)) return fail("Ungültige Mindmap.");
        const old = await s.getMetadata(key);
        const now = Date.now();
        const created = old?.metadata?.created || now;
        const title = String(tree.text || "").slice(0, 200);
        await s.setJSON(key, { id, tree, created, updated: now }, { metadata: { title, count: countNodes(tree), created, updated: now } });
        return json({ id, updated: now });
      }
      if (m === "DELETE") { await s.delete(key); return json({ ok: true }); }
    }

    if (parts[0] === "admin" && parts[1] === "users") {
      if (u.role !== "admin") return fail("Nur für Admins.", 403);
      const target = parts[2] ? normK(parts[2]) : null;

      if (!target && m === "GET") {
        const { blobs } = await s.list({ prefix: "users/" });
        const users = (await Promise.all(blobs.map(async (b) => {
          const x = await s.get(b.key, { type: "json" });
          if (!x) return null;
          const { blobs: mb } = await s.list({ prefix: `maps/${x.kuerzel}/` });
          return { ...pub(x), created: x.created || 0, maps: mb.length };
        }))).filter(Boolean).sort((a, b) => a.kuerzel.localeCompare(b.kuerzel));
        return json({ users });
      }
      if (!target && m === "POST") {
        const { kuerzel, name, password, role } = await body(req);
        const nk = normK(kuerzel);
        if (!validK(nk)) return fail("Das Kürzel braucht 2–24 Zeichen: Buchstaben, Zahlen, Punkt, Bindestrich oder Unterstrich.");
        const p = pwProblem(password);
        if (p) return fail(p);
        const rec = { kuerzel: nk, name: String(name || "").trim().slice(0, 80), role: role === "admin" ? "admin" : "user", ...hashPw(password), mustChange: false, tv: 0, created: Date.now() };
        if (await s.get(`users/${nk}`, { type: "json" })) return fail(`Das Kürzel «${nk}» ist schon vergeben.`, 409);
        await s.setJSON(`users/${nk}`, rec);
        return json({ user: pub(rec) }, 201);
      }
      if (target && validK(target)) {
        const t = await s.get(`users/${target}`, { type: "json" });
        if (!t) return fail("Diesen Benutzer gibt es nicht.", 404);
        if (m === "PATCH") {
          const b = await body(req);
          const nu = { ...t };
          if (b.password !== undefined) {
            const p = pwProblem(b.password);
            if (p) return fail(p);
            Object.assign(nu, hashPw(b.password), { tv: (t.tv || 0) + 1, mustChange: false });
          }
          if (b.name !== undefined) nu.name = String(b.name || "").trim().slice(0, 80);
          if (b.role !== undefined) {
            const role = b.role === "admin" ? "admin" : "user";
            if (target === k && role !== "admin") return fail("Du kannst dir die Admin-Rechte nicht selbst entziehen.");
            if (t.role === "admin" && role !== "admin" && (await adminCount(s)) <= 1) return fail("Es muss mindestens einen Admin geben.");
            nu.role = role;
          }
          await s.setJSON(`users/${target}`, nu);
          return json({ user: pub(nu) });
        }
        if (m === "DELETE") {
          if (target === k) return fail("Du kannst dein eigenes Konto nicht löschen.");
          if (t.role === "admin" && (await adminCount(s)) <= 1) return fail("Es muss mindestens einen Admin geben.");
          const { blobs } = await s.list({ prefix: `maps/${target}/` });
          await Promise.all(blobs.map((b) => s.delete(b.key)));
          await s.delete(`users/${target}`);
          await s.delete(`lock/${target}`);
          return json({ ok: true });
        }
      }
    }
    return fail("Nicht gefunden.", 404);
  } catch (e) {
    console.error(e);
    return fail("Serverfehler. Bitte versuche es nochmal.", 500);
  }
};

export const config = { path: "/api/*" };
