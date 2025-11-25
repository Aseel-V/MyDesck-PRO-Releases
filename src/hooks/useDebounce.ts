import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set the value after the delay
    const timeout = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup if the value changes before the delay ends
    return () => clearTimeout(timeout);

  }, [value, delay]);

  return debouncedValue;
}
