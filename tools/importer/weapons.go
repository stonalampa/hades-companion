package main

import "slices"

// Weapons in the order the game shows them.
var weaponOrder = []string{"SwordWeapon", "SpearWeapon", "ShieldWeapon", "BowWeapon", "FistWeapon", "GunWeapon"}

type Weapon struct {
	ID      string   `json:"id"`
	Aspects []string `json:"aspects"` // aspect trait IDs, game order
}

// buildWeapons reads WeaponUpgradeData: each weapon lists its aspects; the
// first (Zagreus) aspect names its trait via RequiredInvestmentTraitName.
func buildWeapons(wud map[string]any) ([]Weapon, []string) {
	var out []Weapon
	var warnings []string
	for _, id := range weaponOrder {
		entries, _ := wud[id].([]any)
		if len(entries) == 0 {
			warnings = append(warnings, "missing WeaponUpgradeData."+id)
			continue
		}
		w := Weapon{ID: id}
		for _, e := range entries {
			m, _ := e.(map[string]any)
			trait, _ := m["TraitName"].(string)
			if trait == "" {
				trait, _ = m["RequiredInvestmentTraitName"].(string)
			}
			if trait != "" {
				w.Aspects = append(w.Aspects, trait)
			}
		}
		out = append(out, w)
	}
	return out, warnings
}

// applyTraitRules adds TraitData-level eligibility rules to a boon:
// required traits become extra CNF sets, forbidden traits go to ExcludedBy.
// callBoons is the set used for "needs any Call" (RequiredSlottedTrait = "Shout").
func applyTraitRules(b *Boon, t map[string]any, callBoons []string) {
	if r, ok := t["RequiredTrait"].(string); ok {
		b.Requires = append(b.Requires, []string{r})
	}
	if rs := strings_(t["RequiredOneOfTraits"]); len(rs) > 0 {
		b.Requires = append(b.Requires, rs)
	}
	if t["RequiredSlottedTrait"] == "Shout" {
		b.Requires = append(b.Requires, callBoons)
	}
	// A boon excluding itself just means "offered once"; skip that.
	excl := strings_(t["RequiredFalseTraits"])
	if r, ok := t["RequiredFalseTrait"].(string); ok {
		excl = append(excl, r)
	}
	for _, r := range excl {
		if r != b.ID && !slices.Contains(b.ExcludedBy, r) {
			b.ExcludedBy = append(b.ExcludedBy, r)
		}
	}
	b.Mirror, _ = t["RequiredMetaUpgradeSelected"].(string)
}
