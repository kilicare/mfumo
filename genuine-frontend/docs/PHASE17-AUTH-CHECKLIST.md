# Phase 17 — Authentication: Checklist ya majaribio

Tutapima kipengele kimoja kwa wakati. Kila kipimo kikifaulu, rekodi `GREEN` pamoja na data na response tuliyoona. Kikishindwa, simama hapo, rekebisha chanzo, rudia kipimo hicho, kisha endelea. Tumia mazingira ya development pekee; registration huunda business na owner mpya.

## Checkpoint ya 2026-09-30

Phase 17 bado haijafungwa. Hifadhi maendeleo haya ili tuendelee hapa tutakaporudi:

- **GREEN:** Reset link halali ilikubali password mpya mara ya kwanza; kutumia link ileile tena kulikataliwa kwa `Invalid reset token` (single-use).
- **GREEN:** Forgot-password email ilifika; inaeleza link inaisha baada ya saa moja na hutumika mara moja, na haionyeshi password ya sasa.
- **GREEN:** Reset UI ilikubali token iliyokuwa kwenye query, ikaondoa query string kwenye address bar, na haikuonyesha tena `Reset token not found`.
- **GREEN:** Client-side password validation ilikataa password yenye herufi chini ya 8, yenye herufi 129, isiyo na uppercase, isiyo na lowercase, isiyo na namba, isiyo na alama inayokubalika, na confirmation isiyolingana.
- **GREEN:** Token ya majaribio iliyoharibika ilikataliwa na UI kwa `Invalid or expired reset token`.
- **NEXT:** Token ya Business B: hakikisha token yake inaweza kubadilisha Business B pekee, na Business A inabaki bila mabadiliko. Tumia akaunti za majaribio tu; usinakili reset token kwenye log au ujumbe.
- **PENDING:** Kwenye invalid-token cases, jaribu token iliyo-expire na token isiyo ya password-reset. Jaribio la reused token tayari ni GREEN hapo juu.
- **PENDING:** Hakikisha reset imefuta sessions zote; old password ikataliwe na new password ikubaliwe; jaribu reset requests mbili za wakati mmoja.
- **PENDING:** Malizia vipimo vingine vilivyo unchecked katika Sections 5–12; usihitimishe Phase 17 yote GREEN kwa checkpoint hii.

## Maandalizi

- [ ] Washa backend na frontend; health ya backend iwe `GET http://localhost:3002/api/v1/health` → `200`.
- [ ] Hakikisha frontend inafunguka `http://localhost:3000/login` na API base URL ni `http://localhost:3002/api/v1`.
- [ ] Tumia business ya majaribio `dagaaa` na akaunti ya test `kilicareplus@gmail.com`; inbox hiyo ndiyo itatumika kwenye forgot/reset password.
- [ ] Thibitisha email provider ya SMTP imewekwa kwa `dagaaa`; config imenakiliwa kutoka `Genuine Liquor Store` kwa data iliyosimbwa, bila kuonyesha SMTP password. Forgot-password email huwekwa kwenye notification outbox ya business hiyo.
- [ ] Rekodi idadi ya businesses, users na sessions kabla ya registration; tumia email na business name za kipekee.
- [ ] Usichapishe access token, refresh token, reset token, app password au authorization header kwenye terminal/ujumbe.
- [ ] Fungua Developer Tools kwa kuangalia errors za UI/network tu; usinakili au kushiriki token values.

## 1. Login UI na validation

