'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiError } from '@/lib/api';
import { notify } from '@/components/ui/AppToaster';
import { salesAPI, type CreateSalesInvoiceInput, type Customer, type PaymentTerms } from '@/lib/api/sales';
import type { Product } from '@/lib/api/products';
import type { LocationOption } from '@/lib/api/purchases';
import { useSalesStore } from '@/store/salesStore';
import { SalesHeading, SalesNotice, money, useSalesPermissions } from '@/components/sales/SalesPrimitives';

const input = 'min-h-10 w-full rounded-lg border border-[#dfe2d9] bg-white px-3 text-sm text-[#30342e] outline-none focus:border-[#718b11] focus:ring-2 focus:ring-[#718b11]/20';
const terms: PaymentTerms[] = ['COD', 'PREPAID', 'NET-7', 'NET-14', 'NET-30', 'NET-45', 'NET-60'];
type Line = { productId: string; quantity: string; unitPrice: string; discountPercentage: string };
const blankLine = (): Line => ({ productId: '', quantity: '1', unitPrice: '', discountPercentage: '' });
function localDay() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function hasMoreThanDecimals(value: number, places: number) { const scale = 10 ** places; return Math.abs(value * scale - Math.round(value * scale)) > 1e-8; }

export default function NewSalesInvoicePage() {
  const router = useRouter();
  const createInvoice = useSalesStore((state) => state.createInvoice);
  const storeError = useSalesStore((state) => state.error);
  const permissions = useSalesPermissions();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(localDay());
  const [dueDate, setDueDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('COD');
  const [taxPercentage, setTaxPercentage] = useState('18');
  const [currency, setCurrency] = useState('TZS');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    setLoadingOptions(true);
    Promise.allSettled([
      permissions.canViewCustomers ? salesAPI.customers() : Promise.reject(new Error('Your account needs customers.view to choose a customer.')),
      permissions.canViewProducts ? salesAPI.products() : Promise.reject(new Error('Your account needs products.view to choose products.')),
      salesAPI.invoiceOptions(),
    ]).then((results) => {
      if (!live) return;
      const messages: string[] = [];
      if (results[0].status === 'fulfilled') setCustomers(results[0].value); else messages.push(getApiError(results[0].reason, 'Customer options could not be loaded.'));
      if (results[1].status === 'fulfilled') setProducts(results[1].value); else messages.push(getApiError(results[1].reason, 'Product options could not be loaded.'));
      if (results[2].status === 'fulfilled') { setLocations(results[2].value.locations); setTaxPercentage(String(results[2].value.taxPercentage)); setCurrency(results[2].value.currency); }
      else messages.push(getApiError(results[2].reason, 'Invoice locations and business tax settings could not be loaded.'));
      if (messages.length) setError(messages.join(' '));
    }).finally(() => { if (live) setLoadingOptions(false); });
    return () => { live = false; };
  }, [permissions.canViewCustomers, permissions.canViewProducts]);

  function updateLine(index: number, key: keyof Line, value: string) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, [key]: value } : line));
  }
  function selectProduct(index: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    setLines((current) => current.map((line, i) => i === index ? { ...line, productId, unitPrice: product ? String(product.sellingPrice) : '' } : line));
  }
  const subtotal = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * (1 - (Number(line.discountPercentage) || 0) / 100), 0);
  const taxableEstimate = Math.max(0, subtotal - (Number(discountAmount) || 0));
  const taxEstimate = Math.round((taxableEstimate * (Number(taxPercentage) || 0) / 100 + Number.EPSILON) * 100) / 100;
  const estimate = taxableEstimate + taxEstimate;

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!permissions.canCreate) { setError('Your account cannot create sales invoices.'); return; }
    if (!customerId || !locationId) { setError('Choose an active customer and location.'); return; }
    if (dueDate && dueDate < invoiceDate) { setError('Due date cannot be before invoice date.'); return; }
    const cleanLines = lines.map((line) => ({
      productId: line.productId, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice),
      ...(line.discountPercentage !== '' ? { discountPercentage: Number(line.discountPercentage) } : {}),
    }));
    if (cleanLines.some((line) => !line.productId || !Number.isFinite(line.quantity) || line.quantity <= 0 || hasMoreThanDecimals(line.quantity, 4) || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || hasMoreThanDecimals(line.unitPrice, 4) || (line.discountPercentage !== undefined && (line.discountPercentage < 0 || line.discountPercentage > 100 || hasMoreThanDecimals(line.discountPercentage, 4))))) {
      setError('Every line needs a product, a positive quantity, a nonnegative price, and a discount from 0 to 100%.'); return;
    }
    if (!Number.isFinite(Number(taxPercentage)) || Number(taxPercentage) < 0 || Number(taxPercentage) > 100 || hasMoreThanDecimals(Number(taxPercentage), 2)) { setError('Tax rate must be between 0 and 100 with at most two decimal places.'); return; }
    if (!Number.isFinite(Number(discountAmount)) || Number(discountAmount) < 0 || Number(discountAmount) > subtotal || hasMoreThanDecimals(Number(discountAmount), 2)) { setError('Invoice discount must be nonnegative, no more than the discounted subtotal, and use at most two decimal places.'); return; }
    const payload: CreateSalesInvoiceInput = { customerId, locationId, invoiceDate, dueDate: dueDate || undefined, paymentTerms, items: cleanLines, discountAmount: Number(discountAmount), notes: notes.trim() || undefined };
    setSaving(true);
    try { const created = await createInvoice(payload); notify.success(`Draft invoice ${created.invoiceNumber} created.`); router.push(`/dashboard/sales/invoices/${encodeURIComponent(created.id)}`); }
    catch (cause) { const message = getApiError(cause, 'Could not create the invoice.'); setError(message); notify.error(message); }
    finally { setSaving(false); }
  }

  if (!permissions.canCreate) return <div className="mx-auto max-w-5xl p-5"><SalesNotice>Your account does not have permission to create sales invoices.</SalesNotice></div>;
  return <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
    <SalesHeading title="New invoice" description="Create a draft. Stock changes only after an authorized user issues it." />
    {error || storeError ? <SalesNotice>{error || storeError}</SalesNotice> : null}
    {loadingOptions ? <p role="status" className="mb-4 text-sm text-[#747a68]">Loading customers, products and locations…</p> : null}
    <form onSubmit={submit} className="space-y-5">
      <section className="grid grid-cols-1 gap-4 rounded-xl border border-[#e5e7e0] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold text-[#62685d]">Customer<select required className={`${input} mt-1`} value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Choose customer</option>{customers.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.customerCode}</option>)}</select></label>
        <label className="text-xs font-semibold text-[#62685d]">Stock location<select required className={`${input} mt-1`} value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">Choose location</option>{locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-[#62685d]">Invoice date<input type="date" required className={`${input} mt-1`} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></label>
        <label className="text-xs font-semibold text-[#62685d]">Due date<input type="date" min={invoiceDate} className={`${input} mt-1`} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        <label className="text-xs font-semibold text-[#62685d]">Payment terms<select className={`${input} mt-1`} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}>{terms.map((term) => <option key={term}>{term}</option>)}</select></label>
        {permissions.canDiscount ? <label className="text-xs font-semibold text-[#62685d]">Invoice discount ({currency})<input type="number" min="0" step="0.01" className={`${input} mt-1`} value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} /></label> : null}
        <label className="text-xs font-semibold text-[#62685d]">Business tax rate (%)<input type="number" readOnly aria-readonly="true" className={`${input} mt-1 bg-[#f7f8f5]`} value={taxPercentage} /></label>
        <label className="text-xs font-semibold text-[#62685d]">Notes<input className={`${input} mt-1`} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </section>
      <section className="rounded-xl border border-[#e5e7e0] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold text-[#30342e]">Items</h2><button type="button" className="min-h-9 rounded-lg border border-[#dfe2d9] px-3 text-sm font-semibold" onClick={() => setLines((all) => [...all, blankLine()])}>Add item</button></div>
        <div className="space-y-3">{lines.map((line, index) => <div key={index} className="grid grid-cols-1 gap-3 rounded-lg bg-[#f8f9f6] p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <label className="text-xs font-semibold text-[#62685d]">Product<select required className={`${input} mt-1`} value={line.productId} onChange={(e) => selectProduct(index, e.target.value)}><option value="">Choose product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label>
          <label className="text-xs font-semibold text-[#62685d]">Quantity<input type="number" min="0.0001" step="0.0001" required className={`${input} mt-1`} value={line.quantity} onChange={(e) => updateLine(index, 'quantity', e.target.value)} /></label>
          <label className="text-xs font-semibold text-[#62685d]">Unit price<input type="number" min="0" step="0.0001" required className={`${input} mt-1`} value={line.unitPrice} onChange={(e) => updateLine(index, 'unitPrice', e.target.value)} /></label>
          {permissions.canDiscount ? <label className="text-xs font-semibold text-[#62685d]">Line discount %<input type="number" min="0" max="100" step="0.0001" className={`${input} mt-1`} value={line.discountPercentage} onChange={(e) => updateLine(index, 'discountPercentage', e.target.value)} /></label> : null}
          <button type="button" disabled={lines.length === 1} onClick={() => setLines((all) => all.filter((_, i) => i !== index))} className="min-h-10 self-end rounded-lg px-3 text-sm text-rose-700 underline disabled:opacity-40">Remove</button>
        </div>)}</div>
        <div className="mt-4 flex flex-wrap justify-end gap-x-8 gap-y-2 border-t border-[#eef0eb] pt-4 text-sm"><span>Subtotal after line discounts: <strong>{money(subtotal, currency)}</strong></span><span>Taxable amount: <strong>{money(taxableEstimate, currency)}</strong></span><span>Tax ({taxPercentage}%): <strong>{money(taxEstimate, currency)}</strong></span><span>Estimated total: <strong>{money(estimate, currency)}</strong></span></div>
        <p className="mt-2 text-xs text-[#747a68]">Tax defaults to the rate configured in Business settings (18% by default) and is calculated after discounts. The server recalculates all totals. Stock availability is checked when the invoice is issued.</p>
      </section>
      <div className="flex flex-wrap justify-end gap-3"><Link href="/dashboard/sales/invoices" className="inline-flex min-h-10 items-center rounded-lg border border-[#dfe2d9] px-4 text-sm font-semibold">Cancel</Link><button type="submit" disabled={saving || loadingOptions || !customers.length || !products.length || !locations.length} className="min-h-10 rounded-lg bg-[#20211f] px-5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Create draft invoice'}</button></div>
    </form>
  </div>;
}
