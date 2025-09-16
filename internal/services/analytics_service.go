package services

import "sort"

type AnalyticsStore interface {
	GetScale(id string) (*Scale, error)
	ListItems(scaleID string) ([]*Item, error)
	ListResponsesByScale(scaleID string) ([]*Response, error)
}

type AnalyticsService struct {
	store AnalyticsStore
}

type AnalyticsItem struct {
	ID        string            `json:"id"`
	StemI18n  map[string]string `json:"stem_i18n,omitempty"`
	Reverse   bool              `json:"reverse_scored"`
	Histogram []int             `json:"histogram"`
	Total     int               `json:"total"`
}

type AnalyticsTimeseries struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type AnalyticsSummary struct {
	ScaleID        string                `json:"scale_id"`
	Points         int                   `json:"points"`
	TotalResponses int                   `json:"total_responses"`
	Items          []AnalyticsItem       `json:"items"`
	Timeseries     []AnalyticsTimeseries `json:"timeseries"`
	Alpha          float64               `json:"alpha"`
	N              int                   `json:"n"`
}

func NewAnalyticsService(store AnalyticsStore) *AnalyticsService {
	return &AnalyticsService{store: store}
}

func (s *AnalyticsService) Summary(tenantID, scaleID string) (*AnalyticsSummary, error) {
	sc, err := s.store.GetScale(scaleID)
	if err != nil {
		return nil, err
	}
	if sc == nil || sc.TenantID != tenantID {
		return nil, NewForbiddenError("forbidden")
	}
	items, err := s.store.ListItems(scaleID)
	if err != nil {
		return nil, err
	}
	responses, err := s.store.ListResponsesByScale(scaleID)
	if err != nil {
		return nil, err
	}
	points := sc.Points
	if points <= 0 {
		points = 5
	}
	filtered := filterLikertItems(items)
	analyticsItems, countsByDay := buildAnalyticsItems(filtered, responses, points)
	matrix, n := buildAlphaMatrix(filtered, responses)
	alpha := CronbachAlpha(matrix)
	series := buildTimeseries(countsByDay)
	return &AnalyticsSummary{
		ScaleID:        scaleID,
		Points:         points,
		TotalResponses: len(responses),
		Items:          analyticsItems,
		Timeseries:     series,
		Alpha:          alpha,
		N:              n,
	}, nil
}

func (s *AnalyticsService) Alpha(scaleID string) (float64, int, error) {
	items, err := s.store.ListItems(scaleID)
	if err != nil {
		return 0, 0, err
	}
	responses, err := s.store.ListResponsesByScale(scaleID)
	if err != nil {
		return 0, 0, err
	}
	filtered := filterLikertItems(items)
	matrix, n := buildAlphaMatrix(filtered, responses)
	return CronbachAlpha(matrix), n, nil
}

func filterLikertItems(items []*Item) []*Item {
	out := make([]*Item, 0, len(items))
	for _, it := range items {
		if it.Type == "" || it.Type == "likert" {
			out = append(out, it)
		}
	}
	return out
}

func buildAnalyticsItems(items []*Item, responses []*Response, points int) ([]AnalyticsItem, map[string]int) {
	itemIndex := make(map[string]int)
	analyticsItems := make([]AnalyticsItem, 0, len(items))
	for i, it := range items {
		analyticsItems = append(analyticsItems, AnalyticsItem{
			ID:        it.ID,
			StemI18n:  it.StemI18n,
			Reverse:   it.ReverseScored,
			Histogram: make([]int, points),
		})
		itemIndex[it.ID] = i
	}
	countsByDay := map[string]int{}
	for _, resp := range responses {
		if idx, ok := itemIndex[resp.ItemID]; ok {
			v := resp.ScoreValue
			if v >= 1 && v <= points {
				analyticsItems[idx].Histogram[v-1]++
				analyticsItems[idx].Total++
			}
		}
		day := resp.SubmittedAt.UTC().Format("2006-01-02")
		countsByDay[day]++
	}
	return analyticsItems, countsByDay
}

func buildAlphaMatrix(items []*Item, responses []*Response) ([][]float64, int) {
	mp := map[string]map[string]float64{}
	for _, resp := range responses {
		if mp[resp.ParticipantID] == nil {
			mp[resp.ParticipantID] = map[string]float64{}
		}
		mp[resp.ParticipantID][resp.ItemID] = float64(resp.ScoreValue)
	}
	ids := make([]string, 0, len(items))
	for _, it := range items {
		ids = append(ids, it.ID)
	}
	sort.Strings(ids)
	matrix := make([][]float64, 0, len(mp))
	for _, m := range mp {
		row := make([]float64, 0, len(ids))
		complete := true
		for _, id := range ids {
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
	return matrix, len(matrix)
}

func buildTimeseries(counts map[string]int) []AnalyticsTimeseries {
	days := make([]string, 0, len(counts))
	for d := range counts {
		days = append(days, d)
	}
	sort.Strings(days)
	out := make([]AnalyticsTimeseries, 0, len(days))
	for _, d := range days {
		out = append(out, AnalyticsTimeseries{Date: d, Count: counts[d]})
	}
	return out
}
