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

// Scale captures fields used by the bulk response workflow.
type Scale struct {
	ID               string
	Points           int
	E2EEEnabled      bool
	TurnstileEnabled bool
}

// Item are survey items that accept responses.
type Item struct {
	ID            string
	Type          string
	ReverseScored bool
}

// ConsentRecord links a consent submission to a scale.
type ConsentRecord struct {
	ID      string
	ScaleID string
}

// Participant represents the respondent metadata stored during submission.
type Participant struct {
	ID        string
	Email     string
	ConsentID string
	SelfToken string
}

// Response expresses a single answered item.
type Response struct {
	ParticipantID string
	ItemID        string
	RawValue      int
	ScoreValue    int
	SubmittedAt   time.Time
	RawJSON       string
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

	if scale.TurnstileEnabled {
		if req.VerifyTurnstile == nil {
			return nil, ErrTurnstileVerificationFailed
		}
		ok, err := req.VerifyTurnstile(req.TurnstileToken)
		if err != nil || !ok {
			return nil, ErrTurnstileVerificationFailed
		}
	}

	if scale.E2EEEnabled {
		return nil, ErrPlaintextDisabled
	}

	participant := &Participant{ID: s.idGenerator(), Email: req.ParticipantEmail}
	if req.ConsentID != "" {
		if consent := s.store.GetConsentByID(req.ConsentID); consent != nil && consent.ScaleID == req.ScaleID {
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

		rawNum := 0
		hadNum := false
		if ans.RawInt != nil {
			rawNum = *ans.RawInt
			hadNum = true
		} else if len(ans.Raw) > 0 {
			var tmpNum float64
			if err := json.Unmarshal(ans.Raw, &tmpNum); err == nil {
				rawNum = int(tmpNum)
				hadNum = true
			}
		}

		resp := &Response{ParticipantID: participant.ID, ItemID: ans.ItemID, SubmittedAt: submittedAt}

		itemType := item.Type
		if itemType == "" {
			itemType = "likert"
		}
		switch itemType {
		case "likert":
			if !hadNum && len(ans.Raw) > 0 {
				var sval string
				if err := json.Unmarshal(ans.Raw, &sval); err == nil {
					if n, err := strconv.Atoi(strings.TrimSpace(sval)); err == nil {
						rawNum = n
						hadNum = true
					}
				}
			}
			if hadNum {
				resp.RawValue = rawNum
				score := rawNum
				if item.ReverseScored {
					score = ReverseScore(score, scale.Points)
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
			resp.RawJSON = string(ans.Raw)
		} else if hadNum {
			resp.RawJSON = strconv.Itoa(rawNum)
		}

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
