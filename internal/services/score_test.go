package services

import "testing"

func TestReverseScore(t *testing.T) {
	cases := []struct {
		raw, points, want int
	}{
		{1, 5, 5},
		{2, 5, 4},
		{3, 5, 3},
		{5, 5, 1},
		{0, 5, 5},
		{6, 5, 1},
		{1, 7, 7},
		{7, 7, 1},
	}
	for _, c := range cases {
		if got := ReverseScore(c.raw, c.points); got != c.want {
			t.Fatalf("ReverseScore(%d,%d)=%d, want %d", c.raw, c.points, got, c.want)
		}
	}
}
