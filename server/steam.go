package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

const hadesAppID = "1145360"

// Steam pulls the player's achievements from the Steam Web API.
// The key comes from STEAM_API_KEY and is never logged or returned.
type Steam struct {
	key     string
	player  string // STEAM_ID: SteamID64, profile URL or vanity name
	baseURL string // https://api.steampowered.com; overridden in tests
	client  *http.Client

	mu          sync.Mutex
	steamID     string    // resolved SteamID64
	lastAttempt time.Time // successful or not
}

// allow reports whether Steam may be asked now: at most once a minute,
// so page loads and failures (private profile) don't hammer the API.
func (s *Steam) allow() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if time.Since(s.lastAttempt) < time.Minute {
		return false
	}
	s.lastAttempt = time.Now()
	return true
}

func newSteam(key, player string) *Steam {
	if key == "" || player == "" {
		return nil
	}
	return &Steam{key: key, player: player, baseURL: "https://api.steampowered.com", client: &http.Client{Timeout: 15 * time.Second}}
}

var (
	reSteamID64   = regexp.MustCompile(`^\d{17}$`)
	reProfileURL  = regexp.MustCompile(`steamcommunity\.com/profiles/(\d{17})`)
	reVanityURL   = regexp.MustCompile(`steamcommunity\.com/id/([^/?#]+)`)
	errBadSteamID = errors.New("STEAM_ID not found: use your SteamID64, profile URL or custom URL name")
)

const privacyHint = "if it's yours: Edit Profile → Privacy Settings → My profile AND Game details = Public"

// steamError is what Steam said, e.g. 403 "Profile is not public".
type steamError struct {
	status, msg string
}

func (e *steamError) Error() string {
	switch {
	case e.msg != "" && e.status != "":
		return fmt.Sprintf("Steam says %q (%s)", e.msg, e.status)
	case e.msg != "":
		return fmt.Sprintf("Steam says %q", e.msg)
	}
	return "Steam API: " + e.status
}

func (s *Steam) get(ctx context.Context, path string, q url.Values, v any) error {
	q.Set("key", s.key)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+path+"?"+q.Encode(), nil)
	if err != nil {
		return err
	}
	res, err := s.client.Do(req)
	if err != nil {
		// *url.Error prints the URL, which contains the key — keep only the cause.
		var ue *url.Error
		if errors.As(err, &ue) {
			err = ue.Err
		}
		return fmt.Errorf("Steam API: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != http.StatusOK {
		// GetPlayerAchievements explains itself in the body, e.g. "Profile is not public".
		var e struct {
			PlayerStats struct {
				Error string `json:"error"`
			} `json:"playerstats"`
		}
		if json.Unmarshal(body, &e) == nil && e.PlayerStats.Error != "" {
			return &steamError{status: res.Status, msg: e.PlayerStats.Error}
		}
		return &steamError{status: res.Status}
	}
	return json.Unmarshal(body, v)
}

// resolveID turns STEAM_ID into a SteamID64 once.
func (s *Steam) resolveID(ctx context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.steamID != "" {
		return s.steamID, nil
	}
	p := strings.TrimSpace(s.player)
	if m := reProfileURL.FindStringSubmatch(p); m != nil {
		p = m[1]
	} else if m := reVanityURL.FindStringSubmatch(p); m != nil {
		p = m[1]
	}
	if reSteamID64.MatchString(p) {
		s.steamID = p
		return p, nil
	}
	var r struct {
		Response struct {
			Success int    `json:"success"`
			SteamID string `json:"steamid"`
		} `json:"response"`
	}
	if err := s.get(ctx, "/ISteamUser/ResolveVanityURL/v1/", url.Values{"vanityurl": {p}}, &r); err != nil {
		return "", err
	}
	if r.Response.Success != 1 {
		return "", errBadSteamID
	}
	s.steamID = r.Response.SteamID
	return s.steamID, nil
}

// Achieved returns the API names of the player's unlocked Hades achievements.
func (s *Steam) Achieved(ctx context.Context) ([]string, error) {
	id, err := s.resolveID(ctx)
	if err != nil {
		return nil, err
	}
	var r struct {
		PlayerStats struct {
			Success      bool   `json:"success"`
			Error        string `json:"error"`
			Achievements []struct {
				APIName  string `json:"apiname"`
				Achieved int    `json:"achieved"`
			} `json:"achievements"`
		} `json:"playerstats"`
	}
	q := url.Values{"steamid": {id}, "appid": {hadesAppID}}
	err = s.get(ctx, "/ISteamUserStats/GetPlayerAchievements/v1/", q, &r)
	if err == nil && !r.PlayerStats.Success {
		err = &steamError{msg: r.PlayerStats.Error}
	}
	var se *steamError
	if errors.As(err, &se) {
		// Say which account was asked, so a wrong STEAM_ID is obvious.
		return nil, fmt.Errorf("%w — account checked: https://steamcommunity.com/profiles/%s (%s)", se, id, privacyHint)
	}
	if err != nil {
		return nil, err
	}
	out := []string{}
	for _, a := range r.PlayerStats.Achievements {
		if a.Achieved == 1 {
			out = append(out, a.APIName)
		}
	}
	return out, nil
}
