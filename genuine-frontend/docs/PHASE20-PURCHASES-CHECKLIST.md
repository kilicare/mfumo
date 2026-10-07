# Phase 20 — Purchases: audit, integration map, and sequential test checklist

**Phase status:** INCOMPLETE. Sequential manual acceptance is in progress; Sections 1–5 are complete and the next unchecked test is 6.2. Open UI/API-contract and supplier-ledger gaps remain below.
**Environment:** Development database only. Never use production records for these tests.
**Checkpoint:** Section 6.1 passed on 2026-10-07: GRN creation allowed for ORDERED/PARTIALLY_RECEIVED and blocked for DRAFT/FULLY_RECEIVED/CANCELLED. Continue at 6.2; do not skip any numbered item.

## Test discipline — do not skip steps

1. Run tests in the numbered order below, one test at a time. Start at the first unchecked test in the earliest open section.
2. Mark an item `[x]` only after observing its result. Add the observed status/message/record effect next to that item or in the evidence log. A code review or a successful build is not manual-test evidence.
3. If a test fails, stop the sequence. Record the failure, fix the cause, repeat that same test, and mark it only after it passes. Do not test the next item or section while the current item is unresolved.
4. Do not skip an item because a screen/API is missing. Record it as **BLOCKED — missing implementation/contract**, and keep the sequence stopped until it is implemented or the phase scope is explicitly revised.
5. `GREEN` means the exact current test passed. It does not approve the next test, close a section, or finish the phase by itself.
6. Phase 21 must not start until every required Phase 20 item is GREEN and Phase 19 has also been resumed and closed. Phase 19 currently has unchecked tests; see [PHASE19-PRODUCTS-CHECKLIST.md](./PHASE19-PRODUCTS-CHECKLIST.md).

### Evidence log

| Test ID | Result/evidence | Date | Record IDs or redacted response |
|---|---|---|---|
| 1.1 | PASS — backend `/api/v1/health` returned HTTP 200; frontend `/login` returned HTTP 200 on repeat verification. The first frontend request returned 500, then subsequent requests returned 200. | 2026-10-06 | No credentials or tokens captured. |
| 1.2 | PASS — active workspace is `Genuine Liquor Store` (Business A); owner identity/role had previously been displayed as Admin User / Owner for this workspace. | 2026-10-06 | Workspace name only; no IDs or credentials captured. |
| 1.3 | PASS — confirmed Business A Owner role; purchases list loaded (`purchases.view`), New purchase order link is available (`purchases.create`), ordered PO exposes Cancel order (`purchases.cancel`) and supplier payment form (`payments.create`). Owner system role is configured with all current permission keys, including `purchases.edit` and `purchases.approve`; no operation was submitted. | 2026-10-06 | Existing PO `DEMO-DASH-20261002-PO-01` was ORDERED, so edit/approve controls are state-inapplicable; role policy used for those two permissions. |
| 1.4 | PASS — purchase form loaded supplier `Test Supplier Ltd`, location `Main Warehouse`, and products `PH19 Decimal Retest Updated`, `BEER`, `Coca Cola 500ml`; payment form exposed Credit, Halopesa, Airtel Money, Tigo Pesa, M-Pesa, Bank Transfer and Cash. Supporting options are available under the Business A Owner account. | 2026-10-06 | No draft submitted. |
| 1.5 | PASS — Business A options recorded: active supplier Test Supplier Ltd (`SUP-00001`); location Main Warehouse (`MAIN`); products PH19 Decimal Retest Updated (`PH19-DECIMAL-RETEST-20261006`), BEER (`wtyuiop`), Coca Cola 500ml (`BEV-001`); payment methods Credit, Halopesa, Airtel Money, Tigo Pesa, M-Pesa, Bank Transfer, Cash; currency TZS. | 2026-10-06 | Payment method is selected when recording a PO payment, not while creating the purchase order. No draft submitted. |
| 1.6 | PASS — baseline captured before creating any Phase 20 order: Test Supplier Ltd purchased TZS 15,000 (1 ORDERED PO), paid TZS 0, outstanding/statement due TZS 15,000 (opening balance TZS 0); Main Warehouse stock: Coca Cola 500ml 87, BEER 0, PH19 Decimal Retest Updated 0; inventory movements 2; POs 1; payments 3 total (all RECORDED; supplier payments 0); accounting period 2026-10 OPEN (2026-09-30 to 2026-10-30); dashboard period Oct 1–6: inventory value TZS 130,500 and low-stock 2. Dashboard financial baseline: revenue TZS 26,000; expenses TZS 2,500; net profit TZS 4,000; cash TZS 19,500; receivables TZS 4,000; payables TZS 15,000. | 2026-10-06 | Read-only local development DB query and visible dashboard evidence; no data changed. Supplier UI is marked Soon, so statement due was reconciled from the single ordered PO, zero opening balance, and zero supplier payments. |
| 1.7 | PASS — separate Business B is `dagaaa`; existing active product `PH19 Tenant Isolation Product` (`PH19-TENANT-B-20261006`); created active supplier `PH20 Test Supplier B` (`PH20-B-SUP-001`) and active location `PH20 Test Location B` (`PH20-B-LOC-001`) in the verified local development DB. No credentials/tokens were copied. | 2026-10-06 | Fixtures created because Business B had no supplier or location; all inserts used a transaction and `PH20-` identifiers. |
| 1.8 | PASS — Codex in-app browser viewport 609×524 CSS px at DPR 1.5; no explicit mobile emulation. Console: 0 warnings/errors captured. Network: dashboard and its API-backed metrics/stock/activity content rendered, no visible failed-request state; no authorization headers, cookies or personal data were captured. | 2026-10-06 | Browser log API exposes console only; network status recorded from successful page/API content rendering, not per-request DevTools export. |
| 2.1 | PASS — controller and frontend API client agree on purchase-order routes: `POST /api/v1/purchases/orders` (201); `GET /api/v1/purchases/orders` and `GET /api/v1/purchases/orders/:id` (200); both `PUT` and `PATCH /api/v1/purchases/orders/:id` (200); `POST /api/v1/purchases/orders/:id/approve` and `/cancel` (200). Global prefix is `/api/v1`; both update verbs map to the same service method. | 2026-10-06 | Static source inspection only; no HTTP request or workflow mutation sent. Controller: `genuine-backend/src/purchases/purchase.controller.ts`; client: `genuine-frontend/lib/api/purchases.ts`. |
| 2.2 | PASS — controller routes verified: `POST /api/v1/purchases/grn` (201); `GET /api/v1/purchases/grn` and `/grn/:id` (200); `PUT/PATCH /api/v1/purchases/grn/:id` (200); `POST /api/v1/purchases/grn/:id/accept` and `/reject` (200). Frontend client has list/create/accept/reject plus detail/update wrappers; PO detail UI now exposes edit for `RECEIVED` GRNs to users with `purchases.edit`. | 2026-10-06 | Static route inspection and frontend type-check passed; no GRN created or changed and edit UI has not yet had manual browser verification. Controller: `genuine-backend/src/purchases/purchase.controller.ts`; client: `genuine-frontend/lib/api/purchases.ts`. |
| 2.3 | PASS — controller routes verified: `POST /api/v1/purchases/returns` (201); `GET /api/v1/purchases/returns` and `/returns/:id` (200); `POST /api/v1/purchases/returns/:id/approve` and `/reject` (201 default POST status). Added missing typed frontend detail wrapper `purchaseReturn(id)`. | 2026-10-06 | Static source inspection; no return created or changed. Frontend type-check passed after adding wrapper; no standalone return detail UI is exposed. Controller: `genuine-backend/src/purchases/purchase.controller.ts`; client: `genuine-frontend/lib/api/purchases.ts`. |
| 2.4 | PASS — `POST /api/v1/purchases/orders/:id/payments` explicitly requires `payments.create` (not `purchases.create`); frontend payment form is gated by `payments.create` and submits through `purchasesAPI.payment`. | 2026-10-06 | Controller, permission decorator, frontend client and PO detail UI inspected. No payment request submitted. |
| 2.5 | PASS — backend route decorators and frontend action gates align: PO/GRN/return create=`purchases.create`; all reads=`purchases.view`; PO/GRN update=`purchases.edit`; PO/GRN/return approve or reject=`purchases.approve`; PO cancel=`purchases.cancel`; PO supplier payment=`payments.create`. | 2026-10-06 | Static inspection of controller decorators and purchase UI permission checks. No workflow action submitted. |
| 2.6 | PASS — no PO delete/close action or supplier-payment void/edit action is claimed by the Purchases UI. PO delete/close routes are absent. Payment edit route is absent; generic `POST /api/v1/payments/:id/void` does support payment rows with `poId` and requires `payments.create`, but Purchases UI exposes no void action. | 2026-10-06 | Static inspection only. Generic void permission grouping is recorded for explicit review; no payment was voided. |
| 2.7 | PASS — 21 unauthenticated requests across PO, GRN, return and payment-void route families all returned HTTP 401; no stack/Prisma/SQL/auth/token/secret/password diagnostic matched the returned body. | 2026-10-06 | Direct requests to local development API used no Authorization header or browser cookies, dummy UUIDs and empty JSON bodies for mutation verbs. No mutation reached a handler. |
| 2.8 | PARTIAL — backend returned matching 403 for the six tested actions (`purchases.view/create/edit/approve/cancel`, `payments.create`) using an active restricted PHASE19 role; frontend source contains corresponding permission gates. | 2026-10-06 | This test role lacks all six permissions, so checks are not isolated one-permission-at-a-time. The matching UI states were not dynamically verified; current browser is signed into Business B Owner and no isolated browser session is available. No tick until isolated permission-role UI checks are observed. |
| 1.9 | PASS — `NODE_ENV=development`, DB host `localhost`, database `genuine`; proposed PO number `PH20-PO-20261006-001` is unused; Business A has no pre-existing PH20 PO/supplier/location/product references and no supplier payments. | 2026-10-06 | No real supplier payment or production endpoint used. |

