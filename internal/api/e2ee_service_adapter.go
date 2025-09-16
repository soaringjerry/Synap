package api

import (
	"time"

	"github.com/soaringjerry/Synap/internal/services"
)

type e2eeStoreAdapter struct {
	store Store
}

func newE2EEStoreAdapter(store Store) services.E2EEStore {
	return &e2eeStoreAdapter{store: store}
}

func (a *e2eeStoreAdapter) GetScale(id string) (*services.Scale, error) {
	return convertAPIScale(a.store.GetScale(id)), nil
}

func (a *e2eeStoreAdapter) ListProjectKeys(scaleID string) ([]*services.ProjectKey, error) {
	keys := a.store.ListProjectKeys(scaleID)
	out := make([]*services.ProjectKey, 0, len(keys))
	for _, k := range keys {
		out = append(out, &services.ProjectKey{ScaleID: k.ScaleID, Algorithm: k.Algorithm, KDF: k.KDF, PublicKey: k.PublicKey, Fingerprint: k.Fingerprint, CreatedAt: k.CreatedAt, Disabled: k.Disabled})
	}
	return out, nil
}

func (a *e2eeStoreAdapter) AddProjectKey(k *services.ProjectKey) error {
	a.store.AddProjectKey(&ProjectKey{ScaleID: k.ScaleID, Algorithm: k.Algorithm, KDF: k.KDF, PublicKey: k.PublicKey, Fingerprint: k.Fingerprint, CreatedAt: k.CreatedAt, Disabled: k.Disabled})
	return nil
}

func (a *e2eeStoreAdapter) AddE2EEResponse(r *services.E2EEResponse) error {
	a.store.AddE2EEResponse(&E2EEResponse{ScaleID: r.ScaleID, ResponseID: r.ResponseID, Ciphertext: r.Ciphertext, Nonce: r.Nonce, AADHash: r.AADHash, EncDEK: r.EncDEK, PMKFingerprint: r.PMKFingerprint, CreatedAt: r.CreatedAt, SelfToken: r.SelfToken})
	return nil
}

func (a *e2eeStoreAdapter) ListE2EEResponses(scaleID string) ([]*services.E2EEResponse, error) {
	rs := a.store.ListE2EEResponses(scaleID)
	out := make([]*services.E2EEResponse, 0, len(rs))
	for _, r := range rs {
		out = append(out, &services.E2EEResponse{ScaleID: r.ScaleID, ResponseID: r.ResponseID, Ciphertext: r.Ciphertext, Nonce: r.Nonce, AADHash: r.AADHash, EncDEK: r.EncDEK, PMKFingerprint: r.PMKFingerprint, CreatedAt: r.CreatedAt, SelfToken: r.SelfToken})
	}
	return out, nil
}

func (a *e2eeStoreAdapter) AppendE2EEEncDEK(responseID string, encDEK string) (bool, error) {
	return a.store.AppendE2EEEncDEK(responseID, encDEK), nil
}

func (a *e2eeStoreAdapter) AllowExport(tid string, d time.Duration) (bool, error) {
	return a.store.AllowExport(tid, d), nil
}

func (a *e2eeStoreAdapter) CreateExportJob(tid, scaleID, ip string, ttl time.Duration) (*services.ExportJob, error) {
	job := a.store.CreateExportJob(tid, scaleID, ip, ttl)
	if job == nil {
		return nil, nil
	}
	return &services.ExportJob{ID: job.ID, TenantID: job.TenantID, ScaleID: job.ScaleID, Token: job.Token, RequestIP: job.RequestIP, CreatedAt: job.CreatedAt, ExpiresAt: job.ExpiresAt}, nil
}

func (a *e2eeStoreAdapter) GetExportJob(id, token string) (*services.ExportJob, error) {
	job := a.store.GetExportJob(id, token)
	if job == nil {
		return nil, nil
	}
	return &services.ExportJob{ID: job.ID, TenantID: job.TenantID, ScaleID: job.ScaleID, Token: job.Token, RequestIP: job.RequestIP, CreatedAt: job.CreatedAt, ExpiresAt: job.ExpiresAt}, nil
}

func (a *e2eeStoreAdapter) FindRecentExportJob(tid, scaleID, ip string, within time.Duration) (*services.ExportJob, error) {
	job := a.store.FindRecentExportJob(tid, scaleID, ip, within)
	if job == nil {
		return nil, nil
	}
	return &services.ExportJob{ID: job.ID, TenantID: job.TenantID, ScaleID: job.ScaleID, Token: job.Token, RequestIP: job.RequestIP, CreatedAt: job.CreatedAt, ExpiresAt: job.ExpiresAt}, nil
}

func (a *e2eeStoreAdapter) AddAudit(entry services.AuditEntry) {
	a.store.AddAudit(AuditEntry{Time: entry.Time, Actor: entry.Actor, Action: entry.Action, Target: entry.Target, Note: entry.Note})
}

var _ services.E2EEStore = (*e2eeStoreAdapter)(nil)
