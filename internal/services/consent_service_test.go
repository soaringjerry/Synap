package services

import (
	"testing"
	"time"
)

type stubConsentStore struct {
	scale  *Scale
	record *ConsentRecord
}

func (s *stubConsentStore) GetScale(id string) (*Scale, error) {
	if s.scale != nil && s.scale.ID == id {
		copy := *s.scale
		return &copy, nil
	}
	return nil, nil
}

func (s *stubConsentStore) AddConsentRecord(cr *ConsentRecord) error {
	copy := *cr
	s.record = &copy
	return nil
}

func (s *stubConsentStore) AddAudit(entry AuditEntry) {}

func TestConsentServiceSign(t *testing.T) {
	store := &stubConsentStore{scale: &Scale{ID: "S1", E2EEEnabled: false}}
	svc := NewConsentService(store)
	svc.now = func() time.Time { return time.Date(2025, 9, 18, 0, 0, 0, 0, time.UTC) }
	svc.idGen = func() string { return "CONSENT" }

	res, err := svc.Sign(ConsentSignRequest{ScaleID: "S1", Version: "v1", Locale: "en", Choices: map[string]bool{"agree": true}, Evidence: "data"})
	if err != nil {
		t.Fatalf("Sign error: %v", err)
	}
	if res.ID != "CONSENT" || res.Hash == "" {
		t.Fatalf("unexpected result: %+v", res)
	}
	if store.record == nil || store.record.Locale != "en" || store.record.Version != "v1" || store.record.Hash == "" {
		t.Fatalf("record not stored")
	}
}

func TestConsentServiceSignE2EE(t *testing.T) {
	store := &stubConsentStore{scale: &Scale{ID: "S1", E2EEEnabled: true}}
	svc := NewConsentService(store)
	svc.idGen = func() string { return "CONSENT" }

	res, err := svc.Sign(ConsentSignRequest{ScaleID: "S1", Choices: map[string]bool{"agree": true}})
	if err != nil {
		t.Fatalf("Sign error: %v", err)
	}
	if store.record == nil || store.record.Choices != nil {
		t.Fatalf("expected choices to be nil for E2EE")
	}
	if res.ID != "CONSENT" {
		t.Fatalf("expected id")
	}
}

func TestConsentServiceScaleMissing(t *testing.T) {
	svc := NewConsentService(&stubConsentStore{})
	if _, err := svc.Sign(ConsentSignRequest{ScaleID: "missing"}); err == nil {
		t.Fatalf("expected error")
	}
}
