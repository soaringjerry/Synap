package api

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
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
    ID          string            `json:"id"`
    TenantID    string            `json:"tenant_id,omitempty"`
    Points      int               `json:"points"`
    Randomize   bool              `json:"randomize"`
    NameI18n    map[string]string `json:"name_i18n,omitempty"`
    ConsentI18n map[string]string `json:"consent_i18n,omitempty"`
    // CollectEmail controls whether participant email is collected: off|optional|required
    CollectEmail string `json:"collect_email,omitempty"`
    // E2EE and Region mode (project-level controls)
    E2EEEnabled bool   `json:"e2ee_enabled,omitempty"`
    Region      string `json:"region,omitempty"` // auto|gdpr|pipl|pdpa|ccpa
    // Turnstile protection (Cloudflare). When enabled and server has secret configured,
    // submissions must include a valid Turnstile token.
    TurnstileEnabled bool `json:"turnstile_enabled,omitempty"`
    // ItemsPerPage controls pagination in the survey UI. 0 or empty means no pagination (all on one page).
    ItemsPerPage int `json:"items_per_page,omitempty"`
    // Consent configuration (version + options)
    ConsentConfig *ConsentConfig `json:"consent_config,omitempty"`
	// Likert anchors (labels) and display options
	LikertLabelsI18n  map[string][]string `json:"likert_labels_i18n,omitempty"`
	LikertShowNumbers bool                `json:"likert_show_numbers,omitempty"`
	LikertPreset      string              `json:"likert_preset,omitempty"`
}

type Item struct {
	ID            string            `json:"id"`
	ScaleID       string            `json:"scale_id"`
	ReverseScored bool              `json:"reverse_scored"`
	StemI18n      map[string]string `json:"stem_i18n"`
	// Type defines the rendering/answer type (likert|single|multiple|dropdown|rating|short_text|long_text|numeric|date|time|slider)
	Type string `json:"type,omitempty"`
	// OptionsI18n for choice-based items (single/multiple/dropdown)
	OptionsI18n map[string][]string `json:"options_i18n,omitempty"`
	// PlaceholderI18n for text inputs
	PlaceholderI18n map[string]string `json:"placeholder_i18n,omitempty"`
	// Validation / range
	Min  int `json:"min,omitempty"`
	Max  int `json:"max,omitempty"`
	Step int `json:"step,omitempty"`
	// Required indicates the question must be answered
	Required bool `json:"required,omitempty"`
	// Likert per-item anchors (optional; fallback to scale-level when empty)
	LikertLabelsI18n  map[string][]string `json:"likert_labels_i18n,omitempty"`
	LikertShowNumbers bool                `json:"likert_show_numbers,omitempty"`
}

type Participant struct {
	ID    string `json:"id"`
	Email string `json:"email,omitempty"`
	// SelfToken is a capability to export/delete own data (GDPR self-service)
	SelfToken string `json:"self_token,omitempty"`
	// ConsentID links to a ConsentRecord.ID if provided at submission time
	ConsentID string `json:"consent_id,omitempty"`
}

type Response struct {
	ParticipantID string    `json:"participant_id"`
	ItemID        string    `json:"item_id"`
	RawValue      int       `json:"raw_value"`
	ScoreValue    int       `json:"score_value"`
	SubmittedAt   time.Time `json:"submitted_at"`
	// RawJSON stores the raw answer for non-numeric types (JSON-encoded string/array/value)
	RawJSON string `json:"raw_json,omitempty"`
}

// TenantAIConfig stores per-tenant AI provider settings.
type TenantAIConfig struct {
	TenantID      string `json:"tenant_id"`
	OpenAIKey     string `json:"openai_key,omitempty"`
	OpenAIBase    string `json:"openai_base,omitempty"`
	AllowExternal bool   `json:"allow_external"`
	StoreLogs     bool   `json:"store_logs"`
}

