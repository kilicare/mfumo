'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Loader2,
  PackageCheck,
  RotateCcw,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { getApiError } from '@/lib/api';
import { clearPurchaseRetryKey, purchaseRetryKey } from '@/lib/purchaseIdempotency';
import {
  purchasesAPI,
  purchaseMoney,
  type GoodsReceivedNote,
  type PaymentMethodOption,
  type PurchaseOrder,
  type PurchaseReturn,
} from '@/lib/api/purchases';
import { notify } from '@/components/ui/AppToaster';

const input =
  'min-h-10 w-full rounded-xl border border-[#dfe2da] bg-white px-3 text-sm outline-none focus:border-[#829600] focus:ring-2 focus:ring-[#d8f04b]/40';
const decimalPlaces = (value: number) => {
  const [coefficient, exponent = '0'] = value.toString().toLowerCase().split('e');
  return Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent));
};
type ReceiptLine = {
  purchaseOrderItemId: string;
  receivedQuantity: string;
  acceptedQuantity: string;
  rejectedQuantity: string;
  damageQuantity: string;
  batchNumber: string;
  expiryDate: string;
};
type GrnEditLine = {
  purchaseOrderItemId: string;
  receivedQuantity: string;
  acceptedQuantity: string;
  rejectedQuantity: string;
  damageQuantity: string;
  batchNumber: string;
  expiryDate: string;
  notes: string;
};
type GrnEditMetadata = {
  receivedDate: string;
  vehicleRegistration: string;
  driverName: string;
  waybillNumber: string;
  notes: string;
};
type RejectTarget =
  | { kind: 'grn'; id: string; number: string }
  | { kind: 'return'; id: string; number: string };
