export const FROZEN_OPERATIONS = new Set([
  'trip.create', 'trip.edit', 'traveler.write', 'payment.record', 'installment.record',
  'document.write', 'attachment.write', 'staff.write', 'admin.write',
]);

export function assertWriteAllowed(operation: string, maintenanceEnabled: boolean): void {
  if (maintenanceEnabled && FROZEN_OPERATIONS.has(operation)) throw Error('MIGRATION_MAINTENANCE_WRITE_BLOCKED');
}

export const MAINTENANCE_MESSAGE = 'Migration maintenance is active. Changes are temporarily unavailable.';
