package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
)

func TestProductsRequireOwnedShop(t *testing.T) {
	db, e, _, _ := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var shop Shop
	if err := db.First(&shop).Error; err != nil {
		t.Fatal(err)
	}
	var hiddenProduct Product
	if err := db.Where("shop_id = ?", shop.ID).Order("id DESC").First(&hiddenProduct).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&hiddenProduct).Update("active", false).Error; err != nil {
		t.Fatal(err)
	}

	response := request(e, http.MethodGet, fmt.Sprintf("/api/shops/%d/products", shop.ID), "", "", cookie)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "شمع موج") || strings.Contains(response.Body.String(), hiddenProduct.Name) {
		t.Fatalf("products returned %d: %s", response.Code, response.Body.String())
	}

	otherAdmin := Admin{Name: "دیگری", Login: "other-products", PasswordHash: "unused", Active: true}
	if err := db.Create(&otherAdmin).Error; err != nil {
		t.Fatal(err)
	}
	otherShop := Shop{OwnerAdminID: otherAdmin.ID, Name: "فروشگاه محصولات دیگر", PaymentInstructions: "آزمایشی", Active: true}
	if err := db.Create(&otherShop).Error; err != nil {
		t.Fatal(err)
	}
	response = request(e, http.MethodGet, fmt.Sprintf("/api/shops/%d/products", otherShop.ID), "", "", cookie)
	if response.Code != http.StatusNotFound {
		t.Fatalf("cross-shop products returned %d", response.Code)
	}
	response = request(e, http.MethodGet, fmt.Sprintf("/api/orders?shopId=%d", otherShop.ID), "", "", cookie)
	if response.Code != http.StatusNotFound {
		t.Fatalf("cross-shop order list returned %d", response.Code)
	}
}

