---
description: STAGE 4 (iterate) — apply the user's changes to the current plan, re-verify, regenerate the review page + prototype, and snapshot a NEW version with a change-diff. Repeat as many times as needed. Nothing is applied to Kissflow.
argument-hint: ["<change requests>" — free text, or the change-list pasted from the review page]
---

**Stage 4: iterate.** This is the loop that makes big specs safe — cheap changes to the *plan*, not
the built app. Run it as many times as you like.

Pre-req: a current run with `runs/current/app-spec.json` (from `/author-plan`).

## Do
1. **Parse the change requests** in `$ARGUMENTS` — free text ("make Payment a Process"; "add a
   Compliance role"; "Fund needs an IBAN field") or the exported change-list (`[CHANGE] <label>
   (#id): note`). The `#id` tells you exactly which item to edit.
2. **Apply each change** by re-running the RIGHT specialist on the affected IR slice (architect for
   flow-type/role/structure; data-architect for fields/formulas/refs; workflow-designer for steps;
   security-designer for permissions; experience-designer for pages/nav). Edit
   `runs/current/app-spec.json` surgically — don't rebuild the whole plan.
3. **Re-verify + re-cohere** — `node engine/cli.mjs verify runs/current/app-spec.json`, then
   `kf-coherence-critic`. Fix knock-on effects (e.g. Form→Process adds a workflow; a new role needs
   permissions + a landing).
4. **Log it** — append to `runs/current/decisions.md`: the change, who asked, and the new decision
   (`Status: changed-by-user`).
5. **Regenerate + snapshot** — re-run `review.mjs` → `review.html` and `kf-prototype` → `prototype/`,
   then `node engine/runs.mjs snapshot "<one-line summary of the changes>"` (new version vN+1).

## Output
**What changed** (added / removed / modified) and any **consequences** you had to handle, plus the new
version number. Show a short before→after for the touched items. Next: *"Review again (`/author-review`
or open the new `review.html`), refine more, or `/author-preview` when confident."*
