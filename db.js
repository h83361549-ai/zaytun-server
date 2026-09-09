
// db.js — اتصال به پایگاه‌داده‌ی PostgreSQL (رایگان روی Render)
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      receiver_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
  `);
  // ستون‌های جدید برای قابلیت‌های تازه — با IF NOT EXISTS رو دیتابیس قدیمی هم بدون خطا اضافه میشن
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires BIGINT;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text';`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name TEXT;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS mime_type TEXT;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, receiver_id);`);
  console.log("🗄️  پایگاه‌داده آماده است.");
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    avatarColor: row.avatar_color,
    email: row.email,
    resetCode: row.reset_code,
    resetExpires: row.reset_expires ? Number(row.reset_expires) : null,
    createdAt: Number(row.created_at),
  };
}

function rowToMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    content: row.content,
    kind: row.kind || "text",
    fileName: row.file_name,
    mimeType: row.mime_type,
    createdAt: Number(row.created_at),
  };
}

// ---------- کاربران ----------
async function findUserByUsername(username) {
  const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
  return rowToUser(rows[0]);
}

async function findUserByEmail(email) {
  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  return rowToUser(rows[0]);
}

async function findUserById(id) {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return rowToUser(rows[0]);
}

async function createUser({ username, displayName, passwordHash, avatarColor, email }) {
  const { rows } = await pool.query(
    `INSERT INTO users (username, display_name, password_hash, avatar_color, email, created_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [username, displayName, passwordHash, avatarColor, email, Date.now()]
  );
  return rowToUser(rows[0]);
}

async function listUsersExcept(userId) {
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE id != $1 ORDER BY display_name",
    [userId]
  );
  return rows.map(rowToUser);
}

async function setResetCode(userId, code, expiresAt) {
  await pool.query("UPDATE users SET reset_code = $1, reset_expires = $2 WHERE id = $3", [
    code,
    expiresAt,
    userId,
  ]);
}

async function clearResetCode(userId) {
  await pool.query("UPDATE users SET reset_code = NULL, reset_expires = NULL WHERE id = $1", [userId]);
}

async function updatePassword(userId, passwordHash) {
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
}

async function updateEmail(userId, email) {
  await pool.query("UPDATE users SET email = $1 WHERE id = $2", [email, userId]);
}

async function updateDisplayName(userId, displayName) {
  const { rows } = await pool.query(
    "UPDATE users SET display_name = $1 WHERE id = $2 RETURNING *",
    [displayName, userId]
  );
  return rowToUser(rows[0]);
}

// ---------- پیام‌ها ----------
async function insertMessage({ senderId, receiverId, content, kind, fileName, mimeType }) {
  const { rows } = await pool.query(
    `INSERT INTO messages (sender_id, receiver_id, content, kind, file_name, mime_type, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [senderId, receiverId, content, kind || "text", fileName || null, mimeType || null, Date.now()]
  );
  return rowToMessage(rows[0]);
}

async function getMessagesBetween(userId, otherId) {
  const { rows } = await pool.query(
    `SELECT * FROM messages
     WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
     ORDER BY created_at ASC LIMIT 200`,
    [userId, otherId]
  );
  return rows.map(rowToMessage);
}

// ---------- حذف ----------
async function deleteAccount(userId) {
  await pool.query("DELETE FROM messages WHERE sender_id = $1 OR receiver_id = $1", [userId]);
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
}

async function wipeAll() {
  await pool.query("TRUNCATE TABLE messages RESTART IDENTITY;");
  await pool.query("TRUNCATE TABLE users RESTART IDENTITY CASCADE;");
}

module.exports = {
  init,
  findUserByUsername,
  findUserByEmail,
  findUserById,
  createUser,
  listUsersExcept,
  setResetCode,
  clearResetCode,
  updatePassword,
  updateEmail,
  updateDisplayName,
  insertMessage,
  getMessagesBetween,
  deleteAccount,
  wipeAll,
};
