'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowUpRight, Check, Loader2, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { getApiError } from '@/lib/api';
import { purchasesAPI, type GoodsReceivedNote } from '@/lib/api/purchases';
import { notify } from '@/components/ui/AppToaster';

const statusStyles: Record<GoodsReceivedNote['status'], string> = {
  RECEIVED: 'bg-[#eaf1ff] text-[#315f9a] dark:bg-[#1c2a3e] dark:text-[#a9c9ff]',
  ACCEPTED: 'bg-[#e9f7ef] text-[#16734a] dark:bg-[#173426] dark:text-[#8fe0b1]',
  REJECTED: 'bg-[#fff0ed] text-[#a63832] dark:bg-[#3a211f] dark:text-[#ffaaa0]',
};

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
};

export default function GoodsReceivedNoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);
  const canView = permissions.includes('purchases.view');
  const [grn, setGrn] = useState<GoodsReceivedNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setGrn(await purchasesAPI.grn(id));
    } catch (cause) {
      setError(getApiError(cause, 'Could not load this goods received note.'));
    } finally {
      setLoading(false);
    }
  }, [canView, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function processGrn(action: 'accept' | 'reject', reason?: string) {
    setBusy(true);
    setError('');
    try {
      const updated = action === 'accept'
        ? await purchasesAPI.acceptGrn(id)
        : await purchasesAPI.rejectGrn(id, reason ?? '');
      setGrn(updated);
      setRejectOpen(false);
      setRejectReason('');
      setRejectError('');
      notify.success(action === 'accept' ? 'Receipt accepted; stock has been updated.' : 'Receipt rejected.');
    } catch (cause) {
      const message = getApiError(cause, 'Could not update this goods received note.');
      setError(message);
      notify.error(message);
    } finally {
      setBusy(false);
    }
  }

  function submitReject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError('A rejection reason is required.');
      return;
    }
    if (reason.length > 500) {
      setRejectError('Reason must be 500 characters or fewer.');
      return;
    }
    void processGrn('reject', reason);
  }

  if (!canView) {
    return <AccessMessage title="Purchases access required" message="Your account does not have the purchases.view permission." />;
  }

  if (loading) {
    return <div className="mx-auto flex max-w-5xl items-center gap-2 rounded-2xl border border-[#e6e8e1] bg-white p-8 text-sm text-[#73766f] dark:border-[#343a32] dark:bg-[#171a17] dark:text-[#afb5ac]"><Loader2 className="animate-spin" size={18} />Loading goods received note…</div>;
  }

  if (error && !grn) {
    return <div className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-[#efd4cf] bg-white p-6 dark:border-[#533530] dark:bg-[#171a17]"><div className="flex items-start gap-3 text-sm text-[#9b3730] dark:text-[#ffaaa0]"><AlertCircle size={18} className="mt-0.5 shrink-0" /><p>{error}</p></div><button onClick={() => void load()} className="min-h-10 rounded-xl border border-[#dfe2da] px-4 text-sm font-semibold hover:bg-[#f5f6f2] dark:border-[#41473f] dark:hover:bg-[#222622]">Retry</button></div>;
  }

  if (!grn) return null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <Link href={`/dashboard/purchases/orders/${grn.purchaseOrderId}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#555a52] transition hover:bg-[#f5f6f2] hover:text-[#738900] hover:underline hover:underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#738900] dark:text-[#d5d8d1] dark:hover:bg-[#222622] dark:hover:text-[#d8f04b]"><ArrowLeft size={16} />Back to purchase order</Link>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#efd4cf] bg-[#fff7f5] p-4 text-sm text-[#9b3730] dark:border-[#533530] dark:bg-[#241a19] dark:text-[#ffaaa0]"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}

      <section className="overflow-hidden rounded-2xl border border-[#e6e8e1] bg-white shadow-sm dark:border-[#343a32] dark:bg-[#171a17]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#eceee8] p-5 sm:p-7 dark:border-[#343a32]">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#738900] dark:text-[#d8f04b]">Goods received note</p><h1 className="mt-2 break-all text-2xl font-semibold tracking-tight text-[#20211f] dark:text-[#f0f1ed]">{grn.grnNumber}</h1><Link href={`/dashboard/purchases/orders/${grn.purchaseOrderId}`} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#656a61] transition hover:text-[#738900] hover:underline hover:underline-offset-4 dark:text-[#b9beb5] dark:hover:text-[#d8f04b]">Purchase order {grn.poNumber}<ArrowUpRight size={14} /></Link><p className="mt-1 text-sm text-[#73766f] dark:text-[#afb5ac]">{grn.supplierName} · {grn.locationName}</p></div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusStyles[grn.status]}`}>{grn.status}</span>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-7">
          <Summary label="Received" value={grn.totalReceivedQty} />
          <Summary label="Accepted" value={grn.totalAcceptedQty} />
          <Summary label="Rejected" value={grn.totalRejectedQty} />
          <Summary label="Damaged" value={grn.totalDamageQty} />
        </div>

        <div className="border-t border-[#eceee8] p-5 sm:p-7 dark:border-[#343a32]">
          <h2 className="text-lg font-semibold text-[#20211f] dark:text-[#f0f1ed]">Receipt information</h2>
          <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Received date" value={formatDate(grn.receivedDate)} />
            <Info label="Vehicle registration" value={grn.vehicleRegistration} />
            <Info label="Driver name" value={grn.driverName} />
            <Info label="Waybill number" value={grn.waybillNumber} />
          </dl>
          {grn.notes && <div className="mt-5 rounded-xl border border-[#eceee8] bg-[#fafbf8] p-4 dark:border-[#343a32] dark:bg-[#1e221e]"><p className="text-xs font-semibold text-[#73766f] dark:text-[#afb5ac]">Receiving notes</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#30332e] dark:text-[#e1e4dc]">{grn.notes}</p></div>}
        </div>

        <div className="border-t border-[#eceee8] dark:border-[#343a32]">
          <h2 className="px-5 pt-5 text-lg font-semibold text-[#20211f] sm:px-7 dark:text-[#f0f1ed]">Items</h2>
          <div className="divide-y divide-[#eceee8] dark:divide-[#343a32]">
            {grn.items.map((item) => (
              <article key={item.id} className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(70px,0.5fr))] sm:items-center sm:px-7">
                <div className="min-w-0"><p className="break-words font-semibold text-[#242622] dark:text-[#f0f1ed]">{item.productName}</p><p className="mt-1 break-all text-xs text-[#73766f] dark:text-[#afb5ac]">{item.productSku || 'No SKU'}</p>{item.notes && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[#73766f] dark:text-[#afb5ac]">{item.notes}</p>}</div>
                <Quantity label="Received" value={item.receivedQuantity} />
                <Quantity label="Accepted" value={item.acceptedQuantity} />
                <Quantity label="Rejected" value={item.rejectedQuantity} />
                <Quantity label="Damaged" value={item.damageQuantity} />
                {(item.batchNumber || item.expiryDate) && <div className="grid gap-3 border-t border-[#eceee8] pt-3 sm:col-span-full sm:grid-cols-2 dark:border-[#343a32]"><Info label="Batch number" value={item.batchNumber} /><Info label="Expiry date" value={formatDate(item.expiryDate)} /></div>}
              </article>
            ))}
            {!grn.items.length && <p className="p-7 text-sm text-[#73766f] dark:text-[#afb5ac]">This receipt has no item lines.</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[#eceee8] p-5 sm:p-7 dark:border-[#343a32]">
          <Link href={`/dashboard/purchases/orders/${grn.purchaseOrderId}#receipt-${grn.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe2da] px-4 text-sm font-semibold transition hover:bg-[#f5f6f2] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#738900] dark:border-[#41473f] dark:hover:bg-[#222622]">Open on order</Link>
          {grn.status === 'RECEIVED' && permissions.includes('purchases.edit') && <Link href={`/dashboard/purchases/orders/${grn.purchaseOrderId}#receipt-${grn.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#20211f] px-4 text-sm font-semibold text-white transition hover:bg-[#343632] hover:shadow-md hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#738900] dark:bg-[#050605] dark:hover:border-[#829600] dark:hover:bg-[#111510]">Edit receipt</Link>}
          {grn.status === 'RECEIVED' && permissions.includes('purchases.approve') && <div className="ml-auto flex flex-wrap gap-2"><button disabled={busy} onClick={() => void processGrn('accept')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#e7f4ed] px-4 text-sm font-semibold text-[#16734a] transition hover:bg-[#dcefe4] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#16734a] disabled:opacity-50 dark:bg-[#173426] dark:text-[#8fe0b1] dark:hover:bg-[#204832]"><Check size={16}/>{busy ? 'Saving…' : 'Accept receipt'}</button><button disabled={busy} onClick={() => {setRejectReason('');setRejectError('');setRejectOpen(true);}} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#fff0ed] px-4 text-sm font-semibold text-[#a63832] transition hover:bg-[#ffe4df] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a63832] disabled:opacity-50 dark:bg-[#3a211f] dark:text-[#ffaaa0] dark:hover:bg-[#4a2926]"><X size={16}/>Reject receipt</button></div>}
        </div>
      </section>

      {rejectOpen && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4" onMouseDown={(event) => {if(event.target===event.currentTarget&&!busy)setRejectOpen(false);}}><form onSubmit={submitReject} className="w-full max-w-lg space-y-4 rounded-2xl border border-[#e6e8e1] bg-white p-5 shadow-2xl dark:border-[#343a32] dark:bg-[#171a17]"><div><h2 className="text-lg font-semibold text-[#20211f] dark:text-[#f0f1ed]">Reject {grn.grnNumber}</h2><p className="mt-1 text-sm text-[#73766f] dark:text-[#afb5ac]">Add a reason. It will be recorded with this goods received note.</p></div><label className="block text-sm font-semibold text-[#353832] dark:text-[#e1e4dc]">Rejection reason<textarea autoFocus required maxLength={500} value={rejectReason} onChange={(event) => {setRejectReason(event.target.value);setRejectError('');}} className="mt-2 min-h-28 w-full rounded-xl border border-[#dfe2da] bg-white p-3 text-sm outline-none focus:border-[#829600] focus:ring-2 focus:ring-[#d8f04b]/40 dark:border-[#41473f] dark:bg-[#111411] dark:text-[#f0f1ed]" aria-invalid={!!rejectError} aria-describedby={rejectError?'grn-reject-error':undefined} />{rejectError&&<span id="grn-reject-error" role="alert" className="mt-1 block text-sm text-[#a63832]">{rejectError}</span>}</label><div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setRejectOpen(false)} className="min-h-10 rounded-xl border border-[#dfe2da] px-4 text-sm font-semibold hover:bg-[#f5f6f2] dark:border-[#41473f] dark:hover:bg-[#222622]">Cancel</button><button disabled={busy} className="min-h-10 rounded-xl bg-[#a63832] px-4 text-sm font-semibold text-white transition hover:bg-[#8f2d28] hover:underline disabled:opacity-50">{busy?'Rejecting…':'Reject receipt'}</button></div></form></div>}
    </div>
  );
}

function Summary({label,value}:{label:string;value:number}) { return <div className="rounded-xl border border-[#e6e8e1] bg-[#fafbf8] p-4 dark:border-[#343a32] dark:bg-[#1e221e]"><p className="text-xs font-medium text-[#73766f] dark:text-[#afb5ac]">{label}</p><p className="mt-1 text-2xl font-semibold text-[#20211f] dark:text-[#f0f1ed]">{value}</p></div>; }
function Quantity({label,value}:{label:string;value:number}) { return <div><p className="text-xs text-[#73766f] dark:text-[#afb5ac]">{label}</p><p className="mt-1 font-semibold text-[#20211f] dark:text-[#f0f1ed]">{value}</p></div>; }
function Info({label,value}:{label:string;value?:string}) { return <div><dt className="text-xs font-medium text-[#73766f] dark:text-[#afb5ac]">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-[#30332e] dark:text-[#e1e4dc]">{value?.trim() || '—'}</dd></div>; }
function AccessMessage({title,message}:{title:string;message:string}) { return <section className="mx-auto max-w-2xl rounded-2xl border border-[#efd4cf] bg-white p-7 text-center dark:border-[#533530] dark:bg-[#171a17]"><AlertCircle className="mx-auto h-8 w-8 text-[#a63832]"/><h1 className="mt-3 text-xl font-semibold text-[#20211f] dark:text-[#f0f1ed]">{title}</h1><p className="mt-2 text-sm text-[#73766f] dark:text-[#afb5ac]">{message}</p></section>; }
