import { useEffect, useRef } from 'react';

interface UseScanDetectionOptions {
  onScan: (barcode: string) => void;
  minLength?: number;
  timeOut?: number; // Time to wait for next character before clearing buffer
  ignoreIfFocusOn?: string[]; // IDs/Tags to ignore
}

export default function useScanDetection({
  onScan,
  minLength = 3,
  timeOut = 50, // Scanners are fast (typing is slower)
  ignoreIfFocusOn = ['INPUT', 'TEXTAREA']
}: UseScanDetectionOptions) {
  const buffer = useRef<string>('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      
      // Ignore if user is typing in an input field (unless it's the specific specific "global" listener case, but usually we want to avoid double triggers)
      // Actually, for a POS, we might want scanner to work ANYWHERE unless explicitly handled.
      // But if user types '123' manually in a quantity field, we don't want to trigger "Scan 123".
      // Scanners usually send 'Enter' at the end.
      
      if (ignoreIfFocusOn.includes(target.tagName) && !target.dataset.scannerInput) {
        return; 
      }

      // If key is Enter, and buffer has content, process it
      if (e.key === 'Enter') {
        if (buffer.current.length >= minLength) {
          e.preventDefault(); // Prevent form submission if any
          onScan(buffer.current);
          buffer.current = '';
        } else {
          buffer.current = ''; // Clear noise
        }
        return;
      }

      // If key is printable character, add to buffer
      if (e.key.length === 1) {
        // Clear previous timeout
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        buffer.current += e.key;

        // Set timeout to clear buffer if input is too slow (human typing)
        // Scanners typically send chars with <20ms delay. Humans >50ms.
        timeoutRef.current = setTimeout(() => {
          // If silence for too long, clear buffer (it was manual typing or noise)
          buffer.current = '';
        }, timeOut);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [onScan, minLength, timeOut, ignoreIfFocusOn]);
}
