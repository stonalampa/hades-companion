// Command importer turns Hades I data scripts from a local install into JSON.
//
// Structural data (IDs, slots, prerequisites) goes to -data and may be committed.
// Game text (names, descriptions) goes to -text and stays local.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"sort"
	"strings"
)

// Gods whose boons we import, keyed by LootData entry.
var gods = []struct{ Loot, Name string }{
	{"ZeusUpgrade", "Zeus"}, {"PoseidonUpgrade", "Poseidon"}, {"AthenaUpgrade", "Athena"},
	{"AresUpgrade", "Ares"}, {"AphroditeUpgrade", "Aphrodite"}, {"ArtemisUpgrade", "Artemis"},
	{"DionysusUpgrade", "Dionysus"}, {"DemeterUpgrade", "Demeter"}, {"HermesUpgrade", "Hermes"},
}

// TraitData's Slot -> our slot. Hermes' WeaponTrait/SecondaryTrait have no Slot:
// they stack with the Attack/Special boon instead of replacing it.
var gameSlots = map[string]string{
	"Melee": "attack", "Secondary": "special", "Ranged": "cast", "Rush": "dash", "Shout": "call",
}

// Load order matters: helper tables first, then the data we read.
var sourceFiles = []string{"WeaponSets.lua", "TraitData.lua", "LootData.lua", "AchievementData.lua", "WeaponUpgradeData.lua"}

type Boon struct {
	ID   string   `json:"id"`
	Gods []string `json:"gods"`
	Kind string   `json:"kind"` // slot | standard | duo | legendary | keepsake | aspect
	Slot string   `json:"slot,omitempty"`
	Icon string   `json:"icon,omitempty"`
	// Weapon is set for aspects.
	Weapon string `json:"weapon,omitempty"`
	// TextID is the HelpText entry when it differs from ID (hidden traits).
	TextID string `json:"-"`
	// Requires is CNF: every set must be satisfied by at least one boon in it.
	Requires [][]string `json:"requires,omitempty"`
	// ExcludedBy: the boon is never offered while any of these is held (often an aspect).
	ExcludedBy []string `json:"excludedBy,omitempty"`
	// Mirror is a Mirror of Night choice the boon needs (e.g. AmmoMetaUpgrade).
	Mirror string `json:"mirror,omitempty"`
	// TextOverrides: while holding the key (an aspect), the game shows this
	// boon under another text entry (Flood Shot -> Flood Flare under Beowulf).
	TextOverrides map[string]string `json:"textOverrides,omitempty"`
}

type Achievement struct {
	ID string `json:"id"`
	// Scope: run = earned during a run (this run can advance it); meta = long-term progress.
	Scope string `json:"scope"`
	// Rule: data = declarative requirements below; code = checked in game code.
	Rule         string         `json:"rule"`
	Requirements map[string]any `json:"requirements,omitempty"`
}

type Dataset struct {
	Game         string            `json:"game"`
	Sources      map[string]string `json:"sources"` // file -> sha256
	Weapons      []Weapon          `json:"weapons"`
	Boons        []Boon            `json:"boons"`
	Achievements []Achievement     `json:"achievements"`
}

func main() {
	gameDir := flag.String("game", "game-files", "dir with Scripts/ and en/ copied from the install")
	dataOut := flag.String("data", "data/hades1/dataset.json", "structural output (committable)")
	textOut := flag.String("text", "game-files/generated/text.en.json", "game text output (local only)")
	flag.Parse()

	scripts := filepath.Join(*gameDir, "Scripts")
	g, err := loadGlobals(scripts, sourceFiles, []string{"TraitData", "LootData", "GameData", "WeaponUpgradeData"})
	if err != nil {
		log.Fatal(err)
	}
	traits, loot := g["TraitData"], g["LootData"]
	achData, _ := g["GameData"]["AchievementData"].(map[string]any)

	weapons, warnings := buildWeapons(g["WeaponUpgradeData"])
	boons, w := buildBoons(traits, loot, weapons)
	warnings = append(warnings, w...)
	ds := Dataset{
		Game:         "hades1",
		Sources:      hashes(scripts),
		Weapons:      weapons,
		Boons:        boons,
		Achievements: buildAchievements(achData),
	}

	text, err := loadHelpText(filepath.Join(*gameDir, "en", "HelpText.en.sjson"))
	if err != nil {
		log.Fatal(err)
	}
	boonText := map[string]Text{}
	for _, b := range boons {
		textID := b.ID
		if b.TextID != "" {
			textID = b.TextID
		}
		if t, ok := text[textID]; ok {
			boonText[b.ID] = t
		} else {
			warnings = append(warnings, "no text for "+b.ID)
		}
		if b.Mirror != "" {
			boonText[b.Mirror] = text[b.Mirror]
		}
		for _, alt := range b.TextOverrides {
			boonText[alt] = text[alt]
		}
	}
	for _, w := range weapons {
		boonText[w.ID] = text[w.ID]
	}
	// Some names are keyword references, e.g. "{$Keywords.AmmoSupply}" -> "Infernal Soul".
	for id, t := range boonText {
		if k, ok := strings.CutPrefix(t.Name, "{$Keywords."); ok {
			t.Name = text[strings.TrimSuffix(k, "}")].Name
			boonText[id] = t
		}
	}

	// Icon texture paths feed tools/icons, which extracts the images locally.
	anims, err := loadAnimationPaths(filepath.Join(*gameDir, "Animations", "GUIAnimations.sjson"))
	if err != nil {
		log.Fatal(err)
	}
	icons, noIcon := iconPaths(boons, anims)
	for _, id := range noIcon {
		warnings = append(warnings, "no icon for "+id)
	}

	must(writeJSON(*dataOut, ds))
	must(writeJSON(*textOut, boonText))
	must(writeJSON(filepath.Join(filepath.Dir(*textOut), "icon-paths.json"), icons))
	report(ds, boonText, warnings)
}

