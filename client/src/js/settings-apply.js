// settings-apply.js — تنظیمات ظاهری ذخیره‌شده رو قبل از نمایش صفحه اعمال می‌کنه
(function () {
  const theme = localStorage.getItem("zaytun_theme") || "olive";
  const font = localStorage.getItem("zaytun_font") || "rajdhani";
  const size = localStorage.getItem("zaytun_size") || "medium";
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-font", font);
  document.documentElement.setAttribute("data-size", size);

  // رفع باگ نوار سیاه پایین صفحه هنگام Maximize کردن پنجره‌ی بدون فریم رو ویندوز
  if (window.zaytun && window.zaytun.onMaximizeChange) {
    window.zaytun.onMaximizeChange((isMaximized) => {
      document.documentElement.classList.toggle("is-maximized", isMaximized);
    });
  }
})();
