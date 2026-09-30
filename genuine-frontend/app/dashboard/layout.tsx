'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, CircleDollarSign, FileBarChart2, HelpCircle, LayoutDashboard, LogOut, Menu, Package, PanelLeftClose, PanelLeftOpen, ShoppingCart, Store, Truck, UserRound, UsersRound, Warehouse, X, Settings2, Receipt, ImagePlus, Trash2, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authAPI, getApiError } from '@/lib/api';
import { notify } from '@/components/ui/AppToaster';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const initialize = useAuthStore((state) => state.initialize);
  const logout = useAuthStore((state) => state.logout);
  const updateUser = useAuthStore((state) => state.updateUser);
  const syncToken = useAuthStore((state) => state.syncToken);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const avatarObjectUrl = useRef<string | null>(null);

  const replaceAvatarUrl = useCallback((nextUrl: string | null) => {
    if (avatarObjectUrl.current) URL.revokeObjectURL(avatarObjectUrl.current);
    avatarObjectUrl.current = nextUrl;
    setAvatarUrl(nextUrl);
  }, []);
  const compactSidebar = isDesktop && sidebarCollapsed;

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem('genuine.dashboardSidebarCollapsed') === 'true');
    const media = window.matchMedia('(min-width: 1024px)');
    const updateViewport = () => setIsDesktop(media.matches);
    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      window.localStorage.setItem('genuine.dashboardSidebarCollapsed', String(next));
      return next;
    });
  }

  useEffect(() => {
    if (status === 'loading') void initialize();
  }, [status, initialize]);

  useEffect(() => {
    const sync = () => syncToken();
    window.addEventListener('genuine:token-refreshed', sync);
    return () => window.removeEventListener('genuine:token-refreshed', sync);
  }, [syncToken]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (user?.avatar) {
      void authAPI.getAvatar().then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        avatarObjectUrl.current = objectUrl;
        setAvatarUrl(objectUrl);
      }).catch(() => {
        if (active) replaceAvatarUrl(null);
      });
    } else replaceAvatarUrl(null);
    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        if (avatarObjectUrl.current === objectUrl) avatarObjectUrl.current = null;
      }
    };
  }, [user?.avatar, replaceAvatarUrl]);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  async function handleLogout() {
    setIsSigningOut(true);
    await logout();
    router.replace('/login');
  }

  async function handleAvatarChange(file?: File) {
    if (!file || !user) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      notify.error('Choose a JPG, PNG or WebP image.');
      return;
    }
    setAvatarBusy(true);
    let temporaryUrl: string | null = null;
    try {
      temporaryUrl = URL.createObjectURL(file);
      const image = new window.Image();
      image.src = temporaryUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('This image could not be opened.'));
      });
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not prepare this image.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.82;
      let blob: Blob | null = null;
      while (quality >= 0.42) {
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob && blob.size <= 65_536) break;
        quality -= 0.1;
      }
      if (!blob || blob.size > 65_536) throw new Error('Choose a smaller or simpler image (maximum 64 KB after compression).');
      const avatar = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read this image.'));
        reader.onerror = () => reject(new Error('Could not read this image.'));
        reader.readAsDataURL(blob as Blob);
      });
      const result = await authAPI.updateAvatar(avatar);
      updateUser({ ...user, avatar: result.avatar });
      setAccountMenuOpen(false);
      notify.success('Profile photo updated.');
    } catch (error) {
      notify.error(getApiError(error, error instanceof Error ? error.message : 'Could not update your profile photo.'));
    } finally {
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
      setAvatarBusy(false);
      if (photoInput.current) photoInput.current.value = '';
    }
  }

  async function handleRemoveAvatar() {
    if (!user || !user.avatar) return;
    setAvatarBusy(true);
    try {
      await authAPI.updateAvatar('');
      updateUser({ ...user, avatar: null });
      replaceAvatarUrl(null);
      setAccountMenuOpen(false);
      notify.success('Profile photo removed.');
    } catch (error) {
      notify.error(getApiError(error, 'Could not remove your profile photo.'));
    } finally {
      setAvatarBusy(false);
    }
  }

  if (status !== 'authenticated' || !user) {
    return <main className="grid min-h-screen place-items-center bg-[#f7f7f4] px-5"><div className="flex items-center gap-3 text-sm text-[#73766f]"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#c8cbc3] border-t-[#20211f]" />Verifying your secure session…</div></main>;
  }

  const navItems = [
    { label: 'Overview', href: '/dashboard', icon: LayoutDashboard, active: pathname === '/dashboard' },
    { label: 'Sales', href: '#', icon: ShoppingCart, active: false, comingSoon: true },
    { label: 'Products', href: '#', icon: Package, active: false, comingSoon: true },
    { label: 'Inventory', href: '#', icon: Warehouse, active: false, comingSoon: true },
    { label: 'Purchases', href: '#', icon: Truck, active: false, comingSoon: true },
    { label: 'Customers', href: '#', icon: UsersRound, active: false, comingSoon: true },
    { label: 'Suppliers', href: '#', icon: UserRound, active: false, comingSoon: true },
    { label: 'Payments & Finance', href: '#', icon: CircleDollarSign, active: false, comingSoon: true },
    { label: 'Expenses', href: '#', icon: Receipt, active: false, comingSoon: true },
    { label: 'Reports & Analytics', href: '#', icon: FileBarChart2, active: false, comingSoon: true },
    { label: 'Settings', href: '/dashboard/security', icon: Settings2, active: pathname.startsWith('/dashboard/security') },
  ];
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || user.email[0].toUpperCase();

  return (
    <div className="min-h-screen bg-[#f5f6f2] lg:flex">
      {mobileMenuOpen ? <button aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} className="fixed inset-0 z-30 bg-black/40 lg:hidden" /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col bg-[#20211f] px-5 py-6 text-white transition-all duration-200 lg:static lg:translate-x-0 ${sidebarCollapsed ? 'lg:w-[84px] lg:px-3' : 'lg:w-[270px]'} ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className={`flex items-center ${compactSidebar ? 'justify-center lg:px-0' : 'justify-between px-2'}`}>
          <Link href="/dashboard" className="flex min-w-0 items-center" aria-label="Genuine dashboard" title="Genuine dashboard">
            {compactSidebar ? <Image src="/GGENUINE_FULL_BRAND_PACKAGE/logos/svg/logo-symbol-monochrome-white.svg" alt="G Genuine" width={64} height={64} priority className="h-10 w-10" /> : <Image src="/GGENUINE_FULL_BRAND_PACKAGE/logos/svg/logo-horizontal-white.svg" alt="G Genuine — Trust, Build, Grow" width={900} height={220} priority className="h-auto w-[180px]" />}
          </Link>
          <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-white/60 hover:bg-white/10 lg:hidden"><X size={18} /></button>
          <button type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hidden rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white lg:inline-flex">
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
        <div className={`mt-9 rounded-xl border border-white/10 bg-white/[0.04] ${compactSidebar ? 'flex justify-center p-2.5' : 'px-3.5 py-3'}`} title={compactSidebar ? user.businessName || 'Your business' : undefined}>
          {compactSidebar ? <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#c9e600] text-sm font-bold text-[#20211f]"><Store size={17} /></span> : <><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">Current workspace</p><p className="mt-1.5 truncate text-sm font-medium">{user.businessName || 'Your business'}</p></>}
        </div>
        {!compactSidebar ? <p className="mb-3 mt-9 px-3 text-[10px] font-bold uppercase tracking-[0.17em] text-white/35">Workspace</p> : <div className="mt-9" />}
        <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {navItems.map(({ label, href, icon: Icon, active, comingSoon }) => (
            comingSoon ? (
              <button key={label} type="button" disabled aria-label={`${label} coming soon`} title={compactSidebar ? `${label} (coming soon)` : undefined} className={`flex w-full cursor-not-allowed items-center rounded-xl py-2.5 text-left text-sm text-white/35 ${compactSidebar ? 'justify-center px-0' : 'gap-3 px-3'}`}>
                <Icon size={17} strokeWidth={1.8} />{!compactSidebar ? <>{label}<span className="ml-auto text-[9px] uppercase tracking-wider text-white/30">Soon</span></> : null}
              </button>
            ) : (
              <Link key={label} href={href} onClick={() => setMobileMenuOpen(false)} aria-label={compactSidebar ? label : undefined} title={compactSidebar ? label : undefined} className={`flex items-center rounded-xl py-2.5 text-sm transition ${compactSidebar ? 'justify-center px-0' : 'gap-3 px-3'} ${active ? 'bg-[#d8f04b] font-semibold text-[#20211f]' : 'text-white/70 hover:bg-white/[0.07] hover:text-white'}`}>
                <Icon size={17} strokeWidth={1.8} />{!compactSidebar ? label : null}
              </Link>
            )
          ))}
        </nav>
        <div className={`mt-5 rounded-xl border border-white/10 bg-white/[0.04] ${compactSidebar ? 'flex justify-center p-3' : 'p-3.5'}`} title={compactSidebar ? 'Need a hand? Your workspace is ready.' : undefined}>
          {compactSidebar ? <HelpCircle size={18} className="text-[#d8f04b]" /> : <><div className="flex items-center gap-2 text-xs font-semibold text-white/80"><HelpCircle size={15} className="text-[#d8f04b]" />Need a hand?</div><p className="mt-2 text-[11px] leading-5 text-white/45">Your workspace is ready. More tools will appear as modules are added.</p></>}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-[#e8e9e5] bg-white/90 px-4 backdrop-blur sm:px-7 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 text-[#4f544c] hover:bg-[#f1f2ee] lg:hidden"><Menu size={19} /></button>
            <div><p className="text-xs text-[#858880]">Workspace / <span className="text-[#343832]">Overview</span></p><p className="mt-0.5 truncate text-sm font-semibold text-[#20231f]">Business overview</p></div>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <button type="button" aria-label="Notifications" disabled className="relative rounded-xl bg-[#f0f7c9] p-2 text-[#596b05] transition hover:bg-[#e7f49d] disabled:cursor-not-allowed"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-white bg-[#c9e600]" /></button>
            <div className="hidden h-8 w-px bg-[#e8e9e5] sm:block" />
            <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAccountMenuOpen(false); }}>
              <button type="button" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-[#f4f6ef] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9dbb16]">
                {avatarUrl ? <Image src={avatarUrl} alt="Profile" width={36} height={36} unoptimized className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-[#e4f28a]" /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e4f28a] text-xs font-bold text-[#354400]">{initials}</span>}
                <span className="hidden min-w-0 sm:block"><span className="block max-w-40 truncate text-xs font-semibold text-[#30342e]">{user.name || `${user.firstName} ${user.lastName}`}</span><span className="mt-0.5 block max-w-40 truncate text-[10px] text-[#73766f]">{user.roles?.[0] || 'Team member'}</span></span>
                <ChevronDown size={14} className={`hidden text-[#596b05] transition sm:block ${accountMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {accountMenuOpen ? <div role="menu" aria-label="Account options" className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-[#e2e7d3] bg-white p-1.5 shadow-xl shadow-black/10">
                <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose profile photo" onChange={(event) => void handleAvatarChange(event.target.files?.[0])} />
                <button type="button" role="menuitem" disabled={avatarBusy} onClick={() => photoInput.current?.click()} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#30342e] transition hover:bg-[#f0f7c9] hover:text-[#354400] disabled:opacity-60">{avatarBusy ? <Loader2 size={16} className="animate-spin text-[#70820f]" /> : <ImagePlus size={16} className="text-[#70820f]" />}{avatarBusy ? 'Saving photo…' : avatarUrl ? 'Change profile photo' : 'Add profile photo'}</button>
                {avatarUrl ? <button type="button" role="menuitem" disabled={avatarBusy} onClick={() => void handleRemoveAvatar()} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#a63832] transition hover:bg-[#fff0ed] disabled:opacity-60"><Trash2 size={16} />Remove profile photo</button> : null}
                <Link href="/dashboard/security" role="menuitem" onClick={() => setAccountMenuOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#30342e] transition hover:bg-[#f0f7c9] hover:text-[#354400]"><Settings2 size={16} className="text-[#70820f]" />Change password</Link>
              </div> : null}
            </div>
            <button type="button" onClick={handleLogout} disabled={isSigningOut} aria-label={isSigningOut ? 'Signing out' : 'Sign out'} className="flex items-center gap-2 rounded-lg border border-[#e8e9e5] px-3 py-2 text-xs font-semibold text-[#545850] transition hover:border-[#cbd0c6] hover:bg-[#f8f9f6] disabled:opacity-60"><LogOut size={15} /><span className="hidden md:inline">{isSigningOut ? 'Signing out' : 'Sign out'}</span></button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-7 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
