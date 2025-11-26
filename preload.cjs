const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  quitApp: () => ipcRenderer.send('quit-app'),
  printToPDF: (data) => ipcRenderer.invoke('print-to-pdf', data),
});
