package api

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
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

	snapshotPath string
}

func newMemoryStore(path string) *memoryStore {
	return &memoryStore{
		scales:       map[string]*Scale{},
		items:        map[string]*Item{},
		itemsByScale: map[string][]*Item{},
		participants: map[string]*Participant{},
		responses:    []*Response{},
		tenants:      map[string]*Tenant{},
		usersByEmail: map[string]*User{},
		audit:        []AuditEntry{},
		snapshotPath: path,
	}
}

// newMemoryStoreFromEnv loads snapshot from SYNAP_DB_PATH if set.
func newMemoryStoreFromEnv() *memoryStore {
	path := os.Getenv("SYNAP_DB_PATH")
	if path == "" {
		return nil
	}
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	s := newMemoryStore(path)
	_ = s.load()
	return s
}

func (s *memoryStore) addScale(sc *Scale) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.scales[sc.ID] = sc
	s.saveLocked()
}

func (s *memoryStore) addItem(it *Item) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.items[it.ID] = it
	s.itemsByScale[it.ScaleID] = append(s.itemsByScale[it.ScaleID], it)
	// keep stable order by id
	sort.Slice(s.itemsByScale[it.ScaleID], func(i, j int) bool { return s.itemsByScale[it.ScaleID][i].ID < s.itemsByScale[it.ScaleID][j].ID })
	s.saveLocked()
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
	s.saveLocked()
}

func (s *memoryStore) addResponses(rs []*Response) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.responses = append(s.responses, rs...)
	s.saveLocked()
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
	s.saveLocked()
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
	s.save()
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
	s.saveLocked()
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

func (s *memoryStore) addTenant(t *Tenant) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tenants[t.ID] = t
	s.saveLocked()
}
func (s *memoryStore) addUser(u *User) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.usersByEmail[strings.ToLower(u.Email)] = u
	s.saveLocked()
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

// --- snapshot persistence (MVP JSON) ---
type snapshot struct {
	Scales       []*Scale       `json:"scales"`
	Items        []*Item        `json:"items"`
	Participants []*Participant `json:"participants"`
	Responses    []*Response    `json:"responses"`
	Tenants      []*Tenant      `json:"tenants"`
	Users        []*User        `json:"users"`
	Audit        []AuditEntry   `json:"audit"`
}

func (s *memoryStore) load() error {
	if s.snapshotPath == "" {
		return nil
	}
	b, err := os.ReadFile(s.snapshotPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	var snap snapshot
	if err := json.Unmarshal(b, &snap); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.scales = map[string]*Scale{}
	for _, sc := range snap.Scales {
		s.scales[sc.ID] = sc
	}
	s.items = map[string]*Item{}
	s.itemsByScale = map[string][]*Item{}
	for _, it := range snap.Items {
		s.items[it.ID] = it
		s.itemsByScale[it.ScaleID] = append(s.itemsByScale[it.ScaleID], it)
	}
	for k := range s.itemsByScale {
		sort.Slice(s.itemsByScale[k], func(i, j int) bool { return s.itemsByScale[k][i].ID < s.itemsByScale[k][j].ID })
	}
	s.participants = map[string]*Participant{}
	for _, p := range snap.Participants {
		s.participants[p.ID] = p
	}
	s.responses = append([]*Response(nil), snap.Responses...)
	s.tenants = map[string]*Tenant{}
	for _, t := range snap.Tenants {
		s.tenants[t.ID] = t
	}
	s.usersByEmail = map[string]*User{}
	for _, u := range snap.Users {
		s.usersByEmail[strings.ToLower(u.Email)] = u
	}
	s.audit = append([]AuditEntry(nil), snap.Audit...)
	return nil
}

func (s *memoryStore) save() {
	s.mu.RLock()
	defer s.mu.RUnlock()
	s.saveUnlocked()
}

func (s *memoryStore) saveLocked() {
	if s.snapshotPath != "" {
		s.saveUnlocked()
	}
}

func (s *memoryStore) saveUnlocked() {
	if s.snapshotPath == "" {
		return
	}
	snap := snapshot{
		Scales:       []*Scale{},
		Items:        []*Item{},
		Participants: []*Participant{},
		Responses:    []*Response{},
		Tenants:      []*Tenant{},
		Users:        []*User{},
		Audit:        append([]AuditEntry(nil), s.audit...),
	}
	for _, sc := range s.scales {
		snap.Scales = append(snap.Scales, sc)
	}
	for _, it := range s.items {
		snap.Items = append(snap.Items, it)
	}
	for _, p := range s.participants {
		snap.Participants = append(snap.Participants, p)
	}
	snap.Responses = append(snap.Responses, s.responses...)
	for _, t := range s.tenants {
		snap.Tenants = append(snap.Tenants, t)
	}
	for _, u := range s.usersByEmail {
		snap.Users = append(snap.Users, u)
	}
	_ = os.MkdirAll(filepath.Dir(s.snapshotPath), 0o755)
	tmp := s.snapshotPath + ".tmp"
	b, _ := json.MarshalIndent(&snap, "", "  ")
	_ = os.WriteFile(tmp, b, 0o644)
	_ = os.Rename(tmp, s.snapshotPath)
}
