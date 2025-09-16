package services

import "time"

type Scale struct {
	ID                string              `json:"id"`
	TenantID          string              `json:"tenant_id,omitempty"`
	Points            int                 `json:"points"`
	Randomize         bool                `json:"randomize"`
	NameI18n          map[string]string   `json:"name_i18n,omitempty"`
	ConsentI18n       map[string]string   `json:"consent_i18n,omitempty"`
	CollectEmail      string              `json:"collect_email,omitempty"`
	E2EEEnabled       bool                `json:"e2ee_enabled,omitempty"`
	Region            string              `json:"region,omitempty"`
	TurnstileEnabled  bool                `json:"turnstile_enabled,omitempty"`
	ItemsPerPage      int                 `json:"items_per_page,omitempty"`
	ConsentConfig     *ConsentConfig      `json:"consent_config,omitempty"`
	LikertLabelsI18n  map[string][]string `json:"likert_labels_i18n,omitempty"`
	LikertShowNumbers bool                `json:"likert_show_numbers,omitempty"`
	LikertPreset      string              `json:"likert_preset,omitempty"`
}

type ConsentOptionConf struct {
	Key       string            `json:"key"`
	LabelI18n map[string]string `json:"label_i18n,omitempty"`
	Required  bool              `json:"required"`
	Group     int               `json:"group,omitempty"`
	Order     int               `json:"order,omitempty"`
}

type ConsentConfig struct {
	Version           string              `json:"version"`
	Options           []ConsentOptionConf `json:"options,omitempty"`
	SignatureRequired bool                `json:"signature_required,omitempty"`
}

type Item struct {
	ID                string              `json:"id"`
	ScaleID           string              `json:"scale_id"`
	ReverseScored     bool                `json:"reverse_scored"`
	StemI18n          map[string]string   `json:"stem_i18n"`
	Type              string              `json:"type,omitempty"`
	OptionsI18n       map[string][]string `json:"options_i18n,omitempty"`
	PlaceholderI18n   map[string]string   `json:"placeholder_i18n,omitempty"`
	Min               int                 `json:"min,omitempty"`
	Max               int                 `json:"max,omitempty"`
	Step              int                 `json:"step,omitempty"`
	Required          bool                `json:"required,omitempty"`
	LikertLabelsI18n  map[string][]string `json:"likert_labels_i18n,omitempty"`
	LikertShowNumbers bool                `json:"likert_show_numbers,omitempty"`
	Order             int                 `json:"order,omitempty"`
}

type AuditEntry struct {
	Time   time.Time
	Actor  string
	Action string
	Target string
	Note   string
}
