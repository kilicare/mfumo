'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownUp,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Package,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { getApiError } from '@/lib/api';
import {
  productsAPI,
  formatProductMoney,
  type Category,
  type Brand,
  type Product,
  type ProductStatus,
  type SupplierOption,
} from '@/lib/api/products';
import { notify } from '@/components/ui/AppToaster';
import { ProductPhoto } from '@/components/products/ProductImages';

const emptyPermissions: string[] = [];
const statusLabels: Record<ProductStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  DISCONTINUED: 'Discontinued',
};
const statusColors: Record<ProductStatus, string> = {
  ACTIVE: 'bg-[#e9f7ef] text-[#16734a]',
  INACTIVE: 'bg-[#fff7df] text-[#93600c]',
  DISCONTINUED: 'bg-[#fff0ed] text-[#a63832]',
};

export default function ProductsPage() {
  const permissions = useAuthStore((state) => state.user?.permissions ?? emptyPermissions);
  const canView = permissions.includes('products.view');
  const canCreate = permissions.includes('products.create');
  const canEdit = permissions.includes('products.edit');
  const canDelete = permissions.includes('products.delete');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [stockStatus, setStockStatus] = useState('');
  const [sort, setSort] = useState<'createdAt' | 'name' | 'price'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const loadRequestId = useRef(0);
  const limit = 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const invalidPriceRange =
    minPrice !== '' && maxPrice !== '' && Number(minPrice) > Number(maxPrice);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchDraft.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    if (!canView) {
      setIsLoading(false);
      return;
    }
    if (invalidPriceRange) {
      setProducts([]);
      setTotal(0);
      setSelected([]);
      setError('Minimum price cannot exceed maximum price');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const result = await productsAPI.list({
        search,
        categoryId: categoryId || undefined,
        brandId: brandId || undefined,
        supplierId: supplierId || undefined,
        status: (status || undefined) as ProductStatus | undefined,
        minPrice: minPrice === '' ? undefined : Number(minPrice),
        maxPrice: maxPrice === '' ? undefined : Number(maxPrice),
        stockStatus: (stockStatus || undefined) as
          'BELOW_MINIMUM' | 'LOW_STOCK' | 'NORMAL' | 'OVERSTOCKED' | undefined,
        sortBy: sort,
        sortOrder,
        page,
        limit,
      });
      if (requestId !== loadRequestId.current) return;
      setProducts(result.data);
      setTotal(result.total);
      setSelected([]);
      if (result.page !== page) setPage(result.page);
    } catch (cause) {
      if (requestId !== loadRequestId.current) return;
      setProducts([]);
      setTotal(0);
      setSelected([]);
      setError(getApiError(cause, 'We could not load products.'));
    } finally {
      if (requestId === loadRequestId.current) setIsLoading(false);
    }
  }, [
    canView,
    search,
    categoryId,
    brandId,
    supplierId,
    status,
    minPrice,
    maxPrice,
    invalidPriceRange,
    stockStatus,
    sort,
    sortOrder,
    page,
  ]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let active = true;
    productsAPI
      .categories()
      .then((data) => {
        if (active) setCategories(data);
      })
      .catch(() => undefined);
    productsAPI
      .brands()
      .then((data) => {
        if (active) setBrands(data);
      })
      .catch(() => undefined);
    productsAPI
      .suppliers()
      .then((data) => {
        if (active) setSuppliers(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const visibleIds = useMemo(() => products.map((product) => product.id), [products]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const toggleAll = () =>
    setSelected((current) =>
      allSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])]
    );

  async function changeStatus(product: Product, next: ProductStatus) {
    setBusyAction(true);
    try {
      await productsAPI.updateStatus(product.id, next);
      notify.success(`${product.name} marked ${statusLabels[next].toLowerCase()}.`);
      await load();
    } catch (cause) {
      notify.error(getApiError(cause, 'Could not update product status.'));
    } finally {
      setBusyAction(false);
    }
  }

  async function changeSelectedStatus(next: ProductStatus) {
    if (!selected.length) return;
    setBusyAction(true);
    try {
      const result = await productsAPI.bulkUpdateStatus(selected, next);
      if (result.count !== selected.length)
        notify.warning(
          `Updated ${result.count} of ${selected.length}; some products may not belong to this workspace or may not exist.`
        );
      else notify.success(`${result.count} products marked ${statusLabels[next].toLowerCase()}.`);
      await load();
    } catch (cause) {
      notify.error(getApiError(cause, 'Could not update selected products.'));
    } finally {
      setBusyAction(false);
    }
  }

  async function removeProduct() {
    if (!deleting) return;
    setBusyAction(true);
    try {
      await productsAPI.remove(deleting.id);
      notify.success('Product deleted.');
      setDeleting(null);
      await load();
    } catch (cause) {
      notify.error(
        getApiError(
          cause,
          'Could not delete product. Products with operational history must be discontinued instead.'
        )
      );
    } finally {
      setBusyAction(false);
    }
  }

  if (!canView)
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-[#efd4cf] bg-white p-7 text-center shadow-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#fff0ed] text-[#a63832]">
          <AlertCircle />
        </span>
        <h1 className="mt-4 text-xl font-bold text-[#292d27]">Products access required</h1>
        <p className="mt-2 text-sm text-[#73766f]">
          Your account does not have the `products.view` permission. Ask a business administrator to
          grant access.
        </p>
      </section>
    );

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#617500]">Products</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#20231f] sm:text-3xl">
            Product catalog
          </h1>
          <p className="mt-1 text-sm text-[#73766f]">
            Manage items, pricing, units and reorder thresholds for this workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Link
              href="/dashboard/products/catalogs"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe5d3] bg-white px-3.5 text-sm font-semibold text-[#46523a] hover:bg-[#f4f8e7]"
            >
              <Settings2 size={16} />
              Catalogs
            </Link>
          ) : null}
          {canCreate ? (
            <Link
              href="/dashboard/products/new"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#20211f] px-4 text-sm font-bold text-white hover:bg-[#315c45]"
            >
              <Plus size={17} />
              Add product
            </Link>
          ) : null}
        </div>
      </header>

      <section className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#e6e9e1] bg-white p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e4f58c] text-[#527000]">
            <Package size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#858880]">
              Matching products
            </p>
            <p className="mt-0.5 text-xl font-bold text-[#292d27]">{total.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#e6e9e1] bg-white p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf2ff] text-[#3468a8]">
            <Boxes size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#858880]">
              Current page
            </p>
            <p className="mt-0.5 text-xl font-bold text-[#292d27]">
              {products.length}{' '}
              <span className="text-sm font-medium text-[#73766f]">of {limit}</span>
            </p>
          </div>
        </div>
      </section>

      <section
        className="min-w-0 rounded-2xl border border-[#e6e9e1] bg-white p-3 shadow-sm sm:p-5"
        aria-label="Product filters"
      >
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <label className="relative block min-w-0">
            <span className="sr-only">Search products</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8c9185]"
              size={17}
            />
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search name, SKU or barcode"
              className="min-h-11 w-full min-w-0 rounded-xl border border-[#e0e5d8] bg-white pl-10 pr-3 text-sm outline-none focus:border-[#78930b] focus:ring-4 focus:ring-[#c9e600]/20"
            />
          </label>
          <label className="min-w-0">
            <span className="sr-only">Filter by brand</span>
            <select
              aria-label="Filter by brand"
              value={brandId}
              onChange={(e) => {
                setBrandId(e.target.value);
                setPage(1);
              }}
              className="min-h-11 w-full min-w-0 rounded-xl border border-[#e0e5d8] bg-white px-3 text-sm text-[#454a41] outline-none focus:border-[#78930b]"
            >
              <option value="">All brands</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="sr-only">Filter by supplier</span>
            <select
              aria-label="Filter by supplier"
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setPage(1);
              }}
              className="min-h-11 w-full min-w-0 rounded-xl border border-[#e0e5d8] bg-white px-3 text-sm text-[#454a41] outline-none focus:border-[#78930b]"
            >
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by category</span>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
              className="min-h-11 w-full min-w-0 rounded-xl border border-[#e0e5d8] bg-white px-3 text-sm text-[#454a41] outline-none focus:border-[#78930b]"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="sr-only">Minimum selling price</span>
            <input
              aria-label="Minimum selling price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              aria-invalid={invalidPriceRange}
              aria-describedby={invalidPriceRange ? 'product-price-range-error' : undefined}
              value={minPrice}
              onChange={(e) => {
                setMinPrice(e.target.value);
                setPage(1);
              }}
              placeholder="Min selling price"
              className="min-h-11 w-full min-w-0 rounded-xl border border-[#e0e5d8] bg-white px-3 text-sm text-[#454a41] outline-none focus:border-[#78930b]"
            />
          </label>
          <label className="min-w-0">
            <span className="sr-only">Maximum selling price</span>
            <input
              aria-label="Maximum selling price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              aria-invalid={invalidPriceRange}
              aria-describedby={invalidPriceRange ? 'product-price-range-error' : undefined}
              value={maxPrice}
              onChange={(e) => {
                setMaxPrice(e.target.value);
                setPage(1);
              }}
              placeholder="Max selling price"
              className="min-h-11 w-full min-w-0 rounded-xl border border-[#e0e5d8] bg-white px-3 text-sm text-[#454a41] outline-none focus:border-[#78930b]"
            />
          </label>
          <label className="min-w-0">
            <span className="sr-only">Filter by stock status</span>
            <select
              aria-label="Filter by stock status"
              value={stockStatus}
              onChange={(e) => {
                setStockStatus(e.target.value);
                setPage(1);
              }}
              className="min-h-11 w-full min-w-0 rounded-xl border border-[#e0e5d8] bg-white px-3 text-sm text-[#454a41] outline-none focus:border-[#78930b]"
            >
              <option value="">All stock levels</option>
              <option value="BELOW_MINIMUM">Below minimum</option>
              <option value="LOW_STOCK">Low stock</option>
              <option value="NORMAL">Normal stock</option>
              <option value="OVERSTOCKED">Overstocked</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="min-h-11 w-full min-w-0 rounded-xl border border-[#e0e5d8] bg-white px-3 text-sm text-[#454a41] outline-none focus:border-[#78930b]"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="DISCONTINUED">Discontinued</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Sort products</span>
            <select
              value={`${sort}:${sortOrder}`}
              onChange={(e) => {
                const [nextSort, nextOrder] = e.target.value.split(':') as [
                  'createdAt' | 'name' | 'price',
                  'asc' | 'desc',
                ];
                setSort(nextSort);
                setSortOrder(nextOrder);
              }}
              className="min-h-11 w-full min-w-0 rounded-xl border border-[#e0e5d8] bg-white px-3 text-sm text-[#454a41] outline-none focus:border-[#78930b]"
            >
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="name:asc">Name A–Z</option>
              <option value="name:desc">Name Z–A</option>
              <option value="price:asc">Selling price low–high</option>
              <option value="price:desc">Selling price high–low</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#dfe5d3] px-3.5 text-sm font-semibold text-[#46523a] hover:bg-[#f4f8e7] disabled:opacity-60"
          >
            <ArrowDownUp size={16} />
            Refresh
          </button>
        </div>
        {selected.length && canEdit ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#f4f8e7] p-3">
            <span className="mr-1 text-sm font-semibold text-[#48552a]">
              {selected.length} selected
            </span>
            <button
              type="button"
              disabled={busyAction}
              onClick={() => void changeSelectedStatus('ACTIVE')}
              className="min-h-9 rounded-lg bg-white px-3 text-xs font-bold text-[#16734a]"
            >
              Mark active
            </button>
            <button
              type="button"
              disabled={busyAction}
              onClick={() => void changeSelectedStatus('INACTIVE')}
              className="min-h-9 rounded-lg bg-white px-3 text-xs font-bold text-[#93600c]"
            >
              Mark inactive
            </button>
            <button
              type="button"
              disabled={busyAction}
              onClick={() => void changeSelectedStatus('DISCONTINUED')}
              className="min-h-9 rounded-lg bg-white px-3 text-xs font-bold text-[#a63832]"
            >
              Discontinue
            </button>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="min-h-9 px-2 text-xs font-semibold text-[#65705c]"
            >
              Clear selection
            </button>
          </div>
        ) : null}
      </section>

      {error ? (
        <div
          id={invalidPriceRange ? 'product-price-range-error' : undefined}
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#efd4cf] bg-[#fff8f6] p-4 text-sm text-[#96382f]"
        >
          <span>{error}</span>
          {!invalidPriceRange ? (
            <button type="button" onClick={() => void load()} className="font-bold underline">
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      <section
        className="min-w-0 overflow-hidden rounded-2xl border border-[#e6e9e1] bg-white shadow-sm"
        aria-label="Products"
      >
        {isLoading ? (
          <div className="grid min-h-64 place-items-center text-sm text-[#73766f]">
            <span className="flex items-center gap-2">
              <Loader2 className="animate-spin" size={18} />
              Loading products…
            </span>
          </div>
        ) : products.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f0f7c9] text-[#617500]">
              <Package size={21} />
            </span>
            <h2 className="mt-4 text-lg font-bold text-[#292d27]">
              {search || categoryId || status
                ? 'No matching products'
                : 'Your catalog is ready for its first product'}
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-[#73766f]">
              {search || categoryId || status
                ? 'Try another search or clear one of the filters.'
                : 'Create a product with its real price, base unit and stock thresholds.'}
            </p>
            {canCreate && !search && !categoryId && !status ? (
              <Link
                href="/dashboard/products/new"
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#20211f] px-4 text-sm font-bold text-white"
              >
                <Plus size={16} />
                Add product
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead className="bg-[#f8f9f6] text-[11px] uppercase tracking-[0.12em] text-[#73766f]">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        aria-label="Select all products on this page"
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="h-4 w-4 accent-[#78930b]"
                      />
                    </th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Buying price</th>
                    <th className="px-4 py-3 text-right">Selling price</th>
                    <th className="px-4 py-3 text-right">On hand</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef0eb]">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-[#fbfcf9]">
                      <td className="px-4 py-3">
                        <input
                          aria-label={`Select ${product.name}`}
                          type="checkbox"
                          checked={selected.includes(product.id)}
                          onChange={() =>
                            setSelected((current) =>
                              current.includes(product.id)
                                ? current.filter((id) => id !== product.id)
                                : [...current, product.id]
                            )
                          }
                          className="h-4 w-4 accent-[#78930b]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ProductPhoto
                            productId={product.id}
                            image={
                              product.images?.find((image) => image.isPrimary) ??
                              product.images?.[0]
                            }
                            className="h-11 w-11 shrink-0 rounded-xl"
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/products/${product.id}`}
                              className="block font-semibold text-[#292d27] hover:text-[#547000]"
                            >
                              {product.name}
                            </Link>
                            <p className="mt-0.5 text-xs text-[#858880]">
                              {product.sku}
                              {product.barcode ? ` · ${product.barcode}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#545850]">
                        {product.categoryName || '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-[#545850]">
                        {formatProductMoney(product.buyingPrice, product.currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-[#292d27]">
                        {formatProductMoney(product.sellingPrice, product.currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-[#545850]">
                        {product.currentStock ?? '—'} {product.defaultUnit}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusColors[product.status]}`}
                        >
                          {statusLabels[product.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Link
                            aria-label={`View ${product.name}`}
                            title="View"
                            href={`/dashboard/products/${product.id}`}
                            className="rounded-lg p-2 text-[#546044] hover:bg-[#f0f7c9]"
                          >
                            <Eye size={16} />
                          </Link>
                          {canEdit ? (
                            <Link
                              aria-label={`Edit ${product.name}`}
                              title="Edit"
                              href={`/dashboard/products/${product.id}/edit`}
                              className="rounded-lg p-2 text-[#546044] hover:bg-[#f0f7c9]"
                            >
                              <Settings2 size={16} />
                            </Link>
                          ) : null}
                          {canEdit && product.status === 'ACTIVE' ? (
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => void changeStatus(product, 'DISCONTINUED')}
                              title="Discontinue"
                              aria-label={`Discontinue ${product.name}`}
                              className="rounded-lg p-2 text-[#a63832] hover:bg-[#fff0ed]"
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => setDeleting(product)}
                              title="Delete"
                              aria-label={`Delete ${product.name}`}
                              className="rounded-lg p-2 text-[#a63832] hover:bg-[#fff0ed]"
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-[#eef0eb] md:hidden">
              {products.map((product) => (
                <article key={product.id} className="min-w-0 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <ProductPhoto
                      productId={product.id}
                      image={
                        product.images?.find((image) => image.isPrimary) ?? product.images?.[0]
                      }
                      className="h-16 w-16 shrink-0 rounded-xl"
                    />
                    {canEdit ? (
                      <input
                        aria-label={`Select ${product.name}`}
                        type="checkbox"
                        checked={selected.includes(product.id)}
                        onChange={() =>
                          setSelected((current) =>
                            current.includes(product.id)
                              ? current.filter((id) => id !== product.id)
                              : [...current, product.id]
                          )
                        }
                        className="mt-1 h-4 w-4 shrink-0 accent-[#78930b]"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/products/${product.id}`}
                          className="break-words font-bold text-[#292d27]"
                        >
                          {product.name}
                        </Link>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColors[product.status]}`}
                        >
                          {statusLabels[product.status]}
                        </span>
                      </div>
                      <p className="mt-1 break-all text-xs text-[#858880]">
                        {product.sku}
                        {product.barcode ? ` · ${product.barcode}` : ''}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <span className="text-[#858880]">Category</span>
                        <span className="truncate text-right font-medium text-[#545850]">
                          {product.categoryName || '—'}
                        </span>
                        <span className="text-[#858880]">Selling price</span>
                        <span className="text-right font-semibold tabular-nums text-[#292d27]">
                          {formatProductMoney(product.sellingPrice, product.currency)}
                        </span>
                        <span className="text-[#858880]">Buying price</span>
                        <span className="text-right tabular-nums text-[#545850]">
                          {formatProductMoney(product.buyingPrice, product.currency)}
                        </span>
                        <span className="text-[#858880]">On hand</span>
                        <span className="text-right tabular-nums text-[#545850]">
                          {product.currentStock ?? '—'} {product.defaultUnit}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={`/dashboard/products/${product.id}`}
                          className="min-h-9 rounded-lg border border-[#dfe5d3] px-3 py-2 text-xs font-semibold text-[#46523a]"
                        >
                          Details
                        </Link>
                        {canEdit ? (
                          <Link
                            href={`/dashboard/products/${product.id}/edit`}
                            className="min-h-9 rounded-lg border border-[#dfe5d3] px-3 py-2 text-xs font-semibold text-[#46523a]"
                          >
                            Edit
                          </Link>
                        ) : null}
                        {canEdit && product.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            onClick={() => void changeStatus(product, 'DISCONTINUED')}
                            className="min-h-9 rounded-lg border border-[#efd4cf] px-3 py-2 text-xs font-semibold text-[#a63832]"
                          >
                            Discontinue
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => setDeleting(product)}
                            className="min-h-9 rounded-lg border border-[#efd4cf] px-3 py-2 text-xs font-semibold text-[#a63832]"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0eb] px-4 py-3 text-xs text-[#73766f]">
          <span>
            {total
              ? `Showing ${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}`
              : 'No products'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              aria-label="Previous page"
              className="grid h-9 w-9 place-items-center rounded-lg border border-[#e0e5d8] hover:bg-[#f4f8e7] disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              aria-label="Next page"
              className="grid h-9 w-9 place-items-center rounded-lg border border-[#e0e5d8] hover:bg-[#f4f8e7] disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </footer>
      </section>

      {deleting ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busyAction) setDeleting(null);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-product-title"
            className="w-full max-w-md rounded-2xl border border-[#e6e9e1] bg-white p-5 shadow-2xl"
          >
            <h2 id="delete-product-title" className="text-lg font-bold text-[#292d27]">
              Delete {deleting.name}?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#73766f]">
              A product can only be deleted when it has no operational history. Products referenced
              by stock movements, purchases, sales or counts must be discontinued to preserve
              records.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busyAction}
                onClick={() => setDeleting(null)}
                className="min-h-10 rounded-xl border border-[#dfe5d3] px-4 text-sm font-semibold text-[#545850]"
              >
                Keep product
              </button>
              <button
                type="button"
                disabled={busyAction}
                onClick={() => void removeProduct()}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#a63832] px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {busyAction ? <Loader2 size={16} className="animate-spin" /> : null}Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
