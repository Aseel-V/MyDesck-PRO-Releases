import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { app, BrowserWindow, ipcMain, Menu, globalShortcut, shell, screen } = require('electron');
const { autoUpdater } = require('electron-updater');

const isDev = process.env.NODE_ENV === 'development';
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
const currentAppVersion = app.getVersion();
let autoUpdaterInitialized = false;
let updateState = {
  status: 'idle',
  currentVersion: currentAppVersion,
  availableVersion: null,
  progress: 0,
  error: null,
};

// __dirname replacement for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Security Helpers ---
const ALLOWED_PROTOCOLS = ['https:', 'http:', 'mailto:', 'tel:'];

function isSafeUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    return ALLOWED_PROTOCOLS.includes(url.protocol);
  } catch (e) {
    return false;
  }
}

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  // Remove common shell metacharacters to prevent command injection
  return str.replace(/[&|;$`<>\\!"']/g, '');
}

// --- User Data Path Logic ---
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  try {
    const portableUserData = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'app-data');
    app.setPath('userData', portableUserData);
  } catch (e) {
    console.error('Failed to set portable path:', e);
  }
}

// Reduce noisy DevTools/Autofill warnings in production
if (!isDev) {
  app.commandLine.appendSwitch(
    'disable-features',
    'AutofillAddressEnabled,AutofillAddressSurvey,AutofillServerCardEnrollment,AutomaticPasswordGeneration,PasswordManagerOnboarding,AutofillEnableAccountWalletStorage'
  );
  app.commandLine.appendSwitch('disable-logging');
}

function sendUpdateEvent(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  });
}

function broadcastUpdateState(partialState) {
  updateState = {
    ...updateState,
    ...partialState,
    currentVersion: app.getVersion(),
  };
  sendUpdateEvent('update_state', updateState);
}

function runUpdateCheck() {
  if (isDev || !app.isPackaged) return;

  broadcastUpdateState({
    status: 'checking',
    error: null,
    progress: 0,
    availableVersion: null,
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Auto-updater check failed:', err);
    const message = err?.message || String(err);
    broadcastUpdateState({ status: 'error', error: message });
    sendUpdateEvent('update_error', message);
  });
}

function setupAutoUpdater() {
  if (isDev || !app.isPackaged || autoUpdaterInitialized) return;

  autoUpdaterInitialized = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    broadcastUpdateState({
      status: 'checking',
      error: null,
      progress: 0,
      availableVersion: null,
    });
  });

  autoUpdater.on('update-available', (info) => {
    const nextState = {
      status: 'available',
      availableVersion: info?.version || null,
      error: null,
      progress: 0,
    };
    broadcastUpdateState(nextState);
    sendUpdateEvent('update_available', info);
  });

  autoUpdater.on('update-not-available', () => {
    broadcastUpdateState({
      status: 'idle',
      availableVersion: null,
      error: null,
      progress: 0,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    broadcastUpdateState({
      status: 'downloading',
      progress: progress?.percent || 0,
      error: null,
    });
    sendUpdateEvent('update_progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcastUpdateState({
      status: 'downloaded',
      availableVersion: info?.version || updateState.availableVersion,
      progress: 100,
      error: null,
    });
    sendUpdateEvent('update_downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
    const message = err?.message || String(err);
    broadcastUpdateState({ status: 'error', error: message });
    sendUpdateEvent('update_error', message);
  });

  runUpdateCheck();
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.cjs'),
      devTools: true,
      webSecurity: !isDev // Allow CORS in development
    },
    icon: fs.existsSync(path.join(__dirname, 'assets/app-icon.png')) 
      ? path.join(__dirname, 'assets/app-icon.png')
      : path.join(__dirname, 'app-icon.png'), // Fallback if flattened
    show: false,
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
    if (process.env.OPEN_DEVTOOLS === 'true') {
      mainWindow.webContents.openDevTools();
    }
  } else {
    // Robust production loading: Check both dist/index.html and root index.html
    const distPath = path.join(__dirname, 'dist', 'index.html');
    const rootPath = path.join(__dirname, 'index.html');
    
    if (fs.existsSync(distPath)) {
      mainWindow.loadFile(distPath);
    } else if (fs.existsSync(rootPath)) {
      mainWindow.loadFile(rootPath);
    } else {
      console.error('Could not find index.html in dist or root!');
    }
    
    // Auto-open devtools in production if needed for debugging
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Run updater logic when app is ready/shown
    setupAutoUpdater();
  });

  mainWindow.on('closed', () => {
    app.quit();
  });
}

// Handle quit app request from renderer
ipcMain.on('quit-app', () => {
  app.quit();
});

// Update IPCs
ipcMain.on('download_update', () => {
  if (isDev || !app.isPackaged) return;
  autoUpdater.downloadUpdate().catch((err) => {
    const message = err?.message || String(err);
    broadcastUpdateState({ status: 'error', error: message });
    sendUpdateEvent('update_error', message);
  });
});

ipcMain.on('retry_update', () => {
  if (isDev || !app.isPackaged) return;
  runUpdateCheck();
});

ipcMain.on('restart_app', () => {
  if (isDev || !app.isPackaged) return;
  autoUpdater.quitAndInstall();
});

ipcMain.on('unlock_app', () => {
  // Renderer owns the update modal state; this IPC intentionally acknowledges
  // the emergency skip path exposed by the preload bridge.
});

ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-update-state', () => ({
  ...updateState,
  currentVersion: app.getVersion(),
}));

// Fetch currency exchange rates (bypasses CORS via main process)
ipcMain.handle('fetch-currency-rates', async (event, base = 'USD') => {
  try {
    const url = `https://api.frankfurter.app/latest?from=${base}`;
    // Use Node's built-in fetch (available in Electron / Node 18+)
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('[Main] Failed to fetch currency rates:', error.message);
    return { success: false, error: error.message };
  }
});

