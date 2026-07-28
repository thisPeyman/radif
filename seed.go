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

	return db.Transaction(func(tx *gorm.DB) error {
		var admin Admin
		if err := tx.Where(Admin{Login: login}).Assign(map[string]any{
			"name":          name,
			"password_hash": string(passwordHash),
			"active":        true,
		}).FirstOrCreate(&admin).Error; err != nil {
			return fmt.Errorf("seed admin: %w", err)
		}

		type seedProduct struct {
			name        string
			description string
			image       string
			price       int64
		}
		type seedShop struct {
			name        string
			description string
			cardNumber  string
			payment     string
			logo        string
			products    []seedProduct
		}
		shops := []seedShop{
			{
				name:        "خانه آبی",
				description: "محصولات دست‌ساز برای خانه",
				cardNumber:  "6037991812345678",
				payment:     "به نام فروشگاه خانه آبی",
				logo:        "/images/shop-blue.svg",
				products: []seedProduct{
					{"شمع موج", "شمع دست‌ساز معطر", "/images/product-blue.svg", 420_000},
					{"گلدان صدف", "گلدان سرامیکی کوچک", "/images/product-saffron.svg", 680_000},
				},
			},
			{
				name:        "نخ و نقش",
				description: "پوشیدنی‌های ساده و رنگی",
				cardNumber:  "5892101123456789",
				payment:     "به نام فروشگاه نخ و نقش",
				logo:        "/images/shop-saffron.svg",
				products: []seedProduct{
					{"شال ماه", "شال نخی سبک", "/images/product-saffron.svg", 550_000},
					{"کیف روز", "کیف پارچه‌ای روزمره", "/images/product-blue.svg", 790_000},
				},
			},
		}

		for _, seededShop := range shops {
			var shop Shop
			if err := tx.Where(Shop{OwnerAdminID: admin.ID, Name: seededShop.name}).Assign(map[string]any{
				"logo_path":            seededShop.logo,
				"short_description":    seededShop.description,
				"payment_card_number":  seededShop.cardNumber,
				"payment_instructions": seededShop.payment,
				"active":               true,
			}).FirstOrCreate(&shop).Error; err != nil {
				return fmt.Errorf("seed shop %q: %w", seededShop.name, err)
			}

			for _, seededProduct := range seededShop.products {
				var product Product
				if err := tx.Where(Product{ShopID: shop.ID, Name: seededProduct.name}).Assign(map[string]any{
					"main_image_path":   seededProduct.image,
					"default_price":     seededProduct.price,
					"short_description": seededProduct.description,
					"active":            true,
				}).FirstOrCreate(&product).Error; err != nil {
					return fmt.Errorf("seed product %q: %w", seededProduct.name, err)
				}
			}
		}

		return nil
	})
}