func TestCreateOrderAndRecordCopy(t *testing.T) {
	db, e, _, admin := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var products []Product
	if err := db.Order("id").Limit(2).Find(&products).Error; err != nil || len(products) != 2 {
		t.Fatal(err)
	}
	deliveryDate := time.Now().AddDate(0, 0, 7).Format("2006-01-02")
	body := fmt.Sprintf(`{"createKey":"create-test-1","shopId":%d,"items":[{"productId":%d,"quantity":2},{"productId":%d,"quantity":1}],"amount":1520000,"estimatedDeliveryDate":%q,"instagramUsername":" @customer ","internalNote":" test ","elapsedMs":1234}`, products[0].ShopID, products[0].ID, products[1].ID, deliveryDate)
	response := request(e, http.MethodPost, "/api/orders", body, testOrigin, cookie)
	if response.Code != http.StatusCreated {
		t.Fatalf("create returned %d: %s", response.Code, response.Body.String())
	}
	var output struct {
		ID          uint   `json:"id"`
		CustomerURL string `json:"customerUrl"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &output); err != nil {
		t.Fatal(err)
	}
	parsedURL, err := url.Parse(output.CustomerURL)
	if err != nil || parsedURL.Scheme+"://"+parsedURL.Host != testOrigin {
		t.Fatalf("unexpected customer URL %q", output.CustomerURL)
	}
	token := strings.TrimPrefix(parsedURL.Path, "/o/")
	random, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(random) != 32 {
		t.Fatalf("customer token has %d random bytes, error %v", len(random), err)
	}

	var order Order
	if err := db.First(&order, output.ID).Error; err != nil {
		t.Fatal(err)
	}
	if order.Status != waitingInfoStatus || order.EstimatedDeliveryDate != deliveryDate || order.InstagramUsername != "customer" || order.InternalNote != "test" || order.Amount != 1520000 {
		t.Fatalf("unexpected order: %#v", order)
	}
	var items []OrderItem
	if err := db.Where("order_id = ?", order.ID).Order("product_id").Find(&items).Error; err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || items[0].Quantity != 2 || items[0].UnitPrice != products[0].DefaultPrice || items[1].Quantity != 1 {
		t.Fatalf("unexpected order items: %#v", items)
	}
	var history OrderStatusHistory
	if err := db.First(&history, "order_id = ?", order.ID).Error; err != nil || history.NewStatus != waitingInfoStatus || history.ChangedByAdminID == nil || *history.ChangedByAdminID != admin.ID {
		t.Fatalf("unexpected history: %#v, error %v", history, err)
	}
	var eventCount int64
	if err := db.Model(&PilotEvent{}).Where("order_id = ?", order.ID).Count(&eventCount).Error; err != nil || eventCount != 2 {
		t.Fatalf("creation event count = %d, error %v", eventCount, err)
	}
	publicResponse := request(e, http.MethodGet, "/api"+parsedURL.Path, "", "", nil)
	if publicResponse.Code != http.StatusOK || !strings.Contains(publicResponse.Body.String(), deliveryDate) || !strings.Contains(publicResponse.Body.String(), products[0].Name) {
		t.Fatalf("public order returned %d: %s", publicResponse.Code, publicResponse.Body.String())
	}
	if body := publicResponse.Body.String(); strings.Contains(body, "internalNote") || strings.Contains(body, "customerMobile") || strings.Contains(body, "test") {
		t.Fatalf("public order exposed private data: %s", body)
	}
	retry := request(e, http.MethodPost, "/api/orders", body, testOrigin, cookie)
	if retry.Code != http.StatusCreated {
		t.Fatalf("idempotent retry returned %d: %s", retry.Code, retry.Body.String())
	}
	var orderCount int64
	if err := db.Model(&Order{}).Count(&orderCount).Error; err != nil || orderCount != 1 {
		t.Fatalf("idempotent retry left %d orders, error %v", orderCount, err)
	}
	mismatch := request(e, http.MethodPost, "/api/orders", strings.Replace(body, "1520000", "1530000", 1), testOrigin, cookie)
	if mismatch.Code != http.StatusConflict {
		t.Fatalf("idempotency mismatch returned %d: %s", mismatch.Code, mismatch.Body.String())
	}
	updatedDate := time.Now().AddDate(0, 0, 8).Format("2006-01-02")
	response = request(e, http.MethodPatch, fmt.Sprintf("/api/orders/%d", order.ID), fmt.Sprintf(`{"estimatedDeliveryDate":%q}`, updatedDate), testOrigin, cookie)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), updatedDate) {
		t.Fatalf("delivery update returned %d: %s", response.Code, response.Body.String())
	}
	publicResponse = request(e, http.MethodGet, "/api"+parsedURL.Path, "", "", nil)
	if publicResponse.Code != http.StatusOK || !strings.Contains(publicResponse.Body.String(), updatedDate) {
		t.Fatalf("public order did not show updated delivery date: %s", publicResponse.Body.String())
	}
	retry = request(e, http.MethodPost, "/api/orders", body, testOrigin, cookie)
	if retry.Code != http.StatusCreated || !strings.Contains(retry.Body.String(), updatedDate) {
		t.Fatalf("idempotent retry after date update returned %d: %s", retry.Code, retry.Body.String())
	}
	detailResponse := request(e, http.MethodGet, fmt.Sprintf("/api/orders/%d", order.ID), "", "", cookie)
	if detailResponse.Code != http.StatusOK || !strings.Contains(detailResponse.Body.String(), updatedDate) {
		t.Fatalf("order detail returned %d: %s", detailResponse.Code, detailResponse.Body.String())
	}
	listResponse := request(e, http.MethodGet, fmt.Sprintf("/api/orders?shopId=%d", order.ShopID), "", "", cookie)
	if listResponse.Code != http.StatusOK || !strings.Contains(listResponse.Body.String(), updatedDate) || !strings.Contains(listResponse.Body.String(), products[0].Name) {
		t.Fatalf("order list returned %d: %s", listResponse.Code, listResponse.Body.String())
	}

	response = request(e, http.MethodPost, fmt.Sprintf("/api/orders/%d/link-copied", order.ID), "", testOrigin, cookie)
	if response.Code != http.StatusNoContent {
		t.Fatalf("copy event returned %d: %s", response.Code, response.Body.String())
	}
	if err := db.Model(&PilotEvent{}).Where("order_id = ? AND event_name = ?", order.ID, "order_link_copied").Count(&eventCount).Error; err != nil || eventCount != 1 {
		t.Fatalf("copy event count = %d, error %v", eventCount, err)
	}
}

func TestCreateOrderValidationAndOwnership(t *testing.T) {
	db, e, _, _ := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var product Product
	if err := db.First(&product).Error; err != nil {
		t.Fatal(err)
	}

	for name, body := range map[string]string{
		"missing amount": fmt.Sprintf(`{"createKey":"missing-amount","shopId":%d,"items":[{"productId":%d,"quantity":1}],"amount":0}`, product.ShopID, product.ID),
		"wrong shop":     fmt.Sprintf(`{"createKey":"wrong-shop","shopId":9999,"items":[{"productId":%d,"quantity":1}],"amount":1}`, product.ID),
		"duplicate item": fmt.Sprintf(`{"createKey":"duplicate","shopId":%d,"items":[{"productId":%d,"quantity":1},{"productId":%d,"quantity":2}],"amount":1}`, product.ShopID, product.ID, product.ID),
		"unknown field":  fmt.Sprintf(`{"createKey":"unknown-field","shopId":%d,"items":[{"productId":%d,"quantity":1}],"amount":1,"extra":true}`, product.ShopID, product.ID),
		"trailing JSON":  fmt.Sprintf(`{"createKey":"trailing","shopId":%d,"items":[{"productId":%d,"quantity":1}],"amount":1}{}`, product.ShopID, product.ID),
		"past delivery":  fmt.Sprintf(`{"createKey":"past-date","shopId":%d,"items":[{"productId":%d,"quantity":1}],"amount":1,"estimatedDeliveryDate":"2020-01-01"}`, product.ShopID, product.ID),
	} {
		t.Run(name, func(t *testing.T) {
			response := request(e, http.MethodPost, "/api/orders", body, testOrigin, cookie)
			if response.Code != http.StatusBadRequest && response.Code != http.StatusNotFound {
				t.Fatalf("returned %d: %s", response.Code, response.Body.String())
			}
		})
	}
	var count int64
	if err := db.Model(&Order{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("invalid requests created %d orders, error %v", count, err)
	}
}

func createOtherOrder(t *testing.T, db *gorm.DB) Order {
	t.Helper()
	admin := Admin{Name: "مدیر دیگر", Login: "other-order", PasswordHash: "unused", Active: true}
	if err := db.Create(&admin).Error; err != nil {
		t.Fatal(err)
	}
	shop := Shop{OwnerAdminID: admin.ID, Name: "فروشگاه سفارش دیگر", PaymentInstructions: "آزمایشی", Active: true}
	if err := db.Create(&shop).Error; err != nil {
		t.Fatal(err)
	}
	product := Product{ShopID: shop.ID, Name: "محصول دیگر", MainImagePath: "/image.svg", DefaultPrice: 1, Active: true}
	if err := db.Create(&product).Error; err != nil {
		t.Fatal(err)
	}
	order := Order{CreateKey: "other-create", SecretToken: "other-token", ShopID: shop.ID, Amount: 1, Status: waitingInfoStatus}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	return order
}

func TestCopyEventRequiresOwnership(t *testing.T) {
	db, e, _, _ := newAuthTestServer(t)
	order := createOtherOrder(t, db)
	cookie := loginCookie(t, e)
	response := request(e, http.MethodPost, fmt.Sprintf("/api/orders/%d/link-copied", order.ID), "", testOrigin, cookie)
	if response.Code != http.StatusNotFound {
		t.Fatalf("cross-shop copy event returned %d", response.Code)
	}
	response = request(e, http.MethodPatch, fmt.Sprintf("/api/orders/%d", order.ID), fmt.Sprintf(`{"estimatedDeliveryDate":%q}`, time.Now().AddDate(0, 0, 7).Format("2006-01-02")), testOrigin, cookie)
	if response.Code != http.StatusNotFound {
		t.Fatalf("cross-shop delivery update returned %d", response.Code)
	}
	response = request(e, http.MethodGet, fmt.Sprintf("/api/orders/%d", order.ID), "", "", cookie)
	if response.Code != http.StatusNotFound {
		t.Fatalf("cross-shop order detail returned %d", response.Code)
	}
	var ownProduct Product
	if err := db.Order("id").First(&ownProduct).Error; err != nil {
		t.Fatal(err)
	}
	body := fmt.Sprintf(`{"createKey":"other-create","shopId":%d,"items":[{"productId":%d,"quantity":1}],"amount":1,"estimatedDeliveryDate":%q}`, ownProduct.ShopID, ownProduct.ID, time.Now().AddDate(0, 0, 7).Format("2006-01-02"))
	response = request(e, http.MethodPost, "/api/orders", body, testOrigin, cookie)
	if response.Code != http.StatusConflict {
		t.Fatalf("cross-admin idempotency collision returned %d: %s", response.Code, response.Body.String())
	}
}

func TestOrderOperations(t *testing.T) {
	db, e, cfg, admin := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	order := createCustomerTestOrder(t, db, "operations-token")
	now := time.Now()
	if err := db.Model(&order).Updates(map[string]any{
		"customer_full_name": "سارا احمدی", "customer_mobile": "09123456789",
		"customer_address": "تهران، خیابان آزمایش", "customer_postal_code": "1234567890",
		"customer_note": "طبقه دوم", "customer_submitted_at": now,
		"instagram_username": "sara_shop", "status": waitingPaymentStatus,
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&OrderStatusHistory{OrderID: order.ID, PreviousStatus: waitingInfoStatus, NewStatus: waitingPaymentStatus}).Error; err != nil {
		t.Fatal(err)
	}

	for name, query := range map[string]string{
		"name":       "سارا",
		"mobile":     "+۹۸ ۹۱۲ ۳۴۵ ۶۷۸۹",
		"order code": fmt.Sprintf("#%d", order.ID),
		"instagram":  "sara_shop",
	} {
		t.Run("search "+name, func(t *testing.T) {
			response := request(e, http.MethodGet, fmt.Sprintf("/api/orders?shopId=%d&q=%s&status=%s", order.ShopID, url.QueryEscape(query), waitingPaymentStatus), "", "", cookie)
			if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "سارا احمدی") || !strings.Contains(response.Body.String(), `"receiptUploaded":false`) {
				t.Fatalf("search returned %d: %s", response.Code, response.Body.String())
			}
		})
	}
	if response := request(e, http.MethodGet, fmt.Sprintf("/api/orders?shopId=%d&status=invalid", order.ShopID), "", "", cookie); response.Code != http.StatusBadRequest {
		t.Fatalf("invalid status filter returned %d", response.Code)
	}

	detail := request(e, http.MethodGet, fmt.Sprintf("/api/orders/%d", order.ID), "", "", cookie)
	if detail.Code != http.StatusOK || !strings.Contains(detail.Body.String(), cfg.appOrigin+"/o/"+order.SecretToken) || !strings.Contains(detail.Body.String(), "customerPostalCode") || !strings.Contains(detail.Body.String(), "history") {
		t.Fatalf("detail returned %d: %s", detail.Code, detail.Body.String())
	}
	update := `{"status":"paid","shipmentTrackingCode":" TRACK-123 ","customerFullName":"سارا محمدی","customerMobile":"+98 912 345 6789","customerAddress":"نشانی اصلاح‌شده","customerPostalCode":"۱۲۳۴۵۶۷۸۹۰","customerNote":"یادداشت جدید"}`
	response := request(e, http.MethodPatch, fmt.Sprintf("/api/orders/%d", order.ID), update, testOrigin, cookie)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"status":"paid"`) || !strings.Contains(response.Body.String(), `"shipmentTrackingCode":"TRACK-123"`) || !strings.Contains(response.Body.String(), "سارا محمدی") {
		t.Fatalf("operation update returned %d: %s", response.Code, response.Body.String())
	}
	if err := db.First(&order, order.ID).Error; err != nil || order.Status != "paid" || order.CustomerMobile != "09123456789" || order.ShipmentTrackingCode != "TRACK-123" {
		t.Fatalf("unexpected updated order: %#v, error %v", order, err)
	}
	var latest OrderStatusHistory
	if err := db.Where("order_id = ?", order.ID).Order("id DESC").First(&latest).Error; err != nil || latest.PreviousStatus != waitingPaymentStatus || latest.NewStatus != "paid" || latest.ChangedByAdminID == nil || *latest.ChangedByAdminID != admin.ID {
		t.Fatalf("unexpected admin history: %#v, error %v", latest, err)
	}
	var historyCount int64
	if err := db.Model(&OrderStatusHistory{}).Where("order_id = ?", order.ID).Count(&historyCount).Error; err != nil {
		t.Fatal(err)
	}
	response = request(e, http.MethodPatch, fmt.Sprintf("/api/orders/%d", order.ID), `{"status":"paid"}`, testOrigin, cookie)
	if response.Code != http.StatusOK {
		t.Fatalf("no-op status returned %d: %s", response.Code, response.Body.String())
	}
	var afterNoOp int64
	if err := db.Model(&OrderStatusHistory{}).Where("order_id = ?", order.ID).Count(&afterNoOp).Error; err != nil || afterNoOp != historyCount {
		t.Fatalf("no-op history count = %d, want %d, error %v", afterNoOp, historyCount, err)
	}
	if response := request(e, http.MethodPatch, fmt.Sprintf("/api/orders/%d", order.ID), `{"status":"unknown"}`, testOrigin, cookie); response.Code != http.StatusBadRequest {
		t.Fatalf("invalid status update returned %d", response.Code)
	}
	public := request(e, http.MethodGet, "/api/o/"+order.SecretToken, "", "", nil)
	if public.Code != http.StatusOK || !strings.Contains(public.Body.String(), `"shipmentTrackingCode":"TRACK-123"`) || strings.Contains(public.Body.String(), `"receiptUploadAllowed":true`) {
		t.Fatalf("public operation state returned %d: %s", public.Code, public.Body.String())
	}
}

