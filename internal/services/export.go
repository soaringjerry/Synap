package services

import (
	"bytes"
	"encoding/csv"
	"sort"
)

type LongRow struct {
	ParticipantID string
	ItemID        string
	RawValue      int
	ScoreValue    int
	SubmittedAt   string // ISO8601 suggested; string for CSV simplicity
}

// ExportLongCSV renders rows into a long-format CSV.
func ExportLongCSV(rows []LongRow) ([]byte, error) {
	buf := &bytes.Buffer{}
	w := csv.NewWriter(buf)
	_ = w.Write([]string{"participant_id", "item_id", "raw_value", "score_value", "submitted_at"})
	for _, r := range rows {
		rec := []string{
			r.ParticipantID,
			r.ItemID,
			itoa(r.RawValue),
			itoa(r.ScoreValue),
			r.SubmittedAt,
		}
		if err := w.Write(rec); err != nil {
			return nil, err
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

// ExportWideCSV renders a wide-format CSV with participant-per-row and one column per item.
// inputs is a map[participantID]map[itemID]scoreValue.
func ExportWideCSV(inputs map[string]map[string]int) ([]byte, error) {
	// Determine item order (sorted for stable output).
	itemSet := map[string]struct{}{}
	for _, m := range inputs {
		for itemID := range m {
			itemSet[itemID] = struct{}{}
		}
	}
	items := make([]string, 0, len(itemSet))
	for id := range itemSet {
		items = append(items, id)
	}
	sort.Strings(items)

	// Participant order
	pids := make([]string, 0, len(inputs))
	for pid := range inputs {
		pids = append(pids, pid)
	}
	sort.Strings(pids)

	buf := &bytes.Buffer{}
	w := csv.NewWriter(buf)
	header := append([]string{"participant_id"}, items...)
	_ = w.Write(header)
	for _, pid := range pids {
		row := make([]string, 0, 1+len(items))
		row = append(row, pid)
		for _, itemID := range items {
			row = append(row, itoa(inputs[pid][itemID]))
		}
		if err := w.Write(row); err != nil {
			return nil, err
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

// ExportWideCSVStrings renders a wide-format CSV with string values per cell.
// inputs is a map[participantID]map[itemHeader]string.
func ExportWideCSVStrings(inputs map[string]map[string]string) ([]byte, error) {
	// Determine item order (sorted for stable output).
	itemSet := map[string]struct{}{}
	for _, m := range inputs {
		for itemID := range m {
			itemSet[itemID] = struct{}{}
		}
	}
	items := make([]string, 0, len(itemSet))
	for id := range itemSet {
		items = append(items, id)
	}
	sort.Strings(items)

	// Participant order
	pids := make([]string, 0, len(inputs))
	for pid := range inputs {
		pids = append(pids, pid)
	}
	sort.Strings(pids)

	buf := &bytes.Buffer{}
	w := csv.NewWriter(buf)
	header := append([]string{"participant_id"}, items...)
	_ = w.Write(header)
	for _, pid := range pids {
		row := make([]string, 0, 1+len(items))
		row = append(row, pid)
		for _, itemID := range items {
			row = append(row, inputs[pid][itemID])
		}
		if err := w.Write(row); err != nil {
			return nil, err
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

// ExportScoreCSV renders total scores per participant.
// inputs is a map[participantID][]scoreValues (or map[itemID]score, we accept slice summation version here).
func ExportScoreCSV(inputs map[string][]int) ([]byte, error) {
	pids := make([]string, 0, len(inputs))
	for pid := range inputs {
		pids = append(pids, pid)
	}
	sort.Strings(pids)

	buf := &bytes.Buffer{}
	w := csv.NewWriter(buf)
	_ = w.Write([]string{"participant_id", "total_score"})
	for _, pid := range pids {
		sum := 0
		for _, v := range inputs[pid] {
			sum += v
		}
		if err := w.Write([]string{pid, itoa(sum)}); err != nil {
			return nil, err
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

func itoa(i int) string {
	// local small int->string to avoid importing strconv everywhere
	// handles small ints typical for Likert scores
	if i == 0 {
		return "0"
	}
	neg := false
	if i < 0 {
		neg = true
		i = -i
	}
	var b [20]byte
	bp := len(b)
	for i > 0 {
		bp--
		b[bp] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		bp--
		b[bp] = '-'
	}
	return string(b[bp:])
}

// ExportItemsCSV renders a CSV of item definitions to aid analysis and review.
// Columns include ids, order, type, required flags, ranges and i18n text.
func ExportItemsCSV(items []*Item) ([]byte, error) {
	// Ensure stable ordering by Order then ID
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Order == items[j].Order {
			return items[i].ID < items[j].ID
		}
		return items[i].Order < items[j].Order
	})
	buf := &bytes.Buffer{}
	w := csv.NewWriter(buf)
	_ = w.Write([]string{
		"item_id", "position", "type", "required", "reverse_scored", "min", "max", "step",
		"stem_en", "stem_zh", "options_en", "options_zh", "placeholder_en", "placeholder_zh",
		"likert_labels_en", "likert_labels_zh", "likert_show_numbers",
	})
	join := func(ss []string) string {
		if len(ss) == 0 {
			return ""
		}
		// Use pipe as a human-friendly internal separator; csv.Writer will quote if needed
		out := make([]byte, 0, 16*len(ss))
		for i, s := range ss {
			if i > 0 {
				out = append(out, ' ', '|', ' ')
			}
			out = append(out, []byte(s)...)
		}
		return string(out)
	}
	for _, it := range items {
		stemEn := ""
		stemZh := ""
		if it.StemI18n != nil {
			stemEn = it.StemI18n["en"]
			stemZh = it.StemI18n["zh"]
		}
		optsEn := ""
		optsZh := ""
		if it.OptionsI18n != nil {
			optsEn = join(it.OptionsI18n["en"])
			optsZh = join(it.OptionsI18n["zh"])
		}
		phEn := ""
		phZh := ""
		if it.PlaceholderI18n != nil {
			phEn = it.PlaceholderI18n["en"]
			phZh = it.PlaceholderI18n["zh"]
		}
		lkEn := ""
		lkZh := ""
		if it.LikertLabelsI18n != nil {
			lkEn = join(it.LikertLabelsI18n["en"])
			lkZh = join(it.LikertLabelsI18n["zh"])
		}
		rec := []string{
			it.ID,
			itoa(it.Order),
			it.Type,
			map[bool]string{true: "true", false: "false"}[it.Required],
			map[bool]string{true: "true", false: "false"}[it.ReverseScored],
			itoa(it.Min), itoa(it.Max), itoa(it.Step),
			stemEn, stemZh, optsEn, optsZh, phEn, phZh, lkEn, lkZh,
			map[bool]string{true: "true", false: "false"}[it.LikertShowNumbers],
		}
		if err := w.Write(rec); err != nil {
			return nil, err
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}
