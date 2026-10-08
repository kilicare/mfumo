'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { getApiError } from '@/lib/api';
import { notify } from '@/components/ui/AppToaster';
import { salesAPI } from '@/lib/api/sales';
import type { PaymentMethodOption } from '@/lib/api/purchases';
import { useSalesStore } from '@/store/salesStore';
import { SalesHeading, SalesNotice, StatusBadge, dateLabel, money, useSalesPermissions } from '@/components/sales/SalesPrimitives';

const input = 'min-h-10 w-full rounded-lg border border-[#dfe2d9] bg-white px-3 text-sm text-[#30342e] outline-none focus:border-[#718b11] focus:ring-2 focus:ring-[#718b11]/20';

export default function SalesInvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { selectedInvoice: invoice, isLoading, error, fetchInvoice, issueInvoice, cancelInvoice, recordPayment } = useSalesStore();
  const permissions = useSalesPermissions();
  const [methods, setMethods] = useState<PaymentMethodOption[]>([]);
  const [methodError, setMethodError] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const paymentInFlight = useRef(false);
  const paymentAttempt = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => { if (permissions.canView) void fetchInvoice(id).catch(() => undefined); }, [fetchInvoice, id, permissions.canView]);
  useEffect(() => {
    if (permissions.canPay) void salesAPI.paymentMethods().then(setMethods).catch((cause) => setMethodError(getApiError(cause, 'Payment methods are unavailable.')));
  }, [permissions.canPay]);

  async function perform(label: string, operation: () => Promise<unknown>) {
    setBusy(true); setActionError('');
    try { await operation(); notify.success(label); }
    catch (cause) { const message = getApiError(cause, 'The action failed. No success was recorded.'); setActionError(message); notify.error(message); }
    finally { setBusy(false); }
  }
  async function pay(event: FormEvent) {
    event.preventDefault(); setActionError('');
    if (paymentInFlight.current) return;
    const amount = Number(paymentAmount);
    if (!invoice || !Number.isFinite(amount) || amount <= 0 || !paymentMethodId) { setActionError('Enter a positive amount and choose a payment method.'); return; }
    if (amount > invoice.balance + 0.000001) { setActionError(`Amount cannot exceed the current balance of ${money(invoice.balance, invoice.currency)}.`); return; }
    const input = { amount, paymentMethodId, reference: paymentReference.trim() || undefined, notes: paymentNotes.trim() || undefined };
    const signature = JSON.stringify(input);
    if (!paymentAttempt.current || paymentAttempt.current.signature !== signature) paymentAttempt.current = { signature, key: crypto.randomUUID() };
    paymentInFlight.current = true;
    await perform('Payment recorded. Invoice balances were refreshed from the server.', async () => {
      await recordPayment(id, input, paymentAttempt.current!.key);
      paymentAttempt.current = null;
      setPaymentAmount(''); setPaymentMethodId(''); setPaymentReference(''); setPaymentNotes(''); setShowPayment(false);
    });
    paymentInFlight.current = false;
  }
  async function cancel(event: FormEvent) {
    event.preventDefault();
    if (!cancelReason.trim()) { setActionError('Enter a cancellation reason.'); return; }
    await perform('Invoice cancelled.', async () => { await cancelInvoice(id, cancelReason.trim()); setShowCancel(false); setCancelReason(''); });
  }

  if (!permissions.canView) return <div className="mx-auto max-w-5xl p-5"><SalesNotice>Your account does not have permission to view sales invoices.</SalesNotice></div>;
  return <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
    <div className="mb-4"><Link href="/dashboard/sales/invoices" className="text-sm font-semibold text-[#40580b] underline-offset-4 hover:underline">← All invoices</Link></div>
    {error ? <SalesNotice>{error}<button type="button" className="ml-2 font-semibold underline" onClick={() => void fetchInvoice(id).catch(() => undefined)}>Retry</button></SalesNotice> : null}
    {actionError ? <SalesNotice>{actionError}</SalesNotice> : null}
    {isLoading && !invoice ? <p role="status" className="py-12 text-center text-sm text-[#747a68]">Loading invoice…</p> : null}
    {invoice ? <>
      <SalesHeading title={invoice.invoiceNumber} description={`${invoice.customerName} · ${invoice.locationName}`} />
      <section className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-[#e5e7e0] bg-white p-4 sm:grid-cols-4"><div><p className="text-xs text-[#747a68]">Status</p><div className="mt-1"><StatusBadge status={invoice.status} /></div></div><div><p className="text-xs text-[#747a68]">Invoice date</p><p className="mt-1 text-sm font-semibold">{dateLabel(invoice.invoiceDate)}</p></div><div><p className="text-xs text-[#747a68]">Due date</p><p className="mt-1 text-sm font-semibold">{dateLabel(invoice.dueDate)}</p></div><div><p className="text-xs text-[#747a68]">Terms</p><p className="mt-1 text-sm font-semibold">{invoice.paymentTerms}</p></div></section>
      <section className="mb-5 overflow-hidden rounded-xl border border-[#e5e7e0] bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-[#f7f8f5] text-xs uppercase text-[#73786e]"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Unit price</th><th className="px-4 py-3">Discount</th><th className="px-4 py-3">Line total</th></tr></thead><tbody className="divide-y divide-[#eef0eb]">{invoice.items.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium">{item.productName}<span className="ml-2 text-xs text-[#747a68]">{item.productSku}</span></td><td className="px-4 py-3">{item.quantity}</td><td className="px-4 py-3">{money(item.unitPrice, invoice.currency)}</td><td className="px-4 py-3">{money(item.discountAmount, invoice.currency)}{item.discountPercentage ? ` (${item.discountPercentage}%)` : ''}</td><td className="px-4 py-3 font-semibold">{money(item.lineTotal, invoice.currency)}</td></tr>)}</tbody></table></div>
        <div className="grid grid-cols-2 gap-y-2 border-t border-[#eef0eb] p-4 text-sm sm:ml-auto sm:max-w-sm"><span>Subtotal</span><span className="text-right">{money(invoice.subtotal, invoice.currency)}</span><span>Discount</span><span className="text-right">−{money(invoice.discountAmount, invoice.currency)}</span><span>Tax</span><span className="text-right">{money(invoice.taxAmount, invoice.currency)}</span><span className="font-bold">Invoice total</span><span className="text-right font-bold">{money(invoice.totalAmount, invoice.currency)}</span><span>Paid</span><span className="text-right">{money(invoice.totalPaid, invoice.currency)}</span><span>Return credits</span><span className="text-right">−{money(invoice.returnCredits, invoice.currency)}</span><span className="font-bold">Balance / customer credit</span><span className="text-right font-bold">{money(invoice.balance, invoice.currency)}</span></div>
      </section>
      {invoice.notes ? <p className="mb-5 rounded-lg bg-white p-4 text-sm text-[#555b50]">{invoice.notes}</p> : null}
      <div className="flex flex-wrap gap-2">
        {invoice.status === 'DRAFT' && permissions.canEdit && (permissions.canDiscount || (invoice.discountAmount === 0 && invoice.items.every((item) => item.discountAmount === 0))) ? <Link href={`/dashboard/sales/invoices/${encodeURIComponent(id)}/edit`} className="inline-flex min-h-10 items-center rounded-lg border border-[#dfe2d9] px-4 text-sm font-semibold">Edit draft</Link> : null}
        {invoice.status === 'DRAFT' && permissions.canApprove ? <button disabled={busy} onClick={() => void perform('Invoice issued. Stock updates are confirmed by the server.', () => issueInvoice(id))} className="min-h-10 rounded-lg bg-[#20211f] px-4 text-sm font-semibold text-white disabled:opacity-50">Issue invoice</button> : null}
        {['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status) && permissions.canPay && invoice.balance > 0 ? <button disabled={busy} onClick={() => setShowPayment((value) => !value)} className="min-h-10 rounded-lg bg-[#40580b] px-4 text-sm font-semibold text-white disabled:opacity-50">Record payment</button> : null}
        {!['CANCELLED', 'DRAFT'].includes(invoice.status) && permissions.canCreate ? <Link href={`/dashboard/sales/returns/new?salesInvoiceId=${encodeURIComponent(id)}`} className="inline-flex min-h-10 items-center rounded-lg border border-[#dfe2d9] px-4 text-sm font-semibold">Create return</Link> : null}
        {['DRAFT', 'ISSUED', 'OVERDUE'].includes(invoice.status) && invoice.totalPaid <= 0 && permissions.canCancel ? <button disabled={busy} onClick={() => { setShowCancel((value) => !value); setActionError(''); }} className="min-h-10 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 disabled:opacity-50">Cancel invoice</button> : null}
      </div>
      {showPayment ? <form onSubmit={pay} className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-[#dce8a2] bg-[#fbfdf3] p-4 sm:grid-cols-2"><h2 className="sm:col-span-2 font-semibold">Record customer payment</h2>{methodError ? <p className="sm:col-span-2 text-sm text-rose-700">{methodError}</p> : null}<label className="text-xs font-semibold">Amount (up to {money(invoice.balance, invoice.currency)})<input required type="number" min="0.01" max={invoice.balance} step="0.01" className={`${input} mt-1`} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></label><label className="text-xs font-semibold">Payment method<select required className={`${input} mt-1`} value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}><option value="">Choose method</option>{methods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label><label className="text-xs font-semibold">Reference (optional)<input className={`${input} mt-1`} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} /></label><label className="text-xs font-semibold">Notes (optional)<input className={`${input} mt-1`} value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} /></label><div className="flex gap-2 sm:col-span-2"><button disabled={busy || !methods.length} className="min-h-10 rounded-lg bg-[#20211f] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Recording…' : 'Submit payment'}</button><button type="button" onClick={() => setShowPayment(false)} className="min-h-10 rounded-lg border border-[#dfe2d9] px-4 text-sm">Close</button></div></form> : null}
      {showCancel ? <form onSubmit={cancel} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4"><label className="min-w-[240px] flex-1 text-xs font-semibold text-rose-900">Cancellation reason<input required minLength={1} className={`${input} mt-1`} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></label><button disabled={busy || !cancelReason.trim()} className="min-h-10 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-50">Confirm cancellation</button><button type="button" onClick={() => { setShowCancel(false); setCancelReason(''); }} className="min-h-10 rounded-lg border border-rose-200 px-4 text-sm">Keep invoice</button></form> : null}
    </> : null}
  </div>;
}
