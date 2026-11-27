package main

import (
	"math"
	"reflect"
	"testing"
)

// Same cases as web/src/core/eligibility.test.ts, against the real dataset.

func testGame(t *testing.T) *Game {
	t.Helper()
	g, err := loadGame("../data/hades1/dataset.json", "", "")
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func TestMercifulEnd(t *testing.T) {
	g := testGame(t)
	b := g.byID["TriggerCurseTrait"]
	if got := g.evaluate(b, setOf("AresWeaponTrait", "AthenaSecondaryTrait"), nil); got.Kind != "eligible" {
		t.Fatalf("want eligible, got %+v", got)
	}
	got := g.evaluate(b, setOf("AresWeaponTrait", "AthenaRushTrait"), nil)
	want := Status{Kind: "oneAway", Missing: []string{"AthenaWeaponTrait", "AthenaSecondaryTrait"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Divine Dash must not count: got %+v", got)
	}
}

func TestBoonsNeeded(t *testing.T) {
	g := testGame(t)
	if n := g.boonsNeeded("ZeusChargedBoltTrait", set{}, nil, nil); n != 2 {
		t.Fatalf("Splitting Bolt from nothing: want 2, got %v", n)
	}
	if n := g.boonsNeeded("AthenaRangedTrait", setOf("ShieldLoadAmmoTrait"), nil, nil); !math.IsInf(n, 1) {
		t.Fatalf("blocked target must be unreachable, got %v", n)
	}
}

func TestBeowulf(t *testing.T) {
	g := testGame(t)
	owned := setOf("ShieldLoadAmmoTrait")
	if s := g.evaluate(g.byID["AthenaRangedTrait"], owned, nil); s.Kind != "blocked" {
		t.Fatalf("Phalanx Shot under Beowulf: got %+v", s)
	}
	if !g.possible(g.byID["ShieldLoadAmmo_AthenaRangedTrait"], owned, nil) {
		t.Fatal("Phalanx Flare must be possible under Beowulf")
	}
	if g.possible(g.byID["ShieldLoadAmmo_AthenaRangedTrait"], set{}, nil) {
		t.Fatal("Phalanx Flare must be impossible without Beowulf")
	}
}

func TestUnlocks(t *testing.T) {
	g := testGame(t)
	if !contains(g.unlocks["AresWeaponTrait"], "TriggerCurseTrait") {
		t.Fatal("Ares attack must lead to Merciful End")
	}
}

// Same cases as web/src/core/run.test.ts.

func TestKeepsakeCountsAsHeld(t *testing.T) {
	g := testGame(t)
	badNews := g.byID["UnstoredAmmoDamageTrait"]
	st := State{Run: Run{Boons: []string{}}}
	if s := g.evaluate(badNews, st.owned(), nil); s.Kind != "oneAway" {
		t.Fatalf("without Lambent Plume: got %+v", s)
	}
	st.Run.Keepsake = "FastClearDodgeBonusTrait"
	if s := g.evaluate(badNews, st.owned(), nil); s.Kind != "eligible" {
		t.Fatalf("with Lambent Plume: got %+v", s)
	}
}

func TestFourGodLimit(t *testing.T) {
	g := testGame(t)
	st := State{Run: Run{Boons: []string{"ArtemisWeaponTrait", "PoseidonSecondaryTrait", "AthenaRushTrait", "DionysusShoutTrait", "HermesWeaponTrait"}}}
	if godPool([]string{"Artemis", "Hermes"}) != nil {
		t.Fatal("no limit before four gods")
	}
	owned, pool := st.owned(), st.pool(g.Dataset)
	if s := g.evaluate(g.byID["ZeusLightningDebuff"], owned, pool); s.Kind != "blocked" || s.BlockedGod != "Zeus" {
		t.Fatalf("fifth god: got %+v", s)
	}
	if !g.possible(g.byID["HermesSecondaryTrait"], owned, pool) {
		t.Fatal("Hermes doesn't count toward the limit")
	}
	if g.possible(g.byID["TriggerCurseTrait"], owned, pool) {
		t.Fatal("Ares × Athena needs a fifth god")
	}
	if !g.possible(g.byID["ArtemisBonusProjectileTrait"], owned, pool) {
		t.Fatal("Poseidon × Artemis stays possible")
	}
	if n := g.boonsNeeded("TriggerCurseTrait", owned, pool, nil); !math.IsInf(n, 1) {
		t.Fatalf("want unreachable, got %v", n)
	}
	// A replaced boon's god still counts.
	st = State{Run: Run{Boons: []string{"AresWeaponTrait", "AthenaRushTrait", "PoseidonSecondaryTrait"}, Gods: []string{"Zeus"}}}
	if st.pool(g.Dataset) == nil {
		t.Fatal("Zeus from history must count")
	}
}
