'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowLeft, Boxes, Loader2, Save, Tag, Trash2, X } from 'lucide-react';
import { getApiError } from '@/lib/api';
import { productsAPI, type Brand, type Category, type Unit } from '@/lib/api/products';
import { notify } from '@/components/ui/AppToaster';
import { useAuthStore } from '@/store/authStore';

const field = 'min-h-10 w-full min-w-0 rounded-xl border border-[#e0e5d8] bg-white px-3 text-sm text-[#292d27] outline-none focus:border-[#78930b] focus:ring-4 focus:ring-[#c9e600]/20';

export default function ProductCatalogsPage() {
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);
  const canView = permissions.includes('products.view');
  const canCreate = permissions.includes('products.create');
  const canEdit = permissions.includes('products.edit');
  const canDelete = permissions.includes('products.delete');
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [brandName, setBrandName] = useState('');
  const [brandDescription, setBrandDescription] = useState('');
  const [unitName, setUnitName] = useState('');
  const [unitSymbol, setUnitSymbol] = useState('');
  const [unitDescription, setUnitDescription] = useState('');
  const [unitConversion, setUnitConversion] = useState('1');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'category' | 'brand' | 'unit'; id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!canView) { setLoading(false); return; }
    setLoading(true); setError('');
    const [categoryResult, brandResult, unitResult] = await Promise.allSettled([productsAPI.categories(), productsAPI.brands(), productsAPI.units()]);
    if (categoryResult.status === 'fulfilled') setCategories(categoryResult.value); else setError(getApiError(categoryResult.reason, 'Categories could not be loaded.'));
    if (brandResult.status === 'fulfilled') setBrands(brandResult.value); else setError((current) => current || getApiError(brandResult.reason, 'Brands could not be loaded.'));
    if (unitResult.status === 'fulfilled') setUnits(unitResult.value); else setError((current) => current || getApiError(unitResult.reason, 'Units could not be loaded.'));
    setLoading(false);
  }, [canView]);

  useEffect(() => { void load(); }, [load]);

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!categoryName.trim()) { notify.error('Enter a category name.'); return; }
    setBusy(true);
    try {
      if (editingCategory) {
        const updated = await productsAPI.updateCategory(editingCategory.id, { name: categoryName.trim(), description: categoryDescription.trim(), parentCategoryId: parentId || null });
        setCategories((current) => current.map((item) => item.id === updated.id ? updated : item)); notify.success('Category updated.');
      } else {
        const created = await productsAPI.createCategory({ name: categoryName.trim(), description: categoryDescription.trim() || undefined, parentCategoryId: parentId || undefined });
        setCategories((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name))); notify.success('Category created.');
      }
      setEditingCategory(null); setCategoryName(''); setCategoryDescription(''); setParentId('');
    } catch (cause) { notify.error(getApiError(cause, 'Could not save category.')); }
    finally { setBusy(false); }
  }

  async function submitBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!brandName.trim()) { notify.error('Enter a brand name.'); return; }
    setBusy(true);
    try {
      if (editingBrand) {
        const updated = await productsAPI.updateBrand(editingBrand.id, { name: brandName.trim(), description: brandDescription.trim() });
        setBrands((current) => current.map((item) => item.id === updated.id ? updated : item)); notify.success('Business brand updated.');
      } else {
        const created = await productsAPI.createBrand({ name: brandName.trim(), description: brandDescription.trim() || undefined });
        setBrands((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name))); notify.success('Business brand created.');
      }
      setEditingBrand(null); setBrandName(''); setBrandDescription('');
    } catch (cause) { notify.error(getApiError(cause, 'Could not save brand.')); }
    finally { setBusy(false); }
  }

  async function submitUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const conversionFactor = Number(unitConversion);
    if (!unitName.trim() || !unitSymbol.trim()) { notify.error('Unit name and symbol are required.'); return; }
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) { notify.error('Conversion factor must be greater than zero.'); return; }
    setBusy(true);
    try {
      const input = { name: unitName.trim(), symbol: unitSymbol.trim(), description: unitDescription.trim(), conversionFactor };
      if (editingUnit) {
        const updated = await productsAPI.updateUnit(editingUnit.id, input);
        setUnits((current) => current.map((item) => item.id === updated.id ? updated : item)); notify.success('Business unit updated.');
      } else {
        const created = await productsAPI.createUnit(input);
        setUnits((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name))); notify.success('Business unit created.');
      }
      setEditingUnit(null); setUnitName(''); setUnitSymbol(''); setUnitDescription(''); setUnitConversion('1');
    } catch (cause) { notify.error(getApiError(cause, 'Could not save unit.')); }
    finally { setBusy(false); }
  }

  async function removePending() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      if (pendingDelete.kind === 'category') { await productsAPI.deleteCategory(pendingDelete.id); setCategories((current) => current.filter((item) => item.id !== pendingDelete.id)); }
      if (pendingDelete.kind === 'brand') { await productsAPI.deleteBrand(pendingDelete.id); setBrands((current) => current.filter((item) => item.id !== pendingDelete.id)); }
      if (pendingDelete.kind === 'unit') { await productsAPI.deleteUnit(pendingDelete.id); setUnits((current) => current.filter((item) => item.id !== pendingDelete.id)); }
      notify.success(`${pendingDelete.kind[0].toUpperCase()}${pendingDelete.kind.slice(1)} deleted.`); setPendingDelete(null);
    } catch (cause) { notify.error(getApiError(cause, `Could not delete ${pendingDelete.kind}. It may be in use.`)); }
    finally { setBusy(false); }
  }

  if (!canView) return <section className="mx-auto max-w-xl rounded-2xl border border-[#efd4cf] bg-white p-7 text-center"><AlertCircle className="mx-auto text-[#a63832]" /><h1 className="mt-3 text-lg font-bold text-[#292d27]">Products access required</h1><p className="mt-2 text-sm text-[#73766f]">Your account does not have `products.view` permission.</p></section>;

  return <div className="min-w-0 space-y-5">
    <header><Link href="/dashboard/products" className="inline-flex items-center gap-2 text-sm font-semibold text-[#65705c] hover:text-[#20211f]"><ArrowLeft size={16} />Back to products</Link><p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-[#617500]">Catalog setup</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-[#20231f] sm:text-3xl">Categories, brands and units</h1><p className="mt-1 text-sm text-[#73766f]">Shared standard catalog entries stay read-only; custom entries are scoped to this business.</p></header>
    {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#efd4cf] bg-[#fff8f6] p-4 text-sm text-[#96382f]">{error}<button type="button" onClick={() => void load()} className="font-bold underline">Retry</button></div> : null}
    {loading ? <div className="grid min-h-56 place-items-center text-sm text-[#73766f]"><span className="flex items-center gap-2"><Loader2 className="animate-spin" size={18} />Loading catalogs…</span></div> : <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <section className="min-w-0 rounded-2xl border border-[#e6e9e1] bg-white p-4 shadow-sm sm:p-5 xl:row-span-2">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[#617500]">Business catalog</p><h2 className="mt-1 text-lg font-bold text-[#292d27]">Categories <span className="text-sm font-medium text-[#858880]">({categories.length})</span></h2></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e4f58c] text-[#527000]"><Tag size={18} /></span></div>
        {canCreate || editingCategory ? <form onSubmit={submitCategory} className="mt-4 grid min-w-0 gap-2 rounded-xl bg-[#f8f9f6] p-3 sm:grid-cols-2"><label className="text-xs font-semibold text-[#545850]">Category name<input className={`${field} mt-1`} value={categoryName} onChange={(e) => setCategoryName(e.target.value)} maxLength={80} required /></label><label className="text-xs font-semibold text-[#545850]">Parent category<select className={`${field} mt-1`} value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">No parent</option>{categories.filter((category) => category.id !== editingCategory?.id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="text-xs font-semibold text-[#545850] sm:col-span-2">Description<input className={`${field} mt-1`} value={categoryDescription} onChange={(e) => setCategoryDescription(e.target.value)} maxLength={500} /></label><div className="flex gap-2 sm:col-span-2"><button type="submit" disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#20211f] px-3 text-xs font-bold text-white disabled:opacity-50"><Save size={14} />{editingCategory ? 'Save category' : 'Add category'}</button>{editingCategory ? <button type="button" onClick={() => { setEditingCategory(null); setCategoryName(''); setCategoryDescription(''); setParentId(''); }} className="min-h-9 rounded-lg border border-[#dfe5d3] px-3 text-xs font-semibold text-[#545850]">Cancel</button> : null}</div></form> : null}
        <div className="mt-3 divide-y divide-[#eef0eb]">{categories.map((category) => <div key={category.id} className="flex min-w-0 items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#343832]">{category.name}</p><p className="mt-0.5 truncate text-xs text-[#858880]">{category.description || 'No description'} · {category.productCount} products</p></div>{canEdit ? <button type="button" onClick={() => { setEditingCategory(category); setCategoryName(category.name); setCategoryDescription(category.description || ''); setParentId(category.parentCategoryId || ''); }} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#546044] hover:bg-[#f0f7c9]">Edit</button> : null}{canDelete ? <button type="button" aria-label={`Delete ${category.name}`} onClick={() => setPendingDelete({ kind: 'category', id: category.id, label: category.name })} className="rounded-lg p-2 text-[#a63832] hover:bg-[#fff0ed]"><Trash2 size={15} /></button> : null}</div>)}{!categories.length ? <p className="py-8 text-center text-sm text-[#858880]">No categories have been added.</p> : null}</div>
      </section>

      <section className="min-w-0 rounded-2xl border border-[#e6e9e1] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[#617500]">Business catalog</p><h2 className="mt-1 text-lg font-bold text-[#292d27]">Brands <span className="text-sm font-medium text-[#858880]">({brands.length})</span></h2></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf2ff] text-[#3468a8]"><Tag size={18} /></span></div>
        {canCreate || editingBrand ? <form onSubmit={submitBrand} className="mt-4 grid min-w-0 gap-2 rounded-xl bg-[#f8f9f6] p-3"><label className="text-xs font-semibold text-[#545850]">Brand name<input className={`${field} mt-1`} value={brandName} onChange={(e) => setBrandName(e.target.value)} maxLength={80} required /></label><label className="text-xs font-semibold text-[#545850]">Description<input className={`${field} mt-1`} value={brandDescription} onChange={(e) => setBrandDescription(e.target.value)} maxLength={160} /></label><div className="flex gap-2"><button type="submit" disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#20211f] px-3 text-xs font-bold text-white disabled:opacity-50"><Save size={14} />{editingBrand ? 'Save brand' : 'Add brand'}</button>{editingBrand ? <button type="button" onClick={() => { setEditingBrand(null); setBrandName(''); setBrandDescription(''); }} className="min-h-9 rounded-lg border border-[#dfe5d3] px-3 text-xs font-semibold text-[#545850]">Cancel</button> : null}</div></form> : null}
        <div className="mt-3 divide-y divide-[#eef0eb]">{brands.map((brand) => <div key={brand.id} className="flex min-w-0 items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#343832]">{brand.name}</p><p className="mt-0.5 truncate text-xs text-[#858880]">{brand.businessId ? 'This business' : 'Shared standard'} · {brand.productCount} products{brand.description ? ` · ${brand.description}` : ''}</p></div>{brand.businessId && canEdit ? <button type="button" onClick={() => { setEditingBrand(brand); setBrandName(brand.name); setBrandDescription(brand.description || ''); }} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#546044] hover:bg-[#f0f7c9]">Edit</button> : null}{brand.businessId && canDelete ? <button type="button" aria-label={`Delete ${brand.name}`} onClick={() => setPendingDelete({ kind: 'brand', id: brand.id, label: brand.name })} className="rounded-lg p-2 text-[#a63832] hover:bg-[#fff0ed]"><Trash2 size={15} /></button> : null}</div>)}{!brands.length ? <p className="py-8 text-center text-sm text-[#858880]">No brands in the available catalog yet.</p> : null}</div>
      </section>

      <section className="min-w-0 rounded-2xl border border-[#e6e9e1] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[#617500]">Measurement</p><h2 className="mt-1 text-lg font-bold text-[#292d27]">Units <span className="text-sm font-medium text-[#858880]">({units.length})</span></h2></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff0d3] text-[#93600c]"><Boxes size={18} /></span></div>
        {canCreate || editingUnit ? <form onSubmit={submitUnit} className="mt-4 grid min-w-0 gap-2 rounded-xl bg-[#f8f9f6] p-3 sm:grid-cols-2"><label className="text-xs font-semibold text-[#545850]">Unit name<input className={`${field} mt-1`} value={unitName} onChange={(e) => setUnitName(e.target.value)} maxLength={80} required /></label><label className="text-xs font-semibold text-[#545850]">Symbol<input className={`${field} mt-1`} value={unitSymbol} onChange={(e) => setUnitSymbol(e.target.value)} maxLength={16} required /></label><label className="text-xs font-semibold text-[#545850]">Conversion factor<input type="number" min="0.0001" step="0.0001" className={`${field} mt-1`} value={unitConversion} onChange={(e) => setUnitConversion(e.target.value)} required /></label><label className="text-xs font-semibold text-[#545850]">Description<input className={`${field} mt-1`} value={unitDescription} onChange={(e) => setUnitDescription(e.target.value)} maxLength={160} /></label><div className="flex gap-2 sm:col-span-2"><button type="submit" disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#20211f] px-3 text-xs font-bold text-white disabled:opacity-50"><Save size={14} />{editingUnit ? 'Save unit' : 'Add unit'}</button>{editingUnit ? <button type="button" onClick={() => { setEditingUnit(null); setUnitName(''); setUnitSymbol(''); setUnitDescription(''); setUnitConversion('1'); }} className="min-h-9 rounded-lg border border-[#dfe5d3] px-3 text-xs font-semibold text-[#545850]">Cancel</button> : null}</div></form> : null}
        <div className="mt-3 divide-y divide-[#eef0eb]">{units.map((unit) => <div key={unit.id} className="flex min-w-0 items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#343832]">{unit.name} <span className="font-normal text-[#73766f]">({unit.symbol})</span></p><p className="mt-0.5 truncate text-xs text-[#858880]">{unit.businessId ? 'This business' : 'Shared standard'} · Conversion factor {unit.conversionFactor}{unit.description ? ` · ${unit.description}` : ''}</p></div>{unit.businessId && canEdit ? <button type="button" onClick={() => { setEditingUnit(unit); setUnitName(unit.name); setUnitSymbol(unit.symbol); setUnitDescription(unit.description || ''); setUnitConversion(String(unit.conversionFactor)); }} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#546044] hover:bg-[#f0f7c9]">Edit</button> : null}{unit.businessId && canDelete ? <button type="button" aria-label={`Delete ${unit.name}`} onClick={() => setPendingDelete({ kind: 'unit', id: unit.id, label: unit.name })} className="rounded-lg p-2 text-[#a63832] hover:bg-[#fff0ed]"><Trash2 size={15} /></button> : null}</div>)}{!units.length ? <p className="py-8 text-center text-sm text-[#858880]">No units found.</p> : null}</div>
      </section>
    </div>}

    {pendingDelete ? <div role="presentation" className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setPendingDelete(null); }}><section role="alertdialog" aria-modal="true" aria-labelledby="catalog-delete-title" className="w-full max-w-md rounded-2xl border border-[#e6e9e1] bg-white p-5 shadow-2xl"><h2 id="catalog-delete-title" className="text-lg font-bold text-[#292d27]">Delete {pendingDelete.label}?</h2><p className="mt-2 text-sm leading-6 text-[#73766f]">The server will prevent deletion if products or historical records still use this catalog entry.</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setPendingDelete(null)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe5d3] px-4 text-sm font-semibold text-[#545850]"><X size={15} />Keep it</button><button type="button" disabled={busy} onClick={() => void removePending()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#a63832] px-4 text-sm font-bold text-white disabled:opacity-60">{busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={15} />}Delete</button></div></section></div> : null}
  </div>;
}