// Consent configuration (per scale)
type ConsentOptionConf struct {
	Key       string            `json:"key"`
	LabelI18n map[string]string `json:"label_i18n,omitempty"`
	Required  bool              `json:"required"`
	Group     int               `json:"group,omitempty"`
}
type ConsentConfig struct {
	Version           string              `json:"version"`
	Options           []ConsentOptionConf `json:"options,omitempty"`
	SignatureRequired bool                `json:"signature_required,omitempty"`
}

// E2EEResponse stores end-to-end encrypted submission payloads (content-level encrypted on client).
type E2EEResponse struct {
	ScaleID        string    `json:"scale_id"`
	ResponseID     string    `json:"response_id"`
	Ciphertext     string    `json:"ciphertext"` // opaque string (base64 or compact JSON) from client
	Nonce          string    `json:"nonce"`
	AADHash        string    `json:"aad_hash"`
	EncDEK         []string  `json:"enc_dek"` // array of envelope-wrapped DEKs
	PMKFingerprint string    `json:"pmk_fingerprint"`
	CreatedAt      time.Time `json:"created_at"`
	// SelfToken allows the submitter to export/delete their own encrypted response
	SelfToken string `json:"self_token,omitempty"`
}

// ProjectKey stores registered public keys for E2EE per scale/project.
type ProjectKey struct {
	ScaleID     string    `json:"scale_id"`
	Algorithm   string    `json:"alg"`         // x25519+xchacha20 | rsa+aesgcm
	KDF         string    `json:"kdf"`         // hkdf-sha256
	PublicKey   string    `json:"public_key"`  // PEM or base64 (opaque to server)
	Fingerprint string    `json:"fingerprint"` // client-provided
	CreatedAt   time.Time `json:"created_at"`
	Disabled    bool      `json:"disabled"`
}

type memoryStore struct {
	e2ee         []*E2EEResponse
	mu           sync.RWMutex
	scales       map[string]*Scale
	items        map[string]*Item
	itemsByScale map[string][]*Item
	participants map[string]*Participant
	responses    []*Response
	tenants      map[string]*Tenant
	usersByEmail map[string]*User
	aiConfigs    map[string]*TenantAIConfig
	audit        []AuditEntry

	projectKeys  map[string][]*ProjectKey
	snapshotPath string
	encKey       []byte

	// ephemeral export jobs and throttling (in-memory only)
	exportJobs map[string]*ExportJob
	lastExport map[string]time.Time // per-tenant last export time

	consents []*ConsentRecord
}

func newMemoryStore(path string) *memoryStore {
	return &memoryStore{
		e2ee:         []*E2EEResponse{},
		scales:       map[string]*Scale{},
		items:        map[string]*Item{},
		itemsByScale: map[string][]*Item{},
		participants: map[string]*Participant{},
		responses:    []*Response{},
		tenants:      map[string]*Tenant{},
		usersByEmail: map[string]*User{},
		aiConfigs:    map[string]*TenantAIConfig{},
		audit:        []AuditEntry{},
		snapshotPath: path,
		projectKeys:  map[string][]*ProjectKey{},
		exportJobs:   map[string]*ExportJob{},
		lastExport:   map[string]time.Time{},
		consents:     []*ConsentRecord{},
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
	// Load/derive encryption key (env, file, or optional autogenerate)
	s.encKey = loadOrAutogenEncKey()
	if len(s.encKey) != 32 {
		// Encryption key missing or invalid — disable persistence to avoid plaintext storage
		// Start in-memory only to comply with "encrypted at rest" requirement.
		return nil
	}
	_ = s.load()
	return s
}

func (s *memoryStore) addScale(sc *Scale) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.scales[sc.ID] = sc
	s.saveLocked()
}

