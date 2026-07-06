# Kissflow App-UI plugin — fixes & workarounds from the Inventory build (2026-07-03)

Everything that had to change (or be worked around) to take a BRD → live app → custom UI → data,
against a **QA host** (`development-localhost.fecqa.zingworks.com`, not `*.kissflow.com`). Grouped by
component. "Applied" = what I changed locally in the materialized workspace; "Upstream" = the real fix.

---

## A. Environment & credentials (engine ↔ scaffold naming mismatch)

### A1. Engine reads `KISSFLOW_*`, scaffold + `.env` use `KF_*`  ← root inconsistency
- **Symptom:** engine `clientFromEnv()` threw "must be set in env" even though `inventory/.env` had creds.
- **Cause:** the author engine expects `KISSFLOW_SUBDOMAIN/ACCOUNT_ID/API_KEY/API_SECRET`; the UI scaffold
  (`create-kf-app` `.env.example`) and the shared `inventory/.env` use `KF_DOMAIN/KF_ACCOUNT_ID/
  KF_ACCESS_KEY_ID/KF_ACCESS_KEY_SECRET`. Two halves of the same plugin use different env var names.
- **Applied:** `engine/client.mjs` `clientFromEnv()` now reads `KISSFLOW_* || KF_*`.
- **Upstream:** unify on ONE naming convention across engine + scaffold + docs. Recommend the engine accept
  both (cheap) AND the docs/author-setup emit one canonical `.env`. Simplest: engine natively reads `KF_*`
  (matches scaffold), keeps `KISSFLOW_*` as alias.

### A2. Base URL hardcoded to `<subdomain>.kissflow.com` — can't express a full/QA host
- **Symptom:** every API call would have gone to `undefined.kissflow.com` / wrong host.
- **Cause:** `const base = \`https://${sub}.kissflow.com\`` — a subdomain can't produce
  `development-localhost.fecqa.zingworks.com`.
- **Applied:** `clientFromEnv()` now takes a **full-host override** `KISSFLOW_DOMAIN || KF_DOMAIN`
  (strips protocol/trailing slash) and only falls back to `${sub}.kissflow.com` when no domain is set.
- **Upstream:** support a full-domain env var everywhere a base URL is built. NOTE: the scaffold's
  **`kf:sync` already does this right** (it prepends `https://` to `KF_DOMAIN`) — only the *engine* was
  wrong, so the two disagreed. Align the engine to the scaffold.

### A3. Engine never loads `.env`
- **Symptom:** `node engine/cli.mjs …` saw no creds even with `inventory/.env` present.
- **Cause:** engine reads `process.env` but nothing populates it; no dotenv.
- **Applied:** tiny zero-dep loader at top of `engine/cli.mjs` (loads `./.env` then `inventory/.env`,
  already-set env wins).
- **Upstream:** ship a dotenv load in the CLI entrypoint (or document `set -a; . .env; set +a`).

### A4. Cosmetic: apply/deploy logs printed `undefined.kissflow.com`
- **Applied:** `engine/cli.mjs` APPLY + DEPLOY-UI log lines now resolve `KISSFLOW_DOMAIN||KF_DOMAIN||
  ${sub}.kissflow.com`.
- **Upstream:** same helper used for the real base URL should feed the log line.

---

## B. Engine `applyIR` — List option items never published  ← highest-impact bug

- **Symptom:** all 6 option-set Lists (UoM, Movement Type, Stock-Out Reason, Adjustment Direction, 2×
  Status) were published **empty**. Every required Select was unsatisfiable → **no item/movement can be
  created, even by a real user in the Kissflow UI**, and seeding was hard-blocked.
- **Cause:** `engine/client.mjs` `applyIR`. Pass-1 creates flow *shells* (incl. lists). The `accept()`
  helper only queues an artifact for the Pass-2 body publish **if it has `a.blob`**. Lists carry
  `a.doc.ListItems` (no `.blob`), so they were created empty and never had their items written.
  (Confirmed live: builder blob `preview/list/uom.doc.json` HAD the `ListItems`; the apply log showed
  `shell list uom → …` but no `body Inventory_UoM_A00 → draft/publish` line.)
- **Correct endpoint (discovered live):** `POST /flow/2/{acct}/list/{listId}/items` with body
  `{"ListItems": ["Each","Box", …]}` (an OBJECT wrapping a string array). It **replaces** the full set.
  Failing shapes to avoid: top-level array → 403 `TypeMissMatchError`; `{Name:…}`/`{Value:…}` → 400
  "Unknown field"; the `/metadata/2/{acct}/list/{id}/draft` path → **404 (lists don't use metadata
  draft/publish at all)**; `PUT …/items` → 404 (GET works there, POST is the writer).
