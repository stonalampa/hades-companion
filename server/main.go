// Command server is the self-hosted edition: it serves the web app, keeps the
// player's run and achievements, and exposes them to AI assistants over MCP.
//
//	go run ./server -web web/dist
//
// The UI and /api have no authentication: run on localhost or behind your own
// proxy/SSO. /mcp can require a bearer token (MCP_TOKEN) so the proxy can let
// AI clients through without SSO.
package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "listen address")
	dataPath := flag.String("data", "data/hades1/dataset.json", "dataset from tools/importer")
	assets := flag.String("assets", "game-files/generated", "local game/Steam text and icons (optional)")
	web := flag.String("web", "", "built web app dir (web/dist); empty = API only")
	statePath := flag.String("state", "state/state.json", "where the run and achievements are kept")
	steamAPI := flag.String("steam-api", "https://api.steampowered.com", "Steam Web API base URL (override for testing)")
	flag.Parse()

	game, err := loadGame(*dataPath, *assets+"/text.en.json", *assets+"/achievements.en.json")
	if err != nil {
		log.Fatal(err)
	}
	store, err := openStore(*statePath)
	if err != nil {
		log.Fatal(err)
	}
	// Steam sync is on when both are set; secrets come from the environment only.
	steam := newSteam(os.Getenv("STEAM_API_KEY"), os.Getenv("STEAM_ID"))
	if steam != nil {
		steam.baseURL = *steamAPI
		log.Print("Steam sync enabled")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/capabilities", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"edition": "server", "sync": true, "mcp": "/mcp", "steam": steam != nil})
	})
	mux.HandleFunc("GET /api/state", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, store.Get())
	})
	mux.HandleFunc("PUT /api/state", func(w http.ResponseWriter, r *http.Request) {
		var in State
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		// The client owns the run and manual marks; Steam fields are server-owned.
		st, err := store.Update(func(st *State) {
			st.Run, st.Achievements = in.Run, in.Achievements
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, st)
	})
	mux.HandleFunc("PUT /api/save", func(w http.ResponseWriter, r *http.Request) {
		var in Save
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&in); err != nil || in.ImportedAt == "" {
			http.Error(w, "want {importedAt, facts, progress}", http.StatusBadRequest)
			return
		}
		st, err := store.Update(func(st *State) { st.Save = &in })
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, st)
	})
	mux.HandleFunc("POST /api/steam/sync", func(w http.ResponseWriter, r *http.Request) {
		if steam == nil {
			http.Error(w, "Steam sync not configured (STEAM_API_KEY, STEAM_ID)", http.StatusNotFound)
			return
		}
		// Page loads and focus events call this freely; Steam is asked at most once a minute.
		if !steam.allow() {
			writeJSON(w, store.Get())
			return
		}
		// Detached from the browser request: a reload must not cancel the Steam call
		// (the attempt is already counted against the once-a-minute limit).
		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 20*time.Second)
		defer cancel()
		ids, err := steam.Achieved(ctx)
		if err != nil {
			log.Printf("steam sync: %v", err)
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		st, err := store.Update(func(st *State) {
			st.SteamAchievements = ids
			st.SteamSyncedAt = time.Now().UTC().Format(time.RFC3339)
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, st)
	})

	mcpServer := newMCPServer(game, store)
	mcpHandler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return mcpServer }, nil)
	mux.Handle("/mcp", requireToken(os.Getenv("MCP_TOKEN"), mcpHandler))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok\n")) })

	// Local assets are served like Vite serves public/local in dev.
	if _, err := os.Stat(*assets); err == nil {
		mux.Handle("/local/", http.StripPrefix("/local/", http.FileServer(http.Dir(*assets))))
	}
	if *web != "" {
		mux.Handle("/", http.FileServer(http.Dir(*web)))
	}

	log.Printf("hades-companion listening on %s (app at /, MCP at /mcp)", *addr)
	log.Fatal(http.ListenAndServe(*addr, mux))
}

// requireToken checks "Authorization: Bearer <token>" when token is set.
func requireToken(token string, next http.Handler) http.Handler {
	if token == "" {
		return next
	}
	want := []byte("Bearer " + token)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), want) != 1 {
			w.Header().Set("WWW-Authenticate", "Bearer")
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
