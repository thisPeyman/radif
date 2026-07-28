package main

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

func TestNormalizeIranianMobile(t *testing.T) {
	for input, want := range map[string]string{
		"۰۹۱۲ ۳۴۵ ۶۷۸۹":     "09123456789",
		"٠٩١٢٣٤٥٦٧٨٩":       "09123456789",
		"+98 912 345 6789":  "09123456789",
		"0098-912-345-6789": "09123456789",
		"98 912 345 6789":   "09123456789",
	} {
		if got := normalizeIranianMobile(input); got != want {
			t.Errorf("normalizeIranianMobile(%q) = %q, want %q", input, got, want)
		}
	}
}

func createCustomerTestOrder(t *testing.T, db *gorm.DB, token string) Order {
	t.Helper()
	var product Product
	if err := db.Preload("Shop").First(&product).Error; err != nil {
		t.Fatal(err)
	}
	order := Order{
		CreateKey: "customer-" + token, CreateFingerprint: "test", SecretToken: token,
		ShopID: product.ShopID, Amount: product.DefaultPrice,
		EstimatedDeliveryDate: time.Now().AddDate(0, 0, 7).Format("2006-01-02"), Status: waitingInfoStatus,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&OrderItem{OrderID: order.ID, ProductID: product.ID, Quantity: 1, UnitPrice: product.DefaultPrice}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&OrderStatusHistory{OrderID: order.ID, NewStatus: waitingInfoStatus}).Error; err != nil {
		t.Fatal(err)
	}
	return order
}

func multipartRequest(e *echo.Echo, method, path string, fields map[string]string, filename string, content []byte) *httptest.ResponseRecorder {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for name, value := range fields {
		_ = writer.WriteField(name, value)
	}
	if filename != "" {
		file, _ := writer.CreateFormFile("receipt", filename)
		_, _ = file.Write(content)
	}
	_ = writer.Close()
	req := httptest.NewRequest(method, path, &body)
	req.Header.Set(echo.HeaderContentType, writer.FormDataContentType())
	req.Header.Set(echo.HeaderOrigin, testOrigin)
	recorder := httptest.NewRecorder()
	e.ServeHTTP(recorder, req)
	return recorder
}

func validCustomerFields() map[string]string {
	return map[string]string{
		"fullName": " سارا احمدی ", "mobile": "+۹۸ ۹۱۲ ۳۴۵ ۶۷۸۹",
		"address": " تهران، خیابان آزمایش ", "postalCode": "۱۲۳۴۵۶۷۸۹۰", "note": " زنگ خراب است ",
	}
}

func TestSubmitCustomerDetailsWithReceipt(t *testing.T) {
	db, e, cfg, _ := newAuthTestServer(t)
	order := createCustomerTestOrder(t, db, "customer-details-token")
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)
	response := multipartRequest(e, http.MethodPost, "/api/o/"+order.SecretToken+"/details", validCustomerFields(), "claimed.jpg", png)
	if response.Code != http.StatusOK {
		t.Fatalf("submission returned %d: %s", response.Code, response.Body.String())
	}
	if body := response.Body.String(); !strings.Contains(body, `"customerSubmitted":true`) || !strings.Contains(body, `"receiptUploaded":true`) || !strings.Contains(body, `"mobile":"0912•••6789"`) || strings.Contains(body, "تهران، خیابان آزمایش") || strings.Contains(body, "customerMobile") {
		t.Fatalf("unexpected public response: %s", body)
	}
	if err := db.First(&order, order.ID).Error; err != nil {
		t.Fatal(err)
	}
	if order.CustomerFullName != "سارا احمدی" || order.CustomerMobile != "09123456789" || order.CustomerPostalCode != "1234567890" || order.Status != waitingPaymentStatus || order.CustomerSubmittedAt == nil {
		t.Fatalf("unexpected stored order: %#v", order)
	}
	if filepath.Ext(order.ReceiptFilePath) != ".png" || strings.Contains(order.ReceiptFilePath, "claimed") {
		t.Fatalf("unsafe receipt name %q", order.ReceiptFilePath)
	}
	if _, err := os.Stat(filepath.Join(cfg.receiptDir, order.ReceiptFilePath)); err != nil {
		t.Fatalf("stored receipt missing: %v", err)
	}
	var history []OrderStatusHistory
	if err := db.Where("order_id = ?", order.ID).Order("id").Find(&history).Error; err != nil || len(history) != 2 || history[1].PreviousStatus != waitingInfoStatus || history[1].NewStatus != waitingPaymentStatus || history[1].ChangedByAdminID != nil {
		t.Fatalf("unexpected history: %#v, error %v", history, err)
	}
	retry := multipartRequest(e, http.MethodPost, "/api/o/"+order.SecretToken+"/details", validCustomerFields(), "receipt.png", png)
	if retry.Code != http.StatusConflict {
		t.Fatalf("duplicate submission returned %d: %s", retry.Code, retry.Body.String())
	}
}

func TestCustomerSubmissionRequiresReceipt(t *testing.T) {
	db, e, cfg, _ := newAuthTestServer(t)
	order := createCustomerTestOrder(t, db, "required-receipt-token")
	invalid := validCustomerFields()
	invalid["mobile"] = "123"
	response := multipartRequest(e, http.MethodPost, "/api/o/"+order.SecretToken+"/details", invalid, "", nil)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid mobile returned %d", response.Code)
	}
	response = multipartRequest(e, http.MethodPost, "/api/o/"+order.SecretToken+"/details", validCustomerFields(), "", nil)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "رسید پرداخت") {
		t.Fatalf("missing receipt returned %d: %s", response.Code, response.Body.String())
	}
	if err := db.First(&order, order.ID).Error; err != nil || order.CustomerSubmittedAt != nil {
		t.Fatalf("missing receipt changed order: %#v, error %v", order, err)
	}
	response = multipartRequest(e, http.MethodPost, "/api/o/"+order.SecretToken+"/details", validCustomerFields(), "receipt.jpg", []byte("not an image"))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("spoofed receipt returned %d: %s", response.Code, response.Body.String())
	}
	entries, err := os.ReadDir(cfg.receiptDir)
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("invalid upload left files: %#v", entries)
	}
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)
	if response := multipartRequest(e, http.MethodPost, "/api/o/wrong-token/details", validCustomerFields(), "receipt.png", png); response.Code != http.StatusNotFound {
		t.Fatalf("wrong token returned %d", response.Code)
	}
	if response := multipartRequest(e, http.MethodPost, "/api/o/"+order.SecretToken+"/receipt", nil, "receipt.png", png); response.Code != http.StatusNotFound {
		t.Fatalf("removed later receipt endpoint returned %d", response.Code)
	}
}

func TestReceiptSizeLimit(t *testing.T) {
	db, _, cfg, _ := newAuthTestServer(t)
	cfg.maxReceiptBytes = 16
	e := newServer(db, cfg)
	order := createCustomerTestOrder(t, db, "receipt-size-token")
	response := multipartRequest(e, http.MethodPost, "/api/o/"+order.SecretToken+"/details", validCustomerFields(), "large.png", append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 9)...))
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized receipt returned %d: %s", response.Code, response.Body.String())
	}
	if err := db.First(&order, order.ID).Error; err != nil || order.CustomerSubmittedAt != nil {
		t.Fatalf("oversized receipt changed order: %#v, error %v", order, err)
	}
}
