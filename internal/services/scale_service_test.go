package services

import (
	"reflect"
	"testing"
	"time"
)

type stubScaleStore struct {
	scales map[string]*Scale
	items  map[string]*Item
	order  map[string][]string
	audits []AuditEntry

	reorderOK bool
	deleteErr error
}

func newStubScaleStore() *stubScaleStore {
	return &stubScaleStore{
		scales:    map[string]*Scale{},
		items:     map[string]*Item{},
		order:     map[string][]string{},
		reorderOK: true,
	}
}

func (s *stubScaleStore) InsertScale(sc *Scale) (*Scale, error) {
	copy := *sc
	s.scales[sc.ID] = &copy
	return &copy, nil
}

func (s *stubScaleStore) GetScale(id string) (*Scale, error) {
	if sc, ok := s.scales[id]; ok {
		copy := *sc
		return &copy, nil
	}
	return nil, nil
}

func (s *stubScaleStore) UpdateScale(sc *Scale) error {
	if _, ok := s.scales[sc.ID]; !ok {
		return NewNotFoundError("scale not found")
	}
	copy := *sc
	s.scales[sc.ID] = &copy
	return nil
}

func (s *stubScaleStore) DeleteScale(id string) error {
	if _, ok := s.scales[id]; !ok {
		return NewNotFoundError("scale not found")
	}
	delete(s.scales, id)
	return nil
}

func (s *stubScaleStore) InsertItem(it *Item) (*Item, error) {
	copy := *it
	s.items[it.ID] = &copy
	s.order[it.ScaleID] = append(s.order[it.ScaleID], it.ID)
	return &copy, nil
}

func (s *stubScaleStore) UpdateItem(it *Item) error {
	if _, ok := s.items[it.ID]; !ok {
		return NewNotFoundError("item not found")
	}
	copy := *it
	s.items[it.ID] = &copy
	return nil
}

func (s *stubScaleStore) DeleteItem(id string) error {
	if _, ok := s.items[id]; !ok {
		return NewNotFoundError("item not found")
	}
	delete(s.items, id)
	return nil
}

func (s *stubScaleStore) ListItems(scaleID string) ([]*Item, error) {
	out := []*Item{}
	for _, it := range s.items {
		if it.ScaleID == scaleID {
			copy := *it
			out = append(out, &copy)
		}
	}
	return out, nil
}

func (s *stubScaleStore) ReorderItems(scaleID string, order []string) (bool, error) {
	if !s.reorderOK {
		return false, nil
	}
	s.order[scaleID] = append([]string{}, order...)
	return true, nil
}

func (s *stubScaleStore) DeleteResponsesByScale(scaleID string) (int, error) {
	if s.deleteErr != nil {
		return 0, s.deleteErr
	}
	return 3, nil
}

func (s *stubScaleStore) AddAudit(entry AuditEntry) {
	s.audits = append(s.audits, entry)
}

func TestCreateScaleDefaults(t *testing.T) {
	store := newStubScaleStore()
	svc := NewScaleService(store)
	svc.now = func() time.Time { return time.Date(2025, 9, 18, 0, 0, 0, 0, time.UTC) }

	sc, err := svc.CreateScale("T1", map[string]any{"name_i18n": map[string]any{"en": "Test"}})
	if err != nil {
		t.Fatalf("CreateScale returned error: %v", err)
	}
	if sc.ID == "" {
		t.Fatalf("expected generated id")
	}
	if sc.Points != 5 {
		t.Fatalf("default points = %d, want 5", sc.Points)
	}
	if sc.TenantID != "T1" {
		t.Fatalf("tenant id = %q, want T1", sc.TenantID)
	}
	if sc.NameI18n["en"] != "Test" {
		t.Fatalf("name = %v, want Test", sc.NameI18n)
	}
}

