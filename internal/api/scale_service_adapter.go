package api

import "github.com/soaringjerry/Synap/internal/services"

type scaleStoreAdapter struct {
	store Store
}

func newScaleStoreAdapter(store Store) services.ScaleStore {
	return &scaleStoreAdapter{store: store}
}

func (a *scaleStoreAdapter) InsertScale(sc *services.Scale) (*services.Scale, error) {
	apiScale := convertServiceScale(sc)
	a.store.AddScale(apiScale)
	stored := a.store.GetScale(apiScale.ID)
	return convertAPIScale(stored), nil
}

func (a *scaleStoreAdapter) GetScale(id string) (*services.Scale, error) {
	return convertAPIScale(a.store.GetScale(id)), nil
}

func (a *scaleStoreAdapter) UpdateScale(sc *services.Scale) error {
	if sc == nil {
		return services.NewInvalidError("scale required")
	}
	if ok := a.store.UpdateScale(convertServiceScale(sc)); !ok {
		return services.NewNotFoundError("scale not found")
	}
	return nil
}

func (a *scaleStoreAdapter) DeleteScale(id string) error {
	if ok := a.store.DeleteScale(id); !ok {
		return services.NewNotFoundError("scale not found")
	}
	return nil
}

func (a *scaleStoreAdapter) InsertItem(it *services.Item) (*services.Item, error) {
	apiItem := convertServiceItem(it)
	a.store.AddItem(apiItem)
	stored := a.store.GetItem(apiItem.ID)
	return convertAPIItem(stored), nil
}

func (a *scaleStoreAdapter) UpdateItem(it *services.Item) error {
	if it == nil {
		return services.NewInvalidError("item required")
	}
	if ok := a.store.UpdateItem(convertServiceItem(it)); !ok {
		return services.NewNotFoundError("item not found")
	}
	return nil
}

func (a *scaleStoreAdapter) DeleteItem(id string) error {
	if ok := a.store.DeleteItem(id); !ok {
		return services.NewNotFoundError("item not found")
	}
	return nil
}

func (a *scaleStoreAdapter) ListItems(scaleID string) ([]*services.Item, error) {
	items := a.store.ListItems(scaleID)
	out := make([]*services.Item, 0, len(items))
	for _, it := range items {
		out = append(out, convertAPIItem(it))
	}
	return out, nil
}

func (a *scaleStoreAdapter) ReorderItems(scaleID string, order []string) (bool, error) {
	return a.store.ReorderItems(scaleID, order), nil
}

func (a *scaleStoreAdapter) DeleteResponsesByScale(scaleID string) (int, error) {
	return a.store.DeleteResponsesByScale(scaleID), nil
}

func (a *scaleStoreAdapter) AddAudit(entry services.AuditEntry) {
	a.store.AddAudit(AuditEntry{Time: entry.Time, Actor: entry.Actor, Action: entry.Action, Target: entry.Target, Note: entry.Note})
}

func convertServiceScale(sc *services.Scale) *Scale {
	if sc == nil {
		return nil
	}
	return &Scale{
		ID:                sc.ID,
		TenantID:          sc.TenantID,
		Points:            sc.Points,
		Randomize:         sc.Randomize,
		NameI18n:          sc.NameI18n,
		ConsentI18n:       sc.ConsentI18n,
		CollectEmail:      sc.CollectEmail,
		E2EEEnabled:       sc.E2EEEnabled,
		Region:            sc.Region,
		TurnstileEnabled:  sc.TurnstileEnabled,
		ItemsPerPage:      sc.ItemsPerPage,
		ConsentConfig:     convertServiceConsent(sc.ConsentConfig),
		LikertLabelsI18n:  sc.LikertLabelsI18n,
		LikertShowNumbers: sc.LikertShowNumbers,
		LikertPreset:      sc.LikertPreset,
	}
}

func convertAPIScale(sc *Scale) *services.Scale {
	if sc == nil {
		return nil
	}
	return &services.Scale{
		ID:                sc.ID,
		TenantID:          sc.TenantID,
		Points:            sc.Points,
		Randomize:         sc.Randomize,
		NameI18n:          sc.NameI18n,
		ConsentI18n:       sc.ConsentI18n,
		CollectEmail:      sc.CollectEmail,
		E2EEEnabled:       sc.E2EEEnabled,
		Region:            sc.Region,
		TurnstileEnabled:  sc.TurnstileEnabled,
		ItemsPerPage:      sc.ItemsPerPage,
		ConsentConfig:     convertAPIConsent(sc.ConsentConfig),
		LikertLabelsI18n:  sc.LikertLabelsI18n,
		LikertShowNumbers: sc.LikertShowNumbers,
		LikertPreset:      sc.LikertPreset,
	}
}

func convertServiceConsent(cc *services.ConsentConfig) *ConsentConfig {
	if cc == nil {
		return nil
	}
	opts := make([]ConsentOptionConf, 0, len(cc.Options))
	for _, opt := range cc.Options {
		opts = append(opts, ConsentOptionConf{
			Key:       opt.Key,
			LabelI18n: opt.LabelI18n,
			Required:  opt.Required,
			Group:     opt.Group,
			Order:     opt.Order,
		})
	}
	return &ConsentConfig{Version: cc.Version, Options: opts, SignatureRequired: cc.SignatureRequired}
}

func convertAPIConsent(cc *ConsentConfig) *services.ConsentConfig {
	if cc == nil {
		return nil
	}
	opts := make([]services.ConsentOptionConf, 0, len(cc.Options))
	for _, opt := range cc.Options {
		opts = append(opts, services.ConsentOptionConf{
			Key:       opt.Key,
			LabelI18n: opt.LabelI18n,
			Required:  opt.Required,
			Group:     opt.Group,
			Order:     opt.Order,
		})
	}
	return &services.ConsentConfig{Version: cc.Version, Options: opts, SignatureRequired: cc.SignatureRequired}
}

func convertServiceItem(it *services.Item) *Item {
	if it == nil {
		return nil
	}
	return &Item{
		ID:                it.ID,
		ScaleID:           it.ScaleID,
		ReverseScored:     it.ReverseScored,
		StemI18n:          it.StemI18n,
		Type:              it.Type,
		OptionsI18n:       it.OptionsI18n,
		PlaceholderI18n:   it.PlaceholderI18n,
		Min:               it.Min,
		Max:               it.Max,
		Step:              it.Step,
		Required:          it.Required,
		LikertLabelsI18n:  it.LikertLabelsI18n,
		LikertShowNumbers: it.LikertShowNumbers,
		Order:             it.Order,
	}
}

func convertAPIItem(it *Item) *services.Item {
	if it == nil {
		return nil
	}
	return &services.Item{
		ID:                it.ID,
		ScaleID:           it.ScaleID,
		ReverseScored:     it.ReverseScored,
		StemI18n:          it.StemI18n,
		Type:              it.Type,
		OptionsI18n:       it.OptionsI18n,
		PlaceholderI18n:   it.PlaceholderI18n,
		Min:               it.Min,
		Max:               it.Max,
		Step:              it.Step,
		Required:          it.Required,
		LikertLabelsI18n:  it.LikertLabelsI18n,
		LikertShowNumbers: it.LikertShowNumbers,
		Order:             it.Order,
	}
}

var _ services.ScaleStore = (*scaleStoreAdapter)(nil)
