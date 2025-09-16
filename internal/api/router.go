package api

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/soaringjerry/Synap/internal/middleware"
	"github.com/soaringjerry/Synap/internal/services"
)

type Router struct {
	store          Store
	signPriv       ed25519.PrivateKey
	responseSvc    *services.ResponseService
	scaleSvc       *services.ScaleService
	authSvc        *services.AuthService
	exportSvc      *services.ExportService
	participantSvc *services.ParticipantDataService
	translationSvc *services.TranslationService
}

func NewRouterWithStore(store Store) *Router {
	if store == nil {
		log.Printf("persistence disabled: using in-memory store")
		store = newMemoryStore("")
	}
	return &Router{
		store:          store,
		signPriv:       deriveSignKey(),
		responseSvc:    services.NewResponseService(newResponseStoreAdapter(store)),
		scaleSvc:       services.NewScaleService(newScaleStoreAdapter(store)),
		authSvc:        services.NewAuthService(newAuthStoreAdapter(store), middleware.SignToken),
		exportSvc:      services.NewExportService(newExportStoreAdapter(store)),
		participantSvc: services.NewParticipantDataService(newParticipantStoreAdapter(store)),
		translationSvc: services.NewTranslationService(newTranslationStoreAdapter(store), http.DefaultClient),
	}
}

func NewRouter() *Router {
	// Optionally load snapshot from disk via SYNAP_DB_PATH (MVP persistence)
	// If empty or unavailable, fall back to pure in-memory.
	store, err := NewMemoryStoreFromEnv()
	if err != nil {
		log.Printf("failed to load legacy store: %v", err)
	}
	return NewRouterWithStore(store)
}

func deriveSignKey() ed25519.PrivateKey {
	seedB64 := strings.TrimSpace(os.Getenv("SYNAP_SIGN_SEED"))
	if seedB64 != "" {
		if seed, err := base64.StdEncoding.DecodeString(seedB64); err == nil && len(seed) == ed25519.SeedSize {
			return ed25519.NewKeyFromSeed(seed)
		}
	}
	seed := make([]byte, ed25519.SeedSize)
	if _, err := rand.Read(seed); err == nil {
		return ed25519.NewKeyFromSeed(seed)
	}
	return nil
}

func (rt *Router) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/seed", rt.handleSeed) // POST
	mux.Handle("/api/scales", middleware.WithAuth(http.HandlerFunc(rt.handleScales)))
	mux.Handle("/api/items", middleware.WithAuth(http.HandlerFunc(rt.handleItems)))
	mux.HandleFunc("/api/scales/", rt.handleScaleScoped)
	mux.HandleFunc("/api/scale/", rt.handleScaleMeta) // public metadata
	mux.HandleFunc("/api/responses/bulk", rt.handleBulkResponses)
	mux.Handle("/api/export", middleware.WithAuth(http.HandlerFunc(rt.handleExport)))       // GET (auth)
	mux.Handle("/api/metrics/alpha", middleware.WithAuth(http.HandlerFunc(rt.handleAlpha))) // GET (auth)
	mux.HandleFunc("/api/auth/register", rt.handleRegister)
	mux.HandleFunc("/api/auth/login", rt.handleLogin)
	mux.HandleFunc("/api/auth/logout", rt.handleLogout)
	mux.Handle("/api/admin/scales", middleware.WithAuth(http.HandlerFunc(rt.handleAdminScales)))
	mux.Handle("/api/admin/stats", middleware.WithAuth(http.HandlerFunc(rt.handleAdminStats)))
	mux.Handle("/api/admin/analytics/summary", middleware.WithAuth(http.HandlerFunc(rt.handleAdminAnalyticsSummary)))
	// Admin: scale & item management
	mux.Handle("/api/admin/scales/", middleware.WithAuth(http.HandlerFunc(rt.handleAdminScaleOps)))
	mux.Handle("/api/admin/items/", middleware.WithAuth(http.HandlerFunc(rt.handleAdminItemOps)))
	// Participant data rights (admin-triggered for now)
	mux.Handle("/api/admin/participant/export", middleware.WithAuth(http.HandlerFunc(rt.handleExportParticipant)))
	mux.Handle("/api/admin/participant/delete", middleware.WithAuth(http.HandlerFunc(rt.handleDeleteParticipant)))
	mux.Handle("/api/admin/audit", middleware.WithAuth(http.HandlerFunc(rt.handleAudit)))
	// AI config + translation preview
	mux.Handle("/api/admin/ai/config", middleware.WithAuth(http.HandlerFunc(rt.handleAdminAIConfig)))
	mux.Handle("/api/admin/ai/translate/preview", middleware.WithAuth(http.HandlerFunc(rt.handleAdminAITranslatePreview)))
	// E2EE project keys: GET (public), POST (auth) — WithAuth attaches claims when present (non-blocking for GET)
	mux.Handle("/api/projects/", middleware.WithAuth(http.HandlerFunc(rt.handleProjectKeys)))
	// E2EE encrypted responses (public submission)
	mux.HandleFunc("/api/responses/e2ee", rt.handleE2EEResponse)
	// Export encrypted bundle (auth + step-up header)
	mux.Handle("/api/exports/e2ee", middleware.WithAuth(http.HandlerFunc(rt.handleExportE2EE)))
	// Rewrap (auth)
	mux.Handle("/api/rewrap/jobs", middleware.WithAuth(http.HandlerFunc(rt.handleRewrapJobs)))
	mux.Handle("/api/rewrap/submit", middleware.WithAuth(http.HandlerFunc(rt.handleRewrapSubmit)))
	// GDPR self-service for participants
	mux.HandleFunc("/api/self/participant/export", rt.handleSelfExportParticipant) // GET
	mux.HandleFunc("/api/self/participant/delete", rt.handleSelfDeleteParticipant) // POST
	mux.HandleFunc("/api/self/e2ee/export", rt.handleSelfExportE2EE)               // GET (single response)
	mux.HandleFunc("/api/self/e2ee/delete", rt.handleSelfDeleteE2EE)               // POST
	// Consent signature evidence
	mux.HandleFunc("/api/consent/sign", rt.handleConsentSign) // POST
}

