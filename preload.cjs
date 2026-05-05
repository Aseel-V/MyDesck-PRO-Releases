const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  quitApp: () => ipcRenderer.send('quit-app'),
  printToPDF: (data) => ipcRenderer.invoke('print-to-pdf', data),
  onInvoiceData: (callback) => ipcRenderer.on('invoice-data', (_, data) => callback(data)),
  removeInvoiceDataListeners: () => ipcRenderer.removeAllListeners('invoice-data'),
  invoiceReady: () => ipcRenderer.send('invoice-ready'),

  // Auto-Update API
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getUpdateState: () => ipcRenderer.invoke('get-update-state'),
  onUpdateState: (callback) => ipcRenderer.on('update_state', (_, state) => callback(state)),
  onUpdateAvailable: (callback) => ipcRenderer.on('update_available', (_, info) => callback(info)),
  onUpdateProgress: (callback) => ipcRenderer.on('update_progress', (_, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', (_, info) => callback(info)),
  onUpdateError: (callback) => ipcRenderer.on('update_error', (_, err) => callback(err)),
  
  startDownload: () => ipcRenderer.send('download_update'),
  retryUpdate: () => ipcRenderer.send('retry_update'),
  restartApp: () => ipcRenderer.send('restart_app'),
  unlockApp: () => ipcRenderer.send('unlock_app'),
  openExternal: (url) => ipcRenderer.send('open_external', url),
  
  // Car Price Check
  fetchCarPrice: (plateNumber) => ipcRenderer.invoke('fetch-car-price', plateNumber),

  // Currency Rates (CORS-safe via main process)
  fetchCurrencyRates: (base) => ipcRenderer.invoke('fetch-currency-rates', base),

  // PDF temp file (for preview - most reliable in Electron)
  saveTempPdf: (uint8Array) => ipcRenderer.invoke('save-temp-pdf', uint8Array),
  deleteTempPdf: (filePath) => ipcRenderer.invoke('delete-temp-pdf', filePath),

  removeAllUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update_state');
    ipcRenderer.removeAllListeners('update_available');
    ipcRenderer.removeAllListeners('update_progress');
    ipcRenderer.removeAllListeners('update_downloaded');
    ipcRenderer.removeAllListeners('update_error');
  },

  // =========================================================================
  // ENTERPRISE: Direct Thermal Printing
  // =========================================================================
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printTicket: (html, printerName, options) => ipcRenderer.invoke('print-ticket', { html, printerName, options }),

  // =========================================================================
  // ENTERPRISE: Customer Facing Display (CFD)
  // =========================================================================
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  openCustomerDisplay: (displayIndex) => ipcRenderer.invoke('open-customer-display', displayIndex),
  closeCustomerDisplay: () => ipcRenderer.invoke('close-customer-display'),
  updateCustomerDisplay: (data) => ipcRenderer.send('update-customer-display', data),
  onCustomerDisplayUpdate: (callback) => ipcRenderer.on('customer-display-update', (_, data) => callback(data)),
  removeCustomerDisplayListeners: () => ipcRenderer.removeAllListeners('customer-display-update'),

  // =========================================================================
  // HARDWARE: Serial Port Communication (Scales, EMV Terminals)
  // =========================================================================
  serialListPorts: () => ipcRenderer.invoke('serial-list-ports'),
  serialConnect: (port, baudRate) => ipcRenderer.invoke('serial-connect', { port, baudRate }),
  serialDisconnect: (port) => ipcRenderer.invoke('serial-disconnect', port),
  serialSend: (port, data, options) => ipcRenderer.invoke('serial-send', { port, data, ...options }),

  // =========================================================================
  // HARDWARE: ESC/POS Thermal Printing
  // =========================================================================
  printEscPos: (printerName, commands) => ipcRenderer.invoke('print-escpos', { printerName, commands }),

  // =========================================================================
  // HARDWARE: Cash Drawer Control
  // =========================================================================
  openCashDrawer: (printerName, method) => ipcRenderer.invoke('open-cash-drawer', { printerName, method }),
});

