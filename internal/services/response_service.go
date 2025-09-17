package services

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// BulkResponseStore abstracts persistence operations required by ResponseService.
type BulkResponseStore interface {
	GetScale(id string) *Scale
	GetItem(id string) *Item
	GetConsentByID(id string) *ConsentRecord
	AddParticipant(p *Participant) (*Participant, error)
	AddResponses(rs []*Response) error
}

// BulkAnswer mirrors the inbound payload for each answer.
type BulkAnswer struct {
	ItemID string
	Raw    json.RawMessage
	RawInt *int
}

// BulkResponsesRequest transports the sanitized handler input into the service layer.
type BulkResponsesRequest struct {
	ScaleID          string
	ParticipantEmail string
	ConsentID        string
	TurnstileToken   string
	Answers          []BulkAnswer
	VerifyTurnstile  func(token string) (bool, error)
}

// BulkResponsesResult collects the data needed to emit the HTTP response.
type BulkResponsesResult struct {
	ParticipantID  string
	ResponsesCount int
	SelfToken      string
}

var (
	// ErrScaleNotFound is returned when a submission references a missing scale.
	ErrScaleNotFound = errors.New("scale not found")
	// ErrTurnstileVerificationFailed indicates Cloudflare Turnstile verification failed.
	ErrTurnstileVerificationFailed = errors.New("turnstile verification failed")
	// ErrPlaintextDisabled flags that plaintext submissions are disallowed for E2EE projects.
	ErrPlaintextDisabled = errors.New("plaintext submissions are disabled for E2EE projects")
)

// ResponseService hosts the core submission workflow for plaintext responses.
type ResponseService struct {
	store       BulkResponseStore
	now         func() time.Time
	idGenerator func() string
}

// NewResponseService constructs a service bound to the provided persistence interface.
func NewResponseService(store BulkResponseStore) *ResponseService {
	return &ResponseService{
		store:       store,
		now:         func() time.Time { return time.Now().UTC() },
		idGenerator: defaultParticipantID,
	}
}

func defaultParticipantID() string {
	return strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
}

// ProcessBulkResponses executes the legacy /api/responses/bulk workflow without HTTP concerns.
func (s *ResponseService) ProcessBulkResponses(req BulkResponsesRequest) (*BulkResponsesResult, error) {
	if s.store == nil {
		return nil, errors.New("response service store is nil")
	}

	scale := s.store.GetScale(req.ScaleID)
	if scale == nil {
		return nil, ErrScaleNotFound
	}
	if err := requireTurnstileIfNeeded(scale, req.TurnstileToken, req.VerifyTurnstile); err != nil {
		return nil, err
	}
	if scale.E2EEEnabled {
		return nil, ErrPlaintextDisabled
	}

	participant, err := s.createParticipant(req, scale.ID)
	if err != nil {
		return nil, err
	}

	submittedAt := s.now()
	responses := make([]*Response, 0, len(req.Answers))
	for _, ans := range req.Answers {
		if ans.ItemID == "" {
			continue
		}
		item := s.store.GetItem(ans.ItemID)
		if item == nil {
			continue
		}
		resp := buildResponseForItem(ans, item, scale.Points, submittedAt, participant.ID)
		responses = append(responses, resp)
	}

	if err := s.store.AddResponses(responses); err != nil {
		return nil, err
	}

	return &BulkResponsesResult{
		ParticipantID:  participant.ID,
		ResponsesCount: len(responses),
		SelfToken:      participant.SelfToken,
	}, nil
}

func requireTurnstileIfNeeded(scale *Scale, token string, verify func(string) (bool, error)) error {
	if scale.TurnstileEnabled {
		if verify == nil {
			return ErrTurnstileVerificationFailed
		}
		ok, err := verify(token)
		if err != nil || !ok {
			return ErrTurnstileVerificationFailed
		}
	}
	return nil
}

func (s *ResponseService) createParticipant(req BulkResponsesRequest, scaleID string) (*Participant, error) {
	participant := &Participant{ID: s.idGenerator(), Email: req.ParticipantEmail}
	if req.ConsentID != "" {
		if consent := s.store.GetConsentByID(req.ConsentID); consent != nil && consent.ScaleID == scaleID {
			participant.ConsentID = req.ConsentID
		}
	}
	storedParticipant, err := s.store.AddParticipant(participant)
	if err != nil {
		return nil, err
	}
	if storedParticipant != nil {
		participant = storedParticipant
	}
	return participant, nil
}

