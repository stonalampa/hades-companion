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
	Keepsake  string   `json:"keepsake,omitempty"`
	// Gods a boon was taken from this run (Hermes excluded), kept after the
	// boon is replaced: the game counts them toward the four-god limit.
	Gods []string `json:"gods,omitempty"`
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
	// Save: facts from an imported save file, extracted in the browser.
	Save      *Save  `json:"save,omitempty"`
	UpdatedAt string `json:"updatedAt,omitempty"`
}

// Save mirrors SaveSnapshot in web/src/save/useSave.ts. Facts are opaque here
// except the quest status; Progress is the frontend's evaluation as text, so
// the progress rules live in one place (web/src/core/progress.ts).
type Save struct {
	ImportedAt string                  `json:"importedAt"`
	Facts      json.RawMessage         `json:"facts"`
	Progress   map[string]SaveProgress `json:"progress,omitempty"`
}

type SaveProgress struct {
	Done    bool   `json:"done"`
	Summary string `json:"summary,omitempty"`
}

// quests: Fated List status from the save (Unlocked | Complete | CashedOut).
func (s *Save) quests() map[string]string {
	var f struct {
		Quests map[string]string `json:"quests"`
	}
	if s != nil {
		_ = json.Unmarshal(s.Facts, &f)
	}
	return f.Quests
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

// done: achievements earned by any source: manual, Steam, or proven by the save.
func (st State) done() set {
	d := setOf(append(append([]string{}, st.Achievements...), st.SteamAchievements...)...)
	if st.Save != nil {
		for id, p := range st.Save.Progress {
			if p.Done {
				d[id] = true
			}
		}
	}
	return d
}

// owned is the build plus the aspect and keepsake, which count as held.
// Same as heldIds in web/src/core/run.ts.
func (st State) owned() set {
	o := setOf(st.Run.Boons...)
	for _, id := range []string{st.Run.Aspect, st.Run.Keepsake} {
		if id != "" {
			o[id] = true
		}
	}
	return o
}

// pool: gods still offerable under the four-god limit (nil = any).
// History plus the build, as runGods in web/src/core/run.ts.
func (st State) pool(d *Dataset) set {
	gods := append([]string{}, st.Run.Gods...)
	for _, id := range st.Run.Boons {
		if b := d.byID[id]; b != nil {
			gods = append(gods, b.Gods...)
		}
	}
	return godPool(gods)
}