func (s *memoryStore) updateScale(sc *Scale) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	old := s.scales[sc.ID]
	if old == nil {
		return false
	}
	// Update allowed fields
	if sc.NameI18n != nil {
		old.NameI18n = sc.NameI18n
	}
	if sc.Points != 0 {
		old.Points = sc.Points
	}
	old.Randomize = sc.Randomize
	if sc.ConsentI18n != nil {
		old.ConsentI18n = sc.ConsentI18n
	}
	if sc.CollectEmail != "" {
		old.CollectEmail = sc.CollectEmail
	}
	// Region update (E2EEEnabled toggled in router to avoid unintended zeroing)
	if sc.Region != "" {
		old.Region = sc.Region
	}
	// Turnstile toggle (explicit assignment; default true is handled by creator UI)
	if sc.TurnstileEnabled != old.TurnstileEnabled {
		old.TurnstileEnabled = sc.TurnstileEnabled
	}
    if sc.ConsentConfig != nil {
        old.ConsentConfig = sc.ConsentConfig
    }
    // ItemsPerPage: allow explicit zero to disable pagination
    old.ItemsPerPage = sc.ItemsPerPage
    s.saveLocked()
    return true
}

// deleteScale removes the scale, its items, and responses associated with those items
func (s *memoryStore) deleteScale(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.scales[id] == nil {
		return false
	}
	// collect item IDs
	itemIDs := map[string]struct{}{}
	for _, it := range s.itemsByScale[id] {
		itemIDs[it.ID] = struct{}{}
		delete(s.items, it.ID)
	}
	delete(s.itemsByScale, id)
	delete(s.scales, id)
	// filter responses not belonging to removed items
	nr := make([]*Response, 0, len(s.responses))
	for _, r := range s.responses {
		if _, ok := itemIDs[r.ItemID]; !ok {
			nr = append(nr, r)
		}
	}
	s.responses = nr
	s.saveLocked()
	return true
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

func (s *memoryStore) updateItem(it *Item) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	old := s.items[it.ID]
	if old == nil {
		return false
	}
	// allow updating stems and reverse flag; keep same scale
	if it.StemI18n != nil {
		old.StemI18n = it.StemI18n
	}
	old.ReverseScored = it.ReverseScored
	if it.Type != "" {
		old.Type = it.Type
	}
	if it.OptionsI18n != nil {
		old.OptionsI18n = it.OptionsI18n
	}
	if it.PlaceholderI18n != nil {
		old.PlaceholderI18n = it.PlaceholderI18n
	}
	if it.Min != 0 || it.Max != 0 || it.Step != 0 {
		// set individually to allow zero values intentionally
		if it.Min != 0 {
			old.Min = it.Min
		}
		if it.Max != 0 {
			old.Max = it.Max
		}
		if it.Step != 0 {
			old.Step = it.Step
		}
	}
	old.Required = it.Required
	if it.LikertLabelsI18n != nil {
		old.LikertLabelsI18n = it.LikertLabelsI18n
	}
	// LikertShowNumbers is a bool; to allow explicit false we copy when type matches
	// Note: zero value false is valid; we simply assign
	if it.Type == "likert" || it.LikertShowNumbers || (!it.LikertShowNumbers && old.LikertShowNumbers) {
		old.LikertShowNumbers = it.LikertShowNumbers
	}
	s.saveLocked()
	return true
}

func (s *memoryStore) deleteItem(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	it := s.items[id]
	if it == nil {
		return false
	}
	// remove from items map
	delete(s.items, id)
	// remove from itemsByScale slice
	if list := s.itemsByScale[it.ScaleID]; len(list) > 0 {
		nl := make([]*Item, 0, len(list))
		for _, x := range list {
			if x.ID != id {
				nl = append(nl, x)
			}
		}
		s.itemsByScale[it.ScaleID] = nl
	}
	// remove responses for this item
	nr := make([]*Response, 0, len(s.responses))
	for _, r := range s.responses {
		if r.ItemID != id {
			nr = append(nr, r)
		}
	}
	s.responses = nr
	s.saveLocked()
	return true
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
	if p.SelfToken == "" {
		// generate secure token
		rb := make([]byte, 24)
		_, _ = rand.Read(rb)
		p.SelfToken = base64.RawURLEncoding.EncodeToString(rb)
	}
	s.participants[p.ID] = p
	s.saveLocked()
}

