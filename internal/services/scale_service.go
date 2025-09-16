package services

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

type ErrorCode string

const (
	ErrorInvalid      ErrorCode = "invalid"
	ErrorForbidden    ErrorCode = "forbidden"
	ErrorNotFound     ErrorCode = "not_found"
	ErrorConflict     ErrorCode = "conflict"
	ErrorUnauthorized ErrorCode = "unauthorized"
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

func (s *ScaleService) DeleteScale(id, actor string) error {
	if err := s.store.DeleteScale(id); err != nil {
		return err
	}
	s.store.AddAudit(AuditEntry{Time: s.now(), Actor: actor, Action: "delete_scale", Target: id})
	return nil
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
