# forall x: Calgary, interactive study edition

A web version of *forall x: Calgary. An Introduction to Formal Logic* (CC BY 4.0,
https://github.com/rzach/forallx-yyc) with checkers for the exercises: truth tables,
symbolizations, and Fitch-style natural-deduction proofs for TFL, FOL and modal logic.

- `content/source/`: unmodified upstream LaTeX (commit 63c92e8, Oct 2026).
- `tools/convert.py`: LaTeX to JSON converter. `npm run convert` rebuilds `content/build/`
  and copies it to `public/content/`. The coverage report is `content/build/report.txt`.
- `src/logic/`: formula parser and printer, truth-table semantics, finite-model sampling,
  and the natural-deduction checker (`nd.ts`).
- `tests/run.ts` (`npm test`): replays the book's proofs and truth tables through the engine.
- `docs/ERRATA.md`: slips in the upstream solutions that the checker found.

Progress is stored in the browser (localStorage); export and import from the About page.

Develop with `npm run dev`; build with `npm run build`.
