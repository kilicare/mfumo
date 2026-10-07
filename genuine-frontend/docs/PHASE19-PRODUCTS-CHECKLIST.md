# Phase 19 — Products: checklist kamili ya majaribio

Tutapima hatua moja kwa wakati. Kila kipimo kikifaulu, weka `GREEN` pamoja na matokeo; kikishindwa, simama, rekebisha chanzo, kisha rudia kipimo hicho. Tumia development database pekee.

> **Sheria ya mpangilio:** Endelea na kipengele cha kwanza kisicho na tiki kutoka juu kwenda chini. Tiki za vipengele vya baadaye zinaweza kuwa ushahidi wa kihistoria, lakini haziruhusu kuruka kipengele kilicho wazi kabla yake. Sehemu inayofuata haijaanza mpaka kila kipimo cha sehemu iliyotangulia kimepita au kimewekewa BLOCKED kwa sababu iliyoandikwa; BLOCKED haimaanishi GREEN.

> **Checkpoint — 2026-10-06:** Phase 19 imewekwa pembeni ili kuanza maandalizi ya Phase 20. Tiki zilizopo zimejazwa kwa ushahidi wa mazungumzo na API/UI checks. Tiki za baadaye hazifungi vipimo vya awali vilivyo wazi. **Kipimo kinachofuata ni 2.1: kuorodhesha products bila filter.** Maliza vipimo vya 2 kwa mpangilio kabla ya kuendelea 3; endelea hivyo hadi mwisho. Tenant isolation ya Business A/B na permissions zilizotiwa tiki ni ushahidi wa vipimo hivyo tu, si ruhusa ya kuruka vipimo vya 2–6 vilivyo wazi. Phase 19 **haijakamilika**. Data ya tenant test kwenye development DB: category `PH19 Tenant Test`, unit `Test Bottle` (`ph19btl`), product `PH19-TENANT-B-20261006` katika Business B `dagaaa`.

## Hali ya implementation

- [x] Products list, detail, create, edit na catalog pages zipo chini ya `/dashboard/products`.
- [x] Backend inathibitisha business scope, permissions, references hai, unit conversions, stock filters na audit ya create/update/delete product.
- [x] Catalog standard units/brands ni shared read-only; custom units/brands ni za business husika.
- [x] Migration `20261002100000_phase19_tenant_product_catalog` imetumika kwenye development database.
- [x] Product photos zimeongezwa: PostgreSQL `ProductImage`, endpoint ya picha yenye permission/tenant scope, compression WebP na preview/list/detail UI.
- [x] Migration `20261002110000_phase19_product_images` imetumika bila kufuta product records.
- [x] Development database ime-seed upya; rekodi za zamani zimeondolewa na seed account mpya imeundwa.
- [x] Frontend TypeScript check na production build zimepita.
- [x] Backend TypeScript check, Nest build, Prisma validate na lint ya faili zilizobadilishwa zimepita.
- Browser/API manual checklist hapa chini bado inahitaji kupimwa; hakuna kipimo cha UI kinachodaiwa kuwa GREEN kabla ya ushahidi.

## 1. Maandalizi na akaunti

- [x] Backend `GET /api/v1/health` imerudisha `200`; frontend `http://localhost:3000/login` imerudisha `200`.
- [x] Seed Business A account ya development ilifunguliwa na account Owner imethibitishwa; credentials hazijawekwa hapa tena.
- [x] Business A Owner ana `products.view/create/edit/delete` na `suppliers.view`; role/permissions zimethibitishwa.
- [x] Business B/user yake ipo; test account ya tenant B imetengenezwa kwa `products.view/create` pekee.
- [x] Business A ina category, supplier, products, units, location na stock balance zilizotumika kwenye majaribio.
- [x] Product IDs/SKUs zilizotumika kwenye majaribio zimerekodiwa kwenye matokeo na checkpoint hii.
- [x] Sidebar Products inafungua `/dashboard/products`; product ID isiyopatikana/ya tenant nyingine inaonyesha not-found state.

## 2. Kusoma, kutafuta na pagination

