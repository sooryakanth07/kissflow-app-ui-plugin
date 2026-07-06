---
description: Front a change to an EXISTING app with the reconciler — import live → IR (lossless), three-way diff vs desired, mark ownership/drift, risk-tier the plan, apply draft-first with tiered approval. Never regenerates, never overwrites dev edits, never auto-publishes to prod.
argument-hint: --target <env> [path to desired app-spec.json]
---

Spawn **kf-reconciler** — the front door for every change to an app that already exists. This is a
**reconciler, not a generator**: the live app is the source of truth and we propose the minimal
reviewable diff.

Pre-req: `engine/cli.mjs` exists; desired IR at `lib/app-spec.json` (authored by `/author-app`).

1. **Import live → IR (lossless)**:
   `node engine/cli.mjs import --target <env> --out lib/live.ir.json`.
2. **Three-way diff/plan**: `node engine/cli.mjs plan lib/app-spec.json --target <env>` — base ×
   desired × live. Surfaces what the user wants vs what a developer changed in the app since.
3. **Ownership & drift**: tag each item `ai-owned` / `dev-owned` / `conflict`. NEVER overwrite a
   `dev-owned` change without itemised approval.
4. **Risk-tier**: `low` (additive) / `medium` (behaviour change) / `high` (destructive / scope-widen /
   prod). Stronger approval as risk rises.
5. **Draft-first apply**: land a draft + show the plan, approve per tier, then publish. Never
   auto-publish; never publish to prod without explicit high-tier approval.

Output: the `reconciliation` IR slice (diff by ownership + risk, conflicts, ordered apply plan,
approval gates). Run **/author-understand** first if the app's semantics are unclear.
