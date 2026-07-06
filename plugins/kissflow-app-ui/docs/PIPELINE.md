# The kf-author staged pipeline — a guide for plugin users

> For any big spec, generation is **never one-shot**. You upload a BRD, study what the plugin
> proposes, ask for changes, iterate on new suggestions, and only once you're confident about what
> the AI is going to build do you generate. This plugin turns that loop into a set of commands you run
> in sequence.

## Get set up (once)

1. **Install** the plugin in Claude Code:
   ```
   /plugin marketplace add ./kf-author-plugin      # or the shared repo/folder
   /plugin install kf-app-author@kf-tools
   ```
2. **Stage the engine** — run `/author-setup` once in the folder you'll author from. It copies
   `engine/` + `reference/` + `MEMORY.md` into your workspace and checks Node 18+ (and, only for native
   page rendering, python3 + `KF_METADATA_PATH`).
3. **Get a Kissflow access key — from your DEV account.** Sign in to
   `https://dev-<company>.kissflow.com` → **Account Administration → Integrations → Access Keys →
   Create Access Key**. Copy the **Access Key ID** and **Access Key Secret** (the secret is shown
   once). Read the **subdomain** off the URL (`dev-<company>`) and the **account id** from Account
   settings → Account details.
4. **Export the four values** in the shell you run Claude Code from (never commit them):
   ```bash
   export KISSFLOW_SUBDOMAIN=dev-acme        # the DEV/builder subdomain
   export KISSFLOW_ACCOUNT_ID=Aclo…
   export KISSFLOW_API_KEY=<access-key-id>
   export KISSFLOW_API_SECRET=<access-key-secret>
   ```

> **⚠ Use the DEV environment.** Many accounts have a separate **dev/builder**
> (`dev-<company>.kissflow.com`) and **runtime** environment, with **different account ids and keys**.
> A key from one returns `403 DomainMissMatchError` on the other, and artifacts only show up in the App
> Builder when authored with the **dev** key against the **dev** subdomain. Generate the key in — and
> point `KISSFLOW_SUBDOMAIN` at — your **dev** account. The pipeline never auto-publishes to prod.

## Why staged (read this first)

A Kissflow **Process/Case, once published, is immutable over REST** — you can't edit or delete it
afterwards. So the cost of "generate first, fix later" is high. The pipeline moves all the thinking
and iteration to a **cheap, reviewable plan** and only touches Kissflow when you're sure. Everything
before `/author-generate` is free to change.

## The runs model — one BRD, one directory, versioned

Every BRD becomes its own **run** under `runs/<slug>/`, isolated and versioned:

```
runs/
  .current                     ← which run the commands act on
  l2d-settle/
    brd.md                     ← the BRD you uploaded
    app-spec.json              ← the working plan (the IR blackboard)
    decisions.md               ← every significant choice + why + rejected alternatives
    open-questions.md          ← assumptions & ambiguities to resolve
    review.html                ← the interactive review page (regenerated each iteration)
    prototype/                 ← clickable per-role UX prototype + experience-spec.json
    generated/                 ← the build log (real Kissflow ids) once you generate
    versions/
      v1/  ← snapshot: plan            (app-spec + decisions + review + prototype + CHANGES.md)
      v2/  ← snapshot: after a refine
      v3/  ← snapshot: generated → dev
```

Each `/author-plan` and `/author-refine` writes a new **immutable version** (`v1, v2, …`) so you can
compare iterations and never lose a good state. `/author-brief` starts a fresh run; `/author-runs`
lists them and switches the active one.

## The flow after you have a BRD

```
  /author-setup          (once per workspace — stages engine + reference + memory)
        │
        ▼
  /author-brief <brd>    STAGE 1  ingest → new run, extract domain, list open questions
        │
        ▼
  /author-plan           STAGE 2  propose the full design → snapshot v1  (nothing applied)
        │
        ▼
  /author-review         STAGE 3  interactive review page + clickable per-role prototype
        │
        ▼
  /author-refine "…"     STAGE 4  apply your changes → re-verify → snapshot vN+1   ⟲ repeat
        │                          (paste the change-list from the review page, or free text)
        ▼
  /author-preview        STAGE 5  dry-run against Kissflow — the "are we confident?" gate
        │
        ▼
  /author-generate       STAGE 6  build it for real in dev → generated/   (irreversible)
        │
        ▼
  Pipeline B             the prototype's Experience Spec → live custom React UI
```

Utilities alongside the flow: **`/author-status`** (where this run stands + version ladder),
**`/author-runs`** (list/switch runs).

### Stage by stage

