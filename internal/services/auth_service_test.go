package services

import (
	"errors"
	"testing"
	"time"
)

type authStubStore struct {
	users   map[string]*User
	tenants map[string]*Tenant
}

func newAuthStubStore() *authStubStore {
	return &authStubStore{users: map[string]*User{}, tenants: map[string]*Tenant{}}
}

func (s *authStubStore) FindUserByEmail(email string) (*User, error) {
	if u, ok := s.users[email]; ok {
		copy := *u
		return &copy, nil
	}
	return nil, nil
}

func (s *authStubStore) AddUser(u *User) error {
	if _, ok := s.users[u.Email]; ok {
		return errors.New("duplicate user")
	}
	copy := *u
	s.users[u.Email] = &copy
	return nil
}

func (s *authStubStore) AddTenant(t *Tenant) error {
	copy := *t
	s.tenants[t.ID] = &copy
	return nil
}

func TestAuthRegisterAndLogin(t *testing.T) {
	store := newAuthStubStore()
	svc := NewAuthService(store, func(uid, tid, email string, ttl time.Duration) (string, error) {
		return "token:" + uid + ":" + tid, nil
	})
	svc.now = func() time.Time { return time.Unix(0, 0) }
	svc.idGen = func(prefix string, n int) string { return prefix + "1234567" }

	res, err := svc.Register("user@example.com", "Secret123", "Acme")
	if err != nil {
		t.Fatalf("Register returned error: %v", err)
	}
	if res.TenantID == "" || res.UserID == "" {
		t.Fatalf("expected ids in result: %+v", res)
	}
	if res.Token != "token:"+res.UserID+":"+res.TenantID {
		t.Fatalf("unexpected token %q", res.Token)
	}

	if _, err = svc.Register("user@example.com", "Secret123", "Acme"); err == nil {
		t.Fatalf("expected conflict error on duplicate registration")
	}

	loginRes, err := svc.Login("user@example.com", "Secret123")
	if err != nil {
		t.Fatalf("Login returned error: %v", err)
	}
	if loginRes.Token == "" {
		t.Fatalf("expected token in login response")
	}

	if _, err := svc.Login("user@example.com", "wrong"); err == nil {
		t.Fatalf("expected error for wrong password")
	}
	if _, err := svc.Login("missing@example.com", "Secret123"); err == nil {
		t.Fatalf("expected error for missing user")
	}
}

func TestAuthValidation(t *testing.T) {
	store := newAuthStubStore()
	svc := NewAuthService(store, func(uid, tid, email string, ttl time.Duration) (string, error) {
		return "tok", nil
	})

	if _, err := svc.Register("", "", ""); err == nil {
		t.Fatalf("expected validation error")
	}
	if _, err := svc.Login("", ""); err == nil {
		t.Fatalf("expected validation error on login")
	}
}
