---
description: STAGE 1 (ingest) — start a new RUN from a requirement. Accepts a BRD file, pasted requirement text, or even a one-line ask. Extracts a structured domain brief (personas, journeys, entities, rules) into the run's IR, and lists assumptions + open questions. Nothing is designed or applied.
argument-hint: [BRD file path (.md/.txt/.pdf/.docx) | pasted requirement text | one-line ask]
---

**Stage 1 of the staged authoring pipeline: ingest.** Each requirement becomes its own **run**
(isolated, versioned) under `runs/`.

Pre-req: `/author-setup` has put `engine/` + `reference/` + `MEMORY.md` in the working dir.

## Accept any input shape
`$ARGUMENTS` may be **(a)** a path to a BRD file, **(b)** pasted requirement text (a paragraph or a
whole spec), or **(c)** a one-line ask (e.g. *"a leave request app with manager approval"*). Detect
which and normalise:
- **File path that exists** → pass it as the `<brd-path>` below (runs.mjs copies it in).
- **Pasted text / one-liner** → create the run WITHOUT a path, then write the text verbatim to
  `runs/current/brd.md` so the run is self-contained and re-runnable.
- **Nothing given** → ask for a requirement (a sentence is enough) and stop.

The thinner the input, the more you LEAN ON open-questions + assumptions — a one-liner is valid; just
surface everything you had to infer so the user can correct it before `/author-plan`.

## Do
1. **Create the run.** For a file: `node engine/runs.mjs new <short-slug> <brd-path>`. For pasted/one-line
   text: `node engine/runs.mjs new <short-slug>` (slug derived from the ask, e.g. `leave-request`), then
   write the text to `runs/current/brd.md`. This makes `runs/<slug>/` the **current** run; all
   subsequent stages operate on `runs/current/`.
2. **Read the requirement** (the file, for PDFs/large docs in full; or the pasted/one-line text). 
3. **Extract the domain** — spawn `kf-ba` (+ `kf-comprehension` for a big/messy doc): personas,
   journeys (outcomes), entities (+ key attributes + relationships), business rules → write to
   `runs/current/app-spec.json#domain`.
4. **Surface uncertainty** — write `runs/current/open-questions.md`: every ASSUMPTION and AMBIGUITY as
   a one-line question.
5. **Seed the decision log** — `runs/current/decisions.md` with the ingest summary. Set stage=brief.

## Metadata is sacrosanct
Extract only what the BRD says or clearly implies. Assumptions go in `open-questions.md`, never
silently into the domain.

## Output
A tight **brief** (the app in 2 lines · personas · top journeys · entity list · key rules), the run
name, and the top open questions inline. Next: *"Answer any open questions, or `/author-plan` to
propose the design."*
