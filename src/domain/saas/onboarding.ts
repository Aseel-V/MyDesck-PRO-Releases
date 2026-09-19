/**
 * Application-side onboarding contracts only.
 *
 * These types deliberately contain no persistence, authentication, tenant
 * creation, or account-provisioning behavior. A trusted server workflow must
 * own those operations before public self-service onboarding is enabled.
 */
export type BusinessTypeSelection =
  | 'travel-agency'
  | 'supermarket'
  | 'restaurant'
  | 'auto-repair';

export type LocaleSelection = 'en' | 'ar' | 'he';

export interface CurrencySelection {
  code: string;
  source: 'recommended' | 'user-selected';
}

export type TrialIntent = 'evaluate' | 'guided-demo' | 'team-pilot';
export type ImportIntent = 'none' | 'sample-data' | 'assess-existing-data';

export type OnboardingStep =
  | 'account'
  | 'workspace'
  | 'business-type'
  | 'language'
  | 'currency'
  | 'company-info'
  | 'sample-data'
  | 'dashboard';

export interface WorkspaceDraft {
  displayName: string;
  businessType?: BusinessTypeSelection;
  locale?: LocaleSelection;
  currency?: CurrencySelection;
  companyName?: string;
  countryCode?: string;
  trialIntent?: TrialIntent;
  importIntent?: ImportIntent;
}

export interface OnboardingSession {
  id: string;
  accountId: string;
  status: 'draft' | 'awaiting-provisioning' | 'provisioned' | 'cancelled';
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  workspace: WorkspaceDraft;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface OnboardingProvisioningRequest {
  sessionId: string;
  workspace: Required<Pick<WorkspaceDraft, 'displayName' | 'businessType' | 'locale' | 'currency' | 'companyName' | 'countryCode'>>
    & Pick<WorkspaceDraft, 'trialIntent' | 'importIntent'>;
}

export interface OnboardingProvisioningPort {
  requestProvisioning(request: OnboardingProvisioningRequest): Promise<{
    status: 'accepted-for-review';
    requestId: string;
  }>;
}

export const onboardingStepOrder: readonly OnboardingStep[] = [
  'account',
  'workspace',
  'business-type',
  'language',
  'currency',
  'company-info',
  'sample-data',
  'dashboard',
] as const;
