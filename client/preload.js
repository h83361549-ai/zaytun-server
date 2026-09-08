const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zaytun", {
  minimize: () => ipcRenderer.send("window:minimize"),
  close: () => ipcRenderer.send("window:close"),
  focus: () => ipcRenderer.send("window:focus"),
  onMaximizeChange: (callback) => {
    ipcRenderer.on("zaytun:maximized", (_event, isMaximized) => callback(isMaximized));
  },
});
