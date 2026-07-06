---
description: Understand an EXISTING Kissflow app — derive a static model from live metadata, probe a sandbox to answer cheaply, ask only grounded multiple-choice questions for the residue, and produce an "app understanding" doc. Runs continuously, including after dev edits (on drift).
argument-hint: --target <env> [app id or name]
---

Spawn **kf-comprehension** to build a semantic understanding of an app that already exists, before
anyone changes it. The live app is the source of truth.

Pre-req: `engine/cli.mjs` exists; the IR blackboard is `lib/app-spec.json`. Reference knowledge in
`kf-author-plugin/reference/`.

1. **Import the live model**: `node engine/cli.mjs import --target <env> --out lib/app-spec.json`
   (lossless live → IR).
2. **Derive + interrogate** (the agent): build the static model (ER map, workflow, permissions, nav);
   generate questions from gaps / anomalies / semantic voids; **probe a sandbox via the runtime API**
   to answer what it can cheaply (create→advance→observe); ask the user **grounded multiple-choice**
   only for the irreducible residue, recording answers with provenance (`derived`/`observed`/
   `stated`).
3. **Output**: the `understanding` IR slice + an "app understanding" doc (prose, per-persona, with
   resolved meanings).
4. **Continuous**: re-run after dev edits — it diffs the new import against recorded understanding
   (drift) and only re-asks about what changed.

Read-only on the target app — comprehension never edits or publishes; sandbox probe records are
throwaway. Hand off to **/author-reconcile** to change the app, or **/author-app** to extend it.
