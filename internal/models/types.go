package models

import "time"

// Participant represents a study participant. PII should be minimized.
type Participant struct {
	ID         string
	Email      string // optional; avoid storing if not required
	Age        int
	Education  string
	GroupLabel string
	Country    string
	Locale     string
	ASN        string
	CreatedAt  time.Time
}

// Scale defines a questionnaire scale (e.g., Likert 5/7).
type Scale struct {
	ID        string
	Name      string
	Points    int  // e.g., 5 or 7
	Randomize bool // whether to randomize item order
	Version   int
}

// Item is a question belonging to a scale.
type Item struct {
	ID            string
	ScaleID       string
	Stem          string
	ReverseScored bool
}

// Response represents a single item response.
type Response struct {
	ParticipantID string
	ItemID        string
	RawValue      int // raw input (e.g., 1..5)
	ScoreValue    int // scored value after reverse coding
	SubmittedAt   time.Time
}
