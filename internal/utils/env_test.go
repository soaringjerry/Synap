package utils

import (
	"os"
	"testing"
)

func TestSafeEnv(t *testing.T) {
	const key = "_SYNAP_TEST_SAFEENV"
	if err := os.Unsetenv(key); err != nil {
		t.Fatalf("unsetenv: %v", err)
	}
	if got := SafeEnv(key, "fallback"); got != "fallback" {
		t.Fatalf("expected fallback, got %q", got)
	}
	if err := os.Setenv(key, "value"); err != nil {
		t.Fatalf("setenv: %v", err)
	}
	if got := SafeEnv(key, "fallback"); got != "value" {
		t.Fatalf("expected 'value', got %q", got)
	}
}