## Audit results — verified by source review

### Implemented and build-verified

- [x] Purchases sidebar route and responsive PO/GRN/return landing screens exist.
- [x] API adapter uses actual Nest contract names and routes, rather than the mismatched sample fields.
- [x] PO create/detail/list, approve/cancel, payment; GRN create/list/detail/update/accept/reject; return create/list/detail/approve/reject exist in backend.
- [x] Purchase-order response now exposes accepted quantity and expiry tracking; outstanding quantity is ordered minus accepted, not increased by returns.
- [x] GRN create/update reject zero received quantity and serialize accepted-quantity reservations per PO.
- [x] Return creation serializes return reservations per PO; return approval checks accounting period; reject is conditional; totals round to cents.
- [x] Frontend type-check passed (`pnpm type-check`).
- [x] Frontend production build passed (`pnpm build`).
- [x] Backend Nest build passed.

### Open implementation/contract gaps — not GREEN

- **OPEN GAP — PO edit UI:** Backend supports updating DRAFT POs (`PUT/PATCH /purchases/orders/:id`, `purchases.edit`), but no edit screen/action is wired. Add it or explicitly remove update from Phase 20 scope before closing.
- **OPEN GAP — inactive references:** PO create/update scopes supplier, location and product by business, but does not consistently require active references. UI filtering is not server-side integrity. Validate active supplier/location/product or define historical-reference policy, then test direct API calls.
- **OPEN GAP — orphan permission:** `purchases.delete` is seeded, but there is no PO delete endpoint. Do not display/test delete as implemented. Decide on a safe DRAFT-only endpoint or remove the unused permission; never delete an order with operational history.
- **OPEN GAP — list filters:** Backend supports supplier/date filters; frontend exposes search/status only. Add supplier/date controls or revise the promised deliverable explicitly.
- **OPEN GAP — GRN/return fields:** Backend accepts GRN date, vehicle, driver, waybill, notes and per-line notes; UI does not expose all of these. Return API supports multiple lines/notes; current UI creates one line and omits notes. Resolve before calling workflows complete.
- **OPEN GAP — GRN/return detail:** Landing lists route records to the PO; verify whether that satisfies the workflow or implement direct detail views.
- **OPEN GAP — list scale:** There is no purchases summary/report endpoint and GRN/return lists are unpaginated. Do not invent totals or claim large-volume scalability; add server pagination/summary if the intended data volume requires it.
- **OPEN GAP — supplier balances:** Supplier aggregate includes DRAFT/CANCELLED POs and VOIDED payments; supplier statement includes all PO/payment statuses and omits approved returns as credits. Reconcile supplier balance, statement and payment screens before GREEN.
- **OPEN GAP — return-to-finance:** Return approval writes stock movement but no supplier credit/payment/ledger adjustment in this module. Confirm the finance workflow and verify approved return updates supplier due exactly once.
- **OPEN GAP — inventory costing:** GRN acceptance uses PO net line cost per ordered unit; shipping/tax allocation is not included. Confirm costing policy, weighted-average valuation and dashboard inventory value before approving.
- **OPEN GAP — audit atomicity:** Audit records are written after mutations and failures are swallowed. Decide/test whether audit failure must roll back or return visible failure; do not claim audit consistency from a build.
- **OPEN GAP — CLOSED status:** It is declared but has no close endpoint/action. Do not present a close transition; define it only if the phase requires it.

## 1. Environment, access, and baseline — finish this section first

- [x] 1.1 Confirm backend `GET /api/v1/health` = 200 and frontend login responds before sign-in. Evidence: backend 200; frontend 200 on repeat after an initial 500. (2026-10-06)
- [x] 1.2 Sign in as Business A owner; record redacted business name/ID and user role. Do not paste tokens/passwords. Evidence: active workspace is Genuine Liquor Store; owner identity/role was previously displayed as Admin User / Owner. (2026-10-06)
- [x] 1.3 Confirm Business A permissions individually: `purchases.view`, `purchases.create`, `purchases.edit`, `purchases.approve`, `purchases.cancel`, `payments.create`. Evidence: purchases list and create link loaded; Cancel order and supplier payment form are present on existing ORDERED PO; Owner role grants the full permission set including edit/approve. No mutation submitted. (2026-10-06)
- [x] 1.4 Confirm supporting permissions: `suppliers.view`, `products.view`, `settings.view`; record which are needed to populate supplier/product/location/payment-method options. Evidence: supplier and product choices loaded in the form; Main Warehouse location loaded; payment-method choices appeared on the existing PO. (2026-10-06)
- [x] 1.5 Record Business A active suppliers, active locations, active products, active payment methods and currency. Evidence: options recorded from the new PO form and existing PO payment form. (2026-10-06)
- [x] 1.6 Record a pre-test baseline: supplier total purchased/paid/outstanding/statement, location stock for chosen products, inventory movement count, PO count, payment count, accounting period state, dashboard inventory value and low-stock count. Evidence is in the evidence log. (2026-10-06)
- [x] 1.7 Identify separate Business B and one active supplier/product/location there. Keep both tenants' credentials/tokens private. Evidence: Business B `dagaaa`; active product PH19 Tenant Isolation Product; added PH20 Test Supplier B and PH20 Test Location B because those active references were absent. (2026-10-06)
- [x] 1.8 Record browser viewport/device, console and network status; redact Authorization headers, cookies and personal data. Evidence: viewport 609×524 CSS px at DPR 1.5; zero console warnings/errors; dashboard/API-backed content rendered and no request failure state visible. (2026-10-06)
- [x] 1.9 Verify database is development-only and test references are unique (prefix `PH20-`, no production-like real supplier payment). Evidence: `NODE_ENV=development`, DB is localhost/genuine; proposed `PH20-PO-20261006-001` is unused; Business A has no existing PH20 test references or supplier payments. (2026-10-06)

## 2. Contract and permission matrix — no workflow tests until this section is resolved

- [x] 2.1 Verify routes/methods against controller: `POST/GET /purchases/orders`, `GET /purchases/orders/:id`, `PUT/PATCH /purchases/orders/:id`, `POST approve`, `POST cancel`. Evidence: routes and response statuses verified in controller, frontend client, and global `/api/v1` prefix; source inspection only, no HTTP request or mutation. (2026-10-06)
- [x] 2.2 Verify other controller routes: `POST/GET /purchases/grn`, `GET /purchases/grn/:id`, `PUT/PATCH /purchases/grn/:id`, `POST accept/reject`. Evidence: controller routes/status codes and `/api/v1` prefix verified; typed frontend detail/update wrappers and an edit control for `RECEIVED` GRNs (permission `purchases.edit`) added; TypeScript check passed. Manual browser verification remains for the later UI test section. (2026-10-06)
- [x] 2.3 Verify return routes: `POST/GET /purchases/returns`, `GET /purchases/returns/:id`, `POST approve/reject`. Evidence: controller routes/status codes and `/api/v1` prefix verified; typed frontend `purchaseReturn(id)` detail wrapper added. Static inspection only; no return created or changed. (2026-10-06)
- [x] 2.4 Verify PO payment route: `POST /purchases/orders/:id/payments`; confirm it requires `payments.create`, not only `purchases.create`. Evidence: controller and frontend form both require `payments.create`; no payment submitted. (2026-10-06)
- [x] 2.5 Verify route permission mapping: create PO/GRN/return=`purchases.create`; read=`purchases.view`; update=`purchases.edit`; approve GRN/PO/return=`purchases.approve`; cancel PO=`purchases.cancel`. Evidence: controller permission decorators and frontend UI gates match across the mapped actions; supplier payments separately use `payments.create`. Static inspection only. (2026-10-06)
- [x] 2.6 Verify no PO delete, no PO close, no supplier-payment void/edit route is claimed by UI. Evidence: Purchases UI claims none; PO delete/close and payment edit routes absent. Generic `POST /api/v1/payments/:id/void` can void a PO-linked supplier payment and requires `payments.create`; it is not exposed in Purchases UI and is recorded for explicit permission review. Static inspection only; no payment voided. (2026-10-06)
- [x] 2.7 With no token, call each protected endpoint family and confirm 401 without leaking stack/SQL/token. Evidence: all 21 requests across PO, GRN, returns and generic payment void returned 401; response bodies had no matched stack/Prisma/SQL/auth/token/secret/password diagnostics. No token/cookies used; dummy ID and empty bodies; no handler mutation. (2026-10-06)
- [~] 2.8 WAIVED per user's explicit instruction to proceed to Section 3; not a PASS. Partial evidence only: 6 backend actions returned 403 naming the expected permission using a restricted role and frontend source gates exist. Isolated one-permission-at-a-time roles and observed UI gate states remain unverified. (2026-10-06)
- [x] 2.9 Confirm query/response names: PO `orderDate/subtotal/totalAmount`; GRN `purchaseOrderId`, `purchaseOrderItemId`, `receivedQuantity/acceptedQuantity/rejectedQuantity/damageQuantity`; return uses `purchaseOrderItemId`; sample-only `poId`, `poDate`, `subtotalAmount` are not sent by the typed frontend. Evidence: frontend API types/forms and backend DTO/response mapping inspected; field names align. Static source check only; no PO/GRN/return mutation sent. (2026-10-06)

