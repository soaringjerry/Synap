package middleware

import (
	"net/http"
)

// CORS enables permissive cross-origin resource sharing for all routes.
// This is useful when the frontend is served from a different origin.
// It allows Authorization and common headers, and handles OPTIONS preflight.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Allow all origins. Do not use credentials with wildcard origin.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Step-Up")
		if r.Method == http.MethodOptions {
			// Preflight request: reply with 204 No Content
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
