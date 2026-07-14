# Impossibility claims — platform-owner confirmation queue

Beliefs of the form "the platform can't X" that currently CONSTRAIN DESIGNS. Each stays
challengeable (`[tier:reproduced]` at best) until a platform owner marks it CONFIRMED or DENIED.
A DENIED verdict triggers contradiction: supersede the memory entry, trace its citations, emit
the revision worklist. (Three prior beliefs of this class — DEF-4, R7, §1b — were all DENIED.)

| # | Claim | Evidence today | Blast radius | Verdict |
|---|---|---|---|---|
| Q1 | ~~Workflows are Sequence-only over the metadata API~~ | addWorkflow authors Sequence; no branch shape observed in exports we hold | HIGH — fan-out work modeled as child-process instances (npd-plm B1) | **DENIED (owner, 2026-07-04): the platform HAS parallel branches and conditional skips — this was an ENGINE gap misrecorded as a platform limit.** Contradiction flow executed; engine capability work queued. |
| Q2 | No conditional-mandatory primitive (field required only when another field has value X) | ir/builders carry static Required only; no rule entity found in platform source dumps | MEDIUM — conditional-mandatory fields authored as optional + convention (R14) | **CONFIRMED (owner, 2026-07-04)** — genuine platform limit; R14 pattern stands, tier upgraded to owner-confirmed. |
| Q3 | ~~Report View access = all items; no row-level scope enforcement~~ | permission grants observed to expose full registers | HIGH — data_scope is convention + view design, not enforcement (SEC-R2) | **DENIED (owner, 2026-07-04): row-level report scoping EXISTS — engine gap misrecorded as platform limit.** Discovery + engine support queued; SEC-R2-style waivers to be revisited. |
| Q4 | Integrations have no field-change trigger (item-level events only: created/submitted/completed/advances) | connector catalog + golden exports show item events only | MEDIUM — revert/edit signals unstitchable (npd-plm c6) | **CONFIRMED (owner, 2026-07-04)** — genuine platform limit; item-level triggers are the full vocabulary. Pull-surface patterns (ledger views) remain the correct design for edit signals. |
| Q5 | SequenceNumber cannot express per-anchor sub-numbering (e.g. revision 00,01 per warrant) | SequenceNumber is flow-global in all observed shapes | MEDIUM — version/revision numbers user-entered (R2) | PENDING |
| Q6 | A published app cannot be archived/deleted via the public API | archive → 403 live (P2P Perf Benchmark, 2026-07-04) | LOW — dev-account hygiene only | **CONFIRMED (owner, 2026-07-04)** — never create throwaway apps on shared accounts; benchmarks must be clearly named and rare. |
