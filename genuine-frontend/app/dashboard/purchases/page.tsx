'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, ClipboardList, Loader2, PackageCheck, Plus, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { getApiError } from '@/lib/api';
import { purchasesAPI, purchaseMoney, type GoodsReceivedNote, type PurchaseOrder, type PurchaseReturn, type PurchaseStatus } from '@/lib/api/purchases';

const statuses: PurchaseStatus[] = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CANCELLED'];
const chip: Record<string, string> = { DRAFT: 'bg-[#f1f2ee] text-[#5a6056]', ORDERED: 'bg-[#eaf1ff] text-[#315f9a]', PARTIALLY_RECEIVED: 'bg-[#fff6df] text-[#93600c]', FULLY_RECEIVED: 'bg-[#e9f7ef] text-[#16734a]', ACCEPTED: 'bg-[#e9f7ef] text-[#16734a]', APPROVED: 'bg-[#e9f7ef] text-[#16734a]', REJECTED: 'bg-[#fff0ed] text-[#a63832]', CANCELLED: 'bg-[#fff0ed] text-[#a63832]', CLOSED: 'bg-[#edf0e3] text-[#5e6e12]' };
type Tab = 'orders' | 'receipts' | 'returns';

export default function PurchasesPage() {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const canView = permissions.includes('purchases.view');
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [grns, setGrns] = useState<GoodsReceivedNote[]>([]);
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('orderDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [supplierOptions, setSupplierOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [supplierOptionsError, setSupplierOptionsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!canView) { setLoading(false); return; }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setOrders([]); setTotal(0); setError('Start date must be on or before end date.'); setLoading(false);
      return;
    }
    setLoading(true); setError('');
    try {
      const [po, notes, ret] = await Promise.all([
        purchasesAPI.orders({ search: search.trim() || undefined, status: status || undefined, supplierId: supplierId || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, limit: 20, sortBy, sortOrder }),
        purchasesAPI.grns(), purchasesAPI.returns(),
      ]);
      setOrders(po.data); setTotal(po.total); setGrns(notes); setReturns(ret);
    } catch (e) { setError(getApiError(e, 'Could not load purchase records.')); }
    finally { setLoading(false); }
  }, [canView, search, status, supplierId, dateFrom, dateTo, sortBy, sortOrder, page]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!canView) return;
    let active = true;
    purchasesAPI.orders({ page: 1, limit: 100 }).then((result) => {
      if (active) {
        const options = new Map<string, { id: string; name: string }>();
        result.data.forEach((po) => options.set(po.supplierId, { id: po.supplierId, name: po.supplierName }));
        setSupplierOptions([...options.values()].sort((a, b) => a.name.localeCompare(b.name)));
      }
    }).catch((e) => {
      if (active) setSupplierOptionsError(getApiError(e, 'Could not load supplier filters.'));
    });
    return () => { active = false; };
  }, [canView]);

  const refreshWithBrandLoader = async () => {
    window.dispatchEvent(new Event('genuine:workspace-refresh-start'));
    try { await load(); }
    finally { window.dispatchEvent(new Event('genuine:workspace-refresh-end')); }
  };

  if (!canView) return <section className="mx-auto max-w-2xl rounded-2xl border border-[#efd4cf] bg-white p-7 text-center"><AlertCircle className="mx-auto h-8 w-8 text-[#a63832]"/><h1 className="mt-3 text-xl font-semibold">Purchases access required</h1><p className="mt-2 text-sm text-[#73766f]">Your account does not have the <code>purchases.view</code> permission.</p></section>;
  const pageCount = Math.max(1, Math.ceil(total / 20));
  return <div className="mx-auto w-full max-w-7xl min-w-0 space-y-6">
    <header className="flex flex-col gap-4 rounded-2xl border border-[#e6e8e1] bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-7">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#738900]">Procurement</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#20211f]">Purchases</h1><p className="mt-2 text-sm text-[#73766f]">Purchase orders, receiving notes, supplier returns and payments.</p></div>
      {permissions.includes('purchases.create') && <Link href="/dashboard/purchases/orders/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-transparent bg-[#20211f] px-4 font-semibold text-white shadow-sm transition hover:bg-[#343632] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#738900] dark:border-[#596347] dark:bg-[#050605] dark:text-[#e7e9e3] dark:hover:border-[#829600] dark:hover:bg-[#111510] dark:hover:shadow-[0_0_18px_rgba(216,240,75,0.12)] dark:focus-visible:outline-[#d8f04b]"><Plus size={18}/>New purchase order</Link>}
    </header>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Purchase orders" value={total}/><Metric label="Goods received notes" value={grns.length}/><Metric label="Supplier returns" value={returns.length}/></div>
    <section className="overflow-hidden rounded-2xl border border-[#e6e8e1] bg-white shadow-sm">
      <div className="flex flex-wrap gap-2 border-b border-[#eceee8] p-4">
        {([['orders','Purchase orders',ClipboardList],['receipts','Goods received',PackageCheck],['returns','Returns',RotateCcw]] as const).map(([id,label,Icon])=><button key={id} onClick={()=>setTab(id)} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold ${tab===id?'bg-[#e8f2aa] text-[#465600]':'text-[#686d64] hover:bg-[#f5f6f2]'}`}><Icon size={16}/>{label}</button>)}
        <button onClick={()=>void refreshWithBrandLoader()} disabled={loading} className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#e2e4dd] px-3 text-sm font-medium text-[#555a52] hover:bg-[#f7f8f5] disabled:cursor-wait disabled:opacity-60"><RefreshCw size={15} className={loading?'animate-spin':''}/>Refresh</button>
      </div>
      {tab==='orders' && <div className="grid gap-3 border-b border-[#eceee8] p-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(220px,1fr)_150px_190px_145px_145px_155px_130px]"><label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-[#888d84]"/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search PO number or supplier" aria-label="Search purchase orders" className="min-h-10 w-full rounded-xl border border-[#dfe2da] pl-9 pr-3 text-sm outline-none focus:border-[#829600]"/></label><select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}} aria-label="Filter by purchase status" className="min-h-10 rounded-xl border border-[#dfe2da] px-3 text-sm"><option value="">All statuses</option>{statuses.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}</select><select value={supplierId} onChange={e=>{setSupplierId(e.target.value);setPage(1)}} aria-label="Filter by supplier" className="min-h-10 rounded-xl border border-[#dfe2da] px-3 text-sm"><option value="">All suppliers</option>{supplierOptions.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><label className="grid gap-1 text-xs text-[#73766f]">From date<input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(1)}} aria-label="Filter purchase orders from date" className="min-h-10 w-full rounded-xl border border-[#dfe2da] px-3 text-sm text-[#242622] outline-none focus:border-[#829600]"/></label><label className="grid gap-1 text-xs text-[#73766f]">To date<input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage(1)}} aria-label="Filter purchase orders to date" className="min-h-10 w-full rounded-xl border border-[#dfe2da] px-3 text-sm text-[#242622] outline-none focus:border-[#829600]"/></label><select value={sortBy} onChange={e=>{setSortBy(e.target.value);setPage(1)}} aria-label="Sort purchase orders by" className="min-h-10 rounded-xl border border-[#dfe2da] px-3 text-sm"><option value="poNumber">PO number</option><option value="totalAmount">Total amount</option><option value="orderDate">Order date</option><option value="createdAt">Date created</option></select><select value={sortOrder} onChange={e=>{setSortOrder(e.target.value as 'asc'|'desc');setPage(1)}} aria-label="Sort direction" className="min-h-10 rounded-xl border border-[#dfe2da] px-3 text-sm"><option value="desc">Descending</option><option value="asc">Ascending</option></select>{supplierOptionsError ? <p role="status" className="text-xs text-[#9b3730] md:col-span-full">Supplier filter unavailable: {supplierOptionsError}</p> : null}</div>}
      {error && <div className="m-4 flex items-center gap-2 rounded-xl border border-[#efd4cf] bg-[#fff7f5] p-4 text-sm text-[#9b3730]"><AlertCircle size={17}/><span>{error}</span><button onClick={()=>void load()} className="ml-auto font-semibold underline">Retry</button></div>}
      {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-[#73766f]"><Loader2 className="animate-spin" size={18}/>Loading purchases…</div> : tab==='orders' ? <>
        <div className="divide-y divide-[#eceee8]">{orders.map(po=><Link key={po.id} href={`/dashboard/purchases/orders/${po.id}`} className="group grid gap-3 p-4 transition hover:bg-[#fbfcf9] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6"><div className="min-w-0"><p className="truncate font-semibold text-[#242622] group-hover:underline group-hover:decoration-[#738900] group-hover:underline-offset-4 dark:group-hover:decoration-[#d8b454]">{po.poNumber} <span className={`ml-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${chip[po.status]||chip.DRAFT}`}>{po.status.replace(/_/g,' ')}</span></p><p className="mt-1 truncate text-sm text-[#73766f]">{po.supplierName} · {po.locationName} · {new Date(po.orderDate).toLocaleDateString()}</p></div><div className="text-sm text-[#73766f]">{po.items.length} items</div><div className="text-left font-semibold sm:text-right">{purchaseMoney(po.totalAmount)}<p className="mt-1 text-xs font-normal text-[#73766f]">Due {purchaseMoney(po.balanceDue)}</p></div><ArrowRight className="hidden text-[#9ba094] transition-transform group-hover:translate-x-1 group-hover:text-[#738900] sm:block" size={16}/></Link>)}{!orders.length && <Empty title="No purchase orders" text="Create a draft order to start a supplier purchase."/>}</div>
        <Pagination page={page} pages={pageCount} setPage={setPage} shown={orders.length} total={total}/>
    </> : tab==='receipts' ? <div className="divide-y divide-[#eceee8]">{grns.map(grn=><Link key={grn.id} href={`/dashboard/purchases/grn/${grn.id}`} className="group flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-[#fbfcf9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#738900] sm:px-6 dark:hover:bg-[#20241f]"><div><p className="font-semibold text-[#242622] group-hover:underline group-hover:decoration-[#738900] group-hover:underline-offset-4 dark:text-[#f0f1ed] dark:group-hover:decoration-[#d8f04b]">{grn.grnNumber} <span className={`ml-2 rounded-full px-2.5 py-1 text-[11px] font-bold ${chip[grn.status]}`}>{grn.status}</span></p><p className="mt-1 text-sm text-[#73766f] dark:text-[#afb5ac]">{grn.poNumber} · {grn.supplierName} · {new Date(grn.receivedDate).toLocaleDateString()}</p></div><p className="text-sm text-[#30332e] dark:text-[#e1e4dc]">Received {grn.totalReceivedQty} · Accepted {grn.totalAcceptedQty} · Rejected {grn.totalRejectedQty} · Damaged {grn.totalDamageQty}</p><ArrowRight className="ml-auto text-[#9ba094] transition-transform group-hover:translate-x-1 group-hover:text-[#738900] dark:group-hover:text-[#d8f04b]" size={16}/></Link>)}{!grns.length&&<Empty title="No goods received notes" text="Create a GRN from an approved purchase order when stock arrives."/>}</div> : <div className="divide-y divide-[#eceee8]">{returns.map(ret=><Link key={ret.id} href={`/dashboard/purchases/orders/${ret.purchaseOrderId}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-[#fbfcf9] sm:px-6"><div><p className="font-semibold">{ret.returnNumber} <span className={`ml-2 rounded-full px-2.5 py-1 text-[11px] font-bold ${chip[ret.status]||chip.DRAFT}`}>{ret.status}</span></p><p className="mt-1 text-sm text-[#73766f]">{ret.poNumber} · {ret.supplierName} · {ret.items.length} items</p></div><p className="font-semibold">{purchaseMoney(ret.totalReturnAmount)}</p></Link>)}{!returns.length&&<Empty title="No supplier returns" text="Returns can be raised from purchase orders after items have been received."/>}</div>}
    </section>
  </div>;
}

function Metric({label,value}:{label:string;value:number}) { return <div className="rounded-2xl border border-[#e6e8e1] bg-white p-5 shadow-sm"><p className="text-sm text-[#73766f]">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>; }
function Empty({title,text}:{title:string;text:string}) { return <div className="p-12 text-center"><p className="font-semibold">{title}</p><p className="mt-2 text-sm text-[#73766f]">{text}</p></div>; }
function Pagination({page,pages,setPage,shown,total}:{page:number;pages:number;setPage:(n:number)=>void;shown:number;total:number}) { return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eceee8] px-4 py-3 text-sm text-[#73766f]"><span>Showing {total?((page-1)*20+1):0}–{(page-1)*20+shown} of {total}</span><div className="flex gap-2"><button disabled={page<=1} onClick={()=>setPage(page-1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Previous</button><span className="px-2 py-1.5">{page} / {pages}</span><button disabled={page>=pages} onClick={()=>setPage(page+1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Next</button></div></div>; }
