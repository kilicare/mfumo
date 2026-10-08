'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getApiError } from '@/lib/api';
import { notify } from '@/components/ui/AppToaster';
import { salesAPI, type Customer, type PaymentTerms, type SalesInvoice } from '@/lib/api/sales';
import type { Product } from '@/lib/api/products';
import type { LocationOption } from '@/lib/api/purchases';
import { useSalesStore } from '@/store/salesStore';
import { SalesHeading, SalesNotice, money, useSalesPermissions } from '@/components/sales/SalesPrimitives';

const input = 'min-h-10 w-full rounded-lg border border-[#dfe2d9] bg-white px-3 text-sm text-[#30342e] outline-none focus:border-[#718b11] focus:ring-2 focus:ring-[#718b11]/20';
const terms: PaymentTerms[] = ['COD', 'PREPAID', 'NET-7', 'NET-14', 'NET-30', 'NET-45', 'NET-60'];
type EditLine = { productId: string; quantity: string; unitPrice: string; discountAmount: string };
function hasMoreThanDecimals(value: number, places: number) { const scale = 10 ** places; return Math.abs(value * scale - Math.round(value * scale)) > 1e-8; }

export default function EditSalesInvoicePage() {
  const params = useParams<{ id: string }>(); const router = useRouter(); const id = params.id;
  const updateInvoice = useSalesStore((state) => state.updateInvoice); const permissions = useSalesPermissions();
  const [invoice, setInvoice] = useState<SalesInvoice | null>(null); const [customers, setCustomers] = useState<Customer[]>([]); const [products, setProducts] = useState<Product[]>([]); const [locations, setLocations] = useState<LocationOption[]>([]);
  const [customerId, setCustomerId] = useState(''); const [locationId, setLocationId] = useState(''); const [invoiceDate, setInvoiceDate] = useState(''); const [dueDate, setDueDate] = useState(''); const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('COD'); const [discountAmount, setDiscountAmount] = useState('0'); const [taxPercentage, setTaxPercentage] = useState('0'); const [notes, setNotes] = useState(''); const [lines, setLines] = useState<EditLine[]>([]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([salesAPI.invoice(id), salesAPI.customers(), salesAPI.products(), salesAPI.invoiceOptions()]).then(([row, cs, ps, options]) => {
      if (!live) return;
      setInvoice(row); setCustomers(cs); setProducts(ps); setLocations(options.locations); setCustomerId(row.customerId); setLocationId(row.locationId); setInvoiceDate(row.invoiceDate.slice(0, 10)); setDueDate(row.dueDate?.slice(0, 10) || ''); setPaymentTerms(row.paymentTerms as PaymentTerms); setDiscountAmount(String(row.discountAmount)); setTaxPercentage(String(row.taxPercentage)); setNotes(row.notes || '');
      setLines(row.items.map((item) => ({ productId: item.productId, quantity: String(item.quantity), unitPrice: String(item.unitPrice), discountAmount: String(item.discountAmount) })));
    }).catch((cause) => { if (live) setError(getApiError(cause, 'Could not load invoice edit data. Check customer, product and settings access.')); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!invoice || invoice.status !== 'DRAFT') { setError('Only draft invoices can be edited.'); return; }
    if (dueDate && dueDate < invoiceDate) { setError('Due date cannot be before invoice date.'); return; }
    const items = lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), ...(line.discountAmount !== '' ? { discountAmount: Number(line.discountAmount) } : {}) }));
    if (!customerId || !locationId || !items.length || items.some((line) => !line.productId || !Number.isFinite(line.quantity) || line.quantity <= 0 || hasMoreThanDecimals(line.quantity, 4) || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || hasMoreThanDecimals(line.unitPrice, 4) || (line.discountAmount !== undefined && (!Number.isFinite(line.discountAmount) || line.discountAmount < 0 || hasMoreThanDecimals(line.discountAmount, 2))))) { setError('Choose valid customer/location and enter valid product, quantity, price and line discount values.'); return; }
    if (!Number.isFinite(Number(discountAmount)) || Number(discountAmount) < 0 || hasMoreThanDecimals(Number(discountAmount), 2) || !Number.isFinite(Number(taxPercentage)) || Number(taxPercentage) < 0 || Number(taxPercentage) > 100 || hasMoreThanDecimals(Number(taxPercentage), 2)) { setError('Invoice discount and tax must use no more than two decimal places; tax must be from 0 to 100%.'); return; }
    setSaving(true);
    try { const updated = await updateInvoice(id, { customerId, locationId, invoiceDate, dueDate: dueDate || undefined, paymentTerms, discountAmount: Number(discountAmount), notes: notes.trim() || undefined, items }); notify.success(`Draft invoice ${updated.invoiceNumber} updated.`); router.push(`/dashboard/sales/invoices/${encodeURIComponent(updated.id)}`); }
    catch (cause) { const message = getApiError(cause, 'Could not update the draft invoice.'); setError(message); notify.error(message); }
    finally { setSaving(false); }
  }
  if (!permissions.canEdit) return <div className="mx-auto max-w-5xl p-5"><SalesNotice>Your account does not have permission to edit sales invoices.</SalesNotice></div>;
  if (invoice?.status === 'DRAFT' && !permissions.canDiscount && (invoice.discountAmount > 0 || invoice.items.some((item) => item.discountAmount > 0))) return <div className="mx-auto max-w-5xl p-5"><SalesHeading title="Edit draft invoice" description={invoice.invoiceNumber} /><SalesNotice>This draft contains discounts. Your role needs sales.discount to edit discounted invoices.</SalesNotice></div>;
  return <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8"><SalesHeading title="Edit draft invoice" description={invoice ? invoice.invoiceNumber : 'Update a draft before issue.'} />{error ? <SalesNotice>{error}</SalesNotice> : null}{loading ? <p role="status">Loading invoice…</p> : null}{invoice && invoice.status !== 'DRAFT' ? <SalesNotice>Only DRAFT invoices can be edited.</SalesNotice> : null}
    {invoice?.status === 'DRAFT' ? <form onSubmit={submit} className="space-y-4"><section className="grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-semibold">Customer<select className={`${input} mt-1`} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>{customers.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="text-xs font-semibold">Location<select className={`${input} mt-1`} value={locationId} onChange={(e) => setLocationId(e.target.value)}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label className="text-xs font-semibold">Invoice date<input required type="date" className={`${input} mt-1`} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></label><label className="text-xs font-semibold">Due date<input type="date" min={invoiceDate} className={`${input} mt-1`} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label><label className="text-xs font-semibold">Terms<select className={`${input} mt-1`} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}>{terms.map((t) => <option key={t}>{t}</option>)}</select></label>{permissions.canDiscount ? <label className="text-xs font-semibold">Invoice discount<input type="number" min="0" step="0.01" className={`${input} mt-1`} value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} /></label> : null}<label className="text-xs font-semibold">Business tax rate (%)<input type="number" readOnly aria-readonly="true" className={`${input} mt-1 bg-[#f7f8f5]`} value={taxPercentage} /></label><label className="text-xs font-semibold">Notes<input className={`${input} mt-1`} value={notes} onChange={(e) => setNotes(e.target.value)} /></label></section>
      <section className="space-y-3 rounded-xl border bg-white p-4"><div className="flex justify-between"><h2 className="font-semibold">Invoice lines</h2><button type="button" onClick={() => setLines((all) => [...all, { productId: '', quantity: '1', unitPrice: '', discountAmount: '0' }])} className="rounded-lg border px-3 py-2 text-sm">Add item</button></div>{lines.map((line, i) => <div key={`${i}:${line.productId}`} className="grid grid-cols-1 gap-2 rounded-lg bg-[#f8f9f6] p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"><label className="text-xs font-semibold">Product<select className={`${input} mt-1`} value={line.productId} onChange={(e) => { const product = products.find((p) => p.id === e.target.value); setLines((all) => all.map((r, j) => j === i ? { ...r, productId: e.target.value, unitPrice: product ? String(product.sellingPrice) : '' } : r)); }}><option value="">Choose product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label><label className="text-xs font-semibold">Quantity<input type="number" min="0.0001" step="0.0001" className={`${input} mt-1`} value={line.quantity} onChange={(e) => setLines((all) => all.map((r, j) => j === i ? { ...r, quantity: e.target.value } : r))} /></label><label className="text-xs font-semibold">Unit price<input type="number" min="0" step="0.0001" className={`${input} mt-1`} value={line.unitPrice} onChange={(e) => setLines((all) => all.map((r, j) => j === i ? { ...r, unitPrice: e.target.value } : r))} /></label><label className="text-xs font-semibold">Line discount amount<input type="number" min="0" step="0.01" className={`${input} mt-1`} value={line.discountAmount} onChange={(e) => setLines((all) => all.map((r, j) => j === i ? { ...r, discountAmount: e.target.value } : r))} /></label><button type="button" disabled={lines.length <= 1} onClick={() => setLines((all) => all.filter((_, j) => j !== i))} className="self-end px-3 py-2 text-sm text-rose-700 disabled:opacity-40">Remove</button></div>)}<p className="text-xs text-[#747a68]">Discount values are sent as fixed line amounts; the server recalculates all totals.</p></section>
      <div className="flex justify-end gap-3"><Link href={`/dashboard/sales/invoices/${encodeURIComponent(id)}`} className="inline-flex min-h-10 items-center rounded-lg border px-4 text-sm">Cancel</Link><button disabled={saving} className="min-h-10 rounded-lg bg-[#20211f] px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save draft'}</button></div>
    </form> : null}{invoice ? <p className="mt-3 text-right text-xs text-[#747a68]">Current total: {money(invoice.totalAmount, invoice.currency)}</p> : null}</div>;
}