- [ ] Orodhesha products bila filter; `data`, `total`, `page`, `limit` na current stock zilingane.
- [ ] Tafuta kwa jina, SKU na barcode; search isiwe case-sensitive na isivuke business.
- [x] Barcode query `3456789` ilirejesha product ya BEER; search ya barcode ilirekebishwa na kurudiwa kwa matokeo sahihi.
- [ ] Chuja kwa category, brand, supplier, status, min/max selling price na stock status.
- [x] Min price kubwa kuliko max price imekataliwa na UI kwa ujumbe `Minimum price cannot exceed maximum price`.
- [ ] Jaribu minPrice pekee, maxPrice pekee na mipaka yote miwili; matokeo ya API yalingane.
- [ ] Jaribu stockStatus `BELOW_MINIMUM`, `LOW_STOCK`, `NORMAL`, `OVERSTOCKED`; total ihesabiwe kabla ya pagination na stock itokane na locations za business husika.
- [x] Panga kwa name, price na createdAt kwa ascending/descending; UI sort directions zilipimwa.
- [ ] Sort isiyotambulika isiangushe endpoint.
- [ ] Jaribu page/limit halali, hasi, sifuri, decimal, kubwa mno na zisizo namba; response iwe na tabia/validation iliyowekwa na limit isizidi 100.
- [x] Pata product kwa ID halali; detail ilionyesha category, brand/supplier zilizojazwa, bei, units na stock.
- [x] Pata product isiyopo; UI ilionyesha `Product unavailable / Product not found`.
- [x] Tumia product ID ya Business B ukiwa Business A; product detail na stock endpoints zote zimerudisha 404 bila kufichua rekodi.
- [x] Manual UI reverse check: Business B ilipojaribu kufungua product ya Business A, UI ilionyesha `Product unavailable / Product not found`.
- [x] Stock details zilionyesha balance ya Main Warehouse na recent movement state ya product ya majaribio.

## 3. Kuunda product na hesabu

- [x] Tengeneza product halali yenye SKU, jina, category, buying/selling prices, base unit na thresholds.
- [x] Product mpya ilianza na stock `0`; detail ilisema hakuna inventory movements zilizorekodiwa.
- [x] Product detail ilionyesha currency TZS na gross margin iliyohesabiwa kutoka bei zake.
- [x] Product test yenye brand `POMBE` na supplier `Test Supplier Ltd` ilionyesha marejeo sahihi.
- [x] Alternate units ziliundwa na kusasishwa; base `Carton` factor `1`, `Bottle` factor `0.0833333333333` (12 bottles kwa carton).
- [x] Duplicate SKU na barcode zilikataliwa; SKU na jina tupu zilionyesha validation error.
- [ ] IDs batili na productUnits tupu/duplicate zikatae bila product/stock balance nusu.
- [ ] Jaribu category inactive/isiyopo/ya business nyingine, supplier inactive/ya business nyingine, brand ya business nyingine na unit isiyo active/ya business nyingine; zikatae.
- [x] Bei zenye zaidi ya decimal places 2 zilikataliwa baada ya marekebisho; bei valid ziliendelea kuhifadhiwa kwa usahihi.
- [ ] Buying/selling/wholesale hasi, NaN/Infinity/string na selling chini ya buying bado vinahitaji API checks tofauti.
- [x] Reorder level hasi ilikataliwa; minimum/reorder decimal na minimum iliyo juu ya reorder bado pending.
- [x] Barcode/maelezo/optional fields tupu zilihifadhiwa au kuondolewa kwa namna inayotabirika.
- [x] `expiryDays` isiyo integer/iliyo hasi ilikataliwa; expiry halali ya siku 30 ilihifadhiwa.
- [x] Status ACTIVE, INACTIVE na DISCONTINUED zilionekana kwenye detail/list baada ya mabadiliko.
- [ ] Status isiyojulikana ikataliwe.
- [ ] Hakikisha create + ProductUnits + stock balances + audit CREATE vina commit pamoja; hitilafu yoyote isiache records nusu.

