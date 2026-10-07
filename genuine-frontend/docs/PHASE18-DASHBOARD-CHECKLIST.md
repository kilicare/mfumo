# Phase 18 — Dashboard: Checklist ya majaribio

Tutathibitisha hatua moja baada ya nyingine. Kila kipimo kikifaulu, weka `GREEN` pamoja na data/response iliyoonekana. Kikishindwa, simama, rekebisha chanzo na urudie kipimo hicho. Tumia business na akaunti za development pekee.

## Maandalizi

- [ ] Backend `GET /api/v1/health` na frontend `http://localhost:3000/login` zinajibu `200`.
- [ ] Ingia kwa account ya Business A yenye `reports.view` na `inventory.view`; rekodi business na user zinazoonekana.
- [ ] Rekodi kipindi cha dashboard, currency, mapato, gharama, inventory value, receivables, payables na idadi ya low-stock kabla ya kubadilisha filter.
- [ ] Tumia account ya Business B kwa vipimo vya tenant isolation; usishiriki token au headers.
- [ ] Fungua browser console/network kwa errors pekee; ficha token values na taarifa binafsi.

## 1. Dashboard na data halisi

- [ ] Dashboard inaonyesha jina, email, role na business kutoka `/auth/me`.
- [ ] Hakuna metric ya mfano inayowasilishwa kama data halisi; empty state inaeleza hakuna data.
- [ ] Thibitisha revenue, recognized expenses, profit, margin, cash, receivables, payables, inventory value na low-stock dhidi ya analytics API kwa kipindi hicho.
- [ ] Thibitisha TZS/currency formatting, decimals, negatives na zero values.
- [ ] Badili week/month/quarter/year; tarehe za kichwa na panel zinazotegemea kipindi zibadilike sawasawa.
- [ ] Inventory value ionyeshe wazi kuwa ni snapshot ya sasa ikiwa API haitoi historical valuation.
- [ ] Refresh irudie data bila kuacha stale/loading state; jaribu refresh mfululizo na wakati request inaendelea.
- [ ] Hakuna ujumbe wa optional panels unaoonekana wakati endpoints zote zimefanikiwa.
- [ ] Ikiwa source moja haipatikani, dashboard ibaki na panel zilizofanikiwa na itaje source iliyo kosa; Refresh ijaribu tena bila kuficha chanzo.
- [ ] Bila `reports.view` au `inventory.view`, panel husika zisionyeshe data na dashboard isiite endpoints zisizoruhusiwa.
- [ ] Jaribu dashboard yenye data tupu, nyingi, majina marefu na amounts kubwa; hakuna crash au layout overflow.

## 2. Charts na KPI

- [ ] Chart ya mapato/gharama inaonyesha mistari/maeneo ya rangi mbili kwa legend sahihi; si bars.
- [ ] Thibitisha axes, period labels, zero/negative values na hover tooltip ya kiasi na currency.
- [ ] Sales trend, cash-flow, expense breakdown, top products na low-stock panels zinalingana na API.
- [ ] Bila data, chart ionyeshe empty state inayoeleweka badala ya kubuni pointi.
- [ ] Rangi za series, KPI icons, metric labels na alert states zina contrast na zinaonekana light/dark theme inapoungwa mkono.
- [ ] Chart haitumii rangi pekee kutofautisha data; legend/labels zipo na tooltip inaweza kufikiwa.

## 3. Sidebar na module navigation

- [ ] Desktop sidebar inafunguka kawaida na collapse toggle inaibadilisha kuwa icon-only; expand inarudisha labels.
- [ ] Hali ya collapse inabaki baada ya reload, na icons zina accessible labels/tooltips.
- [ ] Mobile drawer inafunguka kwa hamburger, overlay inafunga drawer, na kuchagua page kunafunga drawer.
- [ ] Sidebar inaweza kuscroll hadi Settings bila support card kufunika link za chini.
- [ ] Overview na Settings zinaenda kwenye routes zinazofanya kazi.
- [ ] Sales, Products, Inventory, Purchases, Customers, Suppliers, Payments & Finance, Expenses na Reports & Analytics zinaonekana kama `Soon`, hazifunguki kama pages zilizopo.
- [ ] Keyboard focus, Enter/Space, `aria-label` na contrast ya active/disabled links vinafanya kazi.

## 4. Responsive layout

- [ ] Jaribu upana 320, 360, 375, 390, 430 px; hakuna horizontal scroll, text clipping au controls zinazogusana.
- [ ] Jaribu tablet portrait/landscape takriban 768/1024 px; grid, charts, filters na sidebar vinaendana.
- [ ] Jaribu desktop 1280/1440/1920 px; content ina max-width nzuri na sidebar collapse haibani charts.
- [ ] KPI cards zinapanga 1 column kwenye simu ndogo, 2 columns kwenye simu pana/tablet, na 4 kwenye desktop kubwa.
- [ ] Filters, Refresh, tooltips, tables/list rows na chart labels zinatumika kwa touch na keyboard.
- [ ] Jaribu zoom 200% na font scaling; vitendo muhimu bado vinaonekana.

