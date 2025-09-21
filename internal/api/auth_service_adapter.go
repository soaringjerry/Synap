package api

import (
	"github.com/soaringjerry/Synap/internal/services"
	"strings"
)

type authStoreAdapter struct {
	store Store
}

func newAuthStoreAdapter(store Store) services.AuthStore {
	return &authStoreAdapter{store: store}
}

func (a *authStoreAdapter) FindUserByEmail(email string) (*services.User, error) {
	u := a.store.FindUserByEmail(email)
	if u == nil {
		return nil, nil
	}
	return &services.User{ID: u.ID, Email: u.Email, PassHash: u.PassHash, TenantID: u.TenantID, CreatedAt: u.CreatedAt}, nil
}

func (a *authStoreAdapter) AddUser(u *services.User) error {
	if u == nil {
		return services.NewInvalidError("user required")
	}
	a.store.AddUser(&User{ID: u.ID, Email: u.Email, PassHash: u.PassHash, TenantID: u.TenantID, CreatedAt: u.CreatedAt})
	return nil
}

func (a *authStoreAdapter) AddTenant(t *services.Tenant) error {
	if t == nil {
		return services.NewInvalidError("tenant required")
	}
	a.store.AddTenant(&Tenant{ID: t.ID, Name: t.Name})
	return nil
}

func (a *authStoreAdapter) DeleteTenant(id string) error {
	if strings.TrimSpace(id) == "" {
		return services.NewInvalidError("tenant id required")
	}
	a.store.DeleteTenant(id)
	return nil
}

var _ services.AuthStore = (*authStoreAdapter)(nil)
