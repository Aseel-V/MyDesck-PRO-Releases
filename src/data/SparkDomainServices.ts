import type {
  AnalyticsRepository, AuditRepository, BusinessRepository, FinancialEventRepository,
  InstallmentRepository, PaymentCommand, PaymentPlanRepository, PaymentRepository,
  SaveTrip, TravelerRepository, TripFilter, TripRepository,
} from './contracts';

/** Intent-oriented services for the untrusted Spark client. Authorization remains in Rules. */
export class PaymentService {
  constructor(private readonly repository: PaymentRepository) {}
  record(input: PaymentCommand) { return this.repository.recordPayment(input); }
}
export class InstallmentService {
  constructor(private readonly repository: InstallmentRepository) {}
  list(tripId: string) { return this.repository.listInstallments(tripId); }
  listDue(through: string) { return this.repository.listDueInstallments(through); }
  record(input: PaymentCommand & { installmentId: string }) { return this.repository.recordInstallmentPayment(input); }
}
export class PaymentPlanService {
  constructor(private readonly repository: PaymentPlanRepository) {}
  list(tripId: string) { return this.repository.getPaymentPlans(tripId); }
}
export class BusinessService {
  constructor(private readonly repository: BusinessRepository) {}
  current() { return this.repository.getCurrentBusiness(); }
}
export class TravelerService {
  constructor(private readonly repository: TravelerRepository) {}
  list(tripId: string) { return this.repository.listTravelers(tripId); }
}
export class AnalyticsService {
  constructor(private readonly repository: AnalyticsRepository) {}
  load() { return this.repository.getTravelAnalytics(); }
}
export class AuditService {
  constructor(private readonly repository: AuditRepository & FinancialEventRepository) {}
  async history(tripId: string) {
    const [audit, financialEvents] = await Promise.all([
      this.repository.listAuditHistory(tripId), this.repository.listFinancialEvents(tripId),
    ]);
    return { audit, financialEvents };
  }
}
export class SearchService {
  constructor(private readonly repository: TripRepository) {}
  async trips(term: string, filter: TripFilter = {}) {
    const normalized = term.trim().toLocaleLowerCase();
    const page = await this.repository.listTripsForBusiness(filter);
    if (!normalized) return page;
    return { ...page, items: page.items.filter((trip) =>
      `${trip.clientName} ${trip.destination}`.toLocaleLowerCase().includes(normalized)) };
  }
}
export class UserStaffService {
  changeRole(): never { throw Error('OPERATOR_ONLY_SECURITY_MUTATION'); }
  changeRootOwner(): never { throw Error('OPERATOR_ONLY_SECURITY_MUTATION'); }
  changeSuspension(): never { throw Error('OPERATOR_ONLY_SECURITY_MUTATION'); }
}
export class TripCommandService {
  constructor(private readonly repository: TripRepository) {}
  save(input: SaveTrip) { return this.repository.saveTrip(input); }
  setState(tripId: string, state: 'archive'|'restore'|'delete'|'unarchive', operationId: string) {
    return this.repository.setTripState(tripId, state, operationId);
  }
}
