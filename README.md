# Kissflow App UI — Claude Code plugin

A Claude Code plugin (and marketplace) that lets an agent **scaffold and build a custom
UI for a Kissflow app** with no manual CLI step. It wraps
[`@sooryakanth/create-kf-app`](https://www.npmjs.com/package/@sooryakanth/create-kf-app)
and [`@sooryakanth/app-ui`](https://www.npmjs.com/package/@sooryakanth/app-ui).

## Install

This repo is the marketplace. From Claude Code:

```
/plugin marketplace add sooryakanth/kissflow-app-ui-plugin
/plugin install kissflow-app-ui@kissflow
```

(or `/plugin marketplace add ./kissflow-app-ui-plugin` for a local path, then the same install.)

## Use

Two ways:

- **Just ask** — e.g. *"build a leave-request UI for my Kissflow app"*. The
  `build-kissflow-app` skill triggers, scaffolds the project, onboards itself
  (data-model sync + reading the docs), and builds the screens.
- **Slash command** — `/kissflow-app-ui:new-kf-app leave-tracker` to scaffold
  explicitly, then build.

(The App ID isn't needed to scaffold — it's only used later when syncing the app's data
models, where the plugin will ask you for it along with the access keys.)

The plugin's skill drives the whole flow: scaffold → `npm install` → set up `.env` +
`npm run kf:sync` (asks you for the app's REST keys if needed) → read the app's data
models from `lib/kf-context.md` → build the UI per `agents/design-guidelines.md` (modern,
designed fresh for the app — not a reskin of the demo).

## What's inside

```
.claude-plugin/marketplace.json          ← the marketplace
plugins/kissflow-app-ui/
  .claude-plugin/plugin.json             ← the plugin manifest
  skills/build-kissflow-app/SKILL.md     ← auto-invoked skill (the main entry)
  commands/new-kf-app.md                 ← /kissflow-app-ui:new-kf-app
```

## Requires

- The published packages: `@sooryakanth/create-kf-app`, `@sooryakanth/app-ui`,
  `@sooryakanth/lowcode-client-sdk`.
- Node 18.14+ and npm.
- For data sync: the app's Kissflow REST access keys (`.env`).
