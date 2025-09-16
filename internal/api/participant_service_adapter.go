package api

import "github.com/soaringjerry/Synap/internal/services"

type participantStoreAdapter struct {
	store Store
}

func newParticipantStoreAdapter(store Store) services.ParticipantStore {
	return &participantStoreAdapter{store: store}
}

func (a *participantStoreAdapter) GetParticipant(id string) (*services.Participant, error) {
	p := a.store.GetParticipant(id)
	if p == nil {
		return nil, nil
	}
	return &services.Participant{ID: p.ID, Email: p.Email, ConsentID: p.ConsentID, SelfToken: p.SelfToken}, nil
}

func (a *participantStoreAdapter) ListResponsesByParticipant(id string) ([]*services.Response, error) {
	rs := a.store.ListResponsesByParticipant(id)
	out := make([]*services.Response, 0, len(rs))
	for _, r := range rs {
		out = append(out, &services.Response{ParticipantID: r.ParticipantID, ItemID: r.ItemID, RawValue: r.RawValue, ScoreValue: r.ScoreValue, SubmittedAt: r.SubmittedAt, RawJSON: r.RawJSON})
	}
	return out, nil
}

func (a *participantStoreAdapter) DeleteParticipantByID(id string, hard bool) (bool, error) {
	return a.store.DeleteParticipantByID(id, hard), nil
}

func (a *participantStoreAdapter) GetE2EEResponse(id string) (*services.E2EEResponse, error) {
	r := a.store.GetE2EEResponse(id)
	if r == nil {
		return nil, nil
	}
	return &services.E2EEResponse{ScaleID: r.ScaleID, ResponseID: r.ResponseID, Ciphertext: r.Ciphertext, Nonce: r.Nonce, AADHash: r.AADHash, EncDEK: r.EncDEK, CreatedAt: r.CreatedAt, SelfToken: r.SelfToken}, nil
}

func (a *participantStoreAdapter) DeleteE2EEResponse(id string) (bool, error) {
	return a.store.DeleteE2EEResponse(id), nil
}

func (a *participantStoreAdapter) AddAudit(entry services.AuditEntry) {
	a.store.AddAudit(AuditEntry{Time: entry.Time, Actor: entry.Actor, Action: entry.Action, Target: entry.Target, Note: entry.Note})
}

var _ services.ParticipantStore = (*participantStoreAdapter)(nil)
