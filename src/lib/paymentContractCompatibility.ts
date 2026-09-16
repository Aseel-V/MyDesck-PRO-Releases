import { getBackend } from '../data/backend';
import { isMissingRpcError } from './queryRetryPolicy';
import { getSafeDatabaseErrorDiagnostic } from './safeError';

export const REQUIRED_PAYMENT_WRITE_CONTRACT_VERSION = 4;

type ContractProbeResult = { data: number | null; error: unknown };
type ContractProbe = () => Promise<ContractProbeResult>;

export class PaymentContractCompatibilityError extends Error {
  readonly code = 'CANONICAL_PAYMENT_CONTRACT_REQUIRED';

  constructor() {
    super('CANONICAL_PAYMENT_CONTRACT_REQUIRED');
    this.name = this.code;
  }
}

async function probeConnectedDatabase(): Promise<ContractProbeResult> {
  return getBackend().travel.probePaymentContractVersion();
}

let cachedProbe: Promise<void> | null = null;

export async function requireCanonicalPaymentWriteContract(probe: ContractProbe = probeConnectedDatabase): Promise<void> {
  const execute = async () => {
    const { data, error } = await probe();
    if (error && !isMissingRpcError(error)) throw error;

    const version = typeof data === 'number' ? data : Number.NaN;
    if (error || !Number.isInteger(version) || version < REQUIRED_PAYMENT_WRITE_CONTRACT_VERSION) {
      if (import.meta.env.DEV) {
        console.warn('[Travel payment contract] Write blocked before save.', {
          requiredVersion: REQUIRED_PAYMENT_WRITE_CONTRACT_VERSION,
          detectedVersion: Number.isInteger(version) ? version : null,
          unavailable: Boolean(error && isMissingRpcError(error)),
          ...(error ? { error: getSafeDatabaseErrorDiagnostic(error) } : {}),
        });
      }
      throw new PaymentContractCompatibilityError();
    }
  };

  if (probe !== probeConnectedDatabase) return execute();
  cachedProbe ??= execute().catch((error) => {
    cachedProbe = null;
    throw error;
  });
  return cachedProbe;
}
