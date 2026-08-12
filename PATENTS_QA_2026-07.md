# Patents / confidential portal — 28-tester QA (Round 2 of 5)

**Round 2 = Patents.** The confidential heart of the app: real patent numbers, coded client handles,
and a passcode step-up. Method = deep code-level persona teardown of `apps/web/app/patents/*` +
`apps/web/lib/passcode-context.tsx` + the picker in `NewProjectModal.tsx` + `apps/api/src/modules/patents/*`
+ the passcode guard/service + the document-confidentiality invariant, plus a **live browser check**
and **adversarial verification** before any finding is recorded.

**Design note:** the portal is **Super-Admin-only** (`patent.manage` ∈ SUPER_ADMIN_ONLY_CODES). So only
Mohit + Yash test the portal internals; the other 26 personas stress-test the **confidentiality
boundary** from their real (non-privileged) permissions — the question for each is "what confidential
patent/client data can *I* reach, and can I bypass the passcode?"

## Surface map (condensed)
**API `apps/api/src/modules/patents/`** — routes served under `/api/v1`:
- `GET /clients` (patent.manage) · `POST /clients` (patent.manage + **@RequirePasscode**) · `PATCH /clients/:id`
  (patent.manage + **passcode**; **renaming a code re-mints every live handle** to `Pat_<newCode>_<serial>`) ·
  `DELETE /clients/:id` (patent.manage + **passcode**; soft-deletes client + patents).
- `GET /patents?clientId=` (patent.manage, **no passcode**) → OVERVIEW: handles + serials + `documentName`,
  **NO `realNumber`** (`PATENT_OVERVIEW_SELECT`).
- `GET /patents/reveal?clientId=` (patent.manage + **@RequirePasscode**) → **THE REVEAL** — the only path
  returning `realNumber` (`revealPatents()`).
- `GET /patents/options?clientId=` (**patent.view**) → handle-only (`id/handle/serial`, no clientId/documentId) →
  the project picker; deliberately can't correlate handle→client.
- `POST /patents` (patent.manage) register real numbers → mint handles (dedup per client) ·
  `POST /patents/from-document` (patent.manage, **no passcode** — multipart; filename must look like a patent
  number, else rejected pre-store) · `PATCH`/`DELETE /patents/:id` (patent.manage) ·
  `POST /patents/:id/document` (patent.manage) attach/replace · `GET /patents/:id/document/content`
  (patent.manage + **@RequirePasscode**) stream doc bytes (web fetches as a blob to carry the passcode header).
**Passcode step-up:** `@RequirePasscode()` → global opt-in `passcode.guard.ts` reads header **`x-org-passcode`**;
**NO-OP when the org has no passcode configured**; runs after Auth+Permission; 403 codes
`PASSCODE_REQUIRED`/`PASSCODE_INVALID(remaining)`/`PASSCODE_LOCKED(lockedUntil)`. `passcode.service.ts`:
argon2 hash in `Organization.securityPasscodeHash` (no hardcoded value), `MAX_FAILED=5`, `LOCK_MS=15min`,
in-memory lockout keyed by orgId; reset via account password or the `set-passcode.ts` script. Local demo
passcode = `Squark@2026` (org IS configured).
**Documents invariant:** `GET /documents/:id/content` has **no perm/passcode** — but `getContent()`→`assertMayRead()`
**hard-refuses any document attached to a patent** ("only available through the confidential patents portal"),
so patent PDFs are reachable ONLY via the passcode-gated `/patents/:id/document/content`.
**Web:** `app/patents/page.tsx` (Super-Admin-only two-pane portal: Client Code list + patents pane with
Reveal/Hide toggle, add-by-number, upload-as-patent, per-patent edit/attach/download); `lib/passcode-context.tsx`
(the "Confirm big change" modal; opens on any `PASSCODE_*` 403; session-cached passcode w/ sliding TTL; shared
across concurrent guarded requests); `NewProjectModal.tsx` patent picker (handle-only, client derived server-side);
`lib/api.ts` blobReq passcode interceptor. `patent.view` ∈ VIEW_BASICS (every role); `patent.manage` = Super-Admin only.
**UI hotspots:** passcode modal stacking (reveal-over-portal); un-truncated `font-mono` handles (portal `w-32` clip)
+ real-numbers; reveal toggle; editable inline client-code inputs; doc-name button truncation.

## Roster & access
- **Super Admin (2):** Mohit Kalra, Yash Bhargava — full portal (`patent.manage`).
- **Everyone else (26):** `patent.view` only (handle-only picker) — the portal, /clients, /patents, /reveal,
  document routes should all **403** for them. HR has no project surface at all.

