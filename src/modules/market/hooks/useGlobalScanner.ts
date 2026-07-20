// ============================================================================
// GLOBAL BARCODE SCANNER HOOK
// Detects rapid keystrokes from barcode scanners vs. manual typing
// ============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

export interface UseGlobalScannerOptions {
  /** Callback when a barcode is scanned */
  onScan: (code: string) => void;
  /** Whether the scanner is enabled (default: true) */
  enabled?: boolean;
  /** Minimum length for valid barcode (default: 3) */
  minLength?: number;
  /** Maximum interval between keystrokes in ms (default: 50) */
  maxKeystrokeInterval?: number;
  /** Whether to pause when input/textarea is focused (default: true) */
  pauseOnInput?: boolean;
}

export interface UseGlobalScannerReturn {
  /** Whether scanner detection is currently active */
  isActive: boolean;
  /** Manually pause scanning (e.g., when modal opens) */
  pause: () => void;
  /** Resume scanning */
  resume: () => void;
  /** Last scanned code (for debugging) */
  lastCode: string | null;
}

/**
 * Hook to detect barcode scanner input globally.
 * 
 * Barcode scanners typically:
 * 1. Type characters very rapidly (< 50ms between keystrokes)
 * 2. End with an Enter key
 * 3. Don't trigger modifier keys (Shift for uppercase is allowed)
 * 
 * This distinguishes scanner input from human typing.
 */
export function useGlobalScanner(options: UseGlobalScannerOptions): UseGlobalScannerReturn {
  const {
    onScan,
    enabled = true,
    minLength = 3,
    maxKeystrokeInterval = 50,
    pauseOnInput = true,
  } = options;

  const [isActive, setIsActive] = useState(enabled);
  const [isPaused, setIsPaused] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);

  // Refs for tracking keystrokes
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable callback ref
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const resetBuffer = useCallback(() => {
    bufferRef.current = '';
    lastKeyTimeRef.current = 0;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    setIsPaused(true);
    resetBuffer();
  }, [resetBuffer]);

  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  useEffect(() => {
    setIsActive(enabled && !isPaused);
  }, [enabled, isPaused]);

  useEffect(() => {
    if (!isActive) {
      resetBuffer();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if we should pause for input/textarea focus
      if (pauseOnInput) {
        const target = event.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        const isEditable = target.isContentEditable;
        const isInput = tagName === 'input' || tagName === 'textarea';
        
        if (isInput || isEditable) {
          resetBuffer();
          return;
        }
      }

      const now = Date.now();
      const key = event.key;

      // Handle Enter key - finalize barcode
      if (key === 'Enter') {
        const code = bufferRef.current;
        
        // Check if we have a valid barcode
        if (code.length >= minLength) {
          // Verify the input was rapid (likely scanner)
          const avgInterval = now - lastKeyTimeRef.current;
          
          // If there's a buffer and it was entered quickly, treat as scan
          if (avgInterval < maxKeystrokeInterval * code.length) {
            event.preventDefault();
            event.stopPropagation();
            
            setLastCode(code);
            onScanRef.current(code);
          }
        }
        
        resetBuffer();
        return;
      }

      // Ignore modifier keys (except Shift which is used for uppercase)
      if (event.ctrlKey || event.altKey || event.metaKey) {
        resetBuffer();
        return;
      }

      // Ignore non-printable keys
      if (key.length !== 1) {
        return;
      }

      // Check timing - if too slow, reset buffer
      if (bufferRef.current.length > 0) {
        const timeSinceLast = now - lastKeyTimeRef.current;
        if (timeSinceLast > maxKeystrokeInterval * 2) {
          // Too slow - probably human typing
          resetBuffer();
        }
      }

      // Add character to buffer
      bufferRef.current += key;
      lastKeyTimeRef.current = now;

      // Set timeout to clear buffer if no more input
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        resetBuffer();
      }, maxKeystrokeInterval * 3);
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isActive, minLength, maxKeystrokeInterval, pauseOnInput, resetBuffer]);

  return {
    isActive,
    pause,
    resume,
    lastCode,
  };
}