// POST /api/seed — create a sample scale+items
func (rt *Router) handleSeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Ensure a demo tenant exists for persistent stores that enforce tenant FK.
	demoTenantID := "DEMO"
	rt.store.AddTenant(&Tenant{ID: demoTenantID, Name: "Demo"})

	sc := &Scale{ID: "SAMPLE", TenantID: demoTenantID, Points: 5, Randomize: false, NameI18n: map[string]string{"en": "Sample Scale", "zh": "示例量表"}}
	// Upsert-like behavior: if exists, keep; else add
	if rt.store.GetScale(sc.ID) == nil {
		rt.store.AddScale(sc)
	}
	items := []*Item{
		{ID: "I1", ScaleID: sc.ID, ReverseScored: false, StemI18n: map[string]string{"en": "I am satisfied with my current study progress.", "zh": "我对当前学习进度感到满意"}},
		{ID: "I2", ScaleID: sc.ID, ReverseScored: true, StemI18n: map[string]string{"en": "I enjoy working under pressure.", "zh": "我喜欢在压力下工作"}},
		{ID: "I3", ScaleID: sc.ID, ReverseScored: false, StemI18n: map[string]string{"en": "I can stay focused on tasks.", "zh": "我能专注于手头任务"}},
	}
	for _, it := range items {
		// Avoid duplicate append in itemsByScale; only add if not present
		if rt.store.GetItem(it.ID) == nil {
			rt.store.AddItem(it)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "scale_id": sc.ID, "items": items})
}

// POST /api/scales
func (rt *Router) handleScales(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tid, ok := middleware.TenantIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	// Decode into raw first to detect presence of optional flags
	var raw map[string]any
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	created, err := rt.scaleSvc.CreateScale(tid, raw)
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(created)
}

// POST /api/items
func (rt *Router) handleItems(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tid, ok := middleware.TenantIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var it services.Item
	if err := json.NewDecoder(r.Body).Decode(&it); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	created, err := rt.scaleSvc.CreateItem(tid, &it)
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(created)
}

// GET /api/scales/{id}/items?lang=xx
func (rt *Router) handleScaleScoped(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/scales/") {
		http.NotFound(w, r)
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/api/scales/")
	parts := strings.Split(rest, "/")
	if len(parts) < 2 || parts[1] != "items" {
		http.NotFound(w, r)
		return
	}
	id := parts[0]
	lang := r.URL.Query().Get("lang")
	if lang == "" {
		lang = "en"
	}
	items := rt.store.ListItems(id)
	type outItem struct {
		ID            string   `json:"id"`
		ReverseScored bool     `json:"reverse_scored"`
		Stem          string   `json:"stem"`
		Type          string   `json:"type,omitempty"`
		Options       []string `json:"options,omitempty"`
		Min           int      `json:"min,omitempty"`
		Max           int      `json:"max,omitempty"`
		Step          int      `json:"step,omitempty"`
		Required      bool     `json:"required,omitempty"`
		Placeholder   string   `json:"placeholder,omitempty"`
		LikertLabels  []string `json:"likert_labels,omitempty"`
		LikertShowNum bool     `json:"likert_show_numbers,omitempty"`
	}
	out := make([]outItem, 0, len(items))
	for _, it := range items {
		stem := it.StemI18n[lang]
		if stem == "" {
			stem = it.StemI18n["en"]
		}
		opts := []string(nil)
		if it.OptionsI18n != nil {
			if v := it.OptionsI18n[lang]; len(v) > 0 {
				opts = v
			} else if v := it.OptionsI18n["en"]; len(v) > 0 {
				opts = v
			}
		}
		ph := ""
		if it.PlaceholderI18n != nil {
			ph = it.PlaceholderI18n[lang]
			if ph == "" {
				ph = it.PlaceholderI18n["en"]
			}
		}
		// Likert labels (per-item, fallback handled client-side using scale meta)
		var likertLabels []string
		if it.Type == "likert" && it.LikertLabelsI18n != nil {
			if v := it.LikertLabelsI18n[lang]; len(v) > 0 {
				likertLabels = v
			} else if v := it.LikertLabelsI18n["en"]; len(v) > 0 {
				likertLabels = v
			}
		}
		out = append(out, outItem{
			ID:            it.ID,
			ReverseScored: it.ReverseScored,
			Stem:          stem,
			Type:          it.Type,
			Options:       opts,
			Min:           it.Min,
			Max:           it.Max,
			Step:          it.Step,
			Required:      it.Required,
			Placeholder:   ph,
			LikertLabels:  likertLabels,
			LikertShowNum: it.LikertShowNumbers,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"scale_id": id, "items": out})
}

// GET /api/scale/{id} -> public scale metadata (name_i18n, points, consent_i18n, randomize)
func (rt *Router) handleScaleMeta(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/scale/")
	if id == "" {
		http.NotFound(w, r)
		return
	}
	sc := rt.store.GetScale(id)
	if sc == nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"id":                sc.ID,
		"name_i18n":         sc.NameI18n,
		"points":            sc.Points,
		"randomize":         sc.Randomize,
		"consent_i18n":      sc.ConsentI18n,
		"collect_email":     sc.CollectEmail,
		"e2ee_enabled":      sc.E2EEEnabled,
		"region":            sc.Region,
		"turnstile_enabled": sc.TurnstileEnabled,
		// Expose sitekey when enabled; this is public information
		"turnstile_sitekey":   os.Getenv("SYNAP_TURNSTILE_SITEKEY"),
		"items_per_page":      sc.ItemsPerPage,
		"consent_config":      sc.ConsentConfig,
		"likert_labels_i18n":  sc.LikertLabelsI18n,
		"likert_show_numbers": sc.LikertShowNumbers,
		"likert_preset":       sc.LikertPreset,
	})
}

