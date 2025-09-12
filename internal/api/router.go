package api

import (
    "encoding/json"
    "net/http"
    "sort"
    "strings"
    "time"

    "github.com/google/uuid"
    "github.com/soaringjerry/Synap/internal/services"
)

type Router struct {
    store *memoryStore
}

func NewRouter() *Router {
    return &Router{store: newMemoryStore()}
}

func (rt *Router) Register(mux *http.ServeMux) {
    mux.HandleFunc("/api/seed", rt.handleSeed)                   // POST
    mux.HandleFunc("/api/scales", rt.handleScales)               // POST
    mux.HandleFunc("/api/items", rt.handleItems)                 // POST
    mux.HandleFunc("/api/scales/", rt.handleScaleScoped)         // GET /api/scales/{id}/items
    mux.HandleFunc("/api/responses/bulk", rt.handleBulkResponses) // POST
    mux.HandleFunc("/api/export", rt.handleExport)               // GET
    mux.HandleFunc("/api/metrics/alpha", rt.handleAlpha)         // GET
}

// POST /api/seed — create a sample scale+items
func (rt *Router) handleSeed(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        return
    }
    sc := &Scale{ID: "SAMPLE", Points: 5, Randomize: false, NameI18n: map[string]string{"en": "Sample Scale", "zh": "示例量表"}}
    rt.store.addScale(sc)
    items := []*Item{
        {ID: "I1", ScaleID: sc.ID, ReverseScored: false, StemI18n: map[string]string{"en": "I am satisfied with my current study progress.", "zh": "我对当前学习进度感到满意"}},
        {ID: "I2", ScaleID: sc.ID, ReverseScored: true, StemI18n: map[string]string{"en": "I enjoy working under pressure.", "zh": "我喜欢在压力下工作"}},
        {ID: "I3", ScaleID: sc.ID, ReverseScored: false, StemI18n: map[string]string{"en": "I can stay focused on tasks.", "zh": "我能专注于手头任务"}},
    }
    for _, it := range items { rt.store.addItem(it) }
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "scale_id": sc.ID, "items": items})
}

// POST /api/scales
func (rt *Router) handleScales(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost { http.Error(w, "method not allowed", http.StatusMethodNotAllowed); return }
    var sc Scale
    if err := json.NewDecoder(r.Body).Decode(&sc); err != nil { http.Error(w, err.Error(), http.StatusBadRequest); return }
    if sc.ID == "" { sc.ID = strings.ReplaceAll(uuid.NewString(), "-", "")[:8] }
    if sc.Points == 0 { sc.Points = 5 }
    rt.store.addScale(&sc)
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(sc)
}

// POST /api/items
func (rt *Router) handleItems(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost { http.Error(w, "method not allowed", http.StatusMethodNotAllowed); return }
    var it Item
    if err := json.NewDecoder(r.Body).Decode(&it); err != nil { http.Error(w, err.Error(), http.StatusBadRequest); return }
    if it.ID == "" { it.ID = strings.ReplaceAll(uuid.NewString(), "-", "")[:8] }
    if it.ScaleID == "" { http.Error(w, "scale_id required", http.StatusBadRequest); return }
    if it.StemI18n == nil || len(it.StemI18n) == 0 { http.Error(w, "stem_i18n required", http.StatusBadRequest); return }
    rt.store.addItem(&it)
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(it)
}

// GET /api/scales/{id}/items?lang=xx
func (rt *Router) handleScaleScoped(w http.ResponseWriter, r *http.Request) {
    if !strings.HasPrefix(r.URL.Path, "/api/scales/") { http.NotFound(w, r); return }
    rest := strings.TrimPrefix(r.URL.Path, "/api/scales/")
    parts := strings.Split(rest, "/")
    if len(parts) < 2 || parts[1] != "items" { http.NotFound(w, r); return }
    id := parts[0]
    lang := r.URL.Query().Get("lang")
    if lang == "" { lang = "en" }
    items := rt.store.listItems(id)
    type outItem struct { ID string `json:"id"`; ReverseScored bool `json:"reverse_scored"`; Stem string `json:"stem"` }
    out := make([]outItem, 0, len(items))
    for _, it := range items {
        stem := it.StemI18n[lang]
        if stem == "" { stem = it.StemI18n["en"] }
        out = append(out, outItem{ID: it.ID, ReverseScored: it.ReverseScored, Stem: stem})
    }
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(map[string]any{"scale_id": id, "items": out})
}

