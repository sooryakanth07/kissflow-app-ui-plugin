---
description: List all authoring runs (one per BRD) with their version counts, and switch the active run. Each BRD lives in its own runs/<slug>/ directory with versioned snapshots.
argument-hint: [<run-slug> to switch to it | blank to list]
---

Manage the runs under `runs/` — each is one BRD's authoring session, versioned independently.

## Do
- **No argument** → `node engine/runs.mjs list` (shows every run, `*` = current, version count each).
- **A run slug given** in `$ARGUMENTS` → `node engine/runs.mjs use <slug>` to make it the current run,
  then `node engine/runs.mjs status` to show what you switched to.

## Output
The run list (or the switch confirmation + status). Remind the user that all stage commands
(`/author-plan`, `/author-review`, `/author-refine`, `/author-preview`, `/author-generate`) act on the
**current** run, and that `/author-brief <brd>` starts a fresh one.