// verifyTurnstile validates a Turnstile token with Cloudflare when server secret is set.
// Returns true if verification succeeds. If secret is missing, returns true (skip enforcement).
func (rt *Router) verifyTurnstile(r *http.Request, token string) bool {
	secret := strings.TrimSpace(os.Getenv("SYNAP_TURNSTILE_SECRET"))
	if secret == "" {
		// Secret not configured; treat as pass (useful in dev). Enforcement is gated additionally by scale flag.
		return true
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return false
	}
	// Prepare form payload
	data := "secret=" + urlEncode(secret) + "&response=" + urlEncode(token)
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		data += "&remoteip=" + urlEncode(ip)
	}
	req, _ := http.NewRequest(http.MethodPost, "https://challenges.cloudflare.com/turnstile/v0/siteverify", strings.NewReader(data))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer func() { _ = resp.Body.Close() }()
	var out struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return false
	}
	return out.Success
}

func urlEncode(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~' {
			b.WriteByte(c)
		} else if c == ' ' {
			b.WriteByte('+')
		} else {
			b.WriteString(fmt.Sprintf("%%%02X", c))
		}
	}
	return b.String()
}

// POST /api/consent/sign { scale_id, version, locale, choices:map, signed_at, signature_kind, evidence }
func (rt *Router) handleConsentSign(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		ScaleID       string          `json:"scale_id"`
		Version       string          `json:"version"`
		Locale        string          `json:"locale"`
		Choices       map[string]bool `json:"choices"`
		SignedAt      string          `json:"signed_at"`
		SignatureKind string          `json:"signature_kind"`
		Evidence      string          `json:"evidence"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	sc := rt.store.GetScale(in.ScaleID)
	if sc == nil {
		http.Error(w, "scale not found", http.StatusNotFound)
		return
	}
	// compute sha256 of evidence
	sum := sha256.Sum256([]byte(in.Evidence))
	hash := base64.StdEncoding.EncodeToString(sum[:])
	// parse time if provided
	ts := time.Now().UTC()
	if in.SignedAt != "" {
		if t2, err := time.Parse(time.RFC3339, in.SignedAt); err == nil {
			ts = t2
		}
	}
	id := strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	choices := in.Choices
	if sc != nil && sc.E2EEEnabled {
		choices = nil
	}
	rt.store.AddConsentRecord(&ConsentRecord{ID: id, ScaleID: in.ScaleID, Version: in.Version, Choices: choices, Locale: in.Locale, SignedAt: ts, Hash: hash})
	// audit
	rt.store.AddAudit(AuditEntry{Time: time.Now(), Actor: "participant", Action: "consent_sign", Target: in.ScaleID, Note: id})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "id": id, "hash": hash})
}

// POST /api/responses/bulk
// { participant: {email?: string}, scale_id: string, answers: [{item_id, raw_value? , raw?}] }
func (rt *Router) handleBulkResponses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Participant struct {
			Email string `json:"email"`
		} `json:"participant"`
		ScaleID string `json:"scale_id"`
		Answers []struct {
			ItemID string          `json:"item_id"`
			Raw    json.RawMessage `json:"raw"`
			RawInt *int            `json:"raw_value,omitempty"`
		} `json:"answers"`
		ConsentID      string `json:"consent_id,omitempty"`
		TurnstileToken string `json:"turnstile_token,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	answers := make([]services.BulkAnswer, 0, len(req.Answers))
	for _, a := range req.Answers {
		answers = append(answers, services.BulkAnswer{ItemID: a.ItemID, Raw: a.Raw, RawInt: a.RawInt})
	}
	result, err := rt.responseSvc.ProcessBulkResponses(services.BulkResponsesRequest{
		ScaleID:          req.ScaleID,
		ParticipantEmail: req.Participant.Email,
		ConsentID:        req.ConsentID,
		TurnstileToken:   req.TurnstileToken,
		Answers:          answers,
		VerifyTurnstile: func(token string) (bool, error) {
			return rt.verifyTurnstile(r, token), nil
		},
	})
	if err != nil {
		switch {
		case errors.Is(err, services.ErrScaleNotFound):
			http.Error(w, err.Error(), http.StatusNotFound)
		case errors.Is(err, services.ErrTurnstileVerificationFailed):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, services.ErrPlaintextDisabled):
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	selfBase := "/api/self/participant"
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":             true,
		"participant_id": result.ParticipantID,
		"count":          result.ResponsesCount,
		"self_token":     result.SelfToken,
		"self_export":    selfBase + "/export?pid=" + result.ParticipantID + "&token=" + result.SelfToken,
		"self_delete":    selfBase + "/delete?pid=" + result.ParticipantID + "&token=" + result.SelfToken,
	})
}

