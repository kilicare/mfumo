'use client';

import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  CircleDollarSign,
  CreditCard,
  Minus,
  PackageSearch,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type {
  DashboardExecutiveData,
  DashboardMetric,
  DashboardTransaction,
  ExpenseBreakdownRow,
  LowStockRow,
} from '@/lib/api/dashboard';

const panel = 'rounded-2xl border border-[#e8e9e5] bg-white p-5 shadow-sm shadow-black/[0.02] sm:p-6';

export function formatMoney(value: number, currency: string, compact = false) {
  const amount = new Intl.NumberFormat('en-TZ', {
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value);
  return `${amount} ${currency}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function formatPeriod(value: string) {
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' }).format(new Date(year, month - 1, 1));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(year, month - 1, day));
  }
  return value;
}

function IconForMetric({ name }: { name: string }) {
  const normalized = name.toLowerCase();
  const Icon = normalized.includes('expense') ? Receipt
    : normalized.includes('profit') ? TrendingUp
      : normalized.includes('margin') ? CircleDollarSign
        : normalized.includes('cash') ? Wallet
          : normalized.includes('receivable') || normalized.includes('payable') ? CreditCard
            : normalized.includes('inventory') ? Boxes
              : normalized.includes('purchase') ? ShoppingBag
                : Banknote;
  return <Icon size={18} strokeWidth={1.8} />;
}

function formatMetric(metric: DashboardMetric, currency: string) {
  if (metric.unit === '%') return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(metric.value)}%`;
  if (metric.unit === 'Invoices' || metric.unit === 'Units' || metric.unit === 'Times') {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(metric.value)} ${metric.unit.toLowerCase()}`;
  }
  return formatMoney(metric.value, currency, true);
}

export function MetricCard({
  metric,
  currency,
  tone,
  valueColor,
  invertTrend = false,
}: {
  metric: DashboardMetric;
  currency: string;
  tone: string;
  valueColor: string;
  invertTrend?: boolean;
}) {
  const delta = metric.changePercent;
  const positive = metric.trend === 'UP';
  const negative = metric.trend === 'DOWN';
  const favorable = (positive && !invertTrend) || (negative && invertTrend);
  const unfavorable = (negative && !invertTrend) || (positive && invertTrend);
  const changeClass = favorable ? 'text-[#2d8152]' : unfavorable ? 'text-[#b54742]' : 'text-[#777b73]';
  const TrendIcon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;

  return (
    <article className="rounded-2xl border border-[#e8e9e5] bg-white p-4 shadow-sm shadow-black/[0.02] transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-[#777b73]">{metric.label || metric.name}</p>
          <p className={`mt-3 text-xl font-semibold tracking-tight sm:text-2xl ${valueColor}`}>{formatMetric(metric, currency)}</p>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}><IconForMetric name={metric.name} /></span>
      </div>
      <div className="mt-4 flex min-h-5 items-center gap-1.5 text-xs">
        {delta === null ? (
          <span className="text-[#777b73]">No previous-period baseline</span>
        ) : (
          <>
            <TrendIcon size={15} className={changeClass} />
            <span className={`font-semibold ${changeClass}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
            <span className="text-[#95988f]">vs previous period</span>
          </>
        )}
      </div>
      {metric.name === 'Inventory Value' ? <p className="mt-2 text-[11px] leading-4 text-[#95988f]">Current stock valuation snapshot</p> : null}
    </article>
  );
}

