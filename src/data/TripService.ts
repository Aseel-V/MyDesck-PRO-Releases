import type { TravelRepositories, TripFilter, SaveTrip, PaymentCommand } from './contracts';

/** Business entry point: successful writes mean the server has confirmed them. */
export class TripService {
  constructor(readonly repositories: TravelRepositories) {}
  list(filter: TripFilter = {}) { return this.repositories.listTripsForBusiness(filter); }
  async details(id: string) {
    const [trip, travelers, plans, installments, events, audit, documents, attachments] = await Promise.all([
      this.repositories.getTripDetails(id), this.repositories.listTravelers(id),
      this.repositories.getPaymentPlans(id), this.repositories.listInstallments(id),
      this.repositories.listFinancialEvents(id), this.repositories.listAuditHistory(id),
      this.repositories.listDocuments(id), this.repositories.listAttachments(id),
    ]);
    return { trip, travelers, plans, installments, events, audit, documents, attachments };
  }
  save(input: SaveTrip) { return this.repositories.saveTrip(input); }
  pay(input: PaymentCommand) { return input.installmentId ? this.repositories.recordInstallmentPayment({ ...input, installmentId: input.installmentId }) : this.repositories.recordPayment(input); }
}
