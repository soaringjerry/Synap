package db

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/soaringjerry/Synap/internal/api"
	sq "github.com/soaringjerry/Synap/internal/db/sqlc"
)

type SQLiteStore struct {
	db         *sql.DB
	q          *sq.Queries
	exportMu   sync.Mutex
	exportJobs map[string]*api.ExportJob
	lastExport map[string]time.Time
}

func NewSQLiteStore(db *sql.DB) (*SQLiteStore, error) {
	if db == nil {
		return nil, errors.New("nil db")
	}
	pragmas := []string{
		"PRAGMA foreign_keys = ON",
		"PRAGMA journal_mode = WAL",
		"PRAGMA synchronous = NORMAL",
	}
	for _, stmt := range pragmas {
		if _, err := db.Exec(stmt); err != nil {
			return nil, fmt.Errorf("apply sqlite pragma %q: %w", stmt, err)
		}
	}
	return &SQLiteStore{
		db:         db,
		q:          sq.New(db),
		exportJobs: map[string]*api.ExportJob{},
		lastExport: map[string]time.Time{},
	}, nil
}

func NewStore(db *sql.DB) (api.Store, error) {
	return NewSQLiteStore(db)
}

func (s *SQLiteStore) logErr(prefix string, err error) {
	if err != nil {
		log.Printf("sqlite store: %s: %v", prefix, err)
	}
}

func contextBg() context.Context { return context.Background() }

func boolToInt64(v bool) int64 {
	if v {
		return 1
	}
	return 0
}

func int64ToBool(v int64) bool { return v != 0 }

func toNullString(s string) sql.NullString {
	if strings.TrimSpace(s) == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func toNullInt(i int) sql.NullInt64 {
	if i == 0 {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: int64(i), Valid: true}
}

func encodeJSON(v any) (sql.NullString, error) {
	if v == nil {
		return sql.NullString{}, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return sql.NullString{}, err
	}
	return sql.NullString{String: string(b), Valid: true}, nil
}

func decodeStringMap(ns sql.NullString) map[string]string {
	if !ns.Valid || strings.TrimSpace(ns.String) == "" {
		return nil
	}
	var out map[string]string
	if err := json.Unmarshal([]byte(ns.String), &out); err != nil {
		log.Printf("sqlite store: decode string map: %v", err)
		return nil
	}
	return out
}

func decodeStringSliceMap(ns sql.NullString) map[string][]string {
	if !ns.Valid || strings.TrimSpace(ns.String) == "" {
		return nil
	}
	var out map[string][]string
	if err := json.Unmarshal([]byte(ns.String), &out); err != nil {
		log.Printf("sqlite store: decode string slice map: %v", err)
		return nil
	}
	return out
}

func decodeConsentConfig(ns sql.NullString) *api.ConsentConfig {
	if !ns.Valid || strings.TrimSpace(ns.String) == "" {
		return nil
	}
	var cfg api.ConsentConfig
	if err := json.Unmarshal([]byte(ns.String), &cfg); err != nil {
		log.Printf("sqlite store: decode consent config: %v", err)
		return nil
	}
	return &cfg
}

func decodeChoices(ns sql.NullString) map[string]bool {
	if !ns.Valid || strings.TrimSpace(ns.String) == "" {
		return nil
	}
	var out map[string]bool
	if err := json.Unmarshal([]byte(ns.String), &out); err != nil {
		log.Printf("sqlite store: decode consent choices: %v", err)
		return nil
	}
	return out
}

func decodeEncDEK(ns sql.NullString) []string {
	if !ns.Valid || strings.TrimSpace(ns.String) == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(ns.String), &out); err != nil {
		log.Printf("sqlite store: decode enc_dek: %v", err)
		return nil
	}
	return out
}

func encodeEncDEK(list []string) (sql.NullString, error) {
	if len(list) == 0 {
		return sql.NullString{}, nil
	}
	return encodeJSON(list)
}

func encodeConsentConfig(cfg *api.ConsentConfig) (sql.NullString, error) {
	if cfg == nil {
		return sql.NullString{}, nil
	}
	return encodeJSON(cfg)
}

func encodeChoices(m map[string]bool) (sql.NullString, error) {
	if len(m) == 0 {
		return sql.NullString{}, nil
	}
	return encodeJSON(m)
}

