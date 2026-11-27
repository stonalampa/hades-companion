# Discovery — Hades I data, licensing, prior art

Date: 2026-11-27. Scope: Hades I (Hades II later). Decisions: [decisions.md](decisions.md).

## TL;DR

1. **The game's own Lua scripts are the source of truth.** Boon prerequisites and most achievement conditions are declarative data, not code. An importer can turn them into JSON reliably.
2. **Use your own install, not the GitHub mirror.** The candidate mirror is unlicensed and *modified* (cheat tweaks in other files; its `LootData.lua` and `AchievementData.lua` are byte-identical to the v1.0 install).
3. **Don't redistribute game files, text or icons.** Commit the importer and derived structural data (IDs, prerequisite rules); keep raw scripts, descriptions and icons local until permission is clear.
4. **No existing tool does "current run → eligible Duo/Legendary + missing achievements" for Hades I, and no Hades MCP server exists.** Gap confirmed.

## 1. Game scripts (Hades I)

Location on Windows (Steam): `C:\Program Files (x86)\Steam\steamapps\common\Hades\Content\Scripts\*.lua`. Text is separate: `Content\Game\Text\en\HelpText.en.sjson` (SJSON).

Copied from a local Steam install (v1.0) into `game-files/` (gitignored).

### Boon prerequisites — `LootData.lua`, per god → `LinkedUpgrades`

Three shapes cover the Duo/Legendary/tier-2 rules (63 `OneFromEachSet` occurrences):

```lua
DionysusSpreadTrait = { OneOf = { "DionysusRushTrait", "DionysusWeaponTrait", "DionysusSecondaryTrait" } },

-- Merciful End (Ares + Athena): one Ares Attack/Special AND one Athena Attack/Special
TriggerCurseTrait = {
  OneFromEachSet = {
    { "AresWeaponTrait", "AresSecondaryTrait" },
    { "AthenaWeaponTrait", "AthenaSecondaryTrait" },
  },
},
```

This confirms the handoff example: Merciful End qualifies only via Attack/Special; Divine Dash (`AthenaRushTrait`) is **not** a prerequisite. Note aspect-specific variants (e.g. `ShieldLoadAmmo_*RangedTrait` for Beowulf casts) appear inside the sets — the model must keep them.

Domain model maps directly: `Prereq = OneOf(ids) | AllOf(OneOf(ids)...)`.

Each Duo appears under both gods' `LootData` (e.g. `TriggerCurseTrait` at two places) — dedupe and check both copies agree.

### Achievements — `AchievementData.lua`

- **49 achievements** (matches the expected count; `DefaultAchievement` is a base template, excluded).
- **42** have declarative `CompleteGameStateRequirements`, e.g. `RequiredOneOfTraits`, `RequiredTrait`, `RequiresRunCleared`, `RequiredMinActiveMetaUpgradeLevel`, `RequiredTextLines`.
- **7** are triggered from code and need hand-written rules: `AchClearHeatGate`, `AchPurgedLegendBoon`, `AchBuffedButterfly`, `AchBuffedPlume`, `AchCrushedThanatos`, `AchGreaterCall`, `AchGreaterCallSpurned`.
- Many requirements are meta-progress (keepsakes, NPC text lines, fishing) and not run-related. Tag each achievement as `run` (this run can advance it, e.g. `AchClearRun4thAspect`) or `meta` — that is what the "what can this run unlock" filter needs.
- Names/descriptions are not in the Lua; they come from text files or Steam `GetSchemaForGame`.

### Importer approach

- Evaluate the data files in a sandboxed Lua VM with stubbed globals (`GameData`, constants), then walk the resulting tables → JSON. Codicil (below) did the same with Lua + LuaRocks.
- In Go: `gopher-lua` (Lua 5.1) is a candidate; verify it parses Hades' scripts. Alternative: stock Lua 5.x + JSON dump script.
- `InheritFrom` is resolved by game code, so the importer must implement inheritance.
- Record game version + file checksums with every generated dataset.

### Importer spike — result (2026-11-27)

`tools/importer` (Go + gopher-lua) loads `WeaponSets.lua`, `TraitData.lua`, `LootData.lua`, `AchievementData.lua` with unknown engine globals stubbed, plus `HelpText.en.sjson`. Run from the repo root (defaults are root-relative): `(cd tools/importer && go build -o ../../bin/importer .) && bin/importer`.

- **159 boons** (9 gods incl. Hermes): 48 slot (incl. Beowulf `ShieldLoadAmmo_*` variants), 72 standard, **28 duo**, **11 legendary** — counts match the game. 0 warnings: every prerequisite ID exists in `TraitData`, every Duo has identical rules under both gods, every boon has a name/description.
- Prerequisites normalise to CNF (`requires: [[a, b], [c, d]]` = one of a/b AND one of c/d). "Two of three" legendaries (Fully Loaded, Winter Harvest) are encoded by the game as three pair-sets — CNF handles them without special cases.
- Merciful End: `[[AresWeaponTrait, AresSecondaryTrait], [AthenaWeaponTrait, AthenaSecondaryTrait]]` ✓.
- Achievements: 49 (7 `code`, rest declarative). The `run`/`meta` split is a heuristic (only 5 `run`) and needs a hand-curated override file.
- Outputs: `data/hades1/dataset.json` (structure + source checksums, committable) and `game-files/generated/text.en.json` (game text, local only). Descriptions contain format tokens (`{$Keywords.Curse}`, `{$TooltipData...}`) that need rendering; numeric values live in `TraitData`.
- Not yet imported: Chaos, Daedalus hammers, weapons/aspects, Pom; achievement names (not in game text — Steam schema or manual).

## 2. Licensing / redistribution

