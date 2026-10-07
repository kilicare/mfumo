# Phase 30 — PWA: audit and sequential acceptance checklist

**Phase status:** IMPLEMENTATION IN PROGRESS; ACCEPTANCE TESTING NOT STARTED. All test boxes are intentionally unchecked.
**Scope:** installability, app shell/offline behavior, offline data and mutation policy, synchronization, updates, notifications, security, accessibility, and browser/device compatibility for Genuine Business Suite.
**Checkpoint:** Phase 20 is paused at **6.1**. Finish this Phase 30 checklist only when the user switches back to it; then resume Phase 20 at 6.1 without skipping any item.

## Test discipline — do not skip steps

1. Execute the numbered checks in order, one at a time, using development/test accounts and isolated test records. Record exact browser/device, network state, action, visible result, server result, and durable side effects without recording credentials, tokens, or private payloads.
2. Mark a checkbox only after the listed behavior is observed. Source inspection, type-check, or build output is not browser/device acceptance evidence.
3. Stop on the first failure. Capture it, fix the underlying issue, repeat that same check, then continue. Do not skip a failed or blocked number.
4. Mark missing capability as **BLOCKED — implementation/contract missing** and keep the sequence stopped until fixed or the scope is explicitly revised.
5. Do not queue or replay a business mutation offline unless the reviewed business rules explicitly permit that operation and define idempotency, authorization, conflicts, and user-visible status.
6. A green item proves only that numbered check. Do not call the phase complete while any required item is unchecked, blocked, or missing evidence.

## Static audit — repository state before implementation

Initial repository audit was code review only, not test evidence. The implementation checkpoint below records the files changed after that audit.

- `app/manifest.ts` already defines Genuine branding, standalone display, root scope, and three existing PNG icon files. It does not define shortcuts, screenshots, share target, or explicit categories. Confirm all referenced icon paths and actual image dimensions when tested.
- `app/layout.tsx` links `/manifest.webmanifest`, uses the Genuine `ThemeProvider`, and sets site metadata. The PWA client is now mounted globally; verify the UX and registration in acceptance testing.
- `public/` contains Genuine icons and Apple touch icon. A scoped Genuine `sw.js` and `/offline` fallback have now been added. The proposed DISTRO paths and shortcuts were not copied.
- `next.config.js` now applies `private, no-store` to `/api/:path*` and sets revalidation/scope headers for `/sw.js`; confirm deployed headers in acceptance testing.
- `package.json` is Next 14 / React 18 and has no PWA or IndexedDB library dependency. The pasted example's Next 15 / React 19 versions are not this repository's versions; do not copy them without compatibility review.
- `lib/api.ts` uses bearer tokens stored in `localStorage`, attaches them to API requests, and refreshes them on 401. Any offline queue/cache must not persist bearer/refresh tokens or replay a request after logout, account change, business switch, or permission/session change.
- Actual dashboard endpoints are under `/api/v1/analytics/dashboard/*` and `/api/v1/inventory/dashboard`; the pasted `/api/v1/dashboard` and `/api/v1/notifications/unread|stats` routes must not be assumed to exist. Verify real controllers and response envelopes before implementing cache/sync.
- The new worker deletes only this app's versioned shell caches, skips API/auth responses, and activates an update only after the user chooses Update. Verify lifecycle and cache behavior in acceptance testing.
- The current offline experience does not persist authenticated API responses. It supports only an explicit, local Purchase Order DRAFT queue using the existing business-scoped idempotency key; sync is foreground/manual, reuses the same key, and requires the same signed-in user/workspace plus `purchases.create`. Approval, receiving, payment, return, inventory, and other mutations are not queued.
- Push subscription and periodic/background sync are not present in the backend contract reviewed so far. Do not claim them until subscription registration, tenant/user targeting, delivery, revocation, idempotency, and unsupported-browser behavior are specified and implemented.

### Implementation checkpoint — 2026-10-07

