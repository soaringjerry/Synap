package api

import "github.com/soaringjerry/Synap/internal/services"

type consentStoreAdapter struct {
	store Store
}

func newConsentStoreAdapter(store Store) services.ConsentStore {
	return &consentStoreAdapter{store: store}
}

func (a *consentStoreAdapter) GetScale(id string) (*services.Scale, error) {
	return convertAPIScale(a.store.GetScale(id)), nil
}

func (a *consentStoreAdapter) AddConsentRecord(cr *services.ConsentRecord) error {
	// Persist full consent record details including version and hash when available
	a.store.AddConsentRecord(&ConsentRecord{
		ID:       cr.ID,
		ScaleID:  cr.ScaleID,
		Version:  cr.Version,
		Choices:  cr.Choices,
		Locale:   cr.Locale,
		SignedAt: cr.SignedAt,
		Hash:     cr.Hash,
	})
	return nil
}

func (a *consentStoreAdapter) AddAudit(entry services.AuditEntry) {
	a.store.AddAudit(AuditEntry{Time: entry.Time, Actor: entry.Actor, Action: entry.Action, Target: entry.Target, Note: entry.Note})
}

var _ services.ConsentStore = (*consentStoreAdapter)(nil)