function EmptyPanel({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed border-[#d9ddd4] px-4 py-8 text-center text-sm text-[#858880]">{children}</p>;
}

export function RevenueExpenseChart({ data, currency }: { data: DashboardExecutiveData; currency: string }) {
  const labels = data.charts.periods;
  const series = data.charts.revenueVsExpenses;
  const revenue = series.find((row) => row.label.toLowerCase() === 'revenue')?.data || [];
  const expenses = series.find((row) => row.label.toLowerCase() === 'expenses')?.data || [];
  const max = Math.max(0, ...revenue, ...expenses);
  const width = 680;
  const height = 260;
  const padX = 34;
  const padTop = 18;
  const padBottom = 38;
  const chartBottom = height - padBottom;
  const pointsFor = (values: number[]) => labels.map((label, index) => ({
    x: labels.length <= 1 ? width / 2 : padX + (index / (labels.length - 1)) * (width - padX * 2),
    y: max === 0 ? chartBottom : padTop + (1 - (values[index] || 0) / max) * (chartBottom - padTop),
    value: values[index] || 0,
    label,
  }));
  const revenuePoints = pointsFor(revenue);
  const expensePoints = pointsFor(expenses);
  const linePath = (points: Array<{ x: number; y: number }>) => points.map((point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const controlOffset = (point.x - previous.x) * 0.38;
    return `C ${previous.x + controlOffset} ${previous.y}, ${point.x - controlOffset} ${point.y}, ${point.x} ${point.y}`;
  }).join(' ');
  const areaPath = (points: Array<{ x: number; y: number }>) => points.length
    ? `${linePath(points)} L ${points[points.length - 1].x} ${chartBottom} L ${points[0].x} ${chartBottom} Z`
    : '';
  const visibleLabelIndexes = labels.map((_, index) => index).filter((index) => index === 0 || index === labels.length - 1 || index % Math.max(1, Math.ceil(labels.length / 5)) === 0);

  return (
    <section className={panel} aria-labelledby="revenue-chart-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#527000]">Performance</p><h2 id="revenue-chart-title" className="mt-1 text-base font-semibold text-[#292d27]">Revenue and expenses</h2></div>
        <div className="flex gap-4 text-xs"><span className="flex items-center gap-1.5 font-semibold text-[#167346]"><i className="h-2 w-2 rounded-full bg-[#167346]" />Revenue</span><span className="flex items-center gap-1.5 font-semibold text-[#667b00]"><i className="h-2 w-2 rounded-full bg-[#c9e600]" />Expenses</span></div>
      </div>
      {labels.length === 0 ? <div className="mt-5"><EmptyPanel>No periods are available for the selected range.</EmptyPanel></div> : (
        <div className="mt-5 overflow-x-auto">
          {max <= 0 ? <p className="mb-2 text-xs text-[#858880]">No revenue or expense activity in this range; chart values are zero.</p> : null}
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Revenue and expenses area chart by period" className="h-64 min-w-[360px] w-full">
              <defs>
                <linearGradient id="revenue-area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#167346" stopOpacity="0.24" /><stop offset="100%" stopColor="#167346" stopOpacity="0.015" /></linearGradient>
                <linearGradient id="expenses-area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#c9e600" stopOpacity="0.34" /><stop offset="100%" stopColor="#c9e600" stopOpacity="0.025" /></linearGradient>
              </defs>
              {[0, 1, 2, 3].map((step) => {
                const y = padTop + (step / 3) * (chartBottom - padTop);
                return <line key={step} x1={padX} x2={width - padX} y1={y} y2={y} stroke="#e9ecdf" strokeDasharray="4 6" />;
              })}
              <path d={areaPath(expensePoints)} fill="url(#expenses-area-fill)" />
              <path d={areaPath(revenuePoints)} fill="url(#revenue-area-fill)" />
              <path d={linePath(expensePoints)} fill="none" stroke="#94b800" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d={linePath(revenuePoints)} fill="none" stroke="#167346" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              {revenuePoints.map((point, index) => <circle key={`revenue-point-${index}`} cx={point.x} cy={point.y} r={labels.length <= 10 ? 4 : 2.5} fill="white" stroke="#167346" strokeWidth="2"><title>{`${formatPeriod(point.label)} · Revenue ${formatMoney(point.value, currency)} · Expenses ${formatMoney(expensePoints[index]?.value || 0, currency)}`}</title></circle>)}
              {expensePoints.map((point, index) => <circle key={`expense-point-${index}`} cx={point.x} cy={point.y} r={labels.length <= 10 ? 3.5 : 2} fill="#c9e600" stroke="#657d00" strokeWidth="1.5"><title>{`${formatPeriod(point.label)} · Expenses ${formatMoney(point.value, currency)} · Revenue ${formatMoney(revenuePoints[index]?.value || 0, currency)}`}</title></circle>)}
              {visibleLabelIndexes.map((index) => <text key={`period-label-${index}`} x={revenuePoints[index]?.x || padX} y={height - 8} textAnchor={index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'} fill="#747a68" fontSize="11">{formatPeriod(labels[index])}</text>)}
            </svg>
          </div>
          <ul className="sr-only" aria-label="Revenue and expenses by period">
            {labels.map((label, index) => <li key={`${label}-accessible-${index}`}>{formatPeriod(label)}: revenue {formatMoney(revenue[index] || 0, currency)}, expenses {formatMoney(expenses[index] || 0, currency)}.</li>)}
          </ul>
          <p className="mt-2 text-right text-[10px] text-[#747a68]">Values use {currency}; hover a point for its exact amount.</p>
        </div>
      )}
    </section>
  );
}

export function SalesTrendChart({ data, currency }: { data: DashboardExecutiveData; currency: string }) {
  const { labels, values } = data.charts.salesTrend;
  const width = 640;
  const height = 220;
  const padX = 24;
  const padTop = 18;
  const padBottom = 28;
  const max = Math.max(0, ...values);
  const points = values.map((value, index) => ({
    x: labels.length <= 1 ? width / 2 : padX + (index / (labels.length - 1)) * (width - padX * 2),
    y: max === 0 ? height - padBottom : padTop + (1 - value / max) * (height - padTop - padBottom),
    value,
    label: labels[index] || '',
  }));
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return (
    <section className={panel} aria-labelledby="sales-trend-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#527000]">Sales performance</p><h2 id="sales-trend-title" className="mt-1 text-base font-semibold text-[#292d27]">Revenue trend</h2></div>
        <span className="text-xs text-[#858880]">{labels.length} periods · {currency}</span>
      </div>
      {points.length === 0 ? <div className="mt-5"><EmptyPanel>No periods are available for the selected range.</EmptyPanel></div> : <>
        {max <= 0 ? <p className="mt-4 text-xs text-[#858880]">No issued sales in this range; the trend is at zero.</p> : null}
        <div className="mt-5 overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Revenue trend across ${points.length} periods`} className="h-56 min-w-[430px] w-full overflow-visible">
            {[0, 1, 2, 3].map((step) => {
              const y = padTop + (step / 3) * (height - padTop - padBottom);
              return <line key={step} x1={padX} x2={width - padX} y1={y} y2={y} stroke="#eceee9" strokeDasharray="4 5" />;
            })}
            <path d={path} fill="none" stroke="#167346" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((point, index) => <g key={`${point.label}-${index}`}><circle cx={point.x} cy={point.y} r="5" fill="#fff" stroke="#167346" strokeWidth="3"><title>{`${formatPeriod(point.label)}: ${formatMoney(point.value, currency)}`}</title></circle>{(index === 0 || index === points.length - 1 || points.length <= 7) ? <text x={point.x} y={height - 5} textAnchor="middle" fill="#858880" fontSize="11">{formatPeriod(point.label)}</text> : null}</g>)}
          </svg>
          <ul className="sr-only" aria-label="Revenue by period">{points.map((point, index) => <li key={`${point.label}-trend-${index}`}>{formatPeriod(point.label)}: {formatMoney(point.value, currency)}.</li>)}</ul>
        </div>
        <p className="mt-1 text-right text-[10px] text-[#a0a39b]">Revenue from issued invoices, net of accepted returns.</p>
      </>}
    </section>
  );
}

export function ExpenseBreakdown({ rows, currency, unavailable = false }: { rows: ExpenseBreakdownRow[]; currency: string; unavailable?: boolean }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const colors = ['#315c45', '#d8f04b', '#71869b', '#a96c54', '#89749a', '#7c8c65'];
  const circumference = 2 * Math.PI * 43;
  let offset = 0;
  return (
    <section className={panel} aria-labelledby="expense-breakdown-title">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#527000]">Spending</p><h2 id="expense-breakdown-title" className="mt-1 text-base font-semibold text-[#292d27]">Expenses by category</h2></div><span className="text-sm font-semibold text-[#30342e]">{formatMoney(total, currency, true)}</span></div>
      {!unavailable && rows.length === 0 ? <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row"><svg viewBox="0 0 120 120" role="img" aria-label="No expense category amounts in this period" className="h-32 w-32 shrink-0"><circle cx="60" cy="60" r="43" fill="none" stroke="#eceee9" strokeWidth="16" /><circle cx="60" cy="60" r="31" fill="white" /><text x="60" y="63" textAnchor="middle" fill="#858880" fontSize="9">NO DATA</text></svg><EmptyPanel>No approved or paid expenses in this period.</EmptyPanel></div> : null}
      {total <= 0 && !unavailable && rows.length > 0 ? <div className="mt-5"><EmptyPanel>No expense amounts to chart for this period.</EmptyPanel></div> : null}
      {total > 0 && rows.length > 0 ? <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center"><svg viewBox="0 0 120 120" role="img" aria-label={`Expense breakdown totaling ${formatMoney(total, currency)}`} className="mx-auto h-32 w-32 shrink-0 sm:mx-0"><g transform="rotate(-90 60 60)">{rows.slice(0, 6).map((row, index) => { const length = (row.amount / total) * circumference; const segment = <circle key={row.categoryId} cx="60" cy="60" r="43" fill="none" stroke={colors[index % colors.length]} strokeWidth="16" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset}><title>{`${row.category}: ${formatMoney(row.amount, currency)} (${row.percentage.toFixed(1)}%)`}</title></circle>; offset += length; return segment; })}</g><circle cx="60" cy="60" r="31" fill="white" /><text x="60" y="57" textAnchor="middle" fill="#858880" fontSize="8">TOTAL</text><text x="60" y="69" textAnchor="middle" fill="#30342e" fontSize="9" fontWeight="600">{formatMoney(total, currency, true)}</text></svg><ul className="sr-only" aria-label="Expense amounts by category">{rows.slice(0, 6).map((row) => <li key={row.categoryId}>{row.category}: {formatMoney(row.amount, currency)}, {row.percentage.toFixed(1)} percent.</li>)}</ul><div className="min-w-0 flex-1 space-y-3">{rows.slice(0, 6).map((row, index) => <div key={row.categoryId}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 truncate text-[#4d514a]"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />{row.category}</span><span className="shrink-0 font-medium text-[#30342e]">{row.percentage.toFixed(1)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#f0f1ed]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, row.percentage))}%`, backgroundColor: colors[index % colors.length] }} /></div></div>)}</div></div> : null}
      {unavailable ? <div className="mt-5"><EmptyPanel>Expense categories could not be loaded. Refresh to try again.</EmptyPanel></div> : null}
    </section>
  );
}

export function CashFlowPanel({ data, currency }: { data: DashboardExecutiveData; currency: string }) {
  const flow = data.charts.cashFlow;
  const max = Math.max(0, ...flow.inflows, ...flow.outflows);
  return (
    <section className={panel} aria-labelledby="cash-flow-title">
      <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#527000]">Liquidity</p><h2 id="cash-flow-title" className="mt-1 text-base font-semibold text-[#292d27]">Cash flow</h2></div>
      {flow.labels.length === 0 || max === 0 ? <div className="mt-5"><EmptyPanel>No payment activity in this period yet.</EmptyPanel></div> : <div className="mt-5 space-y-3">{flow.labels.map((label, index) => <div key={`${label}-${index}`}><div className="mb-1 flex items-center justify-between gap-3 text-[11px]"><span className="text-[#777b73]">{formatPeriod(label)}</span><span className="font-medium text-[#40443d]">Net {formatMoney(flow.netFlow[index] || 0, currency, true)}</span></div><div className="grid grid-cols-2 gap-2"><div className="h-1.5 overflow-hidden rounded-full bg-[#f0f1ed]"><div className="h-full rounded-full bg-[#315c45]" style={{ width: `${Math.max(0, ((flow.inflows[index] || 0) / max) * 100)}%` }} /></div><div className="h-1.5 overflow-hidden rounded-full bg-[#f0f1ed]"><div className="h-full rounded-full bg-[#c56b5f]" style={{ width: `${Math.max(0, ((flow.outflows[index] || 0) / max) * 100)}%` }} /></div></div></div>)}</div>}
      <div className="mt-4 flex gap-4 text-[10px] text-[#858880]"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#315c45]" />Inflows</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#c56b5f]" />Outflows</span></div>
    </section>
  );
}

export function InventoryAlerts({ rows, total, canView, unavailable = false }: { rows: LowStockRow[]; total: number; canView: boolean; unavailable?: boolean }) {
  return (
    <section className={panel} aria-labelledby="inventory-alerts-title">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#527000]">Stock health</p><h2 id="inventory-alerts-title" className="mt-1 text-base font-semibold text-[#292d27]">Reorder watch</h2></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${total ? 'bg-[#ffe0b8] text-[#874400]' : 'bg-[#c9ef9d] text-[#245d20]'}`}>{total} items</span></div>
      {!canView ? <div className="mt-5"><EmptyPanel>Your role does not include inventory viewing.</EmptyPanel></div> : unavailable ? <div className="mt-5"><EmptyPanel>Stock alerts could not be loaded. Refresh to try again.</EmptyPanel></div> : rows.length === 0 ? <div className="mt-5"><EmptyPanel>No active products are currently at or below their reorder thresholds.</EmptyPanel></div> : <div className="mt-4 divide-y divide-[#f0f1ed]">{rows.slice(0, 6).map((row) => <div key={`${row.productId}:${row.locationId}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${row.belowMinimum ? 'bg-[#ffd9d3] text-[#a62f24]' : 'bg-[#e4f58c] text-[#527000]'}`}><PackageSearch size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#343832]">{row.productName}</p><p className="mt-0.5 truncate text-[10px] text-[#747a68]">{row.sku} · {row.locationName}</p></div><div className="text-right"><p className={`text-xs font-semibold ${row.belowMinimum ? 'text-[#b54742]' : 'text-[#527000]'}`}>{row.quantity} on hand</p><p className="text-[10px] text-[#747a68]">reorder at {row.reorderLevel}</p>{row.daysToStockout !== null ? <p className="text-[10px] text-[#747a68]">~{row.daysToStockout} days at recent use</p> : null}</div></div>)}</div>}
    </section>
  );
}

const activityConfig = {
  sale: { label: 'Sale', icon: Banknote, tone: 'bg-[#b9e52e] text-[#354900]', labelTone: 'text-[#24713c]' },
  purchase: { label: 'Purchase', icon: ShoppingBag, tone: 'bg-[#a8ccff] text-[#214e88]', labelTone: 'text-[#315fa5]' },
  expense: { label: 'Expense', icon: Receipt, tone: 'bg-[#ffb4a8] text-[#842a20]', labelTone: 'text-[#b43f31]' },
  payment: { label: 'Payment', icon: CreditCard, tone: 'bg-[#ffd541] text-[#624500]', labelTone: 'text-[#926100]' },
};

function humanizeStatus(status: string) {
  return status.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function RecentActivity({ transactions, unavailableSources, currency }: { transactions: DashboardTransaction[]; unavailableSources: string[]; currency: string }) {
  return (
    <section className={panel} aria-labelledby="recent-activity-title">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#527000]">Latest records</p><h2 id="recent-activity-title" className="mt-1 text-base font-semibold text-[#292d27]">Recent activity</h2></div><span className="text-[11px] text-[#858880]">Latest 8</span></div>
      {unavailableSources.length > 0 ? <p className="mt-3 rounded-lg bg-[#fff8e9] px-3 py-2 text-[11px] text-[#8a6822]">Some activity sources could not be loaded ({unavailableSources.join(', ')}). Use refresh to try again.</p> : null}
      {transactions.length === 0 ? <div className="mt-4"><EmptyPanel>No recent records are available for the permissions on this account.</EmptyPanel></div> : <div className="mt-3 divide-y divide-[#f0f1ed]">{transactions.map((row) => { const config = activityConfig[row.type]; const Icon = config.icon; return <div key={row.id} className="flex items-center gap-3 py-3 first:pt-1"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${config.tone}`}><Icon size={16} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><p className="truncate text-xs font-semibold text-[#30342e]">{row.reference}</p><span className={`text-[10px] font-semibold ${config.labelTone}`}>{config.label}</span></div><p className="truncate text-[11px] text-[#747a68]">{row.description} · {humanizeStatus(row.status)}</p></div><div className="shrink-0 text-right"><p className="text-xs font-semibold text-[#343832]">{formatMoney(row.amount, currency, true)}</p><p className="mt-0.5 text-[10px] text-[#747a68]">{formatDate(row.date)}</p></div></div>; })}</div>}
    </section>
  );
}

export function TopProducts({ data, currency }: { data: DashboardExecutiveData; currency: string }) {
  const rows = data.charts.topProducts.labels.map((name, index) => ({ name, revenue: data.charts.topProducts.revenue[index] || 0, quantity: data.charts.topProducts.quantity[index] || 0 }));
  const max = Math.max(0, ...rows.map((row) => row.revenue));
  return (
    <section className={panel} aria-labelledby="top-products-title">
      <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#527000]">Sales mix</p><h2 id="top-products-title" className="mt-1 text-base font-semibold text-[#292d27]">Top products</h2></div>
      {rows.length === 0 ? <div className="mt-5"><EmptyPanel>No issued sales for this period yet.</EmptyPanel></div> : <div className="mt-4 space-y-4">{rows.map((row, index) => <div key={`${row.name}:${index}`}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="truncate font-medium text-[#4b5048]">{index + 1}. {row.name}</span><span className="shrink-0 text-[#30342e]">{formatMoney(row.revenue, currency, true)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#f0f1ed]"><div className="h-full rounded-full bg-[#315c45]" style={{ width: `${max ? Math.max(3, (row.revenue / max) * 100) : 0}%` }} /></div><p className="mt-1 text-[10px] text-[#9a9d95]">{row.quantity} units sold</p></div>)}</div>}
    </section>
  );
}

export function DashboardSkeleton() {
  return <div className="space-y-6" aria-label="Loading dashboard"><div className="h-24 animate-pulse rounded-2xl bg-[#e9ebe5]" /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-[#e9ebe5]" />)}</div><div className="grid gap-5 xl:grid-cols-2"><div className="h-80 animate-pulse rounded-2xl bg-[#e9ebe5]" /><div className="h-80 animate-pulse rounded-2xl bg-[#e9ebe5]" /></div></div>;
}
