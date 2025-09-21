package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type E2EEStore interface {
	GetScale(id string) (*Scale, error)
	ListProjectKeys(scaleID string) ([]*ProjectKey, error)
	AddProjectKey(k *ProjectKey) error
	AddE2EEResponse(r *E2EEResponse) error
	ListE2EEResponses(scaleID string) ([]*E2EEResponse, error)
	AppendE2EEEncDEK(responseID string, encDEK string) (bool, error)
	AllowExport(tid string, minInterval time.Duration) (bool, error)
	CreateExportJob(tid, scaleID, ip string, ttl time.Duration) (*ExportJob, error)
	GetExportJob(id, token string) (*ExportJob, error)
	FindRecentExportJob(tid, scaleID, ip string, within time.Duration) (*ExportJob, error)
	AddAudit(entry AuditEntry)
}

type TurnstileVerifier func(token string) (bool, error)

type ExportSigner func(data []byte) (string, error)

type E2EEService struct {
	store          E2EEStore
	now            func() time.Time
	sign           ExportSigner
	idGenerator    func() string
	tokenGenerator func() (string, error)
}

type ProjectKeyInput struct {
	Algorithm   string
	KDF         string
	PublicKey   string
	Fingerprint string
}

type IntakeResponseInput struct {
	ScaleID        string
	ResponseID     string
	Ciphertext     string
	Nonce          string
	AADHash        string
	EncDEK         []string
	PMKFingerprint string
	TurnstileToken string
}

type IntakeResponseResult struct {
	ResponseID string
	SelfToken  string
}

type ExportRequestResult struct {
	URL       string
	ExpiresAt time.Time
}

type ExportBundle struct {
	Manifest  map[string]any
	Signature string
	Responses []*E2EEResponse
}

type RewrapItem struct {
	ResponseID string   `json:"response_id"`
	EncDEK     []string `json:"enc_dek"`
}

type RewrapJobResult struct {
	ScaleID string       `json:"scale_id"`
	FromFP  string       `json:"from_fp"`
	ToFP    string       `json:"to_fp"`
	Items   []RewrapItem `json:"items"`
}

type RewrapSubmitItem struct {
	ResponseID string
	EncDEKNew  string
}

type E2EEExportRequest struct {
	TenantID string
	ScaleID  string
	RemoteIP string
	Actor    string
}

type E2EEDownloadRequest struct {
	TenantID string
	ScaleID  string
	JobID    string
	JobToken string
	Actor    string
	StepUp   bool
}

func NewE2EEService(store E2EEStore, signer ExportSigner) *E2EEService {
	return &E2EEService{
		store: store,
		now:   func() time.Time { return time.Now().UTC() },
		sign:  signer,
		idGenerator: func() string {
			return randomID(12)
		},
		tokenGenerator: generateSelfToken,
	}
}

func (s *E2EEService) WithSigner(fn ExportSigner) {
	s.sign = fn
}

func randomID(n int) string {
	// generate n bytes; base64url-encode yields length >= n for any n
	r := randomBytes(n)
	if len(r) < n {
		// very unlikely, but guard to avoid panic if encoder returns shorter than expected
		return r
	}
	return r[:n]
}

func randomBytes(n int) string {
	buf := make([]byte, n)
	_, _ = rand.Read(buf)
	return base64.RawURLEncoding.EncodeToString(buf)
}

func generateSelfToken() (string, error) {
	rb := make([]byte, 24)
	if _, err := rand.Read(rb); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(rb), nil
}

func (s *E2EEService) ListProjectKeys(scaleID string) ([]*ProjectKey, error) {
	return s.store.ListProjectKeys(scaleID)
}

func (s *E2EEService) AddProjectKey(tenantID, scaleID string, in ProjectKeyInput) error {
	sc, err := s.store.GetScale(scaleID)
	if err != nil {
		return err
	}
	if sc == nil || sc.TenantID != tenantID {
		return NewForbiddenError("forbidden")
	}
	return s.store.AddProjectKey(&ProjectKey{ScaleID: scaleID, Algorithm: in.Algorithm, KDF: in.KDF, PublicKey: in.PublicKey, Fingerprint: in.Fingerprint, CreatedAt: s.now()})
}

func (s *E2EEService) IntakeResponse(in IntakeResponseInput, verifier TurnstileVerifier) (*IntakeResponseResult, error) {
	if in.ScaleID == "" || in.Ciphertext == "" || in.Nonce == "" || len(in.EncDEK) == 0 {
		return nil, NewInvalidError("invalid payload")
	}
	sc, err := s.store.GetScale(in.ScaleID)
	if err != nil {
		return nil, err
	}
	if sc == nil {
		return nil, NewNotFoundError("scale not found")
	}
	if sc.TurnstileEnabled {
		if verifier == nil {
			return nil, ErrTurnstileVerificationFailed
		}
		ok, err := verifier(in.TurnstileToken)
		if err != nil || !ok {
			return nil, ErrTurnstileVerificationFailed
		}
	}
	rid := in.ResponseID
	if strings.TrimSpace(rid) == "" {
		rid = s.idGenerator()
	}
	tok, err := s.tokenGenerator()
	if err != nil {
		return nil, err
	}
	e2 := &E2EEResponse{
		ScaleID:        in.ScaleID,
		ResponseID:     rid,
		Ciphertext:     in.Ciphertext,
		Nonce:          in.Nonce,
		AADHash:        in.AADHash,
		EncDEK:         in.EncDEK,
		PMKFingerprint: in.PMKFingerprint,
		CreatedAt:      s.now(),
		SelfToken:      tok,
	}
	if err := s.store.AddE2EEResponse(e2); err != nil {
		return nil, err
	}
	return &IntakeResponseResult{ResponseID: rid, SelfToken: tok}, nil
}

