package api

import "github.com/soaringjerry/Synap/internal/services"

type responseStoreAdapter struct {
	store Store
}

func newResponseStoreAdapter(store Store) services.BulkResponseStore {
	return &responseStoreAdapter{store: store}
}

func (a *responseStoreAdapter) GetScale(id string) *services.Scale {
	sc := a.store.GetScale(id)
	if sc == nil {
		return nil
	}
	return &services.Scale{
		ID:               sc.ID,
		Points:           sc.Points,
		E2EEEnabled:      sc.E2EEEnabled,
		TurnstileEnabled: sc.TurnstileEnabled,
	}
}

func (a *responseStoreAdapter) GetItem(id string) *services.Item {
	it := a.store.GetItem(id)
	if it == nil {
		return nil
	}
	return &services.Item{
		ID:            it.ID,
		Type:          it.Type,
		ReverseScored: it.ReverseScored,
	}
}

func (a *responseStoreAdapter) GetConsentByID(id string) *services.ConsentRecord {
	cr := a.store.GetConsentByID(id)
	if cr == nil {
		return nil
	}
	return &services.ConsentRecord{ID: cr.ID, ScaleID: cr.ScaleID}
}

func (a *responseStoreAdapter) AddParticipant(p *services.Participant) (*services.Participant, error) {
	ap := &Participant{ID: p.ID, Email: p.Email, ConsentID: p.ConsentID}
	a.store.AddParticipant(ap)
	return &services.Participant{ID: ap.ID, Email: ap.Email, ConsentID: ap.ConsentID, SelfToken: ap.SelfToken}, nil
}

func (a *responseStoreAdapter) AddResponses(rs []*services.Response) error {
	if len(rs) == 0 {
		a.store.AddResponses(nil)
		return nil
	}
	out := make([]*Response, 0, len(rs))
	for _, r := range rs {
		out = append(out, &Response{
			ParticipantID: r.ParticipantID,
			ItemID:        r.ItemID,
			RawValue:      r.RawValue,
			ScoreValue:    r.ScoreValue,
			SubmittedAt:   r.SubmittedAt,
			RawJSON:       r.RawJSON,
		})
	}
	a.store.AddResponses(out)
	return nil
}
