package services

import (
	"crypto/sha256"
	"encoding/base64"
	"strings"
	"time"

	"github.com/google/uuid"
)

type ConsentStore interface {
	GetScale(id string) (*Scale, error)
	AddConsentRecord(cr *ConsentRecord) error
	AddAudit(entry AuditEntry)
}

type ConsentService struct {
	store ConsentStore
	now   func() time.Time
	idGen func() string
}

type ConsentSignRequest struct {
	ScaleID       string
	Version       string
	Locale        string
	Choices       map[string]bool
	SignedAt      string
	SignatureKind string
	Evidence      string
}

type ConsentSignResult struct {
	ID   string
	Hash string
}

func NewConsentService(store ConsentStore) *ConsentService {
	return &ConsentService{
		store: store,
		now:   func() time.Time { return time.Now().UTC() },
		idGen: func() string { return consentID(12) },
	}
}

func (s *ConsentService) Sign(req ConsentSignRequest) (*ConsentSignResult, error) {
	if req.ScaleID == "" {
		return nil, NewInvalidError("scale_id required")
	}
	sc, err := s.store.GetScale(req.ScaleID)
	if err != nil {
		return nil, err
	}
	if sc == nil {
		return nil, NewNotFoundError("scale not found")
	}
	sum := sha256.Sum256([]byte(req.Evidence))
	hash := base64.StdEncoding.EncodeToString(sum[:])
	signedAt := s.now()
	if req.SignedAt != "" {
		if t, err := time.Parse(time.RFC3339, req.SignedAt); err == nil {
			signedAt = t
		}
	}
	choices := req.Choices
	if sc.E2EEEnabled {
		choices = nil
	}
	id := s.idGen()
	cr := &ConsentRecord{ID: id, ScaleID: req.ScaleID, Version: req.Version, Choices: choices, Locale: req.Locale, SignedAt: signedAt, Hash: hash}
	if err := s.store.AddConsentRecord(cr); err != nil {
		return nil, err
	}
	s.store.AddAudit(AuditEntry{Time: s.now(), Actor: "participant", Action: "consent_sign", Target: req.ScaleID, Note: id})
	return &ConsentSignResult{ID: id, Hash: hash}, nil
}

func consentID(n int) string {
	return strings.ReplaceAll(uuid.NewString(), "-", "")[:n]
}
