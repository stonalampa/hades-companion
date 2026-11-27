package main

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const instructions = `Hades (2020) companion data for the player's current run.
Ground every build suggestion in these tools: boon names, prerequisites, exclusions and the
player's build come from the game's own data files and the player's tracked run.
"Eligible" means the game CAN offer a boon, never that it will. Prerequisite sets are ANDed;
boons inside a set are ORed. Taking a slot boon (attack/special/cast/dash/call) replaces the
one already in that slot. A run offers boons from at most four Olympians (Hermes doesn't
count); once four are taken, boons of other gods show as blocked. The equipped keepsake
counts as held. Numeric values (damage, chances) are not available.
Use get_current_run first, then get_boon for details.`

// BoonRef is a boon as the model sees it: always with name and status for the current run.
type BoonRef struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Gods     []string `json:"gods,omitempty"`
	Kind     string   `json:"kind"`
	Slot     string   `json:"slot,omitempty"`
	Status   string   `json:"status"`
	Replaces string   `json:"replaces,omitempty" jsonschema:"slot boon in the build that taking this would remove"`
}

func (g *Game) ref(id string, st State) BoonRef {
	b := g.byID[id]
	if b == nil {
		return BoonRef{ID: id, Name: g.name(id, nil), Status: "unknown"}
	}
	owned := st.owned()
	r := BoonRef{ID: id, Name: g.name(id, owned), Gods: b.Gods, Kind: b.Kind, Slot: b.Slot, Status: g.evaluate(b, owned, st.pool(g.Dataset)).Kind}
	if rep := g.replaces(b, st.Run.Boons); rep != "" && r.Status != "owned" {
		r.Replaces = g.name(rep, owned)
	}
	return r
}

func (g *Game) refs(ids []string, st State) []BoonRef {
	out := make([]BoonRef, 0, len(ids))
	for _, id := range ids {
		out = append(out, g.ref(id, st))
	}
	return out
}

// options lists the boons of a requirement set that are still possible this run.
func (g *Game) options(ids []string, st State) []BoonRef {
	owned, pool := st.owned(), st.pool(g.Dataset)
	var out []BoonRef
	for _, id := range ids {
		if b := g.byID[id]; b != nil && g.possible(b, owned, pool) {
			out = append(out, g.ref(id, st))
		}
	}
	return out
}

func needed(n float64) *int {
	if math.IsInf(n, 1) {
		return nil
	}
	i := int(n)
	return &i
}

// ---- get_current_run

type RunIn struct{}

type Progress struct {
	Target      BoonRef   `json:"target"`
	BoonsNeeded *int      `json:"boonsNeeded,omitempty" jsonschema:"fewest boons still to pick up; absent if unreachable"`
	TakeOneOf   []BoonRef `json:"takeOneOf,omitempty" jsonschema:"when exactly one requirement is missing: any of these completes it"`
}

type RunOut struct {
	Weapon       string     `json:"weapon,omitempty"`
	Aspect       string     `json:"aspect,omitempty"`
	Keepsake     string     `json:"keepsake,omitempty" jsonschema:"equipped keepsake; counts as held (Lambent Plume satisfies Hermes boons)"`
	Build        []BoonRef  `json:"build"`
	EligibleNow  []BoonRef  `json:"eligibleNow" jsonschema:"boons with prerequisites that are all met"`
	OneBoonAway  []Progress `json:"oneBoonAway" jsonschema:"duo/legendary boons missing exactly one requirement, for gods already in the build"`
	Targets      []Progress `json:"targets" jsonschema:"boons the player pinned as goals"`
	Achievements []string   `json:"achievementsThisRunCountsFor,omitempty"`
}

func (g *Game) currentRun(st State) RunOut {
	owned, pool := st.owned(), st.pool(g.Dataset)
	out := RunOut{Build: g.refs(st.Run.Boons, st), EligibleNow: []BoonRef{}, OneBoonAway: []Progress{}, Targets: []Progress{}}
	if a := g.byID[st.Run.Aspect]; a != nil {
		out.Aspect = g.name(a.ID, owned)
		out.Weapon = g.name(a.Weapon, owned)
	}
	if st.Run.Keepsake != "" {
		out.Keepsake = g.name(st.Run.Keepsake, owned)
	}
	ownedGods := set{}
	for _, id := range st.Run.Boons {
		if b := g.byID[id]; b != nil {
			for _, god := range b.Gods {
				ownedGods[god] = true
			}
		}
	}
	for i := range g.Boons {
		b := &g.Boons[i]
		if !hasBoonPrereqs(g.Dataset, b) || !g.possible(b, owned, pool) {
			continue
		}
		s := g.evaluate(b, owned, pool)
		switch {
		case s.Kind == "eligible":
			out.EligibleNow = append(out.EligibleNow, g.ref(b.ID, st))
		case s.Kind == "oneAway" && (b.Kind == "duo" || b.Kind == "legendary") && anyGod(b.Gods, ownedGods):
			if opts := g.options(s.Missing, st); len(opts) > 0 {
				out.OneBoonAway = append(out.OneBoonAway, Progress{Target: g.ref(b.ID, st), TakeOneOf: opts})
			}
		}
	}
	for _, id := range st.Run.Targets {
		p := Progress{Target: g.ref(id, st), BoonsNeeded: needed(g.boonsNeeded(id, owned, pool, nil))}
		if b := g.byID[id]; b != nil {
			if s := g.evaluate(b, owned, pool); s.Kind == "oneAway" {
				p.TakeOneOf = g.options(s.Missing, st)
			}
		}
		out.Targets = append(out.Targets, p)
	}
	done := st.done()
	for _, a := range g.Achievements {
		if a.Scope == "run" && !done[a.ID] {
			if c := countingTraits(a, owned); len(c) > 0 {
				out.Achievements = append(out.Achievements, fmt.Sprintf("%s (via %s)", g.achievementName(a.ID), g.name(c[0], owned)))
			}
		}
	}
	return out
}

