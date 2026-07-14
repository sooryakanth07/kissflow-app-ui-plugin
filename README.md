# Kissflow App Agents

A Claude Code plugin (and marketplace) that turns an idea or a BRD into a **real, running
Kissflow app** — data models, roles, workflows, pages — **and** its UI, either as **native
Kissflow pages** or a **custom shadcn React app**. It connects to **appbuilder** so your session
is scoped to a project and every build is tracked as a version.

It merges two pipelines behind one plugin:

- **Author the app** — a deterministic, zero-dependency engine + an agent team turn a BRD into
  real Kissflow metadata (apps, forms/processes/cases/datasets, fields, formulas, references,
  roles, permissions, workflows, pages) via `create-shell → draft → publish`.
- **Build the UI** — native Kissflow pages, or a **shadcn/Tailwind-v4 React app**
  (`@abdul-kissflow/app-ui` + `@abdul-kissflow/create-kf-app`) generated from the app's schema and
  deployed as the app's `Application` custom component (rendered in-Kissflow on web + PWA).

## Install

```
/plugin marketplace add kissflow/ai-plugin
/plugin install kissflow-app-agents@kissflow
```

(Or `/plugin marketplace add ./kissflow-app-ui-plugin` for a local path, then the same install.)

## Quick start

```
/author-setup                          # once per folder: stage the engine + connect to your
                                       # appbuilder project (browser sign-in; no creds to prep)
/build-app "<BRD path | one-line idea>"   # author the app in dev + build its UI, end-to-end
```

…or just ask — *"build a leave-request app with approvals and a team dashboard"* — and the
pipeline runs brief → plan → generate → UI.

## Commands

- **Setup & connect** — `/author-setup` (stage engine + browser connect to appbuilder),
  `/connect`, `/sync`
- **Author an app** — `/build-app` or `/author-app` (express, any size), or the staged loop for
  manual control: `/author-brief → /author-plan → /author-review → /author-refine →
  /author-preview → /author-generate` (+ `/author-status`, `/author-runs`)
- **Extend an app** — `/add-flow`, `/add-board`, `/add-page`, `/author-model`, `/author-roles`,
  `/author-seed`, `/author-reconcile`, `/author-understand`
- **Custom UI** — `/run` (HTTPS dev server), `/deploy` (bundle → `Application` component)

## How it works

- **Engine** (`plugins/kissflow-app-ui/engine`, zero-dep Node ESM) — an IR (`app-spec.json`)
  compiles to validated Kissflow metadata over REST, with a resumable checkpointed apply and
  golden/builder validators.
- **Agents** — an authoring team writes only to the IR (every step `kf-verifier`-gated); a
  custom-UI team (`kf-ui-*`) renders shadcn pages from a resolved Experience Spec.
- **Hosted appbuilder** — `connect.mjs` runs an OAuth-style browser device-flow that scopes your
  session to a project (`.kf-env`: Kissflow dev creds + a shared-memory partition + a project
  token), and `publish.mjs` registers each build as a version in the app's **Versions** list. The
  backend is Kissflow's deployed **`appbuilder.zingworks.com`** — this plugin is a *client*; it
  hosts nothing. Local Kissflow admin access keys (`.env`) remain a fallback for offline authoring.

## Requirements

- **Node 18+** (the engine is zero-dependency).
- **To connect / track builds** — an appbuilder project (the browser handshake handles creds), or
  local Kissflow REST admin keys as a fallback.
- **Custom UI mode** — `@abdul-kissflow/app-ui`, `@abdul-kissflow/create-kf-app`,
  `@abdul-kissflow/lowcode-client-sdk`. **Native pages mode** also needs `python3`.

## Layout

```
.claude-plugin/marketplace.json          ← the marketplace ("kissflow")
plugins/kissflow-app-ui/                 ← the plugin ("kissflow-app-agents")
  .claude-plugin/plugin.json
  commands/                              ← author-*, build-app, connect, sync, deploy, run, add-*
  agents/                                ← authoring team + kf-ui-* custom-UI team
  engine/                                ← IR→metadata engine + connect/memory/publish clients
  reference/                             ← authoring playbooks (CONCEPTS, LESSONS, EXPERIENCE-SPEC…)
  docs/PLUGIN.md                         ← full architecture reference
```

See [`plugins/kissflow-app-ui/README.md`](plugins/kissflow-app-ui/README.md) for the plugin
details and [`plugins/kissflow-app-ui/docs/PLUGIN.md`](plugins/kissflow-app-ui/docs/PLUGIN.md) for
the full architecture reference.