## 3. Purchase-order list, filters, pagination, and read isolation

> **Ready for manual testing (2026-10-06):** prepared 30 Business A list/filter fixture POs plus the existing baseline PO (31 total), an inactive supplier and an additional active supplier, and one Business B PO for isolation checks. This is test-data setup only: none of 3.1–3.10 is marked complete. The synthetic status rows intentionally have no GRN/payment/return side effects; use `PH20-S3-DETAIL-001` for the consistent detail reconciliation in 3.8. `PH20-S3-DETAIL-001` is DRAFT: subtotal 16,697.25 + shipping 500 + tax 429.75 = total 17,627.00 TZS; 2 items; accepted/received/returned/paid are zero; outstanding quantities are 10 Coca Cola and 0.25 BEER; balance is 17,627.00 TZS. Account A's 31 rows should produce page 1 with 20 and page 2 with 11 at default limit. A separate Account A QA editor with only `purchases.view` and `purchases.edit` is available for 3.10; credentials were provided in the active chat and are not stored in this checklist.

- [x] 3.1 List with no filters; compare returned data, `total`, `page`, `limit` with database/UI row count. Evidence (2026-10-06, Business A): live Purchases list had blank search and All statuses, showed 20 PO rows and `Showing 1–20 of 31`, page `1 / 2`; read-only DB check confirmed 31 total and 11 rows on page 2 at limit 20. No filter applied.
- [x] 3.2 Search exact/partial PO number and supplier name; test case variation, blank query and whitespace. Exact/partial PO and supplier searches returned expected records; case-insensitive, blank, and whitespace-only searches also passed. User-observed results (2026-10-06).
  - [x] Exact PO-number search: `PH20-S3-DETAIL-001` returned only that PO, with 2 items and TZS 17,627.00. User-observed UI result (2026-10-06).
  - [x] Partial PO-number search: `PH20-S3-ORD` returned the expected 6 purchase orders. User-observed UI result (2026-10-06).
  - [x] Exact supplier-name search: `PH20 S3 Supplier Alpha` returned 11 matching POs (`Showing 1–11 of 11`). User-observed UI result (2026-10-06).
  - [x] Partial supplier-name search: `Supplier Alp` returned 11 matching POs (`Showing 1–11 of 11`). User-observed UI result (2026-10-06).
  - [x] Case variation: lowercase supplier search `supplier alpha` still returned 11 matching POs. User-observed UI result (2026-10-06).
  - [x] Blank query with `All statuses`: user confirmed the unfiltered state is green (2026-10-06).
  - [x] Whitespace-only query: user confirmed the whitespace search state is green; frontend trims the query before sending it (2026-10-06).
- [x] 3.3 Filter each status: DRAFT, ORDERED, PARTIALLY_RECEIVED, FULLY_RECEIVED, CLOSED, CANCELLED; verify unsupported status fails safely. All six filters matched fixture counts; invalid status was rejected by DTO validation (2026-10-06).
  - [x] `DRAFT`: user confirmed the filtered result is green; fixture expectation is 5 rows (2026-10-06).
  - [x] `ORDERED`: UI returned 7 rows: 6 Phase 20 fixtures plus baseline `DEMO-DASH-20261002-PO-01`. User-observed result (2026-10-06); expected total corrected to include the baseline row.
  - [x] `PARTIALLY_RECEIVED`: UI returned 5 rows, matching the fixture expectation. User-observed result (2026-10-06).
  - [x] `FULLY_RECEIVED`: UI returned 5 fixture rows. The existing baseline PO is `ORDERED`, so it is correctly absent from this filter. User-observed result (2026-10-06); expectation corrected.
  - [x] `CLOSED`: UI returned 5 rows, matching fixture expectation. User-observed result (2026-10-06).
  - [x] `CANCELLED`: user confirmed the filtered result is green; fixture expectation is 4 rows (2026-10-06).
  - [x] Unsupported status: class-validator runtime check accepted `DRAFT` and rejected `NOT_A_STATUS` on `status`; global Nest validation pipe rejects the request before the service query. Replaced `@IsEnum(array)` with `@IsIn(array)` so the error lists valid statuses. No database query/mutation was made (2026-10-06).
  - Note: after these checks, the user cancelled baseline `DEMO-DASH-20261002-PO-01`. Read-only DB verification confirmed current counts ORDERED 6 and CANCELLED 5; earlier observations above are historical and remain valid for when they were recorded.
- [x] 3.4 Filter by supplier; test valid, inactive, nonexistent and Business B supplier IDs. Dropdown is tenant-scoped to purchase orders accessible to the current business. Active `PH20 S3 Supplier Alpha` returned 11 in UI; inactive supplier returned 5 in UI; valid API filters returned 200/11 and 200/5; nonexistent and Business B supplier IDs returned 200/0 and 200/0. Business B rows were not disclosed (2026-10-06).
- [x] 3.5 Filter by dateFrom/dateTo at exact boundaries, same-day range, month/year rollover, invalid date, dateFrom after dateTo; compare UTC inclusive calendar-day behavior.
  - [x] Same-day range `2026-10-01` to `2026-10-01` returned exactly `PH20-S3-DRAFT-016` in the UI (user-observed 2026-10-06); API returned 200 with one matching row. Confirms inclusive same-day behavior for this record.
  - [x] Reversed range showed `Start date must be on or before end date.` and did not return stale rows (user-observed 2026-10-06).
  - [x] Inclusive lower boundary: `2026-10-01T00:00:00.000Z` returned `PH20-S3-DRAFT-016`; inclusive upper boundary: same-day range `2026-10-02` returned `PH20-S3-PART-017` at `2026-10-02T23:59:59.999Z` plus `DEMO-DASH-20261002-PO-01` (2 rows; user-observed 2026-10-06).
  - [x] Range across year rollover `2025-12-31` to `2026-01-01` returned the expected two records `PH20-S3-CANCEL-008` and `PH20-S3-DRAFT-009` in UI (user confirmed green 2026-10-06).
  - [x] API rejected malformed `dateFrom=not-a-date` (400), nonexistent `2026-02-30` (400), and reversed `2026-10-03` to `2026-10-02` (400). UI date picker prevents choosing an invalid calendar date (2026-10-06).
- [x] 3.6 Sort by poNumber, totalAmount, orderDate, createdAt ascending/descending; unsupported sort field must not cause server failure.
  - [x] API returned all 31 rows in correct ascending and descending order for each supported field (`poNumber`, `totalAmount`, `orderDate`, `createdAt`); every order verified monotonic by the requested field (2026-10-06).
  - [x] UI `PO number` / `Ascending` started with `DEMO-DASH-20261002-PO-01` and displayed 31 matches over 2 pages (user-observed 2026-10-06).
  - [x] UI `PO number` / `Descending` started with `PH20-S3-PART-028` (user-observed 2026-10-06).
  - [x] UI `Total amount` / `Ascending` started with `PH20-S3-ORD-002` (TZS 1,500.00; user-confirmed green 2026-10-06).
  - [x] UI `Total amount` / `Descending` started with `PH20-S3-CLOSED-030` (TZS 43,500.00; user-confirmed green 2026-10-06).
  - [x] UI `Order date` / `Ascending` started with `PH20-S3-CANCEL-008`; its UTC date is 2025-12-31, displayed as 1/1/2026 in the browser's local timezone (user-observed 2026-10-06).
  - [x] UI `Order date` / `Descending` started with `PH20-S3-PART-017` dated 10/3/2026 (user-confirmed green 2026-10-06).
  - [x] UI `Date created` / `Ascending` passed (user-confirmed green 2026-10-06).
  - [x] UI `Date created` / `Descending` returned `PH20-S3-CLOSED-030` with TZS 43,500.00 (user-observed 2026-10-06).
  - [x] UI confirmed all eight supported field/direction combinations in sequence; API monotonic-order checks passed for all 31 results per combination. Unsupported sort query did not crash the running API (200 fallback); compiled DTO now validates unsupported field/direction and runtime class-validator check rejected both safely. Backend build and frontend TypeScript check passed (2026-10-06).
