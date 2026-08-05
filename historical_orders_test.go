package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

func historicalOrderRequest(t *testing.T, e *echo.Echo, cookie *http.Cookie, input map[string]any, receipt []byte) *httptest.ResponseRecorder {
	t.Helper()
	data, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("order", string(data)); err != nil {
		t.Fatal(err)
	}
	if receipt != nil {
		file, err := writer.CreateFormFile("receipt", "old-receipt.jpg")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Write(receipt); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/orders/import", &body)
	req.Header.Set(echo.HeaderContentType, writer.FormDataContentType())
	req.Header.Set(echo.HeaderOrigin, testOrigin)
	req.AddCookie(cookie)
	recorder := httptest.NewRecorder()
	e.ServeHTTP(recorder, req)
	return recorder
}

func TestImportHistoricalOrder(t *testing.T) {
	db, e, cfg, admin := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var product Product
	if err := db.First(&product).Error; err != nil {
		t.Fatal(err)
	}
	input := map[string]any{
		"createKey": "historical-1", "shopId": product.ShopID,
		"items":  []map[string]any{{"productId": product.ID, "quantity": 2}},
		"amount": 650000, "estimatedDeliveryDate": "2020-01-02", "status": "preparing",
		"customerFullName": " سارا احمدی ", "customerMobile": "+۹۸ ۹۱۲ ۳۴۵ ۶۷۸۹",
		"customerAddress": " تهران، خیابان آزمایش ", "customerPostalCode": "۱۲۳۴۵۶۷۸۹۰",
		"salesChannel": "telegram", "conversationReference": " سارا در تلگرام ", "internalNote": " سفارش قدیمی ",
	}
	response := historicalOrderRequest(t, e, cookie, input, nil)
	if response.Code != http.StatusCreated {
		t.Fatalf("import returned %d: %s", response.Code, response.Body.String())
	}
	var output struct {
		ID          uint   `json:"id"`
		CustomerURL string `json:"customerUrl"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &output); err != nil {
		t.Fatal(err)
	}
	var order Order
	if err := db.First(&order, output.ID).Error; err != nil {
		t.Fatal(err)
	}
	if order.Status != "preparing" || order.EstimatedDeliveryDate != "2020-01-02" || order.Amount != 650000 || order.CustomerSubmittedAt == nil || order.CustomerMobile != "09123456789" || order.CustomerPostalCode != "1234567890" || order.ReceiptFilePath != "" || order.SalesChannel != "telegram" || order.ConversationReference != "سارا در تلگرام" || order.PaymentCardNumber != "6037991812345678" || order.PaymentInstructions != "به نام فروشگاه خانه آبی" {
		t.Fatalf("unexpected imported order: %#v", order)
	}
	var item OrderItem
	if err := db.First(&item, "order_id = ?", order.ID).Error; err != nil || item.Quantity != 2 || item.UnitPrice != product.DefaultPrice {
		t.Fatalf("unexpected imported item: %#v, error %v", item, err)
	}
	var history []OrderStatusHistory
	if err := db.Where("order_id = ?", order.ID).Find(&history).Error; err != nil || len(history) != 1 || history[0].PreviousStatus != "" || history[0].NewStatus != "preparing" || history[0].ChangedByAdminID == nil || *history[0].ChangedByAdminID != admin.ID {
		t.Fatalf("unexpected imported history: %#v, error %v", history, err)
	}
	parsed, err := url.Parse(output.CustomerURL)
	if err != nil {
		t.Fatal(err)
	}
	public := request(e, http.MethodGet, "/api"+parsed.Path, "", "", nil)
	if public.Code != http.StatusOK || !strings.Contains(public.Body.String(), `"customerSubmitted":true`) || !strings.Contains(public.Body.String(), `"receiptUploaded":false`) || !strings.Contains(public.Body.String(), `"status":"preparing"`) {
		t.Fatalf("public imported order returned %d: %s", public.Code, public.Body.String())
	}
	if body := public.Body.String(); strings.Contains(body, "salesChannel") || strings.Contains(body, "conversationReference") || strings.Contains(body, "سارا در تلگرام") {
		t.Fatalf("public imported order exposed conversation data: %s", body)
	}

	retry := historicalOrderRequest(t, e, cookie, input, nil)
	if retry.Code != http.StatusCreated || !strings.Contains(retry.Body.String(), fmt.Sprintf(`"id":%d`, order.ID)) {
		t.Fatalf("import retry returned %d: %s", retry.Code, retry.Body.String())
	}
	input["amount"] = 650001
	if mismatch := historicalOrderRequest(t, e, cookie, input, nil); mismatch.Code != http.StatusConflict {
		t.Fatalf("import mismatch returned %d: %s", mismatch.Code, mismatch.Body.String())
	}

	input["createKey"], input["amount"], input["status"] = "historical-receipt", 650000, waitingPaymentStatus
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)
	withReceipt := historicalOrderRequest(t, e, cookie, input, png)
	if withReceipt.Code != http.StatusCreated {
		t.Fatalf("receipt import returned %d: %s", withReceipt.Code, withReceipt.Body.String())
	}
	var receiptOutput struct {
		ID uint `json:"id"`
	}
	if err := json.Unmarshal(withReceipt.Body.Bytes(), &receiptOutput); err != nil {
		t.Fatal(err)
	}
	var receiptOrder Order
	if err := db.First(&receiptOrder, receiptOutput.ID).Error; err != nil || receiptOrder.Status != waitingPaymentStatus || filepath.Ext(receiptOrder.ReceiptFilePath) != ".png" {
		t.Fatalf("unexpected receipt order: %#v, error %v", receiptOrder, err)
	}
	if _, err := os.Stat(filepath.Join(cfg.receiptDir, receiptOrder.ReceiptFilePath)); err != nil {
		t.Fatalf("imported receipt missing: %v", err)
	}
}

func TestImportHistoricalOrderValidationAndOwnership(t *testing.T) {
	db, e, _, _ := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var product Product
	if err := db.First(&product).Error; err != nil {
		t.Fatal(err)
	}
	input := map[string]any{
		"createKey": "historical-invalid", "shopId": product.ShopID,
		"items":  []map[string]any{{"productId": product.ID, "quantity": 1}},
		"amount": 1, "estimatedDeliveryDate": "2020-01-02", "status": waitingInfoStatus,
		"customerFullName": "سارا احمدی", "customerMobile": "09123456789",
		"customerAddress": "تهران، خیابان آزمایش", "customerPostalCode": "",
	}
	if response := historicalOrderRequest(t, e, cookie, input, nil); response.Code != http.StatusBadRequest {
		t.Fatalf("waiting-info import returned %d: %s", response.Code, response.Body.String())
	}
	input["createKey"], input["status"] = "historical-missing-receipt", waitingPaymentStatus
	if response := historicalOrderRequest(t, e, cookie, input, nil); response.Code != http.StatusBadRequest {
		t.Fatalf("receipt-less waiting-payment import returned %d: %s", response.Code, response.Body.String())
	}
	input["createKey"], input["status"], input["salesChannel"] = "historical-invalid-channel", "preparing", "sms"
	if response := historicalOrderRequest(t, e, cookie, input, nil); response.Code != http.StatusBadRequest {
		t.Fatalf("invalid-channel import returned %d: %s", response.Code, response.Body.String())
	}
	delete(input, "salesChannel")
	other := createOtherOrder(t, db)
	var otherProduct Product
	if err := db.First(&otherProduct, "shop_id = ?", other.ShopID).Error; err != nil {
		t.Fatal(err)
	}
	input["createKey"], input["shopId"], input["items"], input["status"] = "historical-other", other.ShopID, []map[string]any{{"productId": otherProduct.ID, "quantity": 1}}, "preparing"
	if response := historicalOrderRequest(t, e, cookie, input, nil); response.Code != http.StatusNotFound {
		t.Fatalf("cross-shop import returned %d: %s", response.Code, response.Body.String())
	}
}