func TestCreateItemValidatesTenantAndStem(t *testing.T) {
	store := newStubScaleStore()
	store.scales["S1"] = &Scale{ID: "S1", TenantID: "TEN"}
	svc := NewScaleService(store)

	_, err := svc.CreateItem("TEN", &Item{ScaleID: "S1"})
	if err == nil {
		t.Fatalf("expected error for missing stem")
	}
	if se, ok := AsServiceError(err); !ok || se.Code != ErrorInvalid {
		t.Fatalf("expected invalid error, got %v", err)
	}

	it, err := svc.CreateItem("TEN", &Item{ScaleID: "S1", StemI18n: map[string]string{"en": "Hello"}})
	if err != nil {
		t.Fatalf("CreateItem returned error: %v", err)
	}
	if it.ID == "" {
		t.Fatalf("expected generated item id")
	}

	if _, err = svc.CreateItem("OTHER", &Item{ScaleID: "S1", StemI18n: map[string]string{"en": "X"}}); err == nil {
		t.Fatalf("expected forbidden error")
	}
}

func TestReorderItemsChecksTenant(t *testing.T) {
	store := newStubScaleStore()
	store.scales["S1"] = &Scale{ID: "S1", TenantID: "TEN"}
	svc := NewScaleService(store)

	if _, err := svc.ReorderItems("TEN", "S1", []string{}); err == nil {
		t.Fatalf("expected invalid error for empty order")
	}
	if _, err := svc.ReorderItems("TEN", "unknown", []string{"a"}); err == nil {
		t.Fatalf("expected not found")
	}
	count, err := svc.ReorderItems("TEN", "S1", []string{"a", "b"})
	if err != nil {
		t.Fatalf("ReorderItems returned error: %v", err)
	}
	if count != 2 {
		t.Fatalf("count = %d, want 2", count)
	}
}

func TestDeleteScaleResponsesAudits(t *testing.T) {
	store := newStubScaleStore()
	store.scales["S1"] = &Scale{ID: "S1", TenantID: "TEN"}
	svc := NewScaleService(store)
	svc.now = func() time.Time { return time.Unix(0, 0) }

	n, err := svc.DeleteScaleResponses("TEN", "S1", "actor@example.com")
	if err != nil {
		t.Fatalf("DeleteScaleResponses returned error: %v", err)
	}
	if n != 3 {
		t.Fatalf("removed = %d, want 3", n)
	}
	if len(store.audits) != 1 {
		t.Fatalf("audits len = %d, want 1", len(store.audits))
	}
	if store.audits[0].Action != "purge_responses" {
		t.Fatalf("audit action = %q", store.audits[0].Action)
	}
}

func TestUpdateScalePreventsE2EEChange(t *testing.T) {
	store := newStubScaleStore()
	store.scales["S1"] = &Scale{ID: "S1", TenantID: "TEN", E2EEEnabled: true, Region: "pdpa"}
	svc := NewScaleService(store)

	if err := svc.UpdateScale("S1", map[string]any{"e2ee_enabled": false}, "actor"); err == nil {
		t.Fatalf("expected error when toggling e2ee")
	}
	err := svc.UpdateScale("S1", map[string]any{"region": "gdpr"}, "actor")
	if err != nil {
		t.Fatalf("UpdateScale returned error: %v", err)
	}
	if store.scales["S1"].Region != "gdpr" {
		t.Fatalf("region = %s, want gdpr", store.scales["S1"].Region)
	}
	if len(store.audits) != 1 || store.audits[0].Action != "region_change" {
		t.Fatalf("expected region_change audit, got %+v", store.audits)
	}
}

func TestParseConsentCfg(t *testing.T) {
	cfg := parseConsentCfg(map[string]any{
		"version":            "v1",
		"signature_required": true,
		"options": []any{
			map[string]any{"key": "opt1", "required": true, "order": "2", "group": float64(1), "label_i18n": map[string]any{"en": "Yes"}},
		},
	})
	if cfg.Version != "v1" || !cfg.SignatureRequired {
		t.Fatalf("unexpected cfg %+v", cfg)
	}
	if len(cfg.Options) != 1 || cfg.Options[0].Order != 2 || cfg.Options[0].Group != 1 {
		t.Fatalf("unexpected options %+v", cfg.Options)
	}
	if !reflect.DeepEqual(cfg.Options[0].LabelI18n, map[string]string{"en": "Yes"}) {
		t.Fatalf("unexpected label map: %+v", cfg.Options[0].LabelI18n)
	}
}
