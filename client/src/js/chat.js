const token = localStorage.getItem("zaytun_token");
const me = JSON.parse(localStorage.getItem("zaytun_user") || "null");

if (!token || !me) {
  window.location.href = "login.html";
}

document.getElementById("min").addEventListener("click", () => window.zaytun.minimize());
document.getElementById("close").addEventListener("click", () => window.zaytun.close());

document.getElementById("meAvatar").textContent = initials(me.displayName);
document.getElementById("meAvatar").style.background = me.avatarColor;
document.getElementById("meName").textContent = me.displayName;
document.getElementById("meTag").textContent = "@" + me.username;

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("zaytun_token");
  localStorage.removeItem("zaytun_user");
  window.location.href = "login.html";
});

function initials(name) {
  return String(name).trim().slice(0, 2).toUpperCase();
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
}

let users = [];
let onlineIds = new Set();
let unreadFrom = new Set();
let activeUser = null;
let typingTimeout = null;

const memberList = document.getElementById("memberList");
const messagesEl = document.getElementById("messages");
const chatHeader = document.getElementById("chatHeader");
const chatEmpty = document.getElementById("chatEmpty");
const composer = document.getElementById("composer");
const typingHint = document.getElementById("typingHint");

async function api(path, options = {}) {
  const res = await fetch(`${window.SERVER_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem("zaytun_token");
    window.location.href = "login.html";
    throw new Error("unauthorized");
  }
  return res.json();
}

function renderMembers() {
  memberList.innerHTML = "";
  users.forEach((u) => {
    const row = document.createElement("div");
    row.className = "member" + (activeUser && activeUser.id === u.id ? " active" : "");
    row.innerHTML = `
      <div class="avatar" style="background:${u.avatarColor}">${initials(u.displayName)}</div>
      <div class="name">${escapeHtml(u.displayName)}</div>
      <div class="status-dot ${onlineIds.has(u.id) ? "online" : ""} ${unreadFrom.has(u.id) ? "unread" : ""}"></div>
    `;
    row.addEventListener("click", () => selectUser(u));
    memberList.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function loadUsers() {
  const data = await api("/api/users");
  users = data.users || [];
  renderMembers();
}

async function selectUser(u) {
  activeUser = u;
  unreadFrom.delete(u.id);
  renderMembers();
  chatEmpty.style.display = "none";
  chatHeader.style.display = "flex";
  messagesEl.style.display = "flex";
  composer.style.display = "flex";

  document.getElementById("headerAvatar").textContent = initials(u.displayName);
  document.getElementById("headerAvatar").style.background = u.avatarColor;
  document.getElementById("headerName").textContent = u.displayName;
  updateHeaderPresence();

  const data = await api(`/api/messages/${u.id}`);
  messagesEl.innerHTML = "";
  (data.messages || []).forEach(renderMessage);
  scrollToBottom();
}

function updateHeaderPresence() {
  const presenceEl = document.getElementById("headerPresence");
  if (!activeUser) return;
  const isOnline = onlineIds.has(activeUser.id);
  presenceEl.textContent = isOnline ? "آنلاین" : "آفلاین";
  presenceEl.classList.toggle("online", isOnline);
}

function downloadIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`;
}

function triggerDownload(dataUrl, fileName) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName || "file";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function renderMessage(m) {
  const row = document.createElement("div");
  row.className = "msg-row" + (m.senderId === me.id ? " me" : "");

  let inner = "";
  if (m.kind === "image") {
    inner = `<img class="attach-img" src="${m.content}" alt="عکس" />`;
  } else if (m.kind === "video") {
    inner = `<video class="attach-video" src="${m.content}" controls></video>`;
  } else if (m.kind === "file") {
    inner = `<div class="attach-file">${downloadIconSvg()}<span class="fname">${escapeHtml(m.fileName || "فایل")}</span></div>`;
  } else {
    inner = escapeHtml(m.content);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = `${inner}<span class="time">${fmtTime(m.createdAt)}</span>`;

  if (m.kind === "file") {
    bubble.querySelector(".attach-file").addEventListener("click", () => triggerDownload(m.content, m.fileName));
  }
  if (m.kind === "image") {
    bubble.querySelector("img").addEventListener("click", () => triggerDownload(m.content, m.fileName || "image.png"));
  }

  row.appendChild(bubble);
  messagesEl.appendChild(row);
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---------- نوتیفیکیشن ویندوز ----------
function notifyNewMessage(fromUser, content) {
  if (!("Notification" in window)) return;
  const show = () => {
    const n = new Notification(fromUser.displayName, { body: content, silent: false });
    n.onclick = () => {
      window.zaytun.focus();
      selectUser(fromUser);
    };
  };
  if (Notification.permission === "granted") show();
  else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((perm) => { if (perm === "granted") show(); });
  }
}

// ---------- Socket.io ----------
const socket = io(window.SERVER_URL, { auth: { token } });

socket.on("connect_error", () => {
  chatEmpty.textContent = "اتصال زنده به سرور برقرار نشد. آدرس سرور و اینترنت رو چک کن.";
  chatEmpty.style.display = "flex";
});

socket.on("dm-error", (data) => {
  alert(data.message || "خطا در ارسال پیام");
});

socket.on("online-list", (ids) => {
  onlineIds = new Set(ids);
  renderMembers();
  updateHeaderPresence();
});

socket.on("presence", ({ userId, online }) => {
  if (online) onlineIds.add(userId);
  else onlineIds.delete(userId);
  if (online && !users.find((u) => u.id === userId)) loadUsers();
  else renderMembers();
  updateHeaderPresence();
});

socket.on("dm", (m) => {
  const isFromActive = activeUser && m.senderId === activeUser.id;
  const isToActiveFromMe = activeUser && m.senderId === me.id && m.receiverId === activeUser.id;

  if (isFromActive || isToActiveFromMe) {
    renderMessage(m);
    scrollToBottom();
  }

  if (m.senderId !== me.id && !isFromActive) {
    unreadFrom.add(m.senderId);
    renderMembers();
    const sender = users.find((u) => u.id === m.senderId);
    const preview = m.kind === "text" ? m.content : `[${m.kind === "image" ? "عکس" : m.kind === "video" ? "ویدیو" : "فایل"}]`;
    if (sender) notifyNewMessage(sender, preview);
    else loadUsers();
  } else if (m.senderId !== me.id && !document.hasFocus()) {
    const preview = m.kind === "text" ? m.content : `[${m.kind === "image" ? "عکس" : m.kind === "video" ? "ویدیو" : "فایل"}]`;
    notifyNewMessage(activeUser, preview);
  }
});

socket.on("typing", ({ fromUserId }) => {
  if (activeUser && fromUserId === activeUser.id) {
    typingHint.textContent = `${activeUser.displayName} در حال تایپ...`;
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => (typingHint.textContent = ""), 1500);
  }
});

const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !activeUser) return;
  socket.emit("dm", { toUserId: activeUser.id, content: text, kind: "text" });
  messageInput.value = "";
}

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
  else if (activeUser) socket.emit("typing", { toUserId: activeUser.id });
});

