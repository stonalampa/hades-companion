# hades-companion

A second-screen helper for **Hades** (Supergiant Games, 2020) that answers the question you ask yourself every few rooms:

> *"Given what I have right now, what can I still get — and what do I need for Merciful End?"*

Type the boons you pick up; the app shows which Duo and Legendary boons are **eligible now**, which are **one boon away** (and which boons complete them), and warns you when taking a boon would **replace a slot and break** something you already have. Any boon opens a **"how to get it"** tree. Achievements live in a second tab, synced from Steam if you want.

It can also be your AI build buddy: the server edition exposes your current run over **MCP**, so Claude, Codex, ChatGPT or any MCP client can discuss your build using the game's real rules instead of guessing.

*Unofficial fan project. Not affiliated with or endorsed by Supergiant Games or Valve.* Hades II support is planned.

## Why

Wikis tell you what a boon does; they don't tell you what *your* run can still reach. The rules for Duo and Legendary boons are precise (Merciful End needs an Ares **and** an Athena Attack or Special — Divine Dash doesn't count) and easy to get wrong mid-run. Those rules already exist in the game's own data files, so this project reads them from there instead of retyping them.

## Features

- **Current run** — fast keyboard entry (`/` to focus, Enter to add, Shift+Enter to look up), weapon and aspect picker, slot replacement with "replaces / breaks" warnings, pinned targets kept across runs.
- **How to get it** — prerequisite tree (all of / one of), nested prerequisites, "boons away" count, what a boon leads to, exclusions ("never offered with Aspect of Beowulf"), Mirror of Night requirements.
- **Aspect-aware rules** — Beowulf/Hera cast variants, aspect exclusions and renames (Flood Shot is *Flood Flare* under Beowulf), keepsakes that count as prerequisites (Conch Shell, Lambent Plume).
- **Achievements** — checklist with filters, "earned in a run" scope, and which achievements the current run counts toward. Optional Steam sync.
- **MCP server** — read-only tools: `get_current_run`, `get_boon`, `search_boons`, `list_achievements`.
- Local-first, no accounts, no ads, no analytics.

## How it works

```text
your Hades install ──► tools/importer (Go + Lua VM) ──► data/hades1/dataset.json   (committed: IDs + rules only)
                                                   └──► game-files/generated/      (local only: text, icon paths)
GUI.pkg ──► tools/icons (deppth) ──────────────────────► game-files/generated/icons
Steam Web API ──► tools/steamschema ───────────────────► game-files/generated/achievement*

web/ (React)  ── static: progress in the browser
     └─ server/ (Go) ── state + Steam sync + MCP at /mcp ── Docker image
```

Boon rules come from the game scripts (`LootData.lua`, `TraitData.lua`, `WeaponUpgradeData.lua`, `AchievementData.lua`) and are normalised to *one of each set*: `requires: [[AresWeaponTrait, AresSecondaryTrait], [AthenaWeaponTrait, AthenaSecondaryTrait]]`. Design notes: [`docs/decisions.md`](docs/decisions.md), [`docs/discovery.md`](docs/discovery.md).

## Getting started

You need a copy of Hades (Steam), Go 1.27+, Node 24+, and Python 3 for icons.

### 1. Copy game files from your install

They are not in this repo. From `…\steamapps\common\Hades\Content\` (Windows; on other platforms find the same `Content` folder):

```text
Scripts\                                  -> game-files/Scripts/
Game\Text\en\                             -> game-files/en/
Game\Animations\GUIAnimations.sjson       -> game-files/Animations/
Win\Packages\GUI.pkg + GUI.pkg_manifest   -> game-files/Packages/
```

### 2. Generate data

```sh
go run ./tools/importer                       # dataset + local text + icon paths
python3 -m venv .venv && .venv/bin/pip install -r tools/icons/requirements.txt
.venv/bin/python -I tools/icons/extract_icons.py \
  game-files/Packages/GUI.pkg game-files/generated/icon-paths.json game-files/generated/icons
