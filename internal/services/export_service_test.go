package services

import (
	"encoding/csv"
	"strings"
	"testing"
	"time"
)

type exportStubStore struct {
	scale        *Scale
	items        []*Item
	responses    []*Response
	participants map[string]*Participant
	consents     map[string]*ConsentRecord
}

func newExportStubStore() *exportStubStore {
	return &exportStubStore{
		participants: map[string]*Participant{},
		consents:     map[string]*ConsentRecord{},
	}
}

func (s *exportStubStore) GetScale(id string) (*Scale, error) {
	if s.scale != nil && s.scale.ID == id {
		copy := *s.scale
		return &copy, nil
	}
	return nil, nil
}

func (s *exportStubStore) ListItems(scaleID string) ([]*Item, error) {
	out := []*Item{}
	for _, it := range s.items {
		if it.ScaleID == scaleID {
			copy := *it
			out = append(out, &copy)
		}
	}
	return out, nil
}

func (s *exportStubStore) ListResponsesByScale(scaleID string) ([]*Response, error) {
	out := []*Response{}
	for _, r := range s.responses {
		out = append(out, &Response{ParticipantID: r.ParticipantID, ItemID: r.ItemID, RawValue: r.RawValue, ScoreValue: r.ScoreValue, SubmittedAt: r.SubmittedAt, RawJSON: r.RawJSON})
	}
	return out, nil
}

func (s *exportStubStore) GetParticipant(id string) (*Participant, error) {
	if p, ok := s.participants[id]; ok {
		copy := *p
		return &copy, nil
	}
	return nil, nil
}

func (s *exportStubStore) GetConsentByID(id string) (*ConsentRecord, error) {
	if c, ok := s.consents[id]; ok {
		copy := *c
		return &copy, nil
	}
	return nil, nil
}

func TestExportServiceLongWithConsent(t *testing.T) {
	store := newExportStubStore()
	store.scale = &Scale{ID: "S1", ConsentConfig: &ConsentConfig{Options: []ConsentOptionConf{{Key: "agree", LabelI18n: map[string]string{"en": "Agree", "zh": "同意"}}}}}
	store.items = []*Item{{ID: "I1", ScaleID: "S1"}}
	store.responses = []*Response{{ParticipantID: "P1", ItemID: "I1", RawValue: 3, ScoreValue: 3, SubmittedAt: time.Date(2025, 9, 18, 0, 0, 0, 0, time.UTC)}}
	store.participants["P1"] = &Participant{ID: "P1", ConsentID: "C1"}
	store.consents["C1"] = &ConsentRecord{ID: "C1", ScaleID: "S1", Choices: map[string]bool{"agree": true}, SignedAt: time.Date(2025, 9, 18, 0, 0, 0, 0, time.UTC)}

	svc := NewExportService(store)
	res, err := svc.ExportCSV(ExportParams{ScaleID: "S1", Format: "long", ConsentHeader: "label_en"})
	if err != nil {
		t.Fatalf("ExportCSV returned error: %v", err)
	}
	if res.Filename != "long.csv" {
		t.Fatalf("filename = %q", res.Filename)
	}
	r := csv.NewReader(strings.NewReader(string(res.Data)))
	records, err := r.ReadAll()
	if err != nil {
		t.Fatalf("read csv: %v", err)
	}
	if len(records) != 3 { // header + two rows (response + consent)
		t.Fatalf("records len = %d", len(records))
	}
	if records[1][1] != "I1" {
		t.Fatalf("expected item row, got %v", records[1])
	}
	if records[2][1] != "Agree" {
		t.Fatalf("expected consent label, got %v", records[2][1])
	}
}

