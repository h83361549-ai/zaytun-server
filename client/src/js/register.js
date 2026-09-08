const form = document.getElementById("registerForm");
const msg = document.getElementById("msg");
const submitBtn = document.getElementById("submitBtn");

document.getElementById("goLogin").addEventListener("click", () => {
  window.location.href = "login.html";
});
document.getElementById("min").addEventListener("click", () => window.zaytun.minimize());
document.getElementById("close").addEventListener("click", () => window.zaytun.close());

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  msg.classList.remove("ok");

  const displayName = document.getElementById("displayName").value.trim();
  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!displayName || !username || !email || !password) {
    msg.textContent = "همه‌ی فیلدها رو پر کن.";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "در حال ساخت حساب...";

  try {
    const res = await fetch(`${window.SERVER_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || "خطا در ثبت‌نام";
      return;
    }
    msg.classList.add("ok");
    msg.textContent = "ثبت‌نام موفق بود! داری منتقل میشی به صفحه ورود...";
    setTimeout(() => (window.location.href = "login.html"), 900);
  } catch (err) {
    msg.textContent = "اتصال به سرور برقرار نشد. آدرس سرور رو تو config.js چک کن.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "ساخت حساب";
  }
});
