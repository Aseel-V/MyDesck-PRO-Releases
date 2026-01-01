import { app, BrowserWindow, ipcMain, Menu, globalShortcut, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;

const isDev = process.env.NODE_ENV === 'development';

// __dirname replacement for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- FIX: User Data Path Logic ---
// Use a portable data directory ONLY if explicitly strictly portable (via electron-builder portable env)
// Otherwise, let Electron use the default system AppData path.
// This prevents permission errors (White Screen) when installed in "Program Files".
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
    [
      'AutofillAddressEnabled',
      'AutofillAddressSurvey',
      'AutofillServerCardEnrollment',
      'AutomaticPasswordGeneration',
      'PasswordManagerOnboarding',
      'AutofillEnableAccountWalletStorage',
    ].join(',')
  );
  app.commandLine.appendSwitch('disable-logging');
}

// --- Auto-Update & Lockdown Logic ---

const LOCK_FILE = path.join(app.getPath('userData'), 'update-lock.json');
let stallCheckInterval = null;

function getUpdateLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const data = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      // Safegaurd: if lock is older than 24 hours, discard it to avoid permanent blocking
      if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
        clearUpdateLock();
        return null;
      }
      return data;
    }
  } catch (e) {
    console.error('Error reading lock file:', e);
  }
  return null;
}

function setUpdateLock(status, extra = {}) {
  try {
    const data = { 
      status, 
      timestamp: Date.now(), 
      ...extra 
    };
    fs.writeFileSync(LOCK_FILE, JSON.stringify(data));
  } catch (e) {
    console.error('Error writing lock file:', e);
  }
}

function clearUpdateLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (e) { console.error('Error clearing lock:', e); }
}

function enforceLockdown() {
  // 1. Remove Menu
  Menu.setApplicationMenu(null);
  
  // 2. Disable interactions
  if (!isDev) {
    // Block common shortcuts
    globalShortcut.register('CommandOrControl+R', () => {});
    globalShortcut.register('CommandOrControl+Shift+R', () => {});
    globalShortcut.register('CommandOrControl+Shift+I', () => {});
    globalShortcut.register('F11', () => {});
    globalShortcut.register('F5', () => {});
  }
}

function liftLockdown() {
  // 1. Clear lock file
  clearUpdateLock();
  
  // 2. Unregister blockers
  if (!isDev) {
    globalShortcut.unregister('CommandOrControl+R');
    globalShortcut.unregister('CommandOrControl+Shift+R');
    globalShortcut.unregister('CommandOrControl+Shift+I');
    globalShortcut.unregister('F11');
    globalShortcut.unregister('F5');
  }
}

function setupAutoUpdater(mainWindow) {
  // Configuration
  autoUpdater.autoDownload = false;
  autoUpdater.allowPrerelease = false;

  // Events
  autoUpdater.on('update-available', (info) => {
    enforceLockdown();
    setUpdateLock('downloading', { version: info.version });
    mainWindow.webContents.send('update_available', info);
    
    // Exact auto-download policy: Trigger immediately
    autoUpdater.downloadUpdate();

    // Start Stall Detector
    startStallDetector(mainWindow);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    // Update timestamp to keep lock fresh
    setUpdateLock('downloading', { lastProgressAt: Date.now() });
    mainWindow.webContents.send('update_progress', progressObj);
    
    // Reset Stall Detector
    startStallDetector(mainWindow);
  });

  autoUpdater.on('update-downloaded', (info) => {
    stopStallDetector();
    setUpdateLock('downloaded', { version: info.version });
    mainWindow.webContents.send('update_downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    stopStallDetector();
    setUpdateLock('error', { error: err.message });
    mainWindow.webContents.send('update_error', err.message);
  });
}

function startStallDetector(mainWindow) {
  if (stallCheckInterval) clearInterval(stallCheckInterval);
  
  // Check every 1 minute if the last progress was > 15 minutes ago
  stallCheckInterval = setInterval(() => {
    const lock = getUpdateLock();
    if (lock && lock.status === 'downloading') {
      const lastActivity = lock.lastProgressAt || lock.timestamp;
      if (Date.now() - lastActivity > 15 * 60 * 1000) {
        // Stalled
        stopStallDetector();
        setUpdateLock('error', { error: 'Download stalled' });
        mainWindow.webContents.send('update_error', 'Download stalled (timeout)');
      }
    }
  }, 60 * 1000);
}

function stopStallDetector() {
  if (stallCheckInterval) clearInterval(stallCheckInterval);
  stallCheckInterval = null;
}

// ------------------------------------

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
    icon: path.join(__dirname, 'assets/icon.ico'),
    show: false,
  });

  // Setup Updater Listeners
  setupAutoUpdater(mainWindow);

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
    // DEBUG: Open DevTools in production to diagnose white screen
    // You can comment this out later if you want to hide devtools in prod
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Startup Update Logic
    if (!isDev) {
      // Check lock
      const lock = getUpdateLock();
      
      if (lock) {
        // Resume / Recover
        enforceLockdown();
        if (lock.status === 'downloaded') {
           mainWindow.webContents.send('update_downloaded', { version: lock.version });
        } else if (lock.status === 'downloading') {
           // Resume download
           mainWindow.webContents.send('update_available', { version: lock.version || 'unknown' });
           autoUpdater.downloadUpdate();
        } else if (lock.status === 'error') {
           mainWindow.webContents.send('update_error', lock.error || 'Previous update failed');
        }
      } 
      
      // Always check for updates on startup
      if (!lock || lock.status === 'error') {
          autoUpdater.checkForUpdates();
      }

      // Periodic Check (every 6 hours)
      setInterval(() => {
        autoUpdater.checkForUpdates();
      }, 6 * 60 * 60 * 1000);
    }
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

ipcMain.on('retry_update', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.on('unlock_app', () => {
  liftLockdown();
});

ipcMain.on('open_external', (event, url) => {
  shell.openExternal(url);
});

// Handle PDF generation (Keep existing logic)
ipcMain.handle('print-to-pdf', async (event, data) => {
  if (!isDev) {
    const lock = getUpdateLock();
    if (lock && (lock.status === 'downloading' || lock.status === 'downloaded')) {
      throw new Error('Update in progress. PDF generation disabled.');
    }
  }

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
      : `file://${path.join(__dirname, 'dist/index.html')}?invoice=true`;
    
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

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.mydesck.pro');
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
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