'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Clock3, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { dashboardAPI, type DashboardExecutiveData, type DashboardFilter, type DashboardTransaction, type ExpenseBreakdownRow, type LowStockRow } from '@/lib/api/dashboard';
import { getApiError } from '@/lib/api';
import { CashFlowPanel, DashboardSkeleton, ExpenseBreakdown, InventoryAlerts, MetricCard, RecentActivity, RevenueExpenseChart, SalesTrendChart, TopProducts } from '@/components/dashboard/DashboardWidgets';

type PeriodKey = 'week' | 'month' | 'quarter' | 'year';
const EMPTY_PERMISSIONS: string[] = [];

const periods: Array<{ value: PeriodKey; label: string }> = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This year' },
];

function dateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function periodFilter(period: PeriodKey, asOfTime: number): DashboardFilter {
  const now = new Date(asOfTime || Date.now());
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let groupBy: DashboardFilter['groupBy'] = 'DAILY';

  if (period === 'week') {
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
  } else if (period === 'month') {
    start.setDate(1);
  } else if (period === 'quarter') {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
    groupBy = 'WEEKLY';
  } else {
    start.setMonth(0, 1);
    groupBy = 'MONTHLY';
  }

  return { dateFrom: dateInput(start), dateTo: dateInput(now), groupBy };
}

