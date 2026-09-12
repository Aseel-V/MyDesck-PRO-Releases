export const RETRYABLE_CODES = new Set([4, 8, 10, 13, 14, 'DEADLINE_EXCEEDED', 'RESOURCE_EXHAUSTED', 'ABORTED', 'INTERNAL', 'UNAVAILABLE']);

export class ProductionWriter {
  constructor({ writeBatch, ledger, batchSize = 200, concurrency = 2, retryBudget = 5, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    if (batchSize < 1 || batchSize > 400 || concurrency < 1 || concurrency > 8) throw Error('UNSAFE_WRITER_LIMIT');
    this.writeBatch = writeBatch; this.ledger = ledger; this.batchSize = batchSize;
    this.concurrency = concurrency; this.retryBudget = retryBudget; this.sleep = sleep;
  }
  async write(stream, { migrationRunId, transformVersion }) {
    const metrics = { sourceRowsRead: 0, firestoreWrites: 0, verifiedDocuments: 0, failedDocuments: 0, retryCount: 0 };
    let batch = [];
    const pending = new Set();
    const writeCurrent = async (current) => {
      let attempt = 0;
      while (true) {
        attempt += 1;
        try {
          await this.writeBatch(current);
          for (const item of current) this.ledger.record({ ...item.ledger, migrationRunId, transformVersion, state: 'COPIED' });
          metrics.firestoreWrites += current.length;
          return;
        } catch (error) {
          const code = error?.code;
          if (!RETRYABLE_CODES.has(code) || attempt > this.retryBudget) {
            for (const item of current) this.ledger.record({ ...item.ledger, migrationRunId, transformVersion, state: 'FAILED', lastErrorCategory: RETRYABLE_CODES.has(code) ? 'RETRY_EXHAUSTED' : 'PERMANENT' });
            metrics.failedDocuments += current.length;
            throw error;
          }
          metrics.retryCount += 1;
          await this.sleep(Math.min(250 * 2 ** (attempt - 1), 8000));
        }
      }
    };
    const flush = async () => {
      if (!batch.length) return;
      const current = batch; batch = [];
      const task = writeCurrent(current);
      pending.add(task);
      task.then(() => pending.delete(task), () => pending.delete(task));
      if (pending.size >= this.concurrency) await Promise.race(pending);
    };
    for await (const item of stream) {
      metrics.sourceRowsRead += 1;
      if (this.ledger.isVerified(item.ledger.key, item.ledger.sourceHash)) { metrics.verifiedDocuments += 1; continue; }
      batch.push(item);
      if (batch.length >= this.batchSize) await flush();
    }
    await flush();
    await Promise.all(pending);
    return metrics;
  }
}
