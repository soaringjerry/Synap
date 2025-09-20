package services

import (
	"encoding/json"
	"fmt"
	"strings"
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
	HeaderLang    string // en|zh (for item headers in wide)
	ValuesMode    string // "numeric" (default) | "label"
	ValueLang     string // en|zh (for label mode)
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

	// normalise languages
	headerLang := params.HeaderLang
	if headerLang == "" {
		headerLang = "en"
	}
	valueLang := params.ValueLang
	if valueLang == "" {
		valueLang = headerLang
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
		if params.ValuesMode == "label" {
			// Build string-valued wide table with item headers in desired language
			strMp, err := s.buildWideMapStrings(rs, items, sc, valueLang, headerLang)
			if err != nil {
				return nil, err
			}
			if err := s.mergeConsentWideStrings(strMp, rs, params.ScaleID, params.ConsentHeader); err != nil {
				return nil, err
			}
			b, err := ExportWideCSVStrings(strMp)
			if err != nil {
				return nil, err
			}
			return &ExportResult{Filename: "wide.csv", ContentType: "text/csv; charset=utf-8", Data: b}, nil
		}
		// numeric values (existing behaviour)
		mp := buildWideMap(rs)
		applyItemHeaders(mp, items, headerLang)
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

// applyEnglishItemHeaders renames map keys (item IDs) to English stems consistently across participants.
// If multiple items share the same English stem, suffix " (2)", "(3)" etc. to keep headers unique.
func applyEnglishItemHeaders(mp map[string]map[string]int, items []*Item) {
	baseNames := make(map[string]string) // itemID -> baseName
	counts := make(map[string]int)       // baseName -> count
	for _, it := range items {
		base := it.ID
		if it.StemI18n != nil && it.StemI18n["en"] != "" {
			base = it.StemI18n["en"]
		}
		baseNames[it.ID] = base
		counts[base]++
	}
	// Build final unique names mapping
	unique := make(map[string]string) // itemID -> unique name
	// Track next index per base for deterministic suffixing
	nextIdx := make(map[string]int)
	for _, it := range items {
		base := baseNames[it.ID]
		if counts[base] <= 1 {
			unique[it.ID] = base
		} else {
			nextIdx[base]++
			idx := nextIdx[base]
			if idx == 1 {
				// first occurrence keeps base
				unique[it.ID] = base
			} else {
				unique[it.ID] = fmt.Sprintf("%s (%d)", base, idx)
			}
		}
	}
	// Apply rename per participant map
	for pid, row := range mp {
		renamed := make(map[string]int, len(row))
		for key, val := range row {
			if newk, ok := unique[key]; ok {
				renamed[newk] = val
			} else {
				renamed[key] = val
			}
		}
		mp[pid] = renamed
	}
}

// applyItemHeaders is a generalized version that supports en|zh header languages.
func applyItemHeaders(mp map[string]map[string]int, items []*Item, lang string) {
	if lang == "en" || lang == "" {
		applyEnglishItemHeaders(mp, items)
		return
	}
	baseNames := make(map[string]string)
	counts := make(map[string]int)
	for _, it := range items {
		base := it.ID
		if it.StemI18n != nil {
			if s := it.StemI18n[lang]; s != "" {
				base = s
			} else if s := it.StemI18n["en"]; s != "" {
				base = s
			}
		}
		baseNames[it.ID] = base
		counts[base]++
	}
	unique := make(map[string]string)
	nextIdx := make(map[string]int)
	for _, it := range items {
		base := baseNames[it.ID]
		if counts[base] <= 1 {
			unique[it.ID] = base
		} else {
			nextIdx[base]++
			idx := nextIdx[base]
			if idx == 1 {
				unique[it.ID] = base
			} else {
				unique[it.ID] = fmt.Sprintf("%s (%d)", base, idx)
			}
		}
	}
	for pid, row := range mp {
		renamed := make(map[string]int, len(row))
		for key, val := range row {
			if newk, ok := unique[key]; ok {
				renamed[newk] = val
			} else {
				renamed[key] = val
			}
		}
		mp[pid] = renamed
	}
}

// buildWideMapStrings returns a map[pid]map[itemHeader]string using label/text values.
func (s *ExportService) buildWideMapStrings(rs []*Response, items []*Item, sc *Scale, valLang, headerLang string) (map[string]map[string]string, error) {
	// Build header names once (unique per item ID)
	headerByItem := func() map[string]string {
		base := make(map[string]string)
		counts := make(map[string]int)
		for _, it := range items {
			name := it.ID
			if it.StemI18n != nil {
				if v := it.StemI18n[headerLang]; v != "" {
					name = v
				} else if v := it.StemI18n["en"]; v != "" {
					name = v
				}
			}
			base[it.ID] = name
			counts[name]++
		}
		unique := make(map[string]string)
		next := make(map[string]int)
		for _, it := range items {
			name := base[it.ID]
			if counts[name] <= 1 {
				unique[it.ID] = name
			} else {
				next[name]++
				idx := next[name]
				if idx == 1 {
					unique[it.ID] = name
				} else {
					unique[it.ID] = fmt.Sprintf("%s (%d)", name, idx)
				}
			}
		}
		return unique
	}()

	// Build item index
	itemByID := make(map[string]*Item)
	for _, it := range items {
		itemByID[it.ID] = it
	}
	out := map[string]map[string]string{}
	for _, r := range rs {
		it := itemByID[r.ItemID]
		if it == nil {
			continue
		}
		pid := r.ParticipantID
		if out[pid] == nil {
			out[pid] = map[string]string{}
		}
		header := headerByItem[r.ItemID]
		out[pid][header] = s.valueToLabel(it, sc, r, valLang)
	}
	return out, nil
}

func (s *ExportService) valueToLabel(it *Item, sc *Scale, r *Response, lang string) string {
	// Likert: prefer item-level labels, fallback to scale-level labels
	if it.Type == "" || it.Type == "likert" {
		if r.RawValue > 0 { // map raw (not reverse-scored) to label index
			idx := r.RawValue - 1
			// item-level labels
			if it.LikertLabelsI18n != nil {
				if arr, ok := it.LikertLabelsI18n[lang]; ok && idx >= 0 && idx < len(arr) && arr[idx] != "" {
					return arr[idx]
				}
				if arr, ok := it.LikertLabelsI18n["en"]; ok && idx >= 0 && idx < len(arr) && arr[idx] != "" {
					return arr[idx]
				}
			}
			// scale-level labels
			if sc != nil && sc.LikertLabelsI18n != nil {
				if arr, ok := sc.LikertLabelsI18n[lang]; ok && idx >= 0 && idx < len(arr) && arr[idx] != "" {
					return arr[idx]
				}
				if arr, ok := sc.LikertLabelsI18n["en"]; ok && idx >= 0 && idx < len(arr) && arr[idx] != "" {
					return arr[idx]
				}
			}
			// fallback to number
			return itoa(r.RawValue)
		}
		// no raw numeric, fallback to raw json mapping
	}
	// Non-likert with options: map RawJSON (which may hold EN-normalised strings) to target language
	if it.OptionsI18n != nil && r.RawJSON != "" {
		if v := mapRawJSONToLang(it, r.RawJSON, lang); v != "" {
			return v
		}
	}
	// numeric-like types
	if it.Type == "rating" || it.Type == "slider" || it.Type == "numeric" {
		if r.RawValue != 0 {
			return itoa(r.RawValue)
		}
		return itoa(r.ScoreValue)
	}
	// last resort: use RawJSON as-is
	return r.RawJSON
}

// mapRawJSONToLang maps JSON string or [string] using OptionsI18n to the target language when possible.
// Returns a single string value (arrays joined by ", ").
func mapRawJSONToLang(it *Item, rawJSON string, lang string) string {
	if it == nil || it.OptionsI18n == nil || rawJSON == "" {
		return ""
	}
	// helper to get label by index
	getByIdx := func(idx int) string {
		if arr, ok := it.OptionsI18n[lang]; ok && idx >= 0 && idx < len(arr) && arr[idx] != "" {
			return arr[idx]
		}
		if arr, ok := it.OptionsI18n["en"]; ok && idx >= 0 && idx < len(arr) && arr[idx] != "" {
			return arr[idx]
		}
		// fallback: first non-empty across languages at idx
		for _, list := range it.OptionsI18n {
			if idx >= 0 && idx < len(list) && list[idx] != "" {
				return list[idx]
			}
		}
		return ""
	}
	// find index by matching any language
	findIndex := func(val string) int {
		v := strings.TrimSpace(val)
		for _, list := range it.OptionsI18n {
			for i, lab := range list {
				if strings.EqualFold(strings.TrimSpace(lab), v) {
					return i
				}
			}
		}
		return -1
	}
	// Try as single string
	var s string
	if err := json.Unmarshal([]byte(rawJSON), &s); err == nil {
		if idx := findIndex(s); idx >= 0 {
			if out := getByIdx(idx); out != "" {
				return out
			}
		}
		return s
	}
	// Try as array of strings
	var arr []string
	if err := json.Unmarshal([]byte(rawJSON), &arr); err == nil {
		outs := make([]string, 0, len(arr))
		for _, v := range arr {
			if idx := findIndex(v); idx >= 0 {
				if out := getByIdx(idx); out != "" {
					outs = append(outs, out)
					continue
				}
			}
			outs = append(outs, v)
		}
		return strings.Join(outs, ", ")
	}
	return ""
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

// mergeConsentWideStrings mirrors mergeConsentWide but for string-valued tables.
func (s *ExportService) mergeConsentWideStrings(mp map[string]map[string]string, rs []*Response, scaleID, mode string) error {
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
	colName := func(existing map[string]string, base string) string {
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
			mp[pid] = map[string]string{}
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
				mp[pid][name] = "1"
			} else {
				mp[pid][name] = "0"
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
