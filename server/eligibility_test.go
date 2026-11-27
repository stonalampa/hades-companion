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
	if got := g.evaluate(b, setOf("AresWeaponTrait", "AthenaSecondaryTrait")); got.Kind != "eligible" {
		t.Fatalf("want eligible, got %+v", got)
	}
	got := g.evaluate(b, setOf("AresWeaponTrait", "AthenaRushTrait"))
	want := Status{Kind: "oneAway", Missing: []string{"AthenaWeaponTrait", "AthenaSecondaryTrait"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Divine Dash must not count: got %+v", got)
	}
}

func TestBoonsNeeded(t *testing.T) {
	g := testGame(t)
	if n := g.boonsNeeded("ZeusChargedBoltTrait", set{}, nil); n != 2 {
		t.Fatalf("Splitting Bolt from nothing: want 2, got %v", n)
	}
	if n := g.boonsNeeded("AthenaRangedTrait", setOf("ShieldLoadAmmoTrait"), nil); !math.IsInf(n, 1) {
		t.Fatalf("blocked target must be unreachable, got %v", n)
	}
}

func TestBeowulf(t *testing.T) {
	g := testGame(t)
	owned := setOf("ShieldLoadAmmoTrait")
	if s := g.evaluate(g.byID["AthenaRangedTrait"], owned); s.Kind != "blocked" {
		t.Fatalf("Phalanx Shot under Beowulf: got %+v", s)
	}
	if !g.possible(g.byID["ShieldLoadAmmo_AthenaRangedTrait"], owned) {
		t.Fatal("Phalanx Flare must be possible under Beowulf")
	}
	if g.possible(g.byID["ShieldLoadAmmo_AthenaRangedTrait"], set{}) {
		t.Fatal("Phalanx Flare must be impossible without Beowulf")
	}
}

func TestUnlocks(t *testing.T) {
	g := testGame(t)
	if !contains(g.unlocks["AresWeaponTrait"], "TriggerCurseTrait") {
		t.Fatal("Ares attack must lead to Merciful End")
	}
}