func generateToken(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		log.Printf("sqlite store: generate token: %v", err)
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func convertScale(rec sq.Scale) *api.Scale {
	return &api.Scale{
		ID:                rec.ID,
		TenantID:          rec.TenantID,
		Points:            int(rec.Points),
		Randomize:         int64ToBool(rec.Randomize),
		NameI18n:          decodeStringMap(rec.NameI18n),
		ConsentI18n:       decodeStringMap(rec.ConsentI18n),
		CollectEmail:      rec.CollectEmail.String,
		E2EEEnabled:       int64ToBool(rec.E2eeEnabled),
		Region:            rec.Region.String,
		TurnstileEnabled:  int64ToBool(rec.TurnstileEnabled),
		ItemsPerPage:      int(rec.ItemsPerPage.Int64),
		ConsentConfig:     decodeConsentConfig(rec.ConsentConfig),
		LikertLabelsI18n:  decodeStringSliceMap(rec.LikertLabelsI18n),
		LikertShowNumbers: int64ToBool(rec.LikertShowNumbers),
		LikertPreset:      rec.LikertPreset.String,
	}
}

// --- Collaborators (sqlite) ---
func (s *SQLiteStore) AddScaleCollaborator(scaleID, userID, role string) bool {
	if strings.TrimSpace(scaleID) == "" || strings.TrimSpace(userID) == "" {
		return false
	}
	if strings.TrimSpace(role) == "" {
		role = "editor"
	}
	_, err := s.db.Exec(`INSERT INTO scale_collaborators (scale_id, user_id, role) VALUES (?, ?, ?)
      ON CONFLICT(scale_id, user_id) DO UPDATE SET role = excluded.role`, scaleID, userID, role)
	s.logErr("AddScaleCollaborator", err)
	return err == nil
}

func (s *SQLiteStore) RemoveScaleCollaborator(scaleID, userID string) bool {
	if strings.TrimSpace(scaleID) == "" || strings.TrimSpace(userID) == "" {
		return false
	}
	_, err := s.db.Exec(`DELETE FROM scale_collaborators WHERE scale_id = ? AND user_id = ?`, scaleID, userID)
	s.logErr("RemoveScaleCollaborator", err)
	return err == nil
}

func (s *SQLiteStore) ListScaleCollaborators(scaleID string) []api.ScaleCollaborator {
	rows, err := s.db.Query(`SELECT sc.scale_id, sc.user_id, u.email, sc.role, sc.created_at
      FROM scale_collaborators sc JOIN users u ON u.id = sc.user_id WHERE sc.scale_id = ? ORDER BY u.email ASC`, scaleID)
	if err != nil {
		s.logErr("ListScaleCollaborators: query", err)
		return nil
	}
	defer func() {
		if cerr := rows.Close(); cerr != nil {
			s.logErr("ListScaleCollaborators: rows.Close", cerr)
		}
	}()
	out := []api.ScaleCollaborator{}
	for rows.Next() {
		var c api.ScaleCollaborator
		var created string
		if err := rows.Scan(&c.ScaleID, &c.UserID, &c.Email, &c.Role, &created); err == nil {
			if t, perr := time.Parse(time.RFC3339Nano, created); perr == nil {
				c.CreatedAt = t
			}
			out = append(out, c)
		}
	}
	if err := rows.Err(); err != nil {
		s.logErr("ListScaleCollaborators: rows.Err", err)
	}
	return out
}

// --- Invitations (sqlite) ---
func (s *SQLiteStore) CreateInvite(inv *api.ScaleInvite) (*api.ScaleInvite, error) {
	if inv == nil || strings.TrimSpace(inv.Token) == "" {
		return nil, errors.New("invalid invite")
	}
	_, err := s.db.Exec(`INSERT INTO scale_invites (token, tenant_id, scale_id, email, role, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)`, inv.Token, inv.TenantID, inv.ScaleID, inv.Email, inv.Role, inv.CreatedAt.UTC().Format(time.RFC3339Nano), inv.ExpiresAt.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return nil, err
	}
	return inv, nil
}

func (s *SQLiteStore) GetInvite(token string) *api.ScaleInvite {
	row := s.db.QueryRow(`SELECT token, tenant_id, scale_id, email, role, created_at, expires_at, accepted_at FROM scale_invites WHERE token = ?`, token)
	var inv api.ScaleInvite
	var created, expires, accepted sql.NullString
	if err := row.Scan(&inv.Token, &inv.TenantID, &inv.ScaleID, &inv.Email, &inv.Role, &created, &expires, &accepted); err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			s.logErr("GetInvite", err)
		}
		return nil
	}
	if created.Valid {
		if t, err := time.Parse(time.RFC3339Nano, created.String); err == nil {
			inv.CreatedAt = t
		}
	}
	if expires.Valid {
		if t, err := time.Parse(time.RFC3339Nano, expires.String); err == nil {
			inv.ExpiresAt = t
		}
	}
	if accepted.Valid {
		if t, err := time.Parse(time.RFC3339Nano, accepted.String); err == nil {
			inv.AcceptedAt = t
		}
	}
	return &inv
}

func (s *SQLiteStore) MarkInviteAccepted(token string) bool {
	_, err := s.db.Exec(`UPDATE scale_invites SET accepted_at = CURRENT_TIMESTAMP WHERE token = ?`, token)
	s.logErr("MarkInviteAccepted", err)
	return err == nil
}

func convertItem(rec sq.Item) *api.Item {
	return &api.Item{
		ID:                rec.ID,
		ScaleID:           rec.ScaleID,
		ReverseScored:     int64ToBool(rec.ReverseScored),
		StemI18n:          decodeStringMap(rec.StemI18n),
		Type:              rec.Type.String,
		OptionsI18n:       decodeStringSliceMap(rec.OptionsI18n),
		PlaceholderI18n:   decodeStringMap(rec.PlaceholderI18n),
		Min:               int(rec.MinValue.Int64),
		Max:               int(rec.MaxValue.Int64),
		Step:              int(rec.StepValue.Int64),
		Required:          int64ToBool(rec.Required),
		LikertLabelsI18n:  decodeStringSliceMap(rec.LikertLabelsI18n),
		LikertShowNumbers: int64ToBool(rec.LikertShowNumbers),
		Order:             int(rec.Position),
	}
}

