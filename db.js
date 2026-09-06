// db.js — اتصال به پایگاه‌داده‌ی PostgreSQL (رایگان روی Render)
// آدرس اتصال از متغیر محیطی DATABASE_URL خونده میشه.

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
    createdAt: Number(row.created_at),
  };
}

function rowToMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    content: row.content,
    createdAt: Number(row.created_at),
  };
}

// ---------- کاربران ----------
async function findUserByUsername(username) {
  const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
  return rowToUser(rows[0]);
}

async function findUserById(id) {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return rowToUser(rows[0]);
}

async function createUser({ username, displayName, passwordHash, avatarColor }) {
  const { rows } = await pool.query(
    `INSERT INTO users (username, display_name, password_hash, avatar_color, created_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [username, displayName, passwordHash, avatarColor, Date.now()]
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

// ---------- پیام‌ها ----------
async function insertMessage({ senderId, receiverId, content }) {
  const { rows } = await pool.query(
    `INSERT INTO messages (sender_id, receiver_id, content, created_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [senderId, receiverId, content, Date.now()]
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
  findUserById,
  createUser,
  listUsersExcept,
  insertMessage,
  getMessagesBetween,
  deleteAccount,
  wipeAll,
};