// GET /api/export?scale_id=...&format=long|wide|score
func (rt *Router) handleExport(w http.ResponseWriter, r *http.Request) {
	scaleID := r.URL.Query().Get("scale_id")
	format := r.URL.Query().Get("format")
	consentHeader := r.URL.Query().Get("consent_header")
	if consentHeader == "" {
		consentHeader = "key"
	}
	res, err := rt.exportSvc.ExportCSV(services.ExportParams{ScaleID: scaleID, Format: format, ConsentHeader: consentHeader})
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", res.ContentType)
	w.Header().Set("Content-Disposition", "attachment; filename="+res.Filename)
	_, _ = w.Write([]byte{0xEF, 0xBB, 0xBF})
	_, _ = w.Write(res.Data)
}

// GET /api/admin/participant/export?email=...
func (rt *Router) handleExportParticipant(w http.ResponseWriter, r *http.Request) {
	email := strings.TrimSpace(r.URL.Query().Get("email"))
	if email == "" {
		http.Error(w, "email required", http.StatusBadRequest)
		return
	}
	rs, p := rt.store.ExportParticipantByEmail(email)
	if p == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	// audit
	actor := "admin"
	if c, ok := middleware.ClaimsFromContext(r.Context()); ok {
		actor = c.Email
	}
	rt.store.AddAudit(AuditEntry{Time: time.Now(), Actor: actor, Action: "export_participant", Target: email})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"participant": p, "responses": rs})
}

// (removed)

// POST /api/admin/participant/delete?email=...&hard=true
func (rt *Router) handleDeleteParticipant(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	email := strings.TrimSpace(r.URL.Query().Get("email"))
	if email == "" {
		http.Error(w, "email required", http.StatusBadRequest)
		return
	}
	hard := r.URL.Query().Get("hard") == "true"
	ok := rt.store.DeleteParticipantByEmail(email, hard)
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	actor := "admin"
	if c, ok := middleware.ClaimsFromContext(r.Context()); ok {
		actor = c.Email
	}
	rt.store.AddAudit(AuditEntry{Time: time.Now(), Actor: actor, Action: "delete_participant", Target: email, Note: map[bool]string{true: "hard", false: "soft"}[hard]})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "hard": hard})
}

// --- E2EE: project keys management ---
// Routes: /api/projects/{id}/keys (GET, POST)
func (rt *Router) handleProjectKeys(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/api/projects/") {
		http.NotFound(w, r)
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/api/projects/")
	parts := strings.Split(rest, "/")
	if len(parts) < 2 || parts[1] != "keys" {
		http.NotFound(w, r)
		return
	}
	id := parts[0]
	switch r.Method {
	case http.MethodGet:
		// Publicly list registered public keys for encryption
		ks := rt.store.ListProjectKeys(id)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": ks})
		return
	case http.MethodPost:
		// POST requires auth and tenant scope
		tid, ok := middleware.TenantIDFromContext(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		sc := rt.store.GetScale(id)
		if sc == nil || sc.TenantID != tid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		var in struct {
			Algorithm   string `json:"alg"`
			KDF         string `json:"kdf"`
			PublicKey   string `json:"public_key"`
			Fingerprint string `json:"fingerprint"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		k := &ProjectKey{ScaleID: id, Algorithm: in.Algorithm, KDF: in.KDF, PublicKey: in.PublicKey, Fingerprint: in.Fingerprint, CreatedAt: time.Now().UTC()}
		rt.store.AddProjectKey(k)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
		return
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

// --- E2EE: encrypted response intake ---
// POST /api/responses/e2ee { scale_id, response_id?, ciphertext, nonce, enc_dek:[], aad_hash, pmk_fingerprint }
func (rt *Router) handleE2EEResponse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		ScaleID        string   `json:"scale_id"`
		ResponseID     string   `json:"response_id"`
		Ciphertext     string   `json:"ciphertext"`
		Nonce          string   `json:"nonce"`
		AADHash        string   `json:"aad_hash"`
		EncDEK         []string `json:"enc_dek"`
		PMKFingerprint string   `json:"pmk_fingerprint"`
		TurnstileToken string   `json:"turnstile_token,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if in.ScaleID == "" || in.Ciphertext == "" || in.Nonce == "" || len(in.EncDEK) == 0 {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if sc := rt.store.GetScale(in.ScaleID); sc != nil && sc.TurnstileEnabled {
		if ok := rt.verifyTurnstile(r, in.TurnstileToken); !ok {
			http.Error(w, "turnstile verification failed", http.StatusBadRequest)
			return
		}
	}
	// store opaque ciphertext without touching plaintext
	rid := in.ResponseID
	if rid == "" {
		rid = strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	}
	// generate self token
	rb := make([]byte, 24)
	_, _ = rand.Read(rb)
	tok := base64.RawURLEncoding.EncodeToString(rb)
	rt.store.AddE2EEResponse(&E2EEResponse{
		ScaleID: in.ScaleID, ResponseID: rid, Ciphertext: in.Ciphertext, Nonce: in.Nonce,
		AADHash: in.AADHash, EncDEK: in.EncDEK, PMKFingerprint: in.PMKFingerprint, CreatedAt: time.Now().UTC(),
		SelfToken: tok,
	})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":          true,
		"response_id": rid,
		"self_token":  tok,
		"self_export": "/api/self/e2ee/export?response_id=" + rid + "&token=" + tok,
		"self_delete": "/api/self/e2ee/delete?response_id=" + rid + "&token=" + tok,
	})
}

