# Phase 12 — Expense Management Test Checklist

Phase 12 is **Expense Management**. Phase 13 is reserved for notifications. This checklist tests the Expense endpoints under `/api/v1/payments/expenses` and the existing payment ledger integration. Run one numbered section at a time; capture the exact input, HTTP status, response, and before/after database values. Stop on the first failed assertion, fix it, and repeat that section before continuing.

## Test setup and baseline

- [ ] Confirm `GET /api/v1/health` returns `200`.
- [ ] Use Business A's authenticated user with the specific permissions needed for each test; keep tokens out of shared logs.
- [ ] Prepare a separate Business B, an active category, active location, active payment method, and active supplier in Business A.
- [ ] Record current Expense, ExpenseItem, Payment, AuditLog, and category counts for both businesses.
- [ ] Record the target accounting periods and verify they are open.
- [ ] Give every test category and expense a unique name/code/number/reference so results can be identified.

## 1. Category setup and budgets

- [ ] Create a category with an automatic code; verify name, generated code, business, active state, and timestamps.
- [ ] Create a category with a supplied code and a monthly, quarterly, or yearly budget; verify exact saved values.
- [ ] Reject blank names, invalid/duplicate codes, negative budget, excessive decimal precision, invalid period, or a budget with no period (and vice versa).
- [ ] List all categories and active-only categories; verify tenant filtering and stable ordering.
- [ ] Get a category by ID; missing and other-business IDs must not reveal data.
- [ ] Update category name/code/description/budget/active state; omitted fields must remain unchanged and audit must show the update.
- [ ] Reject duplicate name/code updates and malformed budget pairs without partial changes.
- [ ] Delete an unused category; reject deletion if an expense or item references it. Deactivation must preserve history.
- [ ] Submit expenses just below, exactly at, and above each budget boundary; above-limit submissions must fail without status/audit changes.
- [ ] Verify draft and rejected expenses do not consume budget; pending, approved, and paid expenses do.
- [ ] Verify zero-value budget behavior and monthly/quarterly/yearly date boundaries.
- [ ] Send concurrent submissions against the same remaining budget; committed expenses must not exceed the limit.

## 2. Create, read, search, and pagination

- [ ] Create a draft expense with multiple category items, descriptions, notes, date, reference, supplier, location, payment method, attachment, and budget code.
- [ ] Verify generated `EXP-YYYYMM-#####` number is unique per business/month; supplied number is retained and duplicates return a conflict.
- [ ] Verify total equals the rounded sum of item amounts; supplied mismatching total is rejected.
- [ ] Reject no items, missing/inactive/other-business categories, nonpositive amounts, invalid decimals/date, and foreign/inactive supplier, location, or method.
- [ ] Attempt direct creation as paid; it must be rejected so approval/payment cannot be bypassed.
- [ ] Get by ID and verify all header, category, item, supplier, location, payment method, creator, and status fields.
- [ ] Missing ID returns `404`; Business B ID under Business A does not expose a record.
- [ ] List expenses with no filters and with status/category/supplier/date/amount filters; verify `data`, `total`, `page`, and `limit`.
- [ ] Verify date boundaries include the full `fromDate` and `toDate`; reject reversed ranges and `minAmount > maxAmount`.
- [ ] Verify invalid page/limit values are rejected and pagination does not duplicate or skip stable rows.
- [ ] Confirm summary/trends only count the documented statuses and aggregate by item category without mixing businesses.

## 3. Draft editing and deletion

- [ ] Update each supported field on a draft expense; verify total and item list are recalculated.
- [ ] Send a partial update; every omitted field/item must remain unchanged.
- [ ] Replace the item list with multiple categories; header category, item categories, and total must remain consistent.
- [ ] Reject invalid, inactive, or other-business references and invalid amount/date changes without partial writes or success audit.
- [ ] Update or delete pending, approved, paid, or rejected expenses; lifecycle rules must reject the mutation.
- [ ] Delete a draft; verify dependent items are deleted and audit records the deletion atomically.

