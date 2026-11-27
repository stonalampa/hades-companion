# Decisions

Short record of what was decided and why. Details and evidence: [discovery.md](discovery.md).

## Product

- **A mid-run helper, not a wiki.** The main screen is the current run: type a boon, see which Duo/Legendary boons are eligible now and which are one boon away, with a warning when a slot boon would replace (and break) something you have. Lookup ("how do I get Merciful End?") is one keystroke away.
- **Hades I first.** The schema is game-scoped so Hades II can follow without forcing its mechanics into Hades I terms.
- **Eligibility, never promises.** The game decides what it offers; the app only says what *can* be offered.
- **Keepsake is a pick, not a boon** (2026-11-27). One is equipped at a time and can be swapped between biomes, like the aspect it counts as held. Older runs that held a keepsake in the build are migrated.
- **Four-god limit** (2026-11-27). The game offers boons from at most four Olympians per run (`ReachedMaxGods` in `RunManager.lua`, `maxLootTypes = 4`); Hermes has `GodLoot = false` and doesn't count. The run keeps a history of gods taken because the game counts a god even after its boon is replaced; removing a boon by hand is treated as a correction and forgets its god.
- **No save-file import (for now).** It would mostly duplicate the in-game Codex; achievements come from Steam or manual marks.

## Data

- **Game scripts are the source of truth.** Prerequisites, exclusions and aspect rules come from the game's own Lua data via `tools/importer`, not from wikis. Rules normalise to CNF (`requires: [[a, b], [c]]` = one of a/b AND c).
- **Only structural facts are committed** (`data/hades1/dataset.json`: IDs, slots, prerequisite rules, source checksums). Game text, icons and Steam achievement metadata are generated locally from the user's own install/account into `game-files/` and never committed, bundled or put in the Docker image.

## Editions

- **Static site:** progress in the browser, achievements marked by hand. Free to host.
- **Server (Docker):** the same frontend plus a Go server that keeps state, syncs Steam achievements and exposes an MCP server. The frontend detects it via `GET /api/capabilities`.
- **AI via MCP, not an LLM inside the app.** Users bring their own assistant (Claude, Codex, ChatGPT…); the app pays for nothing and holds no AI keys. Tools are read-only.
- **Steam:** the Web API has no CORS, hence server-side only. The key and Steam ID come from the environment. Steam unlocks are stored apart from manual marks, so a sync never undoes a manual mark. Steam is asked at most once a minute.
- **State is a JSON file.** One player per server; SQLite only if that changes.

## Stack

- Frontend: TypeScript, React, Vite. Tests: Vitest.
- Server and tools: Go (official MCP Go SDK, gopher-lua for the importer).
- Eligibility logic exists in TS (UI) and Go (MCP); both have the same tests and must change together.
- Code license: MIT. Game content belongs to Supergiant Games.
