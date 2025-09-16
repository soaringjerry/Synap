package api

import "time"

type Store interface {
	AddScale(sc *Scale)
	UpdateScale(sc *Scale) bool
	DeleteScale(id string) bool
	GetScale(id string) *Scale
	ListScalesByTenant(tid string) []*Scale

	AddItem(it *Item)
	UpdateItem(it *Item) bool
	DeleteItem(id string) bool
	GetItem(id string) *Item
	ListItems(scaleID string) []*Item
	ReorderItems(scaleID string, order []string) bool

	AddParticipant(p *Participant)
	GetParticipant(id string) *Participant
	GetParticipantByEmail(email string) *Participant
	DeleteParticipantByID(id string, hard bool) bool
	DeleteParticipantByEmail(email string, hard bool) bool
	ExportParticipantByEmail(email string) ([]*Response, *Participant)

	AddResponses(rs []*Response)
	ListResponsesByScale(scaleID string) []*Response
	ListResponsesByParticipant(pid string) []*Response
	DeleteResponsesByScale(scaleID string) int

	AddE2EEResponse(r *E2EEResponse)
	GetE2EEResponse(responseID string) *E2EEResponse
	ListE2EEResponses(scaleID string) []*E2EEResponse
	ListAllE2EEResponses() []*E2EEResponse
	AppendE2EEEncDEK(responseID string, encDEK string) bool
	DeleteE2EEResponse(responseID string) bool

	AddProjectKey(k *ProjectKey)
	ListProjectKeys(scaleID string) []*ProjectKey

	AddConsentRecord(cr *ConsentRecord)
	GetConsentByID(id string) *ConsentRecord

	AddAudit(e AuditEntry)
	ListAudit() []AuditEntry

	AllowExport(tid string, minInterval time.Duration) bool
	CreateExportJob(tid, scaleID, ip string, ttl time.Duration) *ExportJob
	GetExportJob(id, token string) *ExportJob
	FindRecentExportJob(tid, scaleID, ip string, within time.Duration) *ExportJob

	GetAIConfig(tenantID string) *TenantAIConfig
	UpsertAIConfig(cfg *TenantAIConfig)

	AddTenant(t *Tenant)
	AddUser(u *User)
	FindUserByEmail(email string) *User
}

var _ Store = (*memoryStore)(nil)
