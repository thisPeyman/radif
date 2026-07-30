package main

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func seed(db *gorm.DB) error {
	login := strings.TrimSpace(os.Getenv("SEED_ADMIN_LOGIN"))
	password := os.Getenv("SEED_ADMIN_PASSWORD")
	name := strings.TrimSpace(os.Getenv("SEED_ADMIN_NAME"))
	if login == "" || password == "" {
		return errors.New("SEED_ADMIN_LOGIN and SEED_ADMIN_PASSWORD are required")
	}
	if name == "" {
		name = "مدیر فروشگاه"
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash seed password: %w", err)
	}

	var admin Admin
	if err := db.Where(Admin{Login: login}).Assign(map[string]any{
		"name":          name,
		"password_hash": string(passwordHash),
		"active":        true,
	}).FirstOrCreate(&admin).Error; err != nil {
		return fmt.Errorf("seed admin: %w", err)
	}
	return nil
}