## 4. Kusasisha product

- [ ] Sasisha product ya kawaida kwa seti nzima ya fields: jina, maelezo, category, supplier, brand, bei, threshold, units, barcode na expiry fields.
- [x] Update ya product ilifanikiwa kwa fields zilizojaribiwa: barcode, description, optional details na product units.
- [ ] Tuma PATCH yenye field chache; fields zisizotumwa zibaki vilevile.
- [x] Ondoa optional brand/supplier/description/barcode values; detail ilionyesha placeholders baada ya ku-clear.
- [x] Badilisha base unit na alternate unit; default moja ilibaki na factor yake `1`.
- [ ] Sasisha bei na uhakikishe selling price haiwezi kushuka chini ya buying price.
- [ ] Jaribu category/supplier/brand/unit ya business nyingine au isiyopo; update ikataliwe bila mabadiliko nusu.
- [x] Jaribu product ID ya business nyingine; Business A yenye `products.edit` ilipata 404 ikijaribu kubadilisha product ya B, na jina/SKU ya product ya B vilibaki vilevile.
- [ ] Thibitisha audit UPDATE ina user, business, muda na before/after data isiyo na secrets.

### Picha za bidhaa

- [ ] Chagua JPG, PNG na WebP tofauti; kila moja ionekane preview na ibadilishwe kuwa WebP ndogo kabla ya kutumwa.
- [x] Picha 3 zilihifadhiwa; picha ya cover ilionekana kwenye list/detail baada ya reload.
- [x] Panga upya picha; cover ilibadilika kulingana na picha ya kwanza.
- [x] Reload/edit bila kubadilisha picha; picha zilizohifadhiwa zilibaki.
- [x] Replace, remove picha moja, kisha remove zote; list/detail/form zilingana baada ya reload.
- [x] SVG, PDF, MIME spoof, file kubwa kabla ya compression na WebP iliyozidi 128 KB zilikataliwa bila kubadilisha picha zilizopo.
- [x] Picha 6 kwa mara moja zilikataliwa.
- [ ] Data URL iliyoharibika ikataliwe bila kubadilisha product.
- [x] GET image bila token ilirudisha `401`; bila `products.view` bado haijapimwa kwa image endpoint.
- [ ] Tumia product/image IDs za Business B ukiwa A; image isifichuliwe, hata picha ikiwa ID yake inajulikana.
- [x] Authenticated image response ilirudisha `image/webp` na `X-Content-Type-Options: nosniff`; list API smoke check haikurudisha image bytes/base64.
- [ ] Thibitisha audit CREATE/UPDATE ina image count bila kuhifadhi image payload; DB failure isibadilishe product au picha nusu.
- [x] Backend photo lifecycle smoke check: create `201`, authenticated image GET `200` (`image/webp`, `nosniff`), replace images 2, remove all, old image `404`, cleanup ya product ya muda `200`.
- [x] Image endpoint bila token imerudisha `401`; hakuna token iliyochapishwa.

## 5. Catalog: categories, brands na units

- [ ] Orodhesha categories za business na parent names/hierarchy; counts zilingane na products.
- [ ] Unda, sasisha na futa category tupu; duplicate name, parent isiyopo/ya business nyingine na self-parent zikatae.
- [ ] Jaribu category cycle (A parent B, B parent A); ikataliwe.
- [ ] Futa category yenye products au subcategories; irudishe conflict/validation badala ya database error.
- [ ] Shared standard brands/units zionekane lakini zisiwe editable/deletable na business.
- [ ] Unda custom brand/unit; nyingine business isizione wala kubadilisha.
- [ ] Duplicates za custom/shared brand name au unit name/symbol zikatae bila kujali case.
- [ ] Unit conversion factor lazima iwe finite na > 0; jaribu sifuri, hasi na string.
- [ ] Brand/unit inayotumika na product isifutike; item isiyotumika ifutike salama.
- [x] Catalog API mutations zinaheshimu `products.create/edit/delete`; category/brand/unit create, edit na delete bila permission zimerudisha 403.

