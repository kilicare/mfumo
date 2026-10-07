'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw, Trash2, WifiOff, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { purchaseMoney, purchasesAPI } from '@/lib/api/purchases';
import { listOfflinePurchaseDrafts, removeOfflinePurchaseDraft, type OfflinePurchaseDraft } from '@/lib/pwa/offlinePurchaseDrafts';
import { notify } from '@/components/ui/AppToaster';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const INSTALL_DISMISSAL_KEY = 'genuine.pwa-install-dismissed-until';

export function PWAExperience() {
  const user = useAuthStore((state) => state.user);
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissedInstall, setDismissedInstall] = useState(false);
  const [iosInstallHelp, setIosInstallHelp] = useState(false);
  const [pendingDrafts, setPendingDrafts] = useState<OfflinePurchaseDraft[]>([]);
  const [syncingDrafts, setSyncingDrafts] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [showDraftDetails, setShowDraftDetails] = useState(false);

  useEffect(() => {
    let active = true;
    const refreshQueue = async () => {
      if (!user?.id || !user.businessId) { setPendingDrafts([]); return; }
      try {
        const drafts = await listOfflinePurchaseDrafts(user.id, user.businessId);
        if (active) setPendingDrafts(drafts);
      } catch {
        if (active) setSyncError('Offline draft storage could not be opened. Your local data may need browser storage access.');
      }
    };
    void refreshQueue();
    const onQueueChanged = () => { void refreshQueue(); };
    window.addEventListener('genuine:offline-purchase-drafts-changed', onQueueChanged);
    window.addEventListener('online', onQueueChanged);
    window.addEventListener('focus', onQueueChanged);
    return () => {
      active = false;
      window.removeEventListener('genuine:offline-purchase-drafts-changed', onQueueChanged);
      window.removeEventListener('online', onQueueChanged);
      window.removeEventListener('focus', onQueueChanged);
    };
  }, [user?.id, user?.businessId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    try {
      const hiddenUntil = Number(window.localStorage.getItem(INSTALL_DISMISSAL_KEY) || 0);
      if (hiddenUntil > Date.now()) setDismissedInstall(true);
      else window.localStorage.removeItem(INSTALL_DISMISSAL_KEY);
    } catch {
      // Storage can be unavailable in private/restricted browser contexts.
    }
    const ua = navigator.userAgent;
    setIosInstallHelp(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    let registration: ServiceWorkerRegistration | undefined;
    let disposed = false;
    let updateInterval: ReturnType<typeof setInterval> | undefined;
    let updateFound: (() => void) | undefined;
    let workerState: (() => void) | undefined;
    let installingWorker: ServiceWorker | null = null;
    if ('serviceWorker' in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registered) => {
        if (disposed) return;
        registration = registered;
        if (registered.waiting) setWaitingWorker(registered.waiting);
        workerState = () => {
          if (registered.waiting && navigator.serviceWorker.controller) setWaitingWorker(registered.waiting);
        };
        updateFound = () => {
          installingWorker = registered.installing;
          installingWorker?.addEventListener('statechange', workerState as EventListener);
        };
        registered.addEventListener('updatefound', updateFound);
        updateInterval = setInterval(() => { void registered.update().catch(() => undefined); }, 60 * 60 * 1000);
      }).catch(() => {
        // Offline shell enhancement is optional; normal online navigation remains available.
      });
    }

    return () => {
      disposed = true;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if (updateInterval) clearInterval(updateInterval);
      if (registration && updateFound) registration.removeEventListener('updatefound', updateFound);
      if (installingWorker && workerState) installingWorker.removeEventListener('statechange', workerState as EventListener);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
    else dismissInstall();
  }

  function dismissInstall() {
    setDismissedInstall(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISSAL_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch {
      // Dismissal remains effective for this app session when storage is unavailable.
    }
  }

  function updateApp() {
    if (!waitingWorker || isUpdating) return;
    setIsUpdating(true);
    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true });
    waitingWorker.postMessage({ type: 'ACTIVATE_UPDATE' });
  }

  async function syncPurchaseDrafts() {
    if (!online || syncingDrafts || !user?.id || !user.businessId || !user.permissions.includes('purchases.create')) return;
    setSyncingDrafts(true);
    setSyncError('');
    try {
      const drafts = await listOfflinePurchaseDrafts(user.id, user.businessId);
      for (const draft of drafts) {
        if (!navigator.onLine) throw new Error('Connection lost. The remaining drafts are still saved on this device.');
        const created = await purchasesAPI.createOrder(draft.input);
        await removeOfflinePurchaseDraft(draft.id);
        setPendingDrafts((current) => current.filter((item) => item.id !== draft.id));
        notify.success(`Saved draft ${created.poNumber} synced.`);
      }
      window.dispatchEvent(new Event('genuine:offline-purchase-drafts-changed'));
      if (drafts.length) notify.info('Saved drafts are now in the server purchase list as DRAFT orders.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sync saved drafts. They remain on this device.';
      setSyncError(message);
    } finally {
      setSyncingDrafts(false);
    }
  }

  async function discardDraft(id: string) {
    try {
      await removeOfflinePurchaseDraft(id);
      setPendingDrafts((current) => current.filter((draft) => draft.id !== id));
      setSyncError('');
      notify.info('Saved offline draft discarded from this device.');
    } catch {
      setSyncError('Could not discard this saved draft. It remains on this device.');
    }
  }

  const standalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
  const showInstall = installPrompt && !installed && !standalone && !dismissedInstall;
  const showIosHelp = iosInstallHelp && !installed && !standalone && !dismissedInstall && !installPrompt;

  return <>
    {!online ? <div role="status" aria-live="polite" className="fixed inset-x-3 bottom-3 z-[85] mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-[#d8b454]/40 bg-white/90 p-4 text-[#30342e] shadow-[0_18px_50px_rgba(20,30,15,0.22)] backdrop-blur-xl dark:border-[#d8b454]/30 dark:bg-[#141714]/90 dark:text-[#d9dfd4] sm:inset-x-auto sm:right-5 sm:bottom-5">
      <WifiOff className="mt-0.5 shrink-0 text-[#a56a08]" size={19} />
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">You’re offline</p><p className="mt-1 text-xs leading-5 text-[#73766f] dark:text-[#aab2a6]">Live business data needs a connection. Only a purchase-order DRAFT that you explicitly save is kept locally; approvals, receipts, payments, returns, and stock changes are never queued.</p></div>
    </div> : null}
    {pendingDrafts.length > 0 ? <section aria-label="Saved offline purchase drafts" className={`fixed left-3 z-[86] w-[min(420px,calc(100vw-1.5rem))] rounded-2xl border border-[#d8b454]/40 bg-white/95 p-4 text-[#30342e] shadow-[0_18px_50px_rgba(20,30,15,0.22)] backdrop-blur-xl dark:bg-[#141714]/95 dark:text-[#e1e5de] sm:left-5 ${showInstall || showIosHelp ? 'bottom-[100px]' : 'bottom-3'}`}>
      <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#fff4d9] text-[#94620c] dark:bg-[#332c1b] dark:text-[#e9c66d]"><RefreshCw size={17} /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{pendingDrafts.length} purchase draft{pendingDrafts.length === 1 ? '' : 's'} saved on this device</p><p className="mt-1 text-xs leading-5 text-[#73766f] dark:text-[#aab2a6]">Not sent to the supplier. Sync creates server-side DRAFT orders; it does not approve them.</p></div></div>
      {syncError ? <p role="alert" className="mt-2 text-xs leading-5 text-[#a63832]">{syncError}</p> : null}
      <div className="mt-3 flex items-center justify-between gap-2"><button type="button" onClick={() => setShowDraftDetails((shown) => !shown)} className="text-left text-[11px] font-semibold text-[#596b05] underline-offset-4 hover:underline dark:text-[#d8f04b]">{showDraftDetails ? 'Hide saved drafts' : 'Review or discard drafts'}</button><button type="button" onClick={() => void syncPurchaseDrafts()} disabled={!online || syncingDrafts || !user?.permissions.includes('purchases.create')} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg bg-[#20211f] px-3 text-xs font-semibold text-white hover:bg-[#353832] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#d8f04b] dark:text-[#20211f]">{syncingDrafts ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{syncingDrafts ? 'Syncing…' : 'Sync saved drafts'}</button></div>
      {showDraftDetails ? <ul className="mt-3 divide-y divide-[#e8e9e5] dark:divide-[#343b33]">{pendingDrafts.map((draft) => {
        const subtotal = draft.input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice - (item.discount || 0), 0);
        const tax = draft.input.taxAmount ?? subtotal * (draft.input.taxPercentage || 0) / 100;
        const total = subtotal + (draft.input.shippingCost || 0) + tax;
        return <li key={draft.id} className="flex items-center gap-3 py-2.5 text-xs"><span className="min-w-0 flex-1"><span className="block font-semibold">Purchase draft · {new Date(draft.createdAt).toLocaleString()}</span><span className="mt-0.5 block text-[#73766f] dark:text-[#aab2a6]">{draft.input.items.length} item(s) · {purchaseMoney(total)}</span></span><button type="button" onClick={() => void discardDraft(draft.id)} aria-label="Discard saved purchase draft" className="rounded-lg p-2 text-[#a63832] hover:bg-[#fff0ed] dark:hover:bg-[#351e1b]"><Trash2 size={15} /></button></li>;
      })}</ul> : null}
      {!user?.permissions.includes('purchases.create') ? <p className="mt-2 text-xs text-[#a63832]">This signed-in account cannot create purchase orders. Switch to an authorized account in the matching workspace to sync.</p> : null}
    </section> : null}
    {showInstall ? <div role="region" aria-label="Install Genuine" className="fixed bottom-3 left-3 z-[84] flex max-w-[min(390px,calc(100vw-1.5rem))] items-center gap-3 rounded-2xl border border-[#d8b454]/35 bg-white/90 p-3.5 text-[#30342e] shadow-[0_18px_50px_rgba(20,30,15,0.2)] backdrop-blur-xl dark:bg-[#141714]/90 dark:text-[#e1e5de] sm:bottom-5 sm:left-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f0f7c9] text-[#596b05] dark:bg-[#28301c] dark:text-[#d8f04b]"><Download size={18} /></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Install Genuine</p><p className="mt-0.5 text-xs text-[#73766f] dark:text-[#aab2a6]">Open your workspace from your home screen.</p></div>
      <button type="button" onClick={() => void install()} className="min-h-9 rounded-lg bg-[#20211f] px-3 text-xs font-semibold text-white hover:bg-[#353832] dark:bg-[#d8f04b] dark:text-[#20211f]">Install</button>
      <button type="button" aria-label="Dismiss install prompt" onClick={dismissInstall} className="rounded-lg p-2 text-[#73766f] hover:bg-black/5 dark:hover:bg-white/10"><X size={16} /></button>
    </div> : null}
    {showIosHelp ? <div role="region" aria-label="Add Genuine to Home Screen" className="fixed bottom-3 left-3 z-[84] flex max-w-[min(390px,calc(100vw-1.5rem))] items-start gap-3 rounded-2xl border border-[#d8b454]/35 bg-white/90 p-3.5 text-[#30342e] shadow-[0_18px_50px_rgba(20,30,15,0.2)] backdrop-blur-xl dark:bg-[#141714]/90 dark:text-[#e1e5de] sm:bottom-5 sm:left-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f0f7c9] text-[#596b05] dark:bg-[#28301c] dark:text-[#d8f04b]"><Download size={18} /></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Add Genuine to Home Screen</p><p className="mt-0.5 text-xs leading-5 text-[#73766f] dark:text-[#aab2a6]">Open the browser Share menu, then choose “Add to Home Screen”.</p></div>
      <button type="button" aria-label="Dismiss install instructions" onClick={dismissInstall} className="rounded-lg p-2 text-[#73766f] hover:bg-black/5 dark:hover:bg-white/10"><X size={16} /></button>
    </div> : null}
    {waitingWorker ? <div role="status" aria-live="polite" className="fixed right-3 top-[78px] z-[84] flex max-w-[min(390px,calc(100vw-1.5rem))] items-center gap-3 rounded-2xl border border-[#d8b454]/35 bg-white/90 p-3.5 text-[#30342e] shadow-[0_18px_50px_rgba(20,30,15,0.2)] backdrop-blur-xl dark:bg-[#141714]/90 dark:text-[#e1e5de] sm:right-5">
      <RefreshCw size={18} className="shrink-0 text-[#70820f] dark:text-[#d8f04b]" />
      <p className="flex-1 text-xs leading-5">A Genuine update is ready.</p>
      <button type="button" onClick={updateApp} disabled={isUpdating} className="min-h-9 rounded-lg bg-[#20211f] px-3 text-xs font-semibold text-white hover:bg-[#353832] disabled:opacity-60 dark:bg-[#d8f04b] dark:text-[#20211f]">{isUpdating ? 'Updating…' : 'Update'}</button>
    </div> : null}
  </>;
}
