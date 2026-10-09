import { URL } from "node:url";
import { connect, isReady, users, wishes, toId, mapWish } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }
function priceOf(value) { const price = Number(value); if (!Number.isFinite(price) || price < 0) return 0; return Math.round(price * 100) / 100; }
function urlOf(value) { const url = String(value || "").trim().slice(0, 200); return /^https?:\/\//i.test(url) ? url : ""; }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname, searchParams } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    const row = await users().findOne({ _id: toId(user.id) });
    if (!row) return sendJson(res, 401, { error: "Usuario no encontrado" });
    return sendJson(res, 200, { user: { id: String(row._id), username: row.username } });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/wishes") {
    const q = String(searchParams.get("q") || "").trim();
    const filter = String(searchParams.get("filter") || "open");
    const query = { userId };
    if (filter === "open") query.bought = false;
    if (filter === "bought") query.bought = true;
    if (q) query.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const rows = await wishes().find(query).sort({ createdAt: -1 }).limit(200).toArray();
    const open = await wishes().find({ userId, bought: false }).toArray();
    return sendJson(res, 200, { wishes: rows.map(mapWish), open: open.length, total: Math.round(open.reduce((sum, row) => sum + row.price, 0) * 100) / 100 });
  }
  if (method === "POST" && pathname === "/api/wishes") {
    const body = await readJson(req);
    const title = String(body.title || "").trim();
    if (!title) return sendJson(res, 400, { error: "El deseo es obligatorio" });
    const result = await wishes().insertOne({ userId, title: title.slice(0, 80), price: priceOf(body.price), url: urlOf(body.url), bought: false, createdAt: new Date() });
    return sendJson(res, 201, { wish: mapWish(await wishes().findOne({ _id: result.insertedId })) });
  }
  const match = pathname.match(/^\/api\/wishes\/([a-fA-F0-9]{24})$/);
  if (match) {
    const id = toId(match[1]);
    const existing = await wishes().findOne({ _id: id, userId });
    if (!existing) return sendJson(res, 404, { error: "Deseo no encontrado" });
    if (method === "PATCH") {
      const body = await readJson(req);
      await wishes().updateOne({ _id: id, userId }, { $set: { bought: body.bought !== undefined ? Boolean(body.bought) : existing.bought, price: body.price !== undefined ? priceOf(body.price) : existing.price } });
      return sendJson(res, 200, { wish: mapWish(await wishes().findOne({ _id: id })) });
    }
    if (method === "DELETE") {
      await wishes().deleteOne({ _id: id, userId });
      return sendEmpty(res, 204);
    }
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Wishlist en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
