// db.js — پایگاه‌داده‌ی ساده روی فایل JSON
// عمداً از هیچ ماژول native (مثل better-sqlite3) استفاده نشده تا رو هر
// ویندوزی بدون نیاز به نصب ابزار کامپایل (Python, Visual Studio Build Tools) کار کنه.

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "zaytun-data.json");

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { users: [], messages: [], nextUserId: 1, nextMessageId: 1 };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    const initial = { users: [], messages: [], nextUserId: 1, nextMessageId: 1 };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---------- کاربران ----------
function findUserByUsername(username) {
  const data = load();
  return data.users.find((u) => u.username === username) || null;
}

function findUserById(id) {
  const data = load();
  return data.users.find((u) => u.id === id) || null;
}

function createUser({ username, displayName, passwordHash, avatarColor }) {
  const data = load();
  const user = {
    id: data.nextUserId++,
    username,
    displayName,
    passwordHash,
    avatarColor,
    createdAt: Date.now(),
  };
  data.users.push(user);
  save(data);
  return user;
}

function listUsersExcept(userId) {
  const data = load();
  return data.users
    .filter((u) => u.id !== userId)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ---------- پیام‌ها ----------
function insertMessage({ senderId, receiverId, content }) {
  const data = load();
  const message = {
    id: data.nextMessageId++,
    senderId,
    receiverId,
    content,
    createdAt: Date.now(),
  };
  data.messages.push(message);
  save(data);
  return message;
}

function getMessagesBetween(userId, otherId) {
  const data = load();
  return data.messages
    .filter(
      (m) =>
        (m.senderId === userId && m.receiverId === otherId) ||
        (m.senderId === otherId && m.receiverId === userId)
    )
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-200);
}

module.exports = {
  findUserByUsername,
  findUserById,
  createUser,
  listUsersExcept,
  insertMessage,
  getMessagesBetween,
};