- [x] 3.7 Test page 1, final page, empty page, limit minimum/default/100, zero, negative, decimal, non-number and limit above 100; confirm response clamps/rejects as designed.
  - [x] UI page 1 displayed 20 of 31 purchase orders and page indicator `1 / 2` (user-observed 2026-10-06).
  - [x] UI final page displayed 11 records, `Showing 21–31 of 31` (user-confirmed green 2026-10-06).
  - [x] API page 1 returned 20/31, final page 2 returned 11/31, out-of-range page 99 returned 0/31. Limits: omitted/default=20; min=1; 100 capped at 100; zero uses default 20; negative clamps to 1; 2.9 floors to 2; non-number rejected 400; 150 capped at 100. All requests tenant-scoped and returned expected status/data counts (2026-10-06).
- [x] 3.8 Read valid `PH20-S3-DETAIL-001`: supplier Test Supplier Ltd, Main Warehouse, DRAFT; Coca Cola 500ml 10 × 1,500 = 15,000; BEER 0.25 × 6,789 = 1,697.25; subtotal 16,697.25 + shipping 500 + tax 429.75 = total/balance 17,627; paid 0; accepted 0/outstanding ordered quantities; no GRN, return or payment. All values reconciled with UI (user-observed 2026-10-06).
- [x] 3.9 As Business A, nonexistent PO and a PO belonging to Business B both returned `404 Purchase order not found`; no other-business content was disclosed (API-observed 2026-10-06).
- [x] 3.10 Second user (`PH20 Editor`) changed the detail fixture's note; user clicked Refresh and saw the update, while total/balance remained TZS 17,627.00. The original note was restored via editor API and verified (2026-10-06).

## 4. Create and edit draft PO — finish create cases before edit cases

### Create

- [x] 4.1 Created valid draft `PO-202610-00001` for Test Supplier Ltd / Main Warehouse / Coca Cola 500ml, qty 2 × TZS 1,500, zero shipping/tax. Persisted detail showed DRAFT, total and balance TZS 3,000.00 (user-observed 2026-10-06).
- [x] 4.2 Created `PO-202610-00002` with Coca Cola 500ml twice as separate lines (qty 2 and qty 1); both persisted distinctly and summed to subtotal/total/balance TZS 4,500.00 (user-observed 2026-10-06).
- [x] 4.3 Created `PO-202610-00003`: Coca Cola 2.5 × 1,500.25 − 250.25 rounded to 3,500.38; BEER 0.5 × 6,789.10 = 3,394.55; subtotal 6,894.93 + shipping 25.25 + fixed tax 79.82 = 7,000.00. UI detail matched each line and total (user-observed 2026-10-06).
- [x] 4.4 Verify no tax and no shipping, taxAmount, taxPercentage, and conflicting taxAmount + taxPercentage inputs; document the actual contract and prevent double tax.
  - [x] No tax/no shipping preserved total=subtotal in 4.1 and 4.2; fixed `taxAmount` and shipping amounts reconciled in 4.3.
  - [x] Backend DTO runtime validation accepts amount-only and percentage-only; rejects both together with `Provide either taxAmount or taxPercentage, not both`. Service has a second guard; form now has a single exclusive tax basis selector (2026-10-06).
  - [x] Percentage-only UI draft `PO-202610-00004`: subtotal TZS 3,000 × 5% = tax TZS 150; persisted total/balance TZS 3,150 (user-observed 2026-10-06). Fixed amount or percentage is selected exclusively; API DTO rejects conflicting values (verified runtime); no-tax/no-shipping cases 4.1/4.2 and fixed tax amount case 4.3 passed.
- [x] 4.5 Verify optional orderDate defaults correctly; expected delivery same day/later accepted; earlier date rejected; timezone does not shift displayed date.
  - [x] Drafts 4.1–4.4 omitted orderDate and persisted/displayed the current date (10/6/2026) as default.
  - [x] Frontend date minimum and backend service/DTO reject expected delivery before order date; DTO runtime check accepted same-day/later dates and rejected an earlier date (2026-10-06).
  - [x] UI same-day test `PO-202610-00005` displays `Ordered 10/7/2026` and `Expected delivery 10/7/2026`, matching selected dates with no local-timezone day shift (user-observed 2026-10-06).
  - [x] UI later date `PO-202610-00006` displays Ordered 10/7/2026 and Expected delivery 10/8/2026 exactly as selected (user-observed 2026-10-06).
- [x] 4.6 `PO-202610-00007` persisted/rendered reference `PH20-REF-006 <i>literal reference</i>` and note `PH20 note <b>literal text</b>` as literal text, not interpreted HTML (user-observed 2026-10-06).
- [x] 4.7 Reject missing supplier/location/items/product, zero/negative quantity, negative price/discount, discount above gross, NaN/Infinity, malformed date, excessive decimals and oversized text.
  - [x] Backend DTO runtime validation accepts a valid minimal order and rejects missing supplier/location/items/product, zero/negative quantity, negative price/discount, discount above gross, NaN/Infinity, malformed date, >2 decimal places for quantity/price/discount/tax, and oversized notes/reference. Service retains its discount-vs-gross guard. Backend Nest build and frontend TypeScript check passed (2026-10-06).
  - [x] UI: attempted Save draft with Supplier left at “Choose supplier”; browser rejected the required field and no order was created (user-observed 2026-10-06).
  - [x] UI: attempted Save draft with Receive into location left at “Choose location”; browser rejected the required field and no order was created (user-observed 2026-10-06).
  - [x] UI: attempted Save draft with Product left at “Choose active product”; browser rejected the required field and no order was created (user-observed 2026-10-06).
  - [x] UI has no way to remove the final item row; empty `items` array is rejected by backend DTO runtime validation (2026-10-06).
  - [x] UI: quantity `0` was rejected, displayed an inline message, kept focus on the invalid Quantity field, and created no order (user-observed 2026-10-06).
  - [x] UI: negative quantity was rejected with an inline error and focus on Quantity; no order was created (user-observed 2026-10-06).
  - [x] UI: negative unit price was rejected with an inline error and focus on Unit price; no order was created (user-observed 2026-10-06).
  - [x] UI: negative discount was rejected with an inline error and focus on Discount; no order was created (user-observed 2026-10-06).
  - [x] UI: discount above line gross was rejected with a specific inline error and focus on Discount; no order was created (user-observed 2026-10-06).
  - [x] UI: quantity with three decimal places was rejected with “Use no more than 2 decimal places”; no order was created (user-observed 2026-10-06).
  - [x] UI: unit price with three decimal places was rejected with “Use no more than 2 decimal places”; no order was created (user-observed 2026-10-06).
  - [x] UI: discount with three decimal places was rejected with “Use no more than 2 decimal places”; no order was created (user-observed 2026-10-06).
  - [x] UI: shipping cost with three decimal places was rejected with an inline precision message and focus; no order was created (user-observed 2026-10-06).
  - [x] UI: fixed tax amount with three decimal places was rejected with an inline precision message and focus; no order was created (user-observed 2026-10-06).
  - [x] UI: tax percentage with three decimal places was rejected with an inline precision message and focus; no order was created (user-observed 2026-10-06).
  - [x] UI: reference number counter stopped at `120/120`; `maxLength` prevented another character (user-observed 2026-10-06).
  - [x] UI: notes counter stopped at `1000/1000`; `maxLength` prevented another character (user-observed 2026-10-06).
  - [x] Manual UI checks: missing supplier/location/product; quantity zero/negative; negative price/discount; discount above gross; >2 decimal quantity, price, discount, shipping, tax amount/percentage; reference `120/120` and notes `1000/1000` limits. Each rejected submission stayed on the form and created no PO (user-observed 2026-10-06).
- [x] 4.8 Reject foreign supplier/location/product and stale IDs server-side; separately reject inactive supplier/location/product. Create checks scope every lookup to Business A and require active status. Service was exercised against real local Business A/B fixture records: foreign and stale supplier/location/product IDs, inactive supplier/product, plus isolated inactive QA location all returned 404 before transaction; no PO/item mutation occurred. Backend build passed (2026-10-06).
- [x] 4.9 Duplicate custom PO `PH20-S3-DETAIL-001` returned 409 and left PO count unchanged. Two concurrent generated creates returned distinct PO numbers (`PO-202610-00008` and `PO-202610-00009`); both persisted as DRAFT with no linked stock movement or payment. QA drafts are labeled in notes for identification (service + real local DB, 2026-10-06).
- [x] 4.10 Simulate network timeout after create then refresh; establish whether retry duplicates a PO. Record idempotency behavior; no false success toast.
  - [x] Added per-request idempotency key saved in `sessionStorage` for refresh-safe retries; backend stores a business-scoped unique key and request fingerprint. Same-key/same-body replay returns original PO; same key with changed body returns 409; no success toast until server confirms (2026-10-06).
  - [x] Real local DB service checks: retry after persisted create returned the same PO; concurrent same-key requests converged on one PO; exactly one record persisted in both cases. Migration applied and backend/frontend checks passed (2026-10-06).
  - [x] Browser network-timeout/refresh simulation passed; retry returned to PO `PO-202610-00012` and showed success only after server confirmation (user-observed 2026-10-07).
  - [x] Database confirms one DRAFT with note `PH20-RETRY-TEST-20261006`, an idempotency key, and exactly one record for that key and note (2026-10-07).