- [ ] Fungua `/` bila session; inakupeleka `/login`.
- [ ] Hakikisha login inaonekana vizuri desktop, tablet na mobile; labels, focus ring, button loading na links vinafanya kazi.
- [ ] Bonyeza `Sign in` bila email/password; ujumbe wa validation uonekane na request isiende API.
- [ ] Jaribu email format isiyo sahihi; UI ikatae kabla ya request.
- [ ] Badilisha password kuwa show/hide; thamani ibaki ileile na isi-submit kwa kubonyeza eye.
- [ ] Login kwa credentials zisizo sahihi; pata ujumbe wa kawaida, usiofichua kama email ipo.
- [ ] Login kwa account iliyozimwa; ikataliwe bila kupewa session.
- [ ] Login kwa account hai; response iwe na user, business, roles, permissions, access token, refresh token na expiry; UI iende `/dashboard`.
- [ ] Jaribu email yenye uppercase/nafasi za pembeni; normalization ifanye login kwa akaunti ileile.
- [ ] Dashboard ionyeshe jina, email, role na business sahihi; isiweke metrics za kubuni kama mapato halisi.

## 2. Registration na ownership

- [ ] Fungua `/register`; hakikisha first name, last name, email, business name, business type, password na confirmation vipo.
- [ ] Jaribu majina mafupi kuliko herufi 2; registration ikataliwe upande wa UI.
- [ ] Jaribu email isiyo sahihi, business name tupu na business type tupu; validation ifanye kazi.
- [ ] Jaribu password chini ya herufi 8, bila uppercase/lowercase, bila namba, bila alama inayokubalika, au zaidi ya herufi 128; ikataliwe.
- [ ] Password confirmation isiyolingana ikataliwe bila kutuma request.
- [ ] Password fields za show/hide na requirement indicators zionyeshe hali sahihi.
- [ ] Register kwa data halali na unique; business, user, default roles/permissions, Owner assignment na refresh session vitengenezwe pamoja.
- [ ] Hakikisha response ina owner wa business mpya na UI iende dashboard bila login ya pili.
- [ ] Jaribu login na refresh request ya akaunti mpya; refresh ifanye kazi kwa sababu server-side session iliundwa wakati wa registration.
- [ ] Register tena kwa email iliyopo; irudi `409`/ujumbe unaofaa, bila business au user ya ziada.
- [ ] Tuma registration mbili kwa wakati mmoja zenye email ileile; account moja tu itengenezwe, na transaction iachie hakuna business/user nusu.
- [ ] Jaribu registration yenye `businessType` halali tofauti; backend ihifadhi aina iliyotumwa.
- [ ] Thibitisha database counts: success moja = business moja, user mmoja, role assignment moja, session moja; failure = hakuna rekodi nusu.

## 3. Session restore na routes zilizolindwa

- [ ] Reload dashboard ukiwa na session halali; UI ianze na loading state, ithibitishe `/auth/me`, kisha ibaki dashboard.
- [ ] Fungua `/dashboard/security` moja kwa moja ukiwa na session halali; route ifunguke.
- [ ] Logout, kisha jaribu `/dashboard` na `/dashboard/security`; middleware ikupeleke login.
- [ ] Ondoa cookie ya `genuine-session` ukiwa ume-logout; route iliyolindwa isionekane.
- [ ] Weka cookie ya `genuine-session=1` bila bearer token; middleware inaweza kupitisha ukurasa kwa UX, lakini `/auth/me` lazima ikatae session batili na UI irudi login. Cookie hii si authorization.
- [ ] Tumia access token isiyo halali/iliyokwisha muda; API ilinde data na isiruhusu mutations.
- [ ] Thibitisha public routes `/login`, `/register`, `/forgot-password`, `/reset-password` zinafunguka bila session.
- [ ] Ukiwa na session halali, `/login` na `/register` zikupeleke dashboard; forgot/reset bado ziweze kufunguliwa kwa recovery inayohitajika.
- [ ] API isipopatikana kwa muda wakati `/auth/me` inakaguliwa, UI isifute token halali kimyakimya; jaribio la API lioneshe network error ya kawaida.

## 4. Access token refresh

