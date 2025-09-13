package main

import (
	"encoding/json"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/soaringjerry/Synap/internal/api"
	"github.com/soaringjerry/Synap/internal/middleware"
	"github.com/soaringjerry/Synap/internal/utils"
)

func main() {
	addr := os.Getenv("SYNAP_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	commit := os.Getenv("SYNAP_COMMIT")
	buildTime := os.Getenv("SYNAP_BUILD_TIME")

	mux := http.NewServeMux()
	// API routes
	api.NewRouter().Register(mux)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		locale := middleware.LocaleFromContext(r.Context())
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":         true,
			"name":       "Synap API",
			"locale":     locale,
			"msg":        utils.T(locale, "health.ok"),
			"commit":     commit,
			"build_time": buildTime,
		})
	})

	mux.HandleFunc("/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"commit":     commit,
			"build_time": buildTime,
		})
	})

	// Frontend serving strategy (priority):
	// 1) Static files if SYNAP_STATIC_DIR is set (fullstack image)
	// 2) Dev proxy if SYNAP_DEV_FRONTEND_URL is set (proxy / to Vite dev)
	if staticDir := os.Getenv("SYNAP_STATIC_DIR"); staticDir != "" {
		mux.Handle("/", spaFileServer(staticDir))
	} else if devURL := os.Getenv("SYNAP_DEV_FRONTEND_URL"); devURL != "" {
		if u, err := url.Parse(devURL); err == nil {
			rp := httputil.NewSingleHostReverseProxy(u)
			// Ensure no-store headers also apply to proxied responses
			rp.ModifyResponse = func(res *http.Response) error {
				res.Header.Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
				res.Header.Set("Pragma", "no-cache")
				res.Header.Set("Expires", "0")
				return nil
			}
			mux.Handle("/", rp)
		} else {
			log.Printf("invalid SYNAP_DEV_FRONTEND_URL=%q: %v", devURL, err)
		}
	}

	// Data retention auto-cleaner (in-memory MVP)
	if days := os.Getenv("SYNAP_RETENTION_DAYS"); days != "" {
		if d, err := strconv.Atoi(days); err == nil && d > 0 {
			go func() {
				ticker := time.NewTicker(24 * time.Hour)
				defer ticker.Stop()
				// first run shortly after start
				time.Sleep(5 * time.Second)
				for {
					select {
					case <-ticker.C:
					default:
					}
					// best-effort: access api router's store via exported singleton would be ideal;
					// for MVP, trigger GC via HTTP export is skipped. In a real DB, use SQL DELETE ... WHERE submitted_at < cutoff
					// no-op here as store is encapsulated; retained for future integration with persistent store
					_ = d
					time.Sleep(24 * time.Hour)
				}
			}()
		}
	}

	// Wrap mux with locale + security + no-store cache middleware
	handler := middleware.NoStore(middleware.SecureHeaders(middleware.LocaleMiddleware(mux)))

	log.Printf("Synap server listening on %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

// spaFileServer serves static files with an SPA fallback: unknown routes return index.html
func spaFileServer(dir string) http.Handler {
	fs := http.Dir(dir)
	index := "index.html"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try to open the requested path
		f, err := fs.Open(r.URL.Path)
		if err == nil {
			// If it's a directory, try to serve index inside it; otherwise serve file
			stat, _ := f.Stat()
			_ = f.Close()
			if stat != nil && stat.IsDir() {
				// Attempt directory index file
				http.ServeFile(w, r, dir+"/"+strings.TrimPrefix(r.URL.Path, "/")+"/"+index)
				return
			}
			http.FileServer(fs).ServeHTTP(w, r)
			return
		}
		// Fallback to SPA index for GET/HEAD and HTML requests
		if r.Method == http.MethodGet || r.Method == http.MethodHead {
			// Only fallback for navigations (HTML)
			if strings.Contains(r.Header.Get("Accept"), "text/html") || !strings.Contains(r.URL.Path, ".") {
				http.ServeFile(w, r, dir+"/"+index)
				return
			}
		}
		// Otherwise 404
		http.NotFound(w, r)
	})
}
