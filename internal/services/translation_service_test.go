package services

import (
	"bytes"
	"io/ioutil"
	"net/http"
	"testing"
)

type stubTranslationStore struct {
	scale *Scale
	items []*Item
	cfg   *TenantAIConfig
}

func (s *stubTranslationStore) GetScale(id string) (*Scale, error) {
	if s.scale != nil && s.scale.ID == id {
		copy := *s.scale
		return &copy, nil
	}
	return nil, nil
}

func (s *stubTranslationStore) ListItems(scaleID string) ([]*Item, error) {
	out := []*Item{}
	for _, it := range s.items {
		if it.ScaleID == scaleID {
			copy := *it
			out = append(out, &copy)
		}
	}
	return out, nil
}

func (s *stubTranslationStore) GetAIConfig(tid string) (*TenantAIConfig, error) {
	if s.cfg != nil && s.cfg.TenantID == tid {
		copy := *s.cfg
		return &copy, nil
	}
	return nil, nil
}

type stubHTTPClient struct {
	resp *http.Response
	err  error
	req  *http.Request
}

func (c *stubHTTPClient) Do(req *http.Request) (*http.Response, error) {
	c.req = req
	return c.resp, c.err
}

func TestTranslationServiceSuccess(t *testing.T) {
	store := &stubTranslationStore{
		scale: &Scale{ID: "S1", TenantID: "T1", NameI18n: map[string]string{"en": "Name"}, ConsentI18n: map[string]string{"en": "Consent"}},
		items: []*Item{{ID: "I1", ScaleID: "S1", StemI18n: map[string]string{"en": "Hello"}}},
		cfg:   &TenantAIConfig{TenantID: "T1", OpenAIKey: "key", OpenAIBase: "https://api.openai.com", AllowExternal: true},
	}
	client := &stubHTTPClient{
		resp: &http.Response{
			StatusCode: 200,
			Body:       ioutil.NopCloser(bytes.NewBufferString(`{"choices":[{"message":{"content":"{\"items\":{\"I1\":{\"zh\":\"你好\"}}}"}}]}`)),
		},
	}
	svc := NewTranslationService(store, client)
	out, err := svc.PreviewScaleTranslation("T1", TranslationPreviewRequest{ScaleID: "S1", TargetLangs: []string{"zh"}})
	if err != nil {
		t.Fatalf("PreviewScaleTranslation error: %v", err)
	}
	if _, ok := out["items"]; !ok {
		t.Fatalf("expected items field in response")
	}
	if client.req == nil || client.req.Header.Get("Authorization") != "Bearer key" {
		t.Fatalf("expected Authorization header")
	}
}

func TestTranslationServiceValidation(t *testing.T) {
	svc := NewTranslationService(&stubTranslationStore{}, nil)
	if _, err := svc.PreviewScaleTranslation("T1", TranslationPreviewRequest{}); err == nil {
		t.Fatalf("expected validation error")
	}
}

func TestTranslationServiceBadGateway(t *testing.T) {
	store := &stubTranslationStore{
		scale: &Scale{ID: "S1", TenantID: "T1"},
		items: []*Item{},
		cfg:   &TenantAIConfig{TenantID: "T1", OpenAIKey: "key", AllowExternal: true},
	}
	client := &stubHTTPClient{
		resp: &http.Response{StatusCode: 500, Body: ioutil.NopCloser(bytes.NewBufferString("error"))},
	}
	svc := NewTranslationService(store, client)
	if _, err := svc.PreviewScaleTranslation("T1", TranslationPreviewRequest{ScaleID: "S1", TargetLangs: []string{"zh"}}); err == nil {
		t.Fatalf("expected error")
	}
}
