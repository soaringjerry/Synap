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
