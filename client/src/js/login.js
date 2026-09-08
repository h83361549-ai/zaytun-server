const form = document.getElementById("loginForm");
const msg = document.getElementById("msg");
const submitBtn = document.getElementById("submitBtn");

document.getElementById("goRegister").addEventListener("click", () => {
  window.location.href = "register.html";
});
document.getElementById("goForgot").addEventListener("click", () => {
  window.location.href = "forgot-password.html";
});
document.getElementById("min").addEventListener("click", () => window.zaytun.minimize());
document.getElementById("close").addEventListener("click", () => window.zaytun.close());

// اگه قبلاً وارد شده، مستقیم برو صفحه چت
const savedToken = localStorage.getItem("zaytun_token");
if (savedToken) window.location.href = "chat.html";

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  msg.classList.remove("ok");

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!username || !password) {
    msg.textContent = "نام کاربری و رمز عبور رو وارد کن.";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "در حال ورود...";

  try {
    const res = await fetch(`${window.SERVER_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || "خطا در ورود";
      return;
    }
    localStorage.setItem("zaytun_token", data.token);
    localStorage.setItem("zaytun_user", JSON.stringify(data.user));
    window.location.href = "chat.html";
  } catch (err) {
    msg.textContent = "اتصال به سرور برقرار نشد. آدرس سرور رو تو config.js چک کن.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "ورود به Zaytun";
  }
});