func buildBoons(traits, loot map[string]any, weapons []Weapon) ([]Boon, []string) {
	var warnings []string
	byID := map[string]*Boon{}

	// Skip = true marks leftover traits the game never offers.
	skipped := func(id string) bool {
		t, _ := traits[id].(map[string]any)
		return t["Skip"] == true
	}
	dropSkipped := func(req [][]string) [][]string {
		for i, set := range req {
			req[i] = slices.DeleteFunc(set, skipped)
		}
		return req
	}

	add := func(id, god string) *Boon {
		b, ok := byID[id]
		if !ok {
			t, _ := traits[id].(map[string]any)
			if t == nil {
				warnings = append(warnings, "boon not in TraitData: "+id)
			}
			icon, _ := t["Icon"].(string)
			if base, ok := strings.CutPrefix(id, "ShieldLoadAmmo_"); ok && icon == "" {
				// Beowulf variants without their own icon use the base cast's.
				bt, _ := traits[base].(map[string]any)
				icon, _ = bt["Icon"].(string)
			}
			slot, _ := t["Slot"].(string)
			b = &Boon{ID: id, Kind: kindOf(t), Slot: gameSlots[slot], Icon: icon}
			if ov, ok := t["TraitDependencyTextOverrides"].(map[string]any); ok {
				b.TextOverrides = map[string]string{}
				for aspect, v := range ov {
					m, _ := v.(map[string]any)
					if name, ok := m["Name"].(string); ok {
						b.TextOverrides[aspect] = name
					}
				}
			}
			byID[id] = b
		}
		if !slices.Contains(b.Gods, god) {
			b.Gods = append(b.Gods, god)
		}
		return b
	}

	for _, gd := range gods {
		l, _ := loot[gd.Loot].(map[string]any)
		if l == nil {
			warnings = append(warnings, "missing LootData."+gd.Loot)
			continue
		}
		for _, id := range slices.DeleteFunc(strings_(l["WeaponUpgrades"]), skipped) {
			b := add(id, gd.Name)
			if b.Kind == "standard" && b.Slot != "" {
				b.Kind = "slot"
			}
		}
		for _, id := range strings_(l["Traits"]) {
			add(id, gd.Name)
		}
		linked, _ := l["LinkedUpgrades"].(map[string]any)
		for _, id := range sortedKeys(linked) {
			rule, _ := linked[id].(map[string]any)
			req, unknown := parseRule(rule)
			req = dropSkipped(req)
			for _, k := range unknown {
				warnings = append(warnings, fmt.Sprintf("%s.%s: unknown rule key %s", gd.Name, id, k))
			}
			b := add(id, gd.Name)
			if b.Requires != nil && !reflect.DeepEqual(normalize(b.Requires), normalize(req)) {
				warnings = append(warnings, fmt.Sprintf("%s: rules differ between gods %v", id, b.Gods))
			}
			b.Requires = req
		}
	}

	// Aspects are traits too: they satisfy RequiredTrait (Beowulf casts) and
	// exclude boons, so they live alongside boons.
	for _, w := range weapons {
		for _, id := range w.Aspects {
			t, _ := traits[id].(map[string]any)
			icon, _ := t["Icon"].(string)
			byID[id] = &Boon{ID: id, Kind: "aspect", Gods: []string{}, Weapon: w.ID, Icon: icon}
		}
	}

	var calls []string
	for _, id := range sortedKeys(byID) {
		if byID[id].Slot == "call" {
			calls = append(calls, id)
		}
	}
	for _, id := range sortedKeys(byID) {
		if t, ok := traits[id].(map[string]any); ok && byID[id].Kind != "aspect" {
			applyTraitRules(byID[id], t, calls)
			byID[id].Requires = dropSkipped(byID[id].Requires)
		}
	}

	// Prerequisites can also be keepsakes (Conch Shell, Lambent Plume) or hidden
	// traits left by one-off boons (Sunken Treasure). Add them so a build can hold them.
	for _, id := range sortedKeys(byID) {
		for _, set := range byID[id].Requires {
			for _, r := range set {
				if _, ok := byID[r]; ok {
					continue
				}
				t, _ := traits[r].(map[string]any)
				if t == nil {
					warnings = append(warnings, fmt.Sprintf("%s requires unknown trait %s", id, r))
					continue
				}
				b := &Boon{ID: r, Kind: "keepsake", Gods: []string{}}
				if !slices.Contains(strings_(t["InheritFrom"]), "GiftTrait") {
					b.Kind = "standard"
					src, _ := t["LootSource"].(string)
					for _, gd := range gods {
						if gd.Loot == src {
							b.Gods = []string{gd.Name}
						}
					}
					b.TextID, _ = t["BoonInfoRequirementText"].(string)
				}
				b.Icon, _ = t["Icon"].(string)
				byID[r] = b
			}
		}
	}

	out := make([]Boon, 0, len(byID))
	for _, id := range sortedKeys(byID) {
		out = append(out, *byID[id])
	}
	return out, warnings
}

