---
description: One-time setup — materialize the kf-author engine, reference playbooks, and seed memory into your working directory, and check prerequisites + credentials.
argument-hint: (run once in a fresh working folder before authoring)
---

Run this **once** in the folder you want to author from. The plugin ships the engine, the reference
playbooks, and the seed memory inside the installed plugin (`$CLAUDE_PLUGIN_ROOT`); this materializes
them into your workspace so the `node engine/cli.mjs …` commands resolve and the agents can read the
playbooks + evolve `MEMORY.md (canonical — replaced on plugin update) and create an empty MEMORY-LOCAL.md (instance learning; agents write here)` locally.

**Break the silence FIRST.** Setup + the first engine call are the coldest, most silent wait a user
feels (esp. in Cowork). Your VERY FIRST output — before the copy, the smoke test, or any `node` call —
must be a warm line so the user isn't staring at nothing: *"⚙️ Warming up — staging the build engine
and checking your Kissflow connection (one-time, a few seconds)…"*. Then narrate each step as it
finishes: *"✓ Engine ready."* · *"✓ Connected to <subdomain> (dev)."* Never run the slow steps before
emitting that first line.

## 1. Materialize the engine + playbooks + seed memory
`$CLAUDE_PLUGIN_ROOT` is often **empty** in the Bash tool env, so self-resolve the plugin root from
the install cache (newest version) before copying, and fail loudly if the engine still isn't found:
```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/kissflow/kissflow-app-ui/*/ 2>/dev/null | sort -V | tail -1)}"
[ -d "$PLUGIN_ROOT/engine" ] || { echo "ERROR: plugin root not found (set \$CLAUDE_PLUGIN_ROOT or check ~/.claude/plugins/cache/kissflow/kissflow-app-ui/)"; exit 1; }
cp -R "$PLUGIN_ROOT/engine" "$PLUGIN_ROOT/reference" "$PLUGIN_ROOT/MEMORY.md" .
```
You now have `./engine` (the deterministic IR→metadata builder + validators + tests), `./reference`
(the playbooks the agents read first), and `./MEMORY.md` (the auto-evolving agent memory — yours to
grow). `lib/app-spec.json` (the IR blackboard) is created on first author.

## 2. Prerequisites
- **Node 18+** (`node --version`) — the engine is zero-dependency ESM. Smoke test:
  `node engine/test/run.mjs` → should print the golden + builder tests green.
- **python3** (`python3 --version`) — needed **only** for the native page transform (`/author-page`).
  Kissflow's real page transformer is **bundled** in the plugin (`engine/vendor/page_builder`, stdlib
  only) — **no `kissflow-xg` checkout needed**. Set `KF_METADATA_PATH=/path/to/kissflow-xg/metadata`
  only to override the bundled copy with a live one. Data models, workflows, roles, and permissions
  author fine **without** python3 — only native pages need it.

## 3. Credentials (YOUR OWN Kissflow admin access key — never commit)
Authoring talks to the Kissflow REST API with an account admin access key. Export, don't hardcode:
```bash
export KISSFLOW_SUBDOMAIN=<your-subdomain>      # e.g. dev-mycompany
export KISSFLOW_ACCOUNT_ID=<your-account-id>
export KISSFLOW_API_KEY=<access-key-id>
export KISSFLOW_API_SECRET=<access-key-secret>
```
Always **dry-run** first and target a **dev** app; the pipeline never auto-publishes to prod.

## 4. Go
- `/author-understand` — import + map an existing app (reconciler baseline), or
- `/author-app "<your BRD / app description>"` — author a full app top-down (the orchestrator).
