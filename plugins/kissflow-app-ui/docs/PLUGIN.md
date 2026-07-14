# kissflow-app-ui — Plugin Reference & Architecture

_Last updated: 2026-07-13 · plugin **v0.6.2**_

The definitive map of the plugin. For the **user guides**, see:
- **`README.md`** — overview + the one‑command flow.
- **`docs/PIPELINE.md`** — the staged **authoring** pipeline (runs model, stages, express path, cheat‑sheet).
- **`AGENTS.md`** — the **custom‑UI** agent pipeline contract (`/add-page` orchestration + the `kf-ui-*` agents + the evolving `kf-preferences.md` memory).

---

## 1. What it is

A Claude Code plugin that turns an idea/BRD into a **real Kissflow app** — data models, roles,
workflows — **and** its UI, as either **native Kissflow pages** or a **custom shadcn React UI**.
It merges two pipelines:

- **Authoring** (from Dinesh's `kf-app-author`): a deterministic, zero‑dependency **engine** + a
  team of specialist agents that compile an App‑Spec IR into real Kissflow metadata
  (apps, forms/processes/cases/datasets, fields, formulas, references, roles, permissions,
  workflows, pages) over the access‑key REST API via `create-shell → PUT draft → publish`.
- **Custom UI** (ours): a **shadcn/Tailwind‑v4 React app** (`@abdul-kissflow/app-ui` +
  `@abdul-kissflow/create-kf-app`) generated from the app's real schema and deployed as the app's
  `Category:"Application"` custom component (rendered in‑Kissflow via `_is_custom_ui_enabled`).

**Everything targets your dev account, human‑gated — nothing auto‑publishes to prod.**

---

## 2. Install & setup

Local marketplace (`.claude-plugin/marketplace.json`, name **`kissflow`**):
```
/plugin marketplace add ./kissflow-app-ui-plugin      # or the repo
/plugin marketplace update kissflow                   # after edits — reload
/plugin install kissflow-app-ui@kissflow
```
Installs to `~/.claude/plugins/cache/kissflow/kissflow-app-ui/<version>/`.

**Setup once per project:** `/author-setup` — stages the engine + reference + seed memory into the
working dir (self‑resolves the plugin root from the cache; `chmod -R u+w` after copy so the engine
can write `runs/`), and checks the Kissflow admin access keys in env:
`KISSFLOW_SUBDOMAIN/ACCOUNT_ID/API_KEY/API_SECRET` (or `KF_*`), plus `KISSFLOW_DOMAIN`/`KF_DOMAIN`
for non‑`*.kissflow.com` hosts. Auto‑loads a local `.env`.

---

## 3. Architecture — the pieces

```
plugins/kissflow-app-ui/
├── .claude-plugin/plugin.json     # name + version (0.6.2)
├── engine/                        # the deterministic IR → metadata builder (zero‑dep Node ESM)
├── agents/                        # 20 specialist subagents (authoring + custom‑UI)
├── commands/                      # 24 slash commands (/author-*, /build-app, /connect, …)
├── skills/build-kissflow-app/     # auto‑invoked skill for "build a Kissflow custom UI"
├── reference/                     # playbooks the agents read first (LESSONS, CONCEPTS, …)
├── AGENTS.md                      # the custom‑UI pipeline contract
├── MEMORY.md                      # seed of the auto‑evolving agent memory
└── docs/                          # PIPELINE.md, PLUGIN.md (this), PIPELINE.html
```

---

## 4. The engine (`engine/`, run as `node engine/cli.mjs …`)

Zero‑dependency Node ESM. Access‑key REST (reads `KF_*`‖`KISSFLOW_*` + full‑domain override + a
`.env` autoloader). Auto‑stamps a per‑run `timeline.jsonl`.

**CLI commands (`cli.mjs`):**
| Command | Does |
|---|---|
| `validate <ir.json>` | IR shape + cross‑ref validation |
| `verify <ir.json>` | validate **+** coherence checks |
| `build <ir.json> [--no-pages] [--out d]` | compile IR → metadata blobs (DRY‑RUN to `d/`) |
| `apply <ir.json> [--no-pages]` | **LIVE** — create + publish the app; **resumable/checkpointed** |
| `resolve-experience <exp.json> <kf-schema.json> [--out ui-spec.json]` | Experience Spec → `ui-spec.json` (binds by meaning → real ids; drops what doesn't resolve, never fabricates) |
| `deploy-ui <zip> --app <id> [--url <devUrl>] [--open]` | deploy the built React UI (or a dev URL) as the app's `Application` component + enable Custom UI; `--open` launches the app |
| `check`/`import <exportDir>` | validate / summarize a real app export |

**Key modules:** `ir.mjs` (App‑Spec IR + validators/coherence) · `builders.mjs` (IR → metadata
blobs) · `client.mjs` (`clientFromEnv` + `applyIR`) · `resolve.mjs` (Experience → ui‑spec) ·
`deploy-ui.mjs` · `experience.mjs` (baseline pages guarantee) · `graph.mjs`/`integrations.mjs`/
`board-live.mjs` · `review.mjs` + `capture-screens.mjs` (InVision‑style Screens review) ·
`memory.mjs` (federation) · `timeline.mjs` · `runs.mjs` · `proto-assemble.mjs` + `proto-kit/`
(clickable prototype). `test/run.mjs` is the offline suite (**157 pass / 4** pre‑existing
board‑WIP fails = baseline).

### ⭐ Resumable, checkpointed `apply`
`applyIR` writes a checkpoint to **`runs/current/apply-state.json`** as it goes (the gen→server id
map, published flow ids, granted permissions, pages, app‑published) and, on entry, **skips work
already done**. So a re‑invoked `apply` continues instead of re‑publishing — essential where a bash
call is capped (e.g. Cowork's ~44s ceiling). It also auto‑handles account **name collisions**
(reuse the existing flow or app‑prefix a copy). `apply` also fixes real generated‑app defects:
IR‑role‑id remap (assignees resolve), PASS 2.5 caseflow statuses (board statuses reachable), board
`flowGrant` case‑family permissions.

### The App‑Spec IR
The single blackboard (`runs/current/app-spec.json`) all authoring agents write to: app, roles,
forms/processes/cases/datasets (+ fields, refs, formulas, aggregates, child tables), workflow steps
+ assignees, permission matrix, pages + nav. The engine compiles it deterministically — the agents
**design**; the engine **builds**.

### The Experience Spec bridge (custom UI)
The prototype/UI is designed as a **Kissflow‑agnostic Experience Spec** (binds by *meaning*), then
`resolve-experience` merges it with the synced `kf-schema.json` (name→id) into a `ui-spec.json` the
`kf-ui-*` agents consume — **never fabricating** an id: an unresolved widget is dropped with a warning.

---

## 5. The agents (`agents/`, spawned by `subagent_type`)

**Authoring roster** — the staged plan chain + comprehension/change/QA:
`kf-ba` · `kf-architect` · `kf-data-architect` · `kf-workflow-designer` · `kf-security-designer`
· `kf-experience-designer` · `kf-integration-analyst` · `kf-coherence-critic` · **`kf-verifier`**
(gates every step) · `kf-comprehension` (Extract) · `kf-reconciler` (Change) · `kf-acceptance`
(persona journey tests) · `kf-seed` · `kf-author` · `kf-prototype-builder` (clickable prototype).

**Custom‑UI roster** — the `/add-page` chain (see `AGENTS.md`):
`kf-ux-architect` (Experience Spec) · `kf-ui-architect` → `kf-ui-designer` → `kf-ui-builder` →
`kf-ui-qa` (per‑page fan‑out with a QA fix loop). These design against **shadcn/ui + recharts +
custom components + semantic tokens** and **mandate adapting the shell + record form** (not raw
drop‑ins) — see `agents/design-guidelines.md` + `agents/theming.md`.

---

## 6. The commands (`commands/`)

**End‑to‑end:** `/build-app "<BRD>" [--ui native|custom]` — author → generate → pick UI mode →
build + deploy. **Step 0 establishes the project directory in the user's selected folder** (never a
temp/scratch CWD — critical in Cowork, where CWD is a sandbox `…/mnt/outputs`) and asks the UI mode
**upfront** (no mid‑build pivot). Custom finish: start the dev server, `deploy-ui --url
https://localhost:3000 --open` (live on your dev server), `npm run zip` for manual prod upload.

**Staged authoring** (see `docs/PIPELINE.md`): `/author-setup` · `/author-brief` · `/author-understand`
· `/author-plan` · `/author-review` · `/author-generate` · `/author-model` · `/author-roles` ·
`/author-page` · `/author-preview` · `/author-refine` · `/author-reconcile` · `/author-seed` ·
`/author-runs` · `/author-status` · `/author-app` (express). Incremental: `/add-flow` · `/add-board` · `/add-page`.

**Custom‑UI ops:** `/connect` · `/sync` (`kf:sync` the schema) · `/add-page` · `/run` (dev server) ·
`/deploy` (`deploy-ui`, URL or zip).

---

## 7. The two flows

**A. Authoring** — `kf-ba → kf-architect → kf-data-architect ∥ kf-workflow-designer (parallel wave)
→ kf-security-designer → kf-experience-designer → kf-coherence-critic`, each **`kf-verifier`‑gated**,
writing the IR; then `apply`. **Express fast‑path**: a single‑flow app assembled in one Sonnet pass
(~2 min, demo default). Modes: Create · Extract (`kf-comprehension`) · Change (`kf-reconciler`).

**B. Custom UI** — design the **Experience Spec** (`kf-ux-architect`) → `kf:sync` the real schema →
`resolve-experience` → `ui-spec.json` → `kf-ui-architect/designer/builder/qa` generate shadcn React
pages in `src/pages/` (file‑based routing) wired to real data via the SDK, role‑gated → `deploy-ui`.

---

## 8. Features worth knowing

- **Express fast‑path + parallel plan wave** — single‑pass demos; `data ∥ workflow` concurrency (~40% off the plan stage).
- **Progress narration** — step‑by‑step build narration (Cowork‑friendly), warm‑up line, `⏱ Built in Xm`.
- **InVision‑style Screens review** — `capture-screens.mjs` screenshots the prototype (headless Chrome; **no‑op → wireframes** without it), shown in the Pages & Nav review.
- **Memory federation** (`memory.mjs` + `MEMORY.md`) — verified facts promote to a shared pool; project‑private stays private; "can't do X" claims are quarantined until proven.
- **Timeline** (`timeline.mjs`) — per‑run `timeline.jsonl`; `node engine/timeline.mjs report runs/current` gives per‑actor/step durations (find the bottleneck).
- **Resumable apply** — checkpoint/resume across the bash‑timeout ceiling (§4).

---

## 9. Relationship to `kf-app-author` (Dinesh)

This plugin is the **canonical superset**: Dinesh's authoring engine + agents + commands
(re‑vendored wholesale) **+** our custom‑UI pipeline (`kf-ui-*` agents, `resolve.mjs`,
`deploy-ui.mjs`, `/build-app` `/connect` `/sync` `/add-page` `/run` `/deploy`). Non‑custom‑UI deltas
we carry back to him: engine **A** (env/host/dotenv unify) + **B** (list‑items publish), and
guidance patches (masters→Forms, flag unstaffed actor roles, plugin‑root self‑resolve, PDF ingest).
Keep the two in sync as we iterate.

---

## 10. Gotchas

- **Directory:** never scaffold/stage into a temp CWD. In Cowork the CWD is `…/mnt/outputs`; the
  user's folder is a sibling mount (`ls -d /sessions/*/mnt/*/ | grep -v /outputs/`).
- **Bash‑timeout ceiling** (Cowork ~44s): run long `apply`/`npm install` in the background or just
  re‑run `apply` — it resumes from the checkpoint. Delete `apply-state.json` for a clean re‑apply.
- **FUSE mounts:** the plugin cache is read‑only (`0500/0400`); `chmod -R u+w` after the engine copy
  (author‑setup does this) so the engine can write.
- **Creds** are access‑key REST (server‑to‑server), NOT the iframe SDK — set in env / `.env`.
- **React 19** for scaffolded UIs (2026 shadcn is ref‑as‑prop; `asChild` breaks on 18).
- **`create-kf-app` is now `packages/create-app`** (Abdul's split); `create-kf-component` =
  `packages/create-component`. Publish both + `app-ui` with **`pnpm publish`** (workspace deps; 2FA/otp).
- **The plan chain is sequential by dependency** — the biggest speed levers are scope (fewer flows
  per pass) and model tier, not parallelism (that's the apply stage).
