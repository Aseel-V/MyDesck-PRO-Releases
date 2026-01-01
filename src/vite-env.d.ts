/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface Window {
    electronAPI?: {
        quitApp: () => void | Promise<void>;
        printToPDF: (data: Record<string, unknown>) => Promise<Uint8Array>;
        onInvoiceData: (callback: (data: unknown) => void) => void;
        removeInvoiceDataListeners: () => void;
        invoiceReady: () => void;
        // Auto-Update API
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
    };
}
