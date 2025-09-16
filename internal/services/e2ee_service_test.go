package services

import (
	"encoding/base64"
	"errors"
	"strings"
	"testing"
	"time"
)

type stubE2EEStore struct {
	scale         *Scale
	projectKeys   []*ProjectKey
	e2eeResponses []*E2EEResponse
	allowExport   bool
	exportJob     *ExportJob
	recentJob     *ExportJob
	appendSuccess bool
	appendErr     error
	allowErr      error
	createErr     error
	getJobErr     error
}

func (s *stubE2EEStore) GetScale(id string) (*Scale, error) {
	if s.scale != nil && s.scale.ID == id {
		copy := *s.scale
		return &copy, nil
	}
	return nil, nil
}

func (s *stubE2EEStore) ListProjectKeys(scaleID string) ([]*ProjectKey, error) {
	return s.projectKeys, nil
}

func (s *stubE2EEStore) AddProjectKey(k *ProjectKey) error {
	s.projectKeys = append(s.projectKeys, k)
	return nil
}

func (s *stubE2EEStore) AddE2EEResponse(r *E2EEResponse) error {
	s.e2eeResponses = append(s.e2eeResponses, r)
	return nil
}

func (s *stubE2EEStore) ListE2EEResponses(scaleID string) ([]*E2EEResponse, error) {
	return s.e2eeResponses, nil
}

func (s *stubE2EEStore) AppendE2EEEncDEK(responseID string, encDEK string) (bool, error) {
	return s.appendSuccess, s.appendErr
}

func (s *stubE2EEStore) AllowExport(tid string, d time.Duration) (bool, error) {
	return s.allowExport, s.allowErr
}

func (s *stubE2EEStore) CreateExportJob(tid, scaleID, ip string, ttl time.Duration) (*ExportJob, error) {
	if s.createErr != nil {
		return nil, s.createErr
	}
	if s.exportJob == nil {
		s.exportJob = &ExportJob{ID: "job1", TenantID: tid, ScaleID: scaleID, Token: "tok", ExpiresAt: time.Now().Add(ttl)}
	}
	return s.exportJob, nil
}

func (s *stubE2EEStore) GetExportJob(id, token string) (*ExportJob, error) {
	return s.exportJob, s.getJobErr
}

func (s *stubE2EEStore) FindRecentExportJob(tid, scaleID, ip string, within time.Duration) (*ExportJob, error) {
	return s.recentJob, nil
}

func (s *stubE2EEStore) AddAudit(entry AuditEntry) {}

func TestE2EEServiceIntake(t *testing.T) {
	store := &stubE2EEStore{scale: &Scale{ID: "S1", TurnstileEnabled: true}}
	svc := NewE2EEService(store, nil)
	svc.tokenGenerator = func() (string, error) { return "tok", nil }
	svc.idGenerator = func() string { return "RID" }
	if sc, _ := store.GetScale("S1"); sc == nil || !sc.TurnstileEnabled {
		t.Fatalf("expected scale with turnstile enabled")
	}

	res, err := svc.IntakeResponse(IntakeResponseInput{ScaleID: "S1", Ciphertext: "ct", Nonce: "n", AADHash: "h", EncDEK: []string{"dek"}}, func(string) (bool, error) { return true, nil })
	if err != nil {
		t.Fatalf("intake error: %v", err)
	}
	if res.ResponseID != "RID" || res.SelfToken != "tok" {
		t.Fatalf("unexpected result: %+v", res)
	}
}

func TestE2EEServiceRequestExportReuse(t *testing.T) {
	job := &ExportJob{ID: "job1", TenantID: "T1", ScaleID: "S1", Token: "tok", ExpiresAt: time.Now().Add(time.Minute)}
	store := &stubE2EEStore{
		scale:     &Scale{ID: "S1", TenantID: "T1"},
		recentJob: job,
	}
	svc := NewE2EEService(store, nil)
	res, err := svc.RequestExport(E2EEExportRequest{TenantID: "T1", ScaleID: "S1", RemoteIP: "1.1.1.1", Actor: "admin"})
	if err != nil {
		t.Fatalf("RequestExport error: %v", err)
	}
	if !strings.Contains(res.URL, "job1") {
		t.Fatalf("expected job reuse url, got %s", res.URL)
	}
}

func TestE2EEServiceDownloadBundle(t *testing.T) {
	store := &stubE2EEStore{
		scale:         &Scale{ID: "S1", TenantID: "T1"},
		e2eeResponses: []*E2EEResponse{{ResponseID: "R1"}},
	}
	svc := NewE2EEService(store, func(data []byte) (string, error) {
		return base64.StdEncoding.EncodeToString(data), nil
	})
	bundle, err := svc.DownloadExport(E2EEDownloadRequest{TenantID: "T1", ScaleID: "S1", StepUp: true, Actor: "admin"})
	if err != nil {
		t.Fatalf("DownloadExport error: %v", err)
	}
	if bundle.Signature == "" {
		t.Fatalf("expected signature")
	}
}

func TestE2EEServiceRewrapSubmit(t *testing.T) {
	store := &stubE2EEStore{scale: &Scale{ID: "S1", TenantID: "T1"}, appendSuccess: true}
	svc := NewE2EEService(store, nil)
	if err := svc.SubmitRewrap("T1", "S1", "admin", []RewrapSubmitItem{{ResponseID: "R1", EncDEKNew: "new"}}, "fp"); err != nil {
		t.Fatalf("SubmitRewrap error: %v", err)
	}
}

func TestE2EEServiceAppendError(t *testing.T) {
	store := &stubE2EEStore{scale: &Scale{ID: "S1", TenantID: "T1"}, appendSuccess: false}
	svc := NewE2EEService(store, nil)
	if err := svc.SubmitRewrap("T1", "S1", "admin", []RewrapSubmitItem{{ResponseID: "R1", EncDEKNew: "new"}}, "fp"); err == nil {
		t.Fatalf("expected error")
	}
}

func TestE2EEServiceTurnstileFail(t *testing.T) {
	store := &stubE2EEStore{scale: &Scale{ID: "S1", TurnstileEnabled: true}}
	svc := NewE2EEService(store, nil)
	_, err := svc.IntakeResponse(IntakeResponseInput{ScaleID: "S1", Ciphertext: "ct", Nonce: "n", AADHash: "h", EncDEK: []string{"dek"}}, nil)
	if !errors.Is(err, ErrTurnstileVerificationFailed) {
		t.Fatalf("expected turnstile error, got %v", err)
	}
}
