import { Check } from 'lucide-react';
import { onboardingStepOrder, type OnboardingStep } from '../../domain/saas/onboarding';

export interface OnboardingProgressProps {
  currentStep: OnboardingStep;
  completedSteps: readonly OnboardingStep[];
  labels: Record<OnboardingStep, string>;
  direction?: 'ltr' | 'rtl';
}

/**
 * Presentation-only readiness for the future trusted onboarding shell.
 * This component cannot create an account, workspace, tenant, or sample data.
 */
export function OnboardingProgress({ currentStep, completedSteps, labels, direction = 'ltr' }: OnboardingProgressProps) {
  return (
    <nav aria-label="Onboarding progress" dir={direction}>
      <ol className="grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {onboardingStepOrder.map((step, index) => {
          const complete = completedSteps.includes(step);
          const current = currentStep === step;
          return (
            <li key={step} aria-current={current ? 'step' : undefined} className={`rounded-xl border p-3 text-xs font-semibold ${current ? 'border-sky-700 bg-sky-50 text-sky-950' : complete ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-500'}`}>
              <span className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm">{complete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}</span>
              {labels[step]}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
