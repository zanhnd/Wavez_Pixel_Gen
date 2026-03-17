const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (defaultName, buffer) =>
    ipcRenderer.invoke('save-file', { defaultName, buffer })
});
