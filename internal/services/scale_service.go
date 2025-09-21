package services

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

type ErrorCode string

const (
	ErrorInvalid         ErrorCode = "invalid"
	ErrorForbidden       ErrorCode = "forbidden"
	ErrorNotFound        ErrorCode = "not_found"
	ErrorConflict        ErrorCode = "conflict"
	ErrorUnauthorized    ErrorCode = "unauthorized"
	ErrorBadGateway      ErrorCode = "bad_gateway"
	ErrorTooManyRequests ErrorCode = "too_many_requests"
)

type ServiceError struct {
	Code    ErrorCode
	Message string
}

func (e *ServiceError) Error() string { return e.Message }

func NewInvalidError(msg string) error   { return &ServiceError{Code: ErrorInvalid, Message: msg} }
func NewForbiddenError(msg string) error { return &ServiceError{Code: ErrorForbidden, Message: msg} }
func NewNotFoundError(msg string) error  { return &ServiceError{Code: ErrorNotFound, Message: msg} }
func NewConflictError(msg string) error  { return &ServiceError{Code: ErrorConflict, Message: msg} }
func NewUnauthorizedError(msg string) error {
	return &ServiceError{Code: ErrorUnauthorized, Message: msg}
}

func NewBadGatewayError(msg string) error { return &ServiceError{Code: ErrorBadGateway, Message: msg} }

func NewTooManyRequestsError(msg string) error {
	return &ServiceError{Code: ErrorTooManyRequests, Message: msg}
}

func AsServiceError(err error) (*ServiceError, bool) {
	var se *ServiceError
	if errors.As(err, &se) {
		return se, true
	}
	return nil, false
}

type ScaleStore interface {
	InsertScale(sc *Scale) (*Scale, error)
	GetScale(id string) (*Scale, error)
	UpdateScale(sc *Scale) error
	DeleteScale(id string) error
	InsertItem(it *Item) (*Item, error)
	UpdateItem(it *Item) error
	DeleteItem(id string) error
	ListItems(scaleID string) ([]*Item, error)
	ReorderItems(scaleID string, order []string) (bool, error)
	DeleteResponsesByScale(scaleID string) (int, error)
	AddAudit(entry AuditEntry)
}

type ScaleService struct {
	store ScaleStore
	now   func() time.Time
}

type ScaleItemView struct {
	ID                string   `json:"id"`
	ReverseScored     bool     `json:"reverse_scored"`
	Stem              string   `json:"stem"`
	Type              string   `json:"type,omitempty"`
	Options           []string `json:"options,omitempty"`
	Min               int      `json:"min,omitempty"`
	Max               int      `json:"max,omitempty"`
	Step              int      `json:"step,omitempty"`
	Required          bool     `json:"required,omitempty"`
	Placeholder       string   `json:"placeholder,omitempty"`
	LikertLabels      []string `json:"likert_labels,omitempty"`
	LikertShowNumbers bool     `json:"likert_show_numbers,omitempty"`
}

func NewScaleService(store ScaleStore) *ScaleService {
	return &ScaleService{
		store: store,
		now:   func() time.Time { return time.Now().UTC() },
	}
}

func (s *ScaleService) CreateScale(tenantID string, raw map[string]any) (*Scale, error) {
	if tenantID == "" {
		return nil, NewForbiddenError("unauthorized")
	}
	payload := map[string]any{}
	if raw != nil {
		payload = raw
	}
	var sc Scale
	if len(payload) > 0 {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, NewInvalidError(err.Error())
		}
		if err := json.Unmarshal(b, &sc); err != nil {
			return nil, NewInvalidError(err.Error())
		}
	}
	if _, ok := payload["turnstile_enabled"]; !ok {
		sc.TurnstileEnabled = false
	}
	if sc.ID == "" {
		sc.ID = shortID(8)
	}
	if sc.Points == 0 {
		sc.Points = 5
	}
	sc.TenantID = tenantID
	created, err := s.store.InsertScale(&sc)
	if err != nil {
		return nil, err
	}
	if created == nil {
		return &sc, nil
	}
	return created, nil
}