STEAM_API_KEY=... go run ./tools/steamschema  # optional: achievement names, descriptions, icons
```

A Steam Web API key is free at <https://steamcommunity.com/dev/apikey>. It is read from the environment and never written anywhere; a gitignored `.env` plus `set -a; source .env; set +a` works well.

### 3. Run the app

```sh
cd web
npm install
npm run game-assets   # copies your local text/icons into public/local (dev only, stripped from builds)
npm run dev
npm test
```

## Server edition (state, Steam, MCP)

```sh
cd web && npm run build && cd ..
go run ./server -web web/dist                 # http://127.0.0.1:8080, MCP at /mcp
```

- **Steam sync:** start the server with `STEAM_API_KEY` and `STEAM_ID` (SteamID64, profile URL or custom URL name). Your Steam profile needs *Game details: Public*. The app pulls achievements on load and on window focus; the server asks Steam at most once a minute. Steam unlocks are kept apart from manual marks.
- **MCP with Claude Code:** `claude mcp add --transport http hades http://127.0.0.1:8080/mcp`, then ask e.g. *"Athena is offering Divine Strike, Divine Flourish or Phalanx Shot — which helps my build?"*
- In dev, `npm run dev` proxies `/api` and `/mcp` to `:8080`.
- The UI and API have no authentication: keep the server on localhost or behind your own reverse proxy/SSO.

## Docker

The image (amd64 + arm64, built by `.github/workflows/docker.yml` into `ghcr.io/stonalampa/hades-companion`) contains the app, the server and the structural dataset — **no game text or icons**. Mount your own generated assets.

```sh
mkdir -p assets state && cp -R game-files/generated/. assets/
sudo chown 65532:65532 state                  # the container runs as nonroot
docker compose up -d                          # compose.yaml; .env holds STEAM_API_KEY, STEAM_ID, MCP_TOKEN
```

Behind a proxy with SSO, protect the app normally and let only `/mcp` bypass SSO with `MCP_TOKEN` set; the server then requires `Authorization: Bearer <MCP_TOKEN>`:

```sh
claude mcp add --transport http hades https://hades.example.com/mcp --header "Authorization: Bearer $MCP_TOKEN"
```

`GET /healthz` returns `ok`.

## Project layout

```text
data/hades1/        generated dataset (structural facts, source checksums)
tools/importer/     game scripts -> dataset (Go, gopher-lua)
tools/icons/        icon extraction from GUI.pkg (Python, deppth)
tools/steamschema/  achievement names/icons from Steam (Go)
web/                React app; web/src/core/ holds the eligibility logic
server/             Go server: state, Steam sync, MCP
docs/               decisions and discovery notes
```

## Game content and licensing

- **Code** in this repository is MIT licensed ([LICENSE](LICENSE)).
- **Hades** and all of its content — data, text, art, icons, names — belong to **Supergiant Games**. None of their text, art or icons is included in this repository or the Docker image; the tools generate them locally from *your own* copy of the game, for your own use.
- `data/hades1/dataset.json` contains only structural facts (internal IDs and prerequisite rules) derived from the game scripts so the app can work; it carries no game text or art.
- Achievement metadata comes from the Steam Web API under the [Steam API Terms of Use](https://steamcommunity.com/dev/apiterms) and is likewise kept local.
- If Supergiant Games has any concern about this project, please open an issue and it will be addressed promptly.

## Credits

- [Supergiant Games](https://www.supergiantgames.com/) for Hades.
- [deppth](https://github.com/quaerus/deppth) (MIT) for reading Supergiant package files.
- [gopher-lua](https://github.com/yuin/gopher-lua), the [MCP Go SDK](https://github.com/modelcontextprotocol/go-sdk), React and Vite.

## Contributing

Issues and pull requests are welcome. See [`AGENTS.md`](AGENTS.md) for the ground rules (they apply to humans too): never commit game files, keep the TS and Go eligibility logic in step, and record decisions in `docs/`.