// hasBoonPrereqs: some requirement is a real boon, not just an aspect (Beowulf casts).
func hasBoonPrereqs(d *Dataset, b *Boon) bool {
	for _, s := range b.Requires {
		for _, id := range s {
			if x := d.byID[id]; x != nil && x.Kind != "aspect" {
				return true
			}
		}
	}
	return false
}

func anyGod(gods []string, owned set) bool {
	for _, g := range gods {
		if owned[g] {
			return true
		}
	}
	return false
}

func countingTraits(a Achievement, owned set) []string {
	var out []string
	if ids, ok := a.Requirements["RequiredOneOfTraits"].([]any); ok {
		for _, x := range ids {
			if s, _ := x.(string); owned[s] {
				out = append(out, s)
			}
		}
	}
	if s, ok := a.Requirements["RequiredTrait"].(string); ok && owned[s] {
		out = append(out, s)
	}
	return out
}

// ---- get_boon

type BoonIn struct {
	Boon string `json:"boon" jsonschema:"boon id or name, e.g. TriggerCurseTrait or Merciful End"`
}

type BoonOut struct {
	BoonRef
	Description       string      `json:"description,omitempty"`
	BoonsNeeded       *int        `json:"boonsNeeded,omitempty"`
	BlockedBy         string      `json:"blockedBy,omitempty" jsonschema:"held boon/aspect that stops the game offering it"`
	RequiresAllOf     [][]BoonRef `json:"requiresAllOf,omitempty" jsonschema:"each inner list: need at least one of these"`
	NeverOfferedWith  []string    `json:"neverOfferedWith,omitempty"`
	MirrorRequirement string      `json:"mirrorRequirement,omitempty" jsonschema:"Mirror of Night choice it needs (not tracked)"`
	LeadsTo           []BoonRef   `json:"leadsTo,omitempty" jsonschema:"boons this one is a prerequisite for"`
}

func (g *Game) findBoon(q string) *Boon {
	if b := g.byID[q]; b != nil {
		return b
	}
	q = strings.ToLower(strings.TrimSpace(q))
	for i := range g.Boons {
		b := &g.Boons[i]
		if strings.ToLower(g.name(b.ID, nil)) == q || strings.ToLower(g.text[b.ID].Name) == q {
			return b
		}
		for _, alt := range b.TextOverrides {
			if strings.ToLower(g.text[alt].Name) == q {
				return b
			}
		}
	}
	return nil
}

func (g *Game) boonDetail(b *Boon, st State) BoonOut {
	owned, pool := st.owned(), st.pool(g.Dataset)
	s := g.evaluate(b, owned, pool)
	out := BoonOut{
		BoonRef:     g.ref(b.ID, st),
		Description: cleanDescription(g.textFor(b.ID, owned).Description),
		BoonsNeeded: needed(g.boonsNeeded(b.ID, owned, pool, nil)),
	}
	if s.BlockedBy != "" {
		out.BlockedBy = g.name(s.BlockedBy, owned)
	}
	if s.BlockedGod != "" {
		out.BlockedBy = s.BlockedGod + " (the run already has four gods)"
	}
	for _, req := range b.Requires {
		out.RequiresAllOf = append(out.RequiresAllOf, g.refs(req, st))
	}
	for _, x := range b.ExcludedBy {
		out.NeverOfferedWith = append(out.NeverOfferedWith, g.name(x, owned))
	}
	if b.Mirror != "" {
		out.MirrorRequirement = g.name(b.Mirror, owned)
	}
	out.LeadsTo = g.refs(g.unlocks[b.ID], st)
	return out
}

// ---- search_boons

type SearchIn struct {
	Query string `json:"query" jsonschema:"words matched against name, god, slot and kind, e.g. 'athena special' or 'duo zeus'"`
	Limit int    `json:"limit,omitempty" jsonschema:"max results, default 15"`
}