// --- Export encrypted bundle (JSONL.enc-like JSON for MVP) ---
// GET /api/exports/e2ee?scale_id=...
// Requires X-Step-Up: true header for step-up confirmation (MVP stub)
func (rt *Router) handleExportE2EE(w http.ResponseWriter, r *http.Request) {
	tid, ok := middleware.TenantIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodPost:
		if r.Header.Get("X-Step-Up") != "true" {
			http.Error(w, "step-up required", http.StatusForbidden)
			return
		}
		var in struct {
			ScaleID string `json:"scale_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil || strings.TrimSpace(in.ScaleID) == "" {
			http.Error(w, "scale_id required", http.StatusBadRequest)
			return
		}
		sc := rt.store.GetScale(in.ScaleID)
		if sc == nil || sc.TenantID != tid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		ip := r.Header.Get("X-Forwarded-For")
		if ip == "" {
			ip = r.RemoteAddr
		}
		if job := rt.store.FindRecentExportJob(tid, in.ScaleID, ip, 30*time.Second); job != nil {
			rt.store.AddAudit(AuditEntry{Time: time.Now(), Actor: actorEmail(r), Action: "export_e2ee_reuse", Target: in.ScaleID, Note: job.ID})
			url := fmt.Sprintf("/api/exports/e2ee?job=%s&token=%s", job.ID, job.Token)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"url": url, "expires_at": job.ExpiresAt.UTC().Format(time.RFC3339)})
			return
		}
		if !rt.store.AllowExport(tid, 5*time.Second) {
			http.Error(w, "too many requests", http.StatusTooManyRequests)
			return
		}
		job := rt.store.CreateExportJob(tid, in.ScaleID, ip, 5*time.Minute)
		rt.store.AddAudit(AuditEntry{Time: time.Now(), Actor: actorEmail(r), Action: "export_e2ee_request", Target: in.ScaleID, Note: job.ID})
		url := fmt.Sprintf("/api/exports/e2ee?job=%s&token=%s", job.ID, job.Token)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"url": url, "expires_at": job.ExpiresAt.UTC().Format(time.RFC3339)})
		return
	case http.MethodGet:
		// If a job token is provided, use tokenized download; else allow legacy scale_id path with step-up
		if jobID := r.URL.Query().Get("job"); jobID != "" {
			token := r.URL.Query().Get("token")
			job := rt.store.GetExportJob(jobID, token)
			if job == nil || job.TenantID != tid {
				http.Error(w, "invalid or expired job", http.StatusForbidden)
				return
			}
			sc := rt.store.GetScale(job.ScaleID)
			if sc == nil || sc.TenantID != tid {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			rs := rt.store.ListE2EEResponses(job.ScaleID)
			manifest := map[string]any{
				"version":    1,
				"type":       "e2ee-bundle",
				"scale_id":   job.ScaleID,
				"count":      len(rs),
				"created_at": time.Now().UTC().Format(time.RFC3339),
			}
			mb, _ := json.Marshal(manifest)
			sig := ""
			if rt.signPriv != nil {
				sig = base64.StdEncoding.EncodeToString(ed25519.Sign(rt.signPriv, mb))
			}
			// audit with manifest hash
			h := sha256.Sum256(mb)
			rt.store.AddAudit(AuditEntry{Time: time.Now(), Actor: actorEmail(r), Action: "export_e2ee_download", Target: job.ScaleID, Note: base64.StdEncoding.EncodeToString(h[:])})
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Content-Disposition", "attachment; filename=e2ee_bundle.json")
			_ = json.NewEncoder(w).Encode(map[string]any{"manifest": manifest, "signature": sig, "responses": rs})
			return
		}
		// Legacy path: requires step-up header and query scale_id
		if r.Header.Get("X-Step-Up") != "true" {
			http.Error(w, "step-up required", http.StatusForbidden)
			return
		}
		scaleID := r.URL.Query().Get("scale_id")
		if scaleID == "" {
			http.Error(w, "scale_id required", http.StatusBadRequest)
			return
		}
		sc := rt.store.GetScale(scaleID)
		if sc == nil || sc.TenantID != tid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		rs := rt.store.ListE2EEResponses(scaleID)
		manifest := map[string]any{
			"version":    1,
			"type":       "e2ee-bundle",
			"scale_id":   scaleID,
			"count":      len(rs),
			"created_at": time.Now().UTC().Format(time.RFC3339),
		}
		mb, _ := json.Marshal(manifest)
		sig := ""
		if rt.signPriv != nil {
			sig = base64.StdEncoding.EncodeToString(ed25519.Sign(rt.signPriv, mb))
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"manifest": manifest, "signature": sig, "responses": rs})
		return
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

// --- Rewrap jobs (offline pure E2EE) ---
// POST /api/rewrap/jobs  { scale_id, from_fp, to_fp }
// Returns a minimal job containing response_id and existing encDEK[]
func (rt *Router) handleRewrapJobs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tid, ok := middleware.TenantIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var in struct{ ScaleID, FromFP, ToFP string }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	sc := rt.store.GetScale(in.ScaleID)
	if sc == nil || sc.TenantID != tid {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	rs := rt.store.ListE2EEResponses(in.ScaleID)
	type item struct {
		ResponseID string   `json:"response_id"`
		EncDEK     []string `json:"enc_dek"`
	}
	out := make([]item, 0, len(rs))
	for _, r2 := range rs {
		out = append(out, item{ResponseID: r2.ResponseID, EncDEK: r2.EncDEK})
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"scale_id": in.ScaleID, "from_fp": in.FromFP, "to_fp": in.ToFP, "items": out})
}

// POST /api/rewrap/submit  { scale_id, to_fp, items:[{response_id, enc_dek_new}] }
func (rt *Router) handleRewrapSubmit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tid, ok := middleware.TenantIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var in struct {
		ScaleID, ToFP string
		Items         []struct {
			ResponseID string `json:"response_id"`
			EncDEKNew  string `json:"enc_dek_new"`
		}
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	sc := rt.store.GetScale(in.ScaleID)
	if sc == nil || sc.TenantID != tid {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	// append new encDEK
	for _, it := range in.Items {
		rt.store.AppendE2EEEncDEK(it.ResponseID, it.EncDEKNew)
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "to_fp": in.ToFP, "count": len(in.Items)})
}

// --- Admin AI config ---
// GET -> fetch current tenant AI config
// PUT -> update AI config { openai_key?, openai_base?, allow_external, store_logs }
func (rt *Router) handleAdminAIConfig(w http.ResponseWriter, r *http.Request) {
	tid, ok := middleware.TenantIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodGet:
		cfg := rt.store.GetAIConfig(tid)
		if cfg == nil {
			cfg = &TenantAIConfig{TenantID: tid, AllowExternal: false, StoreLogs: false}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(cfg)
		return
	case http.MethodPut:
		var in TenantAIConfig
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		in.TenantID = tid
		rt.store.UpsertAIConfig(&in)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
		return
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

// POST /api/admin/ai/translate/preview
// { scale_id: string, target_langs: ["en","zh"], model?: string, scope?: ["items","name","consent"] }
// Returns: { items: { [id]: { [lang]: string } }, name_i18n?: {...}, consent_i18n?: {...} }
func (rt *Router) handleAdminAITranslatePreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tid, ok := middleware.TenantIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req struct {
		ScaleID     string   `json:"scale_id"`
		TargetLangs []string `json:"target_langs"`
		Model       string   `json:"model"`
		Scope       []string `json:"scope"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	res, err := rt.translationSvc.PreviewScaleTranslation(tid, services.TranslationPreviewRequest{
		ScaleID:     req.ScaleID,
		TargetLangs: req.TargetLangs,
		Model:       req.Model,
		Scope:       req.Scope,
	})
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}

// GET /api/admin/audit
func (rt *Router) handleAudit(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rt.store.ListAudit())
}