if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

// ---------- ایموجی ----------
const EMOJIS = ["😀","😂","😍","😎","😢","😡","👍","👎","🙏","🎉","🔥","❤️","😴","🤔","😭","😅","👋","💀","🥳","😇","🤝","👀","💯","✅","❌","🎂","🚀","☕","🌙","⭐"];
const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");
emojiPicker.innerHTML = EMOJIS.map((e) => `<button type="button">${e}</button>`).join("");
emojiPicker.addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") {
    messageInput.value += e.target.textContent;
    messageInput.focus();
  }
});
emojiBtn.addEventListener("click", () => {
  emojiPicker.style.display = emojiPicker.style.display === "grid" ? "none" : "grid";
});
document.addEventListener("click", (e) => {
  if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) emojiPicker.style.display = "none";
});

// ---------- ارسال عکس/ویدیو/فایل ----------
const MAX_BYTES = 6 * 1024 * 1024;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleAttachment(file, kind) {
  if (!activeUser) return;
  if (file.size > MAX_BYTES) {
    alert("حجم فایل بیشتر از ۶ مگابایته. یه فایل کوچیک‌تر انتخاب کن.");
    return;
  }
  const dataUrl = await readFileAsDataUrl(file);
  socket.emit("dm", {
    toUserId: activeUser.id,
    content: dataUrl,
    kind,
    fileName: file.name,
    mimeType: file.type,
  });
}

document.getElementById("imageBtn").addEventListener("click", () => document.getElementById("imageInput").click());
document.getElementById("videoBtn").addEventListener("click", () => document.getElementById("videoInput").click());
document.getElementById("fileBtn").addEventListener("click", () => document.getElementById("fileInput").click());

document.getElementById("imageInput").addEventListener("change", (e) => {
  if (e.target.files[0]) handleAttachment(e.target.files[0], "image");
  e.target.value = "";
});
document.getElementById("videoInput").addEventListener("change", (e) => {
  if (e.target.files[0]) handleAttachment(e.target.files[0], "video");
  e.target.value = "";
});
document.getElementById("fileInput").addEventListener("change", (e) => {
  if (e.target.files[0]) handleAttachment(e.target.files[0], "file");
  e.target.value = "";
});

// ---------- حذف حساب ----------
const deleteModal = document.getElementById("deleteModal");
const deletePassword = document.getElementById("deletePassword");
const deleteMsg = document.getElementById("deleteMsg");

document.getElementById("deleteAccountBtn").addEventListener("click", () => {
  deletePassword.value = "";
  deleteMsg.textContent = "";
  deleteModal.style.display = "flex";
  deletePassword.focus();
});

document.getElementById("cancelDelete").addEventListener("click", () => {
  deleteModal.style.display = "none";
});

