// Extend the global Window interface for Electron preload APIs
declare global {
  interface Window {
    electronAPI?: {
      quitApp: () => void | Promise<void>;
      printToPDF: (data: any) => Promise<Uint8Array<ArrayBufferLike>>;
      onInvoiceData: (callback: (data: any) => void) => void;
      removeInvoiceDataListeners: () => void;
      invoiceReady: () => void;
    };
  }
}

// Required by TypeScript to make this a module
export {};
