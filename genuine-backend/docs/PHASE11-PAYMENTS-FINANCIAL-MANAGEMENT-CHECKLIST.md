# Phase 11 — Payments & Financial Management: Checklist ya majaribio

Tutapima kipengele kimoja kwa wakati. Kila kipengele kikipita tutaandika `GREEN` pamoja na data na majibu tuliyoona; kikishindwa tunasimama hapo, tunarekebisha, kisha tunarudia kipimo hicho kabla ya kuendelea.

## Maandalizi

- [x] Hakikisha backend inajibu `GET /api/v1/health`.
- [x] Ingia kama mtumiaji wa Business A mwenye ruhusa zinazohitajika; usiweke token kwenye log au ujumbe unaoshirikiwa.
- [x] Andaa Business B na mtumiaji wake kwa vipimo vya business isolation.
- [x] Andaa invoice ya `ISSUED` yenye balance inayojulikana, PO iliyoidhinishwa yenye kiasi kinachodaiwa, na payment method hai ya Business A.
- [x] Andaa expense categories hai, location hai na payment method hai kwa Business A.
- [x] Rekodi hali za mwanzo: invoice `totalAmount/totalPaid/balance/status`, PO `totalAmount/status`, payment rows zilizopo, expense rows, na audit log husika.
- [x] Hakikisha data zote za test zina majina/namba za kipekee na mpango wa kuzisafisha baada ya vipimo.

Matokeo ya 2026-09-29: Health na login zilijibu `200`. Business A na Business B pamoja na watumiaji wao walikuwepo; Business A ilikuwa na active payment method, location na expense category. Baseline: invoice ya `ISSUED` `totalAmount=21.59`, `totalPaid=0`, `balance=21.59`; PO `totalAmount=2,000`, `FULLY_RECEIVED`; payments `7`, expenses `0`, accounting periods `1`. Token haikuandikwa kwenye command output, na logger ilirekebishwa kuthibitisha hilo.

## 1. Authentication, ruhusa na business isolation

- [x] Bila token, piga payment, expense, period na report endpoint; kila endpoint iliyolindwa ikatae kwa `401`.
- [x] Bila `payments.view`, jaribu `GET /payments` na `GET /payments/:id`; ikatae kwa `403`.
- [x] Bila `payments.create`, jaribu kutengeneza payment, reconcile na void; ikatae kwa `403`.
- [x] Bila `expenses.view`, jaribu kuorodhesha/kusoma expense; ikatae kwa `403`.
- [x] Bila `expenses.create`, jaribu create, approve, reject na pay expense; ikatae kwa `403`.
- [x] Bila `settings.view`, list/get accounting periods ikatae kwa `403`; bila `settings.edit`, create/lock/close ikatae kwa `403`.
- [x] Bila `reports.view`, endpoints zote za report zikatae kwa `403`.
- [x] Kwa kila GET na mutation, tumia ID ya Business B ukiwa Business A; data isifichuliwe na hakuna mabadiliko yafanyike.
- [x] Hakikisha tenant ya zamani inayologin inapata default permissions mpya bila kufuta custom permissions zake.

Matokeo ya 2026-09-29: Bila token, payment, expense, period na report endpoints zilijibu `401`. User wa muda asiye na ruhusa alijaribu routes zote 22 za payments/expenses/periods/reports; zote zilijibu `403` kabla ya mutation. Payment halali ya Business B ilijaribiwa kwa GET na void kutoka Business A; zote zilijibu `404`, na payment ya B ilibaki `RECORDED`. Owner role ilipewa custom permission ya muda; baada ya login permission hiyo bado iliunganishwa, kisha fixture ikaondolewa. User, role, payment na permission za muda zilisafishwa.

## 2. Payments — kuunda na hesabu