## Tester → persona → lens
| # | Person | Role | Lens / focus |
|---|---|---|---|
| 1 | Mohit Kalra | Super Admin | Portal client-code panel: create/edit/delete + the **re-mint-on-rename** mechanics |
| 2 | Yash Bhargava | Super Admin | **Reveal + passcode step-up**: lockout, TTL caching, reset-with-password, concurrent sharing |
| 3 | Nitin Goel | Manager | Confidentiality boundary: as a non-SA authority, what patent data can I reach? (clients/patents/reveal → 403?) |
| 4 | Neha Shukla | Senior Consultant | Oversight leak — does org-wide oversight expose patent/client data or handle→client correlation? |
| 5 | Ketan Dagar | Sr Research Assoc | Patent picker (handle-only) + project-create client derivation + cross-client rejection |
| 6 | Amritpal Kaur | Sr Research Assoc | Patent registration (POST /patents): real-number→handle mint, per-client dedup, handle format |
| 7 | Basant Goyal | Sr Research Assoc | `from-document` upload (filename-as-patent-number is the only gate; no passcode on multipart) |
| 8 | Khushi Gupta | Sr Research Assoc | Permission matrix (role × patent endpoint: clients/patents/reveal/options/document) |
| 9 | Meetu Singh | Consultant | **Handle→client leak** — `Pat_MLK_001` embeds the client code; can a Consultant correlate matter→client? |
| 10 | Vijay Mishra | Consultant | Document confidentiality — generic `/documents/:id/content` refusal for patent blobs; filename = real number |
| 11 | Ajay Sharma | Consultant | Passcode bypass — no-op-if-unconfigured, header injection, TTL reuse, concurrent-request sharing |
| 12 | Anant Gupta | Employee (intern) | Empty / no-data states (wiped DB): portal with no clients, picker with no patents, reveal empty |
| 13 | Aman Sharma | Employee (intern) | Loading + error states across portal / picker / passcode modal (silent failures, error copy) |
| 14 | Arjun Ghosh | Employee | Responsive / mobile: portal two-pane, passcode modal, patent list, inline edit on phone |
| 15 | Ankit Verma | Employee | Accessibility: passcode modal (focus-trap/aria), reveal toggle, portal tables, picker |
| 16 | Divyanshu Saxena | Employee | Links / nav: portal route guard (SA-only), direct `/patents` URL as non-SA, deep-links |
| 17 | Drishti Jain | Employee | Data correctness: handle serial numbering, re-mint correctness, counts, dedup, FY |
| 18 | Geetesh Rathore | Employee (intern) | **UI/CSS-conflict + visual**: un-truncated `font-mono` handles/real-numbers (w-32 clip), overflow, reveal |
| 19 | Poorvi Gupta | Employee (intern) | Render / perf: reveal query, portal fetch, picker fetch, N+1 on patents/clients |
| 20 | Ragini Kumari | Employee (intern) | Consistency: handle/chip rendering across portal vs picker vs project header; reveal states |
| 21 | Rajesh Joshi | Employee (intern) | Copy / microcopy: portal strings, passcode modal copy, reveal/hide labels, error text |
| 22 | Ritik Sharma | Employee (Sr BD) | Non-delivery view — can a BD person reach any patent/client data? relevance |
| 23 | Ronak Khandelwal | Employee | Interaction / feedback: reveal/hide, client CRUD, upload, passcode retry — feedback/double-submit |
| 24 | Sugandh Raghav | Employee | Visual polish: portal spacing/icons/colors, reveal toggle, chips |
| 25 | Tanisha Jain | Employee (intern) | Edge / malformed data: long client name/code, huge serial, special chars, re-mint edge, deleted-code recreate |
| 26 | Vandana Boora | Employee | Suggestions / UX: what's missing (search, bulk, audit trail, export, reveal-audit) |
| 27 | Shaveta Sharma | HR | **No-access persona** — Patents fully hidden/blocked? leaks via home/search/notifications? |
| 28 | (boundary) | — | Authz/IDOR + passcode security: cross-tenant clientId, lockout bypass, reveal audit-logging, doc-route invariant, direct-API |

## Progress log
- 2026-07-25: Round 2 (Patents) started. Surface mapped (SA-only portal + confidentiality boundary). Launching 28 tracing agents in cap-sized waves; live check + adversarial verification to follow.

---
# FINDINGS
Severity: HIGH (broken/leak) · MED · LOW · UI · SUGG. Each CONFIRMED (traced) or PLAUSIBLE.

### #9 Meetu (Consultant) — handle→client-code leak
- **HIGH** the coded handle **un-codes to the client** — `formatPatentHandle` builds `Pat_<clientCode>_<serial>` (`financial-year.ts:25`), the code is a mandatory human mnemonic that by design resembles the client name (DTO example `MLK`→`Malikie`). So stripping `client.name`/`clientId` for non-`patent.manage` users is **theatre** — client identity survives inside the un-redactable handle string the same response ships. CONFIRMED.
- **HIGH** **`GET /patents/options` has NO membership scoping** — gated only on `patent.view` (in VIEW_BASICS, every role incl. interns); the `clientId` filter is optional, so calling it with no args returns `{id,handle,serial}` for **every** non-deleted patent in the org. A Consultant on one matter can harvest the firm's entire client-code roster (unlike `projects.list` which applies the conflict-wall). `patents.controller.ts:65`, `patents.service.ts:122`. CONFIRMED.
- **MED** the "we stripped clientId so you can't correlate" defence is defeated by the code living in the handle; serials are per-client sequential and returned to every `patent.view` caller → leaks **per-client portfolio size + registration order** (competitive intel) even without real numbers; the client **code is treated as non-confidential everywhere** (rendered as a chip in project detail + picker), contradicting the redaction model. CONFIRMED.
- **LOW** the picker search box is a **client-existence/size oracle** (type a suspected code → confirm the client exists + rough patent count).
- **SUGG** mint opaque handle tokens (unrelated to the name) + reclassify the client code as confidential + scope `/patents/options` to the actor's projects (and consider not returning per-client `serial` to non-manage callers). NOTE: handle→**real-number** remains correctly gated by `patent.manage` + passcode — this leak is handle→client-**identity** only.