func convertParticipant(rec sq.Participant) *api.Participant {
	return &api.Participant{
		ID:        rec.ID,
		Email:     rec.Email.String,
		SelfToken: rec.SelfToken.String,
		ConsentID: rec.ConsentID.String,
	}
}

func convertResponse(rec sq.Response) *api.Response {
	resp := &api.Response{
		ParticipantID: rec.ParticipantID,
		ItemID:        rec.ItemID,
		SubmittedAt:   rec.SubmittedAt,
		RawJSON:       rec.RawJson.String,
	}
	if rec.RawValue.Valid {
		resp.RawValue = int(rec.RawValue.Int64)
	}
	if rec.ScoreValue.Valid {
		resp.ScoreValue = int(rec.ScoreValue.Int64)
	}
	return resp
}

func convertE2EEResponse(rec sq.E2eeResponse) *api.E2EEResponse {
	return &api.E2EEResponse{
		ScaleID:        rec.ScaleID,
		ResponseID:     rec.ResponseID,
		Ciphertext:     rec.Ciphertext,
		Nonce:          rec.Nonce.String,
		AADHash:        rec.AadHash.String,
		EncDEK:         decodeEncDEK(rec.EncDek),
		PMKFingerprint: rec.PmkFingerprint.String,
		CreatedAt:      rec.CreatedAt,
		SelfToken:      rec.SelfToken.String,
	}
}

func convertProjectKey(rec sq.ProjectKey) *api.ProjectKey {
	return &api.ProjectKey{
		ScaleID:     rec.ScaleID,
		Algorithm:   rec.Algorithm,
		KDF:         rec.Kdf.String,
		PublicKey:   rec.PublicKey,
		Fingerprint: rec.Fingerprint,
		CreatedAt:   rec.CreatedAt,
		Disabled:    int64ToBool(rec.Disabled),
	}
}

func convertConsentRecord(rec sq.ConsentRecord) *api.ConsentRecord {
	return &api.ConsentRecord{
		ID:       rec.ID,
		ScaleID:  rec.ScaleID,
		Version:  rec.Version.String,
		Choices:  decodeChoices(rec.Choices),
		Locale:   rec.Locale.String,
		SignedAt: rec.SignedAt,
		Hash:     rec.Hash.String,
	}
}

// --- Scale methods ---

func (s *SQLiteStore) AddScale(sc *api.Scale) {
	if sc == nil {
		return
	}
	ctx := contextBg()
	name, err := encodeJSON(sc.NameI18n)
	if err != nil {
		s.logErr("AddScale encode name", err)
		return
	}
	consentName, err := encodeJSON(sc.ConsentI18n)
	if err != nil {
		s.logErr("AddScale encode consent", err)
		return
	}
	consentCfg, err := encodeConsentConfig(sc.ConsentConfig)
	if err != nil {
		s.logErr("AddScale encode consent config", err)
		return
	}
	likertLabels, err := encodeJSON(sc.LikertLabelsI18n)
	if err != nil {
		s.logErr("AddScale encode likert", err)
		return
	}
	params := sq.CreateScaleParams{
		ID:                sc.ID,
		TenantID:          sc.TenantID,
		Points:            int64(sc.Points),
		Randomize:         boolToInt64(sc.Randomize),
		NameI18n:          name,
		ConsentI18n:       consentName,
		CollectEmail:      toNullString(sc.CollectEmail),
		E2eeEnabled:       boolToInt64(sc.E2EEEnabled),
		Region:            toNullString(sc.Region),
		TurnstileEnabled:  boolToInt64(sc.TurnstileEnabled),
		ItemsPerPage:      toNullInt(sc.ItemsPerPage),
		ConsentConfig:     consentCfg,
		LikertLabelsI18n:  likertLabels,
		LikertShowNumbers: boolToInt64(sc.LikertShowNumbers),
		LikertPreset:      toNullString(sc.LikertPreset),
		Column16:          time.Now().UTC(),
		Column17:          time.Now().UTC(),
	}
	s.logErr("AddScale insert", s.q.CreateScale(ctx, params))
}