func TestExportServiceWideAndScore(t *testing.T) {
	store := newExportStubStore()
	store.scale = &Scale{ID: "S1"}
	store.items = []*Item{{ID: "I1", ScaleID: "S1"}, {ID: "I2", ScaleID: "S1"}}
	store.responses = []*Response{
		{ParticipantID: "P1", ItemID: "I1", ScoreValue: 3, SubmittedAt: time.Now()},
		{ParticipantID: "P1", ItemID: "I2", ScoreValue: 4, SubmittedAt: time.Now()},
	}
	svc := NewExportService(store)

	wide, err := svc.ExportCSV(ExportParams{ScaleID: "S1", Format: "wide"})
	if err != nil {
		t.Fatalf("wide export error: %v", err)
	}
	recs, err := csv.NewReader(strings.NewReader(string(wide.Data))).ReadAll()
	if err != nil {
		t.Fatalf("wide read error: %v", err)
	}
	if len(recs) != 2 {
		t.Fatalf("wide rows = %d", len(recs))
	}
	if recs[0][1] != "I1" {
		t.Fatalf("wide header unexpected: %v", recs[0])
	}

	score, err := svc.ExportCSV(ExportParams{ScaleID: "S1", Format: "score"})
	if err != nil {
		t.Fatalf("score export error: %v", err)
	}
	scoreRecs, err := csv.NewReader(strings.NewReader(string(score.Data))).ReadAll()
	if err != nil {
		t.Fatalf("score read error: %v", err)
	}
	if len(scoreRecs) != 2 {
		t.Fatalf("score rows = %d", len(scoreRecs))
	}
	if scoreRecs[1][1] != "7" {
		t.Fatalf("score total expected 7, got %v", scoreRecs[1][1])
	}
}

func TestExportServiceRejectsE2EE(t *testing.T) {
	store := newExportStubStore()
	store.scale = &Scale{ID: "S1", E2EEEnabled: true}
	svc := NewExportService(store)
	if _, err := svc.ExportCSV(ExportParams{ScaleID: "S1", Format: "long"}); err == nil {
		t.Fatalf("expected error for E2EE scale")
	}
}

func TestExportItemsCSVAllowsE2EE(t *testing.T) {
	store := newExportStubStore()
	store.scale = &Scale{ID: "S1", E2EEEnabled: true}
	store.items = []*Item{
		{ID: "I1", ScaleID: "S1", Order: 1, Type: "likert", StemI18n: map[string]string{"en": "A", "zh": "甲"}, OptionsI18n: map[string][]string{"en": {"No", "Yes"}, "zh": {"否", "是"}}, Required: true},
		{ID: "I2", ScaleID: "S1", Order: 2, Type: "short_text", PlaceholderI18n: map[string]string{"en": "Your answer", "zh": "你的答案"}},
	}
	svc := NewExportService(store)
	res, err := svc.ExportCSV(ExportParams{ScaleID: "S1", Format: "items"})
	if err != nil {
		t.Fatalf("items export error: %v", err)
	}
	recs, err := csv.NewReader(strings.NewReader(string(res.Data))).ReadAll()
	if err != nil {
		t.Fatalf("csv read: %v", err)
	}
	if len(recs) != 3 {
		t.Fatalf("expected 3 rows (header+2), got %d", len(recs))
	}
	if recs[1][0] != "I1" || recs[2][0] != "I2" {
		t.Fatalf("unexpected order: %v %v", recs[1][0], recs[2][0])
	}
}

func TestExportServiceWideLabelsZh(t *testing.T) {
	store := newExportStubStore()
	store.scale = &Scale{ID: "S1", LikertLabelsI18n: map[string][]string{
		"en": {"Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"},
		"zh": {"非常不同意", "不同意", "一般", "同意", "非常同意"},
	}}
	store.items = []*Item{
		{ID: "I1", ScaleID: "S1", StemI18n: map[string]string{"en": "I enjoy coding", "zh": "我喜欢编程"}, Type: "likert"},
	}
	// RawValue=4 means "同意" in zh
	store.responses = []*Response{
		{ParticipantID: "P1", ItemID: "I1", RawValue: 4, ScoreValue: 4, SubmittedAt: time.Now()},
	}
	svc := NewExportService(store)
	res, err := svc.ExportCSV(ExportParams{ScaleID: "S1", Format: "wide", HeaderLang: "zh", ValuesMode: "label", ValueLang: "zh"})
	if err != nil {
		t.Fatalf("ExportCSV error: %v", err)
	}
	recs, err := csv.NewReader(strings.NewReader(string(res.Data))).ReadAll()
	if err != nil {
		t.Fatalf("csv read: %v", err)
	}
	if len(recs) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(recs))
	}
	// header should contain zh stem
	if recs[0][1] != "我喜欢编程" {
		t.Fatalf("unexpected header: %v", recs[0])
	}
	// value should be zh label
	if recs[1][1] != "同意" {
		t.Fatalf("unexpected value: %v", recs[1])
	}
}
