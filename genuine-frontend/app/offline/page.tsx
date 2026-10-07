import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return <main className="flex min-h-screen items-center justify-center bg-[#f3efe6] p-5 text-[#20231f] dark:bg-[#080908] dark:text-[#e1e5de]">
    <section className="w-full max-w-md rounded-3xl border border-[#e5e3da] bg-white p-7 text-center shadow-sm dark:border-[#30362f] dark:bg-[#141714]">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f0f7c9] text-[#596b05] dark:bg-[#29311d] dark:text-[#d8f04b]"><WifiOff size={25} /></span>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-[#70820f] dark:text-[#d8f04b]">G Genuine</p>
      <h1 className="mt-2 text-2xl font-semibold">You’re offline</h1>
      <p className="mt-3 text-sm leading-6 text-[#73766f] dark:text-[#aab2a6]">Reconnect to load workspace data or submit changes. Only purchase-order drafts that you explicitly save are kept on this device; approvals, receipts, payments, returns, and inventory changes are never queued.</p>
      <p className="mt-6 text-sm font-medium text-[#a56a08]">Check your connection, then refresh this page.</p>
      <Link href="/login" className="mt-5 inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold text-[#596b05] underline-offset-4 hover:underline dark:text-[#d8f04b]">Go to sign in</Link>
    </section>
  </main>;
}