func (s *E2EEService) RequestExport(params E2EEExportRequest) (*ExportRequestResult, error) {
	sc, err := s.store.GetScale(params.ScaleID)
	if err != nil {
		return nil, err
	}
	if sc == nil || sc.TenantID != params.TenantID {
		return nil, NewForbiddenError("forbidden")
	}
	if job, err := s.store.FindRecentExportJob(params.TenantID, params.ScaleID, params.RemoteIP, 30*time.Second); err != nil {
		return nil, err
	} else if job != nil {
		url := fmt.Sprintf("/api/exports/e2ee?job=%s&token=%s", job.ID, job.Token)
		s.store.AddAudit(AuditEntry{Time: s.now(), Actor: params.Actor, Action: "export_e2ee_reuse", Target: params.ScaleID, Note: job.ID})
		return &ExportRequestResult{URL: url, ExpiresAt: job.ExpiresAt}, nil
	}
	allowed, err := s.store.AllowExport(params.TenantID, 5*time.Second)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, NewTooManyRequestsError("too many requests")
	}
	job, err := s.store.CreateExportJob(params.TenantID, params.ScaleID, params.RemoteIP, 5*time.Minute)
	if err != nil {
		return nil, err
	}
	s.store.AddAudit(AuditEntry{Time: s.now(), Actor: params.Actor, Action: "export_e2ee_request", Target: params.ScaleID, Note: job.ID})
	url := fmt.Sprintf("/api/exports/e2ee?job=%s&token=%s", job.ID, job.Token)
	return &ExportRequestResult{URL: url, ExpiresAt: job.ExpiresAt}, nil
}

func (s *E2EEService) DownloadExport(params E2EEDownloadRequest) (*ExportBundle, error) {
	if params.JobID != "" {
		return s.downloadJob(params)
	}
	if !params.StepUp {
		return nil, NewForbiddenError("step-up required")
	}
	sc, err := s.store.GetScale(params.ScaleID)
	if err != nil {
		return nil, err
	}
	if sc == nil || sc.TenantID != params.TenantID {
		return nil, NewForbiddenError("forbidden")
	}
	rs, err := s.store.ListE2EEResponses(params.ScaleID)
	if err != nil {
		return nil, err
	}
	return s.buildBundle(params.Actor, params.ScaleID, rs)
}

func (s *E2EEService) downloadJob(params E2EEDownloadRequest) (*ExportBundle, error) {
	job, err := s.store.GetExportJob(params.JobID, params.JobToken)
	if err != nil {
		return nil, err
	}
	if job == nil || job.TenantID != params.TenantID {
		return nil, NewForbiddenError("invalid or expired job")
	}
	rs, err := s.store.ListE2EEResponses(job.ScaleID)
	if err != nil {
		return nil, err
	}
	return s.buildBundle(params.Actor, job.ScaleID, rs)
}

func (s *E2EEService) buildBundle(actor, scaleID string, responses []*E2EEResponse) (*ExportBundle, error) {
	manifest := map[string]any{
		"version":    1,
		"type":       "e2ee-bundle",
		"scale_id":   scaleID,
		"count":      len(responses),
		"created_at": s.now().Format(time.RFC3339),
	}
	mb, err := jsonMarshal(manifest)
	if err != nil {
		return nil, err
	}
	sig := ""
	if s.sign != nil {
		if sig, err = s.sign(mb); err != nil {
			return nil, err
		}
	}
	h := sha256Sum(mb)
	s.store.AddAudit(AuditEntry{Time: s.now(), Actor: actor, Action: "export_e2ee_download", Target: scaleID, Note: base64.StdEncoding.EncodeToString(h[:])})
	return &ExportBundle{Manifest: manifest, Signature: sig, Responses: responses}, nil
}

func (s *E2EEService) ListRewrapItems(tenantID, scaleID, fromFP, toFP string) (*RewrapJobResult, error) {
	sc, err := s.store.GetScale(scaleID)
	if err != nil {
		return nil, err
	}
	if sc == nil || sc.TenantID != tenantID {
		return nil, NewForbiddenError("forbidden")
	}
	rs, err := s.store.ListE2EEResponses(scaleID)
	if err != nil {
		return nil, err
	}
	items := make([]RewrapItem, 0, len(rs))
	for _, r := range rs {
		items = append(items, RewrapItem{ResponseID: r.ResponseID, EncDEK: r.EncDEK})
	}
	return &RewrapJobResult{ScaleID: scaleID, FromFP: fromFP, ToFP: toFP, Items: items}, nil
}

func (s *E2EEService) SubmitRewrap(tenantID, scaleID, actor string, items []RewrapSubmitItem, toFP string) error {
	sc, err := s.store.GetScale(scaleID)
	if err != nil {
		return err
	}
	if sc == nil || sc.TenantID != tenantID {
		return NewForbiddenError("forbidden")
	}
	for _, it := range items {
		if ok, err := s.store.AppendE2EEEncDEK(it.ResponseID, it.EncDEKNew); err != nil {
			return err
		} else if !ok {
			return NewNotFoundError("response not found")
		}
	}
	s.store.AddAudit(AuditEntry{Time: s.now(), Actor: actor, Action: "rewrap_submit", Target: scaleID, Note: toFP})
	return nil
}

func jsonMarshal(v any) ([]byte, error) {
	return json.Marshal(v)
}

func sha256Sum(b []byte) [32]byte {
	return sha256.Sum256(b)
}