function dateRangeLabel(filter: DashboardFilter) {
  const format = (value: string) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
  return `${format(filter.dateFrom)} – ${format(filter.dateTo)}`;
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions ?? EMPTY_PERMISSIONS;
  const canViewReports = permissions.includes('reports.view');
  const canViewInventory = permissions.includes('inventory.view');
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [asOfTime, setAsOfTime] = useState(0);
  const [executive, setExecutive] = useState<DashboardExecutiveData | null>(null);
  const [expenseRows, setExpenseRows] = useState<ExpenseBreakdownRow[]>([]);
  const [lowStockRows, setLowStockRows] = useState<LowStockRow[]>([]);
  const [lowStockTotal, setLowStockTotal] = useState(0);
  const [inventoryUnavailable, setInventoryUnavailable] = useState(false);
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [unavailableActivitySources, setUnavailableActivitySources] = useState<string[]>([]);
  const [expenseUnavailable, setExpenseUnavailable] = useState(false);
  const [optionalDataWarning, setOptionalDataWarning] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasData = useRef(false);
  const filter = useMemo(() => periodFilter(period, asOfTime), [period, asOfTime]);

  useEffect(() => {
    let active = true;
    if (!canViewReports) {
      hasData.current = false;
      setExecutive(null);
      setExpenseRows([]);
      setLowStockRows([]);
      setLowStockTotal(0);
      setTransactions([]);
      setIsLoading(false);
      setError('Your account does not have permission to view business reports. Contact your business administrator.');
      return () => { active = false; };
    }

    setError('');
    setIsLoading(!hasData.current);
    setIsRefreshing(hasData.current);

    const load = async () => {
      try {
        const [executiveResult, expenseResult, stockResult, activityResult] = await Promise.allSettled([
          dashboardAPI.getExecutive(filter),
          dashboardAPI.getExpenseBreakdown(filter),
          canViewInventory ? dashboardAPI.getLowStock(8) : Promise.resolve({ data: [] as LowStockRow[], total: 0 }),
          dashboardAPI.getRecentTransactions(permissions),
        ]);

        if (!active) return;
        if (executiveResult.status === 'rejected') throw executiveResult.reason;
        setExecutive(executiveResult.value);
        hasData.current = true;

        const expenseFailed = expenseResult.status === 'rejected';
        setExpenseUnavailable(expenseFailed);
        setExpenseRows(expenseResult.status === 'fulfilled' ? expenseResult.value : []);
        const stockFailed = canViewInventory && stockResult.status === 'rejected';
        setInventoryUnavailable(stockFailed);
        if (stockResult.status === 'fulfilled') {
          setLowStockRows(stockResult.value.data || []);
          setLowStockTotal(stockResult.value.total || 0);
        } else {
          setLowStockRows([]);
          setLowStockTotal(0);
        }
        const activityFailed = activityResult.status === 'rejected';
        setTransactions(activityResult.status === 'fulfilled' ? activityResult.value.transactions : []);
        setUnavailableActivitySources(activityResult.status === 'fulfilled' ? activityResult.value.unavailableSources : ['recent activity']);
        setOptionalDataWarning(expenseFailed || stockFailed || activityFailed || (activityResult.status === 'fulfilled' && activityResult.value.unavailableSources.length > 0));
      } catch (cause) {
        if (active) setError(getApiError(cause, 'We could not load the dashboard. Try again.'));
      } finally {
        if (active) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    void load();
    return () => { active = false; };
  }, [canViewReports, canViewInventory, filter, permissions]);

  const availableMetrics = executive?.summary;
  const metricCards = availableMetrics ? [
    { metric: availableMetrics.totalRevenue, tone: 'bg-[#b9e52e] text-[#354900]', valueColor: 'text-[#24713c]' },
    { metric: availableMetrics.totalExpenses, tone: 'bg-[#ffb4a8] text-[#842a20]', valueColor: 'text-[#b43f31]', invertTrend: true },
    { metric: availableMetrics.totalProfit, tone: 'bg-[#ffd541] text-[#624500]', valueColor: 'text-[#9a6a00]' },
    { metric: availableMetrics.profitMargin, tone: 'bg-[#a8ccff] text-[#214e88]', valueColor: 'text-[#315fa5]' },
    { metric: availableMetrics.cashOnHand, tone: 'bg-[#77ddb0] text-[#10563f]', valueColor: 'text-[#147554]' },
    { metric: availableMetrics.outstandingReceivables, tone: 'bg-[#ffcf24] text-[#5c4000]', valueColor: 'text-[#926100]', invertTrend: true },
    { metric: availableMetrics.outstandingPayables, tone: 'bg-[#91b9ff] text-[#1e477f]', valueColor: 'text-[#315fa5]', invertTrend: true },
    { metric: { ...availableMetrics.inventoryValue, changePercent: null }, tone: 'bg-[#c8a8ee] text-[#513276]', valueColor: 'text-[#7043a3]' },
  ] : [];

  if (isLoading && !executive) return <DashboardSkeleton />;

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="flex flex-col gap-5 rounded-2xl border border-[#e6e8e1] bg-white p-5 shadow-sm shadow-black/[0.02] sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#527000]">Executive overview</p><h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#20231f] sm:text-3xl">Business at a glance</h1><p className="mt-2 text-sm font-medium text-[#626b51]">{user?.businessName || 'Your business'} · {dateRangeLabel(filter)}</p></div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label htmlFor="dashboard-period" className="sr-only">Dashboard date range</label>
          <select id="dashboard-period" value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)} disabled={isRefreshing} className="h-10 rounded-xl border border-[#e1e4dc] bg-white px-3 text-sm font-medium text-[#42463f] outline-none transition focus:border-[#315c45] focus:ring-2 focus:ring-[#315c45]/10 disabled:opacity-60">
            {periods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="button" onClick={() => setAsOfTime(Date.now())} disabled={isRefreshing} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#20211f] px-3.5 text-sm font-semibold text-white transition hover:bg-[#245543] disabled:cursor-not-allowed disabled:opacity-60" aria-label="Refresh dashboard">
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} /> <span className="hidden sm:inline">{isRefreshing ? 'Updating' : 'Refresh'}</span>
          </button>
        </div>
      </section>

      {error ? <div role="alert" className="flex items-start gap-3 rounded-xl border border-[#efcfcb] bg-[#fff5f3] p-4 text-sm text-[#9d443e]"><AlertCircle size={18} className="mt-0.5 shrink-0" /><div className="flex-1"><p className="font-semibold">Dashboard unavailable</p><p className="mt-1">{error}</p><button type="button" onClick={() => setAsOfTime(Date.now())} className="mt-2 font-semibold underline underline-offset-2">Try again</button></div></div> : null}
      {optionalDataWarning && executive ? <p role="status" className="rounded-xl border border-[#eadfbf] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[#806522]">Some optional panels could not be loaded. The summary remains based on the analytics service; refresh to retry the missing panels.</p> : null}

      {executive ? <>
        <section aria-labelledby="kpi-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#527000]">Key indicators</p><h2 id="kpi-heading" className="mt-1 text-lg font-semibold text-[#292d27]">Financial and stock position</h2></div><p className="text-[11px] text-[#747a68]">Based on {executive.period}</p></div>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">{metricCards.map(({ metric, tone, valueColor, invertTrend }) => <MetricCard key={metric.name} metric={metric} currency={executive.currency} tone={tone} valueColor={valueColor} invertTrend={invertTrend} />)}</div>
          <p className="mt-3 text-[11px] leading-5 text-[#8a8d85]">Revenue, expenses and profit use the selected period. Inventory value is a current snapshot as of {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(executive.inventoryAsOf))}; it is not a historical comparison.</p>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <RevenueExpenseChart data={executive} currency={executive.currency} />
          <SalesTrendChart data={executive} currency={executive.currency} />
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <ExpenseBreakdown rows={expenseRows} currency={executive.currency} unavailable={expenseUnavailable} />
          <CashFlowPanel data={executive} currency={executive.currency} />
          <TopProducts data={executive} currency={executive.currency} />
          <InventoryAlerts rows={lowStockRows} total={lowStockTotal} canView={canViewInventory} unavailable={inventoryUnavailable} />
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <RecentActivity transactions={transactions} unavailableSources={unavailableActivitySources} currency={executive.currency} />
          <section className="rounded-2xl border border-[#e8e9e5] bg-[#f0f4ef] p-5 sm:p-6" aria-label="Dashboard data definitions">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#527000]">How to read these figures</p>
            <h2 className="mt-1 text-base font-semibold text-[#292d27]">Clear numbers, real rules</h2>
            <dl className="mt-4 space-y-3 text-xs leading-5 text-[#62675f]">
              <div><dt className="inline font-semibold text-[#38423a]">Revenue: </dt><dd className="inline">{executive.definitions.revenue}</dd></div>
              <div><dt className="inline font-semibold text-[#38423a]">Profit: </dt><dd className="inline">{executive.definitions.profit}</dd></div>
              <div><dt className="inline font-semibold text-[#38423a]">Cash position: </dt><dd className="inline">{executive.definitions.cashPosition}</dd></div>
              <div><dt className="inline font-semibold text-[#38423a]">Stock valuation: </dt><dd className="inline">{executive.definitions.inventoryValuationTiming} Method: {executive.definitions.inventoryValue}</dd></div>
            </dl>
            <p className="mt-5 flex items-center gap-1.5 border-t border-[#dfe6dd] pt-4 text-[11px] text-[#7b8178]"><Clock3 size={13} />Financial figures as of {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(executive.asOf))}</p>
          </section>
        </section>
      </> : !error ? <DashboardSkeleton /> : null}
    </div>
  );
}
