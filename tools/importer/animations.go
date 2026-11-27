package main

import (
	"bufio"
	"os"
	"regexp"
)

var (
	reAnimName    = regexp.MustCompile(`^\s*Name = "([^"]+)"`)
	reAnimPath    = regexp.MustCompile(`^\s*FilePath = "([^"]+)"`)
	reAnimInherit = regexp.MustCompile(`^\s*InheritFrom = "([^"]+)"`)
)

// loadAnimationPaths maps animation names to texture paths from an SJSON
// animations file (e.g. GUIAnimations.sjson). Line-based like loadHelpText.
func loadAnimationPaths(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	out := map[string]string{}
	parent := map[string]string{}
	var cur string
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		line := sc.Text()
		if m := reAnimName.FindStringSubmatch(line); m != nil {
			cur = m[1]
		} else if cur == "" {
			continue
		} else if m := reAnimPath.FindStringSubmatch(line); m != nil {
			out[cur] = m[1]
		} else if m := reAnimInherit.FindStringSubmatch(line); m != nil {
			parent[cur] = m[1]
		}
	}
	// Animations without a FilePath inherit their parent's.
	for name := range parent {
		p := name
		for i := 0; i < 10 && out[name] == ""; i++ {
			p = parent[p]
			if p == "" {
				break
			}
			if path := out[p]; path != "" {
				out[name] = path
			}
		}
	}
	return out, sc.Err()
}

// iconPaths resolves each boon's Icon to a texture path. TraitData names the
// base animation; the GUI defines it with a _Large suffix.
func iconPaths(boons []Boon, anims map[string]string) (map[string]string, []string) {
	out := map[string]string{}
	var missing []string
	for _, b := range boons {
		if b.Icon == "" {
			missing = append(missing, b.ID)
			continue
		}
		path, ok := anims[b.Icon]
		if !ok {
			path, ok = anims[b.Icon+"_Large"]
		}
		if !ok {
			missing = append(missing, b.ID)
			continue
		}
		out[b.ID] = path
	}
	return out, missing
}
