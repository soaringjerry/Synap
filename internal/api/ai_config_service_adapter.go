package api

import "github.com/soaringjerry/Synap/internal/services"

type aiConfigStoreAdapter struct{ store Store }

func newAIConfigStoreAdapter(store Store) services.AIConfigStore {
	return &aiConfigStoreAdapter{store: store}
}

func (a *aiConfigStoreAdapter) GetAIConfig(tenantID string) (*services.TenantAIConfig, error) {
	cfg := a.store.GetAIConfig(tenantID)
	if cfg == nil {
		return nil, nil
	}
	return &services.TenantAIConfig{TenantID: cfg.TenantID, OpenAIKey: cfg.OpenAIKey, OpenAIBase: cfg.OpenAIBase, AllowExternal: cfg.AllowExternal, StoreLogs: cfg.StoreLogs}, nil
}

func (a *aiConfigStoreAdapter) UpsertAIConfig(cfg *services.TenantAIConfig) error {
	a.store.UpsertAIConfig(&TenantAIConfig{TenantID: cfg.TenantID, OpenAIKey: cfg.OpenAIKey, OpenAIBase: cfg.OpenAIBase, AllowExternal: cfg.AllowExternal, StoreLogs: cfg.StoreLogs})
	return nil
}

var _ services.AIConfigStore = (*aiConfigStoreAdapter)(nil)