func (s *ScaleService) CreateItem(tenantID string, item *Item) (*Item, error) {
	if tenantID == "" {
		return nil, NewForbiddenError("unauthorized")
	}
	if item == nil {
		return nil, NewInvalidError("item required")
	}
	if strings.TrimSpace(item.ScaleID) == "" {
		return nil, NewInvalidError("scale_id required")
	}
	if len(item.StemI18n) == 0 {
		return nil, NewInvalidError("stem_i18n required")
	}
	sc, err := s.store.GetScale(item.ScaleID)
	if err != nil {
		return nil, err
	}
	if sc == nil {
		return nil, NewNotFoundError("scale not found")
	}
	if sc.TenantID != tenantID {
		return nil, NewForbiddenError("forbidden")
	}
	if item.ID == "" {
		item.ID = shortID(8)
	}
	created, err := s.store.InsertItem(item)
	if err != nil {
		return nil, err
	}
	if created == nil {
		return item, nil
	}
	return created, nil
}

func (s *ScaleService) ListItems(scaleID string) ([]*Item, error) {
	return s.store.ListItems(scaleID)
}

func (s *ScaleService) GetScale(id string) (*Scale, error) {
	return s.store.GetScale(id)
}

func (s *ScaleService) ReorderItems(tenantID, scaleID string, order []string) (int, error) {
	if len(order) == 0 {
		return 0, NewInvalidError("order required")
	}
	sc, err := s.store.GetScale(scaleID)
	if err != nil {
		return 0, err
	}
	if sc == nil {
		return 0, NewNotFoundError("scale not found")
	}
	if sc.TenantID != tenantID {
		return 0, NewForbiddenError("forbidden")
	}
	ok, err := s.store.ReorderItems(scaleID, order)
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, NewInvalidError("reorder failed")
	}
	return len(order), nil
}

func (s *ScaleService) DeleteScaleResponses(tenantID, scaleID, actor string) (int, error) {
	sc, err := s.store.GetScale(scaleID)
	if err != nil {
		return 0, err
	}
	if sc == nil {
		return 0, NewNotFoundError("scale not found")
	}
	if sc.TenantID != tenantID {
		return 0, NewForbiddenError("forbidden")
	}
	removed, err := s.store.DeleteResponsesByScale(scaleID)
	if err != nil {
		return 0, err
	}
	s.store.AddAudit(AuditEntry{Time: s.now(), Actor: actor, Action: "purge_responses", Target: scaleID, Note: strconv.Itoa(removed)})
	return removed, nil
}

// --- CSV import helpers ---
type itemsCSVHeader struct {
	itemID, pos, typ, req, rev, min, max, step                     int
	stemEn, stemZh, optsEn, optsZh, phEn, phZh, lkEn, lkZh, lkShow int
}

func indexOfInsensitive(header []string, name string) int {
	for i, h := range header {
		if strings.EqualFold(strings.TrimSpace(h), name) {
			return i
		}
	}
	return -1
}

func buildItemsHeaderIdx(header []string) itemsCSVHeader {
	return itemsCSVHeader{
		itemID: indexOfInsensitive(header, "item_id"),
		pos:    indexOfInsensitive(header, "position"),
		typ:    indexOfInsensitive(header, "type"),
		req:    indexOfInsensitive(header, "required"),
		rev:    indexOfInsensitive(header, "reverse_scored"),
		min:    indexOfInsensitive(header, "min"),
		max:    indexOfInsensitive(header, "max"),
		step:   indexOfInsensitive(header, "step"),
		stemEn: indexOfInsensitive(header, "stem_en"),
		stemZh: indexOfInsensitive(header, "stem_zh"),
		optsEn: indexOfInsensitive(header, "options_en"),
		optsZh: indexOfInsensitive(header, "options_zh"),
		phEn:   indexOfInsensitive(header, "placeholder_en"),
		phZh:   indexOfInsensitive(header, "placeholder_zh"),
		lkEn:   indexOfInsensitive(header, "likert_labels_en"),
		lkZh:   indexOfInsensitive(header, "likert_labels_zh"),
		lkShow: indexOfInsensitive(header, "likert_show_numbers"),
	}
}

