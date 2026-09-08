import assert from 'node:assert/strict';
import { CardPaymentHandler, createPaymentService } from '../src/lib/payment/paymentService';
const handler = new CardPaymentHandler();
const service = createPaymentService();
for (const method of ['credit_card', 'debit_card'] as const) {
  const request = { amount: 10000, currency: 'ILS' as const, method };
  for (const result of [
    await handler.process(request),
    await service.processPayment(request),
    await service.processRefund({ originalTransactionId: 'external-reference', amount: 10000, reason: 'test' }, method),
    await service.voidTransaction('external-reference', method),
  ]) {
    assert.equal(result.success, false);
    assert.equal(result.authCode, undefined);
    assert.equal(result.terminalTransactionId, undefined);
    assert.ok(!result.transactionId || result.transactionId === 'external-reference');
  }
}
const split = await service.processMultiTender({ totalAmount: 10000, payments: [{ amount: 10000, currency: 'ILS', method: 'credit_card' }] });
assert.equal(split.success, false);
assert.equal(split.totalPaid, 0);
assert.equal(split.remaining, 10000);
console.log('Card charge, debit, refund, void and split-tender regression assertions passed.');
