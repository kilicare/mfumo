'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { getApiError } from '@/lib/api';
import {
  productsAPI,
  type Brand,
  type Category,
  type Product,
  type ProductInput,
  type ProductUpdateInput,
  type SupplierOption,
  type Unit,
} from '@/lib/api/products';
import { notify } from '@/components/ui/AppToaster';
import { useAuthStore } from '@/store/authStore';
import { ProductImagePicker } from '@/components/products/ProductImages';

type UnitLine = { unitId: string; conversionFactor: string; isDefault: boolean };
type FormState = {
  sku: string;
  name: string;
  barcode: string;
  description: string;
  categoryId: string;
  supplierId: string;
  brandId: string;
  buyingPrice: string;
  sellingPrice: string;
  wholesalePrice: string;
  defaultUnitId: string;
  minimumStock: string;
  reorderLevel: string;
  manufacturer: string;
  weight: string;
  color: string;
  size: string;
  expiryDays: string;
  requiresExpiry: boolean;
  status: Product['status'];
};

const blank: FormState = {
  sku: '',
  name: '',
  barcode: '',
  description: '',
  categoryId: '',
  supplierId: '',
  brandId: '',
  buyingPrice: '',
  sellingPrice: '',
  wholesalePrice: '',
  defaultUnitId: '',
  minimumStock: '10',
  reorderLevel: '15',
  manufacturer: '',
  weight: '',
  color: '',
  size: '',
  expiryDays: '',
  requiresExpiry: false,
  status: 'ACTIVE',
};

const fieldClass =
  'mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-[#e0e5d8] bg-white px-3.5 text-sm text-[#292d27] outline-none transition placeholder:text-[#9a9f92] focus:border-[#78930b] focus:ring-4 focus:ring-[#c9e600]/20 disabled:bg-[#f3f4f0]';
const labelClass = 'block text-sm font-semibold text-[#454a41]';

