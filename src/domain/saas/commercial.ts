/**
 * SaaS commercial-domain contracts.
 *
 * This bounded context describes billing for access to MyDesck PRO itself.
 * It must never be joined implicitly with operational sales, trip payments,
 * installments, receipts, or any other customer business-finance records.
 */
export type CommercialCurrencyCode = string;
export type BillingInterval = 'monthly' | 'annual' | 'custom';

export interface Plan {
  id: string;
  code: string;
  displayName: string;
  status: 'draft' | 'active' | 'retired';
  currentVersionId?: string;
}

export interface PlanVersion {
  id: string;
  planId: string;
  version: number;
  effectiveFromIso?: string;
  effectiveUntilIso?: string;
  billingInterval?: BillingInterval;
  currency?: CommercialCurrencyCode;
  priceMinor?: number;
  entitlementIds: string[];
  status: 'draft' | 'published' | 'retired';
}

export interface FeatureEntitlement {
  id: string;
  key: string;
  area: 'core' | 'language' | 'client' | 'workflow' | 'finance' | 'reporting' | 'documents' | 'support';
  availability: 'included' | 'add-on' | 'unavailable' | 'vertical-dependent';
  usageLimitId?: string;
}

export interface Trial {
  id: string;
  billingCustomerId: string;
  planVersionId?: string;
  status: 'requested' | 'approved' | 'active' | 'expired' | 'cancelled';
  startsAtIso?: string;
  endsAtIso?: string;
}

export type SubscriptionStatus =
  | 'pending'
  | 'trialing'
  | 'active'
  | 'past-due'
  | 'paused'
  | 'cancelled'
  | 'ended';

export interface Subscription {
  id: string;
  billingCustomerId: string;
  workspaceId: string;
  planVersionId: string;
  status: SubscriptionStatus;
  currentPeriodStartIso?: string;
  currentPeriodEndIso?: string;
}

export interface BillingCustomer {
  id: string;
  accountId: string;
  workspaceId?: string;
  externalProviderRef?: string;
  billingEmail?: string;
}

export interface BillingEvent {
  id: string;
  billingCustomerId: string;
  subscriptionId?: string;
  type: 'trial-started' | 'trial-ended' | 'subscription-started' | 'subscription-changed' | 'subscription-ended' | 'invoice-status-changed';
  occurredAtIso: string;
  source: 'system' | 'operator' | 'future-billing-provider';
  idempotencyKey: string;
}

export interface UsageLimit {
  id: string;
  metric: string;
  period: 'workspace' | 'month' | 'year';
  softLimit?: number;
  hardLimit?: number;
  enforcement: 'informational' | 'warn' | 'block';
}
