package services

import (
	"encoding/json"
	"errors"
	"testing"
	"time"
)

type stubBulkStore struct {
	scale        *Scale
	items        map[string]*Item
	consents     map[string]*ConsentRecord
	participants []*Participant
	responses    []*Response
}

func (s *stubBulkStore) GetScale(id string) *Scale {
	if s.scale != nil && s.scale.ID == id {
		return s.scale
	}
	return nil
}

func (s *stubBulkStore) GetItem(id string) *Item {
	if it, ok := s.items[id]; ok {
		return it
	}
	return nil
}

func (s *stubBulkStore) GetConsentByID(id string) *ConsentRecord {
	if c, ok := s.consents[id]; ok {
		return c
	}
	return nil
}

func (s *stubBulkStore) AddParticipant(p *Participant) (*Participant, error) {
	cp := *p
	if cp.SelfToken == "" {
		cp.SelfToken = "tok123"
	}
	s.participants = append(s.participants, &cp)
	return &cp, nil
}

func (s *stubBulkStore) AddResponses(rs []*Response) error {
	s.responses = append(s.responses, rs...)
	return nil
}

func TestProcessBulkResponsesSuccess(t *testing.T) {
	store := &stubBulkStore{
		scale: &Scale{ID: "S1", Points: 5},
		items: map[string]*Item{
			"I1": {ID: "I1", Type: "likert"},
			"I2": {ID: "I2", Type: "likert", ReverseScored: true},
			"I3": {ID: "I3", Type: "short_text"},
		},
		consents: map[string]*ConsentRecord{
			"C1": {ID: "C1", ScaleID: "S1"},
		},
	}

	svc := NewResponseService(store)
	svc.now = func() time.Time { return time.Date(2025, 9, 17, 0, 0, 0, 0, time.UTC) }
	svc.idGenerator = func() string { return "PID123456789" }

	var (
		likertRaw  json.RawMessage = []byte("\"3\"")
		reverseRaw                 = 4
		nonNumeric json.RawMessage = []byte("\"free text\"")
	)

	result, err := svc.ProcessBulkResponses(BulkResponsesRequest{
		ScaleID:          "S1",
		ParticipantEmail: "p@example.com",
		ConsentID:        "C1",
		Answers: []BulkAnswer{
			{ItemID: "I1", Raw: likertRaw},
			{ItemID: "I2", RawInt: &reverseRaw},
			{ItemID: "I3", Raw: nonNumeric},
			{ItemID: "UNKNOWN"},
		},
	})
	if err != nil {
		t.Fatalf("ProcessBulkResponses returned error: %v", err)
	}
	if result.ParticipantID != "PID123456789" {
		t.Fatalf("participant id = %q, want PID123456789", result.ParticipantID)
	}
	if result.SelfToken != "tok123" {
		t.Fatalf("self token = %q, want tok123", result.SelfToken)
	}
	if result.ResponsesCount != 3 {
		t.Fatalf("responses count = %d, want 3", result.ResponsesCount)
	}

	if len(store.participants) != 1 {
		t.Fatalf("participants stored = %d, want 1", len(store.participants))
	}
	if got := store.participants[0].ConsentID; got != "C1" {
		t.Fatalf("participant consent id = %q, want C1", got)
	}

	if len(store.responses) != 3 {
		t.Fatalf("responses stored = %d, want 3", len(store.responses))
	}

	resp1 := store.responses[0]
	if resp1.RawValue != 3 || resp1.ScoreValue != 3 {
		t.Fatalf("resp1 values = (%d,%d), want (3,3)", resp1.RawValue, resp1.ScoreValue)
	}
	if resp1.RawJSON != "\"3\"" {
		t.Fatalf("resp1 raw json = %q, want \"\\\"3\\\"\"", resp1.RawJSON)
	}

	resp2 := store.responses[1]
	if resp2.RawValue != 4 || resp2.ScoreValue != 2 {
		t.Fatalf("resp2 values = (%d,%d), want (4,2)", resp2.RawValue, resp2.ScoreValue)
	}
	if resp2.RawJSON != "4" {
		t.Fatalf("resp2 raw json = %q, want 4", resp2.RawJSON)
	}

	resp3 := store.responses[2]
	if resp3.RawValue != 0 || resp3.ScoreValue != 0 {
		t.Fatalf("resp3 values = (%d,%d), want (0,0)", resp3.RawValue, resp3.ScoreValue)
	}
	if resp3.RawJSON != "\"free text\"" {
		t.Fatalf("resp3 raw json = %q, want \"\\\"free text\\\"\"", resp3.RawJSON)
	}
}

