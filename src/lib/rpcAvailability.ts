import { isMissingRpcError } from './queryRetryPolicy';
import { getSafeDatabaseErrorDiagnostic } from './safeError';

export type TravelRpcName = 'get_trip_details' | 'get_trip_dashboard_items' | 'get_trips_page';

const warned = new Set<TravelRpcName>();
const reportedAvailable = new Set<TravelRpcName>();
const availability = new Map<TravelRpcName, boolean>();

function projectHostname(): string {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL || '').hostname || 'unconfigured';
  } catch {
    return 'invalid-host';
  }
}

export function recordRpcSuccess(name: TravelRpcName): void {
  availability.set(name, true);
  if (import.meta.env.DEV && !reportedAvailable.has(name)) {
    reportedAvailable.add(name);
    console.info('[Travel RPC]', {
      projectHostname: projectHostname(),
      environment: import.meta.env.MODE,
      rpc: name,
      available: true,
    });
  }
}

export function recordRpcFallback(name: TravelRpcName, error: unknown): boolean {
  if (!isMissingRpcError(error)) return false;
  availability.set(name, false);
  if (!warned.has(name)) {
    warned.add(name);
    console.warn('[Travel RPC] Compatibility fallback active; deploy pending Travel Mode migrations.', {
      projectHostname: projectHostname(),
      environment: import.meta.env.MODE,
      rpc: name,
      available: false,
      ...(import.meta.env.DEV ? { error: getSafeDatabaseErrorDiagnostic(error) } : {}),
    });
  }
  return true;
}

export function getTravelRpcAvailability(): ReadonlyMap<TravelRpcName, boolean> {
  return availability;
}
