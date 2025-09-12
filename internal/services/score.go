package services

// ReverseScore maps a raw Likert value to its reverse-scored value
// given the number of points in the scale (e.g., 5 or 7).
// raw is expected to be within [1, points]. Out-of-range values are clamped.
func ReverseScore(raw, points int) int {
	if points < 2 {
		return raw
	}
	if raw < 1 {
		raw = 1
	}
	if raw > points {
		raw = points
	}
	return (points + 1) - raw
}
