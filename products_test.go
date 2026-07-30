package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

func productRequest(e *echo.Echo, method, path string, fields map[string]string, image []byte, origin string, cookie *http.Cookie) *httptest.ResponseRecorder {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for name, value := range fields {
		_ = writer.WriteField(name, value)
	}
	if image != nil {
		file, _ := writer.CreateFormFile("image", "product.png")
		_, _ = file.Write(image)
	}
	_ = writer.Close()
	req := httptest.NewRequest(method, path, &body)
	req.RemoteAddr = "192.0.2.10:1234"
	req.Header.Set(echo.HeaderContentType, writer.FormDataContentType())
	if origin != "" {
		req.Header.Set(echo.HeaderOrigin, origin)
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	recorder := httptest.NewRecorder()
	e.ServeHTTP(recorder, req)
	return recorder
}

func validProductFields(name string) map[string]string {
	return map[string]string{"name": name, "defaultPrice": "725000", "shortDescription": "توضیح کوتاه"}
}

func validProductPNG(t *testing.T) []byte {
	t.Helper()
	content, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	return content
}

func TestProductManagementLifecycle(t *testing.T) {
	db, e, cfg, _ := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var shop Shop
	if err := db.First(&shop).Error; err != nil {
		t.Fatal(err)
	}
	png := validProductPNG(t)
	path := fmt.Sprintf("/api/shops/%d/products", shop.ID)

	created := productRequest(e, http.MethodPost, path, validProductFields(" محصول تازه "), png, testOrigin, cookie)
	if created.Code != http.StatusCreated {
		t.Fatalf("create returned %d: %s", created.Code, created.Body.String())
	}
	var product productResponse
	if err := json.Unmarshal(created.Body.Bytes(), &product); err != nil {
		t.Fatal(err)
	}
	if product.Name != "محصول تازه" || !product.Active || product.DefaultPrice != 725000 || !strings.HasPrefix(product.ImagePath, productImageURLPrefix) {
		t.Fatalf("unexpected product: %#v", product)
	}
	storedName := strings.TrimPrefix(product.ImagePath, productImageURLPrefix)
	if _, err := os.Stat(filepath.Join(cfg.productImageDir, storedName)); err != nil {
		t.Fatalf("product image missing: %v", err)
	}
	image := request(e, http.MethodGet, product.ImagePath, "", "", nil)
	if image.Code != http.StatusOK || image.Header().Get("Cache-Control") != "public, max-age=31536000, immutable" || !bytes.Equal(image.Body.Bytes(), png) {
		t.Fatalf("image returned %d with cache %q", image.Code, image.Header().Get("Cache-Control"))
	}

	updated := productRequest(e, http.MethodPatch, fmt.Sprintf("%s/%d", path, product.ID), validProductFields("محصول ویرایش‌شده"), nil, testOrigin, cookie)
	if updated.Code != http.StatusOK || !strings.Contains(updated.Body.String(), "محصول ویرایش‌شده") || !strings.Contains(updated.Body.String(), product.ImagePath) {
		t.Fatalf("text update returned %d: %s", updated.Code, updated.Body.String())
	}
	replacement := validProductPNG(t)
	updated = productRequest(e, http.MethodPatch, fmt.Sprintf("%s/%d", path, product.ID), validProductFields("محصول ویرایش‌شده"), replacement, testOrigin, cookie)
	if updated.Code != http.StatusOK {
		t.Fatalf("image update returned %d: %s", updated.Code, updated.Body.String())
	}
	if _, err := os.Stat(filepath.Join(cfg.productImageDir, storedName)); !os.IsNotExist(err) {
		t.Fatalf("old image was not removed: %v", err)
	}

	archived := request(e, http.MethodDelete, fmt.Sprintf("%s/%d", path, product.ID), "", testOrigin, cookie)
	if archived.Code != http.StatusNoContent {
		t.Fatalf("archive returned %d: %s", archived.Code, archived.Body.String())
	}
	active := request(e, http.MethodGet, path, "", "", cookie)
	if strings.Contains(active.Body.String(), "محصول ویرایش‌شده") {
		t.Fatalf("archived product returned in active list: %s", active.Body.String())
	}
	managed := request(e, http.MethodGet, path+"?includeInactive=true", "", "", cookie)
	if !strings.Contains(managed.Body.String(), `"active":false`) || !strings.Contains(managed.Body.String(), "محصول ویرایش‌شده") {
		t.Fatalf("archived product missing from management list: %s", managed.Body.String())
	}
	restored := request(e, http.MethodPost, fmt.Sprintf("%s/%d/activate", path, product.ID), "", testOrigin, cookie)
	if restored.Code != http.StatusOK || !strings.Contains(restored.Body.String(), `"active":true`) {
		t.Fatalf("activate returned %d: %s", restored.Code, restored.Body.String())
	}
}

func TestProductManagementValidationAndOwnership(t *testing.T) {
	db, e, cfg, _ := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var shop Shop
	if err := db.First(&shop).Error; err != nil {
		t.Fatal(err)
	}
	png := validProductPNG(t)
	path := fmt.Sprintf("/api/shops/%d/products", shop.ID)
	if response := productRequest(e, http.MethodPost, path, validProductFields("بدون مبدأ"), png, "", cookie); response.Code != http.StatusForbidden {
		t.Fatalf("missing origin returned %d", response.Code)
	}
	if response := productRequest(e, http.MethodPost, path, validProductFields("بدون تصویر"), nil, testOrigin, cookie); response.Code != http.StatusBadRequest {
		t.Fatalf("missing image returned %d", response.Code)
	}
	if response := productRequest(e, http.MethodPost, path, validProductFields("تصویر خالی"), []byte{}, testOrigin, cookie); response.Code != http.StatusBadRequest {
		t.Fatalf("empty image returned %d", response.Code)
	}
	invalid := validProductFields("قیمت نامعتبر")
	invalid["defaultPrice"] = "0"
	if response := productRequest(e, http.MethodPost, path, invalid, png, testOrigin, cookie); response.Code != http.StatusBadRequest {
		t.Fatalf("invalid price returned %d", response.Code)
	}
	if response := productRequest(e, http.MethodPost, path, validProductFields("شمع موج"), png, testOrigin, cookie); response.Code != http.StatusConflict {
		t.Fatalf("duplicate name returned %d: %s", response.Code, response.Body.String())
	}
	entries, err := os.ReadDir(cfg.productImageDir)
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("failed creates left %d images", len(entries))
	}

	other := Admin{Name: "مدیر دیگر", Login: "other-product-owner", PasswordHash: "unused", Active: true}
	if err := db.Create(&other).Error; err != nil {
		t.Fatal(err)
	}
	otherShop := Shop{OwnerAdminID: other.ID, Name: "فروشگاه دیگر", PaymentCardNumber: "1", PaymentInstructions: "test", Active: true}
	if err := db.Create(&otherShop).Error; err != nil {
		t.Fatal(err)
	}
	if response := productRequest(e, http.MethodPost, fmt.Sprintf("/api/shops/%d/products", otherShop.ID), validProductFields("محصول بیگانه"), png, testOrigin, cookie); response.Code != http.StatusNotFound {
		t.Fatalf("cross-owner create returned %d", response.Code)
	}
	otherProduct := Product{ShopID: otherShop.ID, Name: "محصول مدیر دیگر", MainImagePath: "/images/other.svg", DefaultPrice: 10, Active: true}
	if err := db.Create(&otherProduct).Error; err != nil {
		t.Fatal(err)
	}
	var ownProduct Product
	if err := db.Where("shop_id = ?", shop.ID).First(&ownProduct).Error; err != nil {
		t.Fatal(err)
	}
	if response := productRequest(e, http.MethodPatch, fmt.Sprintf("/api/shops/%d/products/%d", otherShop.ID, ownProduct.ID), validProductFields("جابجایی مسیر"), nil, testOrigin, cookie); response.Code != http.StatusNotFound {
		t.Fatalf("route mismatch returned %d", response.Code)
	}
	foreignPath := fmt.Sprintf("/api/shops/%d/products/%d", shop.ID, otherProduct.ID)
	if response := productRequest(e, http.MethodPatch, foreignPath, validProductFields("ویرایش بیگانه"), nil, testOrigin, cookie); response.Code != http.StatusNotFound {
		t.Fatalf("foreign product update returned %d", response.Code)
	}
	if response := request(e, http.MethodDelete, foreignPath, "", testOrigin, cookie); response.Code != http.StatusNotFound {
		t.Fatalf("foreign product archive returned %d", response.Code)
	}
	if response := request(e, http.MethodPost, foreignPath+"/activate", "", testOrigin, cookie); response.Code != http.StatusNotFound {
		t.Fatalf("foreign product activation returned %d", response.Code)
	}
}
