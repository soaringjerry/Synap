package api

import "github.com/soaringjerry/Synap/internal/services"

type exportStoreAdapter struct {
	store Store
}

func newExportStoreAdapter(store Store) services.ExportStore {
	return &exportStoreAdapter{store: store}
}

func (a *exportStoreAdapter) GetScale(id string) (*services.Scale, error) {
	return convertAPIScale(a.store.GetScale(id)), nil
}

func (a *exportStoreAdapter) ListItems(scaleID string) ([]*services.Item, error) {
	items := a.store.ListItems(scaleID)
	out := make([]*services.Item, 0, len(items))
	for _, it := range items {
		out = append(out, convertAPIItem(it))
	}
	return out, nil
}

func (a *exportStoreAdapter) ListResponsesByScale(scaleID string) ([]*services.Response, error) {
	rs := a.store.ListResponsesByScale(scaleID)
	out := make([]*services.Response, 0, len(rs))
	for _, r := range rs {
		out = append(out, &services.Response{ParticipantID: r.ParticipantID, ItemID: r.ItemID, RawValue: r.RawValue, ScoreValue: r.ScoreValue, SubmittedAt: r.SubmittedAt, RawJSON: r.RawJSON})
	}
	return out, nil
}

func (a *exportStoreAdapter) GetParticipant(id string) (*services.Participant, error) {
	p := a.store.GetParticipant(id)
	if p == nil {
		return nil, nil
	}
	return &services.Participant{ID: p.ID, Email: p.Email, ConsentID: p.ConsentID}, nil
}

func (a *exportStoreAdapter) GetConsentByID(id string) (*services.ConsentRecord, error) {
	c := a.store.GetConsentByID(id)
	if c == nil {
		return nil, nil
	}
	return &services.ConsentRecord{ID: c.ID, ScaleID: c.ScaleID, Choices: c.Choices, SignedAt: c.SignedAt}, nil
}

var _ services.ExportStore = (*exportStoreAdapter)(nil)
