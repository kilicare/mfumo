# Phase 13 — Reporting & Analytics: Checklist ya majaribio

Tumia hii baada ya implementation. Kipimo kimoja kikishindwa simama hapo, rekebisha, kisha rudia kipimo hicho. Andika `GREEN` pamoja na sample values/HTTP response iliyothibitishwa; usiite endpoint green kwa sababu tu imerudisha `200`.

## Maandalizi

- [ ] Hakikisha `GET /api/v1/health` inajibu `200`.
- [ ] Tumia token ya Business A yenye `reports.view` na `reports.export`; usichapishe token kwenye terminal/log.
- [ ] Andaa Business B na accounting period yake kwa majaribio ya tenant isolation.
- [ ] Andaa invoices zilizo-issued, customer returns zilizopokelewa, inventory movements, POs zenye GRNs, approved/paid expenses, payments na accounting periods zenye tarehe zinazojulikana.
- [ ] Rekodi hali za chanzo kabla ya report: invoice totals/returns, payment ledger, expense status, stock balance/movements, PO/GRN values na business IDs.
- [ ] Hakikisha report GET hazibadilishi biashara data; report audit logs zinaweza kuongezeka kwa kila GET iliyofanikiwa.

## 1. Login, ruhusa na tenant isolation

- [ ] Bila token, piga kila endpoint ya `/analytics`; kila moja ikatae kwa `401`.
- [ ] Bila `reports.view`, jaribu dashboards, KPI, trends/forecast, product/customer/supplier analytics, channel, expense breakdown na compare; kila moja ikatae kwa `403`.
- [ ] Bila `reports.export`, jaribu `/analytics/export`; ikatae kwa `403`.
- [ ] Tumia `periodId` ya Business B kwenye Business A; period isionekane, jibu liwe `404`.
- [ ] Tumia period IDs za biashara tofauti kwenye `compare-periods`; request ikataliwe bila kuonyesha jina/tarehe za period ya biashara nyingine.
- [ ] Thibitisha kila query ya report inatumia `businessId` kutoka token; rekodi za tenant nyingine zisiwe kwenye data, totals, charts au exports.

## 2. Dashboards

- [ ] Pata `/analytics/dashboard/executive`; kagua kipindi, currency, summary, KPI, charts na definitions.
- [ ] Linganisha `totalRevenue`, expenses, net profit na margin na income statement ya Payments kwa tarehe hizo hizo.
- [ ] Linganisha receivables/payables/cash position na financial summary ya Payments kwa `asOf` hiyo hiyo.
- [ ] Linganisha inventory value na costing method na stock valuation report ya Inventory; thibitisha `inventoryAsOf` inaonyesha muda wa snapshot ya sasa. Date range huchuja flows/charts, haitoi historical inventory valuation.
- [ ] Thibitisha purchases ni PO volume kwa `orderDate`, si COGS; chart na definition visiiwasilishe kama kitu kilekile.
- [ ] Hakikisha chart labels na kila series zina idadi sawa; values za chart ziwe data halisi, si placeholders.
- [ ] Pata `/analytics/dashboard/sales`; linganisha invoice count, revenue, quantity, payments na balance na invoice/payment source records.
- [ ] Pata `/analytics/dashboard/inventory`; linganisha active products, SKU zenye stock, quantity, valuation, low stock, locations na top movers na inventory source. Tumia dataset yenye zaidi ya stock rows 100 kuthibitisha totals hazikatwi na pagination; `asOf` ni muda wa snapshot ya sasa.
- [ ] Jaribu period maalum na date range; dashboard itumie tarehe hizo tu na ireject period pamoja na date filters.

## 3. KPIs na historia

- [ ] Pata `/analytics/kpis` na kila category: `SALES`, `PROFITABILITY`, `EFFICIENCY`, `LIQUIDITY`, `GROWTH`, `ALL`; categories zirejeshe KPI sahihi tu.
- [ ] Thibitisha revenue, invoice count, average invoice value na units sold kwa source records na returns.
- [ ] Thibitisha COGS inatoka inventory movement costs; gross profit na net profit zilingane na income statement.
- [ ] Thibitisha receivables, payables na cash position ni values za mwisho wa period, si totals za kipindi pekee.
- [ ] Thibitisha `Revenue Growth` na `changePercent` pale previous period ikiwa sifuri; response itumie `null`/tabia iliyoelezwa badala ya Infinity/NaN.
- [ ] Pata `/analytics/kpis/:name`; `currentValue` ilingane na range iliyoombwa na history/change itumie periods zilizotangulia.
- [ ] Jaribu KPI name isiyojulikana; irudishe `404`, si `500`.

## 4. Trends na forecasts

