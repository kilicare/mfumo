# Phase 13 — Notifications: Checklist ya majaribio

Tutapima hatua moja baada ya nyingine. Kila kipimo kikifaulu, andika `GREEN` pamoja na ID/namba, business, status, response na mabadiliko ya database yaliyoonekana. Kikishindwa, simama, rekebisha, kisha rudia kipimo hicho kabla ya kusonga mbele. Tumia email/phone za sandbox au test provider; usitume ujumbe wa majaribio kwa wateja halisi.

## Maandalizi

- [ ] Thibitisha `GET /api/v1/health` inajibu.
- [ ] Thibitisha migration `20260929140000_phase13_notifications` imetumika na jedwali la notifications yapo.
- [ ] Weka `NOTIFICATION_CONFIG_ENCRYPTION_KEY` yenye angalau herufi 32 kwenye environment ya kila deployment. Usitumie key ya local kwenye production, na usiweke key kwenye Git.
- [ ] Andaa Business A na Business B, users wa kila business, na token za roles tofauti. Tumia `settings.view`/`settings.edit` kwa templates, config na notification outbox; inbox hutumia user aliyeingia.
- [ ] Andaa customer mwenye email na simu za sandbox, pamoja na sample invoice, payment, PO, expense, product na locations mbili.
- [ ] Rekodi hali ya mwanzo ya notification rows, recipients, logs, inbox na stock/payment records. Tumia majina na idempotency keys za kipekee.

## 1. Authentication, permissions na business isolation

- [ ] Bila token, jaribu template, config, send, outbox, inbox na mark-read endpoints; zote zilindwe kwa `401`.
- [ ] Bila `settings.view`, jaribu `GET /api/v1/notifications`, `/:id`, `/templates`, `/templates/:id`, `/config/email` na `/config/sms`; thibitisha `403`.
- [ ] Bila `settings.edit`, jaribu create/update/delete template, `/send`, `/:id/send-now`, `/process-pending` na kuhifadhi config; thibitisha `403`.
- [ ] User wa Business A akitumia `notificationId`, `templateId` au recipient `userId` ya Business B, data isifichuliwe wala kutumiwa; mutation ikataliwe kwa `404` au validation response iliyowekwa.
- [ ] Hakikisha inbox ya user inaonyesha entries za user huyo tu, hata kama user mwingine wa Business A amepokea notification ileile.
- [ ] Business A isione au kubadilisha email/SMS config, templates, outbox, notification logs au inbox ya Business B.

## 2. Notification templates

- [ ] Tengeneza template ya kila channel inayotumika (`EMAIL`, `SMS`, `IN_APP`) na event halali; thibitisha business, event, variables, subject/body na `isActive`.
- [ ] Jaribu jina tupu/ref duplicate ndani ya business, type/event isiyojulikana, body/subject kubwa kupita limit na variables zisizo array; validation/unique error irudi bila row nusu.
- [ ] Soma template kwa ID halali, orodhesha templates bila filter na kwa type/event; hakikisha business scope na filters.
- [ ] Update fields chache; fields ambazo hazikutumwa zibaki. Zima template kisha thibitisha haitumiki kwenye event.
- [ ] Jaribu ID isiyopo na ID ya Business B kwenye get/update/delete; thibitisha `404` bila mabadiliko.
- [ ] Delete template iliyotumika tayari; notification za zamani zibaki na body iliyokwisha-renderiwa.
- [ ] Render `{{variable}}` kwa data halali; thibitisha placeholder zote zinazotakiwa zinabadilishwa na HTML maalum kama `<script>` inakuwa escaped.
- [ ] Template ikitaka variable isiyopo, request/event ishindwe kwa njia salama na isiandike delivery/log inayosema imetumwa.

## 3. In-app inbox na manual notification

- [ ] Tuma `IN_APP` kwa user wa Business A; thibitisha Notification, recipient, log na inbox row zinatengenezwa pamoja, status ni `SENT`, na hakuna provider inayohitajika.
- [ ] Tumia `GET /api/v1/notifications/inbox/in-app`; hakikisha pagination/limit, `unreadOnly=true/false`, unread count, sort ya newest-first na business/user scope.
- [ ] Mark notification kuwa read kupitia `PATCH /api/v1/notifications/inbox/in-app/:id/read`; thibitisha `isRead/readAt` na unread count. Kurudia mark-read kusibadilishe entry nyingine.
- [ ] Jaribu kusoma/mark-read ID ya inbox ya user mwingine au Business B; ikataliwe bila kufichua kama entry ipo.
- [ ] Tuma email/SMS manual kupitia `POST /api/v1/notifications/send`; bila provider config rekodi ibaki `PENDING`, isijidai `SENT`.
- [ ] Recipient wa email asiye na email, SMS asiye na phone, IN_APP asiye na userId, recipients tupu/duplicate na zaidi ya 100; zikatalie kabla ya kuandika notification.
- [ ] Jaribu recipients mchanganyiko wa userId wa business tofauti; request nzima ikataliwe atomically.
- [ ] Tuma request yenye `idempotencyKey` ileile mara mbili; irejeshe notification ileile na isizalishe duplicate notification/recipient/log.

## 4. Email/SMS provider configuration na delivery

