package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

// fakeSteam answers like the Steam Web API for one player.
func fakeSteam(t *testing.T, private bool) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("key") != "k" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		switch {
		case strings.Contains(r.URL.Path, "ResolveVanityURL"):
			if r.URL.Query().Get("vanityurl") == "zag" {
				w.Write([]byte(`{"response":{"success":1,"steamid":"76561190000000001"}}`))
			} else {
				w.Write([]byte(`{"response":{"success":42}}`))
			}
		case strings.Contains(r.URL.Path, "GetPlayerAchievements"):
			if private {
				w.WriteHeader(http.StatusForbidden)
				w.Write([]byte(`{"playerstats":{"error":"Profile is not public","success":false}}`))
				return
			}
			w.Write([]byte(`{"playerstats":{"success":true,"achievements":[
				{"apiname":"AchClearTartarus","achieved":1},{"apiname":"AchClearAnyRun","achieved":0}]}}`))
		}
	}))
}

func testSteam(srv *httptest.Server, player string) *Steam {
	s := newSteam("k", player)
	s.baseURL = srv.URL
	return s
}

func TestSteamAchievedViaVanityAndProfileURL(t *testing.T) {
	srv := fakeSteam(t, false)
	defer srv.Close()
	for _, player := range []string{"zag", "https://steamcommunity.com/id/zag/", "https://steamcommunity.com/profiles/76561190000000001"} {
		got, err := testSteam(srv, player).Achieved(context.Background())
		if err != nil {
			t.Fatalf("%s: %v", player, err)
		}
		if !reflect.DeepEqual(got, []string{"AchClearTartarus"}) {
			t.Fatalf("%s: got %v", player, got)
		}
	}
}

func TestSteamErrors(t *testing.T) {
	srv := fakeSteam(t, true)
	defer srv.Close()
	_, err := testSteam(srv, "76561190000000001").Achieved(context.Background())
	if err == nil || !strings.Contains(err.Error(), "Profile is not public") || !strings.Contains(err.Error(), "profiles/76561190000000001") {
		t.Fatalf("private profile: want Steam's message and the account, got %v", err)
	}
	if _, err := testSteam(srv, "nobody").Achieved(context.Background()); err != errBadSteamID {
		t.Fatalf("unknown vanity: got %v", err)
	}
	// The key must never leak into errors.
	s := testSteam(srv, "zag")
	s.baseURL = "http://127.0.0.1:1"
	_, err = s.Achieved(context.Background())
	if err == nil || strings.Contains(err.Error(), "key=") {
		t.Fatalf("want error without key, got %v", err)
	}
}
