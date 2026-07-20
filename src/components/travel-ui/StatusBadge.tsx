import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
}

const toneClasses: Record<StatusTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
  danger: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
};

export function StatusBadge({ className, tone = 'neutral', ...props }: StatusBadgeProps) {
  return <span className={cn('inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-none', toneClasses[tone], className)} {...props} />;
}
