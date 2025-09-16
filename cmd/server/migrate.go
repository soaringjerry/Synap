package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"

	"github.com/soaringjerry/Synap/internal/api"
	dbstore "github.com/soaringjerry/Synap/internal/db"
)

func MigrateIfNeeded(snapshotPath, sqlitePath, migrationsDir string) error {
	if sqlitePath == "" {
		return errors.New("sqlite path is required")
	}
	if _, err := os.Stat(sqlitePath); err == nil {
		return nil // already migrated
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("check sqlite file: %w", err)
	}

	legacyPath := snapshotPath
	if legacyPath == "" {
		legacyPath = os.Getenv("SYNAP_DB_PATH")
	}
	legacyStore, err := api.NewMemoryStoreFromPath(legacyPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("load legacy snapshot: %w", err)
	}
	if legacyStore == nil {
		return nil
	}

	snapshot := api.MemoryStoreSnapshot(legacyStore)
	if snapshot == nil {
		return nil
	}

	log.Printf("First run detected, starting one-time data migration from legacy snapshot %s...", legacyPath)

	if err := os.MkdirAll(filepath.Dir(sqlitePath), 0o755); err != nil {
		return fmt.Errorf("create sqlite dir: %w", err)
	}

	dsn := fmt.Sprintf("file:%s?cache=shared&_busy_timeout=5000", filepath.ToSlash(sqlitePath))
	sqliteDB, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return fmt.Errorf("open sqlite: %w", err)
	}
	defer func() {
		if cerr := sqliteDB.Close(); cerr != nil {
			log.Printf("warning: failed to close sqlite db: %v", cerr)
		}
	}()

	if err := dbstore.RunMigrations(sqliteDB, migrationsDir); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}

	dst, err := dbstore.NewSQLiteStore(sqliteDB)
	if err != nil {
		return fmt.Errorf("init sqlite store: %w", err)
	}

	if err := copySnapshotToStore(snapshot, dst); err != nil {
		return fmt.Errorf("copy data: %w", err)
	}

	log.Printf("Data migration completed successfully.")
	return nil
}

func copySnapshotToStore(snap *api.LegacySnapshot, dst api.Store) error {
	for _, t := range snap.Tenants {
		if t != nil {
			dst.AddTenant(t)
		}
	}
	for _, u := range snap.Users {
		if u != nil {
			dst.AddUser(u)
		}
	}
	for _, cfg := range snap.AIConfigs {
		if cfg != nil {
			dst.UpsertAIConfig(cfg)
		}
	}
	for _, sc := range snap.Scales {
		if sc != nil {
			dst.AddScale(sc)
		}
	}
	for _, it := range snap.Items {
		if it != nil {
			dst.AddItem(it)
		}
	}
	for _, cons := range snap.Consents {
		if cons != nil {
			dst.AddConsentRecord(cons)
		}
	}
	for _, keys := range snap.ProjectKeys {
		for _, key := range keys {
			if key != nil {
				dst.AddProjectKey(key)
			}
		}
	}
	for _, p := range snap.Participants {
		if p != nil {
			dst.AddParticipant(p)
		}
	}
	if len(snap.Responses) > 0 {
		dst.AddResponses(snap.Responses)
	}
	for _, e := range snap.ResponsesE2EE {
		if e != nil {
			dst.AddE2EEResponse(e)
		}
	}
	for _, entry := range snap.Audit {
		dst.AddAudit(entry)
	}
	return nil
}
