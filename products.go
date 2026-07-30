package main

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	maxProductImageBytes  = 5 << 20
	maxSafeInteger        = int64(9_007_199_254_740_991)
	productImageURLPrefix = "/api/product-images/"
)

type productResponse struct {
	ID               uint   `json:"id"`
	Name             string `json:"name"`
	ImagePath        string `json:"imagePath"`
	DefaultPrice     int64  `json:"defaultPrice"`
	ShortDescription string `json:"shortDescription,omitempty"`
	Active           bool   `json:"active"`
}

func respondProduct(c echo.Context, status int, product Product) error {
	return c.JSON(status, productResponse{product.ID, product.Name, product.MainImagePath, product.DefaultPrice, product.ShortDescription, product.Active})
}

func products(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		shop := c.Get(shopContextKey).(*Shop)
		query := db.Where("shop_id = ?", shop.ID)
		if c.QueryParam("includeInactive") != "true" {
			query = query.Where("active = ?", true)
		}
		var rows []Product
		if err := query.Order("active DESC, id DESC").Find(&rows).Error; err != nil {
			return err
		}
		response := make([]productResponse, len(rows))
		for i, product := range rows {
			response[i] = productResponse{product.ID, product.Name, product.MainImagePath, product.DefaultPrice, product.ShortDescription, product.Active}
		}
		return c.JSON(http.StatusOK, map[string]any{"products": response})
	}
}

type productInput struct {
	name             string
	defaultPrice     int64
	shortDescription string
	image            *pendingImage
}

func parseProductInput(c echo.Context, cfg config, imageRequired bool) (productInput, error) {
	c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, maxProductImageBytes+(1<<20))
	if err := c.Request().ParseMultipartForm(1 << 20); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			return productInput{}, echoImageTooLarge("product")
		}
		return productInput{}, echo.NewHTTPError(http.StatusBadRequest, "اطلاعات محصول معتبر نیست.")
	}
	defer c.Request().MultipartForm.RemoveAll()
	for key := range c.Request().MultipartForm.Value {
		if key != "name" && key != "defaultPrice" && key != "shortDescription" {
			return productInput{}, echo.NewHTTPError(http.StatusBadRequest, "اطلاعات محصول معتبر نیست.")
		}
	}
	for key := range c.Request().MultipartForm.File {
		if key != "image" {
			return productInput{}, echo.NewHTTPError(http.StatusBadRequest, "اطلاعات محصول معتبر نیست.")
		}
	}
	name := strings.TrimSpace(c.FormValue("name"))
	description := strings.TrimSpace(c.FormValue("shortDescription"))
	price, err := strconv.ParseInt(strings.TrimSpace(c.FormValue("defaultPrice")), 10, 64)
	if name == "" || utf8.RuneCountInString(name) > 150 {
		return productInput{}, echo.NewHTTPError(http.StatusBadRequest, "نام محصول باید بین ۱ تا ۱۵۰ نویسه باشد.")
	}
	if utf8.RuneCountInString(description) > 1000 {
		return productInput{}, echo.NewHTTPError(http.StatusBadRequest, "توضیح محصول بیش از حد طولانی است.")
	}
	if err != nil || price <= 0 || price > maxSafeInteger {
		return productInput{}, echo.NewHTTPError(http.StatusBadRequest, "قیمت محصول باید یک عدد صحیح بزرگ‌تر از صفر باشد.")
	}
	files := c.Request().MultipartForm.File["image"]
	if len(files) > 1 || (imageRequired && len(files) != 1) {
		return productInput{}, echo.NewHTTPError(http.StatusBadRequest, "یک تصویر برای محصول انتخاب کنید.")
	}
	input := productInput{name: name, defaultPrice: price, shortDescription: description}
	if len(files) == 1 {
		dir := cfg.productImageDir
		if dir == "" {
			dir = filepath.Join(dataDir(), "product-images")
		}
		input.image, err = prepareImage(dir, maxProductImageBytes, files[0], "product")
	}
	return input, err
}

func productWriteError(err error) error {
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) && postgresError.Code == "23505" && postgresError.ConstraintName == "idx_products_shop_name" {
		return echo.NewHTTPError(http.StatusConflict, "محصولی با این نام برای فروشگاه وجود دارد.")
	}
	return err
}

