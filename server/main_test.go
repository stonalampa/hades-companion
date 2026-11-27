package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequireToken(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	cases := []struct {
		token, header string
		want          int
	}{
		{"", "", http.StatusNoContent},                      // no token configured: open
		{"s3cret", "", http.StatusUnauthorized},             // missing
		{"s3cret", "Bearer wrong", http.StatusUnauthorized}, // wrong
		{"s3cret", "Bearer s3cret", http.StatusNoContent},   // right
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodPost, "/mcp", nil)
		if c.header != "" {
			req.Header.Set("Authorization", c.header)
		}
		rec := httptest.NewRecorder()
		requireToken(c.token, ok).ServeHTTP(rec, req)
		if rec.Code != c.want {
			t.Errorf("token=%q header=%q: got %d, want %d", c.token, c.header, rec.Code, c.want)
		}
	}
}