func buildResponseForItem(ans BulkAnswer, item *Item, scalePoints int, submittedAt time.Time, participantID string) *Response {
	resp := &Response{ParticipantID: participantID, ItemID: ans.ItemID, SubmittedAt: submittedAt}
	rawNum, hadNum := parseNumericAnswer(ans)
	itemType := item.Type
	if itemType == "" {
		itemType = "likert"
	}
	switch itemType {
	case "likert":
		if hadNum {
			resp.RawValue = rawNum
			score := rawNum
			if item.ReverseScored {
				score = ReverseScore(score, scalePoints)
			}
			resp.ScoreValue = score
		}
	case "rating", "slider", "numeric":
		if hadNum {
			resp.RawValue = rawNum
			resp.ScoreValue = rawNum
		}
	default:
		// non-numeric types keep zero scores and capture the raw payload below
	}

	if len(ans.Raw) > 0 {
		// For non-numeric types, canonicalise to EN labels where possible so server-side exports are analysis-friendly.
		if itemType != "likert" && itemType != "rating" && itemType != "slider" && itemType != "numeric" {
			if norm := normalizeRawToEnglish(item, ans.Raw); norm != "" {
				resp.RawJSON = norm
			} else {
				resp.RawJSON = string(ans.Raw)
			}
		} else {
			resp.RawJSON = string(ans.Raw)
		}
	} else if hadNum {
		resp.RawJSON = strconv.Itoa(rawNum)
	}
	return resp
}

// normalizeRawToEnglish tries to map textual option(s) provided by the client to English labels using OptionsI18n.
// It supports both string and []string payloads. Returns empty string if no mapping was possible.
func normalizeRawToEnglish(item *Item, raw json.RawMessage) string {
	if item == nil || item.OptionsI18n == nil || len(raw) == 0 {
		return ""
	}
	// Build option matrix and prefer English when available
	opts := item.OptionsI18n
	getEnglish := func(idx int) string {
		if enList, ok := opts["en"]; ok && idx >= 0 && idx < len(enList) {
			return enList[idx]
		}
		// Fallback: return first non-empty label across languages at this index
		for _, list := range opts {
			if idx >= 0 && idx < len(list) && strings.TrimSpace(list[idx]) != "" {
				return list[idx]
			}
		}
		return ""
	}
	findIndex := func(val string) int {
		v := strings.TrimSpace(val)
		for _, list := range opts {
			for i, lab := range list {
				if strings.EqualFold(strings.TrimSpace(lab), v) {
					return i
				}
			}
		}
		return -1
	}
	// Case 1: single string value
	var sval string
	if err := json.Unmarshal(raw, &sval); err == nil {
		if idx := findIndex(sval); idx >= 0 {
			if en := getEnglish(idx); en != "" {
				b, _ := json.Marshal(en)
				return string(b)
			}
		}
		return ""
	}
	// Case 2: list of strings
	var arr []string
	if err := json.Unmarshal(raw, &arr); err == nil {
		out := make([]string, 0, len(arr))
		changed := false
		for _, v := range arr {
			if idx := findIndex(v); idx >= 0 {
				if en := getEnglish(idx); en != "" {
					out = append(out, en)
					changed = true
					continue
				}
			}
			out = append(out, v)
		}
		if changed {
			b, _ := json.Marshal(out)
			return string(b)
		}
		return ""
	}
	return ""
}

func parseNumericAnswer(ans BulkAnswer) (int, bool) {
	if ans.RawInt != nil {
		return *ans.RawInt, true
	}
	if len(ans.Raw) == 0 {
		return 0, false
	}
	var tmpNum float64
	if err := json.Unmarshal(ans.Raw, &tmpNum); err == nil {
		return int(tmpNum), true
	}
	var sval string
	if err := json.Unmarshal(ans.Raw, &sval); err == nil {
		if n, err := strconv.Atoi(strings.TrimSpace(sval)); err == nil {
			return n, true
		}
	}
	return 0, false
}
