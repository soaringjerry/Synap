//go:build integration

package integration_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

func baseURL() string {
	if v := os.Getenv("SYNAP_TEST_BASE_URL"); strings.TrimSpace(v) != "" {
		return strings.TrimRight(v, "/")
	}
	return "http://127.0.0.1:18080"
}

func TestUserJourneyIntegration(t *testing.T) {
	client := &http.Client{Timeout: 5 * time.Second}
	base := baseURL()

	userEmail := fmt.Sprintf("integration_%d@example.com", time.Now().UnixNano())
	password := "Secret123!"
	tenantName := fmt.Sprintf("Tenant %d", time.Now().UnixNano())

	var registerResp struct {
		Token    string `json:"token"`
		TenantID string `json:"tenant_id"`
		UserID   string `json:"user_id"`
	}
	doPost(t, client, base+"/api/auth/register", "", map[string]any{
		"email":      userEmail,
		"password":   password,
		"tenantName": tenantName,
	}, &registerResp)
	if registerResp.Token == "" || registerResp.TenantID == "" {
		t.Fatalf("unexpected register response: %+v", registerResp)
	}

	var loginResp struct {
		Token string `json:"token"`
	}
	doPost(t, client, base+"/api/auth/login", "", map[string]string{
		"email":    userEmail,
		"password": password,
	}, &loginResp)
	token := loginResp.Token
	if token == "" {
		t.Fatalf("login did not return token")
	}

	var createScaleResp struct {
		ID string `json:"id"`
	}
	doPost(t, client, base+"/api/scales", token, map[string]any{
		"name_i18n":     map[string]string{"en": "Integration Scale"},
		"collect_email": "optional",
	}, &createScaleResp)
	if createScaleResp.ID == "" {
		t.Fatalf("expected scale id in response")
	}

	var itemResp struct {
		ID string `json:"id"`
	}
	doPost(t, client, base+"/api/items", token, map[string]any{
		"scale_id":  createScaleResp.ID,
		"stem_i18n": map[string]string{"en": "How satisfied are you?"},
		"type":      "likert",
		"required":  true,
		"likert_labels_i18n": map[string][]string{
			"en": []string{"Very dissatisfied", "Dissatisfied", "Neutral", "Satisfied", "Very satisfied"},
		},
	}, &itemResp)
	if itemResp.ID == "" {
		t.Fatalf("expected item id in response")
	}

	participantEmail := fmt.Sprintf("participant_%d@example.com", time.Now().UnixNano())
	var bulkResp struct {
		ParticipantID string `json:"participant_id"`
		Count         int    `json:"count"`
	}
	doPost(t, client, base+"/api/responses/bulk", "", map[string]any{
		"scale_id":    createScaleResp.ID,
		"participant": map[string]string{"email": participantEmail},
		"answers": []map[string]any{
			{
				"item_id": itemResp.ID,
				"raw":     4,
			},
		},
	}, &bulkResp)
	if bulkResp.ParticipantID == "" {
		t.Fatalf("expected participant id from bulk response")
	}

	exportURL := fmt.Sprintf("%s/api/export?scale_id=%s&format=long", base, createScaleResp.ID)
	req, err := http.NewRequest(http.MethodGet, exportURL, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("export request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("export status %d body %s", resp.StatusCode, string(body))
	}
	csvData, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read export data: %v", err)
	}
	csvContent := string(csvData)
	if !strings.Contains(csvContent, bulkResp.ParticipantID) {
		t.Fatalf("export csv did not contain participant id; csv=%s", csvContent)
	}
}

func doPost(t *testing.T, client *http.Client, url, token string, body any, out any) {
	t.Helper()
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(token) != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("http post %s failed: %v", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		t.Fatalf("unexpected status %d for %s: %s", resp.StatusCode, url, string(bodyBytes))
	}
	if out != nil {
		decoder := json.NewDecoder(resp.Body)
		if err := decoder.Decode(out); err != nil && err != io.EOF {
			t.Fatalf("decode response from %s: %v", url, err)
		}
	}
}
