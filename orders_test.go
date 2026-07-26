package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"testing"

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
}

func TestCreateOrderAndRecordCopy(t *testing.T) {
	db, e, _, admin := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var product Product
	if err := db.First(&product).Error; err != nil {
		t.Fatal(err)
	}
	body := fmt.Sprintf(`{"createKey":"create-test-1","shopId":%d,"productId":%d,"amount":430000,"instagramUsername":" @customer ","internalNote":" test ","elapsedMs":1234}`, product.ShopID, product.ID)
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
	if order.Status != waitingInfoStatus || order.InstagramUsername != "customer" || order.InternalNote != "test" || order.Amount != 430000 {
		t.Fatalf("unexpected order: %#v", order)
	}
	var history OrderStatusHistory
	if err := db.First(&history, "order_id = ?", order.ID).Error; err != nil || history.NewStatus != waitingInfoStatus || history.ChangedByAdminID == nil || *history.ChangedByAdminID != admin.ID {
		t.Fatalf("unexpected history: %#v, error %v", history, err)
	}
	var eventCount int64
	if err := db.Model(&PilotEvent{}).Where("order_id = ?", order.ID).Count(&eventCount).Error; err != nil || eventCount != 2 {
		t.Fatalf("creation event count = %d, error %v", eventCount, err)
	}
	retry := request(e, http.MethodPost, "/api/orders", body, testOrigin, cookie)
	if retry.Code != http.StatusCreated {
		t.Fatalf("idempotent retry returned %d: %s", retry.Code, retry.Body.String())
	}
	var orderCount int64
	if err := db.Model(&Order{}).Count(&orderCount).Error; err != nil || orderCount != 1 {
		t.Fatalf("idempotent retry left %d orders, error %v", orderCount, err)
	}
	mismatch := request(e, http.MethodPost, "/api/orders", strings.Replace(body, "430000", "440000", 1), testOrigin, cookie)
	if mismatch.Code != http.StatusConflict {
		t.Fatalf("idempotency mismatch returned %d: %s", mismatch.Code, mismatch.Body.String())
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
		"missing amount": fmt.Sprintf(`{"createKey":"missing-amount","shopId":%d,"productId":%d,"amount":0}`, product.ShopID, product.ID),
		"wrong shop":     fmt.Sprintf(`{"createKey":"wrong-shop","shopId":9999,"productId":%d,"amount":1}`, product.ID),
		"unknown field":  fmt.Sprintf(`{"createKey":"unknown-field","shopId":%d,"productId":%d,"amount":1,"extra":true}`, product.ShopID, product.ID),
		"trailing JSON":  fmt.Sprintf(`{"createKey":"trailing","shopId":%d,"productId":%d,"amount":1}{}`, product.ShopID, product.ID),
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
	order := Order{CreateKey: "other-create", SecretToken: "other-token", ShopID: shop.ID, ProductID: product.ID, Amount: 1, Status: waitingInfoStatus}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	return order
}

func TestCopyEventRequiresOwnership(t *testing.T) {
	db, e, _, _ := newAuthTestServer(t)
	order := createOtherOrder(t, db)
	response := request(e, http.MethodPost, fmt.Sprintf("/api/orders/%d/link-copied", order.ID), "", testOrigin, loginCookie(t, e))
	if response.Code != http.StatusNotFound {
		t.Fatalf("cross-shop copy event returned %d", response.Code)
	}
}
