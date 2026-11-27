package main

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Run mirrors web/src/core/types.ts Run.
type Run struct {
	Game      string   `json:"game"`
	StartedAt string   `json:"startedAt"`
	Boons     []string `json:"boons"`
	Targets   []string `json:"targets,omitempty"`
	Aspect    string   `json:"aspect,omitempty"`
}

// State is everything the frontend syncs: one player, one file.
// A JSON file is enough for a single-user self-host; swap for SQLite if that changes.
type State struct {
	Run Run `json:"run"`
	// Achievements are marked by hand; SteamAchievements come from Steam sync.
	// Done = both. They're kept apart so a sync never undoes a manual mark.
	Achievements      []string `json:"achievements"`
	SteamAchievements []string `json:"steamAchievements,omitempty"`
	SteamSyncedAt     string   `json:"steamSyncedAt,omitempty"`
	UpdatedAt         string   `json:"updatedAt,omitempty"`
}

type Store struct {
	mu    sync.Mutex
	path  string
	state State
}

func openStore(path string) (*Store, error) {
	s := &Store{path: path, state: State{Run: Run{Game: "hades1", Boons: []string{}}, Achievements: []string{}}}
	err := readJSON(path, &s.state)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}
	return s, nil
}

func (s *Store) Get() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state
}

// Update changes the state under the lock and writes it atomically (temp file + rename).
func (s *Store) Update(change func(*State)) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	st := s.state
	change(&st)
	if st.Run.Boons == nil {
		st.Run.Boons = []string{}
	}
	if st.Achievements == nil {
		st.Achievements = []string{}
	}
	st.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	b, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return s.state, err
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return s.state, err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return s.state, err
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return s.state, err
	}
	s.state = st
	return st, nil
}

// done: achievements earned by either source.
func (st State) done() set {
	return setOf(append(append([]string{}, st.Achievements...), st.SteamAchievements...)...)
}

// owned is the build plus the aspect, which counts as held.
func (st State) owned() set {
	o := setOf(st.Run.Boons...)
	if st.Run.Aspect != "" {
		o[st.Run.Aspect] = true
	}
	return o
}