func TestProtectedOrderReceipt(t *testing.T) {
	db, e, cfg, _ := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	order := createCustomerTestOrder(t, db, "admin-receipt-token")
	content := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)
	if err := os.MkdirAll(cfg.receiptDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cfg.receiptDir, "receipt.png"), content, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&order).Update("receipt_file_path", "receipt.png").Error; err != nil {
		t.Fatal(err)
	}
	path := fmt.Sprintf("/api/orders/%d/receipt", order.ID)
	if response := request(e, http.MethodGet, path, "", "", nil); response.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated receipt returned %d", response.Code)
	}
	response := request(e, http.MethodGet, path, "", "", cookie)
	if response.Code != http.StatusOK || !bytes.Equal(response.Body.Bytes(), content) || response.Header().Get("Content-Type") != "image/png" || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("receipt returned %d, type %q, cache %q", response.Code, response.Header().Get("Content-Type"), response.Header().Get("Cache-Control"))
	}
	other := createOtherOrder(t, db)
	if err := db.Model(&other).Update("receipt_file_path", "receipt.png").Error; err != nil {
		t.Fatal(err)
	}
	if response := request(e, http.MethodGet, fmt.Sprintf("/api/orders/%d/receipt", other.ID), "", "", cookie); response.Code != http.StatusNotFound {
		t.Fatalf("cross-shop receipt returned %d", response.Code)
	}
}