func (s *SQLiteStore) UpdateScale(sc *api.Scale) bool {
	if sc == nil {
		return false
	}
	ctx := contextBg()
	name, err := encodeJSON(sc.NameI18n)
	if err != nil {
		s.logErr("UpdateScale encode name", err)
		return false
	}
	consentName, err := encodeJSON(sc.ConsentI18n)
	if err != nil {
		s.logErr("UpdateScale encode consent", err)
		return false
	}
	consentCfg, err := encodeConsentConfig(sc.ConsentConfig)
	if err != nil {
		s.logErr("UpdateScale encode consent cfg", err)
		return false
	}
	likertLabels, err := encodeJSON(sc.LikertLabelsI18n)
	if err != nil {
		s.logErr("UpdateScale encode likert", err)
		return false
	}
	params := sq.UpdateScaleParams{
		Points:            int64(sc.Points),
		Randomize:         boolToInt64(sc.Randomize),
		NameI18n:          name,
		ConsentI18n:       consentName,
		CollectEmail:      toNullString(sc.CollectEmail),
		E2eeEnabled:       boolToInt64(sc.E2EEEnabled),
		Region:            toNullString(sc.Region),
		TurnstileEnabled:  boolToInt64(sc.TurnstileEnabled),
		ItemsPerPage:      toNullInt(sc.ItemsPerPage),
		ConsentConfig:     consentCfg,
		LikertLabelsI18n:  likertLabels,
		LikertShowNumbers: boolToInt64(sc.LikertShowNumbers),
		LikertPreset:      toNullString(sc.LikertPreset),
		ID:                sc.ID,
	}
	if err := s.q.UpdateScale(ctx, params); err != nil {
		s.logErr("UpdateScale", err)
		return false
	}
	return true
}

func (s *SQLiteStore) DeleteScale(id string) bool {
	if s.GetScale(id) == nil {
		return false
	}
	if err := s.q.DeleteScale(contextBg(), id); err != nil {
		s.logErr("DeleteScale", err)
		return false
	}
	return true
}