- [ ] Hifadhi SMTP config halali na SendGrid config halali kwa Business A; response isirudishe password/API key wala ciphertext.
- [ ] Hifadhi Twilio na Africa's Talking config halali; response isifiche siri kwenye response, log au outbox list.
- [ ] Jaribu provider isiyotambulika, port/phone/email batili na credentials zinazokosekana; validation error irudi bila kubadilisha config iliyokuwa hai.
- [ ] Hakikisha config huhifadhiwa kwa encryption; badilisha encryption key kwa rotation iliyopangwa na `NOTIFICATION_CONFIG_ENCRYPTION_KEY_PREVIOUS`, hakikisha config ya zamani inasomeka kisha ihifadhiwe upya chini ya key mpya.
- [ ] `GET /api/v1/notifications/config/email` na `/config/sms` zirudishe provider/from-address pekee, si siri.
- [ ] Kwa test provider, tuma email na SMS; baada ya provider kukubali, notification na recipient ziwe `SENT`, `sentAt`, provider id na delivery log viandikwe.
- [ ] Provider ikirudisha error/timeout, recipient iwe `FAILED`, log ihifadhi error iliyofupishwa, notification iwe `FAILED` au `PARTIALLY_SENT`; hakuna fake success.
- [ ] Notification yenye recipients wengi: mmoja akifaulu na mwingine akishindwa, retry itume kwa aliyeshindwa tu, status iwe `PARTIALLY_SENT`, na aliyefanikiwa asipokee duplicate.
- [ ] Thibitisha retries zina `nextRetryAt`, backoff, kikomo cha majaribio 5, manual `POST /:id/send-now`, na `POST /process-pending` hazi-claim row moja mara mbili kwa concurrent requests.
- [ ] `GET /api/v1/notifications` na `GET /:id` zionyeshe status, counts, attempts, retry schedule, recipients na logs kwa pagination/filter; fields za provider credentials zisionekane.

## 5. Business event triggers

- [ ] Kutengeneza invoice kunatengeneza `INVOICE_CREATED` mara moja baada ya transaction kufanikiwa.
- [ ] Ku-issue invoice kunatengeneza `SALES_INVOICE_ISSUED` pamoja na customer email inapokuwepo; invoice, stock na notification zisijidai kufanikiwa kwa transaction iliyofeli.
- [ ] Malipo ya invoice kupitia payments flow yanatengeneza `PAYMENT_RECEIVED` pamoja na taarifa ya customer inapowezekana; njia tofauti za malipo zisitoe duplicate kwa payment ileile.
- [ ] Approval ya PO tu ndiyo itoe `PURCHASE_ORDER_APPROVED`; ku-update PO ya draft bila ku-approve kusitoe approval notification. Supplier email itumiwe inapokuwepo.
- [ ] Approval ya expense inatengeneza `EXPENSE_APPROVED` baada ya approval kufanikiwa.
- [ ] Export/report iliyofanikiwa inatengeneza `REPORT_GENERATED`; export iliyofeli haitoi notification ya mafanikio.
- [ ] Event notification ya ndani ifike kwa users wa Business A wenye permission ya event husika pekee (`sales.view`, `payments.view`, `purchases.view`, `expenses.view`, `inventory.view`, `reports.view`).
- [ ] Simulate notification DB/provider error baada ya biashara kufanikiwa: invoice/payment/approval/report ibaki sahihi, error iandikwe kwenye logger, request ya biashara isijirudie wala kurudisha 500 kwa sababu ya notification.

## 6. Low stock na payment-due scans

- [ ] Weka product na balances zinazojulikana kwenye locations mbili; scan itumie threshold ya juu kati ya `minimumStock` na `reorderLevel` kwa kila location kivyake.
- [ ] Punguza stock kupitia invoice issue, adjustment, transfer-send na physical-count post; ikishuka chini/kuwa sawa na threshold, `LOW_STOCK` izalishwe baada ya transaction.
- [ ] Ongeza stock/receive transfer au GRN; location nyingine isiathirike na alert itumie balance ya location husika.
- [ ] Product/location isiyo active au ya business nyingine isitoe alert. Product bila stock row ihesabiwe kama zero wakati wa scheduled scan.
- [ ] Rerun scan na kurudia tukio siku hiyo hiyo; low-stock alert isirudiwe. Siku inayofuata alert iruhusiwe tena ikiwa stock bado chini.
- [ ] Invoice yenye balance iliyobaki na due date iliyopita itoe `PAYMENT_DUE` kwa ratiba; paid/cancelled invoice isitoe.
- [ ] Due date ikikosekana, thibitisha fallback ya `issuedDate`; hakikisha overdue notification ina dedup key ya invoice/kipindi ili worker scan isi-spam.
- [ ] Thibitisha scheduled scan hushughulikia zaidi ya page moja ya records na notification failure ya item moja haisimamishi batch nzima.

## 7. Atomicity, retries, concurrency na API errors

- [ ] Database failure wakati wa create notification/recipient/log/inbox row isiache records za sehemu.
- [ ] Tuma create mbili zenye idempotency key moja kwa wakati mmoja; notification moja tu ihifadhiwe.
- [ ] Tuma delivery/scan mbili kwa wakati mmoja; recipient asitumwe zaidi ya mara moja kwa sababu ya claim race.
- [ ] Process iliyokwama katika `SENDING` irejeshwe kwenye retry baada ya stale timeout bila kuathiri `SENT` recipients.
- [ ] Thibitisha status codes/error shape kwa validation, authentication, permission, not-found, duplicate/idempotency na provider failure.
- [ ] Response na logs zisitoe access token, password, API key, decrypted config, au taarifa za business nyingine.
- [ ] Thibitisha app shutdown husafisha worker timers; kuanzisha instance zaidi ya moja hakusababishi duplicate delivery kutokana na atomic DB claim/idempotency.

## Upeo wa channels

Phase hii inatekeleza `EMAIL`, `SMS` na `IN_APP`. `PUSH` haijawekwa kwenye API kwa sababu bado hakuna kifaa/token registry wala provider ya push iliyosanidiwa; kuikubali sasa kungeweza kuonyesha mafanikio ya uongo.