export function ProductForm({
  productId,
  onSuccess,
}: {
  productId?: string;
  onSuccess: (product: Product) => void;
}) {
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);
  const canViewSuppliers = permissions.includes('suppliers.view');
  const canCreate = permissions.includes('products.create');
  const canEdit = permissions.includes('products.edit');
  const [form, setForm] = useState<FormState>(blank);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [unitLines, setUnitLines] = useState<UnitLine[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    Promise.all([
      productsAPI.categories(),
      productsAPI.brands(),
      productsAPI.units(),
      canViewSuppliers ? productsAPI.suppliers() : Promise.resolve([] as SupplierOption[]),
    ])
      .then(async ([categoryData, brandData, unitData, supplierData]) => {
        if (!active) return;
        setCategories(categoryData);
        setBrands(brandData);
        setUnits(unitData);
        setSuppliers(supplierData);
        if (productId) {
          const product = await productsAPI.get(productId);
          if (!active) return;
          const currentImages = await Promise.all(
            (product.images ?? [])
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map(async (image) => {
                const blob = await productsAPI.getImage(product.id, image.id);
                return new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onerror = () => reject(new Error('Could not load a saved product photo.'));
                  reader.onload = () =>
                    typeof reader.result === 'string'
                      ? resolve(reader.result)
                      : reject(new Error('Invalid saved photo.'));
                  reader.readAsDataURL(blob);
                });
              })
          );
          if (!active) return;
          setImages(currentImages);
          setForm({
            sku: product.sku,
            name: product.name,
            barcode: product.barcode || '',
            description: product.description || '',
            categoryId: product.categoryId,
            supplierId: product.supplierId || '',
            brandId: product.brandId || '',
            buyingPrice: String(product.buyingPrice),
            sellingPrice: String(product.sellingPrice),
            wholesalePrice: product.wholesalePrice == null ? '' : String(product.wholesalePrice),
            defaultUnitId: product.defaultUnitId,
            minimumStock: String(product.minimumStock),
            reorderLevel: String(product.reorderLevel),
            manufacturer: product.manufacturer || '',
            weight: product.weight == null ? '' : String(product.weight),
            color: product.color || '',
            size: product.size || '',
            expiryDays: product.expiryDays == null ? '' : String(product.expiryDays),
            requiresExpiry: product.requiresExpiry,
            status: product.status,
          });
          setUnitLines(
            product.productUnits.length
              ? product.productUnits.map((unit) => ({
                  unitId: unit.unitId,
                  conversionFactor: String(unit.conversionFactor),
                  isDefault: unit.isDefault,
                }))
              : [{ unitId: product.defaultUnitId, conversionFactor: '1', isDefault: true }]
          );
        } else {
          const firstUnit = unitData[0];
          if (firstUnit) {
            setForm((current) => ({ ...current, defaultUnitId: firstUnit.id }));
            setUnitLines([{ unitId: firstUnit.id, conversionFactor: '1', isDefault: true }]);
          }
        }
      })
      .catch((error: unknown) => {
        if (active) setLoadError(getApiError(error, 'We could not load product setup data.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canViewSuppliers, productId]);

  const defaultUnit = useMemo(
    () => units.find((unit) => unit.id === form.defaultUnitId),
    [units, form.defaultUnitId]
  );
  const change = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function chooseDefaultUnit(unitId: string) {
    const selected = unitLines.find((line) => line.unitId === unitId);
    const selectedFactor = Number(selected?.conversionFactor);
    if (!selected || !Number.isFinite(selectedFactor) || selectedFactor <= 0) {
      notify.error('Add this unit and its conversion factor before setting it as the base.');
      return;
    }

    change('defaultUnitId', unitId);
    setUnitLines((current) => {
      const retained = current
        .filter((line) => line.unitId !== unitId)
        .map((line) => ({
          ...line,
          conversionFactor: String(
            Number((Number(line.conversionFactor) / selectedFactor).toPrecision(12))
          ),
          isDefault: false,
        }));
      return [{ unitId, conversionFactor: '1', isDefault: true }, ...retained];
    });
  }

  function addAlternateUnit() {
    const unitId = units.find((unit) => !unitLines.some((line) => line.unitId === unit.id))?.id;
    if (!unitId) return;
    setUnitLines((current) => [...current, { unitId, conversionFactor: '', isDefault: false }]);
  }

  function updateUnit(index: number, patch: Partial<UnitLine>) {
    setUnitLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line))
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const buyingPrice = Number(form.buyingPrice);
    const sellingPrice = Number(form.sellingPrice);
    const minimumStock = Number(form.minimumStock);
    const reorderLevel = Number(form.reorderLevel);
    if (!form.sku.trim() && !productId) {
      notify.error('Enter a SKU.');
      return;
    }
    if (!form.name.trim()) {
      notify.error('Enter a product name.');
      return;
    }
    if (!form.categoryId) {
      notify.error('Choose a category.');
      return;
    }
    if (!form.defaultUnitId) {
      notify.error('Choose a base unit.');
      return;
    }
    if (![buyingPrice, sellingPrice, minimumStock, reorderLevel].every(Number.isFinite)) {
      notify.error('Enter valid numbers for prices and stock levels.');
      return;
    }
    if (buyingPrice < 0 || sellingPrice < 0 || minimumStock < 0 || reorderLevel < 0) {
      notify.error('Prices and stock levels cannot be negative.');
      return;
    }
    const monetaryValues = [form.buyingPrice, form.sellingPrice, form.wholesalePrice]
      .map((value) => value.trim())
      .filter(Boolean);
    if (monetaryValues.some((value) => (value.split('.')[1]?.length ?? 0) > 2)) {
      notify.error('Prices can have no more than 2 decimal places.');
      return;
    }
    if (sellingPrice < buyingPrice) {
      notify.error('Selling price cannot be less than buying price.');
      return;
    }
    if (!Number.isInteger(minimumStock) || !Number.isInteger(reorderLevel)) {
      notify.error('Minimum stock and reorder level must be whole numbers.');
      return;
    }
    if (minimumStock > reorderLevel) {
      notify.error('Reorder level must be at least the minimum stock level.');
      return;
    }
    const cleanUnits = unitLines.map((line) => ({
      ...line,
      conversionFactor: Number(line.conversionFactor),
    }));
    if (
      cleanUnits.some(
        (line) => !Number.isFinite(line.conversionFactor) || line.conversionFactor <= 0
      )
    ) {
      notify.error('Each product unit needs a conversion factor greater than zero.');
      return;
    }
    if (
      cleanUnits.filter((line) => line.isDefault).length !== 1 ||
      !cleanUnits.some((line) => line.unitId === form.defaultUnitId && line.isDefault)
    ) {
      notify.error('The selected base unit must be the only default unit.');
      return;
    }
    if (
      cleanUnits.some((line) => line.unitId === form.defaultUnitId && line.conversionFactor !== 1)
    ) {
      notify.error('The base unit conversion factor must be 1.');
      return;
    }

    const input: ProductInput = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      categoryId: form.categoryId,
      buyingPrice,
      sellingPrice,
      defaultUnitId: form.defaultUnitId,
      productUnits: cleanUnits.map(({ unitId, conversionFactor, isDefault }) => ({
        unitId,
        conversionFactor,
        isDefault,
      })),
      images,
      minimumStock,
      reorderLevel,
      requiresExpiry: form.requiresExpiry,
      status: form.status,
      ...(form.barcode.trim() && { barcode: form.barcode.trim() }),
      ...(form.description.trim() && { description: form.description.trim() }),
      ...(form.supplierId && { supplierId: form.supplierId }),
      ...(form.brandId && { brandId: form.brandId }),
      ...(form.wholesalePrice !== '' && { wholesalePrice: Number(form.wholesalePrice) }),
      ...(form.manufacturer.trim() && { manufacturer: form.manufacturer.trim() }),
      ...(form.weight !== '' && { weight: Number(form.weight) }),
      ...(form.color.trim() && { color: form.color.trim() }),
      ...(form.size.trim() && { size: form.size.trim() }),
      ...(form.expiryDays !== '' && { expiryDays: Number(form.expiryDays) }),
    };
    if (
      [input.wholesalePrice, input.weight, input.expiryDays].some(
        (number) => number !== undefined && (!Number.isFinite(number) || number < 0)
      )
    ) {
      notify.error('Optional numeric values must be zero or greater.');
      return;
    }

    setSaving(true);
    try {
      const updateInput: ProductUpdateInput = {
        name: input.name,
        categoryId: input.categoryId,
        buyingPrice,
        sellingPrice,
        defaultUnitId: input.defaultUnitId,
        productUnits: input.productUnits,
        images,
        minimumStock,
        reorderLevel,
        requiresExpiry: input.requiresExpiry,
        status: input.status,
        description: form.description.trim() || null,
        barcode: form.barcode.trim() || null,
        brandId: form.brandId || null,
        wholesalePrice: form.wholesalePrice === '' ? null : Number(form.wholesalePrice),
        manufacturer: form.manufacturer.trim() || null,
        weight: form.weight === '' ? null : Number(form.weight),
        color: form.color.trim() || null,
        size: form.size.trim() || null,
        expiryDays: form.expiryDays === '' ? null : Number(form.expiryDays),
        ...(canViewSuppliers ? { supplierId: form.supplierId || null } : {}),
      };
      const saved = productId
        ? await productsAPI.update(productId, updateInput)
        : await productsAPI.create(input);
      notify.success(productId ? 'Product updated.' : 'Product created.');
      onSuccess(saved);
    } catch (error) {
      notify.error(getApiError(error, 'We could not save this product.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="grid min-h-64 place-items-center text-sm text-[#6f7569]">
        <span className="flex items-center gap-2">
          <Loader2 className="animate-spin" size={18} />
          Loading product setup…
        </span>
      </div>
    );
  if (productId ? !canEdit : !canCreate)
    return (
      <section
        role="alert"
        className="mx-auto max-w-2xl rounded-2xl border border-[#efd4cf] bg-white p-7 text-center shadow-sm"
      >
        <h1 className="text-xl font-bold text-[#292d27]">Product access required</h1>
        <p className="mt-2 text-sm text-[#73766f]">
          Your account is not allowed to {productId ? 'edit' : 'create'} products in this workspace.
        </p>
        <Link
          href="/dashboard/products"
          className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-[#20211f] px-4 text-sm font-bold text-white"
        >
          Back to products
        </Link>
      </section>
    );
  if (loadError)
    return (
      <div
        role="alert"
        className="rounded-2xl border border-[#f0d2a7] bg-[#fff8e9] p-5 text-sm text-[#7a4d11]"
      >
        <p>{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 font-semibold underline"
        >
          Retry
        </button>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/dashboard/products"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#65705c] hover:text-[#20211f]"
          >
            <ArrowLeft size={16} />
            Back to products
          </Link>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#20231f]">
            {productId ? 'Edit product' : 'Add product'}
          </h1>
          <p className="mt-1 text-sm text-[#73766f]">
            Keep product, price, unit and reorder details accurate for this workspace.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#20211f] px-5 text-sm font-bold text-white transition hover:bg-[#315c45] disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 size={17} className="animate-spin" />
              Saving…
            </>
          ) : productId ? (
            'Save changes'
          ) : (
            'Create product'
          )}
        </button>
      </div>

      {!categories.length || !units.length ? (
        <div
          role="alert"
          className="rounded-xl border border-[#f0d2a7] bg-[#fff8e9] p-4 text-sm text-[#7a4d11]"
        >
          Add at least one active category and ensure the shared unit catalog has an active unit
          before creating products. Manage categories in{' '}
          <Link href="/dashboard/products/catalogs" className="font-semibold underline">
            Product catalogs
          </Link>
          .
        </div>
      ) : null}

      <section className="rounded-2xl border border-[#e6e9e1] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-bold text-[#292d27]">Product identity</h2>
        <p className="mt-1 text-sm text-[#73766f]">
          SKU is unique within this business; barcode uniqueness is enforced globally by the current
          data model.
        </p>
        <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            SKU
            {productId ? (
              <input className={fieldClass} value={form.sku} disabled />
            ) : (
              <input
                className={fieldClass}
                value={form.sku}
                onChange={(e) => change('sku', e.target.value)}
                autoComplete="off"
                required
                maxLength={64}
              />
            )}
          </label>
          <label className={labelClass}>
            Product name
            <input
              className={fieldClass}
              value={form.name}
              onChange={(e) => change('name', e.target.value)}
              required
              maxLength={160}
            />
          </label>
          <label className={labelClass}>
            Category
            <select
              className={fieldClass}
              value={form.categoryId}
              onChange={(e) => change('categoryId', e.target.value)}
              required
            >
              <option value="">Choose category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Barcode <span className="font-normal text-[#858880]">(optional)</span>
            <input
              className={fieldClass}
              value={form.barcode}
              onChange={(e) => change('barcode', e.target.value)}
              maxLength={128}
            />
          </label>
          <label className={labelClass}>
            Brand <span className="font-normal text-[#858880]">(shared catalog)</span>
            <select
              className={fieldClass}
              value={form.brandId}
              onChange={(e) => change('brandId', e.target.value)}
            >
              <option value="">No brand</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          {canViewSuppliers ? (
            <label className={labelClass}>
              Supplier <span className="font-normal text-[#858880]">(optional)</span>
              <select
                className={fieldClass}
                value={form.supplierId}
                onChange={(e) => change('supplierId', e.target.value)}
              >
                <option value="">No preferred supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} · {supplier.supplierCode}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className={`${labelClass} sm:col-span-2`}>
            Description <span className="font-normal text-[#858880]">(optional)</span>
            <textarea
              className={`${fieldClass} min-h-24 py-3`}
              value={form.description}
              onChange={(e) => change('description', e.target.value)}
              maxLength={2000}
            />
          </label>
        </div>
      </section>

      <ProductImagePicker images={images} onChange={setImages} disabled={saving} />

      <section className="rounded-2xl border border-[#e6e9e1] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-bold text-[#292d27]">Prices and stock controls</h2>
        <p className="mt-1 text-sm text-[#73766f]">
          Currency: {units.length ? 'business currency' : '—'}. Selling price must be at least the
          buying price under current backend rules.
        </p>
        <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>
            Buying price
            <input
              type="number"
              className={fieldClass}
              value={form.buyingPrice}
              onChange={(e) => change('buyingPrice', e.target.value)}
              min="0"
              step="0.01"
              required
            />
          </label>
          <label className={labelClass}>
            Selling price
            <input
              type="number"
              className={fieldClass}
              value={form.sellingPrice}
              onChange={(e) => change('sellingPrice', e.target.value)}
              min="0"
              step="0.01"
              required
            />
          </label>
          <label className={labelClass}>
            Wholesale price <span className="font-normal text-[#858880]">(optional)</span>
            <input
              type="number"
              className={fieldClass}
              value={form.wholesalePrice}
              onChange={(e) => change('wholesalePrice', e.target.value)}
              min="0"
              step="0.01"
            />
          </label>
          <label className={labelClass}>
            Minimum stock
            <input
              type="number"
              className={fieldClass}
              value={form.minimumStock}
              onChange={(e) => change('minimumStock', e.target.value)}
              min="0"
              step="1"
              required
            />
          </label>
          <label className={labelClass}>
            Reorder level
            <input
              type="number"
              className={fieldClass}
              value={form.reorderLevel}
              onChange={(e) => change('reorderLevel', e.target.value)}
              min="0"
              step="1"
              required
            />
            <span className="mt-1 block text-xs font-normal text-[#858880]">
              Must be equal to or above minimum stock.
            </span>
          </label>
          {productId ? (
            <label className={labelClass}>
              Status
              <select
                className={fieldClass}
                value={form.status}
                onChange={(e) => change('status', e.target.value as Product['status'])}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="DISCONTINUED">Discontinued</option>
              </select>
            </label>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-[#e6e9e1] bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#292d27]">Units and conversions</h2>
            <p className="mt-1 text-sm text-[#73766f]">
              The default unit is the base. Other conversion factors are measured in base units.
            </p>
          </div>
          <button
            type="button"
            onClick={addAlternateUnit}
            disabled={unitLines.length >= units.length}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe5d3] px-3 text-sm font-semibold text-[#46523a] hover:bg-[#f4f8e7] disabled:opacity-50"
          >
            <Plus size={16} />
            Add unit
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {unitLines.map((line, index) => (
            <div
              key={`${line.unitId}-${index}`}
              className="grid min-w-0 gap-3 rounded-xl bg-[#f8f9f6] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(130px,0.6fr)_auto] sm:items-end"
            >
              <label className={labelClass}>
                Unit
                <select
                  className={fieldClass}
                  value={line.unitId}
                  disabled={line.isDefault}
                  onChange={(e) => updateUnit(index, { unitId: e.target.value })}
                >
                  <option value="">Choose unit</option>
                  {units
                    .filter(
                      (unit) =>
                        unit.id === line.unitId ||
                        !unitLines.some(
                          (other, otherIndex) => otherIndex !== index && other.unitId === unit.id
                        )
                    )
                    .map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name} ({unit.symbol})
                      </option>
                    ))}
                </select>
              </label>
              <label className={labelClass}>
                Base units per unit
                <input
                  className={fieldClass}
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={line.conversionFactor}
                  disabled={line.isDefault}
                  onChange={(e) => updateUnit(index, { conversionFactor: e.target.value })}
                />
              </label>
              {line.isDefault ? (
                <span className="inline-flex min-h-11 items-center px-3 text-xs font-bold uppercase tracking-wide text-[#617500]">
                  Default unit
                </span>
              ) : (
                <button
                  type="button"
                  aria-label="Remove unit"
                  onClick={() =>
                    setUnitLines((current) => current.filter((_, lineIndex) => lineIndex !== index))
                  }
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#efd4cf] px-3 text-[#a63832] hover:bg-[#fff0ed]"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <label className="mt-4 block max-w-md text-sm font-semibold text-[#454a41]">
          Base unit
          <select
            className={fieldClass}
            value={form.defaultUnitId}
            onChange={(e) => chooseDefaultUnit(e.target.value)}
          >
            <option value="">Choose unit</option>
            {unitLines.map((line) => units.find((unit) => unit.id === line.unitId)).filter((unit): unit is Unit => Boolean(unit)).map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </select>
        </label>
        {defaultUnit ? (
          <p className="mt-2 text-xs text-[#73766f]">
            Default unit: {defaultUnit.name} ({defaultUnit.symbol}); conversion is 1.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[#e6e9e1] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-bold text-[#292d27]">Product details</h2>
        <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>
            Manufacturer
            <input
              className={fieldClass}
              value={form.manufacturer}
              onChange={(e) => change('manufacturer', e.target.value)}
              maxLength={120}
            />
          </label>
          <label className={labelClass}>
            Weight
            <input
              type="number"
              className={fieldClass}
              value={form.weight}
              onChange={(e) => change('weight', e.target.value)}
              min="0"
              step="0.001"
            />
          </label>
          <label className={labelClass}>
            Color
            <input
              className={fieldClass}
              value={form.color}
              onChange={(e) => change('color', e.target.value)}
              maxLength={80}
            />
          </label>
          <label className={labelClass}>
            Size
            <input
              className={fieldClass}
              value={form.size}
              onChange={(e) => change('size', e.target.value)}
              maxLength={80}
            />
          </label>
          <label className={labelClass}>
            Expiry days
            <input
              type="number"
              className={fieldClass}
              value={form.expiryDays}
              onChange={(e) => change('expiryDays', e.target.value)}
              min="0"
              step="1"
            />
          </label>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[#e0e5d8] px-3.5 text-sm font-semibold text-[#454a41]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#78930b]"
              checked={form.requiresExpiry}
              onChange={(e) => change('requiresExpiry', e.target.checked)}
            />
            Expiry date is required
          </label>
        </div>
      </section>
      <div className="flex flex-wrap justify-end gap-3">
        <Link
          href="/dashboard/products"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#dfe5d3] px-5 text-sm font-semibold text-[#4e5549] hover:bg-white"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving || !categories.length || !units.length}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#20211f] px-5 text-sm font-bold text-white hover:bg-[#315c45] disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? <Loader2 className="animate-spin" size={17} /> : null}
          {productId ? 'Save product' : 'Create product'}
        </button>
      </div>
    </form>
  );
}