- [ ] Thibitisha login na registration zote zinahifadhi refresh session upande wa server.
- [ ] Baada ya access token ku-expire, ombi lililolindwa lifanye refresh kisha lirudie ombi la awali mara moja.
- [ ] Tuma maombi mengi yanayopata `401` kwa wakati mmoja; refresh request moja itumike na maombi yarudi bila duplicate logout.
- [ ] Refresh token isiyo sahihi, iliyofutwa au iliyo-expire; tokens za browser zifutwe na user arudishwe login.
- [ ] Refresh token ya session ya zamani ifanye kazi hata account ina login sessions nyingine hai.
- [ ] User aliyezimwa akijaribu refresh akataliwe.
- [ ] Request ya login yenye `401` isijaribu refresh token iliyopo; ionyeshe error ya credentials.
- [ ] Thibitisha response ya refresh ina access token mpya bila kuhitaji refresh token mpya (hii ndiyo backend contract ya sasa).

## 5. Forgot password na barua ya reset

- [ ] Fungua `/forgot-password`; tuma email ya account iliyopo yenye provider configured.
- [ ] API response iwe ujumbe wa jumla pekee; isiweke reset token au kuthibitisha kama akaunti ipo.
- [ ] Outbox itengeneze `PASSWORD_RESET` email yenye recipient sahihi na status ya awali `PENDING`; baadaye iwe `SENT` ikiwa SMTP imekubali.
- [ ] Pokea email, fungua link; link iende `/reset-password?token=...` kwenye frontend origin iliyosanidiwa.
- [ ] Hakikisha barua haisemi password ya sasa, inaeleza link inaisha baada ya saa moja na inaweza kutumika mara moja.
- [ ] Omba reset kwa email isiyosajiliwa; response iwe sawa na ya akaunti iliyopo, hakuna reset token/email/outbox itolewe.
- [ ] Tumia email casing tofauti; lookup bado ipate akaunti ileile.
- [ ] Business isiyo na email provider: response ya API ibaki ya jumla, hakuna token itakayorudishwa; outbox/logs zisifichue token.
- [ ] SMTP ikikataa email, reset request isitoe token kwa API response; notification irekodi failure/retry bila kuonyesha secret.
- [ ] Omba reset mara mbili; token mpya ifanye ya zamani isiweze kutumika.

## 6. Reset password

- [ ] Fungua `/reset-password` bila token; form isiruhusu reset na itoe njia ya kuomba link mpya.
- [ ] Password mpya chini ya herufi 8, zaidi ya 128, isiyo na uppercase/lowercase/namba/alama inayokubalika, au confirmation isiyolingana ikataliwe kabla ya API.
- [ ] Token iliyoharibika, ya user mwingine, iliyokwisha muda, iliyotumika tayari au isiyo ya password-reset ikataliwe.
- [ ] Token halali na password inayolingana ikubaliwe; response ya success ionekane.
- [ ] Baada ya page kusoma token, query string iondolewe kwenye address bar; referrer isipeleke token kwa page nyingine.
- [ ] Baada ya reset, sessions zote za user zifutwe na token ya zamani ikataliwe.
- [ ] Login kwa password ya zamani ishindwe; password mpya ifanye kazi.
- [ ] Request mbili za kutumia reset token moja kwa wakati mmoja: ni reset moja tu ikubaliwe; token isibaki usable.

## 7. Change password

- [ ] Fungua `/dashboard/security` ukiwa umeingia; current/new/confirm fields na maelezo ya sign-out vionekane.
- [ ] Current password isiyo sahihi ikataliwe bila kubadilisha password au kufuta sessions.
- [ ] Password mpya dhaifu, ndefu kuliko 128, isiyo na uppercase/lowercase/namba/alama inayokubalika au confirmation isiyolingana ikataliwe kabla ya API.
- [ ] Password mpya halali ikubaliwe; update ya password na kufuta sessions zote zitokee ndani ya transaction moja.
- [ ] UI imtoe user na imrudishe login baada ya success.
- [ ] Login ya zamani ishindwe na password mpya ifanye kazi.
- [ ] Kosa la database katikati lisibadilishe password bila kufuta sessions, au kufuta sessions bila kubadilisha password.