- **Applied:** added `client.putListItems(id, items)` + a new "PASS 1b — list items" loop in `applyIR`
  (after shells, before bodies) that POSTs each list artifact's `doc.ListItems`. Engine tests still 125/0.
  Also manually backfilled the 6 live lists.
- **Upstream:** land the same fix in the shipped engine. Add a validator/apply-report warning if any Select
  field references a list that ends up empty.

---

## C. Engine `deploy-ui` — zip upload leg is a stub (404)

- **Symptom:** `deploy-ui` created the `Category:"Application"` custom component (steps 1–2 OK) then 404'd
  on upload: `POST /application/2/{acct}/{app}/component/custom/{cid}/upload`.
- **Cause:** the upload URL is an explicit `TODO(live-verify)` guess in `engine/deploy-ui.mjs`.
- **Reality:** the plugin's own `commands/deploy.md` says **"Kissflow has no publish API"** — deployment is
  **manual** (App Builder → Settings → Custom UI → upload zip, or set a dev-server URL).
- **Applied:** nothing code-wise (left the stub); deploying manually / via dev URL. Also added `KF_*`
  fallback to the two direct `process.env.KISSFLOW_API_KEY/SECRET` reads in `deploy-ui.mjs` (A1).
- **Upstream:** either wire the real upload endpoint (confirm with platform team — candidates were
  `.../{cid}/blob`, a `/files/2/...` presign+PUT), or make `deploy-ui` fail fast with a "manual upload
  required" message + the exact App Builder steps. Left an empty component `CCDlET0l4kH4` on the app from
  the failed attempt.

---

## D. Experience-Spec → `resolve-experience` — entity-name mismatch dropped EVERY widget

- **Symptom:** `resolve-experience` dropped all 81 widgets / all 24 pages ("entity … not found in
  kf-schema.dataModels").
- **Cause:** `kf-ux-architect` emits `bind.entity` as **IR slugs** (`item`, `stock-movement`), but
  `engine/resolve.mjs` matches `bind.entity` against the **live kf-schema model NAME**
  (`Inventory Item`, `Inventory Stock Movement`). The two vocabularies never meet. The ux-architect
  runs before/without the synced schema, so it *can't* know live names.
- **Applied:** transformed the experience-spec before resolving — remapped `bind.entity` slug → live name
  (`item`→`Inventory Item`, …; 79 remaps) and converted derived single-`bind.field` widgets
  (`On-Hand Qty`, `Valuation`, `Avg Monthly Consumption`) into measure-hints so they survive (14
  conversions). Result: 23 pages / 79 widgets resolved (only the static admin permission-matrix page
  dropped, correctly).
- **Upstream (pick one):**
  1. Pass the IR's `id → live-name` map into `resolve.mjs` and match on either (best — the author pipeline
     already has both), OR
  2. have `kf-ux-architect` bind by a stable **entity id** that both the IR and kf-sync carry, and match on
     id in resolve, OR
  3. resolve builds an alias index (name + id + slug).
- **Second resolve gap:** a widget whose **single `bind.field`** is a *derived* value (not a real schema
  field) is HARD-dropped (`resolve.mjs` line ~106). Derived KPIs (total valuation, on-hand) therefore
  vanish. `resolve.mjs` should keep a widget when `bind.derived === true` (or when `bind.measure` is
  present without a real field) and carry the derived hint into `props` for the builder to compute — it
  already does this for `bind.measure`/`bind.dim`, just not when a derived name was put in `bind.field`.

---

## E. Modeling constraints the author agents had to design around (encode as guidance)

### E1. "Datasets" can't hold multi-field masters — must be Forms
- `kf-data-architect` found the engine's `datasets`/List builder only stores `ListItems` (option sets), and
  `apply` only creates `list/form/process/case` — a `dataset`-typed flow is **never applied**. So Category
  & Supplier (multi-field masters) had to be **Forms**, not Datasets.
- **Upstream:** either implement real multi-field Dataset apply, or make `kf-architect`/validator refuse to
  type a multi-field master as `dataset` (auto-promote to Form + warn). Today it silently produces nothing.

### E2. Process field formulas strip on publish
- Signed/effective quantity and on-hand can't be process field formulas (they strip on publish — LESSONS
  §1b), so on-hand/valuation/low-stock are **report-derived / computed in the UI**. Known lesson; already
  in `reference/LESSONS.md`. Keep the data-architect honest about it (it was).