- [x] 4.11 Verify creating a DRAFT does not add stock, inventory movement, payable payment, or supplier-confirmed purchase notification. The user-created retry draft `PO-202610-00012` remained `DRAFT`; its item/location StockBalance was 87; DB query found 0 InventoryMovement referencing its PO id, 0 Payment rows with its `poId`, and 0 Notifications with `referenceType=PurchaseOrder` and that id. Create path inserts PO + lines and CREATE audit only; supplier notification is published on approval, not draft creation (2026-10-07).
- [x] 4.12 Verify PO CREATE audit actor/business/time and no audit success when create fails. DB audit row for `PO-202610-00012` has action `CREATE`, the same `userId` as `createdBy`, and timestamp 2026-10-07T04:27:23.094Z (7 ms after PO creation at 04:27:23.087Z); query was scoped to the PO business. Failed duplicate-create check in 4.9 returned 409 with no PO persisted; service throws on transaction failure before reaching the post-transaction CREATE audit call (2026-10-07).

### Draft update

- [x] 4.13 Added the missing draft edit path: a DRAFT-only “Edit draft” action on order detail opens `/dashboard/purchases/orders/:id/edit`, preloads supplier/location/items/prices/expected date/shipping/tax/reference/notes, and saves through the existing PATCH endpoint. Order date and PO number are read-only; backend remains authoritative for rejecting non-DRAFT changes. Frontend type check passed and user confirmed browser edit + unchanged save returned successfully (2026-10-07).
- [x] 4.14 Updated each draft-edit field independently and confirmed totals/persistence; explicit clears and omitted-field PATCH semantics verified (2026-10-07).
  - [x] Expected delivery set alone to 2026-10-08 and persisted on `PO-202610-00009`; order date and line/total values stayed unchanged (user-observed 2026-10-07).
  - [x] Shipping cost alone set to TZS 25.50; persisted subtotal TZS 100.00, shipping TZS 25.50, total/balance TZS 125.50; expected date stayed 2026-10-08 (user-observed 2026-10-07).
  - [x] Tax amount alone set to TZS 8.25; total/balance became TZS 133.75 (= subtotal 100 + shipping 25.50 + tax 8.25) (user-observed 2026-10-07).
  - [x] Reference number alone set to `PH20-EDIT-REF-001` and appeared in PO detail; total stayed TZS 133.75 (user-observed 2026-10-07).
  - [x] Notes alone set to `PH20 draft edit notes 2026-10-07`; note appeared in detail and total stayed TZS 133.75 (user-observed 2026-10-07).
  - [x] Supplier alone changed from PH20 S3 Supplier Alpha to Test Supplier Ltd; Main Warehouse, items and total TZS 133.75 remained unchanged (user-observed 2026-10-07).
  - [x] Location alone changed from Main Warehouse to isolated QA location `PH20 Edit QA Location` (`PH20-EDIT-LOC-20261007`); no stock was present there, and supplier/items/total remained unchanged (user-observed 2026-10-07).
  - [x] Item quantity alone changed from 1 to 2; Coca Cola line/subtotal became TZS 200.00 and total/balance TZS 233.75; supplier, location, unit price, discount, shipping, tax, reference and notes remained unchanged (user-observed 2026-10-07).
  - [x] Item unit price alone changed to TZS 125.00 at quantity 2; line/subtotal became TZS 250.00 and total/balance TZS 283.75 (user-confirmed green 2026-10-07).
  - [x] Item discount alone changed to TZS 10.00; line/subtotal became TZS 240.00 and total/balance TZS 273.75. DB confirms quantity 2 and unit price TZS 125.00 were preserved (user-observed + DB verified 2026-10-07).
  - [x] Cleared expected delivery by saving the field empty; detail no longer shows a date. DB confirms `expectedDeliveryDate=null`; reference, notes, item values and total TZS 273.75 stayed unchanged (2026-10-07).
  - [x] Cleared reference number and resaved after backend restart; DB confirms `referenceNumber=null`. Expected date stayed null; notes and total TZS 273.75 stayed unchanged (2026-10-07).
  - [x] Explicitly clear notes; detail hides them and DB stores `null`, while tax/reference/date and total are unchanged (user-observed + DB verified 2026-10-07).
  - [x] PATCH omitted-field preservation: direct service update sent only `shippingCost=25.5`; existing tax, item set, quantity/price/discount, subtotal, and cleared date/reference/notes all remained unchanged; total remained TZS 273.75 (2026-10-07).
- [x] 4.15 Replaced the entire PO item set with only BEER (qty 1, price TZS 75, discount 0); detail and DB matched subtotal TZS 75, shipping TZS 25.50, tax TZS 8.25, total/balance TZS 108.75. Supplier, QA location, cleared date/reference/notes persisted; earlier independent field checks cover discount/shipping/tax (user-observed + DB verified 2026-10-07).
- [x] 4.16 Invalid product, inactive supplier/location, negative quantity/price, excessive discount and empty items were all rejected without mutating the DRAFT PO. Product/supplier/location/negative values/discount were verified against PurchaseService and DB snapshots; inline UI checks covered negative quantity/price and discount; actual `createValidationPipe()` rejected `items: []` with HTTP 400 `items must contain at least 1 elements` and DB retained the one BEER line/total TZS 108.75 (2026-10-07).
  - [x] Invalid/nonexistent product ID rejected with “not found or inactive”; PO status, total TZS 108.75 and BEER line remained unchanged (direct PurchaseService + DB comparison, 2026-10-07).
  - [x] Same-business inactive fixture supplier rejected with “Supplier not found or inactive”; PO supplier, status, amount and `updatedAt` were unchanged (direct PurchaseService + DB comparison, 2026-10-07).
  - [x] Same-business inactive fixture location `PH20-S4-INACTIVE` rejected with “Location not found or inactive”; PO location, status, total and `updatedAt` stayed unchanged (direct PurchaseService + DB comparison, 2026-10-07).
  - [x] Quantity `-1` was blocked in the edit form with inline “Enter a value of at least 0.01.” focus stayed at the Quantity field; DB remained quantity 1/total TZS 108.75. Direct service attempt also rejected and left PO unchanged (2026-10-07).
  - [x] Unit price `-1` was blocked with inline minimum-value message and focus on Unit price; direct service rejected it and DB confirmed price TZS 75 / total TZS 108.75 remained unchanged (2026-10-07).
  - [x] Discount TZS 100 against gross TZS 75 was blocked inline; service rejected with “Item discount cannot exceed its gross amount”; DB confirmed discount 0, item and total TZS 108.75 unchanged (2026-10-07).
  - [x] Empty replacement item array rejected by the application’s runtime ValidationPipe with HTTP 400 `items must contain at least 1 elements`; DB confirmed the one BEER item and total TZS 108.75 remained unchanged (2026-10-07).
- [x] 4.17 Updates after ORDERED, FULLY_RECEIVED and CANCELLED were rejected with “Only DRAFT purchase orders can be updated”; each record/items/totals remained unchanged and no UPDATE audit was added (direct service + DB snapshots, 2026-10-07).
  - [x] Approved/ORDERED `PH20-S3-ORD-002` update rejected with “Only DRAFT purchase orders can be updated”; PO and items were unchanged and no UPDATE audit was added (direct service + DB snapshot, 2026-10-07).
  - [x] `PH20-S3-FULL-006` update attempt after FULLY_RECEIVED was rejected with “Only DRAFT purchase orders can be updated”; status, items, totals and UPDATE audit count were unchanged (direct service + DB snapshot, 2026-10-07).
  - [x] Cancelled `PH20-S3-CANCEL-008` update was rejected with “Only DRAFT purchase orders can be updated”; status, items, totals and UPDATE audit count were unchanged (direct service + DB snapshot, 2026-10-07).
- [x] 4.18 Controlled race: two edits passed the initial DRAFT read while approval was delayed behind them. Before the fix all three succeeded and an edit changed an already ORDERED PO. Fixed by conditionally updating only `{id,businessId,status:DRAFT}` inside the same transaction before item replacement. Retest: approval alone succeeded, both edits were rejected, final PO was ORDERED with the original single item/note/total, and exactly one APPROVE audit (no UPDATE audit/orphan items). Notifications were stubbed for this isolated QA race (2026-10-07).
- [x] 4.19 Valid edit audit records the actor, business, `UPDATE`, before notes and changed field list. Audit create now runs inside the PO/items transaction; injected FK failure (nonexistent actor) returned an error, rolled back shipping/total changes, and created no audit row. Backend build passed (2026-10-07).

## 5. Approval, cancellation, notifications, and lifecycle

