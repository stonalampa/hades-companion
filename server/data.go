package main

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"regexp"
	"strings"
)

// Mirrors data/<game>/dataset.json (tools/importer) and web/src/core/types.ts.

type Boon struct {
	ID            string            `json:"id"`
	Gods          []string          `json:"gods"`
	Kind          string            `json:"kind"`
	Slot          string            `json:"slot,omitempty"`
	Requires      [][]string        `json:"requires,omitempty"`
	ExcludedBy    []string          `json:"excludedBy,omitempty"`
	Mirror        string            `json:"mirror,omitempty"`
	Weapon        string            `json:"weapon,omitempty"`
	TextOverrides map[string]string `json:"textOverrides,omitempty"`
}

type Weapon struct {
	ID      string   `json:"id"`
	Aspects []string `json:"aspects"`
}

type Achievement struct {
	ID           string         `json:"id"`
	Scope        string         `json:"scope"`
	Rule         string         `json:"rule"`
	Requirements map[string]any `json:"requirements,omitempty"`
}

type Dataset struct {
	Game         string        `json:"game"`
	Weapons      []Weapon      `json:"weapons"`
	Boons        []Boon        `json:"boons"`
	Keepsakes    []string      `json:"keepsakes"`
	Achievements []Achievement `json:"achievements"`

	byID    map[string]*Boon
	unlocks map[string][]string
}

type Text struct {
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
}

// Game holds the dataset plus optional local text (game and Steam).
type Game struct {
	*Dataset
	text    map[string]Text
	achText map[string]Text
}

func loadGame(dataPath, textPath, achTextPath string) (*Game, error) {
	var ds Dataset
	if err := readJSON(dataPath, &ds); err != nil {
		return nil, err
	}
	ds.byID = make(map[string]*Boon, len(ds.Boons))
	ds.unlocks = map[string][]string{}
	for i := range ds.Boons {
		b := &ds.Boons[i]
		ds.byID[b.ID] = b
		seen := map[string]bool{}
		for _, set := range b.Requires {
			for _, id := range set {
				if !seen[id] {
					seen[id] = true
					ds.unlocks[id] = append(ds.unlocks[id], b.ID)
				}
			}
		}
	}
	g := &Game{Dataset: &ds, text: map[string]Text{}, achText: map[string]Text{}}
	// Text files are local and optional: without them names fall back to IDs.
	if err := readJSON(textPath, &g.text); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	if err := readJSON(achTextPath, &g.achText); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	return g, nil
}

func readJSON(path string, v any) error {
	if path == "" {
		return fs.ErrNotExist
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

var reCamel = regexp.MustCompile(`([a-z])([A-Z0-9])`)

func splitCamel(s string) string { return reCamel.ReplaceAllString(s, "$1 $2") }

// textFor follows aspect renames (Flood Shot is "Flood Flare" under Beowulf).
func (g *Game) textFor(id string, owned set) Text {
	if b := g.byID[id]; b != nil {
		for aspect, alt := range b.TextOverrides {
			if owned[aspect] {
				if t, ok := g.text[alt]; ok {
					return t
				}
			}
		}
	}
	return g.text[id]
}

func (g *Game) name(id string, owned set) string {
	if t := g.textFor(id, owned); t.Name != "" {
		return t.Name
	}
	return splitCamel(strings.ReplaceAll(strings.TrimSuffix(id, "Trait"), "_", " "))
}

func (g *Game) achievementName(id string) string {
	if t := g.achText[id]; t.Name != "" {
		return t.Name
	}
	return splitCamel(strings.TrimPrefix(strings.TrimPrefix(id, "Ach"), "Act"))
}

var (
	reKeyword = regexp.MustCompile(`\{\$Keywords\.(\w+)\}`)
	reTooltip = regexp.MustCompile(`\{\$TooltipData[^}]*\}`)
	reFormat  = regexp.MustCompile(`\{[#$!][^}]*\}`)
	reColumn  = regexp.MustCompile(`\\Column \d+`)
	reSpaces  = regexp.MustCompile(`[ \t]+`)
)

// cleanDescription strips game formatting tokens; numbers become "…".
// Same rules as cleanDescription in web/src/data.ts.
func cleanDescription(s string) string {
	s = reKeyword.ReplaceAllStringFunc(s, func(m string) string {
		k := reKeyword.FindStringSubmatch(m)[1]
		if base, ok := strings.CutSuffix(k, "Plural"); ok {
			return splitCamel(base) + "s"
		}
		return splitCamel(strings.TrimSuffix(k, "Alt"))
	})
	s = strings.ReplaceAll(s, "{!Icons.Bullet}", "•")
	s = reTooltip.ReplaceAllString(s, "…")
	s = reFormat.ReplaceAllString(s, "")
	s = reColumn.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, `\n`, "\n")
	return strings.TrimSpace(reSpaces.ReplaceAllString(s, " "))
}
