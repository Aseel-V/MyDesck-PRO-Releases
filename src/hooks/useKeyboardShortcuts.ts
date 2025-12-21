import { useEffect } from 'react';

interface ShortcutOptions {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    action: () => void;
    preventDefault?: boolean;
}

export function useKeyboardShortcuts(shortcuts: ShortcutOptions[]) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            shortcuts.forEach((shortcut) => {
                const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

                const ctrlPressed = event.ctrlKey || event.metaKey;
                const shiftPressed = event.shiftKey;
                const altPressed = event.altKey;

                const ctrlReq = !!shortcut.ctrlKey;
                const shiftReq = !!shortcut.shiftKey;
                const altReq = !!shortcut.altKey;

                if (
                    keyMatch &&
                    ctrlPressed === ctrlReq &&
                    shiftPressed === shiftReq &&
                    altPressed === altReq
                ) {
                    if (shortcut.preventDefault) {
                        event.preventDefault();
                    }
                    shortcut.action();
                }
            });
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts]);
}
