package middleware

import (
	"context"
	"net/http"

	"github.com/soaringjerry/Synap/internal/utils"
)

type ctxKey int

const localeKey ctxKey = 1

// LocaleMiddleware extracts locale from query param (lang) or Accept-Language
// and stores it in request context.
func LocaleMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		qLang := r.URL.Query().Get("lang")
		aLang := r.Header.Get("Accept-Language")
		locale := utils.DetermineLocale(qLang, aLang, []string{"en", "zh"}, "en")
		ctx := context.WithValue(r.Context(), localeKey, locale)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// LocaleFromContext retrieves the locale stored by LocaleMiddleware.
func LocaleFromContext(ctx context.Context) string {
	if v := ctx.Value(localeKey); v != nil {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return "en"
}
