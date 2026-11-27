// Command steamschema fetches achievement names, descriptions and icons for
// Hades from the Steam Web API into local, gitignored files.
//
// The API key is read from STEAM_API_KEY and never written anywhere:
//
//	STEAM_API_KEY=... go run ./tools/steamschema
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"
)

type Text struct {
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
}

type schema struct {
	Game struct {
		AvailableGameStats struct {
			Achievements []struct {
				Name        string `json:"name"` // API name, e.g. AchClearTartarus
				DisplayName string `json:"displayName"`
				Description string `json:"description"`
				Icon        string `json:"icon"`
			} `json:"achievements"`
		} `json:"availableGameStats"`
	} `json:"game"`
}

func main() {
	appID := flag.String("app", "1145360", "Steam app id (Hades)")
	out := flag.String("out", "game-files/generated", "output dir")
	flag.Parse()

	key := os.Getenv("STEAM_API_KEY")
	if key == "" {
		log.Fatal("set STEAM_API_KEY (https://steamcommunity.com/dev/apikey)")
	}

	q := url.Values{"key": {key}, "appid": {*appID}, "l": {"english"}}
	client := &http.Client{Timeout: 30 * time.Second}
	res, err := client.Get("https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?" + q.Encode())
	if err != nil {
		// *url.Error prints the full URL, which contains the key — print only the cause.
		if ue, ok := err.(*url.Error); ok {
			err = ue.Err
		}
		log.Fatalf("Steam API request failed: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		log.Fatalf("Steam API: %s", res.Status)
	}
	var s schema
	if err := json.NewDecoder(res.Body).Decode(&s); err != nil {
		log.Fatal(err)
	}

	achs := s.Game.AvailableGameStats.Achievements
	text := map[string]Text{}
	iconDir := filepath.Join(*out, "achievement-icons")
	if err := os.MkdirAll(iconDir, 0o755); err != nil {
		log.Fatal(err)
	}
	for _, a := range achs {
		text[a.Name] = Text{Name: a.DisplayName, Description: a.Description}
		if a.Icon != "" {
			if err := download(client, a.Icon, filepath.Join(iconDir, a.Name+".jpg")); err != nil {
				log.Printf("icon %s: %v", a.Name, err)
			}
		}
	}

	b, _ := json.MarshalIndent(text, "", "  ")
	path := filepath.Join(*out, "achievements.en.json")
	if err := os.WriteFile(path, append(b, '\n'), 0o644); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("%d achievements -> %s, icons -> %s\n", len(achs), path, iconDir)
}

func download(c *http.Client, src, dst string) error {
	res, err := c.Get(src)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s", res.Status)
	}
	f, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, res.Body)
	return err
}
