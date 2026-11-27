package main

import (
	"bufio"
	"os"
	"regexp"
)

type Text struct {
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
}

var (
	reID   = regexp.MustCompile(`^\s*Id = "([^"]+)"`)
	reName = regexp.MustCompile(`^\s*DisplayName = "([^"]*)"`)
	reDesc = regexp.MustCompile(`^\s*Description = "(.*)"\s*$`)
	reInh  = regexp.MustCompile(`^\s*InheritFrom = "([^"]+)"`)
)

// loadHelpText reads Id/DisplayName/Description triples from an SJSON text file.
// Line-based on purpose: good enough for HelpText; multi-line """ descriptions are skipped.
func loadHelpText(path string) (map[string]Text, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	out := map[string]Text{}
	parent := map[string]string{}
	var cur string
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		line := sc.Text()
		if m := reID.FindStringSubmatch(line); m != nil {
			cur = m[1]
			continue
		}
		if cur == "" {
			continue
		}
		t := out[cur]
		if m := reName.FindStringSubmatch(line); m != nil {
			t.Name = m[1]
		} else if m := reDesc.FindStringSubmatch(line); m != nil {
			t.Description = m[1]
		} else if m := reInh.FindStringSubmatch(line); m != nil {
			parent[cur] = m[1]
			continue
		} else {
			continue
		}
		out[cur] = t
	}
	// Entries can inherit name/description from another entry.
	for id, p := range parent {
		t, pt := out[id], out[p]
		if t.Name == "" {
			t.Name = pt.Name
		}
		if t.Description == "" {
			t.Description = pt.Description
		}
		out[id] = t
	}
	return out, sc.Err()
}
