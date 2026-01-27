import { app, BrowserWindow, ipcMain, Menu, globalShortcut, shell, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;

const isDev = process.env.NODE_ENV === 'development';

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

// --- Task 2: Implement Auto-Updater ---
function setupAutoUpdater() {
  if (isDev) return;

  // 1. Configure for silent update
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // 2. Check and Notify
  // This fulfills "runs autoUpdater.checkForUpdatesAndNotify() when the app is ready"
  autoUpdater.checkForUpdatesAndNotify();

  // 3. Handle events to install the update silently if found
  autoUpdater.on('update-downloaded', () => {
    // Only notify renderer, let autoInstallOnAppQuit handle the actual install
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
       win.webContents.send('update_downloaded');
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
  });
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
      devTools: isDev
    },
    icon: path.join(__dirname, 'assets/app-icon.png'),
    show: false,
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // CRITICAL FIX: Robust production loading
    const indexHtml = path.join(__dirname, 'dist', 'index.html');
    mainWindow.loadFile(indexHtml);
    
    // Optional: open devtools also in production to debug if needed
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
  autoUpdater.downloadUpdate();
});

ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
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

  const cfdUrl = isDev
    ? 'http://localhost:5173/customer-display'
    : `file://${path.join(__dirname, 'dist', 'index.html')}#/customer-display`;

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
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  try {
    const invoiceUrl = isDev
      ? 'http://localhost:5173?invoice=true'
      : `file://${path.join(__dirname, 'dist', 'index.html')}?invoice=true`;
    
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

    if (!pdfWindow.isDestroyed()) {
        pdfWindow.webContents.send('invoice-data', data);
    }
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