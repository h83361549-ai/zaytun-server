// server.js — هسته اصلی سرور Zaytun
const express = require("express");
const http = require("http");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { Server } = require("socket.io");
const db = require("./db");

const JWT_SECRET = process.env.JWT_SECRET || "zaytun-dev-secret-change-this";
const PORT = process.env.PORT || 4000;

const AVATAR_COLORS = ["#8a9a4a", "#6b7a3a", "#a3b565", "#5c6b32", "#93a15a", "#748040"];
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024; // حداکثر ~6 مگابایت برای هر فایل/عکس/ویدیو

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // برای اجازه دادن به آپلود عکس/فایل base64

// ---------- ایمیل ----------
let mailer = null;
if (process.env.SMTP_EMAIL && process.env.SMTP_APP_PASSWORD) {
  mailer = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_APP_PASSWORD,
    },
  });
}

async function sendResetEmail(to, code) {
  if (!mailer) {
    console.warn("⚠️ SMTP تنظیم نشده، ایمیل ارسال نشد. کد:", code);
    return;
  }
  await mailer.sendMail({
    from: `"Zaytun" <${process.env.SMTP_EMAIL}>`,
    to,
    subject: "کد بازیابی رمز عبور Zaytun",
    text: `کد بازیابی رمز عبورت: ${code}\nاین کد تا ۱۵ دقیقه معتبره.`,
    html: `<div style="font-family:sans-serif;direction:rtl;text-align:right">
      <p>کد بازیابی رمز عبورت:</p>
      <h1 style="letter-spacing:6px">${code}</h1>
      <p>این کد تا ۱۵ دقیقه معتبره. اگه خودت درخواست ندادی، این ایمیل رو نادیده بگیر.</p>
    </div>`,
  });
}

// ---------- کمک‌تابع‌ها ----------
function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    email: u.email,
  };
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
  return (req, res) =>
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: "خطای داخلی سرور" });
    });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

