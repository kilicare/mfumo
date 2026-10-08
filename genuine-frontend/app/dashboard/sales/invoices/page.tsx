'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { salesAPI, type InvoiceStatus, type SalesInvoiceFilters } from '@/lib/api/sales';
import { getApiError } from '@/lib/api';
import { useSalesStore } from '@/store/salesStore';
import { SalesHeading, SalesNotice, StatusBadge, dateLabel, money, useSalesPermissions } from '@/components/sales/SalesPrimitives';

const statuses: InvoiceStatus[] = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];
const inputClass = 'min-h-10 w-full rounded-lg border border-[#dfe2d9] bg-white px-3 text-sm text-[#30342e] outline-none focus:border-[#718b11] focus:ring-2 focus:ring-[#718b11]/20';

export default function SalesInvoicesPage() {
  const { invoices, total, page, limit, isLoading, error, fetchInvoices } = useSalesStore();
  const permissions = useSalesPermissions();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [salespersonId, setSalespersonId] = useState('');
  const [sortBy, setSortBy] = useState<SalesInvoiceFilters['sortBy']>('createdAt');
  const [sortOrder, setSortOrder] = useState<SalesInvoiceFilters['sortOrder']>('desc');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [options, setOptions] = useState<{ locations: Array<{ id: string; name: string }>; salespeople: Array<{ id: string; name: string }> }>({ locations: [], salespeople: [] });
  const [pageError, setPageError] = useState('');
  const [filters, setFilters] = useState<SalesInvoiceFilters>({ page: 1, limit: 20 });

  useEffect(() => { void fetchInvoices(filters).catch(() => undefined); }, [fetchInvoices, filters]);
  useEffect(() => {
    if (!permissions.canViewCustomers) return;
    void salesAPI.customers().then(setCustomers).catch((cause) => setPageError(getApiError(cause, 'Customer filter is unavailable.')));
  }, [permissions.canViewCustomers]);
  useEffect(() => {
    if (!permissions.canView) return;
    void salesAPI.invoiceOptions().then(setOptions).catch((cause) => setPageError(getApiError(cause, 'Sales filters are unavailable.')));
  }, [permissions.canView]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setPageError('');
    if (from && to && from > to) { setPageError('Start date must be on or before end date.'); return; }
    setFilters({ search: search.trim() || undefined, status: (status || undefined) as InvoiceStatus | undefined,
      customerId: customerId || undefined, locationId: locationId || undefined, salespersonId: salespersonId || undefined,
      dateFrom: from || undefined, dateTo: to || undefined, sortBy, sortOrder, page: 1, limit: 20 });
  }

  function changePage(next: number) { setFilters((current) => ({ ...current, page: next })); }
  const pages = Math.max(1, Math.ceil(total / limit));

  if (!permissions.canView) return <SalesNotice>Your account does not have permission to view sales invoices.</SalesNotice>;
  return <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <div className="mb-4 flex justify-end"><Link href="/dashboard/sales/returns" className="text-sm font-semibold text-[#40580b] underline-offset-4 hover:underline">Sales returns</Link></div>
    <SalesHeading title="Sales invoices" description={`${total} invoices`} action={permissions.canCreate ? { href: '/dashboard/sales/invoices/new', label: 'New invoice' } : undefined} />
    {pageError ? <SalesNotice>{pageError}</SalesNotice> : null}
    {error ? <SalesNotice>{error}<button type="button" className="ml-2 font-semibold underline" onClick={() => void fetchInvoices(filters).catch(() => undefined)}>Retry</button></SalesNotice> : null}
    <form onSubmit={applyFilters} className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-[#e5e7e0] bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
      <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[#62685d]">Search</span><input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice or customer" /></label>
      <label><span className="mb-1 block text-xs font-semibold text-[#62685d]">Status</span><select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}</select></label>
      <label><span className="mb-1 block text-xs font-semibold text-[#62685d]">Customer</span><select className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!permissions.canViewCustomers}><option value="">All customers</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label><span className="mb-1 block text-xs font-semibold text-[#62685d]">Location</span><select className={inputClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">All locations</option>{options.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span className="mb-1 block text-xs font-semibold text-[#62685d]">Salesperson</span><select className={inputClass} value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)}><option value="">All salespeople</option>{options.salespeople.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span className="mb-1 block text-xs font-semibold text-[#62685d]">From</span><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label><span className="mb-1 block text-xs font-semibold text-[#62685d]">To</span><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <label><span className="mb-1 block text-xs font-semibold text-[#62685d]">Sort by</span><select className={inputClass} value={sortBy} onChange={(e) => setSortBy(e.target.value as SalesInvoiceFilters['sortBy'])}><option value="createdAt">Created date</option><option value="invoiceNumber">Invoice number</option><option value="totalAmount">Total amount</option><option value="invoiceDate">Invoice date</option><option value="dueDate">Due date</option></select></label>
      <label><span className="mb-1 block text-xs font-semibold text-[#62685d]">Sort order</span><select className={inputClass} value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SalesInvoiceFilters['sortOrder'])}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6"><button className="min-h-10 rounded-lg bg-[#20211f] px-4 text-sm font-semibold text-white">Apply filters</button><button type="button" className="min-h-10 rounded-lg border border-[#dfe2d9] px-4 text-sm font-semibold text-[#454a42]" onClick={() => { setSearch(''); setStatus(''); setCustomerId(''); setLocationId(''); setSalespersonId(''); setFrom(''); setTo(''); setSortBy('createdAt'); setSortOrder('desc'); setPageError(''); setFilters({ page: 1, limit: 20 }); }}>Reset</button></div>
    </form>
    <section aria-label="Sales invoices" aria-busy={isLoading} className="overflow-hidden rounded-xl border border-[#e5e7e0] bg-white">
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-[#f7f8f5] text-xs uppercase tracking-wide text-[#73786e]"><tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Status</th></tr></thead>
        <tbody className="divide-y divide-[#eef0eb]">
          {isLoading && invoices.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-[#747a68]">Loading invoices…</td></tr> : null}
          {!isLoading && invoices.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-[#747a68]">No invoices match these filters.</td></tr> : null}
          {invoices.map((invoice) => <tr key={invoice.id} className="hover:bg-[#fbfcf9]"><td className="px-4 py-3 font-semibold"><Link className="text-[#40580b] underline-offset-4 hover:underline" href={`/dashboard/sales/invoices/${encodeURIComponent(invoice.id)}`}>{invoice.invoiceNumber}</Link></td><td className="px-4 py-3">{invoice.customerName}</td><td className="px-4 py-3">{dateLabel(invoice.invoiceDate)}</td><td className="px-4 py-3">{dateLabel(invoice.dueDate)}</td><td className="px-4 py-3 tabular-nums">{money(invoice.totalAmount, invoice.currency)}</td><td className="px-4 py-3 tabular-nums">{money(invoice.balance, invoice.currency)}</td><td className="px-4 py-3"><StatusBadge status={invoice.status} /></td></tr>)}
        </tbody>
      </table></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0eb] px-4 py-3 text-sm text-[#686e63]"><span>Showing {total ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, total)} of {total}</span><div className="flex items-center gap-2"><button type="button" disabled={page <= 1 || isLoading} onClick={() => changePage(page - 1)} className="min-h-9 rounded-lg border border-[#dfe2d9] px-3 disabled:opacity-40">Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages || isLoading} onClick={() => changePage(page + 1)} className="min-h-9 rounded-lg border border-[#dfe2d9] px-3 disabled:opacity-40">Next</button></div></div>
    </section>
  </div>;
}
