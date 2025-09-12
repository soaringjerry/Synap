package services

import (
	"encoding/csv"
	"strings"
	"testing"
)

func readCSV(b []byte) ([][]string, error) {
	r := csv.NewReader(strings.NewReader(string(b)))
	return r.ReadAll()
}

func TestExportLongCSV(t *testing.T) {
	rows := []LongRow{
		{ParticipantID: "P1", ItemID: "I1", RawValue: 4, ScoreValue: 2, SubmittedAt: "2024-01-01T00:00:00Z"},
		{ParticipantID: "P1", ItemID: "I2", RawValue: 5, ScoreValue: 5, SubmittedAt: "2024-01-01T00:00:10Z"},
		{ParticipantID: "P2", ItemID: "I1", RawValue: 1, ScoreValue: 4, SubmittedAt: "2024-01-02T00:00:00Z"},
		{ParticipantID: "P2", ItemID: "I2", RawValue: 3, ScoreValue: 3, SubmittedAt: "2024-01-02T00:00:10Z"},
	}
	b, err := ExportLongCSV(rows)
	if err != nil {
		t.Fatalf("export long: %v", err)
	}
	recs, err := readCSV(b)
	if err != nil {
		t.Fatalf("parse csv: %v", err)
	}
	if len(recs) != 1+len(rows) {
		t.Fatalf("want %d rows, got %d", 1+len(rows), len(recs))
	}
	if got := strings.Join(recs[0], ","); got != "participant_id,item_id,raw_value,score_value,submitted_at" {
		t.Fatalf("bad header: %s", got)
	}
}

func TestExportWideCSV(t *testing.T) {
	data := map[string]map[string]int{
		"P1": {"I1": 2, "I2": 5},
		"P2": {"I1": 4, "I2": 3},
	}
	b, err := ExportWideCSV(data)
	if err != nil {
		t.Fatalf("export wide: %v", err)
	}
	recs, err := readCSV(b)
	if err != nil {
		t.Fatalf("parse csv: %v", err)
	}
	if len(recs) != 1+len(data) {
		t.Fatalf("rows mismatch: %d", len(recs))
	}
	if strings.Join(recs[0], ",") != "participant_id,I1,I2" {
		t.Fatalf("header mismatch: %v", recs[0])
	}
}

func TestExportScoreCSV(t *testing.T) {
	data := map[string][]int{
		"P1": {2, 5},
		"P2": {4, 3, 1},
	}
	b, err := ExportScoreCSV(data)
	if err != nil {
		t.Fatalf("export score: %v", err)
	}
	recs, err := readCSV(b)
	if err != nil {
		t.Fatalf("parse csv: %v", err)
	}
	if len(recs) != 1+len(data) {
		t.Fatalf("rows mismatch: %d", len(recs))
	}
	// Order is sorted by participant id: P1 then P2
	if recs[1][0] != "P1" || recs[1][1] != "7" {
		t.Fatalf("P1 wrong: %v", recs[1])
	}
	if recs[2][0] != "P2" || recs[2][1] != "8" {
		t.Fatalf("P2 wrong: %v", recs[2])
	}
}