func (s *memoryStore) addResponses(rs []*Response) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.responses = append(s.responses, rs...)
	s.saveLocked()
}

func (s *memoryStore) addE2EEResponse(r *E2EEResponse) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.e2ee = append(s.e2ee, r)
	s.saveLocked()
}

func (s *memoryStore) listE2EEResponses(scaleID string) []*E2EEResponse {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*E2EEResponse, 0)
	for _, r := range s.e2ee {
		if r.ScaleID == scaleID {
			out = append(out, r)
		}
	}
	return out
}

func (s *memoryStore) addProjectKey(k *ProjectKey) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.projectKeys[k.ScaleID] = append(s.projectKeys[k.ScaleID], k)
	s.saveLocked()
}

func (s *memoryStore) listProjectKeys(scaleID string) []*ProjectKey {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]*ProjectKey(nil), s.projectKeys[scaleID]...)
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

// deleteResponsesByScale removes all responses (plain and E2EE) for a scale. Returns removed count.
func (s *memoryStore) deleteResponsesByScale(scaleID string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	removed := 0
	// plain responses: filter by item scale
	nr := make([]*Response, 0, len(s.responses))
	for _, r := range s.responses {
		it := s.items[r.ItemID]
		if it != nil && it.ScaleID == scaleID {
			removed++
			continue
		}
		nr = append(nr, r)
	}
	s.responses = nr
	// E2EE responses by scale
	ne := make([]*E2EEResponse, 0, len(s.e2ee))
	for _, e := range s.e2ee {
		if e.ScaleID == scaleID {
			removed++
			continue
		}
		ne = append(ne, e)
	}
	s.e2ee = ne
	s.saveLocked()
	return removed
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

// deleteParticipantByID deletes responses for a participant and optionally anonymizes/removes the participant record
func (s *memoryStore) deleteParticipantByID(pid string, hard bool) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.participants[pid]; !ok {
		return false
	}
	// remove responses for this participant
	nr := make([]*Response, 0, len(s.responses))
	for _, r := range s.responses {
		if r.ParticipantID != pid {
			nr = append(nr, r)
		}
	}
	s.responses = nr
	if hard {
		delete(s.participants, pid)
	} else {
		// anonymize email
		if p := s.participants[pid]; p != nil {
			p.Email = ""
		}
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
	Scales        []*Scale                 `json:"scales"`
	Items         []*Item                  `json:"items"`
	Participants  []*Participant           `json:"participants"`
	Responses     []*Response              `json:"responses"`
	ResponsesE2EE []*E2EEResponse          `json:"responses_e2ee"`
	ProjectKeys   map[string][]*ProjectKey `json:"project_keys"`
	Tenants       []*Tenant                `json:"tenants"`
	Users         []*User                  `json:"users"`
	AIConfigs     []*TenantAIConfig        `json:"ai_configs"`
	Audit         []AuditEntry             `json:"audit"`
	Consents      []*ConsentRecord         `json:"consents"`
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
	// Attempt encrypted load first
	if len(b) > 8 && string(b[:8]) == "SYNAPENC" {
		db, derr := s.decrypt(b)
		if derr != nil {
			return derr
		}
		b = db
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
	s.e2ee = append([]*E2EEResponse(nil), snap.ResponsesE2EE...)
	if snap.ProjectKeys != nil {
		s.projectKeys = snap.ProjectKeys
	} else {
		s.projectKeys = map[string][]*ProjectKey{}
	}
	s.tenants = map[string]*Tenant{}
	for _, t := range snap.Tenants {
		s.tenants[t.ID] = t
	}
	s.usersByEmail = map[string]*User{}
	for _, u := range snap.Users {
		s.usersByEmail[strings.ToLower(u.Email)] = u
	}
	s.aiConfigs = map[string]*TenantAIConfig{}
	for _, a := range snap.AIConfigs {
		s.aiConfigs[a.TenantID] = a
	}
	s.audit = append([]AuditEntry(nil), snap.Audit...)
	s.consents = append([]*ConsentRecord(nil), snap.Consents...)
	// If file was plaintext and we have encKey, save back encrypted
	if len(s.encKey) == 32 && !(len(b) > 8 && string(b[:8]) == "SYNAPENC") {
		s.saveUnlocked()
	}
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
		Scales:        []*Scale{},
		Items:         []*Item{},
		Participants:  []*Participant{},
		Responses:     []*Response{},
		ResponsesE2EE: []*E2EEResponse{},
		ProjectKeys:   map[string][]*ProjectKey{},
		Tenants:       []*Tenant{},
		Users:         []*User{},
		AIConfigs:     []*TenantAIConfig{},
		Audit:         append([]AuditEntry(nil), s.audit...),
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
	snap.ResponsesE2EE = append(snap.ResponsesE2EE, s.e2ee...)
	snap.ProjectKeys = s.projectKeys
	for _, t := range s.tenants {
		snap.Tenants = append(snap.Tenants, t)
	}
	for _, u := range s.usersByEmail {
		snap.Users = append(snap.Users, u)
	}
	for _, a := range s.aiConfigs {
		snap.AIConfigs = append(snap.AIConfigs, a)
	}
	snap.Consents = append(snap.Consents, s.consents...)
	_ = os.MkdirAll(filepath.Dir(s.snapshotPath), 0o755)
	tmp := s.snapshotPath + ".tmp"
	b, _ := json.MarshalIndent(&snap, "", "  ")
	// Encrypt if key is available
	if len(s.encKey) == 32 {
		if eb, err := s.encrypt(b); err == nil {
			b = eb
		}
	}
	_ = os.WriteFile(tmp, b, 0o600)
	_ = os.Rename(tmp, s.snapshotPath)
}

// --- Export jobs (ephemeral) ---
type ExportJob struct {
	ID        string
	TenantID  string
	ScaleID   string
	Token     string
	RequestIP string
	CreatedAt time.Time
	ExpiresAt time.Time
}

// Consent records (evidence without storing signature image)
type ConsentRecord struct {
	ID       string          `json:"id"`
	ScaleID  string          `json:"scale_id"`
	Version  string          `json:"version"`
	Choices  map[string]bool `json:"choices"`
	Locale   string          `json:"locale"`
	SignedAt time.Time       `json:"signed_at"`
	Hash     string          `json:"hash"` // sha256 base64 of client evidence JSON
}

func (s *memoryStore) getConsentByID(id string) *ConsentRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, c := range s.consents {
		if c.ID == id {
			return c
		}
	}
	return nil
}

func (s *memoryStore) addConsentRecord(cr *ConsentRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.consents = append(s.consents, cr)
	s.saveLocked()
}

func (s *memoryStore) createExportJob(tid, scaleID, ip string, ttl time.Duration) *ExportJob {
	s.mu.Lock()
	defer s.mu.Unlock()
	// prune expired
	now := time.Now()
	for id, j := range s.exportJobs {
		if now.After(j.ExpiresAt) {
			delete(s.exportJobs, id)
		}
	}
	// generate id + token
	rb := make([]byte, 12)
	_, _ = rand.Read(rb)
	id := base64.RawURLEncoding.EncodeToString(rb)
	tb := make([]byte, 24)
	_, _ = rand.Read(tb)
	tok := base64.RawURLEncoding.EncodeToString(tb)
	job := &ExportJob{ID: id, TenantID: tid, ScaleID: scaleID, Token: tok, RequestIP: ip, CreatedAt: now, ExpiresAt: now.Add(ttl)}
	s.exportJobs[id] = job
	return job
}

func (s *memoryStore) getExportJob(id, token string) *ExportJob {
	s.mu.RLock()
	job := s.exportJobs[id]
	s.mu.RUnlock()
	if job == nil {
		return nil
	}
	if time.Now().After(job.ExpiresAt) {
		return nil
	}
	if token == "" || token != job.Token {
		return nil
	}
	return job
}

func (s *memoryStore) allowExport(tid string, minInterval time.Duration) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	last := s.lastExport[tid]
	if !last.IsZero() && time.Since(last) < minInterval {
		return false
	}
	s.lastExport[tid] = time.Now()
	return true
}