func csvParseBool(s string) bool {
	ss := strings.ToLower(strings.TrimSpace(s))
	return ss == "1" || ss == "true" || ss == "yes" || ss == "y"
}

func csvParseInt(s string) int { n, _ := strconv.Atoi(strings.TrimSpace(s)); return n }

func csvSplitList(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	if strings.Contains(s, "|") {
		parts := strings.Split(s, "|")
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				out = append(out, p)
			}
		}
		return out
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func buildItemFromRow(row []string, h itemsCSVHeader, scaleID string) (*Item, error) {
	get := func(i int) string {
		if i >= 0 && i < len(row) {
			return row[i]
		}
		return ""
	}
	it := &Item{ScaleID: scaleID}
	if id := strings.TrimSpace(get(h.itemID)); id != "" {
		it.ID = id
	}
	if it.ID == "" {
		it.ID = shortID(8)
	}
	if h.pos >= 0 {
		it.Order = csvParseInt(get(h.pos))
	}
	if t := strings.TrimSpace(get(h.typ)); t != "" {
		it.Type = t
	} else {
		it.Type = "likert"
	}
	if h.req >= 0 {
		it.Required = csvParseBool(get(h.req))
	}
	if h.rev >= 0 {
		it.ReverseScored = csvParseBool(get(h.rev))
	}
	if h.min >= 0 {
		it.Min = csvParseInt(get(h.min))
	}
	if h.max >= 0 {
		it.Max = csvParseInt(get(h.max))
	}
	if h.step >= 0 {
		it.Step = csvParseInt(get(h.step))
	}
	stemEn := strings.TrimSpace(get(h.stemEn))
	stemZh := strings.TrimSpace(get(h.stemZh))
	if stemEn != "" || stemZh != "" {
		it.StemI18n = map[string]string{}
		if stemEn != "" {
			it.StemI18n["en"] = stemEn
		}
		if stemZh != "" {
			it.StemI18n["zh"] = stemZh
		}
	}
	if it.StemI18n == nil || (it.StemI18n["en"] == "" && it.StemI18n["zh"] == "") {
		return nil, NewInvalidError("stem required in at least one language")
	}
	if en := strings.TrimSpace(get(h.optsEn)); en != "" || strings.TrimSpace(get(h.optsZh)) != "" {
		it.OptionsI18n = map[string][]string{}
		if en != "" {
			it.OptionsI18n["en"] = csvSplitList(en)
		}
		if zh := strings.TrimSpace(get(h.optsZh)); zh != "" {
			it.OptionsI18n["zh"] = csvSplitList(zh)
		}
	}
	if pe := strings.TrimSpace(get(h.phEn)); pe != "" || strings.TrimSpace(get(h.phZh)) != "" {
		it.PlaceholderI18n = map[string]string{}
		if pe != "" {
			it.PlaceholderI18n["en"] = pe
		}
		if pz := strings.TrimSpace(get(h.phZh)); pz != "" {
			it.PlaceholderI18n["zh"] = pz
		}
	}
	if le := strings.TrimSpace(get(h.lkEn)); le != "" || strings.TrimSpace(get(h.lkZh)) != "" {
		it.LikertLabelsI18n = map[string][]string{}
		if le != "" {
			it.LikertLabelsI18n["en"] = csvSplitList(le)
		}
		if lz := strings.TrimSpace(get(h.lkZh)); lz != "" {
			it.LikertLabelsI18n["zh"] = csvSplitList(lz)
		}
	}
	if h.lkShow >= 0 {
		it.LikertShowNumbers = csvParseBool(get(h.lkShow))
	}
	return it, nil
}