// GET /api/metrics/alpha?scale_id=...
func (rt *Router) handleAlpha(w http.ResponseWriter, r *http.Request) {
	scaleID := r.URL.Query().Get("scale_id")
	if scaleID == "" {
		http.Error(w, "scale_id required", http.StatusBadRequest)
		return
	}
	items := rt.store.ListItems(scaleID)
	rs := rt.store.ListResponsesByScale(scaleID)
	// Build matrix [participants][items] with only rows that have all items
	// map[pid]map[itemID]score
	mp := map[string]map[string]float64{}
	for _, r := range rs {
		if mp[r.ParticipantID] == nil {
			mp[r.ParticipantID] = map[string]float64{}
		}
		mp[r.ParticipantID][r.ItemID] = float64(r.ScoreValue)
	}
	// item order
	iids := make([]string, 0, len(items))
	for _, it := range items {
		iids = append(iids, it.ID)
	}
	sort.Strings(iids)
	matrix := make([][]float64, 0, len(mp))
	for pid, m := range mp {
		row := make([]float64, 0, len(iids))
		complete := true
		for _, iid := range iids {
			v, ok := m[iid]
			if !ok {
				complete = false
				break
			}
			row = append(row, v)
		}
		if complete {
			matrix = append(matrix, row)
		}
		_ = pid
	}
	alpha := services.CronbachAlpha(matrix)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"scale_id": scaleID, "alpha": alpha, "n": len(matrix)})
}

// --- Auth & Admin ---
// POST /api/auth/register {email,password,tenant_name}
func (rt *Router) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "method not allowed"})
		return
	}
	var req struct{ Email, Password, TenantName string }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
		return
	}
	res, err := rt.authSvc.Register(req.Email, req.Password, req.TenantName)
	if err != nil {
		rt.writeAuthJSONError(w, err)
		return
	}
	maxAge := int(rt.authSvc.TokenTTL().Seconds())
	http.SetCookie(w, &http.Cookie{Name: "synap_token", Value: res.Token, HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, Path: "/", MaxAge: maxAge})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"token": res.Token, "tenant_id": res.TenantID, "user_id": res.UserID})
}

