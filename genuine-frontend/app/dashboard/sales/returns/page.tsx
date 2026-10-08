'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { salesAPI, type ReturnStatus, type SalesInvoice, type SalesReturnFilters } from '@/lib/api/sales';
import { getApiError } from '@/lib/api';
import { notify } from '@/components/ui/AppToaster';
import { useSalesStore } from '@/store/salesStore';
import { SalesHeading, SalesNotice, StatusBadge, dateLabel, money, useSalesPermissions } from '@/components/sales/SalesPrimitives';

const input = 'min-h-10 w-full rounded-lg border border-[#dfe2d9] bg-white px-3 text-sm text-[#30342e] outline-none focus:border-[#718b11] focus:ring-2 focus:ring-[#718b11]/20';
const statuses: ReturnStatus[] = ['DRAFT', 'AUTHORIZED', 'RECEIVED', 'COMPLETED', 'REJECTED'];

export default function SalesReturnsPage() {
  const { returns, total, page, limit, isLoading, error, fetchReturns, authorizeReturn, receiveReturn, rejectReturn } = useSalesStore();
  const permissions = useSalesPermissions();
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('');
  const [salesInvoiceId, setSalesInvoiceId] = useState('');
  const [invoiceOptions, setInvoiceOptions] = useState<Array<Pick<SalesInvoice, 'id' | 'invoiceNumber'>>>([]);
  const [filters, setFilters] = useState<SalesReturnFilters>({ page: 1, limit: 20 });
  const [actionId, setActionId] = useState(''); const [rejectId, setRejectId] = useState('');
  const [reason, setReason] = useState(''); const [actionError, setActionError] = useState('');
  useEffect(() => { void fetchReturns(filters).catch(() => undefined); }, [fetchReturns, filters]);
  useEffect(() => { if (!permissions.canView) return; void salesAPI.invoices({ page: 1, limit: 100 }).then((result) => setInvoiceOptions(result.data.map(({ id, invoiceNumber }) => ({ id, invoiceNumber })))).catch((cause) => setActionError(getApiError(cause, 'Invoice filter options are unavailable.'))); }, [permissions.canView]);
  function apply(event: FormEvent) { event.preventDefault(); setFilters({ search: search.trim() || undefined, status: (status || undefined) as ReturnStatus | undefined, salesInvoiceId: salesInvoiceId || undefined, page: 1, limit: 20 }); }
  async function transition(id: string, action: 'authorize' | 'receive' | 'reject') {
    setActionId(id); setActionError('');
    try {
      if (action === 'authorize') { await authorizeReturn(id); notify.success('Sales return authorized.'); }
      if (action === 'receive') { await receiveReturn(id); notify.success('Sales return received into stock.'); }
      if (action === 'reject') { if (!reason.trim()) { setActionError('Enter a rejection reason.'); return; } await rejectReturn(id, reason.trim()); setRejectId(''); setReason(''); notify.success('Sales return rejected.'); }
    } catch (cause) { const message = getApiError(cause, `Could not ${action} the return.`); setActionError(message); notify.error(message); }
    finally { setActionId(''); }
  }
  if (!permissions.canView) return <div className="mx-auto max-w-7xl p-5"><SalesNotice>Your account does not have permission to view sales returns.</SalesNotice></div>;
  return <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <SalesHeading title="Sales returns" description={`${total} return requests`} />
    {error || actionError ? <SalesNotice>{actionError || error}<button type="button" className="ml-2 underline" onClick={() => void fetchReturns(filters).catch(() => undefined)}>Retry</button></SalesNotice> : null}
    <form onSubmit={apply} className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-[#e5e7e0] bg-white p-4 sm:grid-cols-[2fr_1fr_1fr_auto_auto]"><label className="text-xs font-semibold text-[#62685d]">Search<input className={`${input} mt-1`} placeholder="Return, invoice or customer" value={search} onChange={(e) => setSearch(e.target.value)} /></label><label className="text-xs font-semibold text-[#62685d]">Invoice<select className={`${input} mt-1`} value={salesInvoiceId} onChange={(e) => setSalesInvoiceId(e.target.value)}><option value="">All invoices</option>{invoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber}</option>)}</select></label><label className="text-xs font-semibold text-[#62685d]">Status<select className={`${input} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map((s) => <option key={s}>{s}</option>)}</select></label><button className="min-h-10 self-end rounded-lg bg-[#20211f] px-4 text-sm font-semibold text-white">Apply</button><button type="button" className="min-h-10 self-end rounded-lg border border-[#dfe2d9] px-4 text-sm" onClick={() => { setSearch(''); setStatus(''); setSalesInvoiceId(''); setFilters({ page: 1, limit: 20 }); }}>Reset</button></form>
    <section aria-busy={isLoading} className="overflow-hidden rounded-xl border border-[#e5e7e0] bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#f7f8f5] text-xs uppercase text-[#73786e]"><tr><th className="px-4 py-3">Return</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Return total</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-[#eef0eb]">
      {isLoading && returns.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center">Loading returns…</td></tr> : null}
      {!isLoading && returns.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-[#747a68]">No returns match these filters.</td></tr> : null}
      {returns.map((ret) => <tr key={ret.id}><td className="px-4 py-3 font-semibold">{ret.returnNumber}</td><td className="px-4 py-3"><Link className="text-[#40580b] underline-offset-4 hover:underline" href={`/dashboard/sales/invoices/${encodeURIComponent(ret.salesInvoiceId)}`}>{ret.invoiceNumber}</Link></td><td className="px-4 py-3">{ret.customerName}</td><td className="px-4 py-3">{dateLabel(ret.createdAt)}</td><td className="px-4 py-3">{money(ret.totalReturnAmount, ret.currency)}</td><td className="px-4 py-3"><StatusBadge status={ret.status} /></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2">{ret.status === 'DRAFT' && permissions.canApprove ? <button type="button" disabled={!!actionId} onClick={() => void transition(ret.id, 'authorize')} className="rounded-md border px-2 py-1 text-xs font-semibold disabled:opacity-50">{actionId === ret.id ? 'Working…' : 'Authorize'}</button> : null}{ret.status === 'AUTHORIZED' && permissions.canApprove ? <button type="button" disabled={!!actionId} onClick={() => void transition(ret.id, 'receive')} className="rounded-md border px-2 py-1 text-xs font-semibold disabled:opacity-50">{actionId === ret.id ? 'Working…' : 'Receive into stock'}</button> : null}{['DRAFT', 'AUTHORIZED'].includes(ret.status) && permissions.canApprove ? <button type="button" disabled={!!actionId} onClick={() => { setRejectId(ret.id); setActionError(''); }} className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50">Reject</button> : null}</div></td></tr>)}
    </tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0eb] px-4 py-3 text-sm"><span>{total} returns</span><div className="flex items-center gap-2"><button disabled={page <= 1 || isLoading} onClick={() => setFilters((f) => ({ ...f, page: page - 1 }))} className="min-h-9 rounded-lg border px-3 disabled:opacity-40">Previous</button><span>Page {page} of {Math.max(1, Math.ceil(total / limit))}</span><button disabled={page >= Math.ceil(total / limit) || isLoading} onClick={() => setFilters((f) => ({ ...f, page: page + 1 }))} className="min-h-9 rounded-lg border px-3 disabled:opacity-40">Next</button></div></div></section>
    {rejectId ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation"><form role="dialog" aria-modal="true" aria-labelledby="reject-title" onSubmit={(e) => { e.preventDefault(); void transition(rejectId, 'reject'); }} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"><h2 id="reject-title" className="text-lg font-semibold">Reject return</h2><label className="mt-4 block text-sm font-medium">Reason<textarea autoFocus required minLength={1} className={`${input} mt-1 min-h-24 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} /></label><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => { setRejectId(''); setReason(''); }} className="min-h-10 rounded-lg border px-4 text-sm">Keep return</button><button disabled={!reason.trim() || !!actionId} className="min-h-10 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-50">Confirm rejection</button></div></form></div> : null}
  </div>;
}