## 6. Kubadilisha status, bulk operations na kufuta

- [x] Badilisha status ya product moja; ACTIVE, INACTIVE na DISCONTINUED zilionekana kwenye detail/list baada ya mabadiliko.
- [ ] Discontinue product yenye historia; ihifadhiwe na ionekane kama DISCONTINUED.
- [ ] Bulk status kwa IDs za Business A; count iwe sahihi, ID isiyopo/ya Business B isibadilishe rekodi nyingine.
- [ ] Bulk price update: baadhi ya rows zipite na invalid row iripotiwe wazi; bei isiyokubalika isibadilike.
- [ ] Bulk import: row halali na row yenye duplicate/validation zikuripoti matokeo kwa kila SKU bila kuacha records nusu kwa row.
- [ ] Futa product isiyo na operational history; ProductUnits na balances husika zisibaki orphan.
- [ ] Futa product yenye stock movement, purchase/sales/return/adjustment/transfer/count history; ikataliwe na ielekezwe ku-discontinue.
- [ ] Jaribu delete ID isiyopo/ya business nyingine na bila `products.delete`; hakutokee mutation.
- [ ] Thibitisha bulk/status/price/import/delete hazivuki business na audit haidai action iliyoshindwa kuwa imefanikiwa.

## 7. Ruhusa, isolation na usalama

- [x] Bila token, products, catalogs na stock endpoints zilizolindwa zimerudisha 401: product list/detail/stock, categories, brands, units na inventory low-stock report.
- [x] Bila `products.view`, list/get/categories/brands/units/stock zilikataliwa 403; endpoints zote sita zimerudisha 403 kwa account isiyo na ruhusa hiyo.
- [x] Manual UI check: account ya Phase 19 isiyo na permissions imeingia, na `/dashboard/products` imeonyesha `Products access required` kwa sababu haina `products.view`.
- [x] Bila `products.create`, create product/category/brand/unit na import zikataliwe 403; API zote tano zimerudisha 403 kwa account ya `products.view` pekee, bila kuunda rekodi.
- [x] Manual UI check: account yenye `products.view` pekee imeona catalog, lakini `/dashboard/products/new` imezuia create kwa ujumbe wa permission unaoeleweka.
- [x] Bila `products.edit`, update, price/status bulk na edit catalog zikataliwe 403; UI ya edit ilionyesha ujumbe sahihi na API za product, bulk price/status, category, brand na unit zilirudisha 403 bila mutation.
- [x] Bila `products.delete`, delete product/category/brand/unit zikataliwe 403; endpoints zote nne zimerudisha 403 kwa account isiyo na ruhusa ya delete, bila kufuta rekodi.
- [ ] Kwa kila read/mutation, jaribu IDs za Business B, filter IDs na reference IDs; data isivuje wala kubadilishwa.
- [x] Product controller ina JWT na Permission guards; routes za bidhaa zinatumia `RequirePermission` kulingana na action.
- [ ] Error response isiwe na stack trace, SQL, token au data za tenant mwingine.

## 8. Uthabiti, audit na mwisho

- [ ] SKU/barcode, custom brand, custom unit na category duplicates kwenye requests za wakati mmoja zishughulikiwe na unique constraint bila duplicate.
- [ ] Create/update/delete product ziache database, ProductUnits, stock balances na audit zikiwa consistent baada ya injected DB failure.
- [ ] Thibitisha audit CREATE/UPDATE/DELETE ina actor/time/business na hakuna success log kwa failed mutation.
- [ ] Hakikisha decimal prices na stock quantity zinahifadhiwa bila rounding ya kushtukiza.
- [ ] Hakuna stale UI baada ya create/update/status/delete; error iwe na retry au ujumbe wa wazi.
- [ ] Products list/detail/form/catalogs viwe responsive kwa simu, tablet na desktop bila horizontal overflow.
- [ ] Browser console/network isiwe na errors zisizoelezwa; permission errors zionekane kwa state inayoeleweka.
- [ ] Backend/frontend builds na lint zibaki green baada ya vipimo na fixes.
