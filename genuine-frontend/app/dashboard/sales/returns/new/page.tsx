'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getApiError } from '@/lib/api';
import { notify } from '@/components/ui/AppToaster';
import { salesAPI, type ReturnReason, type SalesInvoice, type SalesReturn } from '@/lib/api/sales';
import { useSalesStore } from '@/store/salesStore';
import { SalesHeading, SalesNotice, dateLabel, money, useSalesPermissions } from '@/components/sales/SalesPrimitives';

const input = 'min-h-10 w-full rounded-lg border border-[#dfe2d9] bg-white px-3 text-sm text-[#30342e] outline-none focus:border-[#718b11] focus:ring-2 focus:ring-[#718b11]/20';
const reasons: Array<{ value: ReturnReason; label: string }> = [
  { value: 'DEFECTIVE', label: 'Defective' }, { value: 'EXPIRED', label: 'Expired' },
  { value: 'WRONG_ITEM', label: 'Wrong item' }, { value: 'OVERAGE', label: 'Overage' },
  { value: 'CUSTOMER_REQUEST', label: 'Customer request' }, { value: 'OTHER', label: 'Other' },
];
type Line = { quantity: string; reason: ReturnReason | '' };

export default function NewSalesReturnPage() {
  const router = useRouter(); const search = useSearchParams(); const invoiceId = search.get('salesInvoiceId') || '';
  const createReturn = useSalesStore((state) => state.createReturn); const permissions = useSalesPermissions();
  const [invoice, setInvoice] = useState<SalesInvoice | null>(null); const [lines, setLines] = useState<Record<string, Line>>({});
  const [priorReturns, setPriorReturns] = useState<SalesReturn[]>([]);
  const [notes, setNotes] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    if (!invoiceId) { setError('An invoice ID is required to start a return.'); setLoading(false); return; }
    Promise.all([salesAPI.invoice(invoiceId), salesAPI.returns({ salesInvoiceId: invoiceId, page: 1, limit: 100 })]).then(async ([row, result]) => {
      const collected = [...result.data];
      const pages = Math.ceil(result.total / result.limit);
      for (let page = 2; page <= pages; page += 1) collected.push(...(await salesAPI.returns({ salesInvoiceId: invoiceId, page, limit: 100 })).data);
      if (live) { setInvoice(row); setPriorReturns(collected); setLines(Object.fromEntries(row.items.map((item) => [item.id, { quantity: '', reason: '' }]))); }
    }).catch((cause) => { if (live) setError(getApiError(cause, 'Could not load the invoice and its existing returns.')); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [invoiceId]);
  function setLine(id: string, value: Partial<Line>) { setLines((current) => ({ ...current, [id]: { ...current[id], ...value } })); }
  function alreadyRequested(itemId: string) { return priorReturns.filter((ret) => ret.status !== 'REJECTED').flatMap((ret) => ret.items).filter((line) => line.salesInvoiceItemId === itemId).reduce((sum, line) => sum + line.quantity, 0); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!invoice) return;
    if (['DRAFT', 'CANCELLED'].includes(invoice.status)) { setError('Returns require an issued invoice.'); return; }
    const items = invoice.items.filter((item) => Number(lines[item.id]?.quantity) > 0).map((item) => ({
      salesInvoiceItemId: item.id, quantity: Number(lines[item.id].quantity), reason: lines[item.id].reason as ReturnReason,
    }));
    if (!items.length || items.some((item) => !item.reason || !Number.isFinite(item.quantity) || item.quantity <= 0)) { setError('Add at least one positive return quantity and choose a reason for every line.'); return; }
    setSaving(true);
    try { await createReturn({ salesInvoiceId: invoice.id, items, notes: notes.trim() || undefined }); notify.success('Sales return request created.'); router.push('/dashboard/sales/returns'); }
    catch (cause) { const message = getApiError(cause, 'Could not create the return. The server checks sold and previously returned quantities.'); setError(message); notify.error(message); }
    finally { setSaving(false); }
  }
  if (!permissions.canCreate) return <div className="mx-auto max-w-5xl p-5"><SalesNotice>Your account does not have permission to create sales returns.</SalesNotice></div>;
  return <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
    <div className="mb-4"><Link href={invoiceId ? `/dashboard/sales/invoices/${encodeURIComponent(invoiceId)}` : '/dashboard/sales/invoices'} className="text-sm font-semibold text-[#40580b]">← Back</Link></div>
    <SalesHeading title="New sales return" description={invoice ? `${invoice.invoiceNumber} · ${invoice.customerName}` : 'Create a return request from an issued invoice.'} />
    {error ? <SalesNotice>{error}</SalesNotice> : null}{loading ? <p role="status" className="py-10 text-center text-sm text-[#747a68]">Loading invoice…</p> : null}
    {invoice ? <><div className="mb-4 flex flex-wrap gap-4 rounded-xl border border-[#e5e7e0] bg-white p-4 text-sm"><span>Invoice date: <strong>{dateLabel(invoice.invoiceDate)}</strong></span><span>Invoice status: <strong>{invoice.status}</strong></span><span>Original total: <strong>{money(invoice.totalAmount, invoice.currency)}</strong></span></div>
      <form onSubmit={submit} className="space-y-4"><section className="overflow-hidden rounded-xl border border-[#e5e7e0] bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-[#f7f8f5] text-xs uppercase text-[#73786e]"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Sold qty</th><th className="px-4 py-3">Previously requested</th><th className="px-4 py-3">Available to return</th><th className="px-4 py-3">Return qty</th><th className="px-4 py-3">Reason</th></tr></thead><tbody className="divide-y divide-[#eef0eb]">{invoice.items.map((item) => { const reserved = alreadyRequested(item.id); const remaining = Math.max(0, item.quantity - reserved); return <tr key={item.id}><td className="px-4 py-3 font-medium">{item.productName}<span className="ml-2 text-xs text-[#747a68]">{item.productSku}</span></td><td className="px-4 py-3">{item.quantity}</td><td className="px-4 py-3">{reserved}</td><td className="px-4 py-3">{remaining}</td><td className="px-4 py-3"><input aria-label={`Return quantity for ${item.productName}`} type="number" min="0" max={remaining} step="0.0001" className={`${input} w-32`} value={lines[item.id]?.quantity ?? ''} onChange={(e) => setLine(item.id, { quantity: e.target.value })} /></td><td className="px-4 py-3"><select aria-label={`Return reason for ${item.productName}`} className={input} value={lines[item.id]?.reason ?? ''} onChange={(e) => setLine(item.id, { reason: e.target.value as ReturnReason | '' })}><option value="">Select reason</option>{reasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></td></tr>; })}</tbody></table></div><p className="border-t border-[#eef0eb] p-4 text-xs text-[#747a68]">Draft and authorized returns reserve quantity. The server rechecks this total during submission to handle concurrent requests. An authorized user must receive the return before stock and invoice balance change.</p></section>
        <label className="block rounded-xl border border-[#e5e7e0] bg-white p-4 text-sm font-semibold">Notes (optional)<textarea className={`${input} mt-2 min-h-24 py-2 font-normal`} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="flex justify-end gap-3"><Link href={`/dashboard/sales/invoices/${encodeURIComponent(invoice.id)}`} className="inline-flex min-h-10 items-center rounded-lg border border-[#dfe2d9] px-4 text-sm font-semibold">Cancel</Link><button disabled={saving || loading} className="min-h-10 rounded-lg bg-[#20211f] px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Creating…' : 'Create return request'}</button></div>
      </form></> : null}
  </div>;
}