- [x] Tengeneza payment ya invoice ya `ISSUED`; thibitisha `PAY-YYYYMM-00001` au namba inayofuata, business, reference, amount, method, tarehe, direction `INFLOW`, user na status `RECORDED`.
- [x] Thibitisha `totalPaid` ya invoice imeongezeka na `balance` imepungua sawasawa; status iwe `PARTIALLY_PAID` au `PAID` inapofaa.
- [x] Tengeneza payment ya PO iliyoidhinishwa; direction iwe `OUTFLOW`, supplier/PO reference ziwe sahihi na status ya lifecycle ya PO isibadilike.
- [x] Tengeneza payment ya expense iliyoidhinishwa lakini haijalipwa; thibitisha expense payment link, amount iliyobaki na status.
- [x] Tengeneza payment ya `Other` kwa `INFLOW` na nyingine ya `OUTFLOW`; thibitisha direction na reference zinahifadhiwa.
- [x] Jaribu `Other` bila direction, na direction kwenye Invoice/PO/Expense; zote zikatalie kwa validation.
- [x] Jaribu payment method isiyopo, inactive au ya Business B; ikataliwe.
- [x] Jaribu reference ID isiyopo au ya business nyingine; ikataliwe bila kufichua rekodi.
- [x] Jaribu payment kwenye invoice ya `DRAFT`/`CANCELLED`, PO ya `DRAFT`/`CANCELLED`, na expense isiyo `APPROVED/PAID`; zikatalie.
- [x] Jaribu amount sifuri, hasi, isiyo namba, Infinity/NaN na zaidi ya decimal 2; ikataliwe.
- [x] Jaribu malipo yanayozidi balance; yakataliwe na balance ibaki bila mabadiliko.
- [x] Jaribu payment date isiyo halali na tarehe iliyo ndani ya accounting period iliyofungwa; validation au `409` inayotarajiwa irudi.
- [x] Jaribu payment number maalum na duplicate ndani ya business; unique rule itekelezwe bila kuvuruga payment iliyopo.
- [x] Thibitisha rounding ya cents kwenye kiasi na balance.

Matokeo ya 2026-09-29: Invoice `PH9-ROUND-RETURN` ilipokea test payment `$0.11`; `totalPaid=0.11`, balance `$21.48`, status `PARTIALLY_PAID`, direction `INFLOW`, namba yenye prefix `PAY-202609-`, business/reference/customer/method/date/user/status zililingana. Void ilirudisha invoice baseline: total `$21.59`, paid `$0`, balance `$21.59`, `ISSUED`. PO `PO-202609-00001` (FULLY_RECEIVED, `$2,000`) ilipokea test payment `$0.22`, direction `OUTFLOW`, supplier/PO references sahihi, lifecycle status haikubadilika; void iliondoa test payment. Expense ya `$0.33` iliidhinishwa, ikapokea payments `$0.12` na `$0.21`; partial iliiacha `APPROVED/isPaid=false`, full iliweka `PAID/isPaid=true`, kisha void zilirudisha state ya approval kabla ya kusafisha fixture. `Other` inflow `$0.41` na outflow `$0.42` zilihifadhi direction/reference. Missing/invalid direction, method isiyopo/inactive/ya B, reference isiyopo/ya B, DRAFT/CANCELLED invoice/PO, DRAFT expense, amount `0`, hasi, string, `Infinity`, `NaN`, decimals zaidi ya 2, overpayment na tarehe batili zilikataliwa kwa `400/404`; tarehe ndani ya period iliyofungwa ilikataliwa kwa `409`. Duplicate payment number ilikataliwa `409`; payment ya `$1.11` ilihifadhi cents bila kubadilika. Baada ya vipimo invoice ilirudi `$21.59/0/$21.59/ISSUED`, PO `$2,000/FULLY_RECEIVED`; payment baseline ilibaki 7, expense baseline 0, na fixtures zote pamoja na audits zilisafishwa.

## 3. Idempotency, concurrency na list/get ya payments

- [x] Tuma create payment mara mbili kwa `idempotencyKey` ileile na payload ileile; irudishe payment ileile bila kuongeza jumla mara ya pili.
- [x] Tumia `idempotencyKey` ileile kwa amount/reference/method tofauti; ombi la pili lirudi `409`.
- [x] Tuma maombi mawili kwa wakati mmoja dhidi ya balance ndogo; ombi moja tu lifanikiwe ikiwa yote yakizidi balance, balance isiwe hasi.
- [x] Orodhesha payments bila filter; thibitisha `data`, `total`, `page`, `limit` na mpangilio wa tarehe.
- [x] Chuja kwa status na referenceType; matokeo yote yawe ya Business A na yaendane na filter.
- [x] Jaribu page/limit halali, `page=0`, limit isiyo namba na limit zaidi ya 100; invalid ikataliwe bila kuvunja server.
- [x] Pata payment kwa ID halali; thibitisha payment method na metadata.
- [x] Pata ID isiyopo/ya business nyingine; irudi `404`.