// ---------- ثبت‌نام / ورود ----------
app.post("/api/register", asyncRoute(async (req, res) => {
  const { username, displayName, password, email } = req.body || {};
  if (!username || !password || !displayName || !email) {
    return res.status(400).json({ error: "همه‌ی فیلدها را پر کنید" });
  }
  const cleanUsername = String(username).trim().toLowerCase();
  const cleanEmail = String(email).trim().toLowerCase();
  if (cleanUsername.length < 3) {
    return res.status(400).json({ error: "نام کاربری باید حداقل ۳ حرف باشد" });
  }
  if (!isValidEmail(cleanEmail)) {
    return res.status(400).json({ error: "ایمیل معتبر نیست" });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: "رمز عبور باید حداقل ۴ حرف باشد" });
  }
  if (await db.findUserByUsername(cleanUsername)) {
    return res.status(409).json({ error: "این نام کاربری قبلاً گرفته شده" });
  }
  if (await db.findUserByEmail(cleanEmail)) {
    return res.status(409).json({ error: "این ایمیل قبلاً استفاده شده" });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  const user = await db.createUser({
    username: cleanUsername,
    displayName: String(displayName).trim(),
    passwordHash,
    avatarColor,
    email: cleanEmail,
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

app.get("/api/users", authMiddleware, asyncRoute(async (req, res) => {
  const rows = await db.listUsersExcept(req.user.id);
  res.json({ users: rows.map(publicUser) });
}));

app.get("/api/messages/:otherId", authMiddleware, asyncRoute(async (req, res) => {
  const otherId = Number(req.params.otherId);
  const rows = await db.getMessagesBetween(req.user.id, otherId);
  res.json({ messages: rows });
}));

// ---------- فراموشی رمز عبور ----------
app.post("/api/forgot-password", asyncRoute(async (req, res) => {
  const { email } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();
  const user = await db.findUserByEmail(cleanEmail);
  // برای جلوگیری از فاش شدن این‌که چه ایمیلی ثبت‌نام کرده، همیشه پیام موفقیت می‌دیم
  if (user) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await db.setResetCode(user.id, code, Date.now() + 15 * 60 * 1000);
    try {
      await sendResetEmail(user.email, code);
    } catch (err) {
      console.error("خطا در ارسال ایمیل:", err);
    }
  }
  res.json({ ok: true });
}));

app.post("/api/reset-password", asyncRoute(async (req, res) => {
  const { email, code, newPassword } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();
  const user = await db.findUserByEmail(cleanEmail);
  if (!user || !user.resetCode || user.resetCode !== String(code || "")) {
    return res.status(400).json({ error: "کد وارد شده اشتباه است" });
  }
  if (!user.resetExpires || Date.now() > user.resetExpires) {
    return res.status(400).json({ error: "کد منقضی شده، دوباره درخواست بده" });
  }
  if (String(newPassword || "").length < 4) {
    return res.status(400).json({ error: "رمز عبور باید حداقل ۴ حرف باشد" });
  }
  await db.updatePassword(user.id, bcrypt.hashSync(newPassword, 10));
  await db.clearResetCode(user.id);
  res.json({ ok: true });
}));

// ---------- ویرایش حساب ----------
app.put("/api/account/profile", authMiddleware, asyncRoute(async (req, res) => {
  const { displayName } = req.body || {};
  if (!displayName || !String(displayName).trim()) {
    return res.status(400).json({ error: "نام نمایشی نمی‌تواند خالی باشد" });
  }
  const user = await db.updateDisplayName(req.user.id, String(displayName).trim());
  res.json({ ok: true, user: publicUser(user) });
}));

app.put("/api/account/email", authMiddleware, asyncRoute(async (req, res) => {
  const { newEmail, password } = req.body || {};
  const cleanEmail = String(newEmail || "").trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) {
    return res.status(400).json({ error: "ایمیل معتبر نیست" });
  }
  const user = await db.findUserById(req.user.id);
  if (!bcrypt.compareSync(String(password || ""), user.passwordHash)) {
    return res.status(401).json({ error: "رمز عبور اشتباه است" });
  }
  const existing = await db.findUserByEmail(cleanEmail);
  if (existing && existing.id !== user.id) {
    return res.status(409).json({ error: "این ایمیل قبلاً استفاده شده" });
  }
  await db.updateEmail(user.id, cleanEmail);
  res.json({ ok: true });
}));

app.delete("/api/account", authMiddleware, asyncRoute(async (req, res) => {
  const { password } = req.body || {};
  const user = await db.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: "کاربر پیدا نشد" });
  if (!bcrypt.compareSync(String(password || ""), user.passwordHash)) {
    return res.status(401).json({ error: "رمز عبور اشتباه است" });
  }
  await db.deleteAccount(req.user.id);
  res.json({ ok: true });
}));

app.get("/api/admin/wipe", asyncRoute(async (req, res) => {
  if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) {
    return res.status(403).send("غیرمجاز");
  }
  await db.wipeAll();
  res.send("همه‌ی حساب‌ها و پیام‌ها پاک شدند.");
}));

app.get("/", (_req, res) => res.send("Zaytun server is running."));

// ---------- Socket.io ----------
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 8 * 1024 * 1024 });

const onlineUsers = new Map();

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

  socket.on("dm", async ({ toUserId, content, kind, fileName, mimeType }) => {
    const safeKind = ["text", "image", "video", "file"].includes(kind) ? kind : "text";
    const text = String(content || "");
    if (!text || !toUserId) return;
    if (safeKind !== "text" && text.length > MAX_ATTACHMENT_BYTES * 1.4) {
      socket.emit("dm-error", { message: "حجم فایل خیلی زیاده (حداکثر ۶ مگابایت)." });
      return;
    }
    try {
      const message = await db.insertMessage({
        senderId: socket.userId,
        receiverId: toUserId,
        content: text,
        kind: safeKind,
        fileName: fileName || null,
        mimeType: mimeType || null,
      });
      const targetSocketId = onlineUsers.get(toUserId);
      if (targetSocketId) io.to(targetSocketId).emit("dm", message);
      socket.emit("dm", message);
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
