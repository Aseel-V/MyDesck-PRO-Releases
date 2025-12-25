const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  quitApp: () => ipcRenderer.send('quit-app'),
  printToPDF: (data) => ipcRenderer.invoke('print-to-pdf', data),
  onInvoiceData: (callback) => ipcRenderer.on('invoice-data', (_, data) => callback(data)),
  removeInvoiceDataListeners: () => ipcRenderer.removeAllListeners('invoice-data'),
  invoiceReady: () => ipcRenderer.send('invoice-ready'),

  // Auto-Update API
  onUpdateAvailable: (callback) => ipcRenderer.on('update_available', (_, info) => callback(info)),
  onUpdateProgress: (callback) => ipcRenderer.on('update_progress', (_, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', (_, info) => callback(info)),
  onUpdateError: (callback) => ipcRenderer.on('update_error', (_, err) => callback(err)),
  
  startDownload: () => ipcRenderer.send('download_update'),
  retryUpdate: () => ipcRenderer.send('retry_update'),
  restartApp: () => ipcRenderer.send('restart_app'),
  unlockApp: () => ipcRenderer.send('unlock_app'),
  openExternal: (url) => ipcRenderer.send('open_external', url),

  removeAllUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update_available');
    ipcRenderer.removeAllListeners('update_progress');
    ipcRenderer.removeAllListeners('update_downloaded');
    ipcRenderer.removeAllListeners('update_error');
  }
});
