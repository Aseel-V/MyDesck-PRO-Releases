import { useEffect, useState } from 'react';

export function useAnimatedInteger(target: number, from: number, active: boolean, duration = 650): number {
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (!active || from === target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const started = performance.now();
    setValue(from);
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, duration, from, target]);

  return value;
}