// parseRule maps LinkedUpgrades rules to CNF and returns keys it did not understand.
func parseRule(rule map[string]any) ([][]string, []string) {
	var req [][]string
	var unknown []string
	for _, k := range sortedKeys(rule) {
		switch k {
		case "OneOf":
			req = append(req, strings_(rule[k]))
		case "OneFromEachSet":
			sets, _ := rule[k].([]any)
			for _, s := range sets {
				req = append(req, strings_(s))
			}
		case "PriorityChance": // offer weighting, not eligibility
		default:
			unknown = append(unknown, k)
		}
	}
	return req, unknown
}

func kindOf(t map[string]any) string {
	inh := strings_(t["InheritFrom"])
	switch {
	case slices.Contains(inh, "SynergyTrait"):
		return "duo"
	case slices.Contains(inh, "ShopTier3Trait"):
		return "legendary"
	}
	return "standard"
}

// Achievements with any of these requirements are earned during a run.
var runKeys = []string{"RequiresInRun", "RequiresRunCleared", "RequiredOneOfTraits", "RequiredTrait",
	"RequireEncounterCompleted", "RequiredRunMinValues"}

func buildAchievements(data map[string]any) []Achievement {
	var out []Achievement
	for _, id := range sortedKeys(data) {
		a, _ := data[id].(map[string]any)
		if id == "DefaultAchievement" {
			continue
		}
		req, _ := a["CompleteGameStateRequirements"].(map[string]any)
		// Code-checked achievements all fire on in-run events (Greater Call,
		// Thanatos, keepsake buffs, purging a Legendary, Heat gate).
		ach := Achievement{ID: id, Scope: "run", Rule: "code", Requirements: req}
		if req != nil {
			ach.Rule, ach.Scope = "data", "meta"
			for _, k := range runKeys {
				if _, ok := req[k]; ok {
					ach.Scope = "run"
				}
			}
		}
		out = append(out, ach)
	}
	return out
}

func normalize(cnf [][]string) [][]string {
	out := make([][]string, len(cnf))
	for i, s := range cnf {
		out[i] = slices.Sorted(slices.Values(s))
	}
	sort.Slice(out, func(i, j int) bool { return strings.Join(out[i], ",") < strings.Join(out[j], ",") })
	return out
}

func hashes(dir string) map[string]string {
	out := map[string]string{}
	for _, f := range sourceFiles {
		b, err := os.ReadFile(filepath.Join(dir, f))
		must(err)
		sum := sha256.Sum256(b)
		out[f] = hex.EncodeToString(sum[:])
	}
	return out
}

func writeJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

func report(ds Dataset, text map[string]Text, warnings []string) {
	kinds := map[string]int{}
	for _, b := range ds.Boons {
		kinds[b.Kind]++
	}
	ak := map[string]int{}
	for _, a := range ds.Achievements {
		ak[a.Scope+"/"+a.Rule]++
	}
	fmt.Printf("boons: %d %v\nachievements: %d %v\n", len(ds.Boons), kinds, len(ds.Achievements), ak)
	for _, b := range ds.Boons {
		if b.ID == "TriggerCurseTrait" {
			fmt.Printf("check %s (%s) gods=%v requires=%v\n", b.ID, text[b.ID].Name, b.Gods, b.Requires)
		}
	}
	fmt.Printf("warnings: %d\n", len(warnings))
	for _, w := range warnings {
		fmt.Println("  -", w)
	}
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