// POST /api/auth/login {email,password}
func (rt *Router) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "method not allowed"})
		return
	}
	var req struct{ Email, Password string }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
		return
	}
	res, err := rt.authSvc.Login(req.Email, req.Password)
	if err != nil {
		rt.writeAuthJSONError(w, err)
		return
	}
	maxAge := int(rt.authSvc.TokenTTL().Seconds())
	http.SetCookie(w, &http.Cookie{Name: "synap_token", Value: res.Token, HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, Path: "/", MaxAge: maxAge})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"token": res.Token, "tenant_id": res.TenantID, "user_id": res.UserID})
}

// POST /api/auth/logout — expire auth cookie; frontend should also clear token
func (rt *Router) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Expire the cookie
	http.SetCookie(w, &http.Cookie{Name: "synap_token", Value: "", HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, Path: "/", MaxAge: -1, Expires: time.Unix(0, 0)})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

// GET /api/admin/scales -> list scales for tenant
func (rt *Router) handleAdminScales(w http.ResponseWriter, r *http.Request) {
	tid, ok := middleware.TenantIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	list := rt.store.ListScalesByTenant(tid)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"scales": list})
}

// GET /api/admin/stats?scale_id=...
func (rt *Router) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	tid, ok := middleware.TenantIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	scaleID := r.URL.Query().Get("scale_id")
	if scaleID == "" {
		http.Error(w, "scale_id required", http.StatusBadRequest)
		return
	}
	sc := rt.store.GetScale(scaleID)
	if sc == nil || sc.TenantID != tid {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	rs := rt.store.ListResponsesByScale(scaleID)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"count": len(rs)})
}

// GET /api/admin/analytics/summary?scale_id=...
// Returns per-item histograms, daily timeseries counts, and Cronbach's alpha.
func (rt *Router) handleAdminAnalyticsSummary(w http.ResponseWriter, r *http.Request) {
	// Enforce tenant scope
	tid, ok := middleware.TenantIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	scaleID := r.URL.Query().Get("scale_id")
	if scaleID == "" {
		http.Error(w, "scale_id required", http.StatusBadRequest)
		return
	}
	sc := rt.store.GetScale(scaleID)
	if sc == nil || sc.TenantID != tid {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	items := rt.store.ListItems(scaleID)
	points := sc.Points
	if points <= 0 {
		points = 5
	}
	// histograms per item
	type itemOut struct {
		ID        string            `json:"id"`
		StemI18n  map[string]string `json:"stem_i18n,omitempty"`
		Reverse   bool              `json:"reverse_scored"`
		Histogram []int             `json:"histogram"`
		Total     int               `json:"total"`
	}
	itemIndex := map[string]int{}
	outItems := make([]itemOut, 0, len(items))
	// Only include Likert-type items for histograms/alpha
	filtered := make([]*Item, 0, len(items))
	for _, it := range items {
		if it.Type == "" || it.Type == "likert" {
			filtered = append(filtered, it)
		}
	}
	for i, it := range filtered {
		outItems = append(outItems, itemOut{ID: it.ID, StemI18n: it.StemI18n, Reverse: it.ReverseScored, Histogram: make([]int, points)})
		itemIndex[it.ID] = i
	}
	// timeseries by day
	countsByDay := map[string]int{}
	rs := rt.store.ListResponsesByScale(scaleID)
	for _, r2 := range rs {
		// histogram
		if idx, ok := itemIndex[r2.ItemID]; ok {
			v := r2.ScoreValue
			if v >= 1 && v <= points {
				outItems[idx].Histogram[v-1]++
				outItems[idx].Total++
			}
		}
		// timeseries (UTC day)
		day := r2.SubmittedAt.UTC().Format("2006-01-02")
		countsByDay[day]++
	}
	// Build alpha matrix (participants with complete rows)
	// map[pid]map[itemID]score
	mp := map[string]map[string]float64{}
	for _, r2 := range rs {
		if mp[r2.ParticipantID] == nil {
			mp[r2.ParticipantID] = map[string]float64{}
		}
		mp[r2.ParticipantID][r2.ItemID] = float64(r2.ScoreValue)
	}
	iids := make([]string, 0, len(filtered))
	for _, it := range filtered {
		iids = append(iids, it.ID)
	}
	sort.Strings(iids)
	matrix := make([][]float64, 0, len(mp))
	for _, m := range mp {
		row := make([]float64, 0, len(iids))
		complete := true
		for _, id := range iids {
			v, ok := m[id]
			if !ok {
				complete = false
				break
			}
			row = append(row, v)
		}
		if complete {
			matrix = append(matrix, row)
		}
	}
	alpha := services.CronbachAlpha(matrix)
	// timeseries array sorted by day
	days := make([]string, 0, len(countsByDay))
	for d := range countsByDay {
		days = append(days, d)
	}
	sort.Strings(days)
	type ts struct {
		Date  string `json:"date"`
		Count int    `json:"count"`
	}
	series := make([]ts, 0, len(days))
	for _, d := range days {
		series = append(series, ts{Date: d, Count: countsByDay[d]})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"scale_id":        scaleID,
		"points":          points,
		"total_responses": len(rs),
		"items":           outItems,
		"timeseries":      series,
		"alpha":           alpha,
		"n":               len(matrix),
	})
}

