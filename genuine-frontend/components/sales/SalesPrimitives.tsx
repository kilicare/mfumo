'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import type { InvoiceStatus, ReturnStatus } from '@/lib/api/sales';

export const money = (value: number, currency = 'TZS') => new Intl.NumberFormat(undefined, {
  style: 'currency', currency, maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);

export const dateLabel = (value?: string) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))
  : '—';

export function useSalesPermissions() {
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);
  return {
    canView: permissions.includes('sales.view'),
    canCreate: permissions.includes('sales.create'),
    canEdit: permissions.includes('sales.edit'),
    canApprove: permissions.includes('sales.approve'),
    canCancel: permissions.includes('sales.cancel'),
    canDiscount: permissions.includes('sales.discount'),
    canPay: permissions.includes('payments.create'),
    canViewCustomers: permissions.includes('customers.view'),
    canViewProducts: permissions.includes('products.view'),
    canViewSettings: permissions.includes('settings.view'),
  };
}

const invoiceColors: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700', ISSUED: 'bg-blue-100 text-blue-800',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-800', PAID: 'bg-emerald-100 text-emerald-800',
  OVERDUE: 'bg-rose-100 text-rose-800', CANCELLED: 'bg-zinc-200 text-zinc-700',
};
const returnColors: Record<ReturnStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700', AUTHORIZED: 'bg-blue-100 text-blue-800',
  RECEIVED: 'bg-emerald-100 text-emerald-800', COMPLETED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-800',
};

export function StatusBadge({ status }: { status: InvoiceStatus | ReturnStatus }) {
  const className = status in invoiceColors
    ? invoiceColors[status as InvoiceStatus]
    : returnColors[status as ReturnStatus];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{status.replace(/_/g, ' ')}</span>;
}

export function SalesHeading({ title, description, action }: {
  title: string; description: string; action?: { href: string; label: string };
}) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#637b12]">Sales</p><h1 className="mt-1 text-2xl font-semibold text-[#292d27]">{title}</h1><p className="mt-1 text-sm text-[#747a68]">{description}</p></div>
    {action ? <Link href={action.href} className="inline-flex min-h-10 items-center rounded-lg bg-[#20211f] px-4 text-sm font-semibold text-white hover:bg-[#353832] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#718b11]">{action.label}</Link> : null}
  </div>;
}

export function SalesNotice({ children, kind = 'error' }: { children: React.ReactNode; kind?: 'error' | 'info' }) {
  return <div role={kind === 'error' ? 'alert' : 'status'} aria-live={kind === 'error' ? 'assertive' : 'polite'} className={`mb-4 rounded-lg border px-4 py-3 text-sm ${kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-[#dce8a2] bg-[#f6f9e8] text-[#48580d]'}`}>{children}</div>;
}