- [x] Added Genuine manifest metadata, valid in-app route shortcuts, light/sand launch colors, and Apple web-app metadata.
- [x] Added a same-origin app-shell service worker with version-prefixed cache cleanup, static public asset caching, safe offline navigation fallback, API/auth exclusions, and user-confirmed worker activation.
- [x] Added `/offline`, install prompt handling (including iOS Add to Home Screen guidance), online/offline status, and an update-ready prompt using the Genuine light/dark theme.
- [x] Changed `/api/*` response headers to private/no-store and added service-worker scope/revalidation headers.
- [x] Added a narrow IndexedDB queue for explicitly saved Purchase Order DRAFTs, scoped to the creator and workspace, with existing server idempotency keys, manual foreground sync, permission checks, review/discard controls, and no persisted authorization headers.
- [ ] Authenticated offline business-data cache, service-worker Background Sync, push subscription/delivery, and Periodic Sync remain unimplemented; these need additional privacy and API contracts. Current offline reads use the offline fallback rather than cached tenant data.
- [ ] No build, type-check, automated tests, or browser/device acceptance tests have been run for these changes, as requested. Do not mark any acceptance checkbox green from this source review.

## 1. Scope, environment, and contracts — establish before changing code

- [ ] 1.1 Confirm which PWA capabilities Phase 30 actually includes: manifest/install, offline shell, cached read-only data, queued mutations (if any), foreground sync, background sync, push, periodic sync, and share target. Record exclusions explicitly.
- [ ] 1.2 Confirm local development environment, deployment origin, HTTPS behavior, frontend version, browser/device versions, and whether service workers are enabled in the environment.
- [ ] 1.3 Use disposable test workspace(s) for Business A and Business B; identify owner and restricted-role accounts without copying credentials or tokens into notes.
- [ ] 1.4 Capture baseline user, business, permissions, theme, sample dashboard values, and server/API health using redacted evidence. Record counts/IDs for isolated test fixtures only.
- [ ] 1.5 Inventory the real page routes and API contracts for dashboard, products, inventory, purchases, sales, finance, notifications, authentication, and logout. Record endpoint method, response envelope, auth requirement, tenant scoping, and cache eligibility.
- [ ] 1.6 Define the offline capability matrix by operation: safe read-only views; explicitly queueable idempotent actions; actions requiring live server authorization; and prohibited offline actions (including any money/stock/accounting transition not explicitly approved).
- [ ] 1.7 Define offline data freshness, maximum age, stale-data labels, conflict policy, queue expiry, retry/backoff limits, and recovery behavior in product terms.
- [ ] 1.8 Define tenant/session boundaries for cache and queued work, including logout, token expiry, user switch, business switch, permission changes, and account deletion.
- [ ] 1.9 Define supported browser/device matrix and graceful fallback for unsupported install prompts, Background Sync, Periodic Sync, Push, notification permission, and IndexedDB.
- [ ] 1.10 Record the initial state of service-worker registrations, CacheStorage names, IndexedDB databases/object stores, push subscriptions, and installed app state for the test origin.

## 2. Manifest, brand assets, launch, and deep links

- [ ] 2.1 Verify `/manifest.webmanifest` returns valid manifest JSON with correct Genuine name, short name, description, start URL, scope, display mode, and theme/background colors matching the approved light/sand and dark themes.
- [ ] 2.2 Verify every icon URL returns an image with its declared dimensions and MIME type; confirm regular, maskable, and Apple touch icons render without clipping or unsafe-area cropping.
- [ ] 2.3 Confirm icon `purpose` values, contrast, safe-zone artwork, and screenshots (if supplied) meet each target browser's requirements.
- [ ] 2.4 Verify manifest paths resolve under the deployed app base path and do not point to DISTRO sample files or missing files.
- [ ] 2.5 If shortcuts are included, verify each target uses a real Genuine route, respects authentication, retains no unintended query parameters, and works from an installed app.
- [ ] 2.6 If share target is included, verify its action route exists, validates text/URL/files, enforces file type/size limits, requires correct auth, and safely handles unauthenticated/offline submissions.
- [ ] 2.7 Verify root/start URL redirects to the appropriate login or authenticated dashboard without caching a user-specific redirect as a public response.
- [ ] 2.8 Verify the installed app opens in standalone mode on supported desktop and mobile platforms, uses correct app title/icon/theme, and preserves Genuine light/dark preference.
- [ ] 2.9 Verify login, session expiry, deep-link restore, browser back, and sign-out flows from both browser and standalone app.

## 3. Service worker registration, lifecycle, scope, and cache safety