// Save PDF bytes to a temp file and return its file:// URL
// This is the most reliable way to preview PDFs in Electron iframes.
// data: URLs can be slow/buggy for large PDFs; file:// paths are native.
const tempPdfFiles = new Set();
ipcMain.handle('save-temp-pdf', async (event, uint8Array) => {
  try {
    const buffer = Buffer.from(uint8Array);
    const tempPath = path.join(app.getPath('temp'), `mydesck_preview_${Date.now()}.pdf`);
    fs.writeFileSync(tempPath, buffer);
    tempPdfFiles.add(tempPath);
    // Return as file:// URL
    return { success: true, url: `file:///${tempPath.replace(/\\/g, '/')}` };
  } catch (error) {
    console.error('[Main] Failed to save temp PDF:', error.message);
    return { success: false, error: error.message };
  }
});

// Clean up a specific temp PDF file
ipcMain.handle('delete-temp-pdf', async (event, filePath) => {
  try {
    // Only delete files we created
    if (tempPdfFiles.has(filePath)) {
      fs.unlinkSync(filePath);
      tempPdfFiles.delete(filePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Clean up all temp PDFs on quit
app.on('before-quit', () => {
  for (const f of tempPdfFiles) {
    try { fs.unlinkSync(f); } catch {}
  }
});

// Fetch car price from balcar.co.il (bypasses CORS via main process)
ipcMain.handle('fetch-car-price', async (event, plateNumber) => {
  const priceWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    await priceWindow.loadURL(`https://balcar.co.il/car/${plateNumber}`);
    
    // Wait for React app to load and render
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Extract price from the page
    const price = await priceWindow.webContents.executeJavaScript(`
      (function() {
        // Try to find the loan amount (גובה ההלוואה) which represents car value
        const elements = document.querySelectorAll('*');
        for (let el of elements) {
          const text = el.textContent || '';
          // Look for price pattern like "55,000" after loan text
          if (text.includes('גובה ההלוואה') || text.includes('שווי') || text.includes('מחיר')) {
            const priceMatch = text.match(/([0-9]{1,3}(?:,[0-9]{3})*)/);
            if (priceMatch) {
              return parseInt(priceMatch[1].replace(/,/g, ''));
            }
          }
        }
        // Try looking for large numbers that look like car prices
        const allText = document.body.innerText;
        const priceMatches = allText.match(/([0-9]{2,3},[0-9]{3})/g);
        if (priceMatches && priceMatches.length > 0) {
          // Return the first reasonable car price (typically 20,000 - 500,000)
          for (let match of priceMatches) {
            const num = parseInt(match.replace(/,/g, ''));
            if (num >= 10000 && num <= 1000000) {
              return num;
            }
          }
        }
        return null;
      })()
    `);
    
    return { success: true, price };
  } catch (error) {
    console.error('Failed to fetch car price:', error);
    return { success: false, error: error.message };
  } finally {
    if (priceWindow && !priceWindow.isDestroyed()) {
      priceWindow.close();
    }
  }
});

ipcMain.on('open_external', (event, url) => {
  if (isSafeUrl(url)) {
    shell.openExternal(url);
  } else {
    console.warn(`Blocked attempt to open unsafe URL: ${url}`);
  }
});

// ============================================================================
// ENTERPRISE FEATURE: Direct Thermal Printing
// ============================================================================

// Get list of available printers
ipcMain.handle('get-printers', async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return [];
  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers.map(p => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: p.isDefault,
      status: p.status
    }));
  } catch (error) {
    console.error('Failed to get printers:', error);
    return [];
  }
});

