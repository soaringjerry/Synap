package api

import "github.com/soaringjerry/Synap/internal/services"

type analyticsStoreAdapter struct {
	store Store
}

func newAnalyticsStoreAdapter(store Store) services.AnalyticsStore {
	return &analyticsStoreAdapter{store: store}
}

func (a *analyticsStoreAdapter) GetScale(id string) (*services.Scale, error) {
	return convertAPIScale(a.store.GetScale(id)), nil
}

func (a *analyticsStoreAdapter) ListItems(scaleID string) ([]*services.Item, error) {
	items := a.store.ListItems(scaleID)
	out := make([]*services.Item, 0, len(items))
	for _, it := range items {
		out = append(out, convertAPIItem(it))
	}
	return out, nil
}

func (a *analyticsStoreAdapter) ListResponsesByScale(scaleID string) ([]*services.Response, error) {
	rs := a.store.ListResponsesByScale(scaleID)
	out := make([]*services.Response, 0, len(rs))
	for _, r := range rs {
		out = append(out, &services.Response{ParticipantID: r.ParticipantID, ItemID: r.ItemID, RawValue: r.RawValue, ScoreValue: r.ScoreValue, SubmittedAt: r.SubmittedAt, RawJSON: r.RawJSON})
	}
	return out, nil
}

var _ services.AnalyticsStore = (*analyticsStoreAdapter)(nil)
