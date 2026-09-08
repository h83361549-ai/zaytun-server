const { app, BrowserWindow, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 860,
    minHeight: 560,
    frame: false, // فریم پیش‌فرض ویندوز رو حذف می‌کنیم تا نوار بالای خودمون رو نشون بدیم
    backgroundColor: "#0a0d08",
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "src", "login.html"));

  ipcMain.on("window:minimize", () => mainWindow.minimize());
  ipcMain.on("window:close", () => mainWindow.close());
  ipcMain.on("window:focus", () => {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  // رفع باگ شناخته‌شده‌ی ویندوز: وقتی پنجره‌ی بدون فریم Maximize میشه،
  // یه حاشیه‌ی نامرئی رزرو میشه که باعث میشه ته صفحه سیاه بمونه.
  // با اطلاع دادن به رندرر، یه padding جبرانی اضافه می‌کنیم.
  mainWindow.on("maximize", () => mainWindow.webContents.send("zaytun:maximized", true));
  mainWindow.on("unmaximize", () => mainWindow.webContents.send("zaytun:maximized", false));

  // چون برنامه بین صفحات مختلف (لاگین، چت و...) ناوبری می‌کنه نه یه صفحه‌ی تکی،
  // باید وضعیت maximize رو بعد از هر بار لود شدن صفحه‌ی جدید دوباره بفرستیم
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("zaytun:maximized", mainWindow.isMaximized());
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // ---------- بررسی خودکار آپدیت ----------
  // فقط تو نسخه‌ی نصب‌شده (پکیج‌شده) کار می‌کنه، نه موقع npm start
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();

    // هر ۱۰ دقیقه هم دوباره چک کن، شاید برنامه مدت زیادی باز مونده باشه
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 10 * 60 * 1000);
  }
});

autoUpdater.on("update-downloaded", () => {
  // آپدیت دانلود شد؛ برنامه رو می‌بندیم و با نسخه‌ی جدید دوباره باز می‌کنیم
  autoUpdater.quitAndInstall();
});

autoUpdater.on("error", (err) => {
  console.error("خطا در بررسی آپدیت:", err);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
