// server.js — هسته اصلی سرور Zaytun
// این سرور باید روی یه سرویس آنلاین (Render, Railway, VPS و ...) اجرا بشه
// تا همه‌ی اعضای گروه از هر جایی بتونن بهش وصل بشن.

const express = require("express");
const http = require("http");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const db = require("./db");

const JWT_SECRET = process.env.JWT_SECRET || "zaytun-dev-secret-change-this";
const PORT = process.env.PORT || 4000;

const AVATAR_COLORS = ["#8a9a4a", "#6b7a3a", "#a3b565", "#5c6b32", "#93a15a", "#748040"];

const app = express();
app.use(cors());
app.use(express.json());

// ---------- کمک‌تابع‌ها ----------
function publicUser(u) {
  return { id: u.id, username: u.username, displayName: u.displayName, avatarColor: u.avatarColor };
}

function makeToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "30d" });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "توکن ارسال نشده" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "توکن نامعتبر است" });
  }
}

function asyncRoute(fn) {
  return (req, res) => fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "خطای داخلی سرور" });
  });
}

// ---------- مسیرهای ثبت‌نام / ورود ----------
app.post("/api/register", asyncRoute(async (req, res) => {
  const { username, displayName, password } = req.body || {};
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: "همه‌ی فیلدها را پر کنید" });
  }
  const cleanUsername = String(username).trim().toLowerCase();
  if (cleanUsername.length < 3) {
    return res.status(400).json({ error: "نام کاربری باید حداقل ۳ حرف باشد" });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: "رمز عبور باید حداقل ۴ حرف باشد" });
  }
  const existing = await db.findUserByUsername(cleanUsername);
  if (existing) {
    return res.status(409).json({ error: "این نام کاربری قبلاً گرفته شده" });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  const user = await db.createUser({
    username: cleanUsername,
    displayName: String(displayName).trim(),
    passwordHash,
    avatarColor,
  });
  return res.json({ ok: true, user: publicUser(user) });
}));

app.post("/api/login", asyncRoute(async (req, res) => {
  const { username, password } = req.body || {};
  const cleanUsername = String(username || "").trim().toLowerCase();
  const user = await db.findUserByUsername(cleanUsername);
  if (!user || !bcrypt.compareSync(String(password || ""), user.passwordHash)) {
    return res.status(401).json({ error: "نام کاربری یا رمز عبور اشتباه است" });
  }
  const token = makeToken(user);
  return res.json({ ok: true, token, user: publicUser(user) });
}));

app.get("/api/me", authMiddleware, asyncRoute(async (req, res) => {
  const user = await db.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: "کاربر پیدا نشد" });
  res.json({ user: publicUser(user) });
}));

// لیست همه‌ی اعضای گروه (به‌جز خود کاربر)
app.get("/api/users", authMiddleware, asyncRoute(async (req, res) => {
  const rows = await db.listUsersExcept(req.user.id);
  res.json({ users: rows.map(publicUser) });
}));

// تاریخچه‌ی پیام بین من و یک کاربر دیگر
app.get("/api/messages/:otherId", authMiddleware, asyncRoute(async (req, res) => {
  const otherId = Number(req.params.otherId);
  const rows = await db.getMessagesBetween(req.user.id, otherId);
  res.json({ messages: rows });
}));

app.get("/", (_req, res) => res.send("Zaytun server is running."));

// ---------- Socket.io ----------
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const onlineUsers = new Map(); // userId -> socketId

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const payload = jwt.verify(token, JWT_SECRET);
    socket.userId = payload.id;
    socket.username = payload.username;
    next();
  } catch {
    next(new Error("توکن نامعتبر"));
  }
});

io.on("connection", (socket) => {
  onlineUsers.set(socket.userId, socket.id);
  io.emit("presence", { userId: socket.userId, online: true });

  socket.on("dm", async ({ toUserId, content }) => {
    const text = String(content || "").trim();
    if (!text || !toUserId) return;
    try {
      const message = await db.insertMessage({
        senderId: socket.userId,
        receiverId: toUserId,
        content: text,
      });
      const targetSocketId = onlineUsers.get(toUserId);
      if (targetSocketId) io.to(targetSocketId).emit("dm", message);
      socket.emit("dm", message); // اکو به فرستنده برای همگام‌سازی
    } catch (err) {
      console.error("خطا در ذخیره پیام:", err);
    }
  });

  socket.on("typing", ({ toUserId }) => {
    const targetSocketId = onlineUsers.get(toUserId);
    if (targetSocketId) io.to(targetSocketId).emit("typing", { fromUserId: socket.userId });
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(socket.userId);
    io.emit("presence", { userId: socket.userId, online: false });
  });

  socket.emit("online-list", Array.from(onlineUsers.keys()));
});

db.init()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`✅ Zaytun server در حال اجرا روی پورت ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ اتصال به پایگاه‌داده ناموفق بود:", err);
    process.exit(1);
  });
