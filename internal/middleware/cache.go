package middleware

import (
	"net/http"
)

// NoStore sets strict no-cache headers on every response to avoid stale assets.
// This ensures users never need to hard refresh (Ctrl+F5) to see updates.
func NoStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Conservative, widely compatible no-cache headers
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		next.ServeHTTP(w, r)
	})
}
