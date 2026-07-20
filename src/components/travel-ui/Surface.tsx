import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type SurfaceLevel = 'raised' | 'quiet';

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  level?: SurfaceLevel;
}

const levelClasses: Record<SurfaceLevel, string> = {
  raised: 'border border-slate-200/80 bg-white shadow-sm dark:border-slate-800/80 dark:bg-slate-950/90 dark:shadow-slate-950/60',
  quiet: 'border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50',
};

export function Surface({ className, level = 'raised', ...props }: SurfaceProps) {
  return <div className={cn('rounded-2xl', levelClasses[level], className)} {...props} />;
}