// POST /api/responses/bulk
// { participant: {email?: string}, scale_id: string, answers: [{item_id, raw_value}] }
func (rt *Router) handleBulkResponses(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost { http.Error(w, "method not allowed", http.StatusMethodNotAllowed); return }
    var req struct {
        Participant struct { Email string `json:"email"` } `json:"participant"`
        ScaleID    string `json:"scale_id"`
        Answers    []struct { ItemID string `json:"item_id"`; Raw int `json:"raw_value"` } `json:"answers"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil { http.Error(w, err.Error(), http.StatusBadRequest); return }
    sc := rt.store.getScale(req.ScaleID)
    if sc == nil { http.Error(w, "scale not found", http.StatusNotFound); return }
    pid := strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
    rt.store.addParticipant(&Participant{ID: pid, Email: req.Participant.Email})
    now := time.Now().UTC()
    rs := make([]*Response, 0, len(req.Answers))
    for _, a := range req.Answers {
        it := rt.store.items[a.ItemID]
        if it == nil { continue }
        score := a.Raw
        if it.ReverseScored { score = services.ReverseScore(score, sc.Points) }
        rs = append(rs, &Response{ParticipantID: pid, ItemID: a.ItemID, RawValue: a.Raw, ScoreValue: score, SubmittedAt: now})
    }
    rt.store.addResponses(rs)
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "participant_id": pid, "count": len(rs)})
}

// GET /api/export?scale_id=...&format=long|wide|score
func (rt *Router) handleExport(w http.ResponseWriter, r *http.Request) {
    scaleID := r.URL.Query().Get("scale_id")
    format := r.URL.Query().Get("format")
    if scaleID == "" { http.Error(w, "scale_id required", http.StatusBadRequest); return }
    if format == "" { format = "long" }
    items := rt.store.listItems(scaleID)
    rs := rt.store.listResponsesByScale(scaleID)

    switch format {
    case "long":
        rows := make([]services.LongRow, 0, len(rs))
        for _, r := range rs {
            rows = append(rows, services.LongRow{ParticipantID: r.ParticipantID, ItemID: r.ItemID, RawValue: r.RawValue, ScoreValue: r.ScoreValue, SubmittedAt: r.SubmittedAt.Format(time.RFC3339)})
        }
        b, err := services.ExportLongCSV(rows)
        if err != nil { http.Error(w, err.Error(), http.StatusInternalServerError); return }
        w.Header().Set("Content-Type", "text/csv")
        w.Header().Set("Content-Disposition", "attachment; filename=long.csv")
        _, _ = w.Write(b)
        return
    case "wide":
        // map[pid]map[itemID]score
        mp := map[string]map[string]int{}
        for _, r := range rs {
            if mp[r.ParticipantID] == nil { mp[r.ParticipantID] = map[string]int{} }
            mp[r.ParticipantID][r.ItemID] = r.ScoreValue
        }
        b, err := services.ExportWideCSV(mp)
        if err != nil { http.Error(w, err.Error(), http.StatusInternalServerError); return }
        w.Header().Set("Content-Type", "text/csv")
        w.Header().Set("Content-Disposition", "attachment; filename=wide.csv")
        _, _ = w.Write(b)
        return
    case "score":
        // totals per pid
        totals := map[string][]int{}
        // item order by id
        iids := make([]string, 0, len(items))
        for _, it := range items { iids = append(iids, it.ID) }
        sort.Strings(iids)
        for _, r := range rs {
            totals[r.ParticipantID] = append(totals[r.ParticipantID], r.ScoreValue)
        }
        b, err := services.ExportScoreCSV(totals)
        if err != nil { http.Error(w, err.Error(), http.StatusInternalServerError); return }
        w.Header().Set("Content-Type", "text/csv")
        w.Header().Set("Content-Disposition", "attachment; filename=score.csv")
        _, _ = w.Write(b)
        return
    default:
        http.Error(w, "unsupported format", http.StatusBadRequest)
        return
    }
}

// GET /api/metrics/alpha?scale_id=...
func (rt *Router) handleAlpha(w http.ResponseWriter, r *http.Request) {
    scaleID := r.URL.Query().Get("scale_id")
    if scaleID == "" { http.Error(w, "scale_id required", http.StatusBadRequest); return }
    items := rt.store.listItems(scaleID)
    rs := rt.store.listResponsesByScale(scaleID)
    // Build matrix [participants][items] with only rows that have all items
    // map[pid]map[itemID]score
    mp := map[string]map[string]float64{}
    for _, r := range rs {
        if mp[r.ParticipantID] == nil { mp[r.ParticipantID] = map[string]float64{} }
        mp[r.ParticipantID][r.ItemID] = float64(r.ScoreValue)
    }
    // item order
    iids := make([]string, 0, len(items))
    for _, it := range items { iids = append(iids, it.ID) }
    sort.Strings(iids)
    matrix := make([][]float64, 0, len(mp))
    for pid, m := range mp {
        row := make([]float64, 0, len(iids))
        complete := true
        for _, iid := range iids {
            v, ok := m[iid]
            if !ok { complete = false; break }
            row = append(row, v)
        }
        if complete { matrix = append(matrix, row) }
        _ = pid
    }
    alpha := services.CronbachAlpha(matrix)
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(map[string]any{"scale_id": scaleID, "alpha": alpha, "n": len(matrix)})
}
