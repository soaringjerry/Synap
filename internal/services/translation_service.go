package services

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

type TranslationStore interface {
	GetScale(id string) (*Scale, error)
	ListItems(scaleID string) ([]*Item, error)
	GetAIConfig(tenantID string) (*TenantAIConfig, error)
}

type HTTPClient interface {
	Do(req *http.Request) (*http.Response, error)
}

type TranslationService struct {
	store  TranslationStore
	client HTTPClient
}

type TranslationPreviewRequest struct {
	ScaleID     string
	TargetLangs []string
	Model       string
	Scope       []string
}

func NewTranslationService(store TranslationStore, client HTTPClient) *TranslationService {
	if client == nil {
		client = http.DefaultClient
	}
	return &TranslationService{store: store, client: client}
}

func (s *TranslationService) PreviewScaleTranslation(tenantID string, req TranslationPreviewRequest) (map[string]any, error) {
	if strings.TrimSpace(req.ScaleID) == "" || len(req.TargetLangs) == 0 {
		return nil, NewInvalidError("scale_id and target_langs required")
	}
	sc, err := s.store.GetScale(req.ScaleID)
	if err != nil {
		return nil, err
	}
	if sc == nil || sc.TenantID != tenantID {
		return nil, NewForbiddenError("forbidden")
	}
	cfg, err := s.store.GetAIConfig(tenantID)
	if err != nil {
		return nil, err
	}
	if cfg == nil || !cfg.AllowExternal || strings.TrimSpace(cfg.OpenAIKey) == "" {
		return nil, NewInvalidError("external AI disabled or missing key")
	}
	model := req.Model
	if strings.TrimSpace(model) == "" {
		model = "gpt-4o-mini"
	}
	items, err := s.store.ListItems(req.ScaleID)
	if err != nil {
		return nil, err
	}
	src := buildTranslationSource(sc, items, req.TargetLangs)
	body, err := json.Marshal(src)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{
		"model":       model,
		"temperature": 0.2,
		"messages": []map[string]string{
			{"role": "system", "content": translationPrompt()},
			{"role": "user", "content": string(body)},
		},
		"response_format": map[string]string{"type": "json_object"},
	}
	pb, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	reqHTTP, err := http.NewRequest(http.MethodPost, normalizeOpenAIEndpoint(cfg.OpenAIBase), bytes.NewReader(pb))
	if err != nil {
		return nil, err
	}
	reqHTTP.Header.Set("Content-Type", "application/json")
	reqHTTP.Header.Set("Authorization", "Bearer "+cfg.OpenAIKey)
	resp, err := s.client.Do(reqHTTP)
	if err != nil {
		return nil, NewBadGatewayError(err.Error())
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return nil, NewBadGatewayError(string(b))
	}
	var cc struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&cc); err != nil {
		return nil, NewBadGatewayError(err.Error())
	}
	if len(cc.Choices) == 0 {
		return nil, NewBadGatewayError("no choices")
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(cc.Choices[0].Message.Content), &out); err != nil {
		return nil, NewBadGatewayError("invalid JSON from model")
	}
	return out, nil
}

func buildTranslationSource(sc *Scale, items []*Item, targets []string) map[string]any {
	type srcItem struct {
		ID   string `json:"id"`
		Text string `json:"text"`
	}
	src := map[string]any{
		"items":        []srcItem{},
		"name_i18n":    sc.NameI18n,
		"consent_i18n": sc.ConsentI18n,
		"targets":      targets,
	}
	slice := src["items"].([]srcItem)
	for _, it := range items {
		text := it.StemI18n["en"]
		if text == "" {
			for _, v := range it.StemI18n {
				text = v
				break
			}
		}
		slice = append(slice, srcItem{ID: it.ID, Text: text})
	}
	src["items"] = slice
	return src
}

func translationPrompt() string {
	return "Translate the following JSON payload into the target languages. Return ONLY a JSON object with fields: items (map of item_id to {lang:text}), name_i18n (map), consent_i18n (map). Keep placeholders and numeric scales intact."
}

func normalizeOpenAIEndpoint(base string) string {
	endpoint := strings.TrimRight(strings.TrimSpace(base), "/")
	if endpoint == "" {
		endpoint = "https://api.openai.com"
	}
	switch {
	case strings.HasSuffix(endpoint, "/chat/completions"):
		return endpoint
	case strings.HasSuffix(endpoint, "/v1"):
		return endpoint + "/chat/completions"
	case strings.HasSuffix(endpoint, "/v1/"):
		return strings.TrimRight(endpoint, "/") + "/chat/completions"
	default:
		return endpoint + "/v1/chat/completions"
	}
}
