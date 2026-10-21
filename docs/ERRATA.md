# Upstream errata found by replaying the book through the checker

These are slips in the upstream LaTeX (commit 63c92e8) that the proof checker
flags when the book's own proofs are replayed. They are left as printed;
the exercise widgets check the learner's work, not the printed solution.

- ch05 solutions A2: `(M ∨ ¬M` closing bracket outside math (fixed in conversion).
- ch20 solutions A: theorem ((A→B)→A)→A, line 9 cites IP 1–8; the subproof is 2–8.
- ch36 solutions D (third proof): line 11 drops the negation that line 10 has.
- ch36 solutions E: `∀x F(x) → ∀y(F(x) ∧ F(x))` should read F(y); `¬M(a) ∨ L(j,x)` should read L(j,a).
- ch36 solutions F: citation `2––9`.
- ch37 exercises A5 and C3: stray `)` after `∀x B(x)` (fixed in conversion).
- ch38 solutions B: unresolved citation `ab`; line 8 uses ∀E where ∀I is meant; line 8 of the
  second proof lacks the ¬ needed for line 9.
- ch38 solutions C: unresolved citation `ga`.
- ch39 solutions A: `=E 6, 7` cites its own line; `=E 3, 7` should cite line 4; `DS 7, 5` uses F(a) as if it were ¬¬F(a).
- ch39 solutions B/C/D: unbalanced brackets in two premises; unresolved citation `fafb–14`.
- ch43 solutions A: first proof cites □I 3–4 for a strict subproof that starts at line 2.
- ch43 solutions B: ¬I 2–6 should be 2–7. E: ∨I 4 cites its own line (should be 3). F: ¬I 5–9 should be 6–9.
- ch43 text: the S4 example proof cites →I 1–6 for a subproof 1–4 (fixed in conversion).