Matokeo ya 2026-09-29: idempotency retry ilirudisha payment ileile na kuacha `totalPaid=0.10`, `balance=0.90`; key ikitumika tena na amount/reference/method tofauti ilirudisha `409`. Requests za pamoja za `0.60` dhidi ya invoice ya `1.00` zilirudisha `201` na `400`, na salio likaishia `0.40`. List/filter/pagination/get zilipita; list ya A ilikuwa na `data=9`, `total=9`, `page=1`, `limit=100`, ikiwa imepangwa kwa payment date na ID kushuka. Vipimo vya page/limit visivyo halali vilirudisha `400`; ID ya B/isiyopo ilirudisha `404`. Test records zilisafishwa na invoices zikarudishwa kwenye salio la awali.

## 4. Reconcile na void ya payment

- [x] Reconcile payment halali kwa `bankStatementReference`; thibitisha status `RECONCILED`, `isReconciled`, reconciledBy/At na reference.
- [x] Reconcile payment hiyo tena; ikataliwe kwa `409`, isibadilishe audit au data nyingine.
- [x] Reconcile payment iliyovoidiwa au ID isiyopo; kosa linalofaa lirudi.
- [x] Void payment ya kawaida kwa sababu; thibitisha `VOIDED`, voidedBy/At/reason na audit log.
- [x] Thibitisha void ya invoice payment inarejesha totalPaid/balance/status kwa usahihi.
- [x] Thibitisha void ya expense payment inarudisha expense kwenye `APPROVED`, `isPaid=false`, na paidAt isafishwe inapofaa.
- [x] Thibitisha void ya PO payment inajumuishwa tena kwenye payable balance kwa sababu payment hiyo haipo tena kwenye malipo hai.
- [x] Jaribu void bila sababu, void mara ya pili, na void ya reconciled payment; zikatalie kulingana na sheria iliyowekwa (reconciled inahitaji reversal workflow tofauti).
- [x] Baada ya reconcile/void failures, hakikisha hakuna audit action inayodai mafanikio.

Matokeo ya 2026-09-29: reconcile iliweka `RECONCILED`, `isReconciled=true`, mtumiaji, muda, statement reference na audit moja. Reconcile ya pili na void ya payment reconciled vilirudisha `409`; void ya payment voided ilirudisha `409`, reconcile ya voided ilirudisha `409`, na IDs zisizopo zilirudisha `404`. Void bila reason ilirudisha `400` bila kubadilisha rekodi/audit. Void halali iliweka `VOIDED` pamoja na voidedBy/At/reason na audit moja. Invoice ilirudi `totalPaid=0`, `balance=1`, `ISSUED`; expense ilirudi `APPROVED`, `isPaid=false`, `paidAt/paidBy=null`; payable ya PO ilirudi kwenye kiwango cha mwanzo na PO ikabaki `FULLY_RECEIVED`. Failures hazikuongeza success audit. Test records na audit zake zilisafishwa.

## 5. Expenses — kutengeneza, kuidhinisha na kulipa

- [x] Tengeneza expense yenye item moja; thibitisha expense number ya kipekee, category, location, amount, tarehe, method, user na status `DRAFT`.
- [x] Tengeneza expense yenye items nyingi; amount ya header iwe jumla sahihi ya line items.
- [x] Jaribu items tupu, amount sifuri/hasi/si namba, category/location/method isiyopo, inactive au ya business nyingine; ikataliwe bila rekodi nusu.
- [x] Jaribu expense number maalum na duplicate ndani ya business; duplicate ikataliwe.
- [x] Tuma `isPaid=true` wakati wa create; isiwe njia ya kupita approval/pay workflow.
- [x] Approve expense ya `DRAFT`; thibitisha `APPROVED`, approvedBy/At na audit log.
- [x] Approve tena, approve iliyokataliwa, au approve ID isiyopo/ya business nyingine; ikataliwe.
- [x] Reject expense ya `DRAFT` kwa reason; thibitisha status/rejectionReason na audit.
- [x] Jaribu reject bila sababu, reject iliyokwishaamuliwa, na reject baada ya kulipwa; ikataliwe.
- [x] Pay expense iliyoidhinishwa; thibitisha payment row ya `OUTFLOW`, expense isPaid/status/paidAt/paidBy, na audit zimeandikwa transactionally.
- [x] Pay tena expense iliyolipwa; isiunde payment duplicate.
- [x] Orodhesha expenses; thibitisha pagination na `data/total/page/limit`.
- [x] Pata expense kwa ID halali; thibitisha items na jumla. ID isiyopo/ya business nyingine irudi `404`.
- [x] Kosa wakati wa create/pay lisibakishe expense/payment nusu.

