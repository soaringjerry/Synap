package services

import (
	"testing"
	"time"
)

type stubParticipantStore struct {
	participants map[string]*Participant
	responses    map[string][]*Response
	e2ee         map[string]*E2EEResponse
	deleted      map[string]bool
}

func newStubParticipantStore() *stubParticipantStore {
	return &stubParticipantStore{
		participants: map[string]*Participant{},
		responses:    map[string][]*Response{},
		e2ee:         map[string]*E2EEResponse{},
		deleted:      map[string]bool{},
	}
}

func (s *stubParticipantStore) GetParticipant(id string) (*Participant, error) {
	if p, ok := s.participants[id]; ok {
		copy := *p
		return &copy, nil
	}
	return nil, nil
}

func (s *stubParticipantStore) GetParticipantByEmail(email string) (*Participant, error) {
	for _, p := range s.participants {
		if p.Email == email {
			copy := *p
			return &copy, nil
		}
	}
	return nil, nil
}

func (s *stubParticipantStore) ListResponsesByParticipant(id string) ([]*Response, error) {
	return s.responses[id], nil
}

func (s *stubParticipantStore) DeleteParticipantByID(id string, hard bool) (bool, error) {
	if _, ok := s.participants[id]; !ok {
		return false, nil
	}
	s.deleted[id] = hard
	delete(s.participants, id)
	return true, nil
}

func (s *stubParticipantStore) GetE2EEResponse(id string) (*E2EEResponse, error) {
	if r, ok := s.e2ee[id]; ok {
		copy := *r
		return &copy, nil
	}
	return nil, nil
}

func (s *stubParticipantStore) DeleteE2EEResponse(id string) (bool, error) {
	if _, ok := s.e2ee[id]; !ok {
		return false, nil
	}
	s.deleted[id] = true
	delete(s.e2ee, id)
	return true, nil
}

func (s *stubParticipantStore) AddAudit(entry AuditEntry) {}

func TestParticipantDataService(t *testing.T) {
	store := newStubParticipantStore()
	store.participants["P1"] = &Participant{ID: "P1", Email: "p@example.com", SelfToken: "tok"}
	store.responses["P1"] = []*Response{{ParticipantID: "P1", ItemID: "I1", ScoreValue: 3}}
	store.e2ee["R1"] = &E2EEResponse{ResponseID: "R1", SelfToken: "tok2", CreatedAt: time.Now()}

	svc := NewParticipantDataService(store)

	exp, err := svc.ExportParticipant("P1", "tok")
	if err != nil {
		t.Fatalf("ExportParticipant error: %v", err)
	}
	if exp.Participant["email"].(string) != "p@example.com" {
		t.Fatalf("unexpected participant email: %v", exp.Participant)
	}

	if _, err := svc.ExportParticipant("P1", "wrong"); err == nil {
		t.Fatalf("expected forbidden error")
	}

	if err := svc.DeleteParticipant("P1", "tok", true); err != nil {
		t.Fatalf("DeleteParticipant error: %v", err)
	}
	if _, ok := store.deleted["P1"]; !ok {
		t.Fatalf("participant not deleted")
	}

	e2ee, err := svc.ExportE2EE("R1", "tok2")
	if err != nil || e2ee.ResponseID != "R1" {
		t.Fatalf("ExportE2EE failed: %v %+v", err, e2ee)
	}

	if err := svc.DeleteE2EE("R1", "tok2"); err != nil {
		t.Fatalf("DeleteE2EE error: %v", err)
	}
	if err := svc.DeleteE2EE("R1", "tok2"); err == nil || err.Error() != "forbidden" {
		t.Fatalf("expected forbidden after deletion, got %v", err)
	}
}
