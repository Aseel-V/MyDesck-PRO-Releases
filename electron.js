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
    icon: path.join(__dirname, 'assets/icon.ico'),
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
  shell.openExternal(url);
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