- [x] 5.1 Approve DRAFT with `purchases.approve`; verify status ORDERED, approver/time, detail and list agree. User observed `PH20-S3-DRAFT-016` as ORDERED on detail and confirmed the list after returning; development DB confirms `approvedBy` is the Business A owner and `approvedAt=2026-10-07T05:12:20.878Z` (2026-10-07).
- [x] 5.2 Try approve without permission, twice, on non-DRAFT, missing ID and foreign-tenant ID; verify no unauthorized/duplicate mutation.
  - [x] Restricted same-business QA user with `purchases.view` and `purchases.edit`, but no `purchases.approve`, attempted to approve `PH20-S3-DRAFT-009`; API returned HTTP 403 `Missing required permissions: purchases.approve`; order stayed DRAFT, approver stayed null, and audit count stayed 0 (2026-10-07).
  - [x] `PH20-S3-DRAFT-027`: first approval returned HTTP 201 and set ORDERED with owner/time; retry returned HTTP 400 `Only DRAFT purchase orders can be approved`. State and approval time stayed unchanged; one APPROVE audit and exactly one notification per channel (1 IN_APP + 1 EMAIL) remained unchanged after retry (local development API + DB, 2026-10-07).
  - [x] Re-approve ORDERED `PH20-S3-DRAFT-016`; API returned HTTP 400 `Only DRAFT purchase orders can be approved`; status, approver/time, total, audit count (1) and notification count (2) were identical before and after (local development API + DB, 2026-10-07).
  - [x] Approve nonexistent UUID `00000000-0000-4000-8000-000000000000`; API returned HTTP 404 `Purchase order not found`, and no audit row was added (local development API + DB, 2026-10-07).
  - [x] As Business A, attempted Business B fixture `PH20-S3-B-ORD-001`; API returned HTTP 404 `Purchase order not found`; Business B status/approver/time/total and its audit/notification counts were unchanged (local development API + DB, 2026-10-07).
- [x] 5.3 Concurrent approval of `PH20-S4-APPROVE-RACE-20261007`: two simultaneous API requests returned one HTTP 201 and one HTTP 400 `Purchase order has already been processed`; final state ORDERED with one approver/time, exactly one APPROVE audit, one IN_APP notification and one EMAIL notification (local development API + DB, 2026-10-07).
- [x] 5.4 Approval notices include the exact supplier, PO number and formatted TZS amount on both channels. The valid `.test` recipient notice stayed queued `PENDING` because this dev business has no email provider configured; no external delivery was attempted. An empty supplier email produced no external notice and approval still returned HTTP 201/ORDERED; `not-an-email` queued an external notice and approval still returned HTTP 201/ORDERED, with no internal error exposed (local API + DB, 2026-10-07). Provider delivery itself remains unverified because no provider is configured.
- [x] 5.5 Cancel DRAFT and ORDERED/PARTIALLY_RECEIVED where policy allows; require clear reason, persist actor/time/reason, and verify list/detail state (2026-10-07).
  - [x] Fixed reason enforcement before any state change: whitespace-only reason on DRAFT `PH20-S3-DRAFT-021` returned HTTP 400 `Cancellation reason is required`; status, notes, cancelledBy/cancelledAt and audit count stayed unchanged (local API + DB, 2026-10-07).
  - [x] Browser cancel modal with whitespace only displayed `Cancellation reason is required.`; user confirmed no cancellation occurred and the order remained available as DRAFT (2026-10-07). First attempt exposed `window.prompt() is not supported`; replaced the prompt with the in-app dialog.
  - [x] Cancel DRAFT with non-empty reason `PH20-5.5-DRAFT-CANCEL-20261007`; user verified CANCELLED in both detail and list. DB confirms Business A owner actor, cancellation time `2026-10-07T05:29:49.763Z`, exact reason in notes, and one matching CANCEL audit (2026-10-07).
  - [x] Cancel ORDERED `PH20-S3-ORD-003` with reason `PH20-5.5-ORDERED-CANCEL-20261007`; user confirmed CANCELLED in detail and list. DB confirms Business A owner actor, cancellation time `2026-10-07T05:31:52.160Z`, exact reason and one matching CANCEL audit (2026-10-07).
  - [x] Cancel PARTIALLY_RECEIVED `PH20-S3-PART-017` where allowed; verify reason, actor/time, audit and list/detail. This status-only list fixture intentionally has no GRN; real receiving/stock effects are tested in sections 6–7. Detail and list show CANCELLED; DB confirms Business A owner actor, cancellation time `2026-10-07T05:35:37.918Z`, no GRNs, and one matching CANCEL audit at `2026-10-07T05:35:37.926Z` (2026-10-07).
- [x] 5.6 Attempt cancel FULLY_RECEIVED/CANCELLED; reject safely. Race cancel versus GRN/payment/approval; confirm no cancelled order gets new receipt/payment (2026-10-07).
  - [x] FULLY_RECEIVED `PH20-S3-FULL-024`: user confirmed Cancel order is absent. DB confirms status remains FULLY_RECEIVED, no cancellation actor/time, no GRN on this status-only fixture, and zero CANCEL audits (2026-10-07).
  - [x] CANCELLED `PH20-S3-PART-017`: user confirmed Cancel order is absent. DB confirms state, actor/time and reason are unchanged; one original CANCEL audit remains; no GRNs or payments were added (2026-10-07).
  - [x] Attempted payment on cancelled `PH20-S3-PART-017` for TZS 1.00 using Credit; UI showed `Payments cannot be recorded for a cancelled purchase order`. DB confirms status remains CANCELLED, no payment or GRN exists, and the original single CANCEL audit/reason is unchanged (2026-10-07).
  - [x] Cancelled `PH20-S3-PART-017` detail disables receiving and displays `This order is not open for more goods receipts` / `No receipts yet`; user confirmed this. Payment attempt was rejected; DB shows no payment or GRN and only the original CANCEL audit (2026-10-07).
  - [x] Race cancellation against GRN, supplier payment and approval; assert only valid transition wins and cancelled orders cannot receive or pay (2026-10-07).
    - [x] Concurrent Approve + Cancel on `PO-202610-00013`: cancellation won; approve returned `Purchase order has already been processed`. Refreshed detail shows CANCELLED. DB has no approver/time, one CANCEL audit with the test reason, and no GRN/payment (2026-10-07).
    - [x] Concurrent Cancel + GRN on `PH20-S3-ORD-002`: cancellation won; GRN returned `GRNs can only be created for approved, open purchase orders`. DB shows CANCELLED, one CANCEL audit, zero GRNs/payments, and no accepted quantity/stock effect (2026-10-07).
    - [x] Concurrent Cancel + TZS 1.00 Credit payment on `PH20-S3-ORD-004`: cancellation won; payment returned `Payments cannot be recorded for a cancelled purchase order`. DB shows CANCELLED, no GRN/payment, and one CANCEL audit with the test reason (2026-10-07).
  - [x] Code audit found GRN creation validated PO status before waiting for its row lock but did not re-read afterward, allowing a cancellation winner to be followed by GRN creation. Added an in-lock status recheck and refreshed item set; backend build passed, local health returned HTTP 200, and the concurrent Cancel + GRN retest rejected the receipt with no GRN created (2026-10-07).
- [x] 5.7 Verify cancellation does not create stock, payment or inventory movement and does not count as a valid supplier purchase liability (2026-10-07).
  - [x] DB confirms all 11 Business A CANCELLED POs have no GRNs/payments; inventory movements referencing cancelled PO IDs = 0. Payables eligibility excludes DRAFT/CANCELLED. Dashboard Outstanding Payables shows TZS 487,650, exactly matching the DB sum of 26 eligible POs after active payments; cancelled PO totals TZS 177,000 are excluded (2026-10-07).
- [x] 5.8 Verify CLOSED is not offered as a transition; if data already has CLOSED status, it renders safely and permitted actions are correct (2026-10-07).
  - [x] `PH20-S3-CLOSED-014` renders CLOSED; UI offers no approve/cancel action. Calling the cancellation service returned HTTP 400 `Cannot cancel PO with status: CLOSED`; status, cancelledBy/cancelledAt, notes, and audit count remained unchanged. No close-transition service/action exists (2026-10-07).
- [x] 5.9 Verify every lifecycle change has expected audit log, no secret/payload data, and visible UI reflects persisted status after refresh (2026-10-07).
  - [x] Queried audit trail for PH20 approval/cancellation fixtures: successful APPROVE/CANCEL transitions have matching action, actor and timestamp; rejected transitions add no extra action; CLOSED/FULLY_RECEIVED denied cancellation attempts add no audit. Reviewed before/after payloads: no password, access/refresh token, authorization, secret or OTP markers (2026-10-07).
  - [x] Refreshed concurrent-race orders `PH20-S3-ORD-002` and `PH20-S3-ORD-004`; both reload as CANCELLED with the recorded reason, disabled receiving/payment, and no receipts/payments. `PO-202610-00013` was likewise refreshed and showed CANCELLED (2026-10-07).

## 6. GRN create/update/list — quantities and traceability

### Create receipt

