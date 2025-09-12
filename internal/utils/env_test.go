package utils

import (
	"os"
	"testing"
)

func TestSafeEnv(t *testing.T) {
	const key = "_SYNAP_TEST_SAFEENV"
	os.Unsetenv(key)
	if got := SafeEnv(key, "fallback"); got != "fallback" {
		t.Fatalf("expected fallback, got %q", got)
	}
	os.Setenv(key, "value")
	if got := SafeEnv(key, "fallback"); got != "value" {
		t.Fatalf("expected 'value', got %q", got)
	}
}
