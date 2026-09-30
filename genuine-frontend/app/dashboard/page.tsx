'use client';

import { ArrowRight, BarChart3, Boxes, CreditCard, ShoppingBasket } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';

const modules = [
  { title: 'Sales', description: 'Invoices, customer payments and returns.', icon: ShoppingBasket, color: 'bg-[#edf4ed] text-[#386047]' },
  { title: 'Inventory', description: 'Stock levels, movements and transfers.', icon: Boxes, color: 'bg-[#f5f0e3] text-[#927126]' },
  { title: 'Finance', description: 'Payments, expenses and account periods.', icon: CreditCard, color: 'bg-[#edf0f6] text-[#53678f]' },
  { title: 'Insights', description: 'Reports and performance summaries.', icon: BarChart3, color: 'bg-[#f2edf5] text-[#765686]' },
];

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl bg-[#173d31] px-6 py-8 text-white shadow-sm sm:px-9 sm:py-10">
        <div className="absolute -right-20 -top-32 h-80 w-80 rounded-full border border-white/10" />
        <div className="absolute -right-8 -top-20 h-60 w-60 rounded-full border border-[#d9ad42]/25" />
        <div className="relative max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.17em] text-[#e5c36f]">Your workspace is ready</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome, {user?.firstName || 'there'}.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/65">Your account is connected to {user?.businessName || 'your business'}. As each workspace module is introduced, its live business data will appear here.</p>
        </div>
      </section>

      <section aria-labelledby="modules-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#a77c1e]">Connected operations</p><h2 id="modules-heading" className="mt-1.5 text-xl font-semibold tracking-tight text-[#20231f]">Your business, in one place</h2></div>
          <span className="rounded-full border border-[#e2e4dd] bg-white px-3 py-1.5 text-[11px] font-medium text-[#73766f]">Modules are being connected</span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {modules.map(({ title, description, icon: Icon, color }) => (
            <article key={title} className="rounded-2xl border border-[#e8e9e5] bg-white p-5 shadow-sm shadow-black/[0.02]">
              <span className={`grid h-11 w-11 place-items-center rounded-xl ${color}`}><Icon size={19} strokeWidth={1.8} /></span>
              <h3 className="mt-5 text-sm font-semibold text-[#292d27]">{title}</h3>
              <p className="mt-1.5 min-h-10 text-xs leading-5 text-[#7b7e77]">{description}</p>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a9d95]">Coming in a later phase <ArrowRight size={13} /></div>
            </article>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-dashed border-[#d5d8cf] bg-white/55 px-5 py-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-semibold text-[#42463f]">Signed in securely</p><p className="mt-1 text-xs text-[#858880]">{user?.email} · {user?.roles?.join(', ') || 'No role assigned'}</p></div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/dashboard/security" className="text-xs font-semibold text-[#31513c] hover:underline">Change password</Link>
          <p className="text-xs text-[#858880]">Workspace ID: <span className="font-mono">{user?.businessId}</span></p>
        </div>
      </section>
    </div>
  );
}
