package services

import (
	"fmt"
	"time"
)

type ExportStore interface {
	GetScale(id string) (*Scale, error)
	ListItems(scaleID string) ([]*Item, error)
	ListResponsesByScale(scaleID string) ([]*Response, error)
	GetParticipant(id string) (*Participant, error)
	GetConsentByID(id string) (*ConsentRecord, error)
}

type ExportParams struct {
	ScaleID       string
	Format        string
	ConsentHeader string
}

type ExportResult struct {
	Filename    string
	ContentType string
	Data        []byte
}

type ExportService struct {
	store ExportStore
}

func NewExportService(store ExportStore) *ExportService {
	return &ExportService{store: store}
}

func (s *ExportService) ExportCSV(params ExportParams) (*ExportResult, error) {
	if params.ScaleID == "" {
		return nil, NewInvalidError("scale_id required")
	}
	format := params.Format
	if format == "" {
		format = "long"
	}
	sc, err := s.store.GetScale(params.ScaleID)
	if err != nil {
		return nil, err
	}
	if sc != nil && sc.E2EEEnabled {
		return nil, NewInvalidError("CSV exports are disabled for E2EE projects")
	}
	items, err := s.store.ListItems(params.ScaleID)
	if err != nil {
		return nil, err
	}
	rs, err := s.store.ListResponsesByScale(params.ScaleID)
	if err != nil {
		return nil, err
	}

	switch format {
	case "long":
		rows := buildLongRows(rs)
		if err := s.appendConsentLong(&rows, rs, params.ScaleID, params.ConsentHeader); err != nil {
			return nil, err
		}
		b, err := ExportLongCSV(rows)
		if err != nil {
			return nil, err
		}
		return &ExportResult{Filename: "long.csv", ContentType: "text/csv; charset=utf-8", Data: b}, nil
	case "wide":
		mp := buildWideMap(rs)
		if err := s.mergeConsentWide(mp, rs, params.ScaleID, params.ConsentHeader); err != nil {
			return nil, err
		}
		b, err := ExportWideCSV(mp)
		if err != nil {
			return nil, err
		}
		return &ExportResult{Filename: "wide.csv", ContentType: "text/csv; charset=utf-8", Data: b}, nil
	case "score":
		totals := buildTotals(items, rs)
		b, err := ExportScoreCSV(totals)
		if err != nil {
			return nil, err
		}
		return &ExportResult{Filename: "score.csv", ContentType: "text/csv; charset=utf-8", Data: b}, nil
	default:
		return nil, NewInvalidError("unsupported format")
	}
}

func buildLongRows(rs []*Response) []LongRow {
	out := make([]LongRow, 0, len(rs))
	for _, r := range rs {
		out = append(out, LongRow{ParticipantID: r.ParticipantID, ItemID: r.ItemID, RawValue: r.RawValue, ScoreValue: r.ScoreValue, SubmittedAt: r.SubmittedAt.Format(time.RFC3339)})
	}
	return out
}

func buildWideMap(rs []*Response) map[string]map[string]int {
	mp := map[string]map[string]int{}
	for _, r := range rs {
		if mp[r.ParticipantID] == nil {
			mp[r.ParticipantID] = map[string]int{}
		}
		mp[r.ParticipantID][r.ItemID] = r.ScoreValue
	}
	return mp
}

func buildTotals(_ []*Item, rs []*Response) map[string][]int {
	totals := map[string][]int{}
	for _, r := range rs {
		totals[r.ParticipantID] = append(totals[r.ParticipantID], r.ScoreValue)
	}
	return totals
}

func (s *ExportService) appendConsentLong(rows *[]LongRow, rs []*Response, scaleID, mode string) error {
	pidSet := map[string]struct{}{}
	for _, r := range rs {
		pidSet[r.ParticipantID] = struct{}{}
	}
	sc, err := s.store.GetScale(scaleID)
	if err != nil {
		return err
	}
	lang := "en"
	if mode == "label_zh" {
		lang = "zh"
	}
	for pid := range pidSet {
		p, err := s.store.GetParticipant(pid)
		if err != nil {
			return err
		}
		if p == nil || p.ConsentID == "" {
			continue
		}
		c, err := s.store.GetConsentByID(p.ConsentID)
		if err != nil {
			return err
		}
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
				if lbl := consentLabel(sc, k, lang); lbl != "" {
					name = lbl
				}
			}
			*rows = append(*rows, LongRow{ParticipantID: pid, ItemID: name, RawValue: val, ScoreValue: val, SubmittedAt: c.SignedAt.Format(time.RFC3339)})
		}
	}
	return nil
}

func (s *ExportService) mergeConsentWide(mp map[string]map[string]int, rs []*Response, scaleID, mode string) error {
	pidSet := map[string]struct{}{}
	for _, r := range rs {
		pidSet[r.ParticipantID] = struct{}{}
	}
	sc, err := s.store.GetScale(scaleID)
	if err != nil {
		return err
	}
	lang := "en"
	if mode == "label_zh" {
		lang = "zh"
	}
	colName := func(existing map[string]int, base string) string {
		name := base
		if _, ok := existing[name]; !ok {
			return name
		}
		for i := 2; ; i++ {
			cand := fmt.Sprintf("%s (%d)", base, i)
			if _, ok := existing[cand]; !ok {
				return cand
			}
		}
	}
	for pid := range pidSet {
		p, err := s.store.GetParticipant(pid)
		if err != nil {
			return err
		}
		if p == nil || p.ConsentID == "" {
			continue
		}
		c, err := s.store.GetConsentByID(p.ConsentID)
		if err != nil {
			return err
		}
		if c == nil || c.ScaleID != scaleID {
			continue
		}
		if mp[pid] == nil {
			mp[pid] = map[string]int{}
		}
		for k, v := range c.Choices {
			name := "consent." + k
			if mode == "label_en" || mode == "label_zh" {
				if lbl := consentLabel(sc, k, lang); lbl != "" {
					name = lbl
				}
				name = colName(mp[pid], name)
			}
			if v {
				mp[pid][name] = 1
			} else {
				mp[pid][name] = 0
			}
		}
	}
	return nil
}

func consentLabel(sc *Scale, key, lang string) string {
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
