package main

import (
	"path/filepath"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestMigrateAndSeedIsRepeatable(t *testing.T) {
	t.Setenv("SEED_ADMIN_LOGIN", "admin")
	t.Setenv("SEED_ADMIN_PASSWORD", "test-password")
	t.Setenv("SEED_ADMIN_NAME", "مدیر آزمایشی")

	db, err := openDatabase(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	models := []any{
		&Admin{}, &Session{}, &Shop{}, &Product{}, &Order{}, &OrderItem{}, &OrderStatusHistory{}, &PilotEvent{},
	}
	for _, model := range models {
		if !db.Migrator().HasTable(model) {
			t.Fatalf("table for %T was not created", model)
		}
	}

	var foreignKeys int
	if err := db.Raw("PRAGMA foreign_keys").Scan(&foreignKeys).Error; err != nil || foreignKeys != 1 {
		t.Fatalf("foreign_keys = %d, error = %v", foreignKeys, err)
	}
	var journalMode string
	if err := db.Raw("PRAGMA journal_mode").Scan(&journalMode).Error; err != nil || journalMode != "wal" {
		t.Fatalf("journal_mode = %q, error = %v", journalMode, err)
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
		"shops":    {&Shop{}, 2},
		"products": {&Product{}, 4},
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

func TestMigrationRemovesSingleProductColumn(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	legacy, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := legacy.Exec("CREATE TABLE orders (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, CONSTRAINT fk_orders_product FOREIGN KEY (product_id) REFERENCES products(id))").Error; err != nil {
		t.Fatal(err)
	}
	if err := legacy.Exec("CREATE INDEX idx_orders_product_id ON orders(product_id)").Error; err != nil {
		t.Fatal(err)
	}

	db, err := openDatabase(path)
	if err != nil {
		t.Fatal(err)
	}
	if db.Migrator().HasColumn("orders", "product_id") {
		t.Fatal("single-product column was not removed")
	}
	if !db.Migrator().HasTable(&OrderItem{}) {
		t.Fatal("order_items table was not created")
	}
}
