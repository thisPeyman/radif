package main

import (
	"fmt"
	"os"
	"path/filepath"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func databasePath() string {
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "data"
	}
	return filepath.Join(dataDir, "app.db")
}

func openDatabase(path string) (*gorm.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}

	dsn := path + "?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := db.AutoMigrate(
		&Admin{},
		&Session{},
		&Shop{},
		&Product{},
		&Order{},
		&OrderStatusHistory{},
		&PilotEvent{},
	); err != nil {
		return nil, fmt.Errorf("migrate database: %w", err)
	}

	return db, nil
}