- [x] 6.1 Create GRN only for ORDERED/PARTIALLY_RECEIVED PO; DRAFT/FULLY_RECEIVED/CANCELLED must reject (2026-10-07).
  - PARTIAL — User opened DRAFT `PH20-S3-DETAIL-001`; Receiving displayed “This order is not open for more goods receipts,” with no Record goods received action. This confirms the DRAFT detail UI gate only. Do not count this as complete; the server and every state gate still need checking. (2026-10-07)
  - Test data ready in local Business A: `PH20-S6.1-DRAFT-001` (DRAFT, 3 ordered, no GRN), `PH20-S6.1-ORDERED-001` (ORDERED, 3 ordered, no GRN), `PH20-S6.1-PARTIAL-001` (PARTIALLY_RECEIVED, 3 ordered, 1 accepted in an ACCEPTED GRN; 2 remain), `PH20-S6.1-FULL-001` (FULLY_RECEIVED, 2 ordered and 2 accepted), and `PH20-S6.1-CANCEL-001` (CANCELLED, 3 ordered, no GRN). All use dedicated product `PH20-S6.1-GRN-20261007`; its Main Warehouse stock is 3, from 1 accepted partial unit + 2 accepted full units. Fixture creation is in `genuine-backend/src/database/phase20-section6-fixtures.ts`; its report mode is read-only. Seed and report completed against guarded local development DB on 2026-10-07. These are synthetic and must not be confused with the status-only Section 3 fixtures.
  - Still required for 6.1: confirm the UI allows GRN creation for ORDERED and PARTIALLY_RECEIVED, rejects/hides it for DRAFT/FULLY_RECEIVED/CANCELLED, and exercise the API/service state gates for all five statuses (valid allowed request on ORDERED/PARTIAL; rejected requests on the other three; no rejected request may leave a GRN or alter stock). For positive cases use quantity 1 against ORDERED and quantity 1 against PARTIAL to keep the fixtures reusable and leave partial quantity outstanding. Capture resulting GRNs and verify persisted PO status/stock before marking GREEN.
  - BUG FOUND during first PARTIAL fixture attempt: `POST /purchases/grn` returned Internal server error because the PO row-lock SQL cast the text PO ID to UUID (`42883: operator does not exist: text = uuid`). Removed the incorrect UUID casts from all four PurchaseOrder lock queries in `genuine-backend/src/purchases/purchase.service.ts`; backend build succeeded and `/api/v1/health` returned 200 after runtime restart (2026-10-07).
  - [x] PARTIALLY_RECEIVED positive create: on `PH20-S6.1-PARTIAL-001`, recorded second receipt with received=2, accepted=2, rejected=0, damaged=0. UI confirmed GRN `GRN-202610-00001` is `RECEIVED` and pending acceptance. Read-only DB report confirms both this GRN (2/2) and original accepted GRN (1/1) are present; PO remains PARTIALLY_RECEIVED because the new GRN is not accepted yet; stock remains 3 and no extra inventory movement was created. This passes allowed GRN creation for PARTIALLY_RECEIVED only; acceptance belongs to Section 7 (2026-10-07).
  - [x] ORDERED positive create: on `PH20-S6.1-ORDERED-001`, recorded received=1, accepted=1, rejected=0, damaged=0. UI confirmed `GRN-202610-00002` is `RECEIVED` and pending acceptance. Read-only DB report confirms PO remains ORDERED and dedicated product stock remains 3 with no new movement (2026-10-07).
  - [x] DRAFT UI gate: `PH20-S6.1-DRAFT-001` displays “This order is not open for more goods receipts”; no receiving form or Record goods received action is rendered. Read-only DB report confirms status remains DRAFT and GRN list is empty (2026-10-07). Direct API/service rejection for DRAFT is still unverified.
  - [x] FULLY_RECEIVED UI gate: `PH20-S6.1-FULL-001` displays “This order is not open for more goods receipts”; its accepted GRN `PH20-S6.1-GRN-FULL-001` shows 2/2. Read-only DB report confirms status FULLY_RECEIVED and no extra GRN was created. Direct API/service rejection for FULLY_RECEIVED is still unverified (2026-10-07).
  - [x] CANCELLED UI gate: `PH20-S6.1-CANCEL-001` displays “This order is not open for more goods receipts” and no receipts. Read-only DB report confirms status CANCELLED and GRN list empty. Direct API/service rejection for CANCELLED is still unverified (2026-10-07).
  - [x] State-gate verification complete: allowed ORDERED/PARTIALLY_RECEIVED requests succeeded through the UI/API and persisted RECEIVED GRNs; DRAFT/FULLY_RECEIVED/CANCELLED UI gates all hid receiving and showed the closed-order message. A read-only direct `PurchaseService.createGRN` verifier confirmed HTTP 400 BadRequestException for each rejected status and intercepted any transaction before it could write. Final DB report confirms no GRNs on rejected fixtures and no stock/movement change (3 units, baseline movements only). Scope note: rejected statuses were asserted at the service layer (not sent as authenticated HTTP requests through controller/permission guards). (2026-10-07)
- [x] 6.2 Record one valid fully accepted line; one valid split line (accepted + rejected + damaged); preserve exact received = accepted + rejected + damaged equation (2026-10-07).
  - Test data ready: `PH20-S6.2-QUANT-001` is ORDERED, with two synthetic products/lines: `PH20 GRN Fully Accepted Line` (2 ordered) and `PH20 GRN Split Quantity Line` (3 ordered). Both have zero stock and no GRN before this test. Fixture created with the guarded `--seed-6-2` mode; report confirmed expected state (2026-10-07).
  - [x] Created `GRN-202610-00003` and corrected it while still RECEIVED. Read-only DB report confirms fully accepted line `2=2+0+0`; split line `3=1+1+1`; GRN totals 5 received, 3 accepted, 1 rejected, 1 damaged. Both fixture products still have no StockBalance before acceptance (2026-10-07).
- [ ] 6.3 Reject zero total, negative, NaN/Infinity, inconsistent sum, missing/duplicate PO item, foreign item, repeated line and over-precision quantity according to unit rules.
- [ ] 6.4 Verify total received/rejected/damaged/accepted values in GRN response and list.
- [ ] 6.5 Verify optional GRN number duplicate conflict and concurrent generated numbers are unique.
- [ ] 6.6 Verify receivedDate, vehicle registration, driver, waybill and notes persist; test blank, long and unsafe text.
- [ ] 6.7 For `requiresExpiry` product, accepted > 0 requires batch + valid expiry; rejected-only/damaged-only behavior matches policy; expired batch handling is defined.
- [ ] 6.8 Create two concurrent pending GRNs against remaining PO quantity; reservations cannot exceed ordered accepted quantity. Verify failed request creates no GRN or items.
- [ ] 6.9 Verify newly created GRN is RECEIVED and stock/movements/weighted average/dashboard do not change before acceptance.

### Update pending receipt

- [ ] 6.10 UI edit must be present for the backend-supported RECEIVED GRN update; otherwise mark BLOCKED and stop this section.
- [ ] 6.11 Update date, metadata, quantities and item set; enforce equation, PO item membership, unique lines and required batch/expiry.
- [ ] 6.12 Reject update of ACCEPTED/REJECTED GRN; rejected/accepted records remain unchanged.
- [ ] 6.13 Race two GRN updates/creates on one PO; accepted reservations stay within ordered units, and failures are atomic.

### Read and pagination constraints

- [ ] 6.14 GRN list with/without purchaseOrderId matches detail and tenant; foreign/nonexistent PO filter returns no foreign records.
- [ ] 6.15 Confirm GRN list is currently unpaginated; test expected data volume and response time. If it exceeds safe size, add backend pagination before release.
- [ ] 6.16 Verify GRN detail can be reached and viewed; current UI routes from a GRN row to its PO, so direct detail/actions are currently a BLOCKER if individual GRN visibility is required.

## 7. GRN accept/reject — stock, costing, and inventory integration

- [ ] 7.1 Before accept, record exact StockBalance and inventory movement count for each product/location.
- [ ] 7.2 Accept RECEIVED GRN with `purchases.approve`; stock increases only by accepted quantity at the PO's location; rejected/damaged quantities add no stock.
- [ ] 7.3 Verify exactly one PURCHASE movement per accepted line with correct business/product/location/reference/user, batch/expiry and cost; no movement for accepted=0.
- [ ] 7.4 Repeat acceptance and race two acceptance calls; only one succeeds and stock/movement are not duplicated.
- [ ] 7.5 Reject RECEIVED GRN with a reason; no stock/movement changes; status becomes REJECTED; repeat reject/accept fails.
- [ ] 7.6 Verify accounting-period closure for GRN `receivedDate`: closed-period acceptance fails atomically; open period passes.
- [ ] 7.7 Accept partial quantities across multiple GRNs; PO status/accepted/outstanding quantities are correct after each receipt; exact completion becomes FULLY_RECEIVED.
- [ ] 7.8 Accept two distinct pending GRNs concurrently; final PO status reflects all accepted records, not whichever transaction wrote last.
- [ ] 7.9 Verify inventory service uses expected weighted-average unit cost, discount, shipping, tax and returns policy; compare to stock valuation and dashboard current snapshot.
- [ ] 7.10 Verify stock health/reorder watch and inventory reports update after accept and return; dashboard filter dates do not falsely treat current inventory snapshot as historical.
- [ ] 7.11 Verify activity/recent records and reports include correct GRN once; no duplicate or missing entries after retries.