type SearchOut struct {
	Results []BoonRef `json:"results"`
}

func (g *Game) search(in SearchIn, st State) SearchOut {
	owned := st.owned()
	limit := in.Limit
	if limit <= 0 || limit > 50 {
		limit = 15
	}
	tokens := strings.Fields(strings.ToLower(in.Query))
	var hits []string
	for i := range g.Boons {
		b := &g.Boons[i]
		if b.Kind == "aspect" || g.needsOtherAspect(b, owned) {
			continue
		}
		hay := strings.ToLower(strings.Join(append([]string{g.name(b.ID, owned), b.Slot, b.Kind}, b.Gods...), " "))
		ok := true
		for _, t := range tokens {
			if !strings.Contains(hay, t) {
				ok = false
			}
		}
		if ok {
			hits = append(hits, b.ID)
		}
	}
	sort.Slice(hits, func(i, j int) bool { return g.name(hits[i], owned) < g.name(hits[j], owned) })
	if len(hits) > limit {
		hits = hits[:limit]
	}
	return SearchOut{Results: g.refs(hits, st)}
}

// ---- list_achievements

type AchIn struct {
	Filter string `json:"filter,omitempty" jsonschema:"missing (default), done or all"`
	Scope  string `json:"scope,omitempty" jsonschema:"run (earned during a run), meta, or empty for both"`
}

type AchRef struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Scope       string `json:"scope"`
	Done        bool   `json:"done"`
	FromSteam   bool   `json:"fromSteam,omitempty"`
	CountsVia   string `json:"thisRunCountsVia,omitempty"`
}

type AchOut struct {
	Done         int      `json:"done"`
	Total        int      `json:"total"`
	Achievements []AchRef `json:"achievements"`
}

func (g *Game) achievements(in AchIn, st State) AchOut {
	owned, done := st.owned(), st.done()
	out := AchOut{Total: len(g.Achievements), Achievements: []AchRef{}}
	for _, a := range g.Achievements {
		if done[a.ID] {
			out.Done++
		}
		switch {
		case in.Scope != "" && a.Scope != in.Scope,
			in.Filter == "done" && !done[a.ID],
			(in.Filter == "" || in.Filter == "missing") && done[a.ID]:
			continue
		}
		r := AchRef{ID: a.ID, Name: g.achievementName(a.ID), Description: g.achText[a.ID].Description, Scope: a.Scope,
			Done: done[a.ID], FromSteam: contains(st.SteamAchievements, a.ID)}
		if c := countingTraits(a, owned); len(c) > 0 {
			r.CountsVia = g.name(c[0], owned)
		}
		out.Achievements = append(out.Achievements, r)
	}
	return out
}

// ---- server

func newMCPServer(g *Game, store *Store) *mcp.Server {
	s := mcp.NewServer(&mcp.Implementation{Name: "hades-companion", Version: "0.1.0"}, &mcp.ServerOptions{Instructions: instructions})
	ro := &mcp.ToolAnnotations{ReadOnlyHint: true}

	mcp.AddTool(s, &mcp.Tool{Name: "get_current_run", Annotations: ro,
		Description: "The player's current Hades run: weapon/aspect, equipped keepsake, build, boons eligible now, duo/legendary boons one boon away (with which boons complete them), pinned targets, and achievements this run counts for."},
		func(_ context.Context, _ *mcp.CallToolRequest, _ RunIn) (*mcp.CallToolResult, RunOut, error) {
			return nil, g.currentRun(store.Get()), nil
		})

	mcp.AddTool(s, &mcp.Tool{Name: "get_boon", Annotations: ro,
		Description: "Everything about one boon relative to the current run: description, status, full prerequisite sets, exclusions, Mirror requirement and what it leads to."},
		func(_ context.Context, _ *mcp.CallToolRequest, in BoonIn) (*mcp.CallToolResult, BoonOut, error) {
			b := g.findBoon(in.Boon)
			if b == nil {
				return nil, BoonOut{}, fmt.Errorf("no boon %q; use search_boons", in.Boon)
			}
			return nil, g.boonDetail(b, store.Get()), nil
		})

	mcp.AddTool(s, &mcp.Tool{Name: "search_boons", Annotations: ro,
		Description: "Find boons by words in name, god, slot or kind (slot, standard, duo, legendary, keepsake). Results include status for the current run."},
		func(_ context.Context, _ *mcp.CallToolRequest, in SearchIn) (*mcp.CallToolResult, SearchOut, error) {
			return nil, g.search(in, store.Get()), nil
		})

	mcp.AddTool(s, &mcp.Tool{Name: "list_achievements", Annotations: ro,
		Description: "The player's Hades achievements with done/missing status (tracked manually or from Steam), filterable to ones earned during a run."},
		func(_ context.Context, _ *mcp.CallToolRequest, in AchIn) (*mcp.CallToolResult, AchOut, error) {
			return nil, g.achievements(in, store.Get()), nil
		})
	return s
}
