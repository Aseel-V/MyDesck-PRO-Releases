/**
 * Platform administration contract (the Admin dashboard).
 */
import type { BusinessProfile, UserProfile } from './profiles';

export interface AdminUserUpdate {
  businessType: string;
  trialStartDate: string | null;
  subscriptionStatus: string;
  isSuspended: boolean;
}

export interface AdminCreateUserPayload {
  email: string;
  password: string;
  fullName: string;
  phoneNumber: string;
  role: string;
  businessName?: string;
  logoUrl?: string;
  currency?: string;
  language?: string;
  businessType?: string;
  businessId?: string;
}

/** Error code for a security mutation that the Spark runtime deliberately does not perform. */
export const OPERATOR_ONLY_SECURITY_MUTATION = 'OPERATOR_ONLY_SECURITY_MUTATION';

export interface AdminRepository {
  /** All user profiles, newest first (the source orders created_at DESC, NULLs first). */
  listUserProfiles(): Promise<UserProfile[]>;
  listBusinessProfiles(): Promise<BusinessProfile[]>;
  updateUserAdminFields(targetUserId: string, update: AdminUserUpdate): Promise<void>;
  createUser(payload: AdminCreateUserPayload): Promise<{ userId: string; businessId: string | null }>;
}
