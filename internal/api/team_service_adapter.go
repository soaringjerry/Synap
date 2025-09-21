package api

import "github.com/soaringjerry/Synap/internal/services"

type teamStoreAdapter struct{ store Store }

func newTeamStoreAdapter(store Store) services.TeamStore { return &teamStoreAdapter{store: store} }

func (a *teamStoreAdapter) GetScale(id string) (*services.Scale, error) {
	return convertAPIScale(a.store.GetScale(id)), nil
}

func (a *teamStoreAdapter) FindUserByEmail(email string) *services.User {
	u := a.store.FindUserByEmail(email)
	if u == nil {
		return nil
	}
	return &services.User{ID: u.ID, Email: u.Email, TenantID: u.TenantID, CreatedAt: u.CreatedAt}
}

func (a *teamStoreAdapter) ListScaleCollaborators(scaleID string) []services.Collaborator {
	list := a.store.ListScaleCollaborators(scaleID)
	out := make([]services.Collaborator, 0, len(list))
	for _, c := range list {
		out = append(out, services.Collaborator{UserID: c.UserID, Email: c.Email, Role: c.Role})
	}
	return out
}

func (a *teamStoreAdapter) AddScaleCollaborator(scaleID, userID, role string) bool {
	return a.store.AddScaleCollaborator(scaleID, userID, role)
}

func (a *teamStoreAdapter) RemoveScaleCollaborator(scaleID, userID string) bool {
	return a.store.RemoveScaleCollaborator(scaleID, userID)
}

func (a *teamStoreAdapter) AddAudit(entry services.AuditEntry) {
	a.store.AddAudit(AuditEntry{Time: entry.Time, Actor: entry.Actor, Action: entry.Action, Target: entry.Target, Note: entry.Note})
}