Matokeo ya 2026-09-29: expense ya item moja ilizalisha `EXP-202609-00001` na kuhifadhi DRAFT, category, location, method, tarehe na user; expense ya items mbili ilihesabu `$1.10 + $2.25 = $3.35`. Validation ya items/amount/IDs/methods/locations/categories batili, zisizotumika au za Business B ilikataa kwa `400/404` bila expense au items nusu. `isPaid=true` ilikataliwa kwa `400`. Duplicate expense number mwanzoni ilifichua `500`; service ilirekebishwa kushughulikia Prisma `P2002` kama `409`. Retry ya kipimo ilithibitisha first create `201`, duplicate `409`, record/item/audit moja tu. Approve iliweka user/time na audit; reject ilihifadhi sababu; transitions zilizorudiwa au zisizoruhusiwa zilikataa. Pay iliunda `OUTFLOW` moja, ikaweka expense `PAID`, na repeated pay ikarudisha `409` bila duplicate. Business B expense IDs zote zilijibu `404`. List ilirudisha `data=4`, `total=4`, page/limit sahihi; get ilirudisha items na jumla sahihi. Failed pay iliacha expense `APPROVED`, bila Payment au `PAY` audit. Test rows na audit zilisafishwa; Business A ilirudi expenses `0`, payments `7`.

## 6. Accounting periods na kufunga kipindi

- [x] Tengeneza period yenye start/end halali; status iwe `OPEN`.
- [x] Jaribu endDate kabla ya startDate, period name tupu, tarehe batili, duplicate na overlap na period nyingine ya Business A; zikatalie.
- [x] Hakikisha period za Business B hazizuii wala kuonekana kwenye Business A.
- [x] List/get period; thibitisha dates, status na metadata.
- [x] Lock period ya `OPEN`; thibitisha `LOCKED`, lockedBy/At.
- [x] Jaribu payment yenye transaction date ndani ya `LOCKED`; ikataliwe kwa `409` na isiandike payment/audit ya mafanikio.
- [x] Jaribu transaction date nje ya period iliyofungwa; ikubaliwe ikiwa masharti mengine yametimia.
- [x] Jaribu issue invoice, sales payment, purchase payment, na accept GRN katika period iliyofungwa; vyote vizingatie period lock.
- [x] Close period iliyofungwa; thibitisha `CLOSED`, closedBy/At na notes zinazohusika.
- [x] Jaribu close ya `OPEN`, lock ya `CLOSED`, transition ya pili na period ID isiyopo/ya business nyingine; state rule ikatekelezwe.
- [x] Hakikisha transaction iliyokwishaandikwa haihaririwi kimyakimya kwa kufunga period.

Matokeo ya 2026-09-29: period halali iliundwa `OPEN`; invalid date range, blank/whitespace name, duplicate name na overlap zilikataliwa (`400/409`). Period za Business A zilirudisha list/get na metadata sahihi. Period ya Business B iliwekwa kama fixture ya `LOCKED`; ID yake ilirudisha `404` kwa Business A, haikuonekana kwenye list ya A, na haikuzuia payment ya A ya tarehe hiyo (`201`). Lock iliweka `lockedBy/lockedAt`; lock ya pili ilikataa `409`. Payment ya `Other` ndani ya locked period, sales payment ya invoice iliyo-issued, purchase payment, invoice issue na GRN accept zote zilikataa `409`; payment count haikuongezeka, sales invoice ilibaki na balance `$1.00`, draft invoice ilibaki `DRAFT`, GRN ilibaki `ACCEPTED` na PO ilibaki `FULLY_RECEIVED`. Payment ya tarehe nje ya kipindi ilikubaliwa `201`, kisha test row/audit zikasafishwa. Close ya `LOCKED` na ya `OPEN` zote zilirudisha `200` na kuweka `closedBy/closedAt`; closing note `Month end reconciled; bank statement matched.` ilirudi na kuhifadhiwa kwenye DB. Close ya pili na lock ya `CLOSED` zilikataa `409`; ID isiyopo ilirudisha `404`. Kipimo kilifichua kuwa close endpoint haikupokea notes; ikaongezwa DTO ya `closingNotes` ya hiari (max 1000 chars), na build, targeted ESLint na API retest zikapita. Test periods na payment zilifutwa; stale empty-name period ya kipimo cha awali iliondolewa; period `2026-09` ilirejeshwa `OPEN`; Business A payments zilirudi 7, hakuna test payment/period iliyobaki, na source invoice/GRN/PO hazikubadilika.