// Silent thermal print for kitchen tickets/receipts
ipcMain.handle('print-ticket', async (event, { html, printerName, options = {} }) => {
  const printWindow = new BrowserWindow({
    width: 300,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    // Load the HTML content
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    
    // Wait for content to render
    await new Promise(resolve => setTimeout(resolve, 300));

    // Print silently
    const printResult = await printWindow.webContents.print({
      silent: true,
      deviceName: printerName,
      printBackground: true,
      margins: { marginType: 'none' },
      pageSize: options.pageSize || { width: 80000, height: 297000 }, // 80mm thermal default
      ...options
    });

    return { success: true, result: printResult };
  } catch (error) {
    console.error('Print failed:', error);
    return { success: false, error: error.message };
  } finally {
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
});

// ============================================================================
// ENTERPRISE FEATURE: Customer Facing Display (CFD)
// ============================================================================

let customerDisplayWindow = null;

ipcMain.handle('get-displays', async () => {
  const displays = screen.getAllDisplays();
  return displays.map((d, i) => ({
    id: d.id,
    index: i,
    bounds: d.bounds,
    isPrimary: d.bounds.x === 0 && d.bounds.y === 0,
    label: i === 0 ? 'Primary Display' : `Display ${i + 1}`
  }));
});

ipcMain.handle('open-customer-display', async (event, displayIndex = 1) => {
  // Close existing window if open
  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    customerDisplayWindow.close();
  }

  const displays = screen.getAllDisplays();
  const targetDisplay = displays[displayIndex] || displays.find(d => d.bounds.x !== 0 || d.bounds.y !== 0);

  if (!targetDisplay) {
    return { success: false, error: 'No secondary display found' };
  }

  customerDisplayWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    fullscreen: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const distPath = path.join(__dirname, 'dist', 'index.html');
  const rootPath = path.join(__dirname, 'index.html');
  const actualPath = fs.existsSync(distPath) ? distPath : rootPath;

  const cfdUrl = isDev
    ? `${DEV_SERVER_URL}/customer-display`
    : `file:///${actualPath.replace(/\\/g, '/')}#/customer-display`;

  await customerDisplayWindow.loadURL(cfdUrl);
  
  customerDisplayWindow.on('closed', () => {
    customerDisplayWindow = null;
  });

  return { success: true, displayId: targetDisplay.id };
});

ipcMain.handle('close-customer-display', async () => {
  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    customerDisplayWindow.close();
    customerDisplayWindow = null;
    return { success: true };
  }
  return { success: false, error: 'No customer display window open' };
});

// Send data to customer display
ipcMain.on('update-customer-display', (event, data) => {
  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    customerDisplayWindow.webContents.send('customer-display-update', data);
  }
});


