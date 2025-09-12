package utils

import (
	"sort"
	"strings"
)

// DetermineLocale resolves a locale to use based on explicit query param, Accept-Language header,
// supported locales, and a default fallback. Supported values should be normalized like "en", "zh".
func DetermineLocale(queryLang, acceptLang string, supported []string, def string) string {
	sup := map[string]struct{}{}
	for _, s := range supported {
		sup[strings.ToLower(s)] = struct{}{}
	}

	pick := func(lang string) (string, bool) {
		if lang == "" {
			return "", false
		}
		// Normalize: prefer base language (e.g., en-US -> en)
		l := strings.ToLower(lang)
		if _, ok := sup[l]; ok {
			return l, true
		}
		if i := strings.Index(l, "-"); i > 0 {
			base := l[:i]
			if _, ok := sup[base]; ok {
				return base, true
			}
		}
		return "", false
	}

	if v, ok := pick(queryLang); ok {
		return v
	}

	// Parse Accept-Language with simple q-values. Example: "en-US,en;q=0.9,zh;q=0.8"
	type cand struct {
		lang string
		q    float64
	}
	var cands []cand
	for _, part := range strings.Split(acceptLang, ",") {
		p := strings.TrimSpace(part)
		if p == "" {
			continue
		}
		lang := p
		q := 1.0
		if semi := strings.Index(p, ";"); semi >= 0 {
			lang = strings.TrimSpace(p[:semi])
			rest := p[semi+1:]
			if i := strings.Index(rest, "="); i >= 0 {
				if strings.TrimSpace(rest[:i]) == "q" {
					if val := strings.TrimSpace(rest[i+1:]); val != "" {
						// naive parse; only care about first 3 chars e.g., 0.8
						if len(val) > 5 {
							val = val[:5]
						}
						switch val {
						case "1", "1.0", "1.00":
							q = 1.0
						case "0":
							q = 0
						default:
							// best-effort parse without importing strconv to keep deps tight
							// handle patterns 0.x or .x
							v := 0.0
							s := val
							if strings.HasPrefix(s, ".") {
								s = "0" + s
							}
							// manual tiny parser
							if len(s) >= 3 && s[0] == '0' && s[1] == '.' && s[2] >= '0' && s[2] <= '9' {
								v = float64(s[2]-'0') / 10.0
								if len(s) >= 4 && s[3] >= '0' && s[3] <= '9' {
									v += float64(s[3]-'0') / 100.0
								}
								q = v
							}
						}
					}
				}
			}
		}
		if l, ok := pick(lang); ok {
			cands = append(cands, cand{lang: l, q: q})
		}
	}
	if len(cands) > 0 {
		sort.SliceStable(cands, func(i, j int) bool { return cands[i].q > cands[j].q })
		return cands[0].lang
	}
	if v, ok := pick(def); ok {
		return v
	}
	// If def not in supported, pick first supported to avoid empty
	if len(supported) > 0 {
		return strings.ToLower(supported[0])
	}
	return "en"
}
