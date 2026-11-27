package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	lua "github.com/yuin/gopher-lua"
)

// loadGlobals runs the given data scripts in one Lua state and returns the
// requested global tables converted to plain Go values (map or slice).
func loadGlobals(scriptsDir string, files []string, globals []string) (map[string]any, error) {
	L := lua.NewState()
	defer L.Close()

	// Data scripts reference engine globals (constants, helper tables, functions)
	// that don't exist outside the game. Unknown globals resolve to an inert stub
	// that can be indexed and called, so only real data survives the conversion.
	if err := L.DoString(stubPrelude); err != nil {
		return nil, err
	}

	for _, f := range files {
		src, err := os.ReadFile(filepath.Join(scriptsDir, f))
		if err != nil {
			return nil, err
		}
		src = bytes.TrimPrefix(src, []byte("\xef\xbb\xbf")) // some scripts start with a UTF-8 BOM
		fn, err := L.Load(bytes.NewReader(src), f)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", f, err)
		}
		L.Push(fn)
		if err := L.PCall(0, lua.MultRet, nil); err != nil {
			return nil, fmt.Errorf("%s: %w", f, err)
		}
	}

	out := make(map[string]any, len(globals))
	for _, name := range globals {
		v := L.GetGlobal(name)
		t, ok := v.(*lua.LTable)
		if !ok {
			return nil, fmt.Errorf("global %s is %s, want table", name, v.Type())
		}
		if out[name] = toGo(t, 0); out[name] == nil {
			return nil, fmt.Errorf("global %s is not a data table", name)
		}
	}
	return out, nil
}

const stubPrelude = `
local stub = {}
setmetatable(stub, {
  __index = function() return stub end,
  __call = function() return stub end,
  __add = function() return 0 end, __sub = function() return 0 end,
  __mul = function() return 0 end, __div = function() return 0 end,
  __unm = function() return 0 end, __concat = function() return "" end,
})
setmetatable(_G, { __index = function() return stub end })
GameData = {}
`

// toGo converts a Lua value to string, float64, bool, []any or map[string]any.
// Tables with only a sequence part become slices.
func toGo(v lua.LValue, depth int) any {
	if depth > 40 {
		return nil
	}
	switch v := v.(type) {
	case lua.LString:
		return string(v)
	case lua.LNumber:
		return float64(v)
	case lua.LBool:
		return bool(v)
	case *lua.LTable:
		if v.Metatable != lua.LNil && v.Metatable != nil {
			if mt, ok := v.Metatable.(*lua.LTable); ok && mt.RawGetString("__call") != lua.LNil {
				return nil // engine stub
			}
		}
		n := v.MaxN()
		hasHash := false
		v.ForEach(func(k, _ lua.LValue) {
			if num, ok := k.(lua.LNumber); !ok || int(num) < 1 || int(num) > n {
				hasHash = true
			}
		})
		if !hasHash {
			arr := make([]any, 0, n)
			for i := 1; i <= n; i++ {
				arr = append(arr, toGo(v.RawGetInt(i), depth+1))
			}
			return arr
		}
		m := map[string]any{}
		v.ForEach(func(k, val lua.LValue) {
			m[k.String()] = toGo(val, depth+1)
		})
		return m
	default:
		return nil // functions, userdata, nil
	}
}

func strings_(v any) []string {
	arr, _ := v.([]any)
	out := make([]string, 0, len(arr))
	for _, x := range arr {
		if s, ok := x.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