func TestProcessBulkResponsesTurnstileFailure(t *testing.T) {
	store := &stubBulkStore{scale: &Scale{ID: "S1", Points: 5, TurnstileEnabled: true}}
	svc := NewResponseService(store)

	_, err := svc.ProcessBulkResponses(BulkResponsesRequest{
		ScaleID: "S1",
		VerifyTurnstile: func(string) (bool, error) {
			return false, nil
		},
	})
	if !errors.Is(err, ErrTurnstileVerificationFailed) {
		t.Fatalf("expected turnstile failure, got %v", err)
	}
}

func TestProcessBulkResponsesE2EEDisabled(t *testing.T) {
	store := &stubBulkStore{scale: &Scale{ID: "S1", Points: 5, E2EEEnabled: true}}
	svc := NewResponseService(store)

	_, err := svc.ProcessBulkResponses(BulkResponsesRequest{ScaleID: "S1"})
	if !errors.Is(err, ErrPlaintextDisabled) {
		t.Fatalf("expected plaintext disabled error, got %v", err)
	}
}

func TestProcessBulkResponsesScaleMissing(t *testing.T) {
	svc := NewResponseService(&stubBulkStore{})

	_, err := svc.ProcessBulkResponses(BulkResponsesRequest{ScaleID: "missing"})
	if !errors.Is(err, ErrScaleNotFound) {
		t.Fatalf("expected scale not found error, got %v", err)
	}
}

func TestNumericRangeValidation(t *testing.T) {
	store := &stubBulkStore{
		scale: &Scale{ID: "S1", Points: 5},
		items: map[string]*Item{
			"L1": {ID: "L1", Type: "likert"},
			"N1": {ID: "N1", Type: "numeric", Min: 10, Max: 20},
		},
		consents: map[string]*ConsentRecord{"C1": {ID: "C1", ScaleID: "S1"}},
	}
	svc := NewResponseService(store)
	svc.idGenerator = func() string { return "PID" }

	outOfRange := 7 // likert > 5
	belowMin := 5   // numeric < 10

	_, err := svc.ProcessBulkResponses(BulkResponsesRequest{
		ScaleID:   "S1",
		ConsentID: "C1",
		Answers: []BulkAnswer{
			{ItemID: "L1", RawInt: &outOfRange},
			{ItemID: "N1", RawInt: &belowMin},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(store.responses) != 2 {
		t.Fatalf("responses stored=%d, want 2", len(store.responses))
	}
	if store.responses[0].RawValue != 0 || store.responses[0].ScoreValue != 0 || store.responses[0].RawJSON != "7" {
		t.Fatalf("likert out-of-range not preserved as raw json; got (%d,%d,%q)", store.responses[0].RawValue, store.responses[0].ScoreValue, store.responses[0].RawJSON)
	}
	if store.responses[1].RawValue != 0 || store.responses[1].ScoreValue != 0 || store.responses[1].RawJSON != "5" {
		t.Fatalf("numeric out-of-range not preserved as raw json; got (%d,%d,%q)", store.responses[1].RawValue, store.responses[1].ScoreValue, store.responses[1].RawJSON)
	}
}
