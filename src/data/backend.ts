import type { ProductBackend } from './domain/ProductBackend';

/**
 * The backend registered by the composition root.
 *
 * Registration happens once, before the first render. A UI module that runs before a backend is
 * registered is a wiring defect, so it fails loudly instead of silently reaching for a default.
 */
let registered: ProductBackend | null = null;

export function registerBackend(backend: ProductBackend): void {
  if (registered && registered !== backend) throw new Error('BACKEND_ALREADY_REGISTERED');
  registered = backend;
}

export function getBackend(): ProductBackend {
  if (!registered) throw new Error('BACKEND_NOT_REGISTERED');
  return registered;
}

/** Test seam only. */
export function resetBackendForTests(): void {
  registered = null;
}
