'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Barcode,
  Boxes,
  CalendarClock,
  Loader2,
  Package,
  Pencil,
  Warehouse,
} from 'lucide-react';
import { getApiError } from '@/lib/api';
import {
  formatProductMoney,
  productsAPI,
  type Product,
  type ProductStock,
} from '@/lib/api/products';
import { useAuthStore } from '@/store/authStore';
import { ProductPhoto } from '@/components/products/ProductImages';

const panel = 'min-w-0 rounded-2xl border border-[#e6e9e1] bg-white p-4 shadow-sm sm:p-6';
const statusStyles: Record<Product['status'], string> = {
  ACTIVE: 'bg-[#e9f7ef] text-[#16734a]',
  INACTIVE: 'bg-[#fff7df] text-[#93600c]',
  DISCONTINUED: 'bg-[#fff0ed] text-[#a63832]',
};

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);
  const [product, setProduct] = useState<Product | null>(null);
  const [stock, setStock] = useState<ProductStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stockError, setStockError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setStockError('');
    Promise.allSettled([productsAPI.get(id), productsAPI.stock(id)])
      .then(([productResult, stockResult]) => {
        if (!active) return;
        if (productResult.status === 'fulfilled') setProduct(productResult.value);
        else setError(getApiError(productResult.reason, 'We could not load this product.'));
        if (stockResult.status === 'fulfilled') setStock(stockResult.value);
        else setStockError(getApiError(stockResult.reason, 'Stock by location is unavailable.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (!permissions.includes('products.view'))
    return (
      <section className={`${panel} mx-auto max-w-xl text-center`}>
        <AlertCircle className="mx-auto text-[#a63832]" />
        <h1 className="mt-3 text-lg font-bold text-[#292d27]">Products access required</h1>
        <p className="mt-2 text-sm text-[#73766f]">
          Your account does not have the `products.view` permission.
        </p>
      </section>
    );
  if (loading)
    return (
      <div className="grid min-h-64 place-items-center text-sm text-[#73766f]">
        <span className="flex items-center gap-2">
          <Loader2 className="animate-spin" size={18} />
          Loading product…
        </span>
      </div>
    );
  if (error || !product)
    return (
      <section role="alert" className={`${panel} mx-auto max-w-xl text-center`}>
        <AlertCircle className="mx-auto text-[#a63832]" />
        <h1 className="mt-3 text-lg font-bold text-[#292d27]">Product unavailable</h1>
        <p className="mt-2 text-sm text-[#73766f]">{error || 'Product not found.'}</p>
        <Link
          href="/dashboard/products"
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe5d3] px-4 text-sm font-semibold text-[#46523a]"
        >
          <ArrowLeft size={16} />
          Back to products
        </Link>
      </section>
    );

  const margin =
    product.sellingPrice > 0
      ? ((product.sellingPrice - product.buyingPrice) / product.sellingPrice) * 100
      : 0;
  return (
    <div className="min-w-0 space-y-5">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/dashboard/products"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#65705c] hover:text-[#20211f]"
          >
            <ArrowLeft size={16} />
            Products
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="break-words text-2xl font-bold tracking-tight text-[#20231f] sm:text-3xl">
              {product.name}
            </h1>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[product.status]}`}
            >
              {product.status.replace('_', ' ')}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#73766f]">
            SKU {product.sku}
            {product.barcode ? ` · Barcode ${product.barcode}` : ''}
          </p>
        </div>
        {permissions.includes('products.edit') ? (
          <Link
            href={`/dashboard/products/${product.id}/edit`}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#20211f] px-4 text-sm font-bold text-white hover:bg-[#315c45]"
          >
            <Pencil size={16} />
            Edit product
          </Link>
        ) : null}
      </header>

      {product.images?.length ? (
        <section
          className="grid min-w-0 gap-3 rounded-2xl border border-[#e6e9e1] bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-6 lg:grid-cols-4"
          aria-label="Product photos"
        >
          {product.images
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((image) => (
              <ProductPhoto
                key={image.id}
                productId={product.id}
                image={image}
                className="aspect-square w-full rounded-xl"
              />
            ))}
        </section>
      ) : null}
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#e6e9e1] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#858880]">
            Selling price
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#292d27]">
            {formatProductMoney(product.sellingPrice, product.currency)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#e6e9e1] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#858880]">
            Buying price
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#292d27]">
            {formatProductMoney(product.buyingPrice, product.currency)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#e6e9e1] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#858880]">
            Gross margin
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#16734a]">{margin.toFixed(2)}%</p>
          <p className="mt-1 text-[11px] text-[#858880]">Price spread before operating costs</p>
        </div>
        <div className="rounded-2xl border border-[#e6e9e1] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#858880]">
            Total stock
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#292d27]">
            {stock?.totalQuantity ?? product.currentStock ?? '—'}{' '}
            <span className="text-sm font-medium">{product.defaultUnit}</span>
          </p>
        </div>
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)]">
        <section className={panel}>
          <div className="flex items-center gap-2">
            <Package className="text-[#70820f]" size={18} />
            <h2 className="text-base font-bold text-[#292d27]">Product details</h2>
          </div>
          <dl className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
            {[
              ['Category', product.categoryName],
              ['Brand', product.brandName || '—'],
              ['Preferred supplier', product.supplierName || '—'],
              ['Barcode', product.barcode || '—'],
              [
                'Wholesale price',
                product.wholesalePrice == null
                  ? '—'
                  : formatProductMoney(product.wholesalePrice, product.currency),
              ],
              ['Manufacturer', product.manufacturer || '—'],
              ['Weight', product.weight == null ? '—' : `${product.weight}`],
              ['Color', product.color || '—'],
              ['Size', product.size || '—'],
              [
                'Expiry handling',
                product.requiresExpiry
                  ? `Required${product.expiryDays != null ? ` · ${product.expiryDays} days` : ''}`
                  : 'Not required',
              ],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-[#858880]">
                  {label}
                </dt>
                <dd className="mt-1 break-words text-sm font-medium text-[#343832]">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 border-t border-[#eef0eb] pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#858880]">
              Description
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#545850]">
              {product.description || 'No description provided.'}
            </p>
          </div>
        </section>

        <section className={panel}>
          <div className="flex items-center gap-2">
            <Warehouse className="text-[#3468a8]" size={18} />
            <h2 className="text-base font-bold text-[#292d27]">Stock by location</h2>
          </div>
          {stockError ? (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-[#f0d2a7] bg-[#fff8e9] p-3 text-sm text-[#7a4d11]"
            >
              {stockError}
            </div>
          ) : stock?.locations.length ? (
            <div className="mt-4 divide-y divide-[#eef0eb]">
              {stock.locations.map((location) => (
                <div
                  key={location.locationId}
                  className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#343832]">
                      {location.locationName}
                    </p>
                    <p className="text-xs text-[#858880]">{location.locationCode}</p>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-[#292d27]">
                    {location.quantity} {product.defaultUnit}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#73766f]">
              No active location balances were returned.
            </p>
          )}
          <div className="mt-5 border-t border-[#eef0eb] pt-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#343832]">
              <Boxes size={16} className="text-[#70820f]" />
              Units for this product
            </h3>
            <div className="mt-2 space-y-2">
              {product.productUnits.map((unit) => (
                <div key={unit.id} className="flex justify-between gap-2 text-sm">
                  <span className="truncate text-[#545850]">
                    {unit.unitName} ({unit.unitSymbol}){' '}
                    {unit.isDefault ? <span className="text-xs text-[#70820f]">Base</span> : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-[#73766f]">
                    × {unit.conversionFactor}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className={panel}>
        <div className="flex items-center gap-2">
          <CalendarClock className="text-[#a56a08]" size={18} />
          <h2 className="text-base font-bold text-[#292d27]">Recent inventory movements</h2>
        </div>
        {stockError ? (
          <p className="mt-3 text-sm text-[#73766f]">Movement history could not be loaded.</p>
        ) : stock?.recentMovements.length ? (
          <div className="mt-3 divide-y divide-[#eef0eb]">
            {stock.recentMovements.map((movement) => (
              <div
                key={movement.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#343832]">
                    {movement.type.replace(/_/g, ' ')} · {movement.locationName}
                  </p>
                  <p className="break-words text-xs text-[#858880]">
                    {movement.referenceType || 'Movement'}
                    {movement.referenceId ? ` · ${movement.referenceId}` : ''}
                    {movement.notes ? ` · ${movement.notes}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-right">
                  <span className="text-sm font-bold tabular-nums text-[#343832]">
                    {movement.quantity} {product.defaultUnit}
                  </span>
                  <time className="text-xs text-[#858880]">
                    {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                      new Date(movement.createdAt)
                    )}
                  </time>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#73766f]">
            No inventory movements have been recorded for this product.
          </p>
        )}
      </section>
      <div className="flex items-center gap-2 text-xs text-[#858880]">
        <Barcode size={14} />
        Created{' '}
        {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
          new Date(product.createdAt)
        )}
        ; updated{' '}
        {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
          new Date(product.updatedAt)
        )}
      </div>
    </div>
  );
}
