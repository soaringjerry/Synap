package services

import (
	"strings"
	"time"
)

type Collaborator struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
}

type TeamStore interface {
	GetScale(id string) (*Scale, error)
	FindUserByEmail(email string) *User
	ListScaleCollaborators(scaleID string) []Collaborator
	AddScaleCollaborator(scaleID, userID, role string) bool
	RemoveScaleCollaborator(scaleID, userID string) bool
	AddAudit(entry AuditEntry)
}

type TeamService struct{ store TeamStore }

func NewTeamService(store TeamStore) *TeamService { return &TeamService{store: store} }

func normalizeRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "viewer":
		return "viewer"
	default:
		return "editor"
	}
}

// List returns all collaborators for a scale after tenant check.
func (s *TeamService) List(tenantID, scaleID string) ([]Collaborator, error) {
	sc, err := s.store.GetScale(scaleID)
	if err != nil {
		return nil, err
	}
	if sc == nil || sc.TenantID != tenantID {
		return nil, NewForbiddenError("forbidden")
	}
	return s.store.ListScaleCollaborators(scaleID), nil
}

// Add adds a collaborator by email (must be in the same tenant) with role.
func (s *TeamService) Add(tenantID, scaleID, email, role, actor string) (*Collaborator, error) {
	sc, err := s.store.GetScale(scaleID)
	if err != nil {
		return nil, err
	}
	if sc == nil || sc.TenantID != tenantID {
		return nil, NewForbiddenError("forbidden")
	}
	u := s.store.FindUserByEmail(email)
	if u == nil || u.TenantID != tenantID {
		return nil, NewInvalidError("user not found in tenant")
	}
	role = normalizeRole(role)
	if ok := s.store.AddScaleCollaborator(scaleID, u.ID, role); !ok {
		return nil, NewInvalidError("unable to add collaborator")
	}
	s.store.AddAudit(AuditEntry{Time: time.Now().UTC(), Actor: actor, Action: "collab.add", Target: scaleID, Note: u.Email + ":" + role})
	return &Collaborator{UserID: u.ID, Email: u.Email, Role: role}, nil
}

func (s *TeamService) Remove(tenantID, scaleID, userID, actor string) error {
	sc, err := s.store.GetScale(scaleID)
	if err != nil {
		return err
	}
	if sc == nil || sc.TenantID != tenantID {
		return NewForbiddenError("forbidden")
	}
	if ok := s.store.RemoveScaleCollaborator(scaleID, userID); !ok {
		return NewNotFoundError("collaborator not found")
	}
	s.store.AddAudit(AuditEntry{Time: time.Now().UTC(), Actor: actor, Action: "collab.remove", Target: scaleID, Note: userID})
	return nil
}
