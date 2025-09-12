package services

// CronbachAlpha computes Cronbach's alpha for a matrix of item responses.
// The matrix is shaped as [nParticipants][nItems].
// This implementation uses population variance (divide by N) consistently,
// which yields alpha=1.0 for perfectly correlated items.
func CronbachAlpha(matrix [][]float64) float64 {
	n := len(matrix)
	if n == 0 {
		return 0
	}
	k := len(matrix[0])
	if k < 2 {
		return 0
	}

	// Compute item variances and total score variance (population variance).
	itemVars := make([]float64, k)
	totals := make([]float64, n)

	// Means per item
	means := make([]float64, k)
	for i := 0; i < n; i++ {
		row := matrix[i]
		if len(row) != k {
			return 0
		}
		for j := 0; j < k; j++ {
			means[j] += row[j]
			totals[i] += row[j]
		}
	}
	for j := 0; j < k; j++ {
		means[j] /= float64(n)
	}

	// Item variances (population)
	for j := 0; j < k; j++ {
		var sum float64
		for i := 0; i < n; i++ {
			d := matrix[i][j] - means[j]
			sum += d * d
		}
		itemVars[j] = sum / float64(n)
	}

	// Total variance of summed scores (population)
	var totalMean float64
	for i := 0; i < n; i++ {
		totalMean += totals[i]
	}
	totalMean /= float64(n)
	var totalVar float64
	for i := 0; i < n; i++ {
		d := totals[i] - totalMean
		totalVar += d * d
	}
	totalVar /= float64(n)

	if totalVar == 0 {
		return 0
	}
	var sumItemVars float64
	for _, v := range itemVars {
		sumItemVars += v
	}

	kf := float64(k)
	alpha := (kf / (kf - 1.0)) * (1.0 - (sumItemVars / totalVar))
	if alpha < 0 {
		return 0
	}
	if alpha > 1 {
		return 1
	}
	return alpha
}