## 4. Approval and rejection lifecycle

- [ ] Submit a valid draft; status becomes `PENDING_APPROVAL` and audit captures the submitter/time.
- [ ] Submit an expense exceeding its category budget or in a locked/closed accounting period; reject it with no successful transition audit.
- [ ] Approve a pending expense as a different user; verify status, `approvedBy`, `approvedAt`, approval notes, and audit.
- [ ] Verify self-approval is blocked.
- [ ] Reject a draft or pending expense with a required reason; verify `rejectedBy`, `rejectedAt`, reason, status, and audit.
- [ ] Repeat submit/approve/reject, approve a rejected expense, or change a final expense; verify state transitions are safely rejected.
- [ ] Concurrent approve/reject attempts must yield one valid final transition and one audit event.

## 5. Payments ledger integration

- [ ] Pay an approved expense using its configured method; verify one `OUTFLOW` Payment references the same business/expense and the correct amount/method/user/date.
- [ ] Pay with an explicitly selected active method and transaction reference/notes; verify payment and expense retain them.
- [ ] Reject payment for draft, pending, rejected, already-paid, locked-period, missing-method, inactive-method, or other-business-method cases.
- [ ] Verify expense payment uses the existing Payments ledger and is not duplicated by another expense-specific ledger.
- [ ] Pay through the existing `POST /api/v1/payments/create` Expense reference path; enforce approved state, due balance, business isolation, and no overpayment.
- [ ] Record partial/multiple ledger payments where supported; verify remaining payable and expense `isPaid/status/paidAt` stay consistent.
- [ ] Void a payment and verify payable/expense state is recalculated without deleting payment history.
- [ ] Repeat/concurrently submit payment requests; the expense must not be overpaid or marked paid inconsistently.

## 6. Security, audit, transactions, and errors

- [ ] Without a token, all protected expense/category/report endpoints return `401`.
- [ ] Without `expenses.view`, reads fail `403`; without `expenses.create`, create/submit fail; without `expenses.edit`, updates fail; without `expenses.delete`, deletes fail.
- [ ] Without `expenses.approve`, approve/reject fail; without `expenses.pay` (or the explicitly supported finance permission), expense pay fails.
- [ ] Try Business B IDs for category, expense, supplier, location, payment method, and payment; no cross-business read or mutation is allowed.
- [ ] Verify audit records include actor, business, entity, action, timestamp, and before/after data for category and expense changes, workflow transitions, and payment.
- [ ] Failed validation, authorization, budget, period, database, and duplicate-number requests must not create success audit rows.
- [ ] Simulate database errors during expense/category creation, item replacement, approval, deletion, and payment; each transaction must leave all related rows consistent.
- [ ] Confirm responses use expected `400/401/403/404/409` status codes and do not expose another tenant's data or internal database details.

## 7. Accounting reports and reconciliation

- [ ] Compare expense summary, category totals, trends, payment ledger, income statement, cash flow, and payables reports against hand-calculated source rows.
- [ ] Verify pending/rejected/draft amounts are classified consistently and not recognized as paid/approved expense in financial statements.
- [ ] Verify expenses without items from older data are handled using the documented fallback behavior.
- [ ] Reconcile expense amount, item sum, active payment sum, outstanding amount, `isPaid`, and status after create/update/approval/payment/void.
- [ ] Verify decimal rounding at cents across items, totals, budgets, payment sums, and reports.

## Expected invariants

- Legacy expenses without item rows use the expense header category and amount in summary, trends, and financial-statement category breakdowns.

- An expense and all its items are written or rolled back together.
- Only approved expenses can be paid; an expense cannot be paid beyond its amount.
- Expense payments are recorded once in the shared Payment ledger.
- Category budgets are enforced at submission/approval under concurrency.
- Business scope is applied to every read and write.
- Failed operations never produce an audit event claiming success.