document.getElementById("confirmDelete").addEventListener("click", async () => {
  const password = deletePassword.value;
  if (!password) {
    deleteMsg.textContent = "رمز عبورت رو وارد کن.";
    return;
  }
  try {
    const res = await fetch(`${window.SERVER_URL}/api/account`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      deleteMsg.textContent = data.error || "حذف حساب انجام نشد.";
      return;
    }
    localStorage.removeItem("zaytun_token");
    localStorage.removeItem("zaytun_user");
    window.location.href = "login.html";
  } catch (err) {
    deleteMsg.textContent = "اتصال به سرور برقرار نشد.";
  }
});

// ---------- پنل تنظیمات ----------
const settingsOverlay = document.getElementById("settingsOverlay");

document.getElementById("openSettingsBtn").addEventListener("click", () => {
  document.getElementById("settingsDisplayName").value = me.displayName;
  document.getElementById("settingsEmail").value = me.email || "";
  document.getElementById("profileMsg").textContent = "";
  document.getElementById("emailSettingsMsg").textContent = "";
  syncAppearanceUI();
  settingsOverlay.style.display = "flex";
});
document.getElementById("closeSettingsBtn").addEventListener("click", () => {
  settingsOverlay.style.display = "none";
});

// ذخیره‌ی نام نمایشی
document.getElementById("saveProfileBtn").addEventListener("click", async () => {
  const profileMsg = document.getElementById("profileMsg");
  const newName = document.getElementById("settingsDisplayName").value.trim();
  if (!newName) {
    profileMsg.textContent = "نام نمایشی نمی‌تونه خالی باشه.";
    return;
  }
  try {
    const res = await fetch(`${window.SERVER_URL}/api/account/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: newName }),
    });
    const data = await res.json();
    if (!res.ok) {
      profileMsg.textContent = data.error || "ذخیره نشد.";
      return;
    }
    me.displayName = newName;
    localStorage.setItem("zaytun_user", JSON.stringify(me));
    document.getElementById("meName").textContent = newName;
    document.getElementById("meAvatar").textContent = initials(newName);
    profileMsg.classList.add("ok");
    profileMsg.textContent = "ذخیره شد.";
  } catch {
    profileMsg.textContent = "اتصال به سرور برقرار نشد.";
  }
});

// ذخیره‌ی ایمیل جدید
document.getElementById("saveEmailBtn").addEventListener("click", async () => {
  const emailSettingsMsg = document.getElementById("emailSettingsMsg");
  const newEmail = document.getElementById("settingsEmail").value.trim();
  const password = document.getElementById("settingsEmailPassword").value;
  if (!newEmail || !password) {
    emailSettingsMsg.textContent = "ایمیل جدید و رمز عبور فعلی رو وارد کن.";
    return;
  }
  try {
    const res = await fetch(`${window.SERVER_URL}/api/account/email`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ newEmail, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      emailSettingsMsg.textContent = data.error || "ذخیره نشد.";
      return;
    }
    me.email = newEmail;
    localStorage.setItem("zaytun_user", JSON.stringify(me));
    document.getElementById("settingsEmailPassword").value = "";
    emailSettingsMsg.classList.add("ok");
    emailSettingsMsg.textContent = "ایمیل با موفقیت عوض شد.";
  } catch {
    emailSettingsMsg.textContent = "اتصال به سرور برقرار نشد.";
  }
});

// ظاهر: تم / فونت / اندازه
function syncAppearanceUI() {
  const theme = localStorage.getItem("zaytun_theme") || "olive";
  const font = localStorage.getItem("zaytun_font") || "rajdhani";
  const size = localStorage.getItem("zaytun_size") || "medium";

  document.querySelectorAll(".theme-swatch").forEach((el) => {
    el.classList.toggle("active", el.dataset.theme === theme);
  });
  document.querySelectorAll("#fontOptions .option-pill").forEach((el) => {
    el.classList.toggle("active", el.dataset.font === font);
  });
  document.querySelectorAll("#sizeOptions .option-pill").forEach((el) => {
    el.classList.toggle("active", el.dataset.size === size);
  });
}

document.querySelectorAll(".theme-swatch").forEach((el) => {
  el.addEventListener("click", () => {
    localStorage.setItem("zaytun_theme", el.dataset.theme);
    document.documentElement.setAttribute("data-theme", el.dataset.theme);
    syncAppearanceUI();
  });
});
document.querySelectorAll("#fontOptions .option-pill").forEach((el) => {
  el.addEventListener("click", () => {
    localStorage.setItem("zaytun_font", el.dataset.font);
    document.documentElement.setAttribute("data-font", el.dataset.font);
    syncAppearanceUI();
  });
});
document.querySelectorAll("#sizeOptions .option-pill").forEach((el) => {
  el.addEventListener("click", () => {
    localStorage.setItem("zaytun_size", el.dataset.size);
    document.documentElement.setAttribute("data-size", el.dataset.size);
    syncAppearanceUI();
  });
});

loadUsers();
