# AGENTS.md — hades-companion

Shared instructions for coding agents (Claude Code, Codex). Decisions: `docs/decisions.md`. Findings and progress log: `docs/discovery.md`. Setup: `README.md`.

## What this is

Mid-run helper for Hades I (Hades II later): current-run boons → eligible Duo/Legendary boons and what is missing; achievement checklist. Static edition + server edition (Go: state, Steam sync, MCP). Frontend: TypeScript + React + Vite.

## Rules

- Inspect the repo before changing it. Small, testable increments; no big scaffolding.
- Never commit game files, game text, icons, save files, Steam keys or personal data. Raw and generated game files live in `game-files/` (gitignored); `assets/`, `state/`, `notes/` and `.env` are gitignored too.
- Game data comes from the user's own install via `tools/importer`, not from third-party mirrors. Each dataset records source checksums.
- Eligibility logic lives in `web/src/core/` and `server/eligibility.go`. Change both and their tests together.
- Keep game-specific rules behind explicit boundaries; don't force Hades II mechanics into Hades I terms.
- Eligibility ≠ appearance: never present an eligible boon as guaranteed.
- Record decisions in `docs/decisions.md`, progress in `docs/discovery.md`.
- Reply in the language the user writes in. Repo docs and code are in English.
- `notes/` (gitignored) may hold the maintainer's private planning context; read it if present, never copy it into tracked files.