func createProduct(db *gorm.DB, cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		input, err := parseProductInput(c, cfg, true)
		if err != nil {
			return err
		}
		defer func() { input.image.discard() }()
		shop := c.Get(shopContextKey).(*Shop)
		product := Product{ShopID: shop.ID, Name: input.name, MainImagePath: productImageURLPrefix + input.image.storedName, DefaultPrice: input.defaultPrice, ShortDescription: input.shortDescription, Active: true}
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := input.image.commit(); err != nil {
				return err
			}
			return tx.Create(&product).Error
		})
		if err != nil {
			return productWriteError(err)
		}
		input.image = nil
		return respondProduct(c, http.StatusCreated, product)
	}
}

func ownedProduct(db *gorm.DB, shopID uint, value string) (Product, error) {
	productID, err := strconv.ParseUint(value, 10, 64)
	if err != nil || productID == 0 {
		return Product{}, echo.NewHTTPError(http.StatusNotFound, "محصول پیدا نشد.")
	}
	var product Product
	err = db.Where("id = ? AND shop_id = ?", productID, shopID).First(&product).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Product{}, echo.NewHTTPError(http.StatusNotFound, "محصول پیدا نشد.")
	}
	return product, err
}

func updateProduct(db *gorm.DB, cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		shop := c.Get(shopContextKey).(*Shop)
		product, err := ownedProduct(db, shop.ID, c.Param("productID"))
		if err != nil {
			return err
		}
		input, err := parseProductInput(c, cfg, false)
		if err != nil {
			return err
		}
		defer func() { input.image.discard() }()
		oldImagePath := ""
		updates := map[string]any{"name": input.name, "default_price": input.defaultPrice, "short_description": input.shortDescription}
		if input.image != nil {
			updates["main_image_path"] = productImageURLPrefix + input.image.storedName
		}
		err = db.Transaction(func(tx *gorm.DB) error {
			var locked Product
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND shop_id = ?", product.ID, shop.ID).First(&locked).Error; err != nil {
				return err
			}
			oldImagePath = locked.MainImagePath
			if input.image != nil {
				if err := input.image.commit(); err != nil {
					return err
				}
			}
			return tx.Model(&Product{}).Where("id = ? AND shop_id = ?", product.ID, shop.ID).Updates(updates).Error
		})
		if err != nil {
			return productWriteError(err)
		}
		if input.image != nil {
			product.MainImagePath = updates["main_image_path"].(string)
			input.image = nil
			removeProductImage(cfg, oldImagePath)
		}
		product.Name, product.DefaultPrice, product.ShortDescription = input.name, input.defaultPrice, input.shortDescription
		return respondProduct(c, http.StatusOK, product)
	}
}

func setProductActive(db *gorm.DB, active bool) echo.HandlerFunc {
	return func(c echo.Context) error {
		shop := c.Get(shopContextKey).(*Shop)
		product, err := ownedProduct(db, shop.ID, c.Param("productID"))
		if err != nil {
			return err
		}
		if err := db.Model(&product).Update("active", active).Error; err != nil {
			return err
		}
		product.Active = active
		if active {
			return respondProduct(c, http.StatusOK, product)
		}
		return c.NoContent(http.StatusNoContent)
	}
}

func archiveProduct(db *gorm.DB) echo.HandlerFunc  { return setProductActive(db, false) }
func activateProduct(db *gorm.DB) echo.HandlerFunc { return setProductActive(db, true) }

func productImageDir(cfg config) string {
	if cfg.productImageDir != "" {
		return cfg.productImageDir
	}
	return filepath.Join(dataDir(), "product-images")
}

func removeProductImage(cfg config, imagePath string) {
	if !strings.HasPrefix(imagePath, productImageURLPrefix) {
		return
	}
	name := strings.TrimPrefix(imagePath, productImageURLPrefix)
	if name == filepath.Base(name) {
		_ = os.Remove(filepath.Join(productImageDir(cfg), name))
	}
}

func getProductImage(cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		name := c.Param("file")
		extension := strings.ToLower(filepath.Ext(name))
		if name == "" || name != filepath.Base(name) || (extension != ".jpg" && extension != ".png" && extension != ".webp") {
			return echo.NewHTTPError(http.StatusNotFound, "تصویر پیدا نشد.")
		}
		file, err := os.Open(filepath.Join(productImageDir(cfg), name))
		if errors.Is(err, os.ErrNotExist) {
			return echo.NewHTTPError(http.StatusNotFound, "تصویر پیدا نشد.")
		}
		if err != nil {
			return err
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil {
			return err
		}
		c.Response().Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		http.ServeContent(c.Response(), c.Request(), name, info.ModTime(), file)
		return nil
	}
}
