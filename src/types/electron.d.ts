// Extend the global Window interface for Electron preload APIs
declare global {
  interface Window {
    electronAPI?: {
      quitApp: () => void | Promise<void>;
    };
  }
}

// Required by TypeScript to make this a module
export {};
