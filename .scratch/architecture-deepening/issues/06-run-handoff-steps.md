# Make runHandoff's steps testable

Type: task
Status: needs-triage
Blocked by: 04

## Problem

`session-handoff/hooks/register.tsx` l.51-190 is one ~140-line function (setStep + invalidate, `Promise.race` vs timeout, verify, persist), reachable only through a fake engine (`tests/handoff.test.tsx`, 373 lines). Recent fixes (4aa2504, c185077, da31879) landed in this glue, not in the tested pure files.

## Goal

A handoff-run module with an in-memory engine adapter. Speculative: one real adapter today, so the seam stays hypothetical unless 04 supplies a second. Revisit after 04; wontfix if 04 is rejected.
