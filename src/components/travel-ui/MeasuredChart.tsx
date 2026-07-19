import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

interface MeasuredChartProps {
  children: ReactNode;
  className: string;
  minimumSize?: number;
}

export function MeasuredChart({ children, className, minimumSize = 1 }: MeasuredChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => {
      const bounds = element.getBoundingClientRect();
      setReady(bounds.width >= minimumSize && bounds.height >= minimumSize);
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [minimumSize]);

  return (
    <div ref={containerRef} className={cn('min-h-[1px] w-full min-w-0', className)}>
      {ready ? children : null}
    </div>
  );
}