// --- Encryption helpers (AES-256-GCM with random nonce) ---
func deriveEncKey(s string) []byte {
	// Try base64 first
	if kb, err := base64.StdEncoding.DecodeString(s); err == nil && (len(kb) == 32) {
		return kb
	}
	// Fallback: sha256 of raw string
	sum := sha256.Sum256([]byte(s))
	b := make([]byte, 32)
	copy(b, sum[:])
	return b
}

// loadOrAutogenEncKey loads the encryption key from:
// 1) SYNAP_ENC_KEY
// 2) SYNAP_ENC_KEY_FILE (read file content)
// 3) SYNAP_ENC_AUTOGEN_FILE (generate base64 key on first run, write 0600, then read)
// Returns 32-byte key or nil if not available.
func loadOrAutogenEncKey() []byte {
	if key := os.Getenv("SYNAP_ENC_KEY"); key != "" {
		return deriveEncKey(key)
	}
	if f := os.Getenv("SYNAP_ENC_KEY_FILE"); f != "" {
		if b, err := os.ReadFile(f); err == nil {
			return deriveEncKey(strings.TrimSpace(string(b)))
		}
	}
	if f := os.Getenv("SYNAP_ENC_AUTOGEN_FILE"); f != "" {
		if b, err := os.ReadFile(f); err == nil {
			return deriveEncKey(strings.TrimSpace(string(b)))
		}
		// Generate and persist (0600)
		kb := make([]byte, 32)
		if _, err := rand.Read(kb); err == nil {
			enc := base64.StdEncoding.EncodeToString(kb)
			_ = os.MkdirAll(filepath.Dir(f), 0o755)
			_ = os.WriteFile(f, []byte(enc+"\n"), 0o600)
			return deriveEncKey(enc)
		}
	}
	return nil
}

