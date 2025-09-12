package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/soaringjerry/Synap/internal/middleware"
	"github.com/soaringjerry/Synap/internal/utils"
)

func main() {
	addr := os.Getenv("SYNAP_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		locale := middleware.LocaleFromContext(r.Context())
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":     true,
			"name":   "Synap API",
			"locale": locale,
			"msg":    utils.T(locale, "health.ok"),
		})
	})

	// Serve static files if provided via SYNAP_STATIC_DIR
	if staticDir := os.Getenv("SYNAP_STATIC_DIR"); staticDir != "" {
		fs := http.FileServer(http.Dir(staticDir))
		mux.Handle("/", fs)
	}

	// Wrap mux with locale middleware
	handler := middleware.LocaleMiddleware(mux)

	log.Printf("Synap server listening on %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