## 7. Financial reports

- [x] Tumia kipindi chenye data inayojulikana; linganisha report totals na invoices/payments/expenses/returns/movements za msingi.
- [x] Income statement: thibitisha revenue, sales returns, COGS kutoka SALE movements, gross profit, expenses na net profit.
- [x] Cash flow: jaribu `DAILY`, `WEEKLY`, `MONTHLY`; thibitisha INFLOW/OUTFLOW na grouping kwa tarehe.
- [x] Receivables ageing: thibitisha invoice balances zinaingia kwenye bucket sahihi kulingana na due date/dateAs.
- [x] Payables ageing: thibitisha PO balances zinaondoa active payments na kuingia kwenye bucket sahihi.
- [x] Trial balance: hakikisha response inaonyesha `reportBasis` kuwa operational summary, na `isBalanced` inaonyesha hesabu halisi; usiichukulie kama double-entry General Ledger.
- [x] Financial summary: thibitisha receivables/payables/cash na inventory valuation; rekodi `inventoryValueAsOf` na costing method.
- [x] Chuja kwa `periodId`, `dateFrom`, `dateTo`, `dateAs`, customerId na supplierId pale zinapohusika; hakikisha business scoping.
- [x] Jaribu tarehe batili, `dateFrom > dateTo`, period ID isiyopo/ya business nyingine na groupBy isiyotambulika; irudishe validation/error inayofaa.
- [x] Thibitisha ripoti za tarehe za nyuma haziwasilishi inventory valuation ya sasa kama valuation ya tarehe ya nyuma; API inaonyesha timestamp ya valuation.
- [x] Linganisha decimals/rounding za report na source records.

Matokeo ya 2026-09-29: `2026-09` na range `2026-09-01..2026-09-30` zililingana kwa net sales `$1,375.59`; income statement ilirudisha gross/net income `$-109,976.16` baada ya COGS `$111,351.75` na approved expenses `$0.00`. Source queries zinalingana: invoices na returns zilihesabiwa kwa status, COGS ilijengwa kutoka costed stock movements, na payment inflows zilikuwa `$1,163.25`. Cash-flow daily/weekly/monthly zililingana kwenye inflows/outflows/closing balance; test payments za `$0.11` (Sep 1 midnight), `$0.22` outflow (Sep 2) na `$0.33` (Sep 30 mwisho wa siku) zilionyesha mipaka ya tarehe na grouping sahihi; jumla zilikuwa inflows `$1,163.69`, outflows `$0.22`, closing `$1,163.47`. Expense ya muda iliyoidhinishwa `$1.23` ilionekana kwenye income statement, summary, category details na trial-balance calculation; report ilirudisha net income `$-109,977.39` wakati huo. AR ya customer ilikuwa current `$209.34`, siku 1–30 `$3.00`, jumla `$212.34`; AP ya supplier ilikuwa current `$2,000.00`. Trial-balance response ilionyesha totals debits `$1,375.59`, credits `$3,375.59`, `isBalanced=false` na `reportBasis` ilisema operational summary (si double-entry ledger). Summary ilionyesha receivables/payables/payment totals, inventory `$38,648.25`, timestamp ya valuation ya sasa na `WEIGHTED_AVERAGE`. Historical summary ya Sep 1 ilirudisha sales/COGS `$0.00` kwa tarehe hiyo, huku `inventoryValueAsOf` ikiwa timestamp ya sasa; haikuwasilisha inventory ya sasa kama valuation ya kihistoria.

Validation ilirudisha `400` kwa tarehe batili, range iliyorudishwa nyuma, kuchanganya periodId na dates, na groupBy isiyotambulika; period ID isiyopo au ya Business B ilirudisha `404`. Kipimo cha sale + customer return kilithibitisha SALE movement inahifadhi unitCost `$1,500`, CUSTOMER_RETURN inarudisha bidhaa kwa cost hiyo hiyo, na COGS inarudi kwenye baseline baada ya return. Hitilafu iliyopatikana: SALE movements za zamani hazikuwa na unitCost na report ilikuwa inatumia buyingPrice ya sasa moja kwa moja; pia customer-return movements hazikupunguza COGS. Sales sasa huhifadhi cost ya issue/return, na report hureplay historical movement layers kwa costing method ya business ili kurejesha COGS za legacy/null-cost movements; build na ESLint zimepita, na API retest ilithibitisha totals. COGS ya opening stock isiyo na receipt/cost movement inategemea buyingPrice iliyopo kwa sababu hakuna historical cost snapshot ya opening balance. Test payments/expense/invoice/return/movements/audits zilifutwa na stock imerejeshwa; hakuna test data ya `PH11-RPT` iliyobaki.

