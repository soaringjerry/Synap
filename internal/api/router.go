package api

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

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
	aiCfgSvc       *services.AIConfigService
	translationSvc *services.TranslationService
	e2eeSvc        *services.E2EEService
	analyticsSvc   *services.AnalyticsService
	consentSvc     *services.ConsentService
	teamSvc        *services.TeamService
}

func NewRouterWithStore(store Store) *Router {
	if store == nil {
		log.Printf("persistence disabled: using in-memory store")
		store = newMemoryStore("")
	}
	ert := &Router{
		store:          store,
		signPriv:       deriveSignKey(),
		responseSvc:    services.NewResponseService(newResponseStoreAdapter(store)),
		scaleSvc:       services.NewScaleService(newScaleStoreAdapter(store)),
		authSvc:        services.NewAuthService(newAuthStoreAdapter(store), middleware.SignToken),
		exportSvc:      services.NewExportService(newExportStoreAdapter(store)),
		participantSvc: services.NewParticipantDataService(newParticipantStoreAdapter(store)),
		aiCfgSvc:       services.NewAIConfigService(newAIConfigStoreAdapter(store)),
		translationSvc: services.NewTranslationService(newTranslationStoreAdapter(store), http.DefaultClient),
		e2eeSvc:        services.NewE2EEService(newE2EEStoreAdapter(store), nil),
	}
	if ert.signPriv != nil {
		ert.e2eeSvc.WithSigner(func(data []byte) (string, error) {
			return base64.StdEncoding.EncodeToString(ed25519.Sign(ert.signPriv, data)), nil
		})
	}
	ert.analyticsSvc = services.NewAnalyticsService(newAnalyticsStoreAdapter(store))
	ert.consentSvc = services.NewConsentService(newConsentStoreAdapter(store))
	ert.teamSvc = services.NewTeamService(newTeamStoreAdapter(store))
	return ert
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
	mux.Handle("/api/auth/me", middleware.WithAuth(http.HandlerFunc(rt.handleAuthMe)))
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
	views, err := rt.scaleSvc.BuildItemViews(id, lang)
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"scale_id": id, "items": views})
}