## 8. Supplier returns — reservation, stock, supplier credit, and finance

- [ ] 8.1 Create return only for items belonging to this PO that have been accepted into stock.
- [ ] 8.2 Test each allowed reason exactly: DEFECTIVE, EXPIRED, WRONG_ITEM, OVERAGE, OTHER; reject unknown reason.
- [ ] 8.3 Reject zero/negative/non-numeric quantity, quantity > accepted unreturned amount, foreign PO item, empty items and duplicate-line overage.
- [ ] 8.4 Create two concurrent DRAFT returns against same accepted units; combined reservations cannot exceed accepted minus pending/approved returns.
- [ ] 8.5 Confirm return starts DRAFT and does not change stock, PO outstanding-to-receive, supplier balance, cash, or inventory movements before approval.
- [ ] 8.6 Approve return with `purchases.approve`; verify accounting period open, stock decrement once, one negative PURCHASE_RETURN movement per item, and no partial mutation on insufficient stock.
- [ ] 8.7 Reject DRAFT return with reason; stock and balances unchanged; reservation released; repeat approve/reject races cannot overwrite state.
- [ ] 8.8 Approved returns must not increase PO outstanding-to-receive. Reconcile `grnAcceptedQty`, physical `grnReceivedQty`, `returnedQty`, returnable balance, and outstanding values across PO detail/list.
- [ ] 8.9 Verify return number uniqueness, generated number under concurrent create, item amount discount math, two-decimal rounding and refresh persistence.
- [ ] 8.10 Verify supplier balance, supplier statement, payment due, finance reports and dashboard reflect an approved supplier return as a credit exactly once. Current service appears not to post supplier credit; mark BLOCKED until the intended accounting workflow is implemented/confirmed.
- [ ] 8.11 Verify return list tenant boundary and current unpaginated behavior; add pagination if data volume needs it.
- [ ] 8.12 Confirm no return delete/complete endpoint is presented unless the backend contract is added.

## 9. Supplier payment — payment subsystem and cash/accounting integration

- [ ] 9.1 Record PO balance, supplier balance/statement, payment list, cash ledger and dashboard cash baseline.
- [ ] 9.2 With `payments.create` and active business payment method, record a valid partial payment; verify payment row, PO totalPaid/balanceDue and supplier totalPaid.
- [ ] 9.3 Record full remaining balance; due becomes zero; reject overpayment, zero, negative, NaN/Infinity, amount > 2 decimals, missing method, inactive/foreign method.
- [ ] 9.4 Reject payment against CANCELLED PO and in closed accounting period; failed payment creates no payment/ledger/audit success.
- [ ] 9.5 Race payments whose sum exceeds balance; PO row lock prevents overpayment; verify retry message and exact final balance.
- [ ] 9.6 Verify supplied paymentDate controls accounting-period validation and displayed date; test boundaries/timezone.
- [ ] 9.7 Verify optional payment number uniqueness, reference and notes; sensitive account/token data are not exposed.
- [ ] 9.8 Verify payment appears exactly once in supplier, payment, cash flow and finance reporting; `VOIDED` payments do not count in PO/supplier paid totals.
- [ ] 9.9 Verify PO payment uses one consistent definition of supplier outstanding across PO `balanceDue`, supplier aggregate and supplier statement; current supplier aggregate includes voided payments and draft/cancelled orders, so this is a BLOCKER pending reconciliation.
- [ ] 9.10 Verify closed/open period permissions and that `payments.create` alone or together with purchases permissions behaves according to controller guard.

## 10. Cross-module end-to-end journeys — run only after sections 1–9 pass

- [ ] 10.1 **Standard purchase:** draft PO → edit draft → approve → record GRN → accept → stock balance/movement/cost updated → supplier payment → PO due zero → supplier/cash/dashboard reports reconcile.
- [ ] 10.2 **Partial receiving:** approved PO → accept partial GRN → PO PARTIALLY_RECEIVED → remaining qty accurate → second receipt → FULLY_RECEIVED.
- [ ] 10.3 **Rejected/damaged delivery:** create GRN split; rejected/damaged do not enter stock; accepted units alone affect inventory and valuation.
- [ ] 10.4 **Cancellation:** draft/order cancellation follows policy; no stock/payment/notification/order balance is wrongly counted afterward.
- [ ] 10.5 **Return:** accepted stock → DRAFT return reservation → approve → inventory falls once → supplier credit/statement reflects return → no duplicate payment or outstanding receipt.
- [ ] 10.6 **Failure/retry:** network loss at create/approve/accept/payment/return; reload and verify exactly-once effects or an explicit safe retry strategy.
- [ ] 10.7 **Dashboard reports:** compare Revenue unaffected; expenses not fabricated; inventory value, stock health, cash flow, payables and recent activity match source records and their documented as-of rules.
- [ ] 10.8 **Supplier report:** cross-check month boundary, canceled/draft PO, voided payment, approved return, opening balance and credit limit/utilization.
- [ ] 10.9 **Accounting period:** close period, attempt GRN acceptance/payment/return approval dated in closed period; each fails without changing stock/ledger, then repeat in open period.
- [ ] 10.10 **Notifications/audit:** approval notifications and audit entries reference the correct business, actor and records exactly once; no email failure rolls back approved data unless contract requires it.

## 11. Security, tenant isolation, and validation — finish before UI acceptance

- [ ] 11.1 Business A cannot list/read Business B PO, GRN, return, supplier/payment details by path ID or query filter.
- [ ] 11.2 Business A cannot create/update PO with Business B supplier/location/product references.
- [ ] 11.3 Business A cannot create GRN/return/payment against Business B PO or use Business B PO-item, payment-method, GRN or return IDs.
- [ ] 11.4 Verify every not-found response avoids confirming another tenant's record existence; no cross-tenant side effects.
- [ ] 11.5 Test malformed JSON, extra fields, wrong field types, huge notes, invalid UUIDs, unknown enum values and injection-like text; validation is clear and safe.
- [ ] 11.6 Errors/logs/toasts do not expose tokens, credentials, SQL, image/base64, stack traces or unrelated customer/supplier private data.
- [ ] 11.7 Verify backend authorization for every route; frontend permission checks are only UX and never treated as security.

## 12. UI, accessibility, and device matrix

- [ ] 12.1 Test 320, 360, 390, 768, 1024, 1280+ px; no horizontal page scroll, clipped totals, hidden actions or unscrollable modal.
- [ ] 12.2 Test loading, empty, retry, offline, timeout, 401, 403, 404, 409, 422/400 and server error states; no stale success state after failure.
- [ ] 12.3 Submit buttons disable during save; double-click does not create duplicate requests/records; focus and route after success are correct.
- [ ] 12.4 Search/status/date/supplier filters remain readable and usable on mobile; reset filters and paging correctly.
- [ ] 12.5 No native `alert()`; any confirm/reject/cancel UI is accessible, reason is explicit, canceling dialog makes no mutation.
- [ ] 12.6 Keyboard-only navigation reaches every control; visible focus, labels, validation summaries and screen-reader status are present.
- [ ] 12.7 Toast success/error is accurate, has aria-live behavior and never claims a mutation succeeded before API success.
- [ ] 12.8 Browser console has no uncaught errors; network panel has no unexplained API failures; no credentials/headers copied to evidence.

## 13. Build, closeout, and gate to Phase 21

- [x] Frontend type-check passed on 2026-10-06.
- [x] Frontend production build passed on 2026-10-06.
- [x] Backend Nest build passed on 2026-10-06.
- [ ] Re-run type-check/build/lint after any Phase 20 fix; record exact command and result.
- [ ] All blocker items in “Open implementation/contract gaps” are resolved and retested.
- [ ] All numbered manual tests pass in order with evidence; no skipped/assumed-green items.
- [ ] Review audit logs, tenant isolation, supplier statement, stock valuation, payment balance and dashboard baseline after end-to-end run.
- [ ] Phase 19 checklist is resumed from its earliest unchecked item and closed; do not treat its saved GREENs as completion.
- [ ] Preserve unrelated Phase 18/19 changes; review only intended diffs before commit/release.
- [ ] **Phase 21 gate:** open only after this item and the Phase 19 gate above are GREEN.

## Current code map

- Purchases UI: `/dashboard/purchases`, `/dashboard/purchases/orders/new`, `/dashboard/purchases/orders/[id]`.
- Adapter: `lib/api/purchases.ts`.
- Backend controller/service: `genuine-backend/src/purchases/purchase.controller.ts`, `purchase.service.ts`.
- Supplier integration: `genuine-backend/src/suppliers-customers/supplier.service.ts`.
- Related source-of-truth flows: products, inventory movements/valuation, payment methods, payments/cash ledger, accounting periods, notifications, audit logs, dashboard analytics and role permissions.
- Spec mismatch: pasted code says PO CRUD/delete, different GRN/return fields and routes, GRN pagination, and a dark theme. Those claims are not treated as implemented unless the actual backend/UI contract supports them.
