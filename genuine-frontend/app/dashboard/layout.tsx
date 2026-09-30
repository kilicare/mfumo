'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, ChevronDown, HelpCircle, LayoutDashboard, LogOut, Menu, Package, Settings2, ShoppingCart, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const initialize = useAuthStore((state) => state.initialize);
  const logout = useAuthStore((state) => state.logout);
  const syncToken = useAuthStore((state) => state.syncToken);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (status === 'loading') void initialize();
  }, [status, initialize]);

  useEffect(() => {
    const sync = () => syncToken();
    window.addEventListener('genuine:token-refreshed', sync);
    return () => window.removeEventListener('genuine:token-refreshed', sync);
  }, [syncToken]);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  async function handleLogout() {
    setIsSigningOut(true);
    await logout();
    router.replace('/login');
  }

  if (status !== 'authenticated' || !user) {
    return <main className="grid min-h-screen place-items-center bg-[#f7f7f4] px-5"><div className="flex items-center gap-3 text-sm text-[#73766f]"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#c8cbc3] border-t-[#173d31]" />Verifying your secure session…</div></main>;
  }

  const navItems = [
    { label: 'Overview', href: '/dashboard', icon: LayoutDashboard, active: pathname === '/dashboard' },
    { label: 'Sales', href: '#', icon: ShoppingCart, active: false, comingSoon: true },
    { label: 'Inventory', href: '#', icon: Package, active: false, comingSoon: true },
    { label: 'Settings', href: '#', icon: Settings2, active: false, comingSoon: true },
  ];
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || user.email[0].toUpperCase();

  return (
    <div className="min-h-screen bg-[#f5f6f2] lg:flex">
      {mobileMenuOpen ? <button aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} className="fixed inset-0 z-30 bg-black/40 lg:hidden" /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col bg-[#17231d] px-5 py-6 text-white transition-transform lg:static lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-2">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#d9ad42] text-lg font-black text-[#17231d]">G</span>
            <span><span className="block text-sm font-bold tracking-[0.18em]">GENUINE</span><span className="mt-0.5 block text-[9px] tracking-[0.2em] text-white/50">BUSINESS SUITE</span></span>
          </Link>
          <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-white/60 hover:bg-white/10 lg:hidden"><X size={18} /></button>
        </div>
        <div className="mt-9 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">Current workspace</p>
          <p className="mt-1.5 truncate text-sm font-medium">{user.businessName || 'Your business'}</p>
        </div>
        <p className="mb-3 mt-9 px-3 text-[10px] font-bold uppercase tracking-[0.17em] text-white/35">Workspace</p>
        <nav aria-label="Main navigation" className="space-y-1">
          {navItems.map(({ label, href, icon: Icon, active, comingSoon }) => (
            comingSoon ? (
              <button key={label} type="button" disabled className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white/35">
                <Icon size={17} strokeWidth={1.8} />{label}<span className="ml-auto text-[9px] uppercase tracking-wider text-white/30">Soon</span>
              </button>
            ) : (
              <Link key={label} href={href} onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? 'bg-[#d9ad42] font-semibold text-[#17231d]' : 'text-white/70 hover:bg-white/[0.07] hover:text-white'}`}>
                <Icon size={17} strokeWidth={1.8} />{label}
              </Link>
            )
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/80"><HelpCircle size={15} className="text-[#e5c36f]" />Need a hand?</div>
          <p className="mt-2 text-[11px] leading-5 text-white/45">Your workspace is ready. More tools will appear as modules are added.</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-[#e8e9e5] bg-white/90 px-4 backdrop-blur sm:px-7 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 text-[#4f544c] hover:bg-[#f1f2ee] lg:hidden"><Menu size={19} /></button>
            <div><p className="text-xs text-[#858880]">Workspace / <span className="text-[#343832]">Overview</span></p><p className="mt-0.5 truncate text-sm font-semibold text-[#20231f]">Business overview</p></div>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <button type="button" aria-label="Notifications" disabled className="relative rounded-lg p-2 text-[#73766f] opacity-60"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#d9ad42]" /></button>
            <div className="hidden h-8 w-px bg-[#e8e9e5] sm:block" />
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e7ecdf] text-xs font-bold text-[#31513c]">{initials}</span>
              <span className="hidden min-w-0 sm:block"><span className="block max-w-40 truncate text-xs font-semibold text-[#30342e]">{user.name || `${user.firstName} ${user.lastName}`}</span><span className="mt-0.5 block max-w-40 truncate text-[10px] text-[#858880]">{user.roles?.[0] || 'Team member'}</span></span>
              <ChevronDown size={14} className="hidden text-[#858880] sm:block" />
            </div>
            <button type="button" onClick={handleLogout} disabled={isSigningOut} className="flex items-center gap-2 rounded-lg border border-[#e8e9e5] px-3 py-2 text-xs font-semibold text-[#545850] transition hover:border-[#cbd0c6] hover:bg-[#f8f9f6] disabled:opacity-60"><LogOut size={15} /><span className="hidden md:inline">{isSigningOut ? 'Signing out' : 'Sign out'}</span></button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-7 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
