# proto-kit component cookbook (shadcn/ui conventions · "Lovable violet" theme)

Role-part agents ASSEMBLE these components — never invent CSS. The shell (`shadcn-shell.html`)
ships the Tailwind CDN + shadcn token bridge, so every snippet below works verbatim.
**Rules: no `<style>` blocks in parts. No new class conventions. Compose, bind seed data, done.**

Shell globals available to part scripts (deferred after SEED by the assembler):
`SEED`, `ICON(name, cls)`, `fmtINR(n)`, `fmtDate(iso)`, `initials(name)`, `colorFor(str)`,
`find*(id)` lookups, `openPopup(html)` / `closePopup()` / `showToast(msg)`,
`window.onNavigate(roleSlug, navId)` hook for sub-pages.

Part contract: root is `your dashboard markup` + one `<script>` that fills dynamic regions
from SEED. Give dynamic containers ids prefixed with your role slug (`req-`, `mgr-`, …).

---

## Stat card row (KPI band)
```html
<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  <div class="rounded-lg border border-border bg-card p-5 shadow-sm">
    <div class="flex items-center justify-between text-muted-foreground">
      <span class="text-[13px] font-medium">Open requisitions</span>
      <span class="h-8 w-8 rounded-md bg-accent text-accent-foreground grid place-items-center">…ICON…</span>
    </div>
    <div class="mt-2 text-2xl font-bold tabular-nums">12</div>
    <div class="mt-1 text-xs text-muted-foreground"><span class="text-success font-semibold">▲ 8%</span> vs last month</div>
  </div>
</div>
```
Optional sparkline inside a stat card (uses kit chart classes from the shell):
```html
<svg class="kit-spark mt-2 w-full" viewBox="0 0 120 32" preserveAspectRatio="none">
  <path class="area" d="M0 28 L20 22 L40 24 L60 14 L80 16 L100 8 L120 12 L120 32 L0 32 Z"/>
  <path d="M0 28 L20 22 L40 24 L60 14 L80 16 L100 8 L120 12"/>
</svg>
```

## Card (generic container — everything lives in cards)
```html
<div class="rounded-lg border border-border bg-card shadow-sm">
  <div class="flex items-center justify-between px-5 py-4 border-b border-border">
    <div><h3 class="font-semibold">Pending approvals</h3><p class="text-xs text-muted-foreground">Sorted by age</p></div>
    <button class="text-sm font-medium text-primary hover:underline">View all</button>
  </div>
  <div class="p-5">…content…</div>
</div>
```

## Buttons
```html
<button class="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 py-2 text-sm font-semibold shadow-sm hover:opacity-90">Primary</button>
<button class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-semibold hover:bg-muted">Outline</button>
<button class="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">Ghost</button>
<button class="inline-flex items-center gap-1.5 rounded-md bg-destructive text-destructive-foreground px-3.5 py-2 text-sm font-semibold hover:opacity-90">Reject</button>
<button class="inline-flex items-center gap-1.5 rounded-md bg-success text-success-foreground px-3.5 py-2 text-sm font-semibold hover:opacity-90">Approve</button>
```

## Badges (status). Map workflow states onto these four; never invent hues.
```html
<span class="inline-flex items-center gap-1 rounded-full bg-accent text-accent-foreground px-2.5 py-0.5 text-xs font-semibold">In progress</span>
<span class="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-2.5 py-0.5 text-xs font-semibold">Approved</span>
<span class="inline-flex items-center gap-1 rounded-full bg-warning/10 text-warning px-2.5 py-0.5 text-xs font-semibold">Awaiting</span>
<span class="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2.5 py-0.5 text-xs font-semibold">Rejected</span>
<span class="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-semibold">Draft</span>
```

## Table (data list — wrap in a Card)
```html
<div class="overflow-x-auto">
  <table class="w-full text-sm">
    <thead><tr class="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
      <th class="px-5 py-3 font-semibold">Requisition</th><th class="px-5 py-3 font-semibold">Amount</th><th class="px-5 py-3 font-semibold">Status</th><th class="px-5 py-3"></th>
    </tr></thead>
    <tbody id="req-table"><!-- rows from SEED -->
      <tr class="border-b border-border/60 hover:bg-muted/50 cursor-pointer">
        <td class="px-5 py-3"><div class="font-medium">Laptops for interns</div><div class="text-xs text-muted-foreground">PR-0031 · IT</div></td>
        <td class="px-5 py-3 tabular-nums font-medium">₹4,20,000</td>
        <td class="px-5 py-3">…badge…</td>
        <td class="px-5 py-3 text-right">…ghost button…</td>
      </tr>
    </tbody>
  </table>
</div>
```

