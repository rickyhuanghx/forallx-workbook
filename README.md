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

## Progress and accounts

Progress lives in the browser (localStorage) and is the source of truth. Two ways to carry it
across devices, both through `/api/progress` and a private Vercel Blob store:

- Email sign-in (magic link, no password): `api/auth/request.ts` emails a one-time link through
  Resend, `api/auth/verify.ts` spends it and sets an HttpOnly session cookie (HMAC-signed, 180
  days), `api/me.ts`, `api/auth/logout.ts` and `api/account.ts` (DELETE removes the account and
  its data). Shared code in `src/server/auth.ts`.
- A sync code (24-character secret) for people who do not want to give an email.

Environment variables (Vercel project settings): `BLOB_READ_WRITE_TOKEN`, `AUTH_SECRET` (32+
random chars), `RESEND_API_KEY`, `RESEND_FROM` (e.g. `forall x workbook <login@example.org>`),
`APP_URL` (public origin used in the emailed link).

## Licence

Code: MIT. Book text and exercises: CC BY 4.0, unchanged wording, see `LICENSE`. This is an
independent, free, non-commercial study edition and is not affiliated with or endorsed by the
authors. Questions or concerns: hh695@cam.ac.uk.

Develop with `npm run dev`; build with `npm run build`.
