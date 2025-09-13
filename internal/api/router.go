package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/soaringjerry/Synap/internal/middleware"
	"github.com/soaringjerry/Synap/internal/services"
	"golang.org/x/crypto/bcrypt"
	"log"
)

type Router struct {
	store *memoryStore
}

func NewRouter() *Router {
	// Optionally load snapshot from disk via SYNAP_DB_PATH (MVP persistence)
	// If empty or unavailable, fall back to pure in-memory.
	if s := newMemoryStoreFromEnv(); s != nil {
		return &Router{store: s}
	}
	log.Printf("persistence disabled: set SYNAP_DB_PATH and SYNAP_ENC_KEY to enable encrypted storage")
	return &Router{store: newMemoryStore("")}
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
	var sc Scale
	if err := json.NewDecoder(r.Body).Decode(&sc); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
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
		"id":            sc.ID,
		"name_i18n":     sc.NameI18n,
		"points":        sc.Points,
		"randomize":     sc.Randomize,
		"consent_i18n":  sc.ConsentI18n,
		"collect_email": sc.CollectEmail,
	})
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
	pid := strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	rt.store.addParticipant(&Participant{ID: pid, Email: req.Participant.Email})
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
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "participant_id": pid, "count": len(rs)})
}

// GET /api/export?scale_id=...&format=long|wide|score
func (rt *Router) handleExport(w http.ResponseWriter, r *http.Request) {
	scaleID := r.URL.Query().Get("scale_id")
	format := r.URL.Query().Get("format")
	if scaleID == "" {
		http.Error(w, "scale_id required", http.StatusBadRequest)
		return
	}
	if format == "" {
		format = "long"
	}
	items := rt.store.listItems(scaleID)
	rs := rt.store.listResponsesByScale(scaleID)

	switch format {
	case "long":
		rows := make([]services.LongRow, 0, len(rs))
		for _, r := range rs {
			rows = append(rows, services.LongRow{ParticipantID: r.ParticipantID, ItemID: r.ItemID, RawValue: r.RawValue, ScoreValue: r.ScoreValue, SubmittedAt: r.SubmittedAt.Format(time.RFC3339)})
		}
		b, err := services.ExportLongCSV(rows)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=long.csv")
		_, _ = w.Write(b)
		return
	case "wide":
		// map[pid]map[itemID]score
		mp := map[string]map[string]int{}
		for _, r := range rs {
			if mp[r.ParticipantID] == nil {
				mp[r.ParticipantID] = map[string]int{}
			}
			mp[r.ParticipantID][r.ItemID] = r.ScoreValue
		}
		b, err := services.ExportWideCSV(mp)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=wide.csv")
		_, _ = w.Write(b)
		return
	case "score":
		// totals per pid
		totals := map[string][]int{}
		// item order by id
		iids := make([]string, 0, len(items))
		for _, it := range items {
			iids = append(iids, it.ID)
		}
		sort.Strings(iids)
		for _, r := range rs {
			totals[r.ParticipantID] = append(totals[r.ParticipantID], r.ScoreValue)
		}
		b, err := services.ExportScoreCSV(totals)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=score.csv")
		_, _ = w.Write(b)
		return
	default:
		http.Error(w, "unsupported format", http.StatusBadRequest)
		return
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
	switch r.Method {
	case http.MethodGet:
		if len(parts) == 2 && parts[1] == "items" {
			items := rt.store.listItems(id)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"items": items})
			return
		}
		sc := rt.store.getScale(id)
		if sc == nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(sc)
		return
	case http.MethodPut:
		var in Scale
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		in.ID = id
		if ok := rt.store.updateScale(&in); !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
		return
	case http.MethodDelete:
		if ok := rt.store.deleteScale(id); !ok {
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
