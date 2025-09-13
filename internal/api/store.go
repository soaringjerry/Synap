package api

import (
	"sort"
	"strings"
	"sync"
	"time"
)

type Scale struct {
	ID        string            `json:"id"`
	TenantID  string            `json:"tenant_id,omitempty"`
	Points    int               `json:"points"`
	Randomize bool              `json:"randomize"`
	NameI18n  map[string]string `json:"name_i18n,omitempty"`
}

type Item struct {
	ID            string            `json:"id"`
	ScaleID       string            `json:"scale_id"`
	ReverseScored bool              `json:"reverse_scored"`
	StemI18n      map[string]string `json:"stem_i18n"`
}

type Participant struct {
	ID    string `json:"id"`
	Email string `json:"email,omitempty"`
}

type Response struct {
	ParticipantID string    `json:"participant_id"`
	ItemID        string    `json:"item_id"`
	RawValue      int       `json:"raw_value"`
	ScoreValue    int       `json:"score_value"`
	SubmittedAt   time.Time `json:"submitted_at"`
}

type memoryStore struct {
	mu           sync.RWMutex
	scales       map[string]*Scale
	items        map[string]*Item
	itemsByScale map[string][]*Item
	participants map[string]*Participant
	responses    []*Response
	tenants      map[string]*Tenant
	usersByEmail map[string]*User
	audit        []AuditEntry
}

func newMemoryStore() *memoryStore {
	return &memoryStore{
		scales:       map[string]*Scale{},
		items:        map[string]*Item{},
		itemsByScale: map[string][]*Item{},
		participants: map[string]*Participant{},
		responses:    []*Response{},
		tenants:      map[string]*Tenant{},
		usersByEmail: map[string]*User{},
		audit:        []AuditEntry{},
	}
}

func (s *memoryStore) addScale(sc *Scale) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.scales[sc.ID] = sc
}

func (s *memoryStore) addItem(it *Item) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.items[it.ID] = it
	s.itemsByScale[it.ScaleID] = append(s.itemsByScale[it.ScaleID], it)
	// keep stable order by id
	sort.Slice(s.itemsByScale[it.ScaleID], func(i, j int) bool { return s.itemsByScale[it.ScaleID][i].ID < s.itemsByScale[it.ScaleID][j].ID })
}

func (s *memoryStore) listItems(scaleID string) []*Item {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]*Item(nil), s.itemsByScale[scaleID]...)
}

func (s *memoryStore) getScale(id string) *Scale {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.scales[id]
}

func (s *memoryStore) addParticipant(p *Participant) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.participants[p.ID] = p
}

func (s *memoryStore) addResponses(rs []*Response) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.responses = append(s.responses, rs...)
}

func (s *memoryStore) listResponsesByScale(scaleID string) []*Response {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Response, 0, len(s.responses))
	// filter by item scale
	for _, r := range s.responses {
		it := s.items[r.ItemID]
		if it != nil && it.ScaleID == scaleID {
			out = append(out, r)
		}
	}
	return out
}

// cleanup responses before cutoff time, return removed count
func (s *memoryStore) cleanupBefore(cutoff time.Time) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	removed := 0
	nr := make([]*Response, 0, len(s.responses))
	for _, r := range s.responses {
		if r.SubmittedAt.Before(cutoff) {
			removed++
			continue
		}
		nr = append(nr, r)
	}
	s.responses = nr
	return removed
}

// audit log
type AuditEntry struct {
	Time   time.Time `json:"time"`
	Actor  string    `json:"actor"`
	Action string    `json:"action"`
	Target string    `json:"target"`
	Note   string    `json:"note,omitempty"`
}

func (s *memoryStore) addAudit(e AuditEntry) {
	s.mu.Lock()
	s.audit = append(s.audit, e)
	s.mu.Unlock()
}
func (s *memoryStore) listAudit() []AuditEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AuditEntry, len(s.audit))
	copy(out, s.audit)
	return out
}

// participant-scope helpers
func (s *memoryStore) exportParticipantByEmail(email string) ([]*Response, *Participant) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var p *Participant
	for _, v := range s.participants {
		if v.Email != "" && strings.EqualFold(v.Email, email) {
			p = v
			break
		}
	}
	if p == nil {
		return nil, nil
	}
	rs := []*Response{}
	for _, r := range s.responses {
		if r.ParticipantID == p.ID {
			rs = append(rs, r)
		}
	}
	return rs, p
}
func (s *memoryStore) deleteParticipantByEmail(email string, hard bool) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	var pid string
	for id, v := range s.participants {
		if v.Email != "" && strings.EqualFold(v.Email, email) {
			pid = id
			break
		}
	}
	if pid == "" {
		return false
	}
	// delete responses for pid
	nr := make([]*Response, 0, len(s.responses))
	for _, r := range s.responses {
		if r.ParticipantID != pid {
			nr = append(nr, r)
		}
	}
	s.responses = nr
	if hard {
		delete(s.participants, pid)
	}
	return true
}

// tenants & users (multi-tenant scaffolding)
type Tenant struct{ ID, Name string }
type User struct {
	ID        string
	Email     string
	PassHash  []byte
	TenantID  string
	CreatedAt time.Time
}

func (s *memoryStore) addTenant(t *Tenant) { s.mu.Lock(); defer s.mu.Unlock(); s.tenants[t.ID] = t }
func (s *memoryStore) addUser(u *User) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.usersByEmail[strings.ToLower(u.Email)] = u
}
func (s *memoryStore) findUserByEmail(email string) *User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.usersByEmail[strings.ToLower(email)]
}
func (s *memoryStore) listScalesByTenant(tid string) []*Scale {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []*Scale{}
	for _, sc := range s.scales {
		if sc.TenantID == tid {
			out = append(out, sc)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}
