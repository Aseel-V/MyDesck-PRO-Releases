import type { LeadSubmission, LeadValidationErrors } from './leadModel';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLeadSubmission(lead: LeadSubmission, requiredMessage: string, invalidEmailMessage: string): LeadValidationErrors {
  const errors: LeadValidationErrors = {};
  if (!lead.name.trim()) errors.name = requiredMessage;
  if (!lead.businessName.trim()) errors.businessName = requiredMessage;
  if (!lead.email.trim()) errors.email = requiredMessage;
  else if (!emailPattern.test(lead.email.trim())) errors.email = invalidEmailMessage;
  if (!lead.country.trim()) errors.country = requiredMessage;
  if (!lead.businessType) errors.businessType = requiredMessage;
  if (!lead.teamSize) errors.teamSize = requiredMessage;
  if (!lead.intent) errors.intent = requiredMessage;
  return errors;
}
