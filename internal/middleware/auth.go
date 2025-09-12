package middleware

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	jwt "github.com/golang-jwt/jwt/v5"
)

type authCtxKey int

const authKey authCtxKey = 7

type Claims struct {
	UID   string `json:"uid"`
	TID   string `json:"tid"`
	Email string `json:"email"`
	jwt.RegisteredClaims
}

func secret() []byte {
	s := os.Getenv("SYNAP_JWT_SECRET")
	if s == "" {
		s = "synap-dev-secret"
	}
	return []byte(s)
}

func SignToken(uid, tid, email string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{UID: uid, TID: tid, Email: email, RegisteredClaims: jwt.RegisteredClaims{IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(ttl))}}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret())
}

func parseToken(tok string) (*Claims, error) {
	t, err := jwt.ParseWithClaims(tok, &Claims{}, func(token *jwt.Token) (interface{}, error) { return secret(), nil })
	if err != nil {
		return nil, err
	}
	if c, ok := t.Claims.(*Claims); ok && t.Valid {
		return c, nil
	}
	return nil, errors.New("invalid token")
}

// Attach auth claims to context if Authorization header present and valid.
func WithAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		if strings.HasPrefix(h, "Bearer ") {
			tok := strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
			if c, err := parseToken(tok); err == nil {
				ctx := context.WithValue(r.Context(), authKey, c)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := r.Context().Value(authKey).(*Claims); !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func TenantIDFromContext(ctx context.Context) (string, bool) {
	if c, ok := ctx.Value(authKey).(*Claims); ok && c.TID != "" {
		return c.TID, true
	}
	return "", false
}
