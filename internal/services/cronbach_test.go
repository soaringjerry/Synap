package services

import "testing"

func TestCronbachAlpha_PerfectCorrelation(t *testing.T) {
	// 4 participants, 3 items; items are perfectly correlated.
	// For population-variance-based alpha, expect alpha = 1.0
	data := [][]float64{
		{1, 1, 1},
		{2, 2, 2},
		{3, 3, 3},
		{4, 4, 4},
	}
	got := CronbachAlpha(data)
	if got < 0.999 || got > 1.001 {
		t.Fatalf("alpha expected ~1.0, got %f", got)
	}
}

func TestCronbachAlpha_Bounds(t *testing.T) {
	data := [][]float64{
		{1, 2, 3},
		{2, 1, 4},
		{3, 0, 5},
		{4, -1, 6},
	}
	got := CronbachAlpha(data)
	if got < 0 || got > 1 {
		t.Fatalf("alpha out of bounds [0,1]: %f", got)
	}
}
