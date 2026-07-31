# AGENTS.md

Guidance for AI agents working in this repository.

## Working principles

- **No overengineering, and no MVP shortcuts.** Hold the middle path: don't build infrastructure before there's a concrete need (note the seam for later instead), and don't ship quick-and-dirty or "for now" hacks. Build each feature correctly and idiomatically — neither gold-plated nor a placeholder.
- **Early stage — keep the architecture fluid.** Nothing here is load-bearing legacy yet. When something doesn't fit cleanly, reshape the affected part rather than bolting on a special case.
- **Every decision is defensible.** This codebase is read by reviewers, not just run. Prefer the choice you can justify out loud over the one that is merely fastest to type; when a trade-off is real, record it in the README rather than in a comment.
- **Surgical changes.** Clean up what your change orphaned; leave pre-existing dead code alone. Prefer a library's intended API over a clever shim.
- **Never commit unreviewed work.** Only the human commits. Present the diff, wait for an explicit approval, and let them run `git commit`. Nothing reaches history that a human has not read.
- **English only.** All code, comments, identifiers, docs, and commits.

## What this is

A traffic-analytics dashboard. Vehicle detection data (country, vehicle type, time) is stored in a database, aggregated behind an HTTP API, and rendered as two interactive charts: **traffic by country** and **vehicle-type distribution**.

Stack: _TBD_

## Layout

_TBD — fill in once the stack lands._

## Commands

_TBD — one command to bring the whole stack up._

## Conventions

_TBD — response shapes, error rendering, naming._