## 8. Audit, transactions na majibu ya API

- [x] Audit log irekodi payment create/reconcile/void na expense create/approve/reject/pay pamoja na business, user, action, entity na muda.
- [x] Accounting period create/lock/close irekodiwe inapotarajiwa.
- [x] Request iliyoshindwa isiwe na audit log ya mafanikio.
- [x] Thibitisha create payment, pay expense na period transitions ni atomic: kosa la DB lisibakishe baadhi tu ya records/state.
- [x] Tuma requests zinazoweza kuzalisha payment/expense number kwa wakati mmoja; namba zisijirudie ndani ya business.
- [x] Thibitisha status codes na error shape kwa validation (`400`), login (`401`), permission (`403`), missing/business scoped ID (`404`), conflict/idempotency/period lock (`409`).
- [x] Hakikisha responses hazifichui rekodi za business nyingine, token, au taarifa za ndani za database.
- [x] Baada ya vipimo, hakikisha stock haijabadilika kwa payment/expense pekee, hakuna balance hasi isiyoruhusiwa, na safisha test records kwa uangalifu.

Matokeo ya 2026-09-29: Audit queries zilithibitisha payment `CREATE/RECONCILE/VOID`, payment inayotokana na kulipa expense `CREATE`, expense `CREATE/APPROVE/PAY/REJECT`, na accounting period `CREATE/LOCK/CLOSE` zote zina business, user sahihi na timestamps (matukio 13); validation request ya `400` haikuongeza audit. API contracts zilitoa `401` bila token, `403` bila `settings.view`, `404` kwa ID isiyopo, `400` kwa amount sifuri, na `409` kwa duplicate number/transition. Lock mbili za period moja zilirudisha `200/409`. Requests 4 za payment na 4 za expense kwa wakati mmoja zote zilipita na namba 4/4 zilikuwa tofauti; duplicate payment/expense numbers zilirudisha `201/409` na zikaacha payment moja au expense moja yenye item moja. Maombi mawili ya kulipa expense moja yalirudisha `200/409`, yakaacha payment moja na audit moja. Kipimo cha payment na expense kililinganisha StockBalance zote 3 kabla/baada na kupata hali ileile; hakukuwa na stock hasi wala invoice balance hasi. Error iliyopatikana na kurekebishwa: serializable transaction ya concurrent payment number na pay-expense ilikuwa ikirudisha serialization conflict kama `409` isiyo na sababu au `500`; retry ya bounded ya serialization conflict imeongezwa kwa transactions hizo. Build na ESLint ya mafaili yaliyobadilishwa zimepita. Logger sasa inaandika method, URL na muda pekee; health/login zilirudisha `200`, na log ya login haikuonyesha token. Fixtures za majaribio, audit logs zake, na user/role ya muda vilisafishwa.

## Mipaka inayojulikana kabla ya kuanza

- Mfumo wa sasa hauna Chart of Accounts wala journal entries za double-entry. Kwa hiyo trial balance ya sasa ni operational summary na inaweza kuwa `isBalanced=false`; hii si uthibitisho wa General Ledger iliyosawazika.
- Cash on hand inatokana na payment history iliyorekodiwa; hakuna opening cash/equity balance iliyowekwa kwenye schema ya sasa.
- Inventory valuation kwenye financial summary ni valuation ya sasa, si snapshot ya kihistoria; tumia `inventoryValueAsOf` wakati wa kuhakiki.
- Reconciled payment haiwezi kuvoidiwa; reversal workflow inahitajika kwanza.

## Rekodi ya matokeo

Kwa kila checkbox, andika: **matokeo yaliyotumwa**, **HTTP status**, **mabadiliko ya DB yaliyothibitishwa**, na **GREEN au ERROR**. Tukipata ERROR, simama hapo, rekebisha, kisha rudia kipimo hicho kabla ya next.