// GET /api/scale/{id} -> public scale metadata (name_i18n, points, consent_i18n, randomize)
func (rt *Router) handleScaleMeta(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/scale/")
	if id == "" {
		http.NotFound(w, r)
		return
	}
	sc, err := rt.scaleSvc.GetScaleMeta(id)
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
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
	res, err := rt.consentSvc.Sign(services.ConsentSignRequest{
		ScaleID:       in.ScaleID,
		Version:       in.Version,
		Locale:        in.Locale,
		Choices:       in.Choices,
		SignedAt:      in.SignedAt,
		SignatureKind: in.SignatureKind,
		Evidence:      in.Evidence,
	})
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "id": res.ID, "hash": res.Hash})
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
	headerLang := r.URL.Query().Get("header_lang") // en|zh
	valuesMode := r.URL.Query().Get("values")      // numeric|label
	valueLang := r.URL.Query().Get("label_lang")   // en|zh
	if consentHeader == "" {
		// Default to English labels for consent columns for analysis friendliness
		consentHeader = "label_en"
	}
	res, err := rt.exportSvc.ExportCSV(services.ExportParams{ScaleID: scaleID, Format: format, ConsentHeader: consentHeader, HeaderLang: headerLang, ValuesMode: valuesMode, ValueLang: valueLang})
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
	actor := "admin"
	if c, ok := middleware.ClaimsFromContext(r.Context()); ok {
		actor = c.Email
	}
	res, err := rt.participantSvc.AdminExportByEmail(email, actor)
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
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
	actor := "admin"
	if c, ok := middleware.ClaimsFromContext(r.Context()); ok {
		actor = c.Email
	}
	if err := rt.participantSvc.AdminDeleteByEmail(email, hard, actor); err != nil {
		rt.writeServiceError(w, err)
		return
	}
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
		ks, err := rt.e2eeSvc.ListProjectKeys(id)
		if err != nil {
			rt.writeServiceError(w, err)
			return
		}
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
		if err := rt.e2eeSvc.AddProjectKey(tid, id, services.ProjectKeyInput{Algorithm: in.Algorithm, KDF: in.KDF, PublicKey: in.PublicKey, Fingerprint: in.Fingerprint}); err != nil {
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
	res, err := rt.e2eeSvc.IntakeResponse(services.IntakeResponseInput{
		ScaleID:        in.ScaleID,
		ResponseID:     in.ResponseID,
		Ciphertext:     in.Ciphertext,
		Nonce:          in.Nonce,
		AADHash:        in.AADHash,
		EncDEK:         in.EncDEK,
		PMKFingerprint: in.PMKFingerprint,
	}, func(token string) (bool, error) { return rt.verifyTurnstile(r, token), nil })
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":          true,
		"response_id": res.ResponseID,
		"self_token":  res.SelfToken,
		"self_export": "/api/self/e2ee/export?response_id=" + res.ResponseID + "&token=" + res.SelfToken,
		"self_delete": "/api/self/e2ee/delete?response_id=" + res.ResponseID + "&token=" + res.SelfToken,
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
		ip := r.Header.Get("X-Forwarded-For")
		if ip == "" {
			ip = r.RemoteAddr
		}
		res, err := rt.e2eeSvc.RequestExport(services.E2EEExportRequest{TenantID: tid, ScaleID: in.ScaleID, RemoteIP: ip, Actor: actorEmail(r)})
		if err != nil {
			rt.writeServiceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"url": res.URL, "expires_at": res.ExpiresAt.UTC().Format(time.RFC3339)})
		return
	case http.MethodGet:
		// If a job token is provided, use tokenized download; else allow legacy scale_id path with step-up
		bundle, err := rt.e2eeSvc.DownloadExport(services.E2EEDownloadRequest{
			TenantID: tid,
			ScaleID:  r.URL.Query().Get("scale_id"),
			JobID:    r.URL.Query().Get("job"),
			JobToken: r.URL.Query().Get("token"),
			Actor:    actorEmail(r),
			StepUp:   r.Header.Get("X-Step-Up") == "true",
		})
		if err != nil {
			rt.writeServiceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=e2ee_bundle.json")
		_ = json.NewEncoder(w).Encode(map[string]any{"manifest": bundle.Manifest, "signature": bundle.Signature, "responses": bundle.Responses})
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
	res, err := rt.e2eeSvc.ListRewrapItems(tid, in.ScaleID, in.FromFP, in.ToFP)
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	_ = json.NewEncoder(w).Encode(res)
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
	items := make([]services.RewrapSubmitItem, 0, len(in.Items))
	for _, it := range in.Items {
		items = append(items, services.RewrapSubmitItem{ResponseID: it.ResponseID, EncDEKNew: it.EncDEKNew})
	}
	if err := rt.e2eeSvc.SubmitRewrap(tid, in.ScaleID, actorEmail(r), items, in.ToFP); err != nil {
		rt.writeServiceError(w, err)
		return
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
		cfg, err := rt.aiCfgSvc.Get(tid)
		if err != nil {
			rt.writeServiceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(cfg)
		return
	case http.MethodPut:
		var in services.TenantAIConfig
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		in.TenantID = tid
		if err := rt.aiCfgSvc.Update(&in); err != nil {
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
	// Require tenant auth and filter to tenant-owned resources
	tid, ok := middleware.TenantIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	// Optional: filter by scale_id
	filterScaleID := strings.TrimSpace(r.URL.Query().Get("scale_id"))
	var allowedScales map[string]bool
	if filterScaleID != "" {
		sc := rt.store.GetScale(filterScaleID)
		if sc == nil || sc.TenantID != tid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		allowedScales = map[string]bool{filterScaleID: true}
	} else {
		// Build allow-list from tenant scales
		allowedScales = map[string]bool{}
		for _, sc := range rt.store.ListScalesByTenant(tid) {
			allowedScales[sc.ID] = true
		}
	}

	raw := rt.store.ListAudit()
	out := make([]AuditEntry, 0, len(raw))
	for _, e := range raw {
		if allowedScales[e.Target] {
			out = append(out, e)
		}
		if len(out) >= 500 {
			break
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// GET /api/metrics/alpha?scale_id=...
func (rt *Router) handleAlpha(w http.ResponseWriter, r *http.Request) {
	scaleID := r.URL.Query().Get("scale_id")
	if scaleID == "" {
		http.Error(w, "scale_id required", http.StatusBadRequest)
		return
	}
	alpha, n, err := rt.analyticsSvc.Alpha(scaleID)
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"scale_id": scaleID, "alpha": alpha, "n": n})
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
	var req struct {
		Email, Password, TenantName string
		InviteToken                 string `json:"invite_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
		return
	}
	// If invite token is provided and valid, register into inviter's tenant and auto-add collaborator
	if strings.TrimSpace(req.InviteToken) != "" {
		inv := rt.store.GetInvite(strings.TrimSpace(req.InviteToken))
		if inv == nil || inv.ExpiresAt.Before(time.Now().UTC()) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "invalid or expired invite"})
			return
		}
		// Email must match
		if !strings.EqualFold(strings.TrimSpace(req.Email), strings.TrimSpace(inv.Email)) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "invite email mismatch"})
			return
		}
		res, err := rt.authSvc.RegisterWithTenant(req.Email, req.Password, inv.TenantID)
		if err != nil {
			rt.writeAuthJSONError(w, err)
			return
		}
		_ = rt.store.MarkInviteAccepted(inv.Token)
		// Auto-add collaborator
		if _, addErr := rt.teamSvc.Add(inv.TenantID, inv.ScaleID, inv.Email, inv.Role, "system:invite"); addErr != nil {
			log.Printf("invite: add collaborator error: %v", addErr)
		}
		maxAge := int(rt.authSvc.TokenTTL().Seconds())
		http.SetCookie(w, &http.Cookie{Name: "synap_token", Value: res.Token, HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, Path: "/", MaxAge: maxAge})
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"token": res.Token, "tenant_id": res.TenantID, "user_id": res.UserID})
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
	summary, err := rt.analyticsSvc.Summary(tid, scaleID)
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(summary)
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
	// collaborators subresource
	if len(parts) >= 2 && parts[1] == "collaborators" {
		// invite endpoint: /api/admin/scales/{id}/collaborators/invite
		if len(parts) >= 3 && parts[2] == "invite" {
			if r.Method != http.MethodPost {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			tenantID, ok := middleware.TenantIDFromContext(r.Context())
			if !ok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			sc := rt.store.GetScale(id)
			if sc == nil || sc.TenantID != tenantID {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			var in struct {
				Email string `json:"email"`
				Role  string `json:"role"`
			}
			if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			// generate a short URL-safe token
			token := strings.ReplaceAll(base64.StdEncoding.EncodeToString([]byte(time.Now().Format(time.RFC3339Nano)+":"+id+":"+in.Email)), "=", "")
			if len(token) > 32 {
				token = token[:32]
			}
			inv := &ScaleInvite{Token: token, TenantID: sc.TenantID, ScaleID: id, Email: strings.TrimSpace(in.Email), Role: strings.TrimSpace(in.Role), CreatedAt: time.Now().UTC(), ExpiresAt: time.Now().UTC().Add(7 * 24 * time.Hour)}
			if _, err := rt.store.CreateInvite(inv); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"token":      token,
				"expires_at": inv.ExpiresAt.Format(time.RFC3339),
				"invite_url": "/auth?invite=" + token + "&email=" + inv.Email,
			})
			return
		}
		rt.handleAdminScaleCollaborators(w, r, id)
		return
	}
	if len(parts) == 3 && parts[1] == "items" && parts[2] == "reorder" && r.Method == http.MethodPut {
		rt.handleAdminScaleReorderItems(w, r, id)
		return
	}
	switch r.Method {
	case http.MethodGet:
		rt.handleAdminScaleGet(w, r, id, parts)
	case http.MethodDelete:
		rt.handleAdminScaleDelete(w, r, id, parts)
	case http.MethodPut:
		rt.handleAdminScaleUpdate(w, r, id)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAdminScaleCollaborators reduces cyclomatic complexity in handleAdminScaleOps by
// factoring the collaborators subresource logic into a dedicated helper.
func (rt *Router) handleAdminScaleCollaborators(w http.ResponseWriter, r *http.Request, scaleID string) {
	tenantID, ok := middleware.TenantIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodGet:
		list, err := rt.teamSvc.List(tenantID, scaleID)
		if err != nil {
			rt.writeServiceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"collaborators": list})
	case http.MethodPost:
		var in struct {
			Email string `json:"email"`
			Role  string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		c, err := rt.teamSvc.Add(tenantID, scaleID, strings.TrimSpace(in.Email), strings.TrimSpace(in.Role), actorEmail(r))
		if err != nil {
			rt.writeServiceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(c)
	case http.MethodDelete:
		userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
		if userID == "" {
			http.Error(w, "user_id required", http.StatusBadRequest)
			return
		}
		if err := rt.teamSvc.Remove(tenantID, scaleID, userID, actorEmail(r)); err != nil {
			rt.writeServiceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// Helper: reorder items under a scale
func (rt *Router) handleAdminScaleReorderItems(w http.ResponseWriter, r *http.Request, scaleID string) {
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
	count, err := rt.scaleSvc.ReorderItems(tid, scaleID, in.Order)
	if err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "count": count})
}

// Helper: GET scale or items
func (rt *Router) handleAdminScaleGet(w http.ResponseWriter, r *http.Request, scaleID string, parts []string) {
	if len(parts) == 2 && parts[1] == "items" {
		items, err := rt.scaleSvc.ListItems(scaleID)
		if err != nil {
			rt.writeServiceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"items": items})
		return
	}
	sc, err := rt.scaleSvc.GetScale(scaleID)
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
}

// Helper: DELETE scale or responses
func (rt *Router) handleAdminScaleDelete(w http.ResponseWriter, r *http.Request, scaleID string, parts []string) {
	if len(parts) == 2 && parts[1] == "responses" {
		tid, ok := middleware.TenantIDFromContext(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		removed, err := rt.scaleSvc.DeleteScaleResponses(tid, scaleID, actorEmail(r))
		if err != nil {
			rt.writeServiceError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "removed": removed})
		return
	}
	if err := rt.scaleSvc.DeleteScale(scaleID, actorEmail(r)); err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

// Helper: PUT update scale
func (rt *Router) handleAdminScaleUpdate(w http.ResponseWriter, r *http.Request, scaleID string) {
	var raw map[string]any
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := rt.scaleSvc.UpdateScale(scaleID, raw, actorEmail(r)); err != nil {
		rt.writeServiceError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
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
		case services.ErrorTooManyRequests:
			status = http.StatusTooManyRequests
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

// GET /api/auth/me — return current authenticated user info (requires valid token)
func (rt *Router) handleAuthMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Require claims
	if c, ok := middleware.ClaimsFromContext(r.Context()); ok {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"user_id": c.UID, "tenant_id": c.TID, "email": c.Email})
		return
	}
	http.Error(w, "unauthorized", http.StatusUnauthorized)
}