- [ ] 3.1 Verify registration uses the intended same-origin service-worker URL and exact application scope; failures leave the online app usable and visible status understandable.
- [ ] 3.2 Verify installation succeeds when every required precache asset exists and fails safely when a required asset is missing; no partially active broken worker remains.
- [ ] 3.3 Verify activation claims only intended clients and does not unexpectedly reload or break an in-progress form/action.
- [ ] 3.4 Verify cache names include an app-specific prefix/version; activation deletes only obsolete caches owned by this app and preserves unrelated origin caches.
- [ ] 3.5 Verify cache version migration retains or removes data according to policy and does not resurrect stale tenant/user responses after an update.
- [ ] 3.6 Verify only approved static assets are precached; authenticated HTML, login responses, account data, API responses, and mutation responses are excluded unless a reviewed privacy design explicitly permits them.
- [ ] 3.7 Verify API responses with `private`, `no-store`, `Set-Cookie`, authorization, or sensitive tenant data are never stored in shared CacheStorage/CDN caches.
- [ ] 3.8 Verify fetch handlers ignore cross-origin, non-GET, unsupported schemes, and requests outside the worker scope unless an explicit safe route handles them.
- [ ] 3.9 Verify opaque/error/redirect responses, 401, 403, 404, 429, and 5xx are not incorrectly cached as successful app data.
- [ ] 3.10 Verify offline navigation has a real fallback response and never serves a different user's authenticated page or stale protected HTML.
- [ ] 3.11 Verify cache quota errors, CacheStorage unavailability, browser private mode, and corrupt cache entries degrade safely without blocking normal online use.
- [ ] 3.12 Verify worker logs/messages contain no tokens, credentials, sensitive request bodies, or private customer/business data.

## 4. Offline app shell and cached read-only data

- [ ] 4.1 With the app previously opened online, go offline and open the dashboard shell; confirm the user sees a clear offline state and no false claim that fresh server data loaded.
- [ ] 4.2 Navigate to each page declared offline-capable; verify cached shell loads, unsupported pages explain the limitation, and unknown routes do not display unrelated stale content.
- [ ] 4.3 Verify cached dashboard and list data are explicitly labelled with last-successful-sync time and remain within the agreed freshness policy.
- [ ] 4.4 Verify a cold offline launch (no prior shell/cache) displays a useful fallback and recovery action, not a blank page, infinite spinner, or misleading error.
- [ ] 4.5 Verify images, fonts, scripts, styles, and route chunks load offline only when cached; missing assets show a graceful fallback and recover online.
- [ ] 4.6 Verify stale-while-revalidate/network-first/cache-first behavior separately for each approved resource class, including rejected fetch promises and offline cache misses.
- [ ] 4.7 Verify sensitive API paths, authentication endpoints, profile/avatar, notifications, financial figures, and tenant-specific data follow their individually approved cache policy.
- [ ] 4.8 Verify refreshing while offline does not replace valid cached content with an error page or silently cache an error response.
- [ ] 4.9 Verify reconnect refreshes approved data, updates freshness labels, and displays failure/retry when the server remains unavailable.
- [ ] 4.10 Verify the offline fallback route and its online retry/navigation links are real, keyboard accessible, and consistent with Genuine theme/branding.

## 5. IndexedDB schema, migrations, quota, and data lifecycle

- [ ] 5.1 Confirm a single documented IndexedDB database name, owner, schema version, object-store definitions, indexes, and migration path shared by page and worker code.
- [ ] 5.2 Upgrade from an empty database and every prior supported schema; confirm existing queued work is migrated or safely rejected, never silently lost or duplicated.
- [ ] 5.3 Verify page and service worker use correct IndexedDB request/transaction completion semantics; test read, add, update, delete, and clear operations by observing durable records.
- [ ] 5.4 Verify transaction abort, blocked upgrade, version conflict, database unavailable, corrupt record, and quota exceeded paths surface a recoverable state.
- [ ] 5.5 Verify queue and cached-data records are bounded by size/count/age and are purged according to documented expiry and retention rules.
- [ ] 5.6 Verify stored records contain no access/refresh token, authorization/cookie header, unnecessary personal data, or unencrypted sensitive payload.
- [ ] 5.7 Verify logout, account removal, user switch, workspace switch, and explicit “clear offline data” remove or partition the correct IndexedDB and CacheStorage records.
- [ ] 5.8 Verify two tabs and the service worker cannot corrupt, double-delete, or race IndexedDB records; blocked database upgrades report which client must close/reload.
- [ ] 5.9 Verify `navigator.storage.estimate()`/persistent-storage support handling if used; denial or low quota must not break the online application.