// Handle PDF generation
ipcMain.handle('print-to-pdf', async (event, data) => {
  const pdfWindow = new BrowserWindow({
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  try {
    const encodedPayload = encodeURIComponent(JSON.stringify(data));
    const invoiceUrl = isDev
      ? `${DEV_SERVER_URL}?invoice=true&data=${encodedPayload}`
      : `file://${path.join(__dirname, 'dist', 'index.html')}?invoice=true&data=${encodedPayload}`;
    
    await pdfWindow.loadURL(invoiceUrl);
    const pdfWindowId = pdfWindow.webContents.id;

    const readyPromise = new Promise((resolve, reject) => {
      let onReady; 
      const timeout = setTimeout(() => {
        console.log('Timeout waiting for invoice-ready, attempting to print anyway...');
        ipcMain.removeListener('invoice-ready', onReady);
        resolve(); 
      }, 5000); 

      onReady = (event) => {
        if (!event.sender || event.sender.isDestroyed()) return;
        if (event.sender.id === pdfWindowId) {
          clearTimeout(timeout);
          ipcMain.removeListener('invoice-ready', onReady);
          resolve(); 
        }
      };
      ipcMain.on('invoice-ready', onReady);
    });

    await readyPromise;
    if (pdfWindow.isDestroyed()) {
        throw new Error('PDF Window was closed prematurely');
    }

    const pdfData = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    return pdfData;
  } catch (error) {
    console.error('Failed to generate PDF', error);
    throw error;
  } finally {
    try {
      if (pdfWindow && !pdfWindow.isDestroyed()) {
          pdfWindow.close();
      }
    } catch (e) {
      console.error('Error closing PDF window', e);
    }
  }
});

// ============================================================================
// HARDWARE INTEGRATION: Serial Port Communication (Scales, EMV Terminals)
// ============================================================================

// Store for active serial port connections
const serialPorts = new Map();

// List available serial ports
ipcMain.handle('serial-list-ports', async () => {
  try {
    // Dynamic import of serialport
    const { SerialPort } = await import('serialport');
    const ports = await SerialPort.list();
    return ports.map(p => ({
      path: p.path,
      manufacturer: p.manufacturer || 'Unknown',
      serialNumber: p.serialNumber,
      vendorId: p.vendorId,
      productId: p.productId,
    }));
  } catch (error) {
    console.error('Failed to list serial ports:', error);
    // Return empty array if serialport is not installed
    return [];
  }
});

// Connect to a serial port
ipcMain.handle('serial-connect', async (event, { port, baudRate = 9600, dataBits = 8, parity = 'none', stopBits = 1 }) => {
  try {
    const { SerialPort } = await import('serialport');
    
    // Close existing connection if any
    if (serialPorts.has(port)) {
      const existing = serialPorts.get(port);
      if (existing.isOpen) {
        await new Promise(resolve => existing.close(resolve));
      }
      serialPorts.delete(port);
    }

    // Create new connection
    const serialPort = new SerialPort({ 
      path: port, 
      baudRate,
      dataBits,
      parity,
      stopBits,
      autoOpen: false 
    });

    await new Promise((resolve, reject) => {
      serialPort.open((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    serialPorts.set(port, serialPort);
    
    return { success: true, port };
  } catch (error) {
    console.error('Failed to connect to serial port:', error);
    return { success: false, error: error.message };
  }
});

// Disconnect from a serial port
ipcMain.handle('serial-disconnect', async (event, port) => {
  try {
    if (serialPorts.has(port)) {
      const serialPort = serialPorts.get(port);
      if (serialPort.isOpen) {
        await new Promise(resolve => serialPort.close(resolve));
      }
      serialPorts.delete(port);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Send data to serial port and optionally wait for response
ipcMain.handle('serial-send', async (event, { port, data, waitForResponse = true, timeout = 1000 }) => {
  try {
    if (!serialPorts.has(port)) {
      return { success: false, error: 'Port not connected' };
    }

    const serialPort = serialPorts.get(port);
    
    // Send data
    await new Promise((resolve, reject) => {
      serialPort.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (!waitForResponse) {
      return { success: true };
    }

    // Wait for response
    const response = await new Promise((resolve) => {
      let buffer = '';
      const timeoutId = setTimeout(() => {
        serialPort.removeAllListeners('data');
        resolve(buffer);
      }, timeout);

      const onData = (chunk) => {
        buffer += chunk.toString();
        // Check for common terminators
        if (buffer.includes('\r\n') || buffer.includes('\n') || buffer.includes('\r')) {
          clearTimeout(timeoutId);
          serialPort.removeListener('data', onData);
          resolve(buffer.trim());
        }
      };

      serialPort.on('data', onData);
    });

    return { success: true, data: response };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================================================
// HARDWARE INTEGRATION: ESC/POS Raw Printing (Thermal Printers)
// ============================================================================

// Send raw ESC/POS commands to a printer
ipcMain.handle('print-escpos', async (event, { printerName, commands }) => {
  try {
    // Sanitize printer name to prevent command injection
    const safePrinterName = sanitizeString(printerName);
    if (!safePrinterName) {
      throw new Error('Invalid printer name');
    }

    // Decode base64 commands to buffer
    const buffer = Buffer.from(commands, 'base64');
    
    // On Windows, we need to use the Windows print spooler
    if (process.platform === 'win32') {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Create a temp file with the raw data
      const tempPath = path.join(app.getPath('temp'), `escpos_${Date.now()}.bin`);
      fs.writeFileSync(tempPath, buffer);
      
      try {
        // Print using Windows COPY command to printer port
        // This works for USB printers shared via Windows
        await execAsync(`copy /b "${tempPath}" "\\\\%COMPUTERNAME%\\${safePrinterName}"`, {
          windowsHide: true
        });
        return { success: true };
      } catch (printError) {
        // Try alternative method using lpr
        try {
          await execAsync(`lpr -S localhost -P "${safePrinterName}" "${tempPath}"`, {
            windowsHide: true
          });
          return { success: true };
        } catch {
          // Final fallback
          console.error('Windows print failed:', printError);
          return { success: false, error: 'Direct printing failed. Ensure printer is shared.' };
        }
      } finally {
        // Clean up temp file
        try { fs.unlinkSync(tempPath); } catch {}
      }
    } else {
      // On Linux/Mac, use lp command
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const tempPath = path.join(app.getPath('temp'), `escpos_${Date.now()}.bin`);
      fs.writeFileSync(tempPath, buffer);
      
      try {
        await execAsync(`lp -d "${safePrinterName}" -o raw "${tempPath}"`);
        return { success: true };
      } finally {
        try { fs.unlinkSync(tempPath); } catch {}
      }
    }
  } catch (error) {
    console.error('ESC/POS print failed:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// HARDWARE INTEGRATION: Cash Drawer Control
// ============================================================================

// Open cash drawer (via printer kick or serial)
ipcMain.handle('open-cash-drawer', async (event, { printerName, method = 'printer' }) => {
  try {
    if (method === 'printer') {
      // ESC/POS drawer kick command: ESC p 0 25 250
      // Pin 2 pulse: 25ms ON, 250ms OFF
      const drawerCommand = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
      
      // Send via ESC/POS handler
      return await ipcMain.emit('print-escpos', event, {
        printerName,
        commands: drawerCommand.toString('base64')
      });
    } else if (method === 'serial' && serialPorts.has(printerName)) {
      // Direct serial drawer kick
      const serialPort = serialPorts.get(printerName);
      const drawerCommand = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
      
      await new Promise((resolve, reject) => {
        serialPort.write(drawerCommand, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      return { success: true };
    }
    
    return { success: false, error: 'No valid drawer method specified' };
  } catch (error) {
    console.error('Cash drawer open failed:', error);
    return { success: false, error: error.message };
  }
});

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.mydesck.pro');
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  globalShortcut.register('CommandOrControl+Shift+I', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (navigationEvent) => {
    navigationEvent.preventDefault();
  });
});