### E3. Workflow: conditional branch + second terminal NOT compiled  ← big engine limitation (FID-1)
- `addWorkflow` compiles a **linear** `Start → Manager Approval → Posted`. The Movement-Type entry-guards
  (Stock In/Out should auto-complete, bypass approval) and the second **Rejected** terminal are
  design-intent metadata only — not emitted. As-built, **every** movement (incl. routine stock-in/out)
  sits at Manager Approval. Contradicts the BRD "<30s capture".
- **Upstream:** support step entry-conditions/guards + multiple terminals in `addWorkflow`. This is the
  single most valuable engine feature gap for real processes.

---

## F. Workflow + role provisioning — unstaffed actor role blocks the whole flow

- **Symptom (current blocker):** movements can't be submitted at all — `POST /process/.../submit` →
  *"There is no assignee for the next step Manager Approval."* The **Manager app-role has 0 users**.
- **Cause:** E3's linear workflow routes *every* movement through Manager Approval; with no user in the
  Manager role there's no assignee, so submit fails outright (can't even sit pending).
- **Upstream:** (a) the verifier/coherence step should FLAG when a workflow step's actor role will have no
  members at go-live (satisfiability isn't just "role exists" — it needs an assignee); (b) relates to E3 —
  if In/Out auto-posted, only Adjustments would need a staffed Manager role. Consider auto-adding the
  creator/admin as a fallback assignee, or warning at apply.

---

## G. Generated custom-UI patterns (agent/scaffold guidance)

### G1. Cross-flow error aggregation blanks dashboards
- `useInventory()` aggregated `error` across all 4 flows; a permission error on a *secondary* lookup
  (a role without Category/Supplier access) blanked the entire dashboard via `ErrorState`. QA fixed it to
  key `error` on the core flows only and degrade secondary failures to empty + `secondaryError`.
- **Upstream:** bake this into the foundation/`kf-ui-builder` guidance (don't hard-fail a page on a
  secondary flow the role may not be able to read).

### G2. Derived reports must be computed client-side
- On-hand/low-stock/valuation/avg-consumption aren't stored (E2), so the UI needs a shared metrics engine
  (we built `src/lib/metrics.js`). Worth shipping a canonical metrics/derivation helper pattern in the
  scaffold docs so every app doesn't reinvent signed-qty/on-hand.

---

## H. Author-flow / tooling friction (not code bugs, but rough edges)

### H1. `$CLAUDE_PLUGIN_ROOT` is not set in the Bash tool env
- `author-setup` step 1 is `cp -R "$CLAUDE_PLUGIN_ROOT/engine" …` but the var is empty in the shell, so the
  copy fails. Had to locate `~/.claude/plugins/cache/kissflow/kissflow-app-ui/<version>/` manually.
- **Upstream:** make `author-setup` resolve the plugin root itself (glob the cache) or have the harness
  export the var to Bash.

### H2. PDF BRD ingestion has no text-extraction path
- The BRD was a Coda-exported PDF with subsetted CID fonts. The Read tool couldn't render (no
  poppler/`pdftoppm`), and naive stream extraction returned font-glyph garbage. Had to `pip install pypdf`
  to extract text.
- **Upstream:** `author-brief`/`build-app` should include a PDF→text step (bundle a pure-Python or JS
  extractor), or document the prerequisite.

---

## Files changed in the materialized workspace (to port upstream)
- `engine/client.mjs` — `clientFromEnv()` (A1,A2,A4-source); `putListItems` + Pass-1b list-items (B); the
  return object exposes `base`/`acc`/`call`.
- `engine/cli.mjs` — `.env` autoloader (A3); APPLY/DEPLOY-UI host log lines (A4).
- `engine/deploy-ui.mjs` — `KF_*` key/secret fallback (A1/C).
- `runs/inventory-mgmt/experience-spec.json` — entity remap + derived-field neutralization (D);
  original preserved at `experience-spec.raw.json`.
- `inventory-mgmt-ui/src/lib/kf-data.js` — `useInventory` error scoping (G1, applied by QA).

## Net: what was a genuine engine/plugin defect vs environment adaptation
- **Genuine defects to fix upstream:** B (list items never published), C (deploy-ui stub), D (resolve
  entity-name + derived-field drop), E1 (dataset apply), E3 (workflow linear-only), F (unstaffed-actor not
  flagged), G1 (dashboard error aggregation), H1 (`$CLAUDE_PLUGIN_ROOT`), H2 (PDF ingest).
- **Environment adaptation (still worth unifying):** A1–A4 (env var naming + full-domain + dotenv) — the
  engine/scaffold naming split is the root cause; unify it.
