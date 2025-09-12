package utils

import "testing"

func TestT_Fallback(t *testing.T) {
	if got := T("fr", "health.ok"); got != "ok" {
		t.Fatalf("fallback to en failed: %s", got)
	}
}
