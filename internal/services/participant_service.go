package services

import "time"

type ParticipantStore interface {
    GetParticipant(id string) (*Participant, error)
    GetParticipantByEmail(email string) (*Participant, error)
    ListResponsesByParticipant(id string) ([]*Response, error)
    DeleteParticipantByID(id string, hard bool) (bool, error)
    GetE2EEResponse(id string) (*E2EEResponse, error)
    DeleteE2EEResponse(id string) (bool, error)
    AddAudit(entry AuditEntry)
}

type E2EEResponse struct {
	ScaleID        string    `json:"scale_id"`
	ResponseID     string    `json:"response_id"`
	Ciphertext     string    `json:"ciphertext"`
	Nonce          string    `json:"nonce"`
	AADHash        string    `json:"aad_hash"`
	EncDEK         []string  `json:"enc_dek"`
	PMKFingerprint string    `json:"pmk_fingerprint"`
	CreatedAt      time.Time `json:"created_at"`
	SelfToken      string    `json:"self_token"`
}

type ParticipantDataService struct {
	store ParticipantStore
}

func NewParticipantDataService(store ParticipantStore) *ParticipantDataService {
	return &ParticipantDataService{store: store}
}

type ParticipantExport struct {
	Participant map[string]any `json:"participant"`
	Responses   []*Response    `json:"responses"`
}

func (s *ParticipantDataService) ExportParticipant(pid, token string) (*ParticipantExport, error) {
	if pid == "" || token == "" {
		return nil, NewInvalidError("pid/token required")
	}
	p, err := s.store.GetParticipant(pid)
	if err != nil {
		return nil, err
	}
	if p == nil || p.SelfToken == "" || token != p.SelfToken {
		return nil, NewForbiddenError("forbidden")
	}
	rs, err := s.store.ListResponsesByParticipant(pid)
	if err != nil {
		return nil, err
	}
	s.store.AddAudit(AuditEntry{Time: time.Now(), Actor: "participant", Action: "self_export", Target: pid})
	return &ParticipantExport{Participant: map[string]any{"id": p.ID, "email": p.Email}, Responses: rs}, nil
}

func (s *ParticipantDataService) DeleteParticipant(pid, token string, hard bool) error {
	if pid == "" || token == "" {
		return NewInvalidError("pid/token required")
	}
	p, err := s.store.GetParticipant(pid)
	if err != nil {
		return err
	}
	if p == nil || p.SelfToken == "" || token != p.SelfToken {
		return NewForbiddenError("forbidden")
	}
	ok, err := s.store.DeleteParticipantByID(pid, hard)
	if err != nil {
		return err
	}
	if !ok {
		return NewNotFoundError("not found")
	}
	s.store.AddAudit(AuditEntry{Time: time.Now(), Actor: "participant", Action: map[bool]string{true: "self_delete_hard", false: "self_delete_soft"}[hard], Target: pid})
	return nil
}

// Admin operations (by email)
func (s *ParticipantDataService) AdminExportByEmail(email, actor string) (*ParticipantExport, error) {
    if email == "" {
        return nil, NewInvalidError("email required")
    }
    p, err := s.store.GetParticipantByEmail(email)
    if err != nil {
        return nil, err
    }
    if p == nil {
        return nil, NewNotFoundError("not found")
    }
    rs, err := s.store.ListResponsesByParticipant(p.ID)
    if err != nil {
        return nil, err
    }
    s.store.AddAudit(AuditEntry{Time: time.Now(), Actor: actor, Action: "export_participant", Target: email})
    return &ParticipantExport{Participant: map[string]any{"id": p.ID, "email": p.Email}, Responses: rs}, nil
}

func (s *ParticipantDataService) AdminDeleteByEmail(email string, hard bool, actor string) error {
    if email == "" {
        return NewInvalidError("email required")
    }
    p, err := s.store.GetParticipantByEmail(email)
    if err != nil {
        return err
    }
    if p == nil {
        return NewNotFoundError("not found")
    }
    ok, err := s.store.DeleteParticipantByID(p.ID, hard)
    if err != nil {
        return err
    }
    if !ok {
        return NewNotFoundError("not found")
    }
    s.store.AddAudit(AuditEntry{Time: time.Now(), Actor: actor, Action: "delete_participant", Target: email, Note: map[bool]string{true: "hard", false: "soft"}[hard]})
    return nil
}

func (s *ParticipantDataService) ExportE2EE(responseID, token string) (*E2EEResponse, error) {
	if responseID == "" || token == "" {
		return nil, NewInvalidError("response_id/token required")
	}
	r, err := s.store.GetE2EEResponse(responseID)
	if err != nil {
		return nil, err
	}
	if r == nil || r.SelfToken == "" || token != r.SelfToken {
		return nil, NewForbiddenError("forbidden")
	}
	s.store.AddAudit(AuditEntry{Time: time.Now(), Actor: "participant", Action: "self_export_e2ee", Target: responseID})
	return r, nil
}

func (s *ParticipantDataService) DeleteE2EE(responseID, token string) error {
	if responseID == "" || token == "" {
		return NewInvalidError("response_id/token required")
	}
	r, err := s.store.GetE2EEResponse(responseID)
	if err != nil {
		return err
	}
	if r == nil || r.SelfToken == "" || token != r.SelfToken {
		return NewForbiddenError("forbidden")
	}
	ok, err := s.store.DeleteE2EEResponse(responseID)
	if err != nil {
		return err
	}
	if !ok {
		return NewNotFoundError("not found")
	}
	s.store.AddAudit(AuditEntry{Time: time.Now(), Actor: "participant", Action: "self_delete_e2ee", Target: responseID})
	return nil
}