| Material | Status | Plan |
|---|---|---|
| Game scripts, text, icons | Supergiant copyright. No published fan-site/asset policy found; the [fan merch policy](https://supergiantgames.com/blog/policy-on-fan-merchandise) asks to avoid official art. | Don't commit raw files/text/icons. Importer reads them from the user's own install. Ask Supergiant before a public release with icons/descriptions. |
| Derived structure (IDs, prerequisite rules, achievement conditions) | Game facts; lowest risk. | Commit generated JSON with provenance. |
| `zhang-wen-guang/Hades` mirror | No license; last push 2022; commit messages show it is **modified** (10× fishing, reroll changes, room probabilities). | Do not use as a data source. |
| Hades Fandom wiki | CC BY-SA. | Cross-check only; if text is copied, that dataset becomes CC BY-SA with attribution. |
| Steam achievement names/icons | Served by Steam API/CDN. | Docker edition can fetch at runtime; don't commit. |
| App code | Ours. | MIT proposed (not final). |

## 3. Prior art

- [Codicil](https://github.com/SotSF/hades-codicil) — React + TS build tracker, Lua → JSON extraction. No license, inactive since 2021. Reference for approach only; don't copy code.
- [Hades Boon Hunting (Coda)](https://coda.io/@sig/hadesmobile) — click a god to narrow boon options, prereq checkmarks. Good UX reference, not open source.
- Hades II mods (BoonBuddy, Boon Advisor) — in-game overlays, Hades II only.
- No Hades MCP server found.

## 4. Steam API (Docker edition)

`ISteamUserStats/GetPlayerAchievements` (key + SteamID64 + appid) and `GetSchemaForGame` (key + appid, names/icons) — [docs](https://partner.steamgames.com/doc/webapi/isteamuserstats). No CORS → server-side only. Behaviour for private profiles is not documented; assume "Game details" must be public and test it. Each self-hoster supplies their own key via env.

## 5. Proposed next steps

1. ~~Copy game files~~ ✓ · ~~importer spike~~ ✓
2. Achievement names + `run`/`meta` overrides; weapons/aspects (needed for "4th aspect" and weapon achievements).
3. ~~Schema + current-run screen~~ ✓ (`web/src/core/`, `web/src/App.tsx`). Keepsakes (Conch Shell, Lambent Plume) and hidden traits (Sunken Treasure) also satisfy prerequisites — imported as `keepsake` / `standard`.
4. ~~Icons~~ ✓ — `tools/icons/extract_icons.py` (deppth, MIT) pulls the 161 boon/keepsake icons from the local `GUI.pkg` (Icon → `GUIAnimations.sjson` FilePath, incl. `InheritFrom`) into `game-files/generated/icons/`; local only, stripped from builds.
5. ~~Weapon/aspect selection~~ ✓ — weapons and aspects from `WeaponUpgradeData.lua` (6 × 4). Aspects are traits in the dataset (`kind: aspect`); the chosen one counts as held. TraitData-level rules are now imported too: `RequiredTrait` / `RequiredOneOfTraits` → extra CNF sets (Beowulf Flare casts require `ShieldLoadAmmoTrait`), `RequiredSlottedTrait = "Shout"` → "any Call" set, `RequiredFalseTrait(s)` → `excludedBy` (23 boons, e.g. normal casts under Beowulf, Hunter Dash under Lucifer, mutually exclusive Ares/Demeter variants), `RequiredMetaUpgradeSelected` → `mirror` (shown, not evaluated).
   - Resolved: Poseidon/Dionysus casts are *not* swapped under Beowulf — the same trait is shown as "Flood Flare"/"Trippy Flare" via `TraitDependencyTextOverrides` (Dionysus also under Hera, `BowLoadAmmoTrait`). Their `ShieldLoadAmmo_*` traits have `Skip = true` (never offered); the importer drops `Skip` traits and exports `textOverrides`. The other five gods use separate Flare traits gated by `RequiredTrait`/`RequiredFalseTrait`. (Fandom wiki returned HTTP 402 to automated fetches, so this comes from the game scripts.)
6. ~~Achievements screen~~ ✓ — tab with manual checklist (localStorage), missing/done/all filter, "earned in a run" filter, and a "this run counts" hint (e.g. 4th aspect). Importer splits `scope` (run 12 / meta 37) from `rule` (data / code); the 7 code-checked ones are in-run events. Names, descriptions and icons are not in game files — `tools/steamschema` fetches them from `GetSchemaForGame` with the user's own `STEAM_API_KEY` into `game-files/generated/` (local only). Until then names are derived from IDs.

7. ~~Server + MCP~~ ✓ — `server/` (Go, official `modelcontextprotocol/go-sdk` v1.8.0, streamable HTTP at `/mcp`). Eligibility logic ported from TS with mirrored tests. State is a JSON file (single user; SQLite only if needed). The frontend detects the server via `/api/capabilities`, pulls state on load/focus and pushes changes (debounced). Next: Docker image.
8. ~~Steam sync~~ ✓ — `server/steam.go`: `STEAM_API_KEY` + `STEAM_ID` (SteamID64, profile URL or vanity name via `ResolveVanityURL`), `GetPlayerAchievements` for app 1145360. `POST /api/steam/sync`, throttled to one Steam call per minute (attempts, not successes). Steam unlocks are kept in `steamAchievements`, separate from manual marks; done = union. The key never appears in errors (`*url.Error` unwrapped; tested). Private game details → 403 → clear message. Tested against a fake Steam API (`-steam-api`), not yet against the real one.

## 6. Open questions

- Exact game build the dataset was generated from (sources are pinned by sha256 in `dataset.json`).
- Descriptions in the public static site: game text (needs permission), own short summaries, or none?
- Project name (working name `hades-companion`).
