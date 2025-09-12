package utils

import "testing"

func TestDetermineLocale_QueryParamWins(t *testing.T) {
	got := DetermineLocale("zh-CN", "en-US,en;q=0.9,zh;q=0.8", []string{"en", "zh"}, "en")
	if got != "zh" {
		t.Fatalf("want zh, got %s", got)
	}
}

func TestDetermineLocale_AcceptLanguageOrder(t *testing.T) {
	got := DetermineLocale("", "en-US,en;q=0.9,zh;q=0.8", []string{"en", "zh"}, "en")
	if got != "en" {
		t.Fatalf("want en, got %s", got)
	}
}

func TestDetermineLocale_AcceptLanguagePrefersHigherQ(t *testing.T) {
	got := DetermineLocale("", "zh;q=0.9,en;q=0.8", []string{"en", "zh"}, "en")
	if got != "zh" {
		t.Fatalf("want zh, got %s", got)
	}
}

func TestDetermineLocale_DefaultFallback(t *testing.T) {
	got := DetermineLocale("", "fr-FR,es;q=0.9", []string{"en", "zh"}, "en")
	if got != "en" {
		t.Fatalf("want en fallback, got %s", got)
	}
}