func (s *SQLiteStore) GetScale(id string) *api.Scale {
	if strings.TrimSpace(id) == "" {
		return nil
	}
	rec, err := s.q.GetScale(contextBg(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		s.logErr("GetScale", err)
		return nil
	}
	return convertScale(rec)
}

func (s *SQLiteStore) ListScalesByTenant(tid string) []*api.Scale {
	if strings.TrimSpace(tid) == "" {
		return nil
	}
	recs, err := s.q.ListScalesByTenant(contextBg(), tid)
	if err != nil {
		s.logErr("ListScalesByTenant", err)
		return nil
	}
	out := make([]*api.Scale, 0, len(recs))
	for _, rec := range recs {
		out = append(out, convertScale(rec))
	}
	return out
}

// --- Item methods ---

func (s *SQLiteStore) nextItemPosition(ctx context.Context, scaleID string) int64 {
	var pos sql.NullInt64
	row := s.db.QueryRowContext(ctx, "SELECT COALESCE(MAX(position), 0) + 1 FROM items WHERE scale_id = ?", scaleID)
	if err := row.Scan(&pos); err != nil {
		s.logErr("nextItemPosition", err)
		return 1
	}
	if pos.Valid {
		return pos.Int64
	}
	return 1
}

func (s *SQLiteStore) AddItem(it *api.Item) {
	if it == nil {
		return
	}
	ctx := contextBg()
	pos := int64(it.Order)
	if pos <= 0 {
		pos = s.nextItemPosition(ctx, it.ScaleID)
	}
	stem, err := encodeJSON(it.StemI18n)
	if err != nil {
		s.logErr("AddItem encode stem", err)
		return
	}
	options, err := encodeJSON(it.OptionsI18n)
	if err != nil {
		s.logErr("AddItem encode options", err)
		return
	}
	placeholders, err := encodeJSON(it.PlaceholderI18n)
	if err != nil {
		s.logErr("AddItem encode placeholder", err)
		return
	}
	likert, err := encodeJSON(it.LikertLabelsI18n)
	if err != nil {
		s.logErr("AddItem encode likert", err)
		return
	}
	params := sq.CreateItemParams{
		ID:                it.ID,
		ScaleID:           it.ScaleID,
		ReverseScored:     boolToInt64(it.ReverseScored),
		StemI18n:          stem,
		Type:              toNullString(it.Type),
		OptionsI18n:       options,
		PlaceholderI18n:   placeholders,
		MinValue:          toNullInt(it.Min),
		MaxValue:          toNullInt(it.Max),
		StepValue:         toNullInt(it.Step),
		Required:          boolToInt64(it.Required),
		LikertLabelsI18n:  likert,
		LikertShowNumbers: boolToInt64(it.LikertShowNumbers),
		Position:          pos,
		Column15:          time.Now().UTC(),
		Column16:          time.Now().UTC(),
	}
	s.logErr("AddItem insert", s.q.CreateItem(ctx, params))
}

func (s *SQLiteStore) UpdateItem(it *api.Item) bool {
	if it == nil {
		return false
	}
	ctx := contextBg()
	stem, err := encodeJSON(it.StemI18n)
	if err != nil {
		s.logErr("UpdateItem encode stem", err)
		return false
	}
	options, err := encodeJSON(it.OptionsI18n)
	if err != nil {
		s.logErr("UpdateItem encode options", err)
		return false
	}
	placeholders, err := encodeJSON(it.PlaceholderI18n)
	if err != nil {
		s.logErr("UpdateItem encode placeholder", err)
		return false
	}
	likert, err := encodeJSON(it.LikertLabelsI18n)
	if err != nil {
		s.logErr("UpdateItem encode likert", err)
		return false
	}
	params := sq.UpdateItemParams{
		StemI18n:          stem,
		ReverseScored:     boolToInt64(it.ReverseScored),
		Type:              toNullString(it.Type),
		OptionsI18n:       options,
		PlaceholderI18n:   placeholders,
		MinValue:          toNullInt(it.Min),
		MaxValue:          toNullInt(it.Max),
		StepValue:         toNullInt(it.Step),
		Required:          boolToInt64(it.Required),
		LikertLabelsI18n:  likert,
		LikertShowNumbers: boolToInt64(it.LikertShowNumbers),
		Position:          int64(it.Order),
		ID:                it.ID,
	}
	if err := s.q.UpdateItem(ctx, params); err != nil {
		s.logErr("UpdateItem", err)
		return false
	}
	return true
}

func (s *SQLiteStore) DeleteItem(id string) bool {
	if strings.TrimSpace(id) == "" {
		return false
	}
	if _, err := s.db.ExecContext(contextBg(), "DELETE FROM items WHERE id = ?", id); err != nil {
		s.logErr("DeleteItem", err)
		return false
	}
	if _, err := s.db.ExecContext(contextBg(), "DELETE FROM responses WHERE item_id = ?", id); err != nil {
		s.logErr("DeleteItem responses", err)
	}
	return true
}

func (s *SQLiteStore) GetItem(id string) *api.Item {
	if strings.TrimSpace(id) == "" {
		return nil
	}
	rec, err := s.q.GetItem(contextBg(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		s.logErr("GetItem", err)
		return nil
	}
	return convertItem(rec)
}

func (s *SQLiteStore) ListItems(scaleID string) []*api.Item {
	if strings.TrimSpace(scaleID) == "" {
		return nil
	}
	recs, err := s.q.ListItemsByScale(contextBg(), scaleID)
	if err != nil {
		s.logErr("ListItems", err)
		return nil
	}
	out := make([]*api.Item, 0, len(recs))
	for _, rec := range recs {
		out = append(out, convertItem(rec))
	}
	return out
}

func (s *SQLiteStore) ReorderItems(scaleID string, order []string) bool {
	if strings.TrimSpace(scaleID) == "" {
		return false
	}
	ctx := contextBg()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		s.logErr("ReorderItems begin", err)
		return false
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		} else {
			err = tx.Commit()
			if err != nil {
				s.logErr("ReorderItems commit", err)
			}
		}
	}()
	q := s.q.WithTx(tx)
	pos := int64(1)
	seen := map[string]bool{}
	for _, id := range order {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		if err = q.UpdateItemPosition(ctx, sq.UpdateItemPositionParams{Position: pos, ID: id, ScaleID: scaleID}); err != nil {
			s.logErr("ReorderItems update", err)
			return false
		}
		seen[id] = true
		pos++
	}
	rows, err := tx.QueryContext(ctx, "SELECT id FROM items WHERE scale_id = ? ORDER BY position ASC, id ASC", scaleID)
	if err != nil {
		s.logErr("ReorderItems select remainder", err)
		return false
	}
	defer func() {
		if cerr := rows.Close(); cerr != nil {
			s.logErr("ReorderItems rows close", cerr)
			if err == nil {
				err = cerr
			}
		}
	}()
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			s.logErr("ReorderItems scan", err)
			return false
		}
		if seen[id] {
			continue
		}
		if err = q.UpdateItemPosition(ctx, sq.UpdateItemPositionParams{Position: pos, ID: id, ScaleID: scaleID}); err != nil {
			s.logErr("ReorderItems update remainder", err)
			return false
		}
		pos++
	}
	if err = rows.Err(); err != nil {
		s.logErr("ReorderItems rows err", err)
		return false
	}
	err = nil
	return true
}

// --- Participant & response methods ---

func (s *SQLiteStore) AddParticipant(p *api.Participant) {
	if p == nil {
		return
	}
	ctx := contextBg()
	token := strings.TrimSpace(p.SelfToken)
	if token == "" {
		token = generateToken(24)
	}
	p.SelfToken = token
	params := sq.CreateParticipantParams{
		ID:        p.ID,
		Email:     toNullString(p.Email),
		SelfToken: toNullString(token),
		ConsentID: toNullString(p.ConsentID),
		Column5:   time.Now().UTC(),
	}
	s.logErr("AddParticipant", s.q.CreateParticipant(ctx, params))
}

