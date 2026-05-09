const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("claudepet", {
  getInitial: () => ipcRenderer.invoke("claudepet:get-initial"),
  updateConfig: (patch) => ipcRenderer.invoke("claudepet:update-config", patch),
  savePetManifest: (petId, patch) => ipcRenderer.invoke("claudepet:save-pet-manifest", petId, patch),
  openManager: () => ipcRenderer.invoke("claudepet:open-manager"),
  hidePet: () => ipcRenderer.invoke("claudepet:hide-pet"),
  dragWindow: (delta) => ipcRenderer.invoke("claudepet:drag-window", delta),
  setPassthrough: (ignore) => ipcRenderer.invoke("claudepet:set-passthrough", Boolean(ignore)),
  quitApp: () => ipcRenderer.invoke("claudepet:quit-app"),
  getUsage: () => ipcRenderer.invoke("claudepet:get-usage"),
  onUpdate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("claudepet:update", listener);
    return () => ipcRenderer.removeListener("claudepet:update", listener);
  }
});