- [ ] Jaribu metrics zote zinazokubalika: `REVENUE`, `EXPENSES`, `PROFIT`, `SALES_QUANTITY`, `CUSTOMER_COUNT`, `INVENTORY`.
- [ ] Jaribu grouping: daily, weekly, monthly, quarterly na yearly; tarehe za bucket, mipaka na mpangilio viwe sahihi.
- [ ] Linganisha trend revenue/expenses/profit/units na source records; inventory history ijengwe kwa movements na stock ya sasa.
- [ ] Thibitisha moving averages, min/max/average, regression slope/intercept/R² na projection kwa sample ndogo inayohesabika kwa mkono.
- [ ] Jaribu metric/grouping/period zisizoruhusiwa na period/date filters zinazokinzana; zikataliwe kwa validation `400`.
- [ ] Jaribu forecast methods zote: `SIMPLE_LINEAR`, `EXPONENTIAL_SMOOTHING`, `MOVING_AVERAGE`; hakikisha horizon, mwezi/tarehe, interval na values zisizo NaN.
- [ ] Thibitisha metrics zisizo hasi hazitoi forecast negative; `PROFIT` inaweza kuwa negative ikiwa data ya kihistoria inaonyesha hasara.
- [ ] Forecast iwe na angalau periods tatu; data pungufu irudishe `400` yenye ujumbe unaoeleweka.
- [ ] Thibitisha confidence/R² ni maelezo ya model, si ahadi ya uhakika wa forecast.

## 5. Product, customer na supplier analytics

- [ ] Pata product performance; linganisha quantity/revenue na invoice item totals, returns na COGS na stock movements.
- [ ] Jaribu return ya product iliyouzwa kabla ya date range lakini return iko ndani ya range; bidhaa ionekane na net return ithibitishwe.
- [ ] Thibitisha category filter, sort na page/limit; category ya business nyingine/ID isiyopo ikataliwe bila data leak.
- [ ] Pata customer analytics; transaction count/revenue iwe ya range, recency itumie invoice ya mwisho hadi `dateTo`, na segment/score ilingane na kanuni iliyoandikwa.
- [ ] Pata supplier analytics; accepted/rejected/damaged quantities, accepted purchase value, on-time, quality na lead time zilingane na PO/GRN.
- [ ] Jaribu bila miamala na kwa pagination; hakuna `NaN`, division-by-zero wala totals zinazojirudia.

## 6. Channel, expense breakdown na period comparison

- [ ] Jaribu sales channels kwa `LOCATION`, `SALESPERSON` na `CUSTOMER_TYPE`; revenue, returns, quantity, COGS, profit, margin na growth vilingane na source.
- [ ] Thibitisha salesperson asiyewekwa anaonekana kama `Unassigned`; channel IDs zisichanganye watu/locations.
- [ ] Linganisha expense breakdown na approved/paid expenses pamoja na item/category allocations; draft/rejected zisihesabiwe.
- [ ] Thibitisha budgets, variance na variance percent kwa monthly/quarterly/yearly; bila budget response isitoe Infinity/NaN.
- [ ] Linganisha periods kwa accounting period IDs na kwa date ranges; periods zote lazima ziwe Business A.
- [ ] Hakikisha difference na percent change zinashughulikia baseline ya sifuri; comparison status huonyesha mwelekeo wa namba (`INCREASED`, `DECREASED`, `NO_CHANGE`), hivyo itafsiriwe kulingana na metric.

## 7. Export za report

- [ ] Export report types zote zinazokubalika kwa CSV, JSON, Excel (`.xlsx`) na PDF.
- [ ] Thibitisha Content-Type, Content-Disposition, jina la faili lililosafishwa, na data ya export ilingane na report endpoint husika.
- [ ] Fungua `.xlsx` kwa spreadsheet reader na PDF kwa PDF reader; si signature pekee.
- [ ] Hakikisha CSV inakimbia formula injection kwa cell zinazoanza na `=`, `+`, `-`, `@`, tab au carriage return.
- [ ] Jaribu report type/format/file name isiyokubalika; irudishe `400` bila audit ya export iliyofanikiwa.
- [ ] Thibitisha export zote zinafuata date range/period filters, pamoja na receivables/payables as-of date.
- [ ] Product/customer/supplier exports zijumuishe rows zote hadi 10,000; zikizidi, zipokee `400` ya wazi badala ya export iliyokatwa kimya kimya.

## 8. Audit, errors na uthabiti

- [ ] Kila report/export iliyofanikiwa iandike audit `AnalyticsReport` yenye business, user, report, muda na filters/summary.
- [ ] Request iliyokataliwa au iliyoshindwa isiandike audit log ya mafanikio.
- [ ] Hakikisha data kubwa na no-data responses zina shape thabiti (`data`, `total`, `page`, `limit`) inapohusika.
- [ ] Validation errors ziwe `400`, token `401`, permission `403`, ID/period isiyopatikana `404`; hakuna endpoint inayopaswa kutoa `500` kwa input batili ya kawaida.
- [ ] Thibitisha report calculations hazibadilishi stock, invoice, payment, expense, PO au accounting period records.
- [ ] Kagua decimals/rounding na kuhakikisha hakuna `NaN`, `Infinity`, balance hasi isiyoruhusiwa au data ya business nyingine kwenye responses/exports.

## Kanuni za hesabu zilizowekwa

- Revenue: invoice zilizo-issued zisizo draft/cancelled ukitoa returns zilizopokelewa katika range husika.
- COGS: inventory SALE/reversal/customer-return movement costs; purchases ni PO volume na hazitumiki kama mbadala wa COGS.
- Expenses: expenses za `APPROVED` au `PAID`; draft/rejected hazitambuliwi kama gharama.
- Receivable/payable/cash: snapshot ya mwisho wa range, kutoka Payments financial summary.
- Inventory value: Inventory valuation service na costing method ya business, kama snapshot ya sasa (`inventoryAsOf`), hata pale charts zinapotumia date range ya zamani.
- Forecast confidence ni makadirio yanayotokana na historical residuals; mfumo hauahidi matokeo yajayo.
