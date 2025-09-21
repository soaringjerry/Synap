package services

import (
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type AuthStore interface {
	FindUserByEmail(email string) (*User, error)
	AddUser(u *User) error
	AddTenant(t *Tenant) error
	DeleteTenant(id string) error
}

type TokenSigner func(uid, tid, email string, ttl time.Duration) (string, error)

type AuthService struct {
	store     AuthStore
	now       func() time.Time
	idGen     func(prefix string, n int) string
	signToken TokenSigner
	tokenTTL  time.Duration
}

type AuthResult struct {
	Token    string
	TenantID string
	UserID   string
}

func NewAuthService(store AuthStore, signer TokenSigner) *AuthService {
	return &AuthService{
		store:     store,
		now:       func() time.Time { return time.Now().UTC() },
		idGen:     func(prefix string, n int) string { return prefix + shortID(n) },
		signToken: signer,
		tokenTTL:  30 * 24 * time.Hour,
	}
}

func (s *AuthService) Register(email, password, tenantName string) (*AuthResult, error) {
	email = strings.TrimSpace(email)
	if email == "" || strings.TrimSpace(password) == "" {
		return nil, NewInvalidError("email/password required")
	}
	if !isValidEmail(email) {
		return nil, NewInvalidError("invalid email format")
	}
	if !isStrongPassword(password) {
		return nil, NewInvalidError("weak password")
	}
	existing, err := s.store.FindUserByEmail(email)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, NewConflictError("email exists")
	}
	tenantID := s.idGen("t", 7)
	if err := s.store.AddTenant(&Tenant{ID: tenantID, Name: tenantName}); err != nil {
		return nil, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	userID := s.idGen("u", 7)
	now := s.now()
	if err := s.store.AddUser(&User{ID: userID, Email: email, PassHash: hash, TenantID: tenantID, CreatedAt: now}); err != nil {
		// best-effort rollback of orphan tenant to keep DB consistent
		_ = s.store.DeleteTenant(tenantID)
		return nil, err
	}
	if s.signToken == nil {
		return nil, NewInvalidError("token signer not configured")
	}
	token, err := s.signToken(userID, tenantID, email, s.tokenTTL)
	if err != nil {
		return nil, err
	}
	return &AuthResult{Token: token, TenantID: tenantID, UserID: userID}, nil
}

// RegisterWithTenant creates a user under an existing tenant (used for invitations).
// It does not create a new tenant.
func (s *AuthService) RegisterWithTenant(email, password, tenantID string) (*AuthResult, error) {
	email = strings.TrimSpace(email)
	if email == "" || strings.TrimSpace(password) == "" {
		return nil, NewInvalidError("email/password required")
	}
	if strings.TrimSpace(tenantID) == "" {
		return nil, NewInvalidError("tenant required")
	}
	existing, err := s.store.FindUserByEmail(email)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, NewConflictError("email exists")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	userID := s.idGen("u", 7)
	now := s.now()
	if err := s.store.AddUser(&User{ID: userID, Email: email, PassHash: hash, TenantID: tenantID, CreatedAt: now}); err != nil {
		return nil, err
	}
	if s.signToken == nil {
		return nil, NewInvalidError("token signer not configured")
	}
	token, err := s.signToken(userID, tenantID, email, s.tokenTTL)
	if err != nil {
		return nil, err
	}
	return &AuthResult{Token: token, TenantID: tenantID, UserID: userID}, nil
}

func (s *AuthService) Login(email, password string) (*AuthResult, error) {
	email = strings.TrimSpace(email)
	if email == "" || strings.TrimSpace(password) == "" {
		return nil, NewInvalidError("email/password required")
	}
	u, err := s.store.FindUserByEmail(email)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, NewUnauthorizedError("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword(u.PassHash, []byte(password)); err != nil {
		return nil, NewUnauthorizedError("invalid credentials")
	}
	if s.signToken == nil {
		return nil, NewInvalidError("token signer not configured")
	}
	token, err := s.signToken(u.ID, u.TenantID, u.Email, s.tokenTTL)
	if err != nil {
		return nil, err
	}
	return &AuthResult{Token: token, TenantID: u.TenantID, UserID: u.ID}, nil
}

func (s *AuthService) TokenTTL() time.Duration {
	return s.tokenTTL
}

// isValidEmail performs a basic RFC5322-like validation suitable for server-side checks.
func isValidEmail(email string) bool {
	// very small, pragmatic regex; avoids overly permissive matches
	// local@domain.tld with at least one dot in domain
	// note: further normalization (lowercasing) handled by store
	var (
		hasAt = strings.Count(email, "@") == 1
		parts = strings.Split(email, "@")
	)
	if !hasAt {
		return false
	}
	local := strings.TrimSpace(parts[0])
	domain := strings.TrimSpace(parts[1])
	if local == "" || domain == "" {
		return false
	}
	if strings.HasPrefix(domain, ".") || strings.HasSuffix(domain, ".") || !strings.Contains(domain, ".") {
		return false
	}
	return true
}

// isStrongPassword enforces minimal strength: length>=8 and contains letters and digits.
func isStrongPassword(pw string) bool {
	if len(pw) < 8 {
		return false
	}
	hasLetter := false
	hasDigit := false
	for _, r := range pw {
		switch {
		case r >= 'a' && r <= 'z':
			hasLetter = true
		case r >= 'A' && r <= 'Z':
			hasLetter = true
		case r >= '0' && r <= '9':
			hasDigit = true
		default:
			// allow symbols without requiring
		}
	}
	return hasLetter && hasDigit
}
