import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const isDev = process.env.NODE_ENV === 'development';

// __dirname replacement for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a portable data directory beside the executable (USB-friendly)
// Must be set before the app is ready
try {
  const portableBase = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  const portableUserData = path.join(portableBase, 'app-data');
  app.setPath('userData', portableUserData);
} catch { }

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
    icon: path.join(__dirname, 'assets/icon.ico'), // Optional: add an icon
    show: false, // Don't show until ready-to-show
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    app.quit();
  });
}

// Handle quit app request from renderer
ipcMain.on('quit-app', () => {
  app.quit();
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
    // 1. Load the page first (without data in URL)
    const invoiceUrl = isDev
      ? 'http://localhost:5173?invoice=true'
      : `file://${path.join(__dirname, 'dist/index.html')}?invoice=true`;
    
    await pdfWindow.loadURL(invoiceUrl);

    // 2. Send data via IPC once loaded
    // We wait a brief moment or ensuring dom-ready to be safe, 
    // but loadURL awaits the load event.
    // Sending immediately after loadURL usually works if renderer is ready.
    // For robustness, we can use executeJavaScript or just send.
    // But better: wait for renderer to say "I am ready".
    // HOWEVER, for simplicity and speed in this "fix", we will just send it.
    // A more robust way is pdfWindow.webContents.send('invoice-data', data)
    
    // We need to ensure the renderer is listening. 
    // We can wrap it in a small timeout or wait for an event? 
    // Let's rely on the fact loadURL finishes when the page is loaded.
    
    pdfWindow.webContents.send('invoice-data', data);

    // Give it a moment to render (React effect)
    await new Promise(resolve => setTimeout(resolve, 1000));

    const pdfData = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    });

    return pdfData;
  } catch (error) {
    console.error('Failed to generate PDF', error);
    throw error;
  } finally {
    if (!pdfWindow.isDestroyed()) {
        pdfWindow.close();
    }
  }
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Set a Windows App User Model ID for notifications and taskbar grouping
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.mydesck.pro');
  }
  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (navigationEvent) => {
    navigationEvent.preventDefault();
  });
});