## 6. Offline action policy and synchronization queue

- [ ] 6.1 Verify the UI queues only explicitly approved actions; read-only requests, login/reset/logout, file uploads, and prohibited money/stock/accounting changes are never mistaken for queueable work.
- [ ] 6.2 Verify each queued operation uses a stable idempotency key and server-side duplicate protection; replaying after timeout or lost response cannot create duplicate records/payments/stock movements.
- [ ] 6.3 Verify queue records bind safely to user/workspace context without persisting bearer or refresh tokens; after session refresh, the server re-authorizes the current user and permissions.
- [ ] 6.4 Verify queue order/dependencies preserve business ordering; dependent actions wait for prerequisites and cannot apply to a different workspace/entity.
- [ ] 6.5 Verify offline form validation is clearly distinguished from server validation; server rejection retains safe user input when appropriate and identifies the failed item.
- [ ] 6.6 Verify network restoration sync has exactly one owner (page or worker) per queued record; simultaneous tabs, manual sync, online event, and Background Sync do not send duplicates.
- [ ] 6.7 Verify manual Sync Now, automatic foreground sync, and Background Sync report queued/syncing/synced/failed counts truthfully and update the same source of truth.
- [ ] 6.8 Verify 400/401/403/404/409/422/429/5xx, timeout, offline interruption, malformed response, and expired request behavior; retries use bounded backoff and distinguish retryable from permanent failures.
- [ ] 6.9 Verify conflicts (record changed/deleted, stock/price/permission changed, duplicate reference) are surfaced for user resolution and are never silently overwritten.
- [ ] 6.10 Verify failed items remain inspectable/retryable or are explicitly discarded with confirmation; successful items are removed exactly once and retained history follows policy.
- [ ] 6.11 Verify sync resumes after app close/reopen, browser restart, worker termination, device reboot, and network flapping without duplicate application.
- [ ] 6.12 Verify request serialization supports only declared content types and rejects unsupported multipart/file/blob bodies with a clear explanation.
- [ ] 6.13 Verify queue capacity, old-item expiry, permanent failure, cancellation, and user-confirmed discard behavior without dropping work silently.
- [ ] 6.14 Verify a successful HTTP response with an application-level error envelope is not marked synced; validate response schema and server result.
- [ ] 6.15 Verify no sync request replays after logout, account/workspace change, revoked permission, deleted user, or explicit queue purge.

## 7. Install prompt and platform installation behavior

- [ ] 7.1 Verify installability criteria in each supported browser and record browser-specific prerequisites and unsupported cases.
- [ ] 7.2 Verify `beforeinstallprompt` handling stores the event safely, prompts only after a clear user action/context, and does not repeatedly nag after dismissal.
- [ ] 7.3 Verify accepted/dismissed outcomes, delayed prompt behavior, and persisted dismissal policy across reload, browser restart, account change, and app update.
- [ ] 7.4 Verify iOS/iPadOS manual Add to Home Screen guidance when no install prompt API exists; do not show a dead Install button.
- [ ] 7.5 Verify already-installed/standalone users do not see install prompts; detect display mode correctly on each platform.
- [ ] 7.6 Verify install prompt is accessible by keyboard/screen reader, has visible focus, can be dismissed, and matches Genuine light/dark theme and responsive layout.
- [ ] 7.7 Verify installation while unauthenticated and post-install launch both honor the existing auth/session flow without caching another user's login state.

## 8. App update lifecycle and safe activation

