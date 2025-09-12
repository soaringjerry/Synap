package utils

// Minimal server-side i18n for fixed keys.
// UI strings should live in the frontend; server provides only essentials.

var translations = map[string]map[string]string{
	"en": {
		"health.ok": "ok",
	},
	"zh": {
		"health.ok": "好的",
	},
}

// T returns the translated string for key in locale; falls back to English.
func T(locale, key string) string {
	if m, ok := translations[locale]; ok {
		if v, ok := m[key]; ok {
			return v
		}
	}
	if m, ok := translations["en"]; ok {
		if v, ok := m[key]; ok {
			return v
		}
	}
	return key
}