### #8 Khushi (SRA) — permission matrix ⭐ (found the critical passcode bypass)
- Full role×endpoint matrix captured: `patent.manage` is genuinely **Super-Admin-only** (Admin explicitly excluded); the ONLY non-SA-reachable endpoint is `/patents/options` (handles only). No cross-role reach to real numbers/client names via the API.
- **HIGH (CRITICAL)** **real number leaks in the passcode-FREE overview via `documentName`** — `PATENT_OVERVIEW_SELECT` includes `documentName` (`patents.service.ts:13`); `from-document`/`attachDocument` store `documentName = filename` and the upload REQUIRES the filename to be the patent number; `GET /patents` (`:53`) has NO `@RequirePasscode`; `page.tsx:289` renders it cleartext beside the masked `•••••`. So real numbers are visible **without the passcode** — defeats the module's core promise. Fix: drop `documentName` from the overview (show a "has document" boolean), or move the overview behind the passcode. CONFIRMED.
- **MED** passcode guard **fails OPEN** — `if (!isConfigured(orgId)) return true` (`passcode.guard.ts:34`) means reveal + all client mutations + doc download downgrade to `patent.manage`-only on any org with no passcode set (demo/Contabo have it; a newly-provisioned org is exposed). CONFIRMED.
- **MED** **writing** real numbers is NOT passcode-gated while reading is — `POST /patents`, `from-document`, `PATCH /patents/:id` need only `patent.manage`, no step-up; a manage-holder without the passcode can create/overwrite/delete real numbers (tamper) though not read them. CONFIRMED.
- ✅ client `can()` gates agree with server; `patent.view` in VIEW_BASICS is defensible (the residual exposure is the embedded client code, per #9/#4).

### #6 Amritpal (SRA) — register/mint/dedup
- **HIGH** register dedup does **no normalization** → duplicate patents/handles for one real number — `US1234567` vs `us1234567` vs `US 1,234,567 B2` all treated distinct (case-sensitive exact match); client codes ARE normalized, real numbers aren't (asymmetric). CONFIRMED.
- **HIGH** the two registration paths store **different canonical forms** — register-by-number stores raw-trimmed; `createFromDocument` stores `normalizePatentNumber(filename)` → cross-path dedup silently fails; stored `realNumber` is non-deterministic by entry path. CONFIRMED.
- **MED** TOCTOU on dedup (seen-query outside a tx, no DB `@@unique([clientId, realNumber])` backstop) → concurrent/double-submit both create; `updatePatent` bypasses dedup AND normalization; **no format validation on register-by-number** (arbitrary free text stored as a "real number"; only the upload path validates); no `@MaxLength`/`@ArrayMaxSize` on `realNumbers` (unbounded length + batch). CONFIRMED.
- **SUGG** route both register paths + updatePatent through `normalizePatentNumber` + `isPatentNumber`, add a partial `@@unique([clientId, realNumber]) WHERE deletedAt IS NULL`, cap the array + element length.
- ✅ serial allocator is genuinely race-safe (atomic INSERT…ON CONFLICT per client scope); partial indexes correctly allow deleted-code recreation without handle collision.

### #4 Neha (Sr Consultant) — oversight leak
- **HIGH** oversight (`project.approve`) + `patent.view` lets a Sr Consultant open **every** project org-wide and script a **matter→client-code map** — each handle's middle token is the client code, a client-name mnemonic — nullifying the `patent.manage` client-name redaction (conflict-wall breach for an IP firm). CONFIRMED. (Corroborates #9.)
- **HIGH** `/patents/options` (patent.view-only, unscoped) leaks the whole client-code roster to every delivery employee. CONFIRMED.
- **MED** the false-security code comments ("omitting clientId blocks correlation") guard the wrong field and mislead maintainers. **LOW** free-text project `title` returned org-wide is a secondary identity channel.
- **SUGG** decouple the handle from the client code (opaque token / random slug), keep the mnemonic behind `patent.manage`, or gate the handle block on `patent.manage`.

### #5 Ketan (SRA) — picker + client derivation
- **HIGH** project-**create** response **leaks the derived `clientId`** — `create()` returns the row with `clientId` and `redactProject` only strips `clientDueDate`, so a `patent.view`-only creator gets the `clientId` the **read** path deliberately deletes (`projects.service.ts:158-178,254`). CONFIRMED. (No client name / real number — those need patent.manage+passcode.)
- **MED** `/patents/options` accepts a `clientId` filter from patent.view callers → chained with the leaked clientId, enumerate **all** of one client's handles (an authoritative client→patent grouping). Fix: the patent.view options endpoint should ignore/reject `clientId`.
- **LOW** the "can't correlate handle→client" comment is overstated (handle embeds the code). ✅ VERIFIED CLEAN: client is server-derived (never client-supplied), patent.view re-checked on attach, cross-client + cross-org attaches rejected, `realNumber` never reachable by patent.view.

### ⭐⭐ CRITICAL (corroborated by 5 testers) — real patent number leaks WITHOUT the passcode
Khushi #8, Yash #2, Basant #7, Vijay #10, Poorvi #19 all independently confirmed: `PATENT_OVERVIEW_SELECT` includes `documentName` (`patents.service.ts:13`); `createFromDocument`/`attachDocument` store `documentName = the uploaded filename`, and the upload REQUIRES the filename to be the real patent number; `GET /patents` (`:53`) is `patent.manage` with **NO `@RequirePasscode`**; `page.tsx:289` renders it cleartext next to the masked `•••••`. So the real number the whole reveal/passcode machinery guards is handed back verbatim through an un-gated field. **FIX: drop `documentName` from the overview select (keep it only in the passcode-gated FULL_SELECT); expose a "has document" boolean instead.** Also lower gcTime on the `['patents']` cache (Poorvi: the leaked number lingers ~5min in the client cache).

### #2 Yash (SA) — reveal + passcode step-up
- **HIGH** real-number leak via `documentName` (see CRITICAL). CONFIRMED.
- **HIGH** reveal is **silently ungated when the org has no passcode** — `if (!isConfigured(orgId)) return true` (`passcode.guard.ts:35`); a deploy that runs migrate+regrant but skips `set-passcode.ts` leaves reveal + doc-download fully open (fails OPEN, invisibly). CONFIRMED.
- **HIGH** reveal / passcode-failure / lockout are **entirely unaudited** — zero AuditService/EventService calls in the patents module or passcode flow; no record of who revealed which client numbers. CONFIRMED.
- **MED** frontend passcode cache is a **sliding 15-min TTL that renews on every guarded call** → one entry silently authorizes all reveals/downloads for an active session; **not cleared on logout** (`clearPasscodeCache` has zero call sites; Sign-Out is soft SPA nav) → next user on a shared tab inherits it. Lockout is in-memory per-ORG (one insider's 5 fails lock all SAs 15min; resets on restart; per-replica if scaled). `resetWithPassword` collapses the step-up to the account password for any admin. CONFIRMED.
- **LOW** reveal returns secrets over a cacheable GET with no `Cache-Control: no-store`; verify leaks exact `remaining` count; 6-char floor no complexity.
- ✅ reveal is the only endpoint whose select carries `realNumber`; guard order Auth→Permission→Passcode correct; concurrent requests share one modal.

### #11 Ajay (passcode bypass, attacker lens)
- **HIGH** unconfigured-org fail-open (dup) + frontend cache never cleared on logout (dup) = two concrete step-up bypasses. CONFIRMED.
- **MED** one entry authorizes ALL step-up endpoints for a sliding 15min (confused-deputy); `resetWithPassword` lets any Admin re-arm the passcode with just their login password (LOWER bar than `change`); per-org lockout = one-insider org-wide DoS; **writing real numbers is not passcode-gated** (register/from-document/PATCH) — protects confidentiality not integrity. CONFIRMED.
- **LOW** `remaining` count leak; passcode in `x-org-passcode` header (proxy-log risk, deployment-dependent).
- ✅ guard order + argon2 constant-time verify + memory-only (never localStorage) all sound.

### #1 Mohit (SA) — client CRUD + re-mint
- **HIGH** **Prisma schema ↔ DB drift** — schema still declares plain `@@unique([org,code])`/`([org,handle])`/`([clientId,serial])`, but the 20260814 migration made them PARTIAL (`WHERE deletedAt IS NULL`); Prisma can't express the WHERE, so a future `migrate dev` will DROP the partial + restore FULL → **silently re-breaks deleted-code recreation + rename**, and can fail to apply if soft-deleted dup rows exist. CONFIRMED.
- **HIGH** concurrent `registerPatents` **during a rename leaves a stale handle carrying the OLD code** (serial allocated outside the rename tx) → permanent silent corruption (`Pat_OLD_N` beside `Pat_NEW_*` siblings); if the rename was to sever a leaked code↔client link, the old code re-appears. CONFIRMED (race).
- **MED** rename re-mint is N sequential updates inside one interactive tx → **times out (P2028) for a client with many patents** → rename impossible at scale; a pre-existing stale handle permanently blocks a legit rename; a client **name cannot be cleared** via the edit UI (`ename.trim() || undefined` omits the field). CONFIRMED.
- **LOW** createClient/updateClient TOCTOU → raw P2002 500 instead of the friendly message under concurrency; no cross-client real-number dedup; recreated code restarts serials at 1 (string-identical to deleted originals — audit confusion).
- **SUGG** convert rename to a single set-based `UPDATE`; make the schema reflect the partial indexes (or document the drift loudly).

### #7 Basant (from-document upload)
- **HIGH** `documentName` real-number leak (see CRITICAL). CONFIRMED.
- **MED** **soft-deleting a patent orphans its confidential document** — `deletePatent`/`deleteClient` set only `patent.deletedAt`, the Document stays live; `assertMayRead`'s patent-guard matches only non-deleted patents (`documents.service.ts:204`), so after deletion the crown-jewel block no longer fires and the uploader can stream the real-number-named PDF via the un-gated generic `/documents/:id/content` with NO passcode. Also a retention leak (bytes never freed). CONFIRMED.
- **MED** lenient `isPatentNumber` (`^[A-Z]{0,2}\d{5,13}[A-Z]{0,2}\d?$`) mis-parses benign/date/numeric filenames (`20240101.pdf`) into confidential patents; app-level dedup TOCTOU with no DB `@@unique([clientId, realNumber])`; writes to real numbers need only `patent.manage`, no passcode, unaudited (contradicts the class docstring). CONFIRMED.
- **LOW** no server-side file-type allow-list (any ≤20MB file stored; download is nosniff+octet-stream so no in-origin exec). **SUGG** realNumber has zero authenticity (filename-derived, never checked vs content).
- ✅ path traversal safe (randomUUID storage key, basename strip); generic route blocks LIVE patent docs; org scoping + size limits enforced.

### #10 Vijay (document confidentiality, Consultant)
- ✅ **INVARIANT HOLDS for a non-SA** — no route yields patent bytes or the real-number filename to a `patent.view`-only user; `assertMayRead` patent-guard runs FIRST for every live patent-linked doc (incl. if also a project/task/comment file); `patentOptions`/project-detail strip `documentName`; the doc route needs `patent.manage`+passcode. CONFIRMED SOLID.
- **HIGH** `documentName` leak (audience = patent.manage, not a Consultant) (see CRITICAL). CONFIRMED.
- **MED** the passcode-gated `/patents/:id/document/content` **self-refuses** — it delegates to the same `getContent` whose patent-guard throws for ALL patent docs → the portal's own "View document" is a **dead feature** (403 even after clearing the passcode). Over-strict/fail-closed (not a leak), but the obvious fix must bypass ONLY the patent-guard, never the passcode/permission layer. CONFIRMED.
- **MED** soft-deleted-patent document leak (dup of Basant). **LOW** distinct 403 message is a patent-document existence oracle.

### #19 Poorvi (render/perf)
- **HIGH** the leaked `documentName` real-number lingers in the **client-side React Query cache** (`['patents', selected]`, default ~5min gcTime) → the passcode gate is undermined by a cached side-channel. CONFIRMED.
- **MED** the project picker fetches ALL org patents unbounded (client-side filter — scale); the whole portal is one component so every keystroke re-renders both lists (low impact now).
- **LOW** reveal re-fetches on each Hide→Reveal (by-design, re-checks passcode); openDoc blob URL stays live ~60s.
- ✅ VERIFIED SOUND: 1 query on mount (no waterfall), per-client count is a single `_count` aggregate (NOT N+1), selecting a client refetches only that client, and the **reveal payload is correctly kept OUT of the query cache** (mutation→local state, cleared on client switch).

### #3 Nitin (Manager, non-SA boundary)
- ✅ **BOUNDARY INTACT** — full endpoint table: every `patent.manage` route 403s for a Manager (`patent.view`≠`patent.manage`, exact-code check, no view→manage hierarchy); the ONLY route a Manager passes is `/patents/options` (handle-only, no clientId/documentName/realNumber). No real-number/client-name leak to a non-SA on any traced path. CONFIRMED.
- **MED** `/patents/:id/document/content` **broken for everyone incl. SA** (dup of Vijay — over-strict, fail-safe). **LOW** generic `/documents/:id/content` has no `@RequirePermission` (safe for patents via the hard-block, but the whole defense rests on one `findFirst`); `/patents` page not server-route-gated (safe via API 403s + `enabled` fetch guards).

### #16 Divyanshu (nav/route-guard, non-SA)
- ✅ **NO nav path exposes portal data to a non-SA** — sidebar hides /patents (patent.manage); direct URL → clean "Restricted" screen; both queries `enabled: allowed` (fetches never fire); no SSR/RSC/prefetch leak (page is `'use client'`, no server fetch); `can()` fails closed during load; no link from search/home/projects; project-detail patent chips are non-link spans (handles only, redacted server-side). CONFIRMED SOUND.
- **LOW** the route guard is soft (safety rests on the fetch guards + API 403s) — a future dev adding an un-`enabled` fetch would defeat the client gate (API still 403s). Consider a middleware/route-wrapper for defense-in-depth.

### #13 Aman (loading/error)
- **HIGH** both list queries (clients, patents) have **no error state** → a fetch failure renders as "empty"; worse, a patents-load failure also **disables Reveal** and tells the user to upload duplicates. CONFIRMED.
- **MED** passcode "submitting" spinner is **dead code** (modal closes synchronously on confirm) → wrong passcode reads as "worked then bounced"; all 9 mutations funnel to a **single bottom-of-page `err` string** (off-screen, last-write-wins, no toast); opening a patent doc has no loading state + silent popup-block no-op.
- **LOW** no success feedback on any mutation; cancelling the passcode prompt surfaces a red "error"; stale "Hide numbers" after a client switch (no real-number leak — keys don't match).
- **UI** the benign "Skipped N files" notice is styled identically to a real error.
- ✅ VERIFIED GOOD: never prompts for a passcode on load; does NOT leak whether an org passcode is configured (generic modal copy); wrong-passcode attempts-remaining + lockedUntil ARE shown.

### #15 Ankit (accessibility)
- **MED** passcode modal has `role=dialog aria-modal` but **no focus trap / no focus return / Escape only when input focused**; passcode input has no programmatic label; errors not announced (`aria-live`); NewProjectModal (holds the picker) isn't a semantic dialog at all. CONFIRMED.
- **MED** unlabelled icon-only buttons (patent Save/Cancel `:275-276`, attach file input, modal close); low-contrast `text-gray-400`/`text-gray-300` (the edit-pencil affordances ≈1.6:1 fail 3:1); client selection is color-only (no `aria-current`); Reveal/Hide isn't a state-announcing toggle.
- ✅ global un-layered `:focus-visible` still applies despite `focus:outline-none` (focus ring largely present).

### #14 Arjun (responsive)
- **UI/HIGH** patent row **clips the trash/attach controls** when a document is attached — 5 `shrink-0` blocks (`w-32` handle + doc button + attach + trash) exceed a 360px pane; `overflow-hidden`+shell `overflow-x-hidden` make them **unreachable, not scrollable**. Fix: `flex-wrap` + `w-24 sm:w-32` + hide filename text `<sm`.
- **UI/HIGH** inline client-code edit: the **Name input collapses to ~0px** on a phone because the Reveal/Hide+trash cluster isn't hidden during edit. Fix: hide that cluster while editing / stack the edit row.
- **UI/MED** revealed real number has no `truncate` → overlaps the action icons; header subtitle squeezes to a 4-5 line wrap next to Reveal.
- ✅ passcode modal + the two-pane→stacked collapse are phone/tablet-safe.

### #17 Geetesh (UI/CSS-conflict)
- **UI/HIGH** patent handle in `w-32 shrink-0` has **no `truncate`** → a long `Pat_LONGCODE_001` (client code inputs have no `maxLength`) spills into the number column. Fix: `truncate` + `title`.
- **UI/MED** doc-name button `truncate` span has **no `min-w-0`** → ellipsis never fires, name spills over the paperclip/trash; same on the client-code header `<h2>`; revealed real number span no `min-w-0`/`truncate`; picker handle clipped with no ellipsis/tooltip. All one/two-class fixes (`truncate min-w-0` + `title`). CONFIRMED.
- **LOW** toasts (`z-[100]`) sit above the passcode modal (`z-[80]`) — corner-anchored so minor. ✅ no `<Avatar>` on these surfaces (that class of bug absent); two-pane split + edit-row shrink recipe are sound.

### #20 Ragini (consistency)
- **UI** the patent **handle chip renders 3 different ways** (portal blue plain / picker gray plain / project-detail amber pill) — 3 colors, 3 weights, 2 sizes, only one is a chip. Extract one `<PatentHandle>`.
- **UI** portal gives **NO success feedback + no toasts** (all 9 mutations → one bottom `err` string) unlike every sibling module; "Passcode required" hint shown on only 1 of ~5 gated actions.
- **LOW** "PID pending" rendered 4 ways + 2 wordings ("PID pending" vs "Project ID pending"); passcode modal hand-rolls its dialog vs the shared `<Modal>` (title size, scroll-lock, focus, Escape drift); masked placeholder is an arbitrary 9-bullet literal. Amber handle chip collides with the app's "confidential/locked" amber semantic.

### #21 Rajesh (copy/text)
- **HIGH** the header promise **"real patent numbers unlock only with the organization passcode" is false** — the doc filename (which users are TOLD to set to the patent number) renders unmasked with no passcode; copy overstates confidentiality (dup of CRITICAL; needs the eng fix + a copy softening + relabel the "name the file as its number" instruction).
- **MED** "real number" is math-jargon + inconsistent with "patent number" (`:232`); standardize on "patent number".
- **LOW** "Patent ID"(handle) vs "patent number"(real) easily conflated; access copy hardcodes "Super Admins" (gated on `patent.manage`); "Client Code" heading singular over a list; ASCII "..." vs "…"; "(s)" pluralization + "1 tasks"; empty-state ignores add-by-number; lockout time in en-US not en-IN.
- ✅ passcode modal copy does NOT leak configured state (generic, only appears on 403).

### #23 Ronak (interaction/feedback)
- **HIGH** sole error channel is a **page-bottom shared `err` string** — off-screen, clobbered by concurrent errors (one scalar), no `aria-live`, and the app-wide `useToast` is **not imported at all**; **file uploads have no disabled state** → double-submit + clobbered per-row spinner (shared mutation object); passcode modal "submitting" spinner is **dead code** (modal unmounts same tick) → zero in-flight feedback. CONFIRMED.
- **MED** cancelling the passcode modal surfaces a raw red error; "Skipped N files" written to the red error slot; `openDoc` no loading state + silent popup-block; **no success feedback on any mutation**.
- **LOW/UI** some success handlers don't clear stale `err`; shared mutation over-disables all rows; native `confirm()` for deletes; no optimistic UI. **FIX: route the whole portal through `useToast` + disable upload inputs while pending + fix the passcode spinner.**

### #22 Ritik (Sr BD Exec) — non-delivery least-privilege
- **MED** `patent.view` lives in **VIEW_BASICS**, so every Employee (incl. BD + interns) inherits the patent picker despite doing no patent work; `/patents/options` is **org-wide with NO project-membership scoping** → a BD insider enumerates the firm's entire coded-client roster in one call; per-client **portfolio SIZE is computable from the returned serials** (competitive/deal-size signal). CONFIRMED (enumeration) / PLAUSIBLE (client re-identification via mnemonic codes).
- **SUGG** the code comments claim patent.view = "delivery roles / Super Admin by default" but the catalog grants it to literally every role — reassuring-but-false. **FIX: move `patent.view` out of VIEW_BASICS onto delivery presets only; scope `/patents/options` to the actor's own matters.**
- ✅ org always session-derived; real numbers, client names, doc bytes stay behind `patent.manage`+passcode — the boundary that fails is purely intra-org least-privilege.

### #26 Vandana (suggestions, top 8)
- **SUGG (high)** **#1 gap = no reveal/download audit trail** — `PatentsService` never calls `EventService.emit` (not even injected), yet the org has a single-writer audit spine ("every meaningful mutation calls emit()"). The two most sensitive actions in the app (reveal real numbers, download a patent doc) + register/edit/delete leave **zero forensic record** of who unmasked which client's numbers. Cheap fix: inject EventService, emit `patent.reveal`/`patent.document.download`/etc with actorId+clientId+handle (never the realNumber in the log).
- **SUGG (high)** **"passcode configured?" indicator + fail-closed** — the UI hard-codes "unlock only with the passcode" with no signal of whether one is actually set; a `GET /org/passcode/status` banner + fail-closed on reveal/download would close the fail-open trap.
- **SUGG (med-high)** reveal auto-expiry / re-lock-on-blur (numbers linger on screen indefinitely today); **delete doesn't check `Patent.projectLinks`** → silently orphans a project's basis of analysis (schema has the reverse relation, unsurfaced); format validator/normalizer on the manual add + inline-edit paths (dedup defeated); passcode-gated CSV export + bulk import; per-patent status/notes/jurisdiction fields; (honorable: 2-person reveal rule, doc watermarking).
- **Verdict:** access model strong (default-deny, handle/number split, RBAC+passcode) but **immature on accountability + lifecycle** — reveals/downloads unlogged, gate can silently fail-open, revealed numbers don't expire. Ship the audit trail + passcode-status first.

### #24 Sugandh (visual polish)
- **UI** the two panes use different gutters (left `px-4` vs right `px-5`); the "Add patents" block is inset 4px less than its own rows (`p-4` vs `px-5`); the two CTAs zig-zag (Add-patents right-aligned, Choose-files left); row dividers `divide-gray-50` lighter than the card border (lists read as a blob); action-icon sizes drift 13/14/15; inline-edit input has **no focus state** (`focus:outline-none`, no replacement); two brand buttons different heights (no shared Button primitive); reveal toggle shifts letter-spacing (`tracking-widest` masked vs normal revealed). CONFIRMED.
- **UI** the brand `accent` orange token (#fe841f) is **used 0× app-wide** — Patents leans entirely on generic `amber-*` (37 usages); either adopt it or retire the token. Passcode modal forks from the shared `<Modal>` (title size, header padding, no bordered footer, one-off `z-[80]`). Empty states are bare text while "Restricted" gets an icon+heading (inconsistent weight).
- **Verdict:** clean + readable but polish drifts at every seam of the hand-rolled two-pane view.

### #27 Shaveta (HR) — no-access persona
- ✅ **HR IS FULLY + INTENTIONALLY WALLED** (HR_CODES doesn't spread VIEW_BASICS → no patent.view/manage): nav hidden; `/patents`→Restricted (queries `enabled:allowed` never fire); ALL `/patents/*` + `/clients/*` 403 incl. `/patents/options` (HR lacks patent.view); picker hidden; global search carries no patent data; home cards null; notifications clean; project list+detail strip `patents`+`client` server-side even when HR is staffed on a matter. CONFIRMED SOUND.
- **MED (PLAUSIBLE)** the un-redacted free-text project **`title`** bypasses the whole redaction scheme — and the create form's placeholder literally suggests `"Invalidity — Acme Patent US1234567"`, actively steering creators to embed the client name + real number into the title, which a staffed HR would then see verbatim. Fix: sanitize the placeholder guidance / discourage real numbers in titles. (Same title-leak vector flagged in Round 1 Projects.)

### #17b Drishti (data correctness)
- **HIGH** the **two ingest paths store divergent canonical forms** — `registerPatents` stores `.trim()`-only (no normalize, no format check, no length cap); `createFromDocument` stores `normalizePatentNumber(...)`. So `"US 9,876,543 B2"` (registered) and `US9876543B2.pdf` (uploaded) become **two patents / two serials / two handles for one real patent**, and inflate the per-client count. `updatePatent` also skips normalize + dedup. CONFIRMED.
- **MED** no `(clientId, realNumber)` DB uniqueness — dedup is non-atomic read-then-write → duplicates on races/cross-path; register-by-number has no `@MaxLength`/format validation unlike from-document.
- **LOW** zero-pad is width-3 only (`Pat_MLK_1000` unpadded — safe because all queries sort by numeric serial); serial gaps on soft-delete (by-design).
- ✅ VERIFIED CORRECT: per-client count matches live non-deleted (but counts handles, so dup rows inflate it); **re-mint PRESERVES serials** (`Pat_OLD_003→Pat_NEW_003`, no renumber); delete-then-recreate is clean (partial indexes); serial allocation atomic + per-client.

### #28 boundary — API authz / passcode security
- **HIGH** real-number disclosure via `documentName` on the non-gated `GET /patents` overview → call `/patents` instead of the passcode-gated `/patents/reveal` and read real numbers with no step-up (dup of CRITICAL — final corroboration). CONFIRMED.
- **HIGH** reveal / passcode-fail / lockout / client+patent CRUD are **never audited** (no EventService/AuditService anywhere in the module or passcode flow) → mass real-number disclosure leaves zero trail; brute-force undetectable. CONFIRMED.
- **MED** lockout is per-ORG not per-user/IP (one insider's 5 fails lock ALL SAs 15min — griefing DoS); in-memory per-process (restart-reset, per-replica bypass at AWS scale); fails-OPEN if no passcode configured; **soft-deleted patent breaks the "portal-only" doc invariant** — `assertMayRead` matches `documentId, deletedAt:null`, so after `deletePatent` the generic `/documents/:id/content` serves the real-number-named PDF to its uploader with no passcode (fix: drop `deletedAt:null` from the patent guard). CONFIRMED.
- **LOW** `/patents/:id/document/content` 403s for everyone (fail-closed — dup Vijay/Nitin).
- ✅ VERIFIED BLOCKED (secure): cross-tenant/IDOR (org always session-derived, every lookup filters organizationId; foreign id → NotFound); guard order Auth→Permission→Passcode; no 403-vs-404 oracle; patent.view containment (options returns only id/handle/serial — can't even obtain a documentId to target).

### #26 Tanisha (edge/malformed data)
- **MED** "Add by number" accepts **ANY string** as a real patent number — `isPatentNumber` is upload-path-only, register-by-number has no `@Matches`/shape check → `"hello world"`/emoji/blobs mint real `Pat_` handles into the confidential store; the web textarea **splits on commas** (`page.tsx:68`), so pasting `US 9,876,543 B2` shreds into 3 junk patents (`US 9`/`876`/`543 B2`); no `@ArrayMaxSize` → unbounded sequential mint loop (~100k entries, partial-batch on mid-failure); `updateClient` re-mint N-updates-in-one-interactive-tx times out on a large client. CONFIRMED.
- **LOW** realNumber length cap inconsistent across the 3 paths (register unbounded / upload 100 / edit 100); TOCTOU dedup (no `(clientId,realNumber)` unique); `normalizePatentNumber` extension-strip mis-parses dotted digits (`1234567.890.pdf`→`1234567890`); no pagination (a 10k-patent reveal dumps every real number); web uploads one-by-one (first reject aborts the rest); inputs have no `maxLength`.
- ✅ VERIFIED SAFE: client-code regex resists unicode bypass (no ReDoS); path traversal neutralized (basename + randomUUID storage key); delete-then-recreate safe (partial indexes); huge-serial only theoretical (Int max 2.1B).

## FIXES APPLIED (2026-07-26) — verified (API + web `tsc --noEmit` clean)
**P0 confidentiality (backend):**
- **`documentName` real-number leak CLOSED** — dropped `documentName` from `PATENT_OVERVIEW_SELECT`; the passcode-free overview now returns only `documentId` (a "has-document" flag); the web shows a generic "Document" link and downloads the bytes via the passcode-gated route by patent id (never the filename). Kept in the passcode-gated FULL_SELECT only.
- **Passcode fail-CLOSED** on the crown-jewel reads — `revealPatents` + `documentContent` now `assertPasscodeConfigured` (deny if the org has no passcode set), instead of the global guard silently no-opping. (Targeted so it doesn't affect the RBAC/people/org step-up routes.)
- **Audit trail** — `PatentsService` now injects `EventService` and emits `patent.revealed` / `patent.document_downloaded` / `patent.registered` / `patent.updated` / `patent.deleted` / `patent.client_deleted` / `patent.client_recoded` (actorId + clientId + counts — never the realNumber).
- **Soft-delete document leak CLOSED** — `assertMayRead` now matches a patent's document regardless of the patent's deleted state (a deleted patent's real-number-named PDF stays refused on the generic route); `deletePatent` + `deleteClient` now soft-delete the linked Document(s) too.
- **`/patents/:id/document/content` dead feature FIXED** — new `DocumentsService.getContentForPatentPortal` (trusted read, bypasses ONLY the patent refusal; authz already done upstream by patent.manage+passcode+org-scope), so the portal's own passcode-gated download works.
- **Logout cache** — `logout()` now calls `clearPasscodeCache()` so the next user on a shared browser can't inherit the step-up.

**P1 integrity:**
- Dedup normalization — register-by-number + `updatePatent` now run every number through `cleanRealNumber` (normalize + `isPatentNumber` validate), so the two entry paths converge and garbage is rejected; the web textarea splits on **newline only** (a comma no longer shreds `US 9,876,543 B2`); DTO caps `realNumbers` at 500 × 100 chars.
- Rename re-mint given a 120s tx timeout so a large client's handle re-mint doesn't hit the 5s interactive-tx limit.

**Deferred (larger / design / policy — NOT changed this pass):**
- **Handle→client-identity** (`Pat_MLK_001` un-codes to the client; `/patents/options` org-wide unscoped) — **design decision, held for the user** (opaque tokens / move `patent.view` off VIEW_BASICS / scope options to the actor's matters).
- Writes-need-passcode + `resetWithPassword`-uses-login-password — **policy calls**.
- Set-based raw-SQL rename (kept the loop + timeout — raw SQL needs table/column-name verification against a live DB); per-user/IP lockout (needs Redis for AWS); the schema↔partial-index drift doc; portal a11y + shared-Modal + visual polish + terminology; reveal auto-expiry / CSV / per-patent status (features); project-`title` leak (shared with Round 1).

## ROUND 2 (Patents) — 28/28 tracing agents COMPLETE (2026-07-25)
Extremely high cross-corroboration. Live browser check: logged in as Super Admin (Round 1), app renders on wiped DB.

### ⭐ Convergent themes / fix priority (confirmed, root-cause)
**P0 (confidentiality — patent-KPO critical):**
1. **`documentName` real-number leak** (5+ testers: Khushi/Yash/Basant/Vijay/Poorvi/boundary/Rajesh) — drop `documentName` from `PATENT_OVERVIEW_SELECT`; expose a `hasDocument` boolean; web download link fetches by patent id, not filename. Also lower `['patents']` gcTime.
2. **Passcode fails OPEN when unconfigured** (Yash/Ajay/Khushi/boundary) — fail-CLOSED on reveal + document routes (deny if no org passcode set); surface a "passcode configured?" status so an operator isn't blind.
3. **No audit trail** (Yash/Vandana/boundary) — inject EventService; emit `patent.reveal`/`patent.document.download`/register/update/delete (actorId+clientId+handle, never the realNumber).
4. **Soft-deleted patent → document leak** (Basant/Vijay/boundary) — drop `deletedAt:null` from `assertMayRead`'s patent guard (match on documentId regardless of patent state); soft-delete the Document alongside the patent.
5. **Frontend passcode cache never cleared on logout** (Yash/Ajay) — call `clearPasscodeCache()` in `logout()`; consider shortening/one-shot TTL.

**P1 (integrity + silent-failure):**
6. Dedup normalization — route register-by-number + updatePatent through `normalizePatentNumber`+`isPatentNumber`; add partial `@@unique([clientId, realNumber]) WHERE deletedAt IS NULL`; cap `realNumbers` array+element length (Amritpal/Drishti/Basant).
7. Rename re-mint → single set-based UPDATE (not N interactive-tx round-trips); make schema reflect the partial indexes or document the drift (Mohit).
8. Portal error/feedback — route through `useToast` (not one bottom-of-page `err`); add `isError` on both list queries; disable upload inputs while pending; fix the dead passcode "submitting" spinner (Aman/Ronak).
9. The `/patents/:id/document/content` dead feature — give the patents route a getContent path that bypasses ONLY the patent-guard, never the passcode/permission layer (Vijay/Nitin/boundary).

**P2 (polish/a11y/UX/product):** passcode modal a11y (focus-trap/label/aria-live) + onto shared `<Modal>` (Ankit/Ragini); un-truncated `font-mono` handles/real-numbers overflow at ≤360px (Geetesh/Arjun — `truncate min-w-0`+`title`); pane-gutter/CTA/focus polish + unused `accent` token (Sugandh); handle-chip 3-way inconsistency + one `<PatentHandle>` (Ragini); "real number" vs "patent number" terminology (Rajesh); reveal auto-expiry, CSV import/export, per-patent status/notes, project-link-aware delete (Vandana).

**Product decisions (flagged, behavior UNCHANGED pending sign-off):**
- **Handle→client-identity leak** (Meetu/Neha/Ketan/Ritik) — `Pat_<clientCode>_<serial>` un-codes to the client despite name redaction; `/patents/options` is org-wide unscoped so every employee (incl. BD/interns) can enumerate the coded client roster + portfolio sizes. Options: opaque handle tokens, move `patent.view` out of VIEW_BASICS onto delivery roles, scope `/patents/options` to the actor's matters. **Design change — needs your call.**
- **Writing real numbers isn't passcode-gated** (only reading) — policy call.
- **`resetWithPassword`** lets any admin re-arm the passcode with just their login password — policy call.
- Free-text project **`title`** leaks client+number (create-form placeholder encourages it) — same as Round 1; sanitize guidance.