// ImportItemsCSV parses a CSV (as produced by ExportItemsCSV) and appends items to the scale.
// It validates tenant scope and creates new items with provided fields. Missing item_id results in a generated ID.
func (s *ScaleService) ImportItemsCSV(tenantID, scaleID string, data []byte) (int, error) {
	if tenantID == "" {
		return 0, NewForbiddenError("unauthorized")
	}
	sc, err := s.store.GetScale(scaleID)
	if err != nil {
		return 0, err
	}
	if sc == nil {
		return 0, NewNotFoundError("scale not found")
	}
	if sc.TenantID != tenantID {
		return 0, NewForbiddenError("forbidden")
	}

	// Strip optional UTF-8 BOM
	if len(data) >= 3 && data[0] == 0xEF && data[1] == 0xBB && data[2] == 0xBF {
		data = data[3:]
	}
	r := csv.NewReader(strings.NewReader(string(data)))
	rows, err := r.ReadAll()
	if err != nil {
		return 0, NewInvalidError("invalid csv: " + err.Error())
	}
	if len(rows) == 0 {
		return 0, NewInvalidError("empty csv")
	}
	hdr := buildItemsHeaderIdx(rows[0])

	created := 0
	for _, row := range rows[1:] {
		if len(strings.TrimSpace(strings.Join(row, ""))) == 0 {
			continue
		}
		item, ierr := buildItemFromRow(row, hdr, scaleID)
		if ierr != nil {
			return 0, ierr
		}
		if _, err := s.store.InsertItem(item); err != nil {
			return created, err
		}
		created++
	}
	s.store.AddAudit(AuditEntry{Time: s.now(), Actor: "admin", Action: "import_items", Target: scaleID, Note: strconv.Itoa(created)})
	return created, nil
}

func (s *ScaleService) DeleteScale(id, actor string) error {
	if err := s.store.DeleteScale(id); err != nil {
		return err
	}
	s.store.AddAudit(AuditEntry{Time: s.now(), Actor: actor, Action: "delete_scale", Target: id})
	return nil
}

func (s *ScaleService) GetScaleMeta(id string) (*Scale, error) {
	sc, err := s.store.GetScale(id)
	if err != nil {
		return nil, err
	}
	if sc == nil {
		return nil, nil
	}
	copy := *sc
	return &copy, nil
}

func (s *ScaleService) BuildItemViews(scaleID, lang string) ([]ScaleItemView, error) {
	items, err := s.store.ListItems(scaleID)
	if err != nil {
		return nil, err
	}
	if lang == "" {
		lang = "en"
	}
	out := make([]ScaleItemView, 0, len(items))
	for _, it := range items {
		stem := it.StemI18n[lang]
		if stem == "" {
			stem = it.StemI18n["en"]
		}
		options := []string(nil)
		if it.OptionsI18n != nil {
			if v := it.OptionsI18n[lang]; len(v) > 0 {
				options = v
			} else if v := it.OptionsI18n["en"]; len(v) > 0 {
				options = v
			}
		}
		placeholder := ""
		if it.PlaceholderI18n != nil {
			placeholder = it.PlaceholderI18n[lang]
			if placeholder == "" {
				placeholder = it.PlaceholderI18n["en"]
			}
		}
		likertLabels := []string(nil)
		if it.Type == "likert" && it.LikertLabelsI18n != nil {
			if v := it.LikertLabelsI18n[lang]; len(v) > 0 {
				likertLabels = v
			} else if v := it.LikertLabelsI18n["en"]; len(v) > 0 {
				likertLabels = v
			}
		}
		out = append(out, ScaleItemView{
			ID:                it.ID,
			ReverseScored:     it.ReverseScored,
			Stem:              stem,
			Type:              it.Type,
			Options:           options,
			Min:               it.Min,
			Max:               it.Max,
			Step:              it.Step,
			Required:          it.Required,
			Placeholder:       placeholder,
			LikertLabels:      likertLabels,
			LikertShowNumbers: it.LikertShowNumbers,
		})
	}
	return out, nil
}