func (s *memoryStore) encrypt(plain []byte) ([]byte, error) {
	if len(s.encKey) != 32 {
		return nil, errors.New("encryption key missing")
	}
	block, err := aes.NewCipher(s.encKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	ct := gcm.Seal(nil, nonce, plain, nil)
	out := make([]byte, 0, 8+len(nonce)+len(ct))
	out = append(out, []byte("SYNAPENC")...)
	out = append(out, nonce...)
	out = append(out, ct...)
	return out, nil
}

func (s *memoryStore) decrypt(enc []byte) ([]byte, error) {
	if len(s.encKey) != 32 {
		return nil, errors.New("decryption key missing")
	}
	if len(enc) < 8 {
		return nil, errors.New("invalid blob")
	}
	hdr := enc[:8]
	if string(hdr) != "SYNAPENC" {
		return nil, errors.New("not encrypted")
	}
	block, err := aes.NewCipher(s.encKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(enc) < 8+gcm.NonceSize()+1 {
		return nil, errors.New("invalid size")
	}
	nonce := enc[8 : 8+gcm.NonceSize()]
	ct := enc[8+gcm.NonceSize():]
	return gcm.Open(nil, nonce, ct, nil)
}

// AI config helpers
func (s *memoryStore) getAIConfig(tenantID string) *TenantAIConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.aiConfigs[tenantID]
}
func (s *memoryStore) upsertAIConfig(cfg *TenantAIConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if cfg.TenantID == "" {
		return
	}
	if old := s.aiConfigs[cfg.TenantID]; old != nil {
		if cfg.OpenAIKey != "" {
			old.OpenAIKey = cfg.OpenAIKey
		}
		if cfg.OpenAIBase != "" {
			old.OpenAIBase = cfg.OpenAIBase
		}
		old.AllowExternal = cfg.AllowExternal
		old.StoreLogs = cfg.StoreLogs
	} else {
		s.aiConfigs[cfg.TenantID] = cfg
	}
	s.saveLocked()
}
