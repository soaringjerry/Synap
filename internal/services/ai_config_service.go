package services

type AIConfigStore interface {
    GetAIConfig(tenantID string) (*TenantAIConfig, error)
    UpsertAIConfig(cfg *TenantAIConfig) error
}

type AIConfigService struct{ store AIConfigStore }

func NewAIConfigService(store AIConfigStore) *AIConfigService { return &AIConfigService{store: store} }

func (s *AIConfigService) Get(tenantID string) (*TenantAIConfig, error) {
    cfg, err := s.store.GetAIConfig(tenantID)
    if err != nil { return nil, err }
    if cfg == nil {
        cfg = &TenantAIConfig{TenantID: tenantID, AllowExternal: false, StoreLogs: false}
    }
    return cfg, nil
}

func (s *AIConfigService) Update(in *TenantAIConfig) error {
    if in == nil || in.TenantID == "" { return NewInvalidError("tenant_id required") }
    return s.store.UpsertAIConfig(in)
}