| Stage | Command | What it does | Mutates? |
|---|---|---|---|
| 1 Ingest | `/author-brief <brd>` | New run; extract personas / journeys / entities / rules into the IR; list assumptions & open questions. | run dir only |
| 2 Propose | `/author-plan` | Specialist agents design flow-types, data models + relationships, workflows, roles × permissions, pages & nav — each choice logged with rationale. Snapshots **v1**. | plan only |
| 3 Review | `/author-review` | Renders `review.html` (every entity/field/workflow/permission/page/decision is an item you can ✓ ok / ✎ change / ? ask + comment; **Copy change-list** exports your flags) **and** a clickable per-role prototype of the intended UI. | nothing |
| 4 Iterate | `/author-refine "…"` | Applies your change-list, re-runs the right specialist, re-verifies knock-on effects, logs the change, snapshots **vN+1**. Repeat until it's right. | plan only |
| 5 Confidence | `/author-preview` | Validates + dry-runs the build: shows the exact manifest (flows/forms/fields/workflows/permissions/pages), flags what's immutable, surfaces unresolved questions. | nothing |
| 6 Build | `/author-generate` | Applies the plan to **dev** — creates the real app. Writes `generated/` with real ids; runs acceptance. `--dry-run` / `--yes` supported. | **Kissflow (dev)** |

## The two things reviewers actually look at

Teams understand **data models & relationships, business logic, workflows, and pages/widgets** — so
review gives you two complementary views of the same plan:

1. **The interactive review page (`review.html`)** — a structured, self-contained HTML document (same
   template for every use case). Each item has a stable `#id`; mark it **✓ ok / ✎ change / ? ask**,
   add a comment, and hit **Copy change-list** to get a paste-ready list of `[CHANGE] <label> (#id):
   note` lines. Feed that straight into `/author-refine`. Flags persist in the browser, so the whole
   team can review the same file.
2. **The clickable prototype (`prototype/`)** — a separate, **constraint-free** UI agent
   (`kf-prototype`) builds a per-role experience (nav + pages + widgets) from the *outcomes* each role
   needs, with realistic mock data — not from Kissflow artifacts. You see what the app will *feel*
   like per role before it exists.

## Prototype → live UI (the Experience Spec bridge)

The prototype isn't throwaway. It's built to a **Kissflow-agnostic Experience Spec**
(`prototype/experience-spec.json`) whose widgets bind to your **IR entities by meaning** (entity /
field / measure / dimension / scope), not to Kissflow ids. Because **Pipeline B** (kf-framework) is
also a flexible React runtime, the same spec becomes the **live custom UI** after generation — the
structure (nav, per-role pages, widget types, layout) translates 1:1; only the data source swaps from
mock to real. See `reference/EXPERIENCE-SPEC.md`.

## The express path (demos / small specs)

You can **skip review and generate directly**:

The input can be a **BRD file, pasted requirement text, or a one-line ask** — a file isn't required:
```
/author-app "./specs/leave-request.md"                                    # a BRD file
/author-app "a purchase request app with two-level approval"         # one-liner
/author-app "<paste a paragraph of requirements>"                    # pasted text
```
The thinner the input, the more the plugin leans on assumptions + open-questions (a one-liner is
valid — you just review more of what it inferred). The same applies to `/author-brief`.

It runs the whole pipeline in one command, prints the plan-at-a-glance, and applies to **dev** (with a
visible `⚠ No review taken — applying to dev directly.` notice). Add `--dry-run` to stop at the build
manifest, `--yes` to skip the confirm. `/author-generate` is gated on a **valid IR, not on review**,
so this path is fully supported — but for anything real, prefer the staged loop. The run is still
saved and versioned, so you can `/author-refine` and regenerate afterwards.

## Typical session

```
/author-setup
/author-brief ./specs/l2d.md          → run "l2d-settle" created; 6 open questions
/author-plan                          → 4 flows, 3 processes, 11 forms, 5 roles, 9 pages; v1
/author-review                        → open runs/l2d-settle/review.html + prototype/
   … team flags 8 changes, Copy change-list …
/author-refine "[CHANGE] Payment … make it a Process; add a Compliance role; Fund needs IBAN"
                                      → applied, re-verified, v2
/author-review                        → looks right
/author-preview                       → manifest clean, 3 immutable Processes noted
/author-generate                      → built in dev; acceptance 5/5 journeys pass; v3
```

## Command cheat-sheet

| Command | Role |
|---|---|
| `/author-setup` | Stage engine + reference + memory into the workspace (once). |
| `/author-brief <brd>` | Start a new run; ingest the BRD. |
| `/author-plan` | Propose the full design (snapshot v1). |
| `/author-review` | Interactive review page + clickable prototype. |
| `/author-refine "…"` | Apply changes; iterate (snapshot vN+1). |
| `/author-preview` | Dry-run + confidence gate (no build). |
| `/author-generate` | Build it in dev (irreversible). |
| `/author-status` | Where this run stands + version ladder. |
| `/author-runs [slug]` | List runs / switch the active one. |
| `/author-app "<brd>"` | Express: brief → plan → generate in one shot. |
