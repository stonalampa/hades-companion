package main

import "math"

// Port of web/src/core/eligibility.ts and graph.ts; keep the two in step.
// Eligibility only: the game may still never offer an eligible boon.

type set map[string]bool

func setOf(ids ...string) set {
	s := set{}
	for _, id := range ids {
		s[id] = true
	}
	return s
}

// Status kinds: owned, blocked, free, eligible, oneAway, far.
type Status struct {
	Kind        string   `json:"kind"`
	BlockedBy   string   `json:"blockedBy,omitempty"`
	Missing     []string `json:"missing,omitempty"`     // oneAway: any one of these completes it
	Unsatisfied int      `json:"unsatisfied,omitempty"` // far: open requirement sets
}

func unsatisfiedSets(req [][]string, owned set) [][]string {
	var out [][]string
	for _, s := range req {
		if !anyOwned(s, owned) {
			out = append(out, s)
		}
	}
	return out
}

func anyOwned(ids []string, owned set) bool {
	for _, id := range ids {
		if owned[id] {
			return true
		}
	}
	return false
}

func (d *Dataset) evaluate(b *Boon, owned set) Status {
	if owned[b.ID] {
		return Status{Kind: "owned"}
	}
	for _, x := range b.ExcludedBy {
		if owned[x] {
			return Status{Kind: "blocked", BlockedBy: x}
		}
	}
	if len(b.Requires) == 0 {
		return Status{Kind: "free"}
	}
	open := unsatisfiedSets(b.Requires, owned)
	switch len(open) {
	case 0:
		return Status{Kind: "eligible"}
	case 1:
		return Status{Kind: "oneAway", Missing: open[0]}
	}
	return Status{Kind: "far", Unsatisfied: len(open)}
}

// needsOtherAspect: a requirement set made only of aspects, none held (Beowulf-only casts).
func (d *Dataset) needsOtherAspect(b *Boon, owned set) bool {
	for _, s := range b.Requires {
		allAspects := true
		for _, id := range s {
			if a := d.byID[id]; a == nil || a.Kind != "aspect" {
				allAspects = false
			}
		}
		if allAspects && !anyOwned(s, owned) {
			return true
		}
	}
	return false
}

func (d *Dataset) possible(b *Boon, owned set) bool {
	return d.evaluate(b, owned).Kind != "blocked" && !d.needsOtherAspect(b, owned)
}

// boonsNeeded: fewest boons still to pick up before id is eligible, following
// prerequisites of prerequisites. Infinity when blocked or unreachable.
func (d *Dataset) boonsNeeded(id string, owned set, trail []string) float64 {
	b := d.byID[id]
	if b == nil {
		return math.Inf(1)
	}
	for _, x := range b.ExcludedBy {
		if owned[x] {
			return math.Inf(1)
		}
	}
	total := 0.0
	for _, s := range b.Requires {
		if anyOwned(s, owned) {
			continue
		}
		best := math.Inf(1)
		for _, opt := range s {
			if opt == id || contains(trail, opt) || (d.byID[opt] != nil && d.byID[opt].Kind == "aspect") {
				continue
			}
			best = math.Min(best, 1+d.boonsNeeded(opt, owned, append(append([]string{}, trail...), id)))
		}
		total += best
	}
	return total
}

// replaces: the boon in the same slot that taking b would remove.
func (d *Dataset) replaces(b *Boon, build []string) string {
	if b.Slot == "" {
		return ""
	}
	for _, id := range build {
		if o := d.byID[id]; o != nil && o.Slot == b.Slot && id != b.ID {
			return id
		}
	}
	return ""
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
