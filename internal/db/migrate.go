package db

import (
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

//go:embed migrations/*.sql
var embeddedMigrations embed.FS

type migrationFile struct {
	name string
	data []byte
}

// RunMigrations executes migrations from the given directory, falling back to embedded files.
func RunMigrations(db *sql.DB, migrationsDir string) error {
	files, err := loadMigrations(migrationsDir)
	if err != nil {
		return err
	}
	for _, mf := range files {
		if len(mf.data) == 0 {
			continue
		}
		if _, err := db.Exec(string(mf.data)); err != nil {
			return fmt.Errorf("exec migration %s: %w", mf.name, err)
		}
	}
	return nil
}

func loadMigrations(dir string) ([]migrationFile, error) {
	var files []migrationFile
	if dir != "" {
		entries, err := os.ReadDir(dir)
		if err == nil {
			for _, entry := range entries {
				if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
					continue
				}
				path := filepath.Join(dir, entry.Name())
				content, err := os.ReadFile(path)
				if err != nil {
					return nil, fmt.Errorf("read migration %s: %w", entry.Name(), err)
				}
				files = append(files, migrationFile{name: entry.Name(), data: content})
			}
			sort.Slice(files, func(i, j int) bool { return files[i].name < files[j].name })
			return files, nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("read migrations: %w", err)
		}
	}

	entries, err := embeddedMigrations.ReadDir("migrations")
	if err != nil {
		return nil, fmt.Errorf("read embedded migrations: %w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}
		content, err := embeddedMigrations.ReadFile(filepath.Join("migrations", entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("read embedded migration %s: %w", entry.Name(), err)
		}
		files = append(files, migrationFile{name: entry.Name(), data: content})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].name < files[j].name })
	return files, nil
}
