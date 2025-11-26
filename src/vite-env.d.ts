/// <reference types="vite/client" />

interface Window {
    electronAPI: {
        quitApp: () => void;
        printToPDF: (data: any) => Promise<Uint8Array>;
    };
}
