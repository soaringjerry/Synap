package api

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/soaringjerry/Synap/internal/middleware"
	"github.com/soaringjerry/Synap/internal/services"
	"golang.org/x/crypto/bcrypt"
)

type Router struct {
	store    *memoryStore
	signPriv ed25519.PrivateKey
}

func NewRouter() *Router {
	// Optionally load snapshot from disk via SYNAP_DB_PATH (MVP persistence)
	// If empty or unavailable, fall back to pure in-memory.
	if s := newMemoryStoreFromEnv(); s != nil {
		return &Router{store: s, signPriv: deriveSignKey()}
	}
	log.Printf("persistence disabled: set SYNAP_DB_PATH and SYNAP_ENC_KEY to enable encrypted storage")
	return &Router{store: newMemoryStore(""), signPriv: deriveSignKey()}
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
	sc := &Scale{ID: "SAMPLE", Points: 5, Randomize: false, NameI18n: map[string]string{"en": "Sample Scale", "zh": "示例量表"}}
	// Upsert-like behavior: if exists, keep; else add
	if rt.store.getScale(sc.ID) == nil {
		rt.store.addScale(sc)
	}
	items := []*Item{
		{ID: "I1", ScaleID: sc.ID, ReverseScored: false, StemI18n: map[string]string{"en": "I am satisfied with my current study progress.", "zh": "我对当前学习进度感到满意"}},
		{ID: "I2", ScaleID: sc.ID, ReverseScored: true, StemI18n: map[string]string{"en": "I enjoy working under pressure.", "zh": "我喜欢在压力下工作"}},
		{ID: "I3", ScaleID: sc.ID, ReverseScored: false, StemI18n: map[string]string{"en": "I can stay focused on tasks.", "zh": "我能专注于手头任务"}},
	}
	for _, it := range items {
		// Avoid duplicate append in itemsByScale; only add if not present
		if rt.store.items[it.ID] == nil {
			rt.store.addItem(it)
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
	b, _ := json.Marshal(raw)
	var sc Scale
	_ = json.Unmarshal(b, &sc)
	// Default: Turnstile is disabled unless explicitly enabled by the creator
	if _, ok := raw["turnstile_enabled"]; !ok {
		sc.TurnstileEnabled = false
	}
	if sc.ID == "" {
		sc.ID = strings.ReplaceAll(uuid.NewString(), "-", "")[:8]
	}
	if sc.Points == 0 {
		sc.Points = 5
	}
	sc.TenantID = tid
	rt.store.addScale(&sc)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(sc)
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
	var it Item
	if err := json.NewDecoder(r.Body).Decode(&it); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if it.ID == "" {
		it.ID = strings.ReplaceAll(uuid.NewString(), "-", "")[:8]
	}
	if it.ScaleID == "" {
		http.Error(w, "scale_id required", http.StatusBadRequest)
		return
	}
	if len(it.StemI18n) == 0 {
		http.Error(w, "stem_i18n required", http.StatusBadRequest)
		return
	}
	sc := rt.store.getScale(it.ScaleID)
	if sc == nil || sc.TenantID != tid {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	rt.store.addItem(&it)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(it)
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
	items := rt.store.listItems(id)
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
	sc := rt.store.getScale(id)
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
	sc := rt.store.getScale(in.ScaleID)
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
	rt.store.addConsentRecord(&ConsentRecord{ID: id, ScaleID: in.ScaleID, Version: in.Version, Choices: in.Choices, Locale: in.Locale, SignedAt: ts, Hash: hash})
	// audit
	rt.store.addAudit(AuditEntry{Time: time.Now(), Actor: "participant", Action: "consent_sign", Target: in.ScaleID, Note: id})
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
	sc := rt.store.getScale(req.ScaleID)
	if sc == nil {
		http.Error(w, "scale not found", http.StatusNotFound)
		return
	}
	// Turnstile verification if enabled for this scale
	if sc.TurnstileEnabled {
		if ok := rt.verifyTurnstile(r, req.TurnstileToken); !ok {
			http.Error(w, "turnstile verification failed", http.StatusBadRequest)
			return
		}
	}
	// E2EE projects must not accept plaintext submissions
	if sc.E2EEEnabled {
		http.Error(w, "plaintext submissions are disabled for E2EE projects", http.StatusBadRequest)
		return
	}
	pid := strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	p := &Participant{ID: pid, Email: req.Participant.Email}
	if req.ConsentID != "" {
		if c := rt.store.getConsentByID(req.ConsentID); c != nil && c.ScaleID == req.ScaleID {
			p.ConsentID = req.ConsentID
		}
	}
	rt.store.addParticipant(p)
	now := time.Now().UTC()
	rs := make([]*Response, 0, len(req.Answers))
	for _, a := range req.Answers {
		it := rt.store.items[a.ItemID]
		if it == nil {
			continue
		}
		// Determine raw numeric if available
		rawNum := 0
		hadNum := false
		if a.RawInt != nil {
			rawNum = *a.RawInt
			hadNum = true
		} else if len(a.Raw) > 0 {
			var tmpNum float64
			if err := json.Unmarshal(a.Raw, &tmpNum); err == nil {
				rawNum = int(tmpNum)
				hadNum = true
			}
		}
		// Prepare Response
		rec := &Response{ParticipantID: pid, ItemID: a.ItemID, SubmittedAt: now}
		// If the item is Likert or numeric-like, use numeric raw/score
		itype := it.Type
		if itype == "" {
			itype = "likert"
		}
		switch itype {
		case "likert":
			if !hadNum {
				// attempt parse from raw JSON string
				var s string
				if len(a.Raw) > 0 && json.Unmarshal(a.Raw, &s) == nil {
					if n, err := strconv.Atoi(strings.TrimSpace(s)); err == nil {
						rawNum = n
						hadNum = true
					}
				}
			}
			if hadNum {
				rec.RawValue = rawNum
				score := rawNum
				if it.ReverseScored {
					score = services.ReverseScore(score, sc.Points)
				}
				rec.ScoreValue = score
			}
		case "rating", "slider", "numeric":
			if hadNum {
				rec.RawValue = rawNum
				rec.ScoreValue = rawNum
			}
		default:
			// Non-numeric: store raw JSON as-is; keep score 0
		}
		if len(a.Raw) > 0 {
			rec.RawJSON = string(a.Raw)
		} else if hadNum {
			rec.RawJSON = strconv.Itoa(rawNum)
		}
		rs = append(rs, rec)
	}
	rt.store.addResponses(rs)
	w.Header().Set("Content-Type", "application/json")
	// Provide self-service capability for GDPR export/delete
	selfBase := "/api/self/participant"
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":             true,
		"participant_id": pid,
		"count":          len(rs),
		"self_token":     p.SelfToken,
		"self_export":    selfBase + "/export?pid=" + pid + "&token=" + p.SelfToken,
		"self_delete":    selfBase + "/delete?pid=" + pid + "&token=" + p.SelfToken,
	})
}

// GET /api/export?scale_id=...&format=long|wide|score
func (rt *Router) handleExport(w http.ResponseWriter, r *http.Request) {
	scaleID := r.URL.Query().Get("scale_id")
	format := r.URL.Query().Get("format")
	sc := rt.store.getScale(scaleID)
	// consent header naming: key (default) | label_en | label_zh
	consentHeader := r.URL.Query().Get("consent_header")
	if consentHeader == "" {
		consentHeader = "key"
	}
	if scaleID == "" {
		http.Error(w, "scale_id required", http.StatusBadRequest)
		return
	}
	if format == "" {
		format = "long"
	}
	// Disallow plaintext CSV exports for E2EE projects
	if sc != nil && sc.E2EEEnabled {
		http.Error(w, "CSV exports are disabled for E2EE projects", http.StatusBadRequest)
		return
	}
	items := rt.store.listItems(scaleID)
	rs := rt.store.listResponsesByScale(scaleID)

	switch format {
	case "long":
		rows := rt.buildLongRows(rs)
		rt.appendConsentLongNamed(&rows, rs, scaleID, consentHeader)
		b, err := services.ExportLongCSV(rows)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", "attachment; filename=long.csv")
		_, _ = w.Write([]byte{0xEF, 0xBB, 0xBF})
		_, _ = w.Write(b)
		return
	case "wide":
		mp := rt.buildWideMap(rs)
		rt.mergeConsentWideNamed(mp, rs, scaleID, consentHeader)
		b, err := services.ExportWideCSV(mp)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", "attachment; filename=wide.csv")
		_, _ = w.Write([]byte{0xEF, 0xBB, 0xBF})
		_, _ = w.Write(b)
		return
	case "score":
		totals := rt.buildTotals(items, rs)
		b, err := services.ExportScoreCSV(totals)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", "attachment; filename=score.csv")
		_, _ = w.Write([]byte{0xEF, 0xBB, 0xBF})
		_, _ = w.Write(b)
		return
	default:
		http.Error(w, "unsupported format", http.StatusBadRequest)
		return
	}
}

// buildLongRows converts responses into LongRow slice
func (rt *Router) buildLongRows(rs []*Response) []services.LongRow {
	out := make([]services.LongRow, 0, len(rs))
	for _, r := range rs {
		out = append(out, services.LongRow{ParticipantID: r.ParticipantID, ItemID: r.ItemID, RawValue: r.RawValue, ScoreValue: r.ScoreValue, SubmittedAt: r.SubmittedAt.Format(time.RFC3339)})
	}
	return out
}

// buildWideMap converts responses into map[participant]map[item]score
func (rt *Router) buildWideMap(rs []*Response) map[string]map[string]int {
	mp := map[string]map[string]int{}
	for _, r := range rs {
		if mp[r.ParticipantID] == nil {
			mp[r.ParticipantID] = map[string]int{}
		}
		mp[r.ParticipantID][r.ItemID] = r.ScoreValue
	}
	return mp
}

// buildTotals sums scores per participant for score CSV
func (rt *Router) buildTotals(_ []*Item, rs []*Response) map[string][]int {
	totals := map[string][]int{}
	for _, r := range rs {
		totals[r.ParticipantID] = append(totals[r.ParticipantID], r.ScoreValue)
	}
	return totals
}

// appendConsentLong appends consent choices as pseudo-items to long rows
func (rt *Router) appendConsentLong(rows *[]services.LongRow, rs []*Response, scaleID string) { // legacy; use appendConsentLongNamed
	pidSet := map[string]struct{}{}
	for _, r := range rs {
		pidSet[r.ParticipantID] = struct{}{}
	}
	for pid := range pidSet {
		p := rt.store.participants[pid]
		if p == nil || p.ConsentID == "" {
			continue
		}
		c := rt.store.getConsentByID(p.ConsentID)
		if c == nil || c.ScaleID != scaleID {
			continue
		}
		for k, v := range c.Choices {
			val := 0
			if v {
				val = 1
			}
			*rows = append(*rows, services.LongRow{ParticipantID: pid, ItemID: "consent." + k, RawValue: val, ScoreValue: val, SubmittedAt: c.SignedAt.Format(time.RFC3339)})
		}
	}
}

// mergeConsentWide merges consent choices into the wide map as consent.<key> columns (legacy)
func (rt *Router) mergeConsentWide(mp map[string]map[string]int, rs []*Response, scaleID string) {
	pidSet := map[string]struct{}{}
	for _, r := range rs {
		pidSet[r.ParticipantID] = struct{}{}
	}
	for pid := range pidSet {
		p := rt.store.participants[pid]
		if p == nil || p.ConsentID == "" {
			continue
		}
		c := rt.store.getConsentByID(p.ConsentID)
		if c == nil || c.ScaleID != scaleID {
			continue
		}
		if mp[pid] == nil {
			mp[pid] = map[string]int{}
		}
		for k, v := range c.Choices {
			if v {
				mp[pid]["consent."+k] = 1
			} else {
				mp[pid]["consent."+k] = 0
			}
		}
	}
}

// Helper: find label for consent key in a scale for given lang
func (rt *Router) consentLabel(sc *Scale, key, lang string) string {
	if sc == nil || sc.ConsentConfig == nil {
		return ""
	}
	for _, o := range sc.ConsentConfig.Options {
		if o.Key == key {
			if o.LabelI18n != nil {
				if s := o.LabelI18n[lang]; s != "" {
					return s
				}
				if s := o.LabelI18n["en"]; s != "" {
					return s
				}
			}
			break
		}
	}
	return ""
}

// appendConsentLongNamed appends consent choices with configurable item_id naming: key (default) or label_en/label_zh
func (rt *Router) appendConsentLongNamed(rows *[]services.LongRow, rs []*Response, scaleID, mode string) {
	pidSet := map[string]struct{}{}
	for _, r := range rs {
		pidSet[r.ParticipantID] = struct{}{}
	}
	sc := rt.store.getScale(scaleID)
	lang := "en"
	if mode == "label_zh" {
		lang = "zh"
	}
	for pid := range pidSet {
		p := rt.store.participants[pid]
		if p == nil || p.ConsentID == "" {
			continue
		}
		c := rt.store.getConsentByID(p.ConsentID)
		if c == nil || c.ScaleID != scaleID {
			continue
		}
		for k, v := range c.Choices {
			val := 0
			if v {
				val = 1
			}
			name := "consent." + k
			if mode == "label_en" || mode == "label_zh" {
				if lbl := rt.consentLabel(sc, k, lang); lbl != "" {
					name = lbl
				}
			}
			*rows = append(*rows, services.LongRow{ParticipantID: pid, ItemID: name, RawValue: val, ScoreValue: val, SubmittedAt: c.SignedAt.Format(time.RFC3339)})
		}
	}
}

// mergeConsentWideNamed merges consent with configurable column naming: key (default) or label_en/label_zh
func (rt *Router) mergeConsentWideNamed(mp map[string]map[string]int, rs []*Response, scaleID, mode string) {
	pidSet := map[string]struct{}{}
	for _, r := range rs {
		pidSet[r.ParticipantID] = struct{}{}
	}
	sc := rt.store.getScale(scaleID)
	lang := "en"
	if mode == "label_zh" {
		lang = "zh"
	}
	// helper to ensure unique column names
	colName := func(existing map[string]int, base string) string {
		name := base
		if _, ok := existing[name]; !ok {
			return name
		}
		// If duplicate, suffix with (n)
		for i := 2; ; i++ {
			cand := fmt.Sprintf("%s (%d)", base, i)
			if _, ok := existing[cand]; !ok {
				return cand
			}
		}
	}
	// Build participant-wise
	for pid := range pidSet {
		p := rt.store.participants[pid]
		if p == nil || p.ConsentID == "" {
			continue
		}
		c := rt.store.getConsentByID(p.ConsentID)
		if c == nil || c.ScaleID != scaleID {
			continue
		}
		if mp[pid] == nil {
			mp[pid] = map[string]int{}
		}
		for k, v := range c.Choices {
			name := "consent." + k
			if mode == "label_en" || mode == "label_zh" {
				if lbl := rt.consentLabel(sc, k, lang); lbl != "" {
					name = lbl
				}
				// ensure uniqueness per participant row map
				name = colName(mp[pid], name)
			}
			if v {
				mp[pid][name] = 1
			} else {
				mp[pid][name] = 0
			}
		}
	}
}

// GET /api/admin/participant/export?email=...
func (rt *Router) handleExportParticipant(w http.ResponseWriter, r *http.Request) {
	email := strings.TrimSpace(r.URL.Query().Get("email"))
	if email == "" {
		http.Error(w, "email required", http.StatusBadRequest)
		return
	}
	rs, p := rt.store.exportParticipantByEmail(email)
	if p == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	// audit
	actor := "admin"
	if c, ok := middleware.ClaimsFromContext(r.Context()); ok {
		actor = c.Email
	}
	rt.store.addAudit(AuditEntry{Time: time.Now(), Actor: actor, Action: "export_participant", Target: email})
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
	ok := rt.store.deleteParticipantByEmail(email, hard)
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	actor := "admin"
	if c, ok := middleware.ClaimsFromContext(r.Context()); ok {
		actor = c.Email
	}
	rt.store.addAudit(AuditEntry{Time: time.Now(), Actor: actor, Action: "delete_participant", Target: email, Note: map[bool]string{true: "hard", false: "soft"}[hard]})
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
		ks := rt.store.listProjectKeys(id)
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
		sc := rt.store.getScale(id)
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
		rt.store.addProjectKey(k)
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
	if sc := rt.store.getScale(in.ScaleID); sc != nil && sc.TurnstileEnabled {
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
	rt.store.addE2EEResponse(&E2EEResponse{
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
		sc := rt.store.getScale(in.ScaleID)
		if sc == nil || sc.TenantID != tid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if !rt.store.allowExport(tid, 5*time.Second) {
			http.Error(w, "too many requests", http.StatusTooManyRequests)
			return
		}
		ip := r.Header.Get("X-Forwarded-For")
		if ip == "" {
			ip = r.RemoteAddr
		}
		job := rt.store.createExportJob(tid, in.ScaleID, ip, 5*time.Minute)
		rt.store.addAudit(AuditEntry{Time: time.Now(), Actor: actorEmail(r), Action: "export_e2ee_request", Target: in.ScaleID, Note: job.ID})
		url := fmt.Sprintf("/api/exports/e2ee?job=%s&token=%s", job.ID, job.Token)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"url": url, "expires_at": job.ExpiresAt.UTC().Format(time.RFC3339)})
		return
	case http.MethodGet:
		// If a job token is provided, use tokenized download; else allow legacy scale_id path with step-up
		if jobID := r.URL.Query().Get("job"); jobID != "" {
			token := r.URL.Query().Get("token")
			job := rt.store.getExportJob(jobID, token)
			if job == nil || job.TenantID != tid {
				http.Error(w, "invalid or expired job", http.StatusForbidden)
				return
			}
			sc := rt.store.getScale(job.ScaleID)
			if sc == nil || sc.TenantID != tid {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			rs := rt.store.listE2EEResponses(job.ScaleID)
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
			rt.store.addAudit(AuditEntry{Time: time.Now(), Actor: actorEmail(r), Action: "export_e2ee_download", Target: job.ScaleID, Note: base64.StdEncoding.EncodeToString(h[:])})
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
		sc := rt.store.getScale(scaleID)
		if sc == nil || sc.TenantID != tid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		rs := rt.store.listE2EEResponses(scaleID)
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
	sc := rt.store.getScale(in.ScaleID)
	if sc == nil || sc.TenantID != tid {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	rs := rt.store.listE2EEResponses(in.ScaleID)
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
	sc := rt.store.getScale(in.ScaleID)
	if sc == nil || sc.TenantID != tid {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	// append new encDEK
	// naive O(n^2) since MVP and data size small
	for _, it := range in.Items {
		list := rt.store.listE2EEResponses(in.ScaleID)
		for _, r2 := range list {
			if r2.ResponseID == it.ResponseID {
				r2.EncDEK = append(r2.EncDEK, it.EncDEKNew)
			}
		}
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
		cfg := rt.store.getAIConfig(tid)
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
		rt.store.upsertAIConfig(&in)
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
	if req.ScaleID == "" || len(req.TargetLangs) == 0 {
		http.Error(w, "scale_id and target_langs required", http.StatusBadRequest)
		return
	}
	sc := rt.store.getScale(req.ScaleID)
	if sc == nil || sc.TenantID != tid {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	cfg := rt.store.getAIConfig(tid)
	if cfg == nil || !cfg.AllowExternal || cfg.OpenAIKey == "" {
		http.Error(w, "external AI disabled or missing key", http.StatusBadRequest)
		return
	}
	if req.Model == "" {
		req.Model = "gpt-4o-mini"
	}
	// Build source payload
	items := rt.store.listItems(req.ScaleID)
	type srcItem struct{ ID, Text string }
	src := struct {
		Items       []srcItem         `json:"items"`
		NameI18n    map[string]string `json:"name_i18n,omitempty"`
		ConsentI18n map[string]string `json:"consent_i18n,omitempty"`
		Targets     []string          `json:"targets"`
	}{Items: []srcItem{}, NameI18n: sc.NameI18n, ConsentI18n: sc.ConsentI18n, Targets: req.TargetLangs}
	for _, it := range items {
		text := it.StemI18n["en"]
		if text == "" {
			// pick any available
			for _, v := range it.StemI18n {
				text = v
				break
			}
		}
		src.Items = append(src.Items, srcItem{ID: it.ID, Text: text})
	}
	body, _ := json.Marshal(src)
	prompt := "Translate the following JSON payload into the target languages. Return ONLY a JSON object with fields: items (map of item_id to {lang:text}), name_i18n (map), consent_i18n (map). Keep placeholders and numeric scales intact."
	// Call OpenAI Chat Completions
	endpoint := strings.TrimRight(cfg.OpenAIBase, "/")
	if endpoint == "" {
		endpoint = "https://api.openai.com"
	}
	if strings.HasSuffix(endpoint, "/chat/completions") {
		// ok
	} else if strings.HasSuffix(endpoint, "/v1") {
		endpoint = endpoint + "/chat/completions"
	} else if strings.HasSuffix(endpoint, "/v1/") {
		endpoint = strings.TrimRight(endpoint, "/") + "/chat/completions"
	} else {
		endpoint = endpoint + "/v1/chat/completions"
	}
	pay := map[string]any{
		"model":       req.Model,
		"temperature": 0.2,
		"messages": []map[string]string{
			{"role": "system", "content": prompt},
			{"role": "user", "content": string(body)},
		},
		"response_format": map[string]string{"type": "json_object"},
	}
	pb, _ := json.Marshal(pay)
	httpReq, _ := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(pb))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+cfg.OpenAIKey)
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		http.Error(w, string(b), http.StatusBadGateway)
		return
	}
	var cc struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&cc); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if len(cc.Choices) == 0 {
		http.Error(w, "no choices", http.StatusBadGateway)
		return
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(cc.Choices[0].Message.Content), &out); err != nil {
		http.Error(w, "invalid JSON from model", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// GET /api/admin/audit
func (rt *Router) handleAudit(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rt.store.listAudit())
}

// GET /api/metrics/alpha?scale_id=...
func (rt *Router) handleAlpha(w http.ResponseWriter, r *http.Request) {
	scaleID := r.URL.Query().Get("scale_id")
	if scaleID == "" {
		http.Error(w, "scale_id required", http.StatusBadRequest)
		return
	}
	items := rt.store.listItems(scaleID)
	rs := rt.store.listResponsesByScale(scaleID)
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
	if req.Email == "" || req.Password == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "email/password required"})
		return
	}
	if rt.store.findUserByEmail(req.Email) != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "email exists"})
		return
	}
	tid := "t" + strings.ReplaceAll(uuid.NewString(), "-", "")[:7]
	rt.store.addTenant(&Tenant{ID: tid, Name: req.TenantName})
	// hash password
	hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	uid := "u" + strings.ReplaceAll(uuid.NewString(), "-", "")[:7]
	rt.store.addUser(&User{ID: uid, Email: req.Email, PassHash: hash, TenantID: tid, CreatedAt: time.Now().UTC()})
	tok, _ := middleware.SignToken(uid, tid, req.Email, 30*24*time.Hour)
	// Also set secure cookie for CSRF-safe usage
	http.SetCookie(w, &http.Cookie{Name: "synap_token", Value: tok, HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, Path: "/", MaxAge: int((30 * 24 * time.Hour).Seconds())})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"token": tok, "tenant_id": tid, "user_id": uid})
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
	u := rt.store.findUserByEmail(req.Email)
	if u == nil || bcrypt.CompareHashAndPassword(u.PassHash, []byte(req.Password)) != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "invalid credentials"})
		return
	}
	tok, _ := middleware.SignToken(u.ID, u.TenantID, u.Email, 30*24*time.Hour)
	http.SetCookie(w, &http.Cookie{Name: "synap_token", Value: tok, HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, Path: "/", MaxAge: int((30 * 24 * time.Hour).Seconds())})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"token": tok, "tenant_id": u.TenantID, "user_id": u.ID})
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
	list := rt.store.listScalesByTenant(tid)
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
	sc := rt.store.getScale(scaleID)
	if sc == nil || sc.TenantID != tid {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	rs := rt.store.listResponsesByScale(scaleID)
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
	sc := rt.store.getScale(scaleID)
	if sc == nil || sc.TenantID != tid {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	items := rt.store.listItems(scaleID)
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
	rs := rt.store.listResponsesByScale(scaleID)
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
	// Special subroute: reorder items
	if len(parts) == 3 && parts[1] == "items" && parts[2] == "reorder" && r.Method == http.MethodPut {
		tid, ok := middleware.TenantIDFromContext(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		sc := rt.store.getScale(id)
		if sc == nil || sc.TenantID != tid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		var in struct {
			Order []string `json:"order"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil || len(in.Order) == 0 {
			http.Error(w, "order required", http.StatusBadRequest)
			return
		}
		if ok2 := rt.store.reorderItems(id, in.Order); !ok2 {
			http.Error(w, "reorder failed", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "count": len(in.Order)})
		return
	}
	switch r.Method {
	case http.MethodGet:
		rt.adminScaleGet(w, id, parts)
	case http.MethodDelete:
		rt.adminScaleDelete(w, r, id, parts)
	case http.MethodPut:
		rt.adminScalePut(w, r, id)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (rt *Router) adminScaleGet(w http.ResponseWriter, id string, parts []string) {
	if len(parts) == 2 && parts[1] == "items" {
		items := rt.store.listItems(id)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"items": items})
		return
	}
	sc := rt.store.getScale(id)
	if sc == nil {
		http.NotFound(w, &http.Request{})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(sc)
}

func (rt *Router) adminScaleDelete(w http.ResponseWriter, r *http.Request, id string, parts []string) {
	if len(parts) == 2 && parts[1] == "responses" {
		tid, ok := middleware.TenantIDFromContext(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		sc := rt.store.getScale(id)
		if sc == nil || sc.TenantID != tid {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		n := rt.store.deleteResponsesByScale(id)
		rt.store.addAudit(AuditEntry{Time: time.Now(), Actor: actorEmail(r), Action: "purge_responses", Target: id, Note: strconv.Itoa(n)})
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "removed": n})
		return
	}
	if ok := rt.store.deleteScale(id); !ok {
		http.NotFound(w, r)
		return
	}
	rt.store.addAudit(AuditEntry{Time: time.Now(), Actor: actorEmail(r), Action: "delete_scale", Target: id})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (rt *Router) adminScalePut(w http.ResponseWriter, r *http.Request, id string) {
	var raw map[string]any
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	in := Scale{ID: id}
	if v, ok := raw["name_i18n"]; ok {
		if m, ok2 := v.(map[string]any); ok2 {
			in.NameI18n = map[string]string{}
			for k, vv := range m {
				in.NameI18n[k] = toString(vv)
			}
		}
	}
	if v, ok := raw["points"].(float64); ok {
		in.Points = int(v)
	}
	if v, ok := raw["randomize"].(bool); ok {
		in.Randomize = v
	}
	if v, ok := raw["consent_i18n"]; ok {
		if m, ok2 := v.(map[string]any); ok2 {
			in.ConsentI18n = map[string]string{}
			for k, vv := range m {
				in.ConsentI18n[k] = toString(vv)
			}
		}
	}
	if v, ok := raw["collect_email"].(string); ok {
		in.CollectEmail = v
	}
	if v, ok := raw["region"].(string); ok {
		in.Region = v
	}
	if v, ok := raw["items_per_page"].(float64); ok {
		in.ItemsPerPage = int(v)
	}
	if v, ok := raw["turnstile_enabled"].(bool); ok {
		in.TurnstileEnabled = v
	}
	// Parse consent_config if provided (use helper to reduce complexity)
	if v, ok := raw["consent_config"]; ok && v != nil {
		if m, ok2 := v.(map[string]any); ok2 {
			in.ConsentConfig = rt.parseConsentCfg(m)
		}
	}

	old := rt.store.getScale(id)
	if ok := rt.store.updateScale(&in); !ok {
		http.NotFound(w, r)
		return
	}
	if old != nil {
		if v, ok := raw["e2ee_enabled"].(bool); ok && v != old.E2EEEnabled {
			http.Error(w, "e2ee_enabled cannot be modified after creation", http.StatusBadRequest)
			return
		}
		if in.Region != "" && in.Region != old.Region {
			rt.store.addAudit(AuditEntry{Time: time.Now(), Actor: actorEmail(r), Action: "region_change", Target: id, Note: in.Region})
		}
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

func toString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case fmt.Stringer:
		return t.String()
	default:
		b, _ := json.Marshal(v)
		return strings.Trim(string(b), "\"")
	}
}

// parseConsentCfg converts a raw map into a typed ConsentConfig
func (rt *Router) parseConsentCfg(m map[string]any) *ConsentConfig {
	cc := &ConsentConfig{}
	if ver, ok := m["version"].(string); ok {
		cc.Version = ver
	}
	if sr, ok := m["signature_required"].(bool); ok {
		cc.SignatureRequired = sr
	}
	if arr, ok := m["options"].([]any); ok {
		opts := make([]ConsentOptionConf, 0, len(arr))
		for _, it := range arr {
			if om, ok2 := it.(map[string]any); ok2 {
				opt := ConsentOptionConf{}
				if k, ok3 := om["key"].(string); ok3 {
					opt.Key = k
				}
				if req, ok3 := om["required"].(bool); ok3 {
					opt.Required = req
				}
				if li, ok3 := om["label_i18n"]; ok3 {
					if lm, ok4 := li.(map[string]any); ok4 {
						opt.LabelI18n = map[string]string{}
						for lk, lv := range lm {
							opt.LabelI18n[lk] = toString(lv)
						}
					}
				}
				if gv, ok3 := om["group"]; ok3 {
					switch g := gv.(type) {
					case float64:
						opt.Group = int(g)
					case string:
						if n, err := strconv.Atoi(g); err == nil {
							opt.Group = n
						}
					}
				}
				if ov, ok3 := om["order"]; ok3 {
					switch o := ov.(type) {
					case float64:
						opt.Order = int(o)
					case string:
						if n, err := strconv.Atoi(o); err == nil {
							opt.Order = n
						}
					}
				}
				if opt.Key != "" {
					opts = append(opts, opt)
				}
			}
		}
		cc.Options = opts
	}
	return cc
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
		var in Item
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		in.ID = id
		if ok := rt.store.updateItem(&in); !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
		return
	case http.MethodDelete:
		if ok := rt.store.deleteItem(id); !ok {
			http.NotFound(w, r)
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
	if pid == "" || token == "" {
		http.Error(w, "pid/token required", http.StatusBadRequest)
		return
	}
	p := rt.store.participants[pid]
	if p == nil || p.SelfToken == "" || token != p.SelfToken {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	// collect responses for participant (non-E2EE)
	rs := []*Response{}
	for _, r2 := range rt.store.responses {
		if r2.ParticipantID == pid {
			rs = append(rs, r2)
		}
	}
	// audit
	rt.store.addAudit(AuditEntry{Time: time.Now(), Actor: "participant", Action: "self_export", Target: pid})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"participant": map[string]any{"id": p.ID, "email": p.Email}, "responses": rs})
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
	if pid == "" || token == "" {
		http.Error(w, "pid/token required", http.StatusBadRequest)
		return
	}
	p := rt.store.participants[pid]
	if p == nil || p.SelfToken == "" || token != p.SelfToken {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if ok := rt.store.deleteParticipantByID(pid, hard); !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	rt.store.addAudit(AuditEntry{Time: time.Now(), Actor: "participant", Action: map[bool]string{true: "self_delete_hard", false: "self_delete_soft"}[hard], Target: pid})
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
	if rid == "" || token == "" {
		http.Error(w, "response_id/token required", http.StatusBadRequest)
		return
	}
	var found *E2EEResponse
	for _, e := range rt.store.listE2EEResponses("") { // we'll scan all; listE2EEResponses with empty returns none; use internal slice
		if e.ResponseID == rid {
			found = e
			break
		}
	}
	if found == nil {
		// fallback: direct scan of internal slice
		for _, e := range rt.store.e2ee {
			if e.ResponseID == rid {
				found = e
				break
			}
		}
	}
	if found == nil || found.SelfToken == "" || token != found.SelfToken {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	rt.store.addAudit(AuditEntry{Time: time.Now(), Actor: "participant", Action: "self_export_e2ee", Target: rid})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(found)
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
	if rid == "" || token == "" {
		http.Error(w, "response_id/token required", http.StatusBadRequest)
		return
	}
	rt.store.mu.Lock()
	idx := -1
	for i, e := range rt.store.e2ee {
		if e.ResponseID == rid {
			idx = i
			break
		}
	}
	if idx == -1 || rt.store.e2ee[idx].SelfToken == "" || token != rt.store.e2ee[idx].SelfToken {
		rt.store.mu.Unlock()
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	rt.store.e2ee = append(rt.store.e2ee[:idx], rt.store.e2ee[idx+1:]...)
	rt.store.mu.Unlock()
	rt.store.save()
	rt.store.addAudit(AuditEntry{Time: time.Now(), Actor: "participant", Action: "self_delete_e2ee", Target: rid})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}