- [ ] 8.1 Verify a new worker is detected and the app exposes a clear update-ready message without polling excessively or leaking timers/listeners.
- [ ] 8.2 Verify waiting worker behavior follows one explicit policy: user-controlled update or immediate update; do not combine prompt UI with unconditional `skipWaiting`.
- [ ] 8.3 Verify update acceptance activates the intended waiting worker, waits for `controllerchange`, and reloads at a safe point exactly once.
- [ ] 8.4 Verify update dismissal keeps the old active version usable and does not repeatedly prompt during the same session.
- [ ] 8.5 Verify active forms, queued work, auth refresh, and in-flight actions survive or are safely paused during activation/reload.
- [ ] 8.6 Verify update install failure, offline update check, corrupted new cache, and rollback/recovery leave the last working app available.
- [ ] 8.7 Verify old caches and IndexedDB records are migrated/cleaned only after the new worker/app is usable.
- [ ] 8.8 Verify update checks and message handlers are cleaned up on component unmount and do not multiply when layouts/remounts change.

## 9. Notifications, push subscriptions, and periodic sync

- [ ] 9.1 Confirm backend/API ownership, permission model, VAPID/config secrets, subscription endpoint, tenant/user targeting, revocation, retention, and delivery failure contract before testing push.
- [ ] 9.2 Request notification permission only after a clear user action and explanation; test default, granted, denied, revoked, unsupported, and browser-blocked states.
- [ ] 9.3 Verify subscribe/unsubscribe, endpoint rotation, expired subscription, duplicate subscription, logout, workspace switch, and account deletion update the correct user/business records.
- [ ] 9.4 Verify push payload schema, size, localization, tag/deduplication, icon/badge paths, privacy-safe text, and malformed/empty payload handling.
- [ ] 9.5 Verify notification clicks validate same-origin safe destinations, focus an existing app window when appropriate, otherwise open the correct in-scope route, and never navigate to an untrusted external URL.
- [ ] 9.6 Verify notification action buttons and deep links respect authentication, workspace scope, and current permissions; expired sessions go through the standard login route.
- [ ] 9.7 Verify Background Sync for notification refresh does not expose private notification details to an unauthenticated or wrong-user worker context.
- [ ] 9.8 Verify periodic sync is feature-detected, permission-gated where required, user-configurable, rate-limited, and has foreground fallback when unsupported.
- [ ] 9.9 Verify background data refresh uses actual Genuine endpoint paths/response envelopes and labels update timestamps; no sample DISTRO endpoints remain.
- [ ] 9.10 Verify push/periodic fetch failures do not show false success or silently discard required state; logs remain free of payload secrets.

## 10. UI, themes, accessibility, and user feedback

- [ ] 10.1 Verify offline banner/indicator appears promptly on loss and clears on recovery, with accurate queued count and last-sync time.
- [ ] 10.2 Verify every action that is unavailable offline is disabled or explains why; do not imply an action succeeded merely because it entered a queue.
- [ ] 10.3 Verify all PWA prompts, toasts, indicators, dialogs, offline pages, and sync errors match the existing Genuine visual system in light/sand and dark modes.
- [ ] 10.4 Verify dark-mode text contrast, focus states, status colors, glass/overlay opacity, and button backgrounds remain readable; light-mode theme remains intact.
- [ ] 10.5 Verify mobile layout, safe-area insets, portrait/landscape, tablet/desktop widths, zoom, reduced motion, and fixed header/sidebar interactions.
- [ ] 10.6 Verify keyboard-only navigation, screen-reader names/status announcements, focus restoration, dialog escape/dismissal, and no focus trap after sync/update prompts.
- [ ] 10.7 Verify loading/empty/offline/stale/syncing/success/partial failure/permanent failure states are distinct and understandable in Swahili/English if both locales are supported.
- [ ] 10.8 Verify dismiss/close/retry controls are operable, non-duplicated, and do not lose queued work without confirmation.
- [ ] 10.9 Verify page refresh, route change, multiple tabs, toast overlay, and navigation do not obscure or duplicate essential offline/update messages.

## 11. Security, tenant isolation, and privacy review

