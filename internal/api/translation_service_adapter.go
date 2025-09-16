package api

import "github.com/soaringjerry/Synap/internal/services"

type translationStoreAdapter struct {
	store Store
}

func newTranslationStoreAdapter(store Store) services.TranslationStore {
	return &translationStoreAdapter{store: store}
}

func (a *translationStoreAdapter) GetScale(id string) (*services.Scale, error) {
	return convertAPIScale(a.store.GetScale(id)), nil
}

func (a *translationStoreAdapter) ListItems(scaleID string) ([]*services.Item, error) {
	items := a.store.ListItems(scaleID)
	out := make([]*services.Item, 0, len(items))
	for _, it := range items {
		out = append(out, convertAPIItem(it))
	}
	return out, nil
}

func (a *translationStoreAdapter) GetAIConfig(tenantID string) (*services.TenantAIConfig, error) {
	cfg := a.store.GetAIConfig(tenantID)
	if cfg == nil {
		return nil, nil
	}
	return &services.TenantAIConfig{TenantID: cfg.TenantID, OpenAIKey: cfg.OpenAIKey, OpenAIBase: cfg.OpenAIBase, AllowExternal: cfg.AllowExternal, StoreLogs: cfg.StoreLogs}, nil
}

var _ services.TranslationStore = (*translationStoreAdapter)(nil)