## 8. Logout

- [ ] Logout kutoka dashboard; backend ifute refresh sessions kulingana na kanuni ya sasa, local tokens/user data/cookie vifutwe, kisha UI iende login.
- [ ] Jaribu kutumia access token ya zamani kwenye endpoint iliyolindwa; ikataliwe baada ya access token expiry/refresh validation.
- [ ] Logout API ikishindwa kwa network, local sign-out bado ikamilike.
- [ ] Baada ya logout, browser refresh isirudishe dashboard kupitia stale Zustand/localStorage state.
- [ ] Test login kwa browser/tab nyingine; thibitisha tab nyingine ishughulikiwe kulingana na backend logout inayofuta sessions zote za user.

## 9. Business isolation, ruhusa na data

- [ ] Login kwa users wa businesses tofauti; jina, businessId, roles na permissions za dashboard zilingane na token husika.
- [ ] User wa Business A asione business/user data ya Business B kupitia `/auth/me` au endpoint yoyote inayolindwa.
- [ ] Forged session cookie au stale profile isiweze kupitisha API bila valid bearer token.
- [ ] Permissions zinazoonyeshwa kwenye profile zitoke backend; UI isizitumie kama mbadala wa backend authorization.
- [ ] Pitia response ya login, `/auth/me`, refresh, forgot/reset na change-password; isiwe na password hash, reset token, refresh hash au SMTP secret.

## 10. API errors na ubora wa UI

- [ ] Hakikisha error za `400`, `401`, `403`, `409` na network timeout zina ujumbe unaosomeka; hakuna stack trace au raw server internals.
- [ ] Validation ya backend ikirudisha array ya errors, UI izionyeshe bila kuanguka.
- [ ] Double-click submit wakati request inaendelea isitoe requests mbili; button ionyeshe loading na izimwe.
- [ ] Password field values zisibaki kwenye form baada ya logout/reset, wala zisiandikwe console.
- [ ] Keyboard-only: tab order, Enter submit, password toggle, links na focus visibility vifanye kazi.
- [ ] Screen reader: fields zina labels, errors zina `role=alert`, loading/success status inatangazwa.
- [ ] Responsive layout kwenye simu (320px+), tablet na desktop; hakuna horizontal scroll au controls zilizofichwa.
- [ ] Brand, rangi, contrasts na placeholders zilingane; modules za baadaye zionekane kama hazijatekelezwa badala ya link zinazovunjika.

## 11. Build na mwisho wa phase

- [ ] `tsc --noEmit` ya frontend ipite.
- [ ] ESLint ya frontend ipite.
- [ ] Next.js production build ipite.
- [ ] NestJS backend build na ESLint zipite baada ya maboresho ya auth.
- [ ] Hakikisha routes `/login`, `/register`, `/forgot-password`, `/reset-password`, `/dashboard` na `/dashboard/security` zina-build.
- [ ] Hakikisha `.env.local`, `.env.production`, tokens, reset links na provider credentials hazijaingia Git.
- [ ] Baada ya kila kipimo, andika data iliyotumika, status code, response muhimu na `GREEN`/`ERROR`; usiende next baada ya error mpaka irejee GREEN.

## Maelezo ya contract ya sasa

- API envelope: `{ statusCode, timestamp, data }`; auth client hufungua `data` kabla ya kutumia payload.
- Access token huishi muda mfupi; refresh token ina server-side session ya hadi siku 7. Refresh endpoint hurudisha access token mpya pekee.
- Middleware hutumia cookie ya presence kwa navigation tu. Backend JWT guard ndiyo inayolinda data na endpoints.
- Logout na password reset/change-password hufuta sessions zote za user kwenye backend.
- Password-reset email hutumia email provider iliyosanidiwa kwa business husika; jibu la forgot-password halitoi reset token.
