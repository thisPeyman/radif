package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestInstallmentPaymentFlow(t *testing.T) {
	db, e, cfg, admin := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var product Product
	if err := db.First(&product).Error; err != nil {
		t.Fatal(err)
	}
	deliveryDate := time.Now().AddDate(0, 0, 7).Format("2006-01-02")
	createBody := fmt.Sprintf(`{"createKey":"split-flow","shopId":%d,"items":[{"productId":%d,"quantity":1}],"amount":1000000,"initialPaymentAmount":350000,"estimatedDeliveryDate":%q}`, product.ShopID, product.ID, deliveryDate)
	created := request(e, http.MethodPost, "/api/orders", createBody, testOrigin, cookie)
	if created.Code != http.StatusCreated || !strings.Contains(created.Body.String(), `"initialPaymentAmount":350000`) || !strings.Contains(created.Body.String(), `"finalPaymentAmount":650000`) {
		t.Fatalf("split creation returned %d: %s", created.Code, created.Body.String())
	}
	var output struct {
		ID          uint   `json:"id"`
		CustomerURL string `json:"customerUrl"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &output); err != nil {
		t.Fatal(err)
	}
	if retry := request(e, http.MethodPost, "/api/orders", createBody, testOrigin, cookie); retry.Code != http.StatusCreated {
		t.Fatalf("split creation retry returned %d: %s", retry.Code, retry.Body.String())
	}
	if mismatch := request(e, http.MethodPost, "/api/orders", strings.Replace(createBody, "350000", "360000", 1), testOrigin, cookie); mismatch.Code != http.StatusConflict {
		t.Fatalf("split fingerprint mismatch returned %d: %s", mismatch.Code, mismatch.Body.String())
	}
	var order Order
	if err := db.First(&order, output.ID).Error; err != nil || order.InitialPaymentAmount == nil || *order.InitialPaymentAmount != 350000 {
		t.Fatalf("unexpected split order: %#v, error %v", order, err)
	}
	publicPath := strings.TrimPrefix(output.CustomerURL, testOrigin)
	public := request(e, http.MethodGet, "/api"+publicPath, "", "", nil)
	if public.Code != http.StatusOK || !strings.Contains(public.Body.String(), `"initialPaymentAmount":350000`) || !strings.Contains(public.Body.String(), `"finalPaymentAmount":650000`) || strings.Contains(public.Body.String(), "finalPaymentCardNumber") {
		t.Fatalf("unexpected initial public split response: %s", public.Body.String())
	}

	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)
	details := multipartRequest(e, http.MethodPost, "/api"+publicPath+"/details", validCustomerFields(), "initial.png", png)
	if details.Code != http.StatusOK {
		t.Fatalf("initial receipt returned %d: %s", details.Code, details.Body.String())
	}
	requestPath := fmt.Sprintf("/api/orders/%d/final-payment/request", order.ID)
	if response := request(e, http.MethodPost, requestPath, "", testOrigin, cookie); response.Code != http.StatusConflict {
		t.Fatalf("unconfirmed first payment request returned %d: %s", response.Code, response.Body.String())
	}
	if response := request(e, http.MethodPatch, fmt.Sprintf("/api/orders/%d", order.ID), `{"status":"paid"}`, testOrigin, cookie); response.Code != http.StatusOK {
		t.Fatalf("first payment confirmation returned %d: %s", response.Code, response.Body.String())
	}
	if err := db.Model(&Shop{}).Where("id = ?", order.ShopID).Updates(map[string]any{
		"payment_card_number": "5022291012345678", "payment_instructions": "کارت تسویه",
	}).Error; err != nil {
		t.Fatal(err)
	}
	requested := request(e, http.MethodPost, requestPath, "", testOrigin, cookie)
	if requested.Code != http.StatusOK || !strings.Contains(requested.Body.String(), `"finalPaymentCardNumber":"5022291012345678"`) || !strings.Contains(requested.Body.String(), `"finalPaymentRequested":true`) {
		t.Fatalf("final payment request returned %d: %s", requested.Code, requested.Body.String())
	}
	if err := db.First(&order, order.ID).Error; err != nil {
		t.Fatal(err)
	}
	requestedAt := order.FinalPaymentRequestedAt
	if requestedAt == nil || order.FinalPaymentCardNumber != "5022291012345678" {
		t.Fatalf("final request was not snapshotted: %#v", order)
	}
	if retry := request(e, http.MethodPost, requestPath, "", testOrigin, cookie); retry.Code != http.StatusOK {
		t.Fatalf("request retry returned %d: %s", retry.Code, retry.Body.String())
	}
	if err := db.First(&order, order.ID).Error; err != nil || order.FinalPaymentRequestedAt == nil || !order.FinalPaymentRequestedAt.Equal(*requestedAt) {
		t.Fatalf("request retry changed timestamp: %#v, error %v", order.FinalPaymentRequestedAt, err)
	}

	public = request(e, http.MethodGet, "/api"+publicPath, "", "", nil)
	if !strings.Contains(public.Body.String(), `"finalPaymentCardNumber":"5022291012345678"`) || strings.Contains(public.Body.String(), "finalReceiptFilePath") {
		t.Fatalf("unexpected requested public response: %s", public.Body.String())
	}
	finalUploadPath := "/api" + publicPath + "/final-payment/receipt"
	finalReceipt := multipartRequest(e, http.MethodPost, finalUploadPath, nil, "final.jpg", png)
	if finalReceipt.Code != http.StatusOK || !strings.Contains(finalReceipt.Body.String(), `"finalReceiptUploaded":true`) {
		t.Fatalf("final receipt returned %d: %s", finalReceipt.Code, finalReceipt.Body.String())
	}
	if retry := multipartRequest(e, http.MethodPost, finalUploadPath, nil, "final.png", png); retry.Code != http.StatusConflict {
		t.Fatalf("duplicate final receipt returned %d: %s", retry.Code, retry.Body.String())
	}
	if err := db.First(&order, order.ID).Error; err != nil || filepath.Ext(order.FinalReceiptFilePath) != ".png" {
		t.Fatalf("unexpected final receipt path %q, error %v", order.FinalReceiptFilePath, err)
	}
	if _, err := os.Stat(filepath.Join(cfg.receiptDir, order.FinalReceiptFilePath)); err != nil {
		t.Fatalf("stored final receipt missing: %v", err)
	}
	receiptResponse := request(e, http.MethodGet, fmt.Sprintf("/api/orders/%d/final-payment/receipt", order.ID), "", "", cookie)
	if receiptResponse.Code != http.StatusOK || receiptResponse.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("final receipt access returned %d with headers %#v", receiptResponse.Code, receiptResponse.Header())
	}
	confirmPath := fmt.Sprintf("/api/orders/%d/final-payment/confirm", order.ID)
	confirmed := request(e, http.MethodPost, confirmPath, "", testOrigin, cookie)
	if confirmed.Code != http.StatusOK || !strings.Contains(confirmed.Body.String(), `"finalPaymentConfirmed":true`) || !strings.Contains(confirmed.Body.String(), admin.Name) {
		t.Fatalf("confirmation returned %d: %s", confirmed.Code, confirmed.Body.String())
	}
	if err := db.First(&order, order.ID).Error; err != nil || order.FinalPaymentConfirmedAt == nil || order.FinalPaymentConfirmedByAdminID == nil || *order.FinalPaymentConfirmedByAdminID != admin.ID {
		t.Fatalf("unexpected final confirmation: %#v, error %v", order, err)
	}
	public = request(e, http.MethodGet, "/api"+publicPath, "", "", nil)
	if !strings.Contains(public.Body.String(), `"finalPaymentConfirmed":true`) || strings.Contains(public.Body.String(), admin.Name) {
		t.Fatalf("unexpected confirmed public response: %s", public.Body.String())
	}
	list := request(e, http.MethodGet, fmt.Sprintf("/api/orders?shopId=%d", order.ShopID), "", "", cookie)
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), `"initialPaymentAmount":350000`) || !strings.Contains(list.Body.String(), `"finalPaymentConfirmed":true`) {
		t.Fatalf("split list state returned %d: %s", list.Code, list.Body.String())
	}
}

func TestInstallmentValidationAndOwnership(t *testing.T) {
	db, e, _, _ := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var product Product
	if err := db.First(&product).Error; err != nil {
		t.Fatal(err)
	}
	date := time.Now().AddDate(0, 0, 7).Format("2006-01-02")
	legacyItems := []struct {
		ProductID uint `json:"productId"`
		Quantity  int  `json:"quantity"`
	}{{ProductID: product.ID, Quantity: 1}}
	legacyFingerprintJSON, _ := json.Marshal(map[string]any{
		"shopId": product.ShopID, "items": legacyItems, "amount": int64(1000),
		"estimatedDeliveryDate": date, "instagramUsername": "", "internalNote": "",
	})
	legacyFingerprint := hashToken(string(legacyFingerprintJSON))
	if err := db.Exec(`INSERT INTO orders (create_key, create_fingerprint, secret_token, shop_id, amount, estimated_delivery_date, payment_card_number, payment_instructions, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '', '', ?, NOW(), NOW())`,
		"legacy-split-retry", legacyFingerprint, "legacy-split-token", product.ShopID, 1000, date, waitingInfoStatus).Error; err != nil {
		t.Fatal(err)
	}
	var legacy Order
	if err := db.First(&legacy, "create_key = ?", "legacy-split-retry").Error; err != nil || legacy.FinalPaymentCardNumber != "" || legacy.FinalReceiptFilePath != "" {
		t.Fatalf("legacy order did not receive safe defaults: %#v, error %v", legacy, err)
	}
	legacyBody := fmt.Sprintf(`{"createKey":"legacy-split-retry","shopId":%d,"items":[{"productId":%d,"quantity":1}],"amount":1000,"estimatedDeliveryDate":%q}`, product.ShopID, product.ID, date)
	if response := request(e, http.MethodPost, "/api/orders", legacyBody, testOrigin, cookie); response.Code != http.StatusCreated {
		t.Fatalf("legacy create-key retry returned %d: %s", response.Code, response.Body.String())
	}
	for _, initial := range []int64{0, 1000, 1001} {
		body := fmt.Sprintf(`{"createKey":"bad-split-%d","shopId":%d,"items":[{"productId":%d,"quantity":1}],"amount":1000,"initialPaymentAmount":%d,"estimatedDeliveryDate":%q}`, initial, product.ShopID, product.ID, initial, date)
		if response := request(e, http.MethodPost, "/api/orders", body, testOrigin, cookie); response.Code != http.StatusBadRequest {
			t.Fatalf("initial amount %d returned %d: %s", initial, response.Code, response.Body.String())
		}
	}
	other := createOtherOrder(t, db)
	initial := int64(1)
	if err := db.Model(&other).Updates(map[string]any{"amount": 2, "initial_payment_amount": initial, "receipt_file_path": "first.png", "customer_submitted_at": time.Now(), "status": "paid"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&OrderStatusHistory{OrderID: other.ID, NewStatus: "paid"}).Error; err != nil {
		t.Fatal(err)
	}
	path := fmt.Sprintf("/api/orders/%d/final-payment/request", other.ID)
	if response := request(e, http.MethodPost, path, "", testOrigin, cookie); response.Code != http.StatusNotFound {
		t.Fatalf("cross-shop final request returned %d", response.Code)
	}
	if response := request(e, http.MethodPost, path, "", testOrigin, nil); response.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated final request returned %d", response.Code)
	}
	if response := request(e, http.MethodGet, fmt.Sprintf("/api/orders/%d/final-payment/receipt", other.ID), "", "", cookie); response.Code != http.StatusNotFound {
		t.Fatalf("cross-shop final receipt returned %d", response.Code)
	}
	if response := request(e, http.MethodPost, fmt.Sprintf("/api/orders/%d/final-payment/confirm", other.ID), "", testOrigin, cookie); response.Code != http.StatusNotFound {
		t.Fatalf("cross-shop final confirmation returned %d", response.Code)
	}
}