const returnReasons = ['DEFECTIVE', 'EXPIRED', 'WRONG_ITEM', 'OVERAGE', 'OTHER'] as const;

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const businessId = useAuthStore((s) => s.user?.businessId || '');
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [grns, setGrns] = useState<GoodsReceivedNote[]>([]);
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [methods, setMethods] = useState<PaymentMethodOption[]>([]);
  const [receivedDate, setReceivedDate] = useState('');
  const [vehicleRegistration, setVehicleRegistration] = useState('');
  const [driverName, setDriverName] = useState('');
  const [waybillNumber, setWaybillNumber] = useState('');
  const [grnNotes, setGrnNotes] = useState('');
  const [receipt, setReceipt] = useState<ReceiptLine[]>([]);
  const [payAmount, setPayAmount] = useState('');
  const [methodId, setMethodId] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentErrorTarget, setPaymentErrorTarget] = useState<'amount' | 'method' | ''>('');
  const paymentAmountRef = useRef<HTMLInputElement | null>(null);
  const paymentMethodRef = useRef<HTMLSelectElement | null>(null);
  const [returnItem, setReturnItem] = useState('');
  const [returnQty, setReturnQty] = useState('');
  const [returnReason, setReturnReason] = useState<(typeof returnReasons)[number]>('DEFECTIVE');
  const [editingGrn, setEditingGrn] = useState('');
  const [grnEditLines, setGrnEditLines] = useState<GrnEditLine[]>([]);
  const [grnEditMetadata, setGrnEditMetadata] = useState<GrnEditMetadata>({
    receivedDate: '',
    vehicleRegistration: '',
    driverName: '',
    waybillNumber: '',
    notes: '',
  });
  const [grnEditError, setGrnEditError] = useState('');
  const [grnEditErrorTarget, setGrnEditErrorTarget] = useState<{
    itemId: string;
    field: string;
  } | null>(null);
  const grnEditInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [receiptErrorTarget, setReceiptErrorTarget] = useState<{
    itemId: string;
    field: string;
  } | null>(null);
  const receiptInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState('');
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReasonError, setRejectReasonError] = useState('');
  const load = useCallback(async () => {
    if (!permissions.includes('purchases.view')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [order, notes, ret] = await Promise.all([
        purchasesAPI.order(id),
        purchasesAPI.grns(id),
        purchasesAPI.returns(id),
      ]);
      setPo(order);
      setGrns(notes);
      setReturns(ret);
      setReceipt(
        order.items
          .filter((i) => i.outstandingQty > 0)
          .map((i) => ({
            purchaseOrderItemId: i.id,
            receivedQuantity: String(i.outstandingQty),
            acceptedQuantity: String(i.outstandingQty),
            rejectedQuantity: '0',
            damageQuantity: '0',
            batchNumber: '',
            expiryDate: '',
          }))
      );
    } catch (e) {
      setError(getApiError(e, 'Could not load this purchase order.'));
    } finally {
      setLoading(false);
    }
  }, [id, permissions]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (permissions.includes('settings.view'))
      purchasesAPI
        .paymentMethods()
        .then((rows) => {
          setMethods(rows.filter((x) => x.isActive));
        })
        .catch(() => undefined);
  }, [permissions]);
  async function act(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    setError('');
    if (key === 'payment') {
      setPaymentError('');
      setPaymentErrorTarget('');
    }
    try {
      await fn();
      notify.success(success);
      await load();
    } catch (e) {
      const message = getApiError(e, 'Action failed. Please retry.');
      setError(message);
      notify.error(message);
      if (key === 'payment') {
        const target = /method/i.test(message) ? 'method' : 'amount';
        setPaymentError(message);
        setPaymentErrorTarget(target);
        (target === 'method' ? paymentMethodRef.current : paymentAmountRef.current)?.focus();
      }
    } finally {
      setBusy('');
    }
  }
  async function submitCancel() {
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelReasonError('Cancellation reason is required.');
      return;
    }
    if (reason.length > 500) {
      setCancelReasonError('Cancellation reason must be 500 characters or fewer.');
      return;
    }
    setCancelReasonError('');
    setBusy('cancel');
    setError('');
    try {
      await purchasesAPI.cancelOrder(id, reason);
      setCancelDialog(false);
      setCancelReason('');
      notify.success('Purchase order cancelled.');
      await load();
    } catch (e) {
      const message = getApiError(e, 'Could not cancel this purchase order.');
      setError(message);
      notify.error(message);
    } finally {
      setBusy('');
    }
  }
  async function submitReject() {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectReasonError('A rejection reason is required.');
      return;
    }
    if (reason.length > 500) {
      setRejectReasonError('Rejection reason must be 500 characters or fewer.');
      return;
    }
    const target = rejectTarget;
    const busyKey = `${target.kind === 'grn' ? 'reject' : 'ret-reject'}-${target.id}`;
    setRejectReasonError('');
    setBusy(busyKey);
    setError('');
    try {
      if (target.kind === 'grn') await purchasesAPI.rejectGrn(target.id, reason);
      else await purchasesAPI.rejectReturn(target.id, reason);
      setRejectTarget(null);
      setRejectReason('');
      notify.success(target.kind === 'grn' ? 'Receipt rejected.' : 'Supplier return rejected.');
      await load();
    } catch (e) {
      const message = getApiError(e, 'Could not reject this record. Please retry.');
      setRejectReasonError(message);
      setError(message);
      notify.error(message);
    } finally {
      setBusy('');
    }
  }
  function rejectReceiptForm(message: string, itemId?: string, field = 'receivedQuantity') {
    setError('');
    setReceiptError(message);
    const targetItemId = itemId || receipt[0]?.purchaseOrderItemId;
    setReceiptErrorTarget(targetItemId ? { itemId: targetItemId, field } : null);
    notify.error(message);
    const target = targetItemId ? receiptInputRefs.current[`${targetItemId}:${field}`] : null;
    target?.focus();
  }
  async function createReceipt() {
    if (!po) return;
    setReceiptError('');
    setReceiptErrorTarget(null);
    for (const line of receipt) {
      for (const field of [
        'receivedQuantity',
        'acceptedQuantity',
        'rejectedQuantity',
        'damageQuantity',
      ] as const) {
        const value = Number(line[field]);
        if (!Number.isFinite(value) || value < 0) {
          rejectReceiptForm(
            'Receipt quantities must be valid non-negative numbers.',
            line.purchaseOrderItemId,
            field
          );
          return;
        }
        if (decimalPlaces(value) > 2) {
          rejectReceiptForm('Use no more than 2 decimal places.', line.purchaseOrderItemId, field);
          return;
        }
      }
    }
    const items = receipt
      .filter((x) => Number(x.receivedQuantity) > 0)
      .map((x) => ({
        purchaseOrderItemId: x.purchaseOrderItemId,
        receivedQuantity: Number(x.receivedQuantity),
        acceptedQuantity: Number(x.acceptedQuantity),
        rejectedQuantity: Number(x.rejectedQuantity),
        damageQuantity: Number(x.damageQuantity),
        batchNumber: x.batchNumber || undefined,
        expiryDate: x.expiryDate || undefined,
      }));
    if (!items.length) {
      rejectReceiptForm('Enter a received quantity for at least one item.');
      return;
    }
    const unbalanced = items.find(
      (x) => x.receivedQuantity !== x.acceptedQuantity + x.rejectedQuantity + x.damageQuantity
    );
    if (unbalanced) {
      rejectReceiptForm(
        'For every line, received quantity must equal accepted + rejected + damaged.',
        unbalanced.purchaseOrderItemId
      );
      return;
    }
    const overAccepted = items.find(
      (x) =>
        x.acceptedQuantity >
        (po.items.find((i) => i.id === x.purchaseOrderItemId)?.outstandingQty ?? 0) + 1e-8
    );
    if (overAccepted) {
      const name =
        po.items.find((i) => i.id === overAccepted.purchaseOrderItemId)?.productName || 'item';
      rejectReceiptForm(
        `Accepted quantity exceeds ordered quantity for ${name}`,
        overAccepted.purchaseOrderItemId,
        'acceptedQuantity'
      );
      return;
    }
    const missingExpiry = items.find(
      (x) =>
        po.items.find((i) => i.id === x.purchaseOrderItemId)?.requiresExpiry &&
        x.acceptedQuantity > 0 &&
        (!x.batchNumber?.trim() || !x.expiryDate)
    );
    if (missingExpiry) {
      rejectReceiptForm(
        'Batch number and expiry date are required for accepted items with expiry tracking.',
        missingExpiry.purchaseOrderItemId,
        !missingExpiry.batchNumber?.trim() ? 'batchNumber' : 'expiryDate'
      );
      return;
    }
    const receivedDay = receivedDate || new Date().toISOString().slice(0, 10);
    const expired = items.find(
      (x) =>
        po.items.find((i) => i.id === x.purchaseOrderItemId)?.requiresExpiry &&
        x.acceptedQuantity > 0 &&
        x.expiryDate &&
        x.expiryDate <= receivedDay
    );
    if (expired) {
      rejectReceiptForm(
        'Expiry date must be after the received date for accepted items.',
        expired.purchaseOrderItemId,
        'expiryDate'
      );
      return;
    }
    const payload = {
      purchaseOrderId: id,
      items,
      receivedDate: receivedDate || undefined,
      vehicleRegistration: vehicleRegistration.trim() || undefined,
      driverName: driverName.trim() || undefined,
      waybillNumber: waybillNumber.trim() || undefined,
      notes: grnNotes.trim() || undefined,
    };
    const retryScope = `${businessId}:${id}:grn`;
    await act(
      'grn',
      async () => {
        const result = await purchasesAPI.createGrn({
          ...payload,
          idempotencyKey: purchaseRetryKey(retryScope, payload),
        });
        clearPurchaseRetryKey(retryScope);
        return result;
      },
      'Goods received note recorded. It is pending acceptance.'
    );
  }
  async function beginGrnEdit(grnId: string) {
    setBusy(`load-grn-${grnId}`);
    setError('');
    setGrnEditError('');
    try {
      const note = await purchasesAPI.grn(grnId);
      setGrnEditLines(
        note.items.map((item) => ({
          purchaseOrderItemId: item.purchaseOrderItemId,
          receivedQuantity: String(item.receivedQuantity),
          acceptedQuantity: String(item.acceptedQuantity),
          rejectedQuantity: String(item.rejectedQuantity),
          damageQuantity: String(item.damageQuantity),
          batchNumber: item.batchNumber || '',
          expiryDate: item.expiryDate?.slice(0, 10) || '',
          notes: item.notes || '',
        }))
      );
      setGrnEditMetadata({
        receivedDate: note.receivedDate?.slice(0, 10) || '',
        vehicleRegistration: note.vehicleRegistration || '',
        driverName: note.driverName || '',
        waybillNumber: note.waybillNumber || '',
        notes: note.notes || '',
      });
      setEditingGrn(grnId);
    } catch (e) {
      const message = getApiError(e, 'Could not load this receipt for editing.');
      setError(message);
      notify.error(message);
    } finally {
      setBusy('');
    }
  }
  function rejectGrnEdit(message: string, itemId?: string, field = 'receivedQuantity') {
    setError('');
    setGrnEditError(message);
    const target = itemId ? { itemId, field } : null;
    setGrnEditErrorTarget(target);
    notify.error(message);
    if (target) grnEditInputRefs.current[`${itemId}:${field}`]?.focus();
  }
  function addGrnEditItem(itemId: string) {
    if (!po) return;
    const orderItem = po.items.find((item) => item.id === itemId);
    if (!orderItem) return;
    setGrnEditLines((lines) =>
      lines.some((line) => line.purchaseOrderItemId === itemId)
        ? lines
        : [
            ...lines,
            {
              purchaseOrderItemId: itemId,
              receivedQuantity: '0',
              acceptedQuantity: '0',
              rejectedQuantity: '0',
              damageQuantity: '0',
              batchNumber: '',
              expiryDate: '',
              notes: '',
            },
          ]
    );
    setGrnEditError('');
    setGrnEditErrorTarget(null);
  }
  function removeGrnEditItem(index: number) {
    setGrnEditLines((lines) => lines.filter((_, lineIndex) => lineIndex !== index));
    setGrnEditError('');
    setGrnEditErrorTarget(null);
  }
  async function saveGrnEdit(grnId: string) {
    if (!po) return;
    const items = grnEditLines.map((line) => ({
      purchaseOrderItemId: line.purchaseOrderItemId,
      receivedQuantity: Number(line.receivedQuantity),
      acceptedQuantity: Number(line.acceptedQuantity),
      rejectedQuantity: Number(line.rejectedQuantity),
      damageQuantity: Number(line.damageQuantity),
      batchNumber: line.batchNumber.trim() || undefined,
      expiryDate: line.expiryDate || undefined,
      notes: line.notes.trim() || undefined,
    }));
    if (!items.length) {
      rejectGrnEdit('A goods received note must contain at least one item.');
      return;
    }
    for (const item of items) {
      for (const field of [
        'receivedQuantity',
        'acceptedQuantity',
        'rejectedQuantity',
        'damageQuantity',
      ] as const) {
        const value = item[field];
        if (!Number.isFinite(value) || value < 0) {
          rejectGrnEdit(
            'Receipt quantities must be valid non-negative numbers.',
            item.purchaseOrderItemId,
            field
          );
          return;
        }
        if (decimalPlaces(value) > 2) {
          rejectGrnEdit('Use no more than 2 decimal places.', item.purchaseOrderItemId, field);
          return;
        }
      }
      if (item.receivedQuantity <= 0) {
        rejectGrnEdit(
          'Enter a received quantity greater than zero for every item.',
          item.purchaseOrderItemId,
          'receivedQuantity'
        );
        return;
      }
      if (
        Math.abs(
          item.receivedQuantity -
            item.acceptedQuantity -
            item.rejectedQuantity -
            item.damageQuantity
        ) > 1e-8
      ) {
        rejectGrnEdit(
          'For every line, received quantity must equal accepted + rejected + damaged.',
          item.purchaseOrderItemId,
          'receivedQuantity'
        );
        return;
      }
      const poItem = po.items.find((row) => row.id === item.purchaseOrderItemId);
      if (!poItem) {
        rejectGrnEdit('Choose an item from this purchase order.', item.purchaseOrderItemId);
        return;
      }
      const alreadyReserved =
        grns
          .find((note) => note.id === grnId)
          ?.items.find((row) => row.purchaseOrderItemId === item.purchaseOrderItemId)
          ?.acceptedQuantity || 0;
      if (item.acceptedQuantity > poItem.outstandingQty + alreadyReserved + 1e-8) {
        rejectGrnEdit(
          `Accepted quantity exceeds ordered quantity for ${poItem.productName}.`,
          item.purchaseOrderItemId,
          'acceptedQuantity'
        );
        return;
      }
      if (poItem.requiresExpiry && item.acceptedQuantity > 0) {
        if (!item.batchNumber?.trim()) {
          rejectGrnEdit(
            `Batch number is required for ${poItem.productName}.`,
            item.purchaseOrderItemId,
            'batchNumber'
          );
          return;
        }
        if (!item.expiryDate) {
          rejectGrnEdit(
            `Expiry date is required for ${poItem.productName}.`,
            item.purchaseOrderItemId,
            'expiryDate'
          );
          return;
        }
        if (item.expiryDate <= grnEditMetadata.receivedDate) {
          rejectGrnEdit(
            `Expiry date must be after the received date for ${poItem.productName}.`,
            item.purchaseOrderItemId,
            'expiryDate'
          );
          return;
        }
      }
    }
    if (!grnEditMetadata.receivedDate) {
      rejectGrnEdit('Received date is required.');
      return;
    }
    setBusy(`save-grn-${grnId}`);
    setError('');
    setGrnEditError('');
    try {
      await purchasesAPI.updateGrn(grnId, {
        items,
        receivedDate: grnEditMetadata.receivedDate,
        vehicleRegistration: grnEditMetadata.vehicleRegistration.trim(),
        driverName: grnEditMetadata.driverName.trim(),
        waybillNumber: grnEditMetadata.waybillNumber.trim(),
        notes: grnEditMetadata.notes.trim(),
      });
      setEditingGrn('');
      notify.success('Goods received note updated.');
      await load();
    } catch (e) {
      const message = getApiError(e, 'Could not update this receipt.');
      setError(message);
      notify.error(message);
    } finally {
      setBusy('');
    }
  }
  if (loading)
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border bg-white p-12 text-sm text-[#73766f]">
        <Loader2 className="animate-spin" size={18} />
        Loading purchase order…
      </div>
    );
  if (!permissions.includes('purchases.view'))
    return <Gate text="Your account does not have the purchases.view permission." />;
  if (!po) return <Gate text={error || 'Purchase order not found.'} />;
  const canReceive = ['ORDERED', 'PARTIALLY_RECEIVED'].includes(po.status);
  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/purchases"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#63685f] hover:text-[#20211f]"
        >
          <ArrowLeft size={16} />
          Back to purchases
        </Link>
        {po.status === 'DRAFT' && permissions.includes('purchases.edit') && (
          <Link
            href={`/dashboard/purchases/orders/${id}/edit`}
            className="inline-flex min-h-10 items-center rounded-xl border border-[#dfe2da] bg-white px-4 text-sm font-semibold text-[#32352e] transition hover:border-[#829600] hover:text-[#647500]"
          >
            Edit draft
          </Link>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-[#efd4cf] bg-[#fff7f5] p-4 text-sm text-[#9b3730]"
        >
          <AlertCircle size={18} className="shrink-0" />
          {error}
          <button onClick={() => void load()} className="ml-auto underline">
            Reload
          </button>
        </div>
      )}
      <header className="flex flex-col gap-4 rounded-2xl border border-[#e6e8e1] bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:p-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#738900]">
            Purchase order
          </p>
          <h1 className="mt-2 break-all text-2xl font-semibold sm:text-3xl">{po.poNumber}</h1>
          <p className="mt-2 text-sm text-[#73766f]">
            {po.supplierName} · {po.locationName} · Ordered{' '}
            {new Date(po.orderDate).toLocaleDateString()}
          </p>
          {po.expectedDeliveryDate && (
            <p className="mt-1 text-sm text-[#73766f]">
              Expected delivery · {new Date(po.expectedDeliveryDate).toLocaleDateString()}
            </p>
          )}
          {po.referenceNumber && (
            <p className="mt-1 break-words text-sm text-[#73766f]">
              Reference · {po.referenceNumber}
            </p>
          )}
          <p className="mt-3">
            <span className="rounded-full bg-[#eef2e2] px-3 py-1.5 text-xs font-bold text-[#53620e]">
              {po.status.replace(/_/g, ' ')}
            </span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-right">
          <Summary label="Total" value={purchaseMoney(po.totalAmount)} />
          <Summary label="Balance due" value={purchaseMoney(po.balanceDue)} />
        </div>
      </header>
      <section className="overflow-hidden rounded-2xl border border-[#e6e8e1] bg-white shadow-sm">
        <div className="border-b border-[#eceee8] px-5 py-4">
          <h2 className="font-semibold">Items</h2>
        </div>
        <div className="divide-y divide-[#eceee8]">
          {po.items.map((item) => (
            <div
              key={item.id}
              className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_repeat(4,auto)] sm:items-center sm:px-5"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.productName}</p>
                <p className="text-xs text-[#73766f]">
                  {item.productSku} · {item.quantity} ordered
                </p>
              </div>
              <p className="text-sm">{purchaseMoney(item.unitPrice)} / unit</p>
              <p className="text-sm">Line {purchaseMoney(item.lineTotal)}</p>
              <p className="text-sm text-[#73766f]">Accepted {item.grnReceivedQty}</p>
              <p className="text-sm font-medium">{item.outstandingQty} outstanding</p>
            </div>
          ))}
        </div>
        <div className="mx-3 my-3 grid gap-2 rounded-2xl border border-[#e7e1c9] bg-[#f4f1e7] p-4 text-sm shadow-sm sm:ml-auto sm:mr-4 sm:w-80">
          <MoneyLine label="Subtotal" value={po.subtotal} />
          <MoneyLine label="Shipping" value={po.shippingCost} />
          <MoneyLine label={po.taxRecoverable ? "Tax · recoverable" : "Tax · non-recoverable (included in stock cost)"} value={po.taxAmount} />
          <MoneyLine label="Paid" value={po.totalPaid} />
          <MoneyLine label="Supplier return credits" value={po.totalReturned} />
          <MoneyLine label="Balance" value={po.balanceDue} bold />
        </div>
        {po.notes && <p className="border-t p-4 text-sm text-[#73766f]">{po.notes}</p>}
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-[#e6e8e1] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <PackageCheck className="text-[#738900]" size={19} />
            <h2 className="text-lg font-semibold">Receiving</h2>
          </div>
          {permissions.includes('purchases.approve') &&
            grns.some((g) => g.status === 'RECEIVED') && (
              <div className="space-y-2 rounded-xl bg-[#f5f6f2] p-3">
                <p className="text-sm font-semibold">Pending quality acceptance</p>
                {grns
                  .filter((g) => g.status === 'RECEIVED')
                  .map((g) => (
                    <div className="flex flex-wrap items-center justify-between gap-2" key={g.id}>
                      <Link href={`/dashboard/purchases/grn/${g.id}`} className="text-sm font-medium hover:text-[#738900] hover:underline hover:underline-offset-4 dark:hover:text-[#d8f04b]">
                        {g.grnNumber} · {g.totalAcceptedQty} accepted
                      </Link>
                      <div className="flex gap-2">
                        <button
                          disabled={!!busy}
                          onClick={() =>
                            void act(
                              `accept-${g.id}`,
                              () => purchasesAPI.acceptGrn(g.id),
                              'Receipt accepted; stock has been updated.'
                            )
                          }
                          className="rounded-lg bg-[#e7f4ed] px-3 py-2 text-xs font-bold text-[#16734a] disabled:opacity-50"
                        >
                          Accept
                        </button>
                        <button
                          disabled={!!busy}
                          onClick={() => {
                            setRejectReason('');
                            setRejectReasonError('');
                            setRejectTarget({ kind: 'grn', id: g.id, number: g.grnNumber });
                          }}
                          className="rounded-lg bg-[#fff0ed] px-3 py-2 text-xs font-bold text-[#a63832] disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          {canReceive && permissions.includes('purchases.create') && (
            <>
              <p className="text-sm text-[#73766f]">
                Record quantities delivered; only accepted quantities enter stock after approval.
              </p>
              {receiptError && (
                <p
                  id="receipt-quantity-error"
                  role="alert"
                  className="rounded-xl border border-[#efd4cf] bg-[#fff7f5] p-3 text-sm text-[#9b3730]"
                >
                  {receiptError}
                </p>
              )}
              <div className="grid gap-3 rounded-xl border border-[#eceee8] bg-[#fafbf8] p-3 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Received date
                  <input
                    type="date"
                    value={receivedDate}
                    onChange={(event) => setReceivedDate(event.target.value)}
                    className={`${input} mt-1`}
                  />
                </label>
                <label className="text-xs font-semibold">
                  Vehicle registration
                  <input
                    maxLength={50}
                    value={vehicleRegistration}
                    onChange={(event) => setVehicleRegistration(event.target.value)}
                    className={`${input} mt-1`}
                    placeholder="Optional · max 50 characters"
                  />
                </label>
                <label className="text-xs font-semibold">
                  Driver name
                  <input
                    maxLength={160}
                    value={driverName}
                    onChange={(event) => setDriverName(event.target.value)}
                    className={`${input} mt-1`}
                    placeholder="Optional · max 160 characters"
                  />
                </label>
                <label className="text-xs font-semibold">
                  Waybill number
                  <input
                    maxLength={120}
                    value={waybillNumber}
                    onChange={(event) => setWaybillNumber(event.target.value)}
                    className={`${input} mt-1`}
                    placeholder="Optional · max 120 characters"
                  />
                </label>
                <label className="text-xs font-semibold sm:col-span-2">
                  Receiving notes
                  <textarea
                    maxLength={500}
                    rows={2}
                    value={grnNotes}
                    onChange={(event) => setGrnNotes(event.target.value)}
                    className={`${input} mt-1 h-auto py-2`}
                    placeholder="Optional · max 500 characters"
                  />
                </label>
              </div>
              {receipt.map((line, index) => {
                const item = po.items.find((i) => i.id === line.purchaseOrderItemId)!;
                const emptyReceipt =
                  receiptError === 'Enter a received quantity for at least one item.';
                return (
                  <div
                    key={line.purchaseOrderItemId}
                    className="space-y-2 rounded-xl border border-[#eceee8] p-3"
                  >
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="font-semibold">
                        {item.productName}
                        {item.requiresExpiry && (
                          <span className="ml-2 text-xs font-medium text-[#93600c]">
                            Batch and expiry required when accepting stock
                          </span>
                        )}
                      </span>
                      <span className="text-[#73766f]">Open {item.outstandingQty}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        [
                          'receivedQuantity',
                          'acceptedQuantity',
                          'rejectedQuantity',
                          'damageQuantity',
                        ] as const
                      ).map((field, i) => {
                        const invalid =
                          (emptyReceipt && field === 'receivedQuantity') ||
                          (receiptErrorTarget?.itemId === line.purchaseOrderItemId &&
                            receiptErrorTarget.field === field);
                        return (
                          <label key={field} className="text-[11px] text-[#73766f]">
                            {['Received', 'Accepted', 'Rejected', 'Damaged'][i]}
                            <input
                              ref={(element) => {
                                receiptInputRefs.current[`${line.purchaseOrderItemId}:${field}`] =
                                  element;
                              }}
                              aria-invalid={invalid || undefined}
                              aria-describedby={invalid ? 'receipt-quantity-error' : undefined}
                              type="number"
                              min="0"
                              step="0.01"
                              value={line[field]}
                              onChange={(e) => {
                                setReceipt((rows) =>
                                  rows.map((r, j) =>
                                    j === index ? { ...r, [field]: e.target.value } : r
                                  )
                                );
                                if (receiptError) {
                                  setReceiptError('');
                                  setReceiptErrorTarget(null);
                                }
                              }}
                              className={`${input} mt-1 px-2 ${invalid ? 'border-[#b64238] focus:border-[#b64238] focus:ring-[#b64238]/25' : ''}`}
                            />
                          </label>
                        );
                      })}
                    </div>
                    {item.requiresExpiry && (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[11px] text-[#73766f]">
                          Batch number
                          <input
                            ref={(element) => {
                              receiptInputRefs.current[`${line.purchaseOrderItemId}:batchNumber`] =
                                element;
                            }}
                            aria-invalid={
                              (receiptErrorTarget?.itemId === line.purchaseOrderItemId &&
                                receiptErrorTarget.field === 'batchNumber') ||
                              undefined
                            }
                            aria-describedby={
                              receiptErrorTarget?.itemId === line.purchaseOrderItemId &&
                              receiptErrorTarget.field === 'batchNumber'
                                ? 'receipt-quantity-error'
                                : undefined
                            }
                            value={line.batchNumber}
                            onChange={(e) =>
                              setReceipt((rows) =>
                                rows.map((r, j) =>
                                  j === index ? { ...r, batchNumber: e.target.value } : r
                                )
                              )
                            }
                            className={`${input} mt-1 ${receiptErrorTarget?.itemId === line.purchaseOrderItemId && receiptErrorTarget.field === 'batchNumber' ? 'border-[#b64238] focus:border-[#b64238] focus:ring-[#b64238]/25' : ''}`}
                            maxLength={120}
                          />
                        </label>
                        <label className="text-[11px] text-[#73766f]">
                          Expiry date
                          <input
                            ref={(element) => {
                              receiptInputRefs.current[`${line.purchaseOrderItemId}:expiryDate`] =
                                element;
                            }}
                            aria-invalid={
                              (receiptErrorTarget?.itemId === line.purchaseOrderItemId &&
                                receiptErrorTarget.field === 'expiryDate') ||
                              undefined
                            }
                            aria-describedby={
                              receiptErrorTarget?.itemId === line.purchaseOrderItemId &&
                              receiptErrorTarget.field === 'expiryDate'
                                ? 'receipt-quantity-error'
                                : undefined
                            }
                            type="date"
                            value={line.expiryDate}
                            onChange={(e) =>
                              setReceipt((rows) =>
                                rows.map((r, j) =>
                                  j === index ? { ...r, expiryDate: e.target.value } : r
                                )
                              )
                            }
                            className={`${input} mt-1 ${receiptErrorTarget?.itemId === line.purchaseOrderItemId && receiptErrorTarget.field === 'expiryDate' ? 'border-[#b64238] focus:border-[#b64238] focus:ring-[#b64238]/25' : ''}`}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                disabled={!!busy || !receipt.length}
                onClick={() => void createReceipt()}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-transparent bg-[#20211f] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#343632] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#738900] disabled:opacity-50 dark:border-[#596347] dark:bg-[#050605] dark:text-[#e7e9e3] dark:hover:border-[#829600] dark:hover:bg-[#111510] dark:hover:shadow-[0_0_18px_rgba(216,240,75,0.12)] dark:focus-visible:outline-[#d8f04b]"
              >
                {busy === 'grn' ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <PackageCheck size={16} />
                )}
                Record goods received
              </button>
            </>
          )}
          {!canReceive && (
            <p className="text-sm text-[#73766f]">
              This order is not open for more goods receipts.
            </p>
          )}
          <div className="border-t border-[#eceee8] pt-3">
            <p className="mb-2 text-sm font-semibold">Recorded receipts</p>
            {grns.map((g) => (
              <div id={`receipt-${g.id}`} key={g.id} className="scroll-mt-24 space-y-2 border-b border-[#eceee8] py-3 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={`/dashboard/purchases/grn/${g.id}`} className="text-sm font-semibold hover:text-[#738900] hover:underline hover:underline-offset-4 dark:hover:text-[#d8f04b]">{g.grnNumber}</Link>
                    <p className="mt-1 text-xs text-[#73766f]">
                      Received {g.totalReceivedQty} · Accepted {g.totalAcceptedQty} · Rejected{' '}
                      {g.totalRejectedQty} · Damaged {g.totalDamageQty}
                    </p>
                    {(g.vehicleRegistration || g.driverName || g.waybillNumber || g.notes) && (
                      <p className="mt-1 break-words text-xs text-[#73766f]">
                        {[
                          g.vehicleRegistration && `Vehicle ${g.vehicleRegistration}`,
                          g.driverName && `Driver ${g.driverName}`,
                          g.waybillNumber && `Waybill ${g.waybillNumber}`,
                          g.notes && `Note: ${g.notes}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    {g.receivedDate && (
                      <p className="mt-1 text-xs text-[#73766f]">
                        Received on {new Date(g.receivedDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <span className="text-sm text-[#73766f]">{g.status}</span>
                </div>
                {editingGrn === g.id ? (
                  <>
                    {grnEditError && (
                      <p
                        id={`${g.grnNumber}-edit-error`}
                        role="alert"
                        className="rounded-xl border border-[#efd4cf] bg-[#fff7f5] p-3 text-sm text-[#9b3730]"
                      >
                        {grnEditError}
                      </p>
                    )}
                    <div className="grid gap-3 rounded-xl border border-[#eceee8] bg-[#fafbf8] p-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold">
                        Received date
                        <input
                          aria-label={`${g.grnNumber} received date`}
                          type="date"
                          value={grnEditMetadata.receivedDate}
                          onChange={(event) =>
                            setGrnEditMetadata((meta) => ({
                              ...meta,
                              receivedDate: event.target.value,
                            }))
                          }
                          className={`${input} mt-1`}
                        />
                      </label>
                      <label className="text-xs font-semibold">
                        Vehicle registration
                        <input
                          aria-label={`${g.grnNumber} vehicle registration`}
                          maxLength={50}
                          value={grnEditMetadata.vehicleRegistration}
                          onChange={(event) =>
                            setGrnEditMetadata((meta) => ({
                              ...meta,
                              vehicleRegistration: event.target.value,
                            }))
                          }
                          className={`${input} mt-1`}
                          placeholder="Optional · max 50 characters"
                        />
                      </label>
                      <label className="text-xs font-semibold">
                        Driver name
                        <input
                          aria-label={`${g.grnNumber} driver name`}
                          maxLength={160}
                          value={grnEditMetadata.driverName}
                          onChange={(event) =>
                            setGrnEditMetadata((meta) => ({
                              ...meta,
                              driverName: event.target.value,
                            }))
                          }
                          className={`${input} mt-1`}
                          placeholder="Optional · max 160 characters"
                        />
                      </label>
                      <label className="text-xs font-semibold">
                        Waybill number
                        <input
                          aria-label={`${g.grnNumber} waybill number`}
                          maxLength={120}
                          value={grnEditMetadata.waybillNumber}
                          onChange={(event) =>
                            setGrnEditMetadata((meta) => ({
                              ...meta,
                              waybillNumber: event.target.value,
                            }))
                          }
                          className={`${input} mt-1`}
                          placeholder="Optional · max 120 characters"
                        />
                      </label>
                      <label className="text-xs font-semibold sm:col-span-2">
                        Receiving notes
                        <textarea
                          aria-label={`${g.grnNumber} receiving notes`}
                          maxLength={500}
                          rows={2}
                          value={grnEditMetadata.notes}
                          onChange={(event) =>
                            setGrnEditMetadata((meta) => ({ ...meta, notes: event.target.value }))
                          }
                          className={`${input} mt-1 h-auto py-2`}
                          placeholder="Optional · max 500 characters"
                        />
                      </label>
                    </div>
                    <div className="space-y-3">
                      <label className="block max-w-sm text-xs font-semibold">
                        Add another PO item
                        <select
                          aria-label={`${g.grnNumber} add PO item`}
                          value=""
                          onChange={(event) => addGrnEditItem(event.target.value)}
                          className={`${input} mt-1`}
                        >
                          <option value="">Choose an item to add</option>
                          {po.items
                            .filter(
                              (poItem) =>
                                !grnEditLines.some((line) => line.purchaseOrderItemId === poItem.id)
                            )
                            .map((poItem) => (
                              <option key={poItem.id} value={poItem.id}>
                                {poItem.productName} · {poItem.productSku}
                              </option>
                            ))}
                        </select>
                      </label>
                      {grnEditLines.map((line, index) => {
                        const item = po.items.find(
                          (row) => row.id === line.purchaseOrderItemId
                        );
                        const invalidLine = grnEditErrorTarget?.itemId === line.purchaseOrderItemId;
                        return (
                          <div
                            key={line.purchaseOrderItemId}
                            className="space-y-2 rounded-xl border border-[#eceee8] p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold">
                                {item?.productName || 'Received item'}
                              </p>
                              <button
                                type="button"
                                aria-label={`Remove ${item?.productName || 'item'} from ${g.grnNumber}`}
                                onClick={() => removeGrnEditItem(index)}
                                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#efd4cf] px-2 text-xs font-semibold text-[#a63832] transition hover:bg-[#fff7f5] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a63832]"
                              >
                                <Trash2 size={13} /> Remove
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {(
                                [
                                  'receivedQuantity',
                                  'acceptedQuantity',
                                  'rejectedQuantity',
                                  'damageQuantity',
                                ] as const
                              ).map((field, i) => (
                                <label key={field} className="text-[11px] text-[#73766f]">
                                  {['Received', 'Accepted', 'Rejected', 'Damaged'][i]}
                                  <input
                                    aria-label={`${g.grnNumber} ${['received', 'accepted', 'rejected', 'damaged'][i]} quantity`}
                                    aria-invalid={
                                      (invalidLine && grnEditErrorTarget?.field === field) ||
                                      undefined
                                    }
                                    aria-describedby={
                                      invalidLine && grnEditErrorTarget?.field === field
                                        ? `${g.grnNumber}-edit-error`
                                        : undefined
                                    }
                                    ref={(element) => {
                                      grnEditInputRefs.current[
                                        `${line.purchaseOrderItemId}:${field}`
                                      ] = element;
                                    }}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={line[field]}
                                    onChange={(event) => {
                                      setGrnEditLines((rows) =>
                                        rows.map((row, rowIndex) =>
                                          rowIndex === index
                                            ? { ...row, [field]: event.target.value }
                                            : row
                                        )
                                      );
                                      setGrnEditError('');
                                      setGrnEditErrorTarget(null);
                                    }}
                                    className={`${input} mt-1 px-2 ${invalidLine && grnEditErrorTarget?.field === field ? 'border-[#b64238] focus:border-[#b64238] focus:ring-[#b64238]/25' : ''}`}
                                  />
                                </label>
                              ))}
                            </div>
                            {item &&
                              po.items.find((row) => row.id === line.purchaseOrderItemId)
                                ?.requiresExpiry && (
                                <div className="grid grid-cols-2 gap-2">
                                  <label className="text-[11px] text-[#73766f]">
                                    Batch number
                                    <input
                                      aria-label={`${g.grnNumber} batch number`}
                                      aria-invalid={
                                        (invalidLine &&
                                          grnEditErrorTarget?.field === 'batchNumber') ||
                                        undefined
                                      }
                                      aria-describedby={
                                        invalidLine && grnEditErrorTarget?.field === 'batchNumber'
                                          ? `${g.grnNumber}-edit-error`
                                          : undefined
                                      }
                                      ref={(element) => {
                                        grnEditInputRefs.current[
                                          `${line.purchaseOrderItemId}:batchNumber`
                                        ] = element;
                                      }}
                                      maxLength={120}
                                      value={line.batchNumber}
                                      onChange={(event) => {
                                        setGrnEditLines((rows) =>
                                          rows.map((row, rowIndex) =>
                                            rowIndex === index
                                              ? { ...row, batchNumber: event.target.value }
                                              : row
                                          )
                                        );
                                        setGrnEditError('');
                                        setGrnEditErrorTarget(null);
                                      }}
                                      className={`${input} mt-1 ${invalidLine && grnEditErrorTarget?.field === 'batchNumber' ? 'border-[#b64238] focus:border-[#b64238] focus:ring-[#b64238]/25' : ''}`}
                                    />
                                  </label>
                                  <label className="text-[11px] text-[#73766f]">
                                    Expiry date
                                    <input
                                      aria-label={`${g.grnNumber} expiry date`}
                                      aria-invalid={
                                        (invalidLine &&
                                          grnEditErrorTarget?.field === 'expiryDate') ||
                                        undefined
                                      }
                                      aria-describedby={
                                        invalidLine && grnEditErrorTarget?.field === 'expiryDate'
                                          ? `${g.grnNumber}-edit-error`
                                          : undefined
                                      }
                                      ref={(element) => {
                                        grnEditInputRefs.current[
                                          `${line.purchaseOrderItemId}:expiryDate`
                                        ] = element;
                                      }}
                                      type="date"
                                      value={line.expiryDate}
                                      onChange={(event) => {
                                        setGrnEditLines((rows) =>
                                          rows.map((row, rowIndex) =>
                                            rowIndex === index
                                              ? { ...row, expiryDate: event.target.value }
                                              : row
                                          )
                                        );
                                        setGrnEditError('');
                                        setGrnEditErrorTarget(null);
                                      }}
                                      className={`${input} mt-1 ${invalidLine && grnEditErrorTarget?.field === 'expiryDate' ? 'border-[#b64238] focus:border-[#b64238] focus:ring-[#b64238]/25' : ''}`}
                                    />
                                  </label>
                                </div>
                              )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={!!busy}
                        onClick={() => void saveGrnEdit(g.id)}
                        className="min-h-9 rounded-lg bg-[#20211f] px-3 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {busy === `save-grn-${g.id}` ? 'Saving…' : 'Save changes'}
                      </button>
                      <button
                        disabled={!!busy}
                        onClick={() => setEditingGrn('')}
                        className="min-h-9 rounded-lg border px-3 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : g.status === 'RECEIVED' && permissions.includes('purchases.edit') ? (
                  <button
                    disabled={!!busy}
                    onClick={() => void beginGrnEdit(g.id)}
                    className="min-h-9 rounded-lg border border-[#dfe2da] px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    {busy === `load-grn-${g.id}` ? 'Loading…' : 'Edit receipt'}
                  </button>
                ) : null}
              </div>
            ))}
            {!grns.length && <p className="text-sm text-[#73766f]">No receipts yet.</p>}
          </div>
        </section>
        <div className="space-y-5">
          <section className="space-y-3 rounded-2xl border border-[#e6e8e1] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2">
              <Wallet className="text-[#738900]" size={19} />
              <h2 className="text-lg font-semibold">Supplier payment</h2>
            </div>
            {permissions.includes('payments.create') && po.balanceDue > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold">
                    Amount
                    <input
                      ref={paymentAmountRef}
                      type="number"
                      min="0.01"
                      max={po.balanceDue}
                      step="0.01"
                      value={payAmount}
                      aria-invalid={paymentErrorTarget === 'amount'}
                      aria-describedby={paymentErrorTarget === 'amount' ? 'supplier-payment-error' : undefined}
                      onChange={(e) => {
                        setPayAmount(e.target.value);
                        setPaymentError('');
                        setPaymentErrorTarget('');
                        setError('');
                      }}
                      className={`${input} mt-1`}
                    />
                    {paymentErrorTarget === 'amount' && <span id="supplier-payment-error" role="alert" className="mt-1 block text-xs font-medium text-[#a63832]">{paymentError}</span>}
                  </label>
                  <label className="text-xs font-semibold">
                    Payment method
                    <select
                      ref={paymentMethodRef}
                      value={methodId}
                      aria-invalid={paymentErrorTarget === 'method'}
                      aria-describedby={paymentErrorTarget === 'method' ? 'supplier-payment-error' : undefined}
                      onChange={(e) => {
                        setMethodId(e.target.value);
                        setPaymentError('');
                        setPaymentErrorTarget('');
                        setError('');
                      }}
                      className={`${input} mt-1`}
                    >
                      <option value="">Select method</option>
                      {methods.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                      </select>
                      {paymentErrorTarget === 'method' && <span id="supplier-payment-error" role="alert" className="mt-1 block text-xs font-medium text-[#a63832]">{paymentError}</span>}
                  </label>
                </div>
                <button
                  disabled={
                    !!busy ||
                    !methodId ||
                    Number(payAmount) <= 0 ||
                    Number(payAmount) > po.balanceDue
                  }
                  onClick={() =>
                    void act(
                      'payment',
                      async () => {
                        const payload = {
                          amount: Number(payAmount),
                          paymentMethodId: methodId,
                        };
                        const retryScope = `${businessId}:${id}:payment`;
                        const result = await purchasesAPI.payment(id, {
                          ...payload,
                          idempotencyKey: purchaseRetryKey(retryScope, payload),
                        });
                        clearPurchaseRetryKey(retryScope);
                        return result;
                      },
                      'Payment recorded.'
                    )
                  }
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#20211f] px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === 'payment' && <Loader2 className="animate-spin" size={15} />}Record
                  payment
                </button>
                {!methods.length && (
                  <p className="text-xs text-[#93600c]">
                    No active payment methods found or settings.view access is missing.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-[#73766f]">
                {po.balanceDue <= 0
                  ? 'This order is fully paid.'
                  : 'Your account cannot record supplier payments.'}
              </p>
            )}
          </section>
          <section className="space-y-3 rounded-2xl border border-[#e6e8e1] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2">
              <RotateCcw className="text-[#738900]" size={19} />
              <h2 className="text-lg font-semibold">Supplier returns</h2>
            </div>
            {permissions.includes('purchases.create') &&
            po.items.some((i) => i.grnAcceptedQty > i.returnedQty) ? (
              <>
                <label className="text-xs font-semibold">
                  Received item
                  <select
                    value={returnItem}
                    onChange={(e) => setReturnItem(e.target.value)}
                    className={`${input} mt-1`}
                  >
                    <option value="">Select item</option>
                    {po.items
                      .filter((i) => i.grnAcceptedQty > i.returnedQty)
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.productName} · max {Math.max(0, i.grnAcceptedQty - i.returnedQty)}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold">
                    Quantity
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={Math.max(
                        0,
                        ...po.items
                          .filter((i) => i.id === returnItem)
                          .map((i) => i.grnAcceptedQty - i.returnedQty)
                      )}
                      value={returnQty}
                      onChange={(e) => setReturnQty(e.target.value)}
                      className={`${input} mt-1`}
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    Reason
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value as typeof returnReason)}
                      className={`${input} mt-1`}
                    >
                      {returnReasons.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  disabled={
                    !!busy ||
                    !returnItem ||
                    Number(returnQty) <= 0 ||
                    Number(returnQty) >
                      Math.max(
                        0,
                        ...po.items
                          .filter((i) => i.id === returnItem)
                          .map((i) => i.grnAcceptedQty - i.returnedQty)
                      )
                  }
                  onClick={() =>
                    void act(
                      'return',
                      async () => {
                        const payload = {
                          purchaseOrderId: id,
                          items: [
                            {
                              purchaseOrderItemId: returnItem,
                              quantity: Number(returnQty),
                              reason: returnReason,
                            },
                          ],
                        };
                        const retryScope = `${businessId}:${id}:return`;
                        const result = await purchasesAPI.createReturn({
                          ...payload,
                          idempotencyKey: purchaseRetryKey(retryScope, payload),
                        });
                        clearPurchaseRetryKey(retryScope);
                        return result;
                      },
                      'Return request created as draft.'
                    )
                  }
                  className="min-h-10 rounded-xl bg-[#20211f] px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Create return request
                </button>
              </>
            ) : (
              <p className="text-sm text-[#73766f]">
                {permissions.includes('purchases.create')
                  ? 'No accepted quantity is available to return.'
                  : 'Your account cannot create supplier returns.'}
              </p>
            )}
            {returns.map((ret) => (
              <div
                key={ret.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eceee8] pt-3 text-sm"
              >
                <span>
                  {ret.returnNumber} · {ret.status} · {purchaseMoney(ret.totalReturnAmount)}
                </span>
                {ret.status === 'DRAFT' && permissions.includes('purchases.approve') && (
                  <div className="flex gap-2">
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        void act(
                          `ret-approve-${ret.id}`,
                          () => purchasesAPI.approveReturn(ret.id),
                          'Supplier return approved and stock reduced.'
                        )
                      }
                      className="rounded-lg bg-[#e7f4ed] px-3 py-2 text-xs font-bold text-[#16734a]"
                    >
                      Approve
                    </button>
                    <button
                      disabled={!!busy}
                      onClick={() => {
                        setRejectReason('');
                        setRejectReasonError('');
                        setRejectTarget({ kind: 'return', id: ret.id, number: ret.returnNumber });
                      }}
                      className="rounded-lg bg-[#fff0ed] px-3 py-2 text-xs font-bold text-[#a63832]"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!returns.length && <p className="text-sm text-[#73766f]">No returns recorded.</p>}
          </section>
        </div>
      </div>
      <section className="flex flex-wrap gap-2 rounded-2xl border border-[#e6e8e1] bg-white p-4 shadow-sm">
        {po.status === 'DRAFT' && permissions.includes('purchases.approve') && (
          <button
            disabled={!!busy}
            onClick={() =>
              void act(
                'approve',
                () => purchasesAPI.approveOrder(id),
                'Purchase order approved and sent to the supplier.'
              )
            }
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#e7f4ed] px-4 text-sm font-semibold text-[#16734a] transition hover:bg-[#dcefe4] hover:underline disabled:opacity-50"
          >
            <Check size={16} />
            Approve order
          </button>
        )}
        {!['CANCELLED', 'FULLY_RECEIVED', 'CLOSED'].includes(po.status) &&
          permissions.includes('purchases.cancel') && (
            <button
              disabled={!!busy}
              onClick={() => {
                setCancelReason('');
                setCancelReasonError('');
                setCancelDialog(true);
              }}
              className="min-h-10 rounded-xl border border-[#efd4cf] px-4 text-sm font-semibold text-[#a63832] transition hover:bg-[#fff7f5] hover:underline disabled:opacity-50"
            >
              Cancel order
            </button>
          )}
        <button
          onClick={() => void load()}
          className="ml-auto min-h-10 rounded-xl border border-[#dfe2da] px-4 text-sm font-semibold transition hover:bg-[#f5f6f2] hover:underline"
        >
          Refresh
        </button>
      </section>
      {cancelDialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#11140f]/35 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setCancelDialog(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-order-title"
            className="w-full max-w-lg rounded-2xl border border-[#e6e8e1] bg-white p-5 shadow-2xl dark:border-[#343a33] dark:bg-[#191d19] sm:p-6"
          >
            <h2
              id="cancel-order-title"
              className="text-lg font-semibold text-[#20211f] dark:text-[#e7e9e3]"
            >
              Cancel purchase order
            </h2>
            <p className="mt-2 text-sm text-[#73766f] dark:text-[#aeb5aa]">
              Enter a reason for cancelling {po.poNumber}. This will be recorded with the order.
            </p>
            <label
              htmlFor="cancel-order-reason"
              className="mt-4 block text-sm font-medium text-[#32352e] dark:text-[#dce1d7]"
            >
              Cancellation reason
            </label>
            <textarea
              id="cancel-order-reason"
              autoFocus
              maxLength={500}
              rows={4}
              value={cancelReason}
              onChange={(event) => {
                setCancelReason(event.target.value);
                if (cancelReasonError) setCancelReasonError('');
              }}
              className="mt-1 w-full resize-y rounded-xl border border-[#dfe2da] bg-white px-3 py-2 text-sm text-[#20211f] outline-none focus:border-[#829600] focus:ring-2 focus:ring-[#d8f04b]/40 dark:border-[#3b423a] dark:bg-[#111510] dark:text-[#e7e9e3]"
              placeholder="Why is this order being cancelled?"
              aria-describedby={
                cancelReasonError ? 'cancel-order-reason-error' : 'cancel-order-reason-count'
              }
            />
            {cancelReasonError ? (
              <p
                id="cancel-order-reason-error"
                role="alert"
                className="mt-1 text-sm text-[#a63832]"
              >
                {cancelReasonError}
              </p>
            ) : (
              <p
                id="cancel-order-reason-count"
                className="mt-1 text-right text-xs text-[#73766f] dark:text-[#aeb5aa]"
              >
                {cancelReason.length}/500
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => setCancelDialog(false)}
                className="min-h-10 rounded-xl border border-[#dfe2da] px-4 text-sm font-semibold text-[#32352e] transition hover:bg-[#f5f6f2] disabled:opacity-50 dark:border-[#3b423a] dark:text-[#dce1d7] dark:hover:bg-[#252a24]"
              >
                Keep order
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void submitCancel()}
                className="min-h-10 rounded-xl bg-[#a63832] px-4 text-sm font-semibold text-white transition hover:bg-[#8f302b] disabled:opacity-50"
              >
                {busy === 'cancel' ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
            </div>
          </section>
        </div>
      )}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#11140f]/35 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setRejectTarget(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-record-title"
            className="w-full max-w-lg rounded-2xl border border-[#e6e8e1] bg-white p-5 shadow-2xl dark:border-[#343a33] dark:bg-[#191d19] sm:p-6"
          >
            <h2 id="reject-record-title" className="text-lg font-semibold text-[#20211f] dark:text-[#e7e9e3]">
              Reject {rejectTarget.kind === 'grn' ? 'goods received note' : 'supplier return'}
            </h2>
            <p className="mt-2 text-sm text-[#73766f] dark:text-[#aeb5aa]">
              Enter a reason for rejecting {rejectTarget.number}. This will be recorded with the {rejectTarget.kind === 'grn' ? 'receipt' : 'return'}.
            </p>
            <label htmlFor="reject-record-reason" className="mt-4 block text-sm font-medium text-[#32352e] dark:text-[#dce1d7]">
              Rejection reason
            </label>
            <textarea
              id="reject-record-reason"
              autoFocus
              maxLength={500}
              rows={4}
              value={rejectReason}
              onChange={(event) => {
                setRejectReason(event.target.value);
                if (rejectReasonError) setRejectReasonError('');
              }}
              className="mt-1 w-full resize-y rounded-xl border border-[#dfe2da] bg-white px-3 py-2 text-sm text-[#20211f] outline-none focus:border-[#829600] focus:ring-2 focus:ring-[#d8f04b]/40 dark:border-[#3b423a] dark:bg-[#111510] dark:text-[#e7e9e3]"
              placeholder="Why is this record being rejected?"
              aria-describedby={rejectReasonError ? 'reject-record-reason-error' : 'reject-record-reason-count'}
            />
            {rejectReasonError ? (
              <p id="reject-record-reason-error" role="alert" className="mt-1 text-sm text-[#a63832]">{rejectReasonError}</p>
            ) : (
              <p id="reject-record-reason-count" className="mt-1 text-right text-xs text-[#73766f] dark:text-[#aeb5aa]">{rejectReason.length}/500</p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => setRejectTarget(null)}
                className="min-h-10 rounded-xl border border-[#dfe2da] px-4 text-sm font-semibold text-[#32352e] transition hover:bg-[#f5f6f2] disabled:opacity-50 dark:border-[#3b423a] dark:text-[#dce1d7] dark:hover:bg-[#252a24]"
              >
                Keep {rejectTarget.kind === 'grn' ? 'receipt' : 'return'}
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void submitReject()}
                className="min-h-10 rounded-xl bg-[#a63832] px-4 text-sm font-semibold text-white transition hover:bg-[#8f302b] disabled:opacity-50"
              >
                {busy.startsWith(rejectTarget.kind === 'grn' ? 'reject-' : 'ret-reject-') ? 'Rejecting…' : 'Confirm rejection'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[#73766f]">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
function MoneyLine({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span>{purchaseMoney(value)}</span>
    </div>
  );
}
function Gate({ text }: { text: string }) {
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-[#efd4cf] bg-white p-7 text-center">
      <AlertCircle className="mx-auto text-[#a63832]" />
      <h1 className="mt-3 text-xl font-semibold">Purchase order unavailable</h1>
      <p className="mt-2 text-sm text-[#73766f]">{text}</p>
      <Link
        href="/dashboard/purchases"
        className="mt-5 inline-flex min-h-10 items-center rounded-xl bg-[#20211f] px-4 text-sm font-semibold text-white"
      >
        Back to purchases
      </Link>
    </section>
  );
}
