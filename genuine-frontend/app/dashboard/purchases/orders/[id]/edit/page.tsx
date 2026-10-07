'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { getApiError } from '@/lib/api';
import { purchasesAPI, purchaseMoney, type LocationOption, type PurchaseOrder, type PurchaseProductOption, type SupplierOption } from '@/lib/api/purchases';
import { notify } from '@/components/ui/AppToaster';
import { useAuthStore } from '@/store/authStore';

type Line = { productId: string; quantity: string; unitPrice: string; discount: string };
const input = 'min-h-11 w-full rounded-xl border border-[#dfe2da] bg-white px-3 text-sm outline-none transition focus:border-[#829600] focus:ring-2 focus:ring-[#d8f04b]/40';
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dateValue = (s?: string) => s ? new Date(s).toISOString().slice(0, 10) : '';

export default function EditPurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const permissions = useAuthStore(s => s.user?.permissions ?? []);
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [products, setProducts] = useState<PurchaseProductOption[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [expected, setExpected] = useState('');
  const [shipping, setShipping] = useState('0');
  const [tax, setTax] = useState('0');
  const [notes, setNotes] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    Promise.all([purchasesAPI.order(id), purchasesAPI.suppliers(), purchasesAPI.locations(), purchasesAPI.products()])
      .then(([po, supplierRows, locationRows, productRows]) => {
        if (!active) return;
        setOrder(po);
        if (po.status !== 'DRAFT') throw new Error('Only DRAFT purchase orders can be edited.');
        setSuppliers(supplierRows.filter(x => x.isActive));
        setLocations(locationRows.filter(x => x.isActive));
        setProducts(productRows.filter(x => x.status === 'ACTIVE'));
        setSupplierId(po.supplierId);
        setLocationId(po.locationId);
        setExpected(dateValue(po.expectedDeliveryDate));
        setShipping(String(po.shippingCost));
        setTax(String(po.taxAmount));
        setNotes(po.notes ?? '');
        setReference(po.referenceNumber ?? '');
        setLines(po.items.map(item => ({ productId: item.productId, quantity: String(item.quantity), unitPrice: String(item.unitPrice), discount: String(item.discount) })));
      })
      .catch(e => { if (active) setError(getApiError(e, 'Could not load this draft purchase order.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const subtotal = useMemo(() => money(lines.reduce((sum, line) => sum + money(Math.max(0, (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) - (Number(line.discount) || 0))), 0)), [lines]);
  const total = money(subtotal + (Number(shipping) || 0) + (Number(tax) || 0));
  function updateLine(index: number, patch: Partial<Line>) {
    setLines(current => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  }
  function clearFieldError(key: string) {
    setFieldErrors(current => { if (!current[key]) return current; const next = { ...current }; delete next[key]; return next; });
  }
  function showFieldError(key: string, event: React.FormEvent<HTMLInputElement | HTMLSelectElement>) {
    event.preventDefault();
    const el = event.currentTarget;
    const minimum = 'min' in el ? el.min : '';
    const maximum = 'max' in el ? el.max : '';
    const message = el.validity.valueMissing ? 'This field is required.' : el.validity.rangeUnderflow ? `Enter a value of at least ${minimum || 'the minimum allowed'}.` : el.validity.rangeOverflow ? `Enter a value no greater than ${maximum || 'the maximum allowed'}.` : el.validity.stepMismatch ? 'Use no more than 2 decimal places.' : 'Enter a valid value.';
    setFieldErrors(current => ({ ...current, [key]: message }));
    requestAnimationFrame(() => { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  }
  function chooseProduct(index: number, productId: string) {
    const product = products.find(p => p.id === productId);
    updateLine(index, { productId, unitPrice: product ? String(product.buyingPrice) : '' });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (order?.status !== 'DRAFT') { setError('Only DRAFT purchase orders can be edited.'); return; }
    if (!supplierId || !locationId || !lines.length || lines.some(l => !l.productId || !Number.isFinite(Number(l.quantity)) || Number(l.quantity) <= 0 || !Number.isFinite(Number(l.unitPrice)) || Number(l.unitPrice) < 0 || Number(l.discount) < 0)) {
      setError('Choose a supplier and location, then complete every item with valid quantity, price and discount.'); return;
    }
    const excessiveDiscountIndex = lines.findIndex(l => Number(l.discount) > Number(l.quantity) * Number(l.unitPrice));
    if (excessiveDiscountIndex >= 0) {
      const key = `discount-${excessiveDiscountIndex}`;
      setFieldErrors(current => ({ ...current, [key]: 'Discount cannot exceed the line gross amount.' }));
      requestAnimationFrame(() => { const el = document.getElementById(`${key}-input`); el?.focus(); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
      return;
    }
    if (expected && order && expected < dateValue(order.orderDate)) { setError('Expected delivery date cannot be earlier than the order date.'); return; }
    setSaving(true);
    try {
      const updated = await purchasesAPI.updateOrder(id, {
        supplierId,
        locationId,
        expectedDeliveryDate: expected ? new Date(`${expected}T12:00:00`).toISOString() : null,
        items: lines.map(line => ({ productId: line.productId, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), discount: Number(line.discount) })),
        shippingCost: Number(shipping) || 0,
        taxAmount: Number(tax) || 0,
        notes: notes.trim(),
        referenceNumber: reference.trim(),
      });
      notify.success('Draft purchase order updated.');
      router.push(`/dashboard/purchases/orders/${updated.id}`);
    } catch (e) {
      setError(getApiError(e, 'Could not update the purchase order.'));
    } finally { setSaving(false); }
  }

  if (!permissions.includes('purchases.edit')) return <Gate text="Your account is not allowed to edit purchase orders in this workspace."/>;
  if (loading) return <div className="flex items-center gap-2 rounded-2xl border bg-white p-8 text-sm text-[#73766f]"><Loader2 className="animate-spin" size={18}/>Loading draft purchase order…</div>;
  return <div className="mx-auto w-full max-w-4xl space-y-5">
    <Link href={`/dashboard/purchases/orders/${id}`} className="inline-flex items-center gap-2 text-sm font-medium text-[#63685f] hover:text-[#20211f]"><ArrowLeft size={16}/>Back to purchase order</Link>
    <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#738900]">Purchases · {order?.poNumber}</p><h1 className="mt-2 text-3xl font-semibold">Edit purchase order</h1><p className="mt-2 text-sm text-[#73766f]">Changes are allowed while the order is DRAFT. Order date and PO number stay unchanged.</p></header>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#efd4cf] bg-[#fff7f5] p-4 text-sm text-[#9b3730]"><AlertCircle size={18} className="mt-0.5 shrink-0"/>{error}</div>}
    {order && <form onSubmit={submit} className="space-y-5">
      <section className="grid gap-4 rounded-2xl border border-[#e6e8e1] bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <label className="text-sm font-medium">Supplier<select required value={supplierId} onInvalid={e=>showFieldError('supplier',e)} aria-invalid={!!fieldErrors.supplier} aria-describedby={fieldErrors.supplier?'supplier-error':undefined} onChange={e=>{setSupplierId(e.target.value);clearFieldError('supplier')}} className={`${input} mt-1.5`}><option value="">Choose supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name} · {s.supplierCode}</option>)}{!suppliers.some(s=>s.id===supplierId)&&<option value={supplierId}>{order.supplierName} · current supplier</option>}</select>{fieldErrors.supplier&&<span id="supplier-error" role="alert" className="mt-1 block text-xs font-medium text-[#a63832]">{fieldErrors.supplier}</span>}</label>
        <label className="text-sm font-medium">Receive into location<select required value={locationId} onInvalid={e=>showFieldError('location',e)} aria-invalid={!!fieldErrors.location} aria-describedby={fieldErrors.location?'location-error':undefined} onChange={e=>{setLocationId(e.target.value);clearFieldError('location')}} className={`${input} mt-1.5`}><option value="">Choose location</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name} · {l.code}</option>)}{!locations.some(l=>l.id===locationId)&&<option value={locationId}>{order.locationName} · current location</option>}</select>{fieldErrors.location&&<span id="location-error" role="alert" className="mt-1 block text-xs font-medium text-[#a63832]">{fieldErrors.location}</span>}</label>
        <label className="text-sm font-medium">Order date<input type="date" disabled value={dateValue(order.orderDate)} className={`${input} mt-1.5 disabled:bg-[#f5f6f2] disabled:text-[#73766f]`}/></label>
        <label className="text-sm font-medium">Expected delivery<input type="date" min={dateValue(order.orderDate)} value={expected} onChange={e=>setExpected(e.target.value)} className={`${input} mt-1.5`}/></label>
        <label className="text-sm font-medium sm:col-span-2">Reference number<input maxLength={120} value={reference} onChange={e=>setReference(e.target.value)} className={`${input} mt-1.5`}/></label>
      </section>
      <section className="rounded-2xl border border-[#e6e8e1] bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Order items</h2><p className="mt-1 text-sm text-[#73766f]">Products must remain active. Prices are editable for this order.</p></div><button type="button" onClick={()=>setLines(current=>[...current,{productId:'',quantity:'1',unitPrice:'',discount:'0'}])} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe2da] px-3 text-sm font-semibold"><Plus size={16}/>Add item</button></div>
        <div className="mt-4 space-y-4">{lines.map((line,index)=><div key={index} className="grid gap-3 rounded-xl border border-[#eceee8] bg-[#fbfcf9] p-3 sm:grid-cols-[minmax(0,1.6fr)_0.65fr_0.8fr_0.8fr_auto] sm:items-end">
          <label className="text-xs font-semibold text-[#676c63]">Product<select required value={line.productId} onInvalid={e=>showFieldError(`product-${index}`,e)} aria-invalid={!!fieldErrors[`product-${index}`]} aria-describedby={fieldErrors[`product-${index}`]?`product-error-${index}`:undefined} onChange={e=>{chooseProduct(index,e.target.value);clearFieldError(`product-${index}`)}} className={`${input} mt-1 text-sm`}><option value="">Choose active product</option>{products.map(p=><option value={p.id} key={p.id}>{p.name} · {p.sku}</option>)}{!products.some(p=>p.id===line.productId)&&<option value={line.productId}>{order.items.find(i=>i.productId===line.productId)?.productName??'Current product'} · current</option>}</select>{fieldErrors[`product-${index}`]&&<span id={`product-error-${index}`} role="alert" className="mt-1 block text-xs font-medium text-[#a63832]">{fieldErrors[`product-${index}`]}</span>}</label>
          <label className="text-xs font-semibold text-[#676c63]">Quantity<input required type="number" min="0.01" step="0.01" value={line.quantity} onInvalid={e=>showFieldError(`quantity-${index}`,e)} aria-invalid={!!fieldErrors[`quantity-${index}`]} aria-describedby={fieldErrors[`quantity-${index}`]?`quantity-error-${index}`:undefined} onChange={e=>{updateLine(index,{quantity:e.target.value});clearFieldError(`quantity-${index}`)}} className={`${input} mt-1`}/>{fieldErrors[`quantity-${index}`]&&<span id={`quantity-error-${index}`} role="alert" className="mt-1 block text-xs font-medium text-[#a63832]">{fieldErrors[`quantity-${index}`]}</span>}</label>
          <label className="text-xs font-semibold text-[#676c63]">Unit price<input required type="number" min="0" step="0.01" value={line.unitPrice} onInvalid={e=>showFieldError(`price-${index}`,e)} aria-invalid={!!fieldErrors[`price-${index}`]} aria-describedby={fieldErrors[`price-${index}`]?`price-error-${index}`:undefined} onChange={e=>{updateLine(index,{unitPrice:e.target.value});clearFieldError(`price-${index}`)}} className={`${input} mt-1`}/>{fieldErrors[`price-${index}`]&&<span id={`price-error-${index}`} role="alert" className="mt-1 block text-xs font-medium text-[#a63832]">{fieldErrors[`price-${index}`]}</span>}</label>
          <label className="text-xs font-semibold text-[#676c63]">Discount<input id={`discount-${index}-input`} type="number" min="0" step="0.01" value={line.discount} onInvalid={e=>showFieldError(`discount-${index}`,e)} aria-invalid={!!fieldErrors[`discount-${index}`]} aria-describedby={fieldErrors[`discount-${index}`]?`discount-error-${index}`:undefined} onChange={e=>{updateLine(index,{discount:e.target.value});clearFieldError(`discount-${index}`)}} className={`${input} mt-1`}/>{fieldErrors[`discount-${index}`]&&<span id={`discount-error-${index}`} role="alert" className="mt-1 block text-xs font-medium text-[#a63832]">{fieldErrors[`discount-${index}`]}</span>}</label>
          <button type="button" disabled={lines.length===1} onClick={()=>setLines(current=>current.filter((_,i)=>i!==index))} aria-label="Remove item" className="grid h-11 w-11 place-items-center rounded-xl border border-[#efd4cf] text-[#a63832] disabled:opacity-40"><Trash2 size={17}/></button>
          <p className="text-right text-xs text-[#73766f] sm:col-span-5">Line total: {purchaseMoney(money(Math.max(0,(Number(line.quantity)||0)*(Number(line.unitPrice)||0)-(Number(line.discount)||0))))}</p>
        </div>)}</div>
      </section>
      <section className="grid gap-4 rounded-2xl border border-[#e6e8e1] bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6"><label className="text-sm font-medium">Shipping cost<input type="number" min="0" step="0.01" value={shipping} onChange={e=>setShipping(e.target.value)} className={`${input} mt-1.5`}/></label><label className="text-sm font-medium">Tax amount<input type="number" min="0" step="0.01" value={tax} onChange={e=>setTax(e.target.value)} className={`${input} mt-1.5`}/></label><label className="text-sm font-medium sm:col-span-2">Notes<textarea rows={3} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} className={`${input} mt-1.5 py-2`}/></label><div className="rounded-xl bg-[#f5f6f2] p-4 sm:col-span-2"><div className="flex justify-between text-sm"><span>Items subtotal</span><span>{purchaseMoney(subtotal)}</span></div><div className="mt-2 flex justify-between text-sm"><span>Shipping + tax</span><span>{purchaseMoney(money((Number(shipping)||0)+(Number(tax)||0)))}</span></div><div className="mt-3 flex justify-between border-t border-[#dfe2da] pt-3 text-lg font-bold"><span>Order total</span><span>{purchaseMoney(total)}</span></div></div></section>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Link href={`/dashboard/purchases/orders/${id}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#dfe2da] px-5 text-sm font-semibold">Cancel</Link><button disabled={saving||!products.length||!suppliers.length||!locations.length} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-transparent bg-[#20211f] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#343632] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#738900] disabled:opacity-50 dark:border-[#596347] dark:bg-[#050605] dark:text-[#e7e9e3] dark:hover:border-[#829600] dark:hover:bg-[#111510] dark:hover:shadow-[0_0_18px_rgba(216,240,75,0.12)] dark:focus-visible:outline-[#d8f04b]">{saving&&<Loader2 size={16} className="animate-spin"/>}Save changes</button></div>
    </form>}
  </div>;
}

function Gate({text}:{text:string}){return <section className="mx-auto max-w-2xl rounded-2xl border border-[#efd4cf] bg-white p-7 text-center"><AlertCircle className="mx-auto text-[#a63832]"/><h1 className="mt-3 text-xl font-semibold">Purchase order access required</h1><p className="mt-2 text-sm text-[#73766f]">{text}</p><Link href="/dashboard/purchases" className="mt-5 inline-flex min-h-10 items-center rounded-xl bg-[#20211f] px-4 text-sm font-semibold text-white">Back to purchases</Link></section>}
