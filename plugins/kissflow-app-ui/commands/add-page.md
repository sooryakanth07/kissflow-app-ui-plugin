---
description: Generate app pages with the architect → ui → builder → qa agent pipeline, from the connected app's synced schema.
argument-hint: [pageId | area | "a dashboard for X" | (blank = all pages)]
---

`/add-page` is the **orchestrator** for a small team of agents that turn the connected
app's synced schema into world-class React pages. You (the main agent) run the pipeline;
each stage is a dedicated subagent (spawn via the Agent tool with the given `subagent_type`).

Pre-req: `/connect` + `/sync` have run, so `lib/kf-context.md`, `kf-schema.json`,
and `lib/pages/*.json` exist. If they don't, tell the user to run `/sync` first and stop.

## Memory — the pipeline evolves
- The shared memory is **`lib/kf-preferences.md`** (learned preferences + overrides).
  Every agent reads it first and applies it; widget choices use the ranking system
  (`WIDGET-RANKING.md` / `widget-rank.js`).
- **Capture**: whenever the user states or corrects a preference during this run (theme,
  a widget choice, layout, naming, "don't do X", "always do Y"), record it in
  `kf-preferences.md` — right section, dated, scoped `[global]` or `[page:<route>]`. Newest
  wins. Do this as it happens, not only at the end.
- **Consolidate when needed**: if the file grows redundant or contradictory, rewrite it
  tighter (merge/replace duplicates, keep `[HARD]` rules) so it stays short and authoritative.
  This is how the agents get better at matching the user's taste over time.

## Step 0 — theme (ask the user)
Read the theme registry `src/themes.js` and ask (AskUserQuestion) which theme to
use — the current named presets are **Translucent** (default, frosted glass) · **Aurelia**
(warm editorial, solid cards) · **Midnight** (dark) · **Noir** (mono minimal) · **Meadow**
(fresh green). Themes are global, token-based, and runtime-switchable (sidebar Theme
switcher), so "choosing while generating" sets the app's **default** theme: set the chosen
id as the default in `themes.js` `getTheme()` (or `document.documentElement.dataset.theme`)
and record it in `app-spec.json` (`app.theme`). Design pages against the theme TOKENS (never
hardcode colors), so every page looks right under any theme.

## Step 1 — Architect (`subagent_type: kf-architect`)
Spawn the architect to read the schema and write `lib/app-spec.json` — the page
set, the widgets per page (bound to REAL model/field ids), and per-role access. Pass it
the chosen theme and `$ARGUMENTS` (so it can scope to one page/area or plan all pages).

## Step 2 — decide scope
- `$ARGUMENTS` names a page/area → build just that page.
- `$ARGUMENTS` is a free-form ask → architect designed a page for it; build that.
- blank → confirm with the user, then build **every** page in `app-spec.json`.

## Step 3 — UI → Builder (fan out per page)
For each page in scope, run the two stages in order:
1. `subagent_type: kf-ui` — enrich that page's layout/variants/theme in `app-spec.json`.
2. `subagent_type: kf-builder` — generate `src/pages/<route>.jsx` + the nav entry.

Pages are independent — spawn the per-page (ui→builder) chains **in parallel** (one Agent
call per page in a single message) so they build concurrently.

## Step 4 — QA (`subagent_type: kf-qa`)
After the builders finish, spawn QA once to validate everything: build passes, only real
ids used, no hardcoded data, role-gating + actions wired, full spec coverage. If QA returns
❌ items, dispatch a `kf-builder` back over just the failing pages with QA's fix list, then
re-run QA. Loop until green (cap ~2 rounds), then report.

## Finish
Summarize: pages generated (with routes), key design choices, and the QA result. Tell the
user to `/run` to preview and `/deploy` when ready. Keep every value SDK-derived and every
action wired (`openForm` / `NewButton`) so it works once deployed in Kissflow.
