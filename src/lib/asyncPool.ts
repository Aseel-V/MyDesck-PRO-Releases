export interface PoolResult<T> {
  index: number;
  status: 'fulfilled' | 'rejected';
  value?: T;
  reason?: unknown;
}
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number, total: number) => void
): Promise<Array<PoolResult<R>>> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<PoolResult<R>>(items.length);
  let nextIndex = 0;
  let completed = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { index, status: 'fulfilled', value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { index, status: 'rejected', reason };
      } finally {
        completed += 1;
        onProgress?.(completed, items.length);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
}