// --- Admin scale/item ops ---
// GET /api/admin/scales/{id}    -> scale detail
// GET /api/admin/scales/{id}/items -> full items
// PUT /api/admin/scales/{id}    -> update name_i18n/points/randomize
// DELETE /api/admin/scales/{id} -> delete scale with items/responses
func (rt *Router) handleAdminScaleOps(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/admin/scales/")
	if rest == "" {
		http.NotFound(w, r)
		return
	}
	parts := strings.Split(rest, "/")
	id := parts[0]
	if len(parts) == 3 && parts[1] == "items" && parts[2] == "reorder" && r.Method == http.MethodPut {
		tid, ok := middleware.TenantIDFromContext(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var in struct {
			Order []string `json:"order"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		count, err := rt.scaleSvc.ReorderItems(tid, id, in.Order)
		if err != nil {
			rt.writeServiceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "count": count})
		return
	}
	switch r.Method {
	case http.MethodGet:
		if len(parts) == 2 && parts[1] == "items" {
			items, err := rt.scaleSvc.ListItems(id)
			if err != nil {
				rt.writeServiceError(w, err)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"items": items})
			return
		}
		sc, err := rt.scaleSvc.GetScale(id)
		if err != nil {
			rt.writeServiceError(w, err)
			return
		}
		if sc == nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(sc)
	case http.MethodDelete:
		if len(parts) == 2 && parts[1] == "responses" {
			tid, ok := middleware.TenantIDFromContext(r.Context())
			if !ok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			removed, err := rt.scaleSvc.DeleteScaleResponses(tid, id, actorEmail(r))
			if err != nil {
				rt.writeServiceError(w, err)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "removed": removed})
			return
		}
		if err := rt.scaleSvc.DeleteScale(id, actorEmail(r)); err != nil {
			rt.writeServiceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	case http.MethodPut:
		var raw map[string]any
		if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := rt.scaleSvc.UpdateScale(id, raw, actorEmail(r)); err != nil {
			rt.writeServiceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func actorEmail(r *http.Request) string {
	if c, ok := middleware.ClaimsFromContext(r.Context()); ok {
		return c.Email
	}
	return "admin"
}

func (rt *Router) writeServiceError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}
	if se, ok := services.AsServiceError(err); ok {
		status := http.StatusBadRequest
		switch se.Code {
		case services.ErrorForbidden:
			status = http.StatusForbidden
		case services.ErrorNotFound:
			status = http.StatusNotFound
		case services.ErrorUnauthorized:
			status = http.StatusUnauthorized
		case services.ErrorConflict:
			status = http.StatusConflict
		case services.ErrorBadGateway:
			status = http.StatusBadGateway
		}
		http.Error(w, se.Message, status)
		return
	}
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func (rt *Router) writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": msg})
}

func (rt *Router) writeAuthJSONError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}
	if se, ok := services.AsServiceError(err); ok {
		status := http.StatusBadRequest
		switch se.Code {
		case services.ErrorForbidden:
			status = http.StatusForbidden
		case services.ErrorNotFound:
			status = http.StatusNotFound
		case services.ErrorUnauthorized:
			status = http.StatusUnauthorized
		case services.ErrorConflict:
			status = http.StatusConflict
		}
		rt.writeJSONError(w, status, se.Message)
		return
	}
	rt.writeJSONError(w, http.StatusInternalServerError, err.Error())
}

// PUT /api/admin/items/{id}  -> update item (stem_i18n, reverse_scored)
// DELETE /api/admin/items/{id}
func (rt *Router) handleAdminItemOps(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/admin/items/")
	if id == "" {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodPut:
		var in services.Item
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		in.ID = id
		if err := rt.scaleSvc.UpdateItem(&in); err != nil {
			rt.writeServiceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
		return
	case http.MethodDelete:
		if err := rt.scaleSvc.DeleteItem(id); err != nil {
			rt.writeServiceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
		return
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

// --- GDPR self-service: participant non-E2EE export ---
// GET /api/self/participant/export?pid=...&token=...
func (rt *Router) handleSelfExportParticipant(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	pid := strings.TrimSpace(r.URL.Query().Get("pid"))
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	res, err := rt.participantSvc.ExportParticipant(pid, token)
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}

// --- GDPR self-service: participant non-E2EE delete ---
// POST /api/self/participant/delete?pid=...&token=...&hard=true
func (rt *Router) handleSelfDeleteParticipant(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	pid := strings.TrimSpace(r.URL.Query().Get("pid"))
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	hard := r.URL.Query().Get("hard") == "true"
	if err := rt.participantSvc.DeleteParticipant(pid, token, hard); err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "hard": hard})
}

// --- GDPR self-service: E2EE single-response export ---
// GET /api/self/e2ee/export?response_id=...&token=...
func (rt *Router) handleSelfExportE2EE(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	rid := strings.TrimSpace(r.URL.Query().Get("response_id"))
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	resp, err := rt.participantSvc.ExportE2EE(rid, token)
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// --- GDPR self-service: E2EE single-response delete ---
// POST /api/self/e2ee/delete?response_id=...&token=...
func (rt *Router) handleSelfDeleteE2EE(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	rid := strings.TrimSpace(r.URL.Query().Get("response_id"))
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if err := rt.participantSvc.DeleteE2EE(rid, token); err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}
