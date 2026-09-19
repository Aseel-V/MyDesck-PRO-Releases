import type { LeadSubmission, LeadSubmissionAdapter, LeadSubmissionReceipt } from './leadModel';

export const MYDESCK_CONTACT_EMAIL = 'aseelshaheen621@gmail.com';

export class MailtoLeadSubmissionAdapter implements LeadSubmissionAdapter {
  readonly kind = 'mailto' as const;

  constructor(private readonly destination = MYDESCK_CONTACT_EMAIL) {}

  async submit(lead: LeadSubmission): Promise<LeadSubmissionReceipt> {
    const subject = `MyDesck PRO access request — ${lead.intent}`;
    const lines = [
      `Intent: ${lead.intent}`,
      `Name: ${lead.name}`,
      `Business: ${lead.businessName}`,
      `Email: ${lead.email}`,
      `Phone: ${lead.phone || 'Not provided'}`,
      `Country: ${lead.country}`,
      `Business type: ${lead.businessType}`,
      `Team size: ${lead.teamSize}`,
      `Language: ${lead.locale}`,
      '',
      lead.message?.trim() || 'No additional message.',
    ];
    const href = `mailto:${this.destination}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    window.location.assign(href);
    return { delivery: 'mailto', stored: false, handedOff: true };
  }
}
