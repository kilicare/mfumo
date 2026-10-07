'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Toaster, toast, useToasterStore, type Toast } from 'react-hot-toast';

type NoticeKind = 'success' | 'error' | 'warning' | 'info';

const styles: Record<NoticeKind, { icon: typeof CheckCircle2; accent: string; tint: string }> = {
  success: { icon: CheckCircle2, accent: '#16734a', tint: '#e9f7ef' },
  error: { icon: AlertCircle, accent: '#bd3f36', tint: '#fff0ed' },
  warning: { icon: AlertTriangle, accent: '#a56a08', tint: '#fff7df' },
  info: { icon: Info, accent: '#3468a8', tint: '#edf5ff' },
};

function ToastCard({ item, kind, message }: { item: Toast; kind: NoticeKind; message: string }) {
  const style = styles[kind];
  const Icon = style.icon;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className="flex w-[min(390px,calc(100vw-2rem))] items-start gap-3 rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_18px_50px_rgba(20,30,15,0.18)] backdrop-blur-xl ring-1 ring-black/[0.04] dark:border-white/10 dark:bg-[#191d19]/80" style={{ borderLeft: `4px solid ${style.accent}` }}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ color: style.accent, backgroundColor: style.tint }}><Icon size={19} /></span>
      <p className="min-w-0 flex-1 pt-1 text-sm font-medium leading-5 text-[#30342e]">{message}</p>
      <button type="button" onClick={() => toast.dismiss(item.id)} aria-label="Dismiss message" className="rounded-lg p-1 text-[#858880] transition hover:bg-[#f1f2ee] hover:text-[#30342e]"><X size={16} /></button>
    </div>
  );
}

export const notify = {
  success: (message: string) => toast.custom((item) => <ToastCard item={item} kind="success" message={message} />, { duration: 9_000 }),
  error: (message: string) => toast.custom((item) => <ToastCard item={item} kind="error" message={message} />, { duration: 10_000 }),
  warning: (message: string) => toast.custom((item) => <ToastCard item={item} kind="warning" message={message} />, { duration: 8_000 }),
  info: (message: string) => toast.custom((item) => <ToastCard item={item} kind="info" message={message} />, { duration: 8_000 }),
};

export function AppToaster() {
  const { toasts } = useToasterStore();
  const hasVisibleToast = toasts.some((item) => item.visible);

  return <>
    {hasVisibleToast ? <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[90] bg-black/[0.035] backdrop-blur-[1.5px]" /> : null}
    <Toaster position="top-right" gutter={10} containerClassName="!top-4 !right-4 !z-[100]" />
  </>;
}