- [ ] 11.1 Review every cache rule and response header for authenticated data; verify no `public` caching of tenant-specific API responses at browser, service worker, Next server, proxy, CDN, or shared cache layers.
- [ ] 11.2 Attempt Business A then Business B in the same browser profile; verify neither cache nor IndexedDB reveals the other tenant's pages, images, API values, queued actions, or notifications.
- [ ] 11.3 Log out, expire/refresh token, switch user/workspace, and revoke permissions while offline and online; verify protected cached data is purged/partitioned and queued work is blocked pending fresh authorization.
- [ ] 11.4 Inspect CacheStorage, IndexedDB, localStorage, worker messages, and logs for access/refresh tokens, Authorization/Cookie headers, passwords, payment data, customer PII, and unnecessary response bodies.
- [ ] 11.5 Verify API cache paths exclude login/register/refresh/reset/profile/session/permission-sensitive endpoints and no redirect or error response becomes a cross-account cache hit.
- [ ] 11.6 Verify same-origin HTTPS/service-worker requirements and production headers; local HTTP behavior is documented as development-only.
- [ ] 11.7 Verify user-controlled notification/share-target URLs and cached request URLs cannot cause open redirect, cross-origin fetch, script execution, or path traversal.
- [ ] 11.8 Verify queued mutation payloads are minimized, bounded, protected from XSS exposure as far as the browser storage model allows, and covered by retention/clear-data policy.
- [ ] 11.9 Verify service-worker scope, script integrity/deployment ownership, CSP/security headers, and cache poisoning protections.
- [ ] 11.10 Verify error messages and telemetry redact auth tokens, request bodies, private business names/IDs where unnecessary, and sensitive server diagnostics.

## 12. Browser/device and application-flow matrix

- [ ] 12.1 Verify current supported desktop Chrome/Edge install, standalone launch, offline navigation, update, sync, and push behavior.
- [ ] 12.2 Verify current supported Firefox behavior, including features it does not support, with clear install/sync fallbacks.
- [ ] 12.3 Verify current supported Android browser install prompt, icon/maskable rendering, offline launch, notifications, and network recovery.
- [ ] 12.4 Verify current supported iOS/iPadOS Add to Home Screen, standalone launch, safe areas, offline shell, and notification limitations.
- [ ] 12.5 Verify private/incognito browsing and storage-disabled modes degrade gracefully without breaking normal online login and navigation.
- [ ] 12.6 Verify app flows for login/session refresh/logout, dashboard, product search/detail, inventory read, purchase list/detail/create policy, sales/POS policy, payments/finance policy, and notifications according to the approved offline matrix.
- [ ] 12.7 Verify browser back/forward, refresh, deep links, query strings, and history behavior offline and after reconnection.
- [ ] 12.8 Verify slow network, intermittent network, airplane mode, DNS failure, backend down, and browser online-but-server-unreachable states are distinguished accurately.
- [ ] 12.9 Verify multiple tabs/windows and simultaneous installed/browser app instances do not race cache migrations, queue sync, auth, or update activation.
- [ ] 12.10 Verify minimum supported viewport, touch target size, orientation, keyboard, pointer, and zoom on representative phone/tablet/desktop configurations.

## 13. Release, observability, and completion gate

- [ ] 13.1 Review dependency additions against the repository's actual Next 14 / React 18 versions, lockfile, build tooling, and deployment model; document alternatives and license/security review.
- [ ] 13.2 Verify production build emits the expected manifest, worker, fallback assets, and headers; development behavior is clearly distinguished from production behavior.
- [ ] 13.3 Verify deployment rewrites/API origin/CORS/HTTPS and service-worker scope work in the real configured environment, not only localhost.
- [ ] 13.4 Verify rollback/unregister instructions, cache invalidation plan, database schema rollback strategy, and support recovery steps are documented.
- [ ] 13.5 Verify operational monitoring covers worker registration/update failures, sync failure classes, queue age/count, push delivery/subscription errors, and storage failures without collecting sensitive payloads.
- [ ] 13.6 Verify release notes accurately state supported offline features and limitations; remove unsupported “100% complete”, “production-ready”, or Lighthouse guarantees until evidence supports them.
- [ ] 13.7 Review every earlier checklist item and evidence entry in sequence; resolve all gaps and repeat failures before phase sign-off.
- [ ] 13.8 Mark Phase 30 complete only after every required item is green with evidence and all blocked/scope decisions are resolved.

## Evidence log

| Test ID | Result/evidence | Date | Browser/device, safe fixture IDs, or redacted response |
|---|---|---|---|
| — | No Phase 30 tests have been run. | 2026-10-07 | Implementation added after static audit; build/type-check/browser behavior remain unverified. |