## Approval queue row (actionable inbox)
```html
<div class="flex items-center gap-4 px-5 py-4 border-b border-border/60 hover:bg-muted/40">
  <div class="h-10 w-10 rounded-full grid place-items-center text-xs font-bold text-white shrink-0" style="background:#2563eb">AI</div>
  <div class="min-w-0 flex-1">
    <div class="font-medium truncate">PR-0031 — Laptops for interns</div>
    <div class="text-xs text-muted-foreground">Ananya Iyer · ₹4,20,000 · 2 days waiting</div>
  </div>
  <div class="flex gap-2 shrink-0">…Approve/Reject buttons (small: px-3 py-1.5)…</div>
</div>
```

## Tabs (within a page)
```html
<div class="inline-flex rounded-lg border border-border bg-muted p-1 mb-4" data-tabs="req-tabs">
  <button data-tab="open" class="rounded-md px-3.5 py-1.5 text-sm font-medium bg-card shadow-sm">Open</button>
  <button data-tab="closed" class="rounded-md px-3.5 py-1.5 text-sm font-medium text-muted-foreground">Closed</button>
</div>
```
Toggle in your part script: swap `bg-card shadow-sm` ↔ `text-muted-foreground`, show/hide panels.

## Bar chart (monthly spend etc. — kit classes)
```html
<svg class="w-full" height="120" viewBox="0 0 240 120" preserveAspectRatio="none">
  <rect class="kit-bar alt" x="10" y="60" width="22" height="60"/>
  <rect class="kit-bar" x="42" y="30" width="22" height="90"/>
</svg>
```

## Donut / progress ring
```html
<svg width="120" height="120" viewBox="0 0 120 120">
  <circle class="kit-donut-track" cx="60" cy="60" r="50" fill="none" stroke-width="12"/>
  <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(var(--primary))" stroke-width="12"
          stroke-dasharray="314" stroke-dashoffset="94" stroke-linecap="round" transform="rotate(-90 60 60)"/>
  <text x="60" y="66" text-anchor="middle" class="font-bold" font-size="20" fill="currentColor">70%</text>
</svg>
```

## Timeline / activity feed
```html
<ol class="relative border-l border-border ml-2 space-y-5">
  <li class="ml-5"><span class="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary"></span>
    <div class="text-sm font-medium">PO-0012 approved by Finance</div>
    <div class="text-xs text-muted-foreground">Meera Krishnan · 02 Jul</div></li>
</ol>
```

## Progress bar (budget consumption etc.)
```html
<div class="flex items-center justify-between text-xs mb-1"><span class="font-medium">IT budget</span><span class="text-muted-foreground tabular-nums">₹8.2L / ₹12L</span></div>
<div class="h-2 rounded-full bg-muted overflow-hidden"><div class="h-full rounded-full bg-primary" style="width:68%"></div></div>
```

## Form fields (inside openPopup create-forms)
```html
<h3 class="text-lg font-bold mb-1">New requisition</h3><p class="text-sm text-muted-foreground mb-5">Sent to your manager for approval.</p>
<label class="block text-sm font-medium mb-1.5">Title</label>
<input class="w-full rounded-md border border-input bg-card px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-ring" placeholder="What do you need?">
<select class="w-full rounded-md border border-input bg-card px-3 py-2 text-sm mb-4">…options from SEED.lists…</select>
<div class="flex justify-end gap-2 mt-2">…Ghost Cancel (closePopup())… …Primary Submit (showToast('Requisition submitted'); closePopup())…</div>
```

## Empty state
```html
<div class="py-12 text-center">
  <div class="mx-auto h-12 w-12 rounded-full bg-muted grid place-items-center text-muted-foreground mb-3">…ICON…</div>
  <div class="font-semibold">Nothing waiting on you</div><div class="text-sm text-muted-foreground">Approved items move to Purchase Orders.</div>
</div>
```

## Kanban column (pipeline views)
```html
<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
  <div class="rounded-lg bg-muted/60 p-3">
    <div class="flex items-center justify-between px-1.5 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><span>Sourcing</span><span class="rounded-full bg-card border border-border px-2 py-0.5 tabular-nums">4</span></div>
    <div class="space-y-2"><div class="rounded-md border border-border bg-card p-3 shadow-sm">…title, meta, badge…</div></div>
  </div>
</div>
```

---

### Layout recipe per dashboard
1. KPI stat row (3–5 cards, one with sparkline) → 2. main work surface (queue/table/kanban in a Card,
2/3 width) beside a rail (timeline, budget bars, donut — 1/3 width) via
`grid grid-cols-1 xl:grid-cols-3 gap-6` with `xl:col-span-2` → 3. secondary nav pages = ONE lean
Card each (table or queue), no KPI band. Bind everything to SEED; actions call
`openPopup`/`showToast` — never dead buttons.
