/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface SerialPortInfo {
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    vendorId?: string;
    productId?: string;
}

interface SerialResult {
    success: boolean;
    port?: string;
    data?: string;
    error?: string;
}

interface PrinterInfo {
    name: string;
    displayName: string;
    isDefault: boolean;
    status: number;
}

interface DisplayInfo {
    id: number;
    index: number;
    bounds: { x: number; y: number; width: number; height: number };
    isPrimary: boolean;
    label: string;
}

interface Window {
    electronAPI?: {
        quitApp: () => void | Promise<void>;
        printToPDF: (data: Record<string, unknown>) => Promise<Uint8Array>;
        onInvoiceData: (callback: (data: unknown) => void) => void;
        removeInvoiceDataListeners: () => void;
        invoiceReady: () => void;
        
        // Auto-Update API
        getAppVersion: () => Promise<string>;
        getUpdateState: () => Promise<{
            status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
            currentVersion: string;
            availableVersion?: string | null;
            progress: number;
            error?: string | null;
        }>;
        onUpdateState: (callback: (state: {
            status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
            currentVersion: string;
            availableVersion?: string | null;
            progress: number;
            error?: string | null;
        }) => void) => void;
        onUpdateAvailable: (callback: (info: { version: string; [key: string]: unknown }) => void) => void;
        onUpdateProgress: (callback: (progress: { percent: number; [key: string]: unknown }) => void) => void;
        onUpdateDownloaded: (callback: (info: { version: string; [key: string]: unknown }) => void) => void;
        onUpdateError: (callback: (err: string) => void) => void;
        startDownload: () => void;
        retryUpdate: () => void;
        restartApp: () => void;
        unlockApp: () => void;
        openExternal: (url: string) => void;
        removeAllUpdateListeners: () => void;

        // Enterprise: Thermal Printing
        getPrinters: () => Promise<PrinterInfo[]>;
        printTicket: (html: string, printerName: string, options?: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;

        // Enterprise: Customer Facing Display
        getDisplays: () => Promise<DisplayInfo[]>;
        openCustomerDisplay: (displayIndex?: number) => Promise<{ success: boolean; error?: string }>;
        closeCustomerDisplay: () => Promise<{ success: boolean }>;
        updateCustomerDisplay: (data: Record<string, unknown>) => void;
        onCustomerDisplayUpdate: (callback: (data: Record<string, unknown>) => void) => void;
        removeCustomerDisplayListeners: () => void;

        // Hardware: Serial Port Communication (Scales, EMV Terminals)
        serialListPorts: () => Promise<SerialPortInfo[]>;
        serialConnect: (port: string, baudRate?: number) => Promise<SerialResult>;
        serialDisconnect: (port: string) => Promise<SerialResult>;
        serialSend: (port: string, data: string, options?: { waitForResponse?: boolean; timeout?: number }) => Promise<SerialResult>;

        // Hardware: ESC/POS Thermal Printing
        printEscPos: (printerName: string, commands: string) => Promise<{ success: boolean; error?: string }>;

        // Hardware: Cash Drawer Control
        openCashDrawer: (printerName: string, method?: 'printer' | 'serial') => Promise<{ success: boolean; error?: string }>;

        // Currency: CORS-safe exchange rate fetching via main process
        fetchCurrencyRates: (base: string) => Promise<{ success: boolean; data?: import('./lib/currency').ExchangeRates; error?: string }>;

        // PDF temp file: write bytes to disk, return file:// URL for iframe preview
        saveTempPdf: (uint8Array: Uint8Array) => Promise<{ success: boolean; url?: string; error?: string }>;
        deleteTempPdf: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    };
}