func (s *ScaleService) UpdateScale(id string, raw map[string]any, actor string) error {
	old, err := s.store.GetScale(id)
	if err != nil {
		return err
	}
	if old == nil {
		return NewNotFoundError("scale not found")
	}
	updated := *old
	if v, ok := raw["e2ee_enabled"]; ok {
		if vb, ok2 := v.(bool); ok2 && vb != old.E2EEEnabled {
			return NewInvalidError("e2ee_enabled cannot be modified after creation")
		}
	}
	applyScaleName(&updated, raw["name_i18n"])
	if v, ok := raw["points"].(float64); ok {
		updated.Points = int(v)
	}
	if v, ok := raw["randomize"].(bool); ok {
		updated.Randomize = v
	}
	applyConsentCopy(&updated, raw["consent_i18n"])
	if v, ok := raw["collect_email"].(string); ok {
		updated.CollectEmail = v
	}
	if v, ok := raw["region"].(string); ok && strings.TrimSpace(v) != "" {
		updated.Region = v
	}
	if v, ok := raw["items_per_page"].(float64); ok {
		updated.ItemsPerPage = int(v)
	}
	if v, ok := raw["turnstile_enabled"].(bool); ok {
		updated.TurnstileEnabled = v
	}
	applyLikertLabels(&updated, raw["likert_labels_i18n"])
	if v, ok := raw["likert_show_numbers"].(bool); ok {
		updated.LikertShowNumbers = v
	}
	if v, ok := raw["likert_preset"].(string); ok {
		updated.LikertPreset = v
	}
	if v, ok := raw["consent_config"]; ok && v != nil {
		if m, ok2 := v.(map[string]any); ok2 {
			updated.ConsentConfig = parseConsentCfg(m)
		}
	}
	updated.E2EEEnabled = old.E2EEEnabled
	if err := s.store.UpdateScale(&updated); err != nil {
		return err
	}
	if updated.Region != "" && updated.Region != old.Region {
		s.store.AddAudit(AuditEntry{Time: s.now(), Actor: actor, Action: "region_change", Target: id, Note: updated.Region})
	}
	return nil
}

func (s *ScaleService) UpdateItem(it *Item) error {
	if it == nil {
		return NewInvalidError("item required")
	}
	if err := s.store.UpdateItem(it); err != nil {
		return err
	}
	return nil
}

func (s *ScaleService) DeleteItem(id string) error {
	return s.store.DeleteItem(id)
}

func shortID(n int) string {
	return strings.ReplaceAll(uuid.NewString(), "-", "")[:n]
}

func applyScaleName(updated *Scale, raw any) {
	m, ok := raw.(map[string]any)
	if !ok {
		return
	}
	name := make(map[string]string, len(m))
	for k, v := range m {
		name[k] = toString(v)
	}
	updated.NameI18n = name
}

func applyConsentCopy(updated *Scale, raw any) {
	m, ok := raw.(map[string]any)
	if !ok {
		return
	}
	copy := make(map[string]string, len(m))
	for k, v := range m {
		copy[k] = toString(v)
	}
	updated.ConsentI18n = copy
}

func applyLikertLabels(updated *Scale, raw any) {
	m, ok := raw.(map[string]any)
	if !ok {
		return
	}
	labels := make(map[string][]string, len(m))
	for lang, payload := range m {
		slice := parseStringSlice(payload)
		if len(slice) > 0 {
			labels[lang] = slice
		}
	}
	if len(labels) > 0 {
		updated.LikertLabelsI18n = labels
	}
}

func parseConsentCfg(m map[string]any) *ConsentConfig {
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

func parseStringSlice(raw any) []string {
	arr, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, item := range arr {
		val := strings.TrimSpace(toString(item))
		if val != "" {
			out = append(out, val)
		}
	}
	return out
}

func toString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	default:
		b, _ := json.Marshal(v)
		return strings.Trim(string(b), "\"")
	}
}
