document.getElementById("min").addEventListener("click", () => window.zaytun.minimize());
document.getElementById("close").addEventListener("click", () => window.zaytun.close());
document.getElementById("backToLogin1").addEventListener("click", () => (window.location.href = "login.html"));
document.getElementById("backToLogin2").addEventListener("click", () => (window.location.href = "login.html"));

const stepEmailForm = document.getElementById("stepEmailForm");
const stepResetForm = document.getElementById("stepResetForm");
const emailMsg = document.getElementById("emailMsg");
const resetMsg = document.getElementById("resetMsg");

let savedEmail = "";

stepEmailForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  emailMsg.textContent = "";
  const email = document.getElementById("fpEmail").value.trim();
  if (!email) {
    emailMsg.textContent = "ایمیلت رو وارد کن.";
    return;
  }
  const btn = document.getElementById("sendCodeBtn");
  btn.disabled = true;
  btn.textContent = "در حال ارسال...";
  try {
    await fetch(`${window.SERVER_URL}/api/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    savedEmail = email;
    stepEmailForm.style.display = "none";
    stepResetForm.style.display = "block";
  } catch (err) {
    emailMsg.textContent = "اتصال به سرور برقرار نشد.";
  } finally {
    btn.disabled = false;
    btn.textContent = "ارسال کد بازیابی";
  }
});

stepResetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  resetMsg.textContent = "";
  resetMsg.classList.remove("ok");
  const code = document.getElementById("fpCode").value.trim();
  const newPassword = document.getElementById("fpNewPassword").value;
  if (!code || !newPassword) {
    resetMsg.textContent = "کد و رمز جدید رو وارد کن.";
    return;
  }
  const btn = document.getElementById("resetBtn");
  btn.disabled = true;
  btn.textContent = "در حال بررسی...";
  try {
    const res = await fetch(`${window.SERVER_URL}/api/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: savedEmail, code, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      resetMsg.textContent = data.error || "خطا در تغییر رمز عبور";
      return;
    }
    resetMsg.classList.add("ok");
    resetMsg.textContent = "رمز عبورت عوض شد! داری منتقل میشی به صفحه‌ی ورود...";
    setTimeout(() => (window.location.href = "login.html"), 1200);
  } catch (err) {
    resetMsg.textContent = "اتصال به سرور برقرار نشد.";
  } finally {
    btn.disabled = false;
    btn.textContent = "تغییر رمز عبور";
  }
});
