package main

import (
	"crypto/rand"
	"encoding/hex"
	"net/url"
	"os"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func openTestDatabase(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = localDatabaseURL
	}
	base, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	baseSQL, err := base.DB()
	if err != nil {
		t.Fatal(err)
	}
	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		t.Fatal(err)
	}
	schema := "test_" + hex.EncodeToString(suffix[:])
	if err := base.Exec(`CREATE SCHEMA "` + schema + `"`).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := base.Exec(`DROP SCHEMA "` + schema + `" CASCADE`).Error; err != nil {
			t.Errorf("drop test schema: %v", err)
		}
		_ = baseSQL.Close()
	})

	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := openDatabase(parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	return db
}

func TestMigrateAndSeedIsRepeatable(t *testing.T) {
	t.Setenv("SEED_ADMIN_LOGIN", "admin")
	t.Setenv("SEED_ADMIN_PASSWORD", "test-password")
	t.Setenv("SEED_ADMIN_NAME", "مدیر آزمایشی")

	db := openTestDatabase(t)

	models := []any{
		&Admin{}, &Session{}, &Shop{}, &Product{}, &Order{}, &OrderItem{}, &OrderStatusHistory{}, &PilotEvent{},
	}
	for _, model := range models {
		if !db.Migrator().HasTable(model) {
			t.Fatalf("table for %T was not created", model)
		}
	}
	if !db.Migrator().HasTable("goose_db_version") {
		t.Fatal("goose version table was not created")
	}
	if db.Migrator().HasColumn(&Order{}, "receipt_uploaded_at") {
		t.Fatal("orders contains obsolete receipt_uploaded_at column")
	}

	if err := db.Create(&Session{TokenHash: "invalid-admin", AdminID: 999999, ExpiresAt: time.Now().Add(time.Hour)}).Error; err == nil {
		t.Fatal("sessions admin foreign key was not enforced")
	}

	if err := seed(db); err != nil {
		t.Fatal(err)
	}
	if err := seed(db); err != nil {
		t.Fatal(err)
	}

	for name, check := range map[string]struct {
		model any
		want  int64
	}{
		"admins":   {&Admin{}, 1},
		"shops":    {&Shop{}, 0},
		"products": {&Product{}, 0},
	} {
		var count int64
		if err := db.Model(check.model).Count(&count).Error; err != nil {
			t.Fatal(err)
		}
		if count != check.want {
			t.Errorf("%s count = %d, want %d", name, count, check.want)
		}
	}
}
