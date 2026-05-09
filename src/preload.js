const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ccpet", {
  getInitial: () => ipcRenderer.invoke("ccpet:get-initial"),
  updateConfig: (patch) => ipcRenderer.invoke("ccpet:update-config", patch),
  savePetManifest: (petId, patch) => ipcRenderer.invoke("ccpet:save-pet-manifest", petId, patch),
  openManager: () => ipcRenderer.invoke("ccpet:open-manager"),
  hidePet: () => ipcRenderer.invoke("ccpet:hide-pet"),
  dragWindow: (delta) => ipcRenderer.invoke("ccpet:drag-window", delta),
  setPassthrough: (ignore) => ipcRenderer.invoke("ccpet:set-passthrough", Boolean(ignore)),
  quitApp: () => ipcRenderer.invoke("ccpet:quit-app"),
  getUsage: () => ipcRenderer.invoke("ccpet:get-usage"),
  onUpdate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("ccpet:update", listener);
    return () => ipcRenderer.removeListener("ccpet:update", listener);
  }
});
