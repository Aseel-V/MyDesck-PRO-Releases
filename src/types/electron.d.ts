// Extend the global Window interface for Electron preload APIs
declare global {
  interface Window {
    electronAPI?: {
      quitApp: () => void | Promise<void>;
      printToPDF: (data: any) => Promise<Uint8Array<ArrayBufferLike>>;
      onInvoiceData: (callback: (data: any) => void) => void;
      removeInvoiceDataListeners: () => void;
      invoiceReady: () => void;
      // Auto-Update API
      onUpdateAvailable: (callback: (info: any) => void) => void;
      onUpdateProgress: (callback: (progress: any) => void) => void;
      onUpdateDownloaded: (callback: (info: any) => void) => void;
      onUpdateError: (callback: (err: string) => void) => void;
      startDownload: () => void;
      retryUpdate: () => void;
      restartApp: () => void;
      openExternal: (url: string) => void;
      removeAllUpdateListeners: () => void;
    };
  }
}

// Required by TypeScript to make this a module
export {};
