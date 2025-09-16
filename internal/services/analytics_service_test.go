package services

import (
	"testing"
	"time"
)

type stubAnalyticsStore struct {
	scale     *Scale
	items     []*Item
	responses []*Response
}

func (s *stubAnalyticsStore) GetScale(id string) (*Scale, error) {
	if s.scale != nil && s.scale.ID == id {
		copy := *s.scale
		return &copy, nil
	}
	return nil, nil
}

func (s *stubAnalyticsStore) ListItems(scaleID string) ([]*Item, error) {
	out := []*Item{}
	for _, it := range s.items {
		if it.ScaleID == scaleID {
			copy := *it
			out = append(out, &copy)
		}
	}
	return out, nil
}

func (s *stubAnalyticsStore) ListResponsesByScale(scaleID string) ([]*Response, error) {
	out := []*Response{}
	for _, r := range s.responses {
		if r.ItemID != "" {
			copy := *r
			out = append(out, &copy)
		}
	}
	return out, nil
}

func TestAnalyticsSummary(t *testing.T) {
	store := &stubAnalyticsStore{
		scale: &Scale{ID: "S1", TenantID: "T1", Points: 5},
		items: []*Item{
			{ID: "I1", ScaleID: "S1", StemI18n: map[string]string{"en": "Q1"}},
			{ID: "I2", ScaleID: "S1", StemI18n: map[string]string{"en": "Q2"}, Type: "likert"},
			{ID: "I3", ScaleID: "S1", StemI18n: map[string]string{"en": "Text"}, Type: "long_text"},
		},
		responses: []*Response{
			{ParticipantID: "P1", ItemID: "I1", ScoreValue: 3, SubmittedAt: time.Date(2025, 9, 18, 0, 0, 0, 0, time.UTC)},
			{ParticipantID: "P1", ItemID: "I2", ScoreValue: 4, SubmittedAt: time.Date(2025, 9, 18, 0, 0, 0, 0, time.UTC)},
			{ParticipantID: "P1", ItemID: "I3", ScoreValue: 0, SubmittedAt: time.Date(2025, 9, 18, 0, 0, 0, 0, time.UTC)},
		},
	}
	svc := NewAnalyticsService(store)
	summary, err := svc.Summary("T1", "S1")
	if err != nil {
		t.Fatalf("Summary error: %v", err)
	}
	if summary.TotalResponses != 3 {
		t.Fatalf("expected 3 responses, got %d", summary.TotalResponses)
	}
	if len(summary.Items) != 2 {
		t.Fatalf("expected 2 likert items, got %d", len(summary.Items))
	}
	if summary.Items[0].Total != 1 {
		t.Fatalf("expected histogram total 1")
	}
	if len(summary.Timeseries) != 1 || summary.Timeseries[0].Count != 3 {
		t.Fatalf("unexpected timeseries: %+v", summary.Timeseries)
	}
}

func TestAnalyticsAlpha(t *testing.T) {
	store := &stubAnalyticsStore{
		items: []*Item{{ID: "I1", ScaleID: "S1"}, {ID: "I2", ScaleID: "S1"}},
		responses: []*Response{
			{ParticipantID: "P1", ItemID: "I1", ScoreValue: 3},
			{ParticipantID: "P1", ItemID: "I2", ScoreValue: 4},
			{ParticipantID: "P2", ItemID: "I1", ScoreValue: 2},
			{ParticipantID: "P2", ItemID: "I2", ScoreValue: 3},
		},
	}
	svc := NewAnalyticsService(store)
	alpha, n, err := svc.Alpha("S1")
	if err != nil {
		t.Fatalf("Alpha error: %v", err)
	}
	if n != 2 {
		t.Fatalf("expected n=2, got %d", n)
	}
	if alpha == 0 {
		t.Fatalf("expected non-zero alpha")
	}
}

func TestAnalyticsSummaryForbidden(t *testing.T) {
	store := &stubAnalyticsStore{scale: &Scale{ID: "S1", TenantID: "T2"}}
	svc := NewAnalyticsService(store)
	if _, err := svc.Summary("T1", "S1"); err == nil {
		t.Fatalf("expected forbidden error")
	}
}