func (s *SQLiteStore) GetParticipant(id string) *api.Participant {
	if strings.TrimSpace(id) == "" {
		return nil
	}
	rec, err := s.q.GetParticipant(contextBg(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		s.logErr("GetParticipant", err)
		return nil
	}
	return convertParticipant(rec)
}

func (s *SQLiteStore) GetParticipantByEmail(email string) *api.Participant {
	if strings.TrimSpace(email) == "" {
		return nil
	}
	rec, err := s.q.GetParticipantByEmail(contextBg(), email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		s.logErr("GetParticipantByEmail", err)
		return nil
	}
	return convertParticipant(rec)
}

func (s *SQLiteStore) DeleteParticipantByID(id string, hard bool) bool {
	p := s.GetParticipant(id)
	if p == nil {
		return false
	}
	ctx := contextBg()
	if hard {
		s.logErr("DeleteResponsesByParticipant", s.q.DeleteResponsesByParticipant(ctx, id))
		s.logErr("DeleteParticipant", s.q.DeleteParticipant(ctx, id))
		return true
	}
	// soft delete: anonymize email
	if err := s.q.UpdateParticipantEmail(ctx, sq.UpdateParticipantEmailParams{Email: toNullString(""), ID: id}); err != nil {
		s.logErr("AnonymizeParticipant", err)
		return false
	}
	return true
}

func (s *SQLiteStore) DeleteParticipantByEmail(email string, hard bool) bool {
	p := s.GetParticipantByEmail(email)
	if p == nil {
		return false
	}
	return s.DeleteParticipantByID(p.ID, hard)
}

func (s *SQLiteStore) ExportParticipantByEmail(email string) ([]*api.Response, *api.Participant) {
	p := s.GetParticipantByEmail(email)
	if p == nil {
		return nil, nil
	}
	rs := s.ListResponsesByParticipant(p.ID)
	return rs, p
}

func (s *SQLiteStore) ListResponsesByParticipant(pid string) []*api.Response {
	if strings.TrimSpace(pid) == "" {
		return nil
	}
	recs, err := s.q.ListResponsesByParticipant(contextBg(), pid)
	if err != nil {
		s.logErr("ListResponsesByParticipant", err)
		return nil
	}
	out := make([]*api.Response, 0, len(recs))
	for _, rec := range recs {
		out = append(out, convertResponse(rec))
	}
	return out
}

func (s *SQLiteStore) AddResponses(rs []*api.Response) {
	ctx := contextBg()
	itemScale := map[string]string{}
	for _, r := range rs {
		if r == nil {
			continue
		}
		scaleID := itemScale[r.ItemID]
		if scaleID == "" {
			row := s.db.QueryRowContext(ctx, "SELECT scale_id FROM items WHERE id = ?", r.ItemID)
			if err := row.Scan(&scaleID); err != nil {
				s.logErr("AddResponses resolve scale", err)
				continue
			}
			itemScale[r.ItemID] = scaleID
		}
		var raw, score sql.NullInt64
		if r.RawJSON != "" {
			raw = sql.NullInt64{Int64: int64(r.RawValue), Valid: true}
			score = sql.NullInt64{Int64: int64(r.ScoreValue), Valid: true}
		}
		params := sq.InsertResponseParams{
			ParticipantID: r.ParticipantID,
			ItemID:        r.ItemID,
			ScaleID:       scaleID,
			RawValue:      raw,
			ScoreValue:    score,
			SubmittedAt:   r.SubmittedAt,
			RawJson:       toNullString(r.RawJSON),
		}
		s.logErr("InsertResponse", s.q.InsertResponse(ctx, params))
	}
}

func (s *SQLiteStore) ListResponsesByScale(scaleID string) []*api.Response {
	if strings.TrimSpace(scaleID) == "" {
		return nil
	}
	recs, err := s.q.ListResponsesByScale(contextBg(), scaleID)
	if err != nil {
		s.logErr("ListResponsesByScale", err)
		return nil
	}
	out := make([]*api.Response, 0, len(recs))
	for _, rec := range recs {
		out = append(out, convertResponse(rec))
	}
	return out
}

func (s *SQLiteStore) DeleteResponsesByScale(scaleID string) int {
	if strings.TrimSpace(scaleID) == "" {
		return 0
	}
	ctx := contextBg()
	res, err := s.db.ExecContext(ctx, "DELETE FROM responses WHERE scale_id = ?", scaleID)
	if err != nil {
		s.logErr("DeleteResponsesByScale", err)
		return 0
	}
	count, _ := res.RowsAffected()
	if _, err := s.db.ExecContext(ctx, "DELETE FROM e2ee_responses WHERE scale_id = ?", scaleID); err != nil {
		s.logErr("DeleteE2EEResponsesByScale", err)
	}
	s.logErr("DeleteConsentRecordsByScale", s.q.DeleteConsentRecordsByScale(ctx, scaleID))
	return int(count)
}

// --- E2EE responses ---

func (s *SQLiteStore) AddE2EEResponse(r *api.E2EEResponse) {
	if r == nil {
		return
	}
	encDek, err := encodeEncDEK(r.EncDEK)
	if err != nil {
		s.logErr("AddE2EEResponse encode", err)
		return
	}
	created := r.CreatedAt
	if created.IsZero() {
		created = time.Now().UTC()
	}
	params := sq.InsertE2EEResponseParams{
		ResponseID:     r.ResponseID,
		ScaleID:        r.ScaleID,
		Ciphertext:     r.Ciphertext,
		Nonce:          toNullString(r.Nonce),
		AadHash:        toNullString(r.AADHash),
		EncDek:         encDek,
		PmkFingerprint: toNullString(r.PMKFingerprint),
		Column8:        created,
		SelfToken:      toNullString(r.SelfToken),
	}
	s.logErr("AddE2EEResponse", s.q.InsertE2EEResponse(contextBg(), params))
}

func (s *SQLiteStore) GetE2EEResponse(responseID string) *api.E2EEResponse {
	if strings.TrimSpace(responseID) == "" {
		return nil
	}
	rec, err := s.q.GetE2EEResponse(contextBg(), responseID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		s.logErr("GetE2EEResponse", err)
		return nil
	}
	return convertE2EEResponse(rec)
}

func (s *SQLiteStore) ListE2EEResponses(scaleID string) []*api.E2EEResponse {
	recs, err := s.q.ListE2EEResponsesByScale(contextBg(), scaleID)
	if err != nil {
		s.logErr("ListE2EEResponses", err)
		return nil
	}
	out := make([]*api.E2EEResponse, 0, len(recs))
	for _, rec := range recs {
		out = append(out, convertE2EEResponse(rec))
	}
	return out
}

func (s *SQLiteStore) ListAllE2EEResponses() []*api.E2EEResponse {
	recs, err := s.q.ListAllE2EEResponses(contextBg())
	if err != nil {
		s.logErr("ListAllE2EEResponses", err)
		return nil
	}
	out := make([]*api.E2EEResponse, 0, len(recs))
	for _, rec := range recs {
		out = append(out, convertE2EEResponse(rec))
	}
	return out
}

func (s *SQLiteStore) AppendE2EEEncDEK(responseID string, encDEK string) bool {
	rec := s.GetE2EEResponse(responseID)
	if rec == nil {
		return false
	}
	rec.EncDEK = append(rec.EncDEK, encDEK)
	encoded, err := encodeEncDEK(rec.EncDEK)
	if err != nil {
		s.logErr("AppendE2EEEncDEK encode", err)
		return false
	}
	if err := s.q.UpdateE2EEEncDEK(contextBg(), sq.UpdateE2EEEncDEKParams{EncDek: encoded, ResponseID: responseID}); err != nil {
		s.logErr("AppendE2EEEncDEK update", err)
		return false
	}
	return true
}

func (s *SQLiteStore) DeleteE2EEResponse(responseID string) bool {
	if err := s.q.DeleteE2EEResponse(contextBg(), responseID); err != nil {
		s.logErr("DeleteE2EEResponse", err)
		return false
	}
	return true
}

// --- Project keys ---

func (s *SQLiteStore) AddProjectKey(k *api.ProjectKey) {
	if k == nil {
		return
	}
	created := k.CreatedAt
	if created.IsZero() {
		created = time.Now().UTC()
	}
	params := sq.InsertProjectKeyParams{
		ScaleID:     k.ScaleID,
		Fingerprint: k.Fingerprint,
		Algorithm:   k.Algorithm,
		Kdf:         toNullString(k.KDF),
		PublicKey:   k.PublicKey,
		Column6:     created,
		Disabled:    boolToInt64(k.Disabled),
	}
	s.logErr("AddProjectKey", s.q.InsertProjectKey(contextBg(), params))
}

func (s *SQLiteStore) ListProjectKeys(scaleID string) []*api.ProjectKey {
	recs, err := s.q.ListProjectKeys(contextBg(), scaleID)
	if err != nil {
		s.logErr("ListProjectKeys", err)
		return nil
	}
	out := make([]*api.ProjectKey, 0, len(recs))
	for _, rec := range recs {
		out = append(out, convertProjectKey(rec))
	}
	return out
}

// --- Consent records ---

func (s *SQLiteStore) AddConsentRecord(cr *api.ConsentRecord) {
	if cr == nil {
		return
	}
	choices, err := encodeChoices(cr.Choices)
	if err != nil {
		s.logErr("AddConsentRecord encode choices", err)
		return
	}
	params := sq.InsertConsentRecordParams{
		ID:       cr.ID,
		ScaleID:  cr.ScaleID,
		Version:  toNullString(cr.Version),
		Choices:  choices,
		Locale:   toNullString(cr.Locale),
		SignedAt: cr.SignedAt,
		Hash:     toNullString(cr.Hash),
	}
	s.logErr("AddConsentRecord", s.q.InsertConsentRecord(contextBg(), params))
}

func (s *SQLiteStore) GetConsentByID(id string) *api.ConsentRecord {
	rec, err := s.q.GetConsentRecord(contextBg(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		s.logErr("GetConsentByID", err)
		return nil
	}
	return convertConsentRecord(rec)
}

// --- Audit log ---

func (s *SQLiteStore) AddAudit(e api.AuditEntry) {
	ts := e.Time
	if ts.IsZero() {
		ts = time.Now().UTC()
	}
	params := sq.InsertAuditParams{
		Column1: ts,
		Actor:   e.Actor,
		Action:  e.Action,
		Target:  toNullString(e.Target),
		Note:    toNullString(e.Note),
	}
	s.logErr("AddAudit", s.q.InsertAudit(contextBg(), params))
}

func (s *SQLiteStore) ListAudit() []api.AuditEntry {
	recs, err := s.q.ListAudit(contextBg(), 500)
	if err != nil {
		s.logErr("ListAudit", err)
		return nil
	}
	out := make([]api.AuditEntry, 0, len(recs))
	for _, rec := range recs {
		out = append(out, api.AuditEntry{
			Time:   rec.Ts,
			Actor:  rec.Actor,
			Action: rec.Action,
			Target: rec.Target.String,
			Note:   rec.Note.String,
		})
	}
	return out
}

// --- Export throttling ---

func (s *SQLiteStore) CreateExportJob(tid, scaleID, ip string, ttl time.Duration) *api.ExportJob {
	s.exportMu.Lock()
	defer s.exportMu.Unlock()
	now := time.Now().UTC()
	for id, job := range s.exportJobs {
		if now.After(job.ExpiresAt) {
			delete(s.exportJobs, id)
		}
	}
	id := generateToken(12)
	token := generateToken(24)
	job := &api.ExportJob{ID: id, TenantID: tid, ScaleID: scaleID, Token: token, RequestIP: ip, CreatedAt: now, ExpiresAt: now.Add(ttl)}
	s.exportJobs[id] = job
	return job
}

func (s *SQLiteStore) GetExportJob(id, token string) *api.ExportJob {
	s.exportMu.Lock()
	defer s.exportMu.Unlock()
	job := s.exportJobs[id]
	if job == nil || job.Token != token || time.Now().UTC().After(job.ExpiresAt) {
		return nil
	}
	return job
}

func (s *SQLiteStore) FindRecentExportJob(tid, scaleID, ip string, within time.Duration) *api.ExportJob {
	s.exportMu.Lock()
	defer s.exportMu.Unlock()
	now := time.Now().UTC()
	for id, job := range s.exportJobs {
		if now.After(job.ExpiresAt) {
			delete(s.exportJobs, id)
			continue
		}
		if job.TenantID != tid || job.ScaleID != scaleID {
			continue
		}
		if ip != "" && job.RequestIP != "" && job.RequestIP != ip {
			continue
		}
		if within > 0 && now.Sub(job.CreatedAt) > within {
			continue
		}
		return job
	}
	return nil
}

func (s *SQLiteStore) AllowExport(tid string, minInterval time.Duration) bool {
	s.exportMu.Lock()
	defer s.exportMu.Unlock()
	last := s.lastExport[tid]
	if !last.IsZero() && time.Since(last) < minInterval {
		return false
	}
	s.lastExport[tid] = time.Now().UTC()
	return true
}

// --- AI config ---

func (s *SQLiteStore) GetAIConfig(tenantID string) *api.TenantAIConfig {
	rec, err := s.q.GetAIConfig(contextBg(), tenantID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		s.logErr("GetAIConfig", err)
		return nil
	}
	return &api.TenantAIConfig{
		TenantID:      rec.TenantID,
		OpenAIKey:     rec.OpenaiKey.String,
		OpenAIBase:    rec.OpenaiBase.String,
		AllowExternal: int64ToBool(rec.AllowExternal),
		StoreLogs:     int64ToBool(rec.StoreLogs),
	}
}

func (s *SQLiteStore) UpsertAIConfig(cfg *api.TenantAIConfig) {
	if cfg == nil {
		return
	}
	params := sq.UpsertAIConfigParams{
		TenantID:      cfg.TenantID,
		OpenaiKey:     toNullString(cfg.OpenAIKey),
		OpenaiBase:    toNullString(cfg.OpenAIBase),
		AllowExternal: boolToInt64(cfg.AllowExternal),
		StoreLogs:     boolToInt64(cfg.StoreLogs),
	}
	s.logErr("UpsertAIConfig", s.q.UpsertAIConfig(contextBg(), params))
}

// --- Tenants & users ---

func (s *SQLiteStore) AddTenant(t *api.Tenant) {
	if t == nil {
		return
	}
	params := sq.CreateTenantParams{ID: t.ID, Name: t.Name, Column3: time.Now().UTC()}
	s.logErr("AddTenant", s.q.CreateTenant(contextBg(), params))
}

func (s *SQLiteStore) DeleteTenant(id string) {
	if strings.TrimSpace(id) == "" {
		return
	}
	// best-effort; rely on FK to cascade/deny depending on schema; here expected to be orphan-only cleanup
	if _, err := s.db.Exec(`DELETE FROM tenants WHERE id = ?`, id); err != nil {
		s.logErr("DeleteTenant", err)
	}
}

func (s *SQLiteStore) AddUser(u *api.User) {
	if u == nil {
		return
	}
	params := sq.CreateUserParams{ID: u.ID, Email: u.Email, PassHash: u.PassHash, TenantID: u.TenantID, Column5: time.Now().UTC()}
	s.logErr("AddUser", s.q.CreateUser(contextBg(), params))
}

func (s *SQLiteStore) FindUserByEmail(email string) *api.User {
	rec, err := s.q.GetUserByEmail(contextBg(), email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		s.logErr("FindUserByEmail", err)
		return nil
	}
	return &api.User{ID: rec.ID, Email: rec.Email, PassHash: rec.PassHash, TenantID: rec.TenantID, CreatedAt: rec.CreatedAt}
}