## 5. Profile photo

- [ ] Account menu inaonyesha initials ikiwa user hana picha.
- [ ] Chagua JPG/PNG/WebP; UI ina-compress kuwa WebP ndogo kabla ya kutuma.
- [ ] Upload picha halali; header avatar ibadilike, `/auth/me` irudishe avatar flag/path, na reload ibaki nayo.
- [ ] Logout kisha login tena; login response irudishe avatar path/flag ili picha ileile ibaki.
- [ ] Fungua **View profile photo**; picha iliyopo ionekane kwenye preview inayoweza kufungwa kwa kitufe au Escape.
- [ ] Picha ipatikane kupitia authenticated `GET /auth/profile/avatar`; bila token irudi `401`.
- [ ] Jaribu file isiyo image, MIME spoof, WebP signature batili, file kaubwa zaidi ya 64 KB baada ya compression na picha isiyosomeka; ikataliwe bila kubadilisha picha iliyopo.
- [ ] Jaribu request body iliyovurugika, avatar field isiyo string na fields za ziada; validation ikatae.
- [ ] Replace picha; picha mpya ionekane na ya zamani isitumike tena.
- [ ] Remove picha; initials zirudi na picha ibaki imeondolewa baada ya reload.
- [ ] Jaribu picha ya account/business nyingine; hakuna endpoint inayoruhusu kuisoma au kubadilisha.
- [ ] Audit log irekodi user, business, muda na UPDATE ya profile photo bila kuhifadhi image payload kwenye audit.
- [ ] DB failure wakati wa update isiache UI ikisema imefanikiwa; toast ya error ionekane na picha ya awali ibaki.

## 6. Toast cards na ujumbe

- [ ] Ujumbe wa mafanikio, kosa, tahadhari na taarifa una card ya rangi inayolingana na palette, icon na dismiss button.
- [ ] Card inaonekana desktop na mobile, ina `aria-live`/`alert` sahihi, na huondoka baada ya muda au dismiss.
- [ ] Upload, replace na remove profile photo zionyeshe success/error toast; hakuna `alert()` ya browser.
- [ ] Ujumbe hauhifadhiwi kwenye `localStorage`; `localStorage` ibaki kwa session/preferences zinazohitajika tu.
- [ ] Toast zisizozuilika zisifunge buttons au zifunikie menu muhimu; keyboard focus ibaki salama.

## 7. Security, isolation na failure handling

- [ ] Bila token, `/auth/me`, `GET/PATCH /auth/profile/avatar` na protected dashboard APIs zikatae `401`.
- [ ] Token ya Business A haiwezi kuona au kubadili dashboard/profile data ya Business B kwa IDs au query parameters.
- [ ] Backend authorization ndiyo inayolinda data; kuficha card/link kwenye UI hakuhesabiwi kama ruhusa.
- [ ] 401 baada ya session kuisha iongoze kwenye login kwa ujumbe unaoeleweka; 403 ionyeshe permission state sahihi.
- [ ] API timeout/network error ionyeshe retry state; data iliyopakiwa tayari isipotee bila sababu.
- [ ] Response/console/toast zisitoe token, password, image base64 au stack trace ya ndani.
- [ ] Avatar endpoints hazitumii user ID iliyotolewa na client; zinatumia user wa token iliyothibitishwa.

## 8. Build na mwisho

- [x] Frontend TypeScript check imepita.
- [x] Backend TypeScript check imepita.
- [x] Frontend production build imepita.
- [x] Backend Nest build imepita.
- [x] Lint ya files zilizobadilishwa imepita bila error/warning.
- [x] Backend health imerudi `200`; frontend `/login` imerudi `200` baada ya server kuwashwa tena.
- [ ] Browser/manual checks za dashboard, profile upload, responsive breakpoints na toast zimepita; rekodi ushahidi hapa.
- [ ] Hakuna console errors, API failures zisizoelezwa, horizontal overflow au placeholder inayojifanya feature iliyokamilika.

## Alama ya kusimamisha Round 1

- [x] Login tena baada ya logout; avatar imerudi bila hard refresh.
- [x] Upload isiyo picha, MIME spoof, WebP signature batili, picha kubwa kuliko 64 KB baada ya compression, na picha isiyosomeka zimekataliwa; avatar ya awali imebaki.
- [x] Replace picha, refresh, remove picha na refresh; picha mpya/initials vimeendelea kama ilivyotarajiwa.
- [x] Toast za mafanikio na kosa, dismiss, auto-dismiss na mobile view zimethibitishwa na mtumiaji.
- [ ] Ukaguzi wa `localStorage` kwa kutohifadhi ujumbe wa toast haujakamilishwa; utaendelea kwenye Round 2 ya mfumo mzima.
- [ ] Security/isolation, audit, failure injection na ukaguzi wa mwisho wa Phase 18 bado zinasubiri Round 2; usihesabu Phase 18 imefungwa.
