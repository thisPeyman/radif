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
	otherShop := Shop{Name: "فروشگاه محصولات دیگر", PaymentCardNumber: "6037991812345678", PaymentInstructions: "آزمایشی", Active: true}
	if err := db.Create(&otherShop).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&AdminShop{AdminID: otherAdmin.ID, ShopID: otherShop.ID}).Error; err != nil {
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
	if order.Status != waitingInfoStatus || order.EstimatedDeliveryDate != deliveryDate || order.InstagramUsername != "customer" || order.InternalNote != "test" || order.Amount != 1520000 || order.PaymentCardNumber != "6037991812345678" || order.PaymentInstructions != "به نام فروشگاه خانه آبی" {
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
	if publicResponse.Code != http.StatusOK || !strings.Contains(publicResponse.Body.String(), deliveryDate) || !strings.Contains(publicResponse.Body.String(), products[0].Name) || !strings.Contains(publicResponse.Body.String(), `"paymentCardNumber":"6037991812345678"`) {
		t.Fatalf("public order returned %d: %s", publicResponse.Code, publicResponse.Body.String())
	}
	if body := publicResponse.Body.String(); strings.Contains(body, "internalNote") || strings.Contains(body, "customerMobile") || strings.Contains(body, "test") {
		t.Fatalf("public order exposed private data: %s", body)
	}
	if err := db.Model(&Shop{}).Where("id = ?", order.ShopID).Updates(map[string]any{"payment_card_number": "5022291012345678", "payment_instructions": "حساب جدید"}).Error; err != nil {
		t.Fatal(err)
	}
	publicResponse = request(e, http.MethodGet, "/api"+parsedURL.Path, "", "", nil)
	if !strings.Contains(publicResponse.Body.String(), `"paymentCardNumber":"6037991812345678"`) || !strings.Contains(publicResponse.Body.String(), `"paymentInstructions":"به نام فروشگاه خانه آبی"`) {
		t.Fatalf("existing order payment profile changed with shop: %s", publicResponse.Body.String())
	}
	if strings.Contains(publicResponse.Body.String(), `"support"`) {
		t.Fatalf("public order exposed an unconfigured support action: %s", publicResponse.Body.String())
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

func TestRotateCustomerLink(t *testing.T) {
	db, e, cfg, admin := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	order := createCustomerTestOrder(t, db, "leaked-customer-token")
	path := fmt.Sprintf("/api/orders/%d/customer-link/rotate", order.ID)

	if response := request(e, http.MethodPost, path, "", testOrigin, nil); response.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated rotation returned %d", response.Code)
	}
	if response := request(e, http.MethodPost, path, "", "https://wrong.test", cookie); response.Code != http.StatusForbidden {
		t.Fatalf("wrong-origin rotation returned %d", response.Code)
	}
	var unchanged Order
	if err := db.First(&unchanged, order.ID).Error; err != nil || unchanged.SecretToken != order.SecretToken {
		t.Fatalf("rejected rotation changed token to %q, error %v", unchanged.SecretToken, err)
	}

	response := request(e, http.MethodPost, path, "", testOrigin, cookie)
	if response.Code != http.StatusOK {
		t.Fatalf("rotation returned %d: %s", response.Code, response.Body.String())
	}
	var output struct {
		CustomerURL string `json:"customerUrl"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &output); err != nil {
		t.Fatal(err)
	}
	parsedURL, err := url.Parse(output.CustomerURL)
	if err != nil || parsedURL.Scheme+"://"+parsedURL.Host != cfg.appOrigin {
		t.Fatalf("unexpected rotated URL %q", output.CustomerURL)
	}
	newToken := strings.TrimPrefix(parsedURL.Path, "/o/")
	random, err := base64.RawURLEncoding.DecodeString(newToken)
	if err != nil || len(random) != 32 || newToken == order.SecretToken {
		t.Fatalf("rotated token has %d random bytes, matches old token %v, error %v", len(random), newToken == order.SecretToken, err)
	}
	if old := request(e, http.MethodGet, "/api/o/"+order.SecretToken, "", "", nil); old.Code != http.StatusNotFound {
		t.Fatalf("old public link returned %d: %s", old.Code, old.Body.String())
	}
	if old := request(e, http.MethodPost, "/api/o/"+order.SecretToken+"/support-click", "", testOrigin, nil); old.Code != http.StatusNotFound {
		t.Fatalf("old public mutation returned %d: %s", old.Code, old.Body.String())
	}
	if current := request(e, http.MethodGet, "/api/o/"+newToken, "", "", nil); current.Code != http.StatusOK {
		t.Fatalf("new public link returned %d: %s", current.Code, current.Body.String())
	}
	if err := db.First(&order, order.ID).Error; err != nil || order.SecretToken != newToken {
		t.Fatalf("stored token = %q, want %q, error %v", order.SecretToken, newToken, err)
	}
	var event PilotEvent
	if err := db.First(&event, "order_id = ? AND event_name = ?", order.ID, "order_link_rotated").Error; err != nil || event.AdminID == nil || *event.AdminID != admin.ID {
		t.Fatalf("unexpected rotation event: %#v, error %v", event, err)
	}
}

func TestPublicSupportRecovery(t *testing.T) {
	db, e, _, _ := newAuthTestServer(t)
	order := createCustomerTestOrder(t, db, "support-recovery-token")
	if err := db.Model(&Shop{}).Where("id = ?", order.ShopID).Updates(map[string]any{
		"whatsapp_number": "989123456789", "support_channel": "whatsapp",
	}).Error; err != nil {
		t.Fatal(err)
	}

	type supportResponse struct {
		Support struct {
			Channel string `json:"channel"`
			URL     string `json:"url"`
			Message string `json:"message"`
		} `json:"support"`
	}
	getSupport := func() supportResponse {
		t.Helper()
		response := request(e, http.MethodGet, "/api/o/"+order.SecretToken, "", "", nil)
		if response.Code != http.StatusOK {
			t.Fatalf("public support returned %d: %s", response.Code, response.Body.String())
		}
		var output supportResponse
		if err := json.Unmarshal(response.Body.Bytes(), &output); err != nil {
			t.Fatal(err)
		}
		return output
	}

	before := getSupport()
	if before.Support.Channel != "whatsapp" || !strings.HasPrefix(before.Support.URL, "https://wa.me/989123456789?text=") || !strings.Contains(before.Support.Message, "سوال دارم") {
		t.Fatalf("unexpected pre-submission support: %#v", before.Support)
	}
	click := request(e, http.MethodPost, "/api/o/"+order.SecretToken+"/support-click", "", testOrigin, nil)
	if click.Code != http.StatusNoContent {
		t.Fatalf("support click returned %d: %s", click.Code, click.Body.String())
	}
	var event PilotEvent
	if err := db.First(&event, "order_id = ? AND event_name = ?", order.ID, "public_support_clicked").Error; err != nil || !strings.Contains(event.Metadata, `"action":"message_shop"`) || !strings.Contains(event.Metadata, `"channel":"whatsapp"`) {
		t.Fatalf("unexpected support event: %#v, error %v", event, err)
	}

	now := time.Now()
	if err := db.Model(&order).Updates(map[string]any{"customer_submitted_at": now, "status": waitingPaymentStatus}).Error; err != nil {
		t.Fatal(err)
	}
	after := getSupport()
	if !strings.Contains(after.Support.Message, "اصلاح اطلاعات") {
		t.Fatalf("unexpected correction message: %#v", after.Support)
	}
	click = request(e, http.MethodPost, "/api/o/"+order.SecretToken+"/support-click", "", testOrigin, nil)
	if click.Code != http.StatusNoContent {
		t.Fatalf("correction click returned %d: %s", click.Code, click.Body.String())
	}
	event = PilotEvent{}
	if err := db.Where("order_id = ? AND event_name = ?", order.ID, "public_support_clicked").Order("id DESC").First(&event).Error; err != nil || !strings.Contains(event.Metadata, `"action":"correction_request"`) {
		t.Fatalf("unexpected correction event: %#v, error %v", event, err)
	}
	if err := db.Model(&Shop{}).Where("id = ?", order.ShopID).Updates(map[string]any{
		"instagram_username": "blue.shop", "support_channel": "instagram",
	}).Error; err != nil {
		t.Fatal(err)
	}
	instagram := getSupport()
	if instagram.Support.Channel != "instagram" || instagram.Support.URL != "https://ig.me/m/blue.shop" || instagram.Support.Message == "" {
		t.Fatalf("unexpected Instagram support: %#v", instagram.Support)
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
	shop := Shop{Name: "فروشگاه سفارش دیگر", PaymentCardNumber: "6037991812345678", PaymentInstructions: "آزمایشی", Active: true}
	if err := db.Create(&shop).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&AdminShop{AdminID: admin.ID, ShopID: shop.ID}).Error; err != nil {
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
	response = request(e, http.MethodPost, fmt.Sprintf("/api/orders/%d/customer-link/rotate", order.ID), "", testOrigin, cookie)
	if response.Code != http.StatusNotFound {
		t.Fatalf("cross-shop rotation returned %d", response.Code)
	}
	var unchanged Order
	if err := db.First(&unchanged, order.ID).Error; err != nil || unchanged.SecretToken != order.SecretToken {
		t.Fatalf("cross-shop rotation changed token to %q, error %v", unchanged.SecretToken, err)
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
		"instagram_username": "sara_shop", "receipt_file_path": "operations.png", "status": waitingPaymentStatus,
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
		"instagram":  "SARA_SHOP",
	} {
		t.Run("search "+name, func(t *testing.T) {
			response := request(e, http.MethodGet, fmt.Sprintf("/api/orders?shopId=%d&q=%s&status=%s", order.ShopID, url.QueryEscape(query), waitingPaymentStatus), "", "", cookie)
			if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "سارا احمدی") || !strings.Contains(response.Body.String(), `"receiptUploaded":true`) {
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
	update := `{"status":"paid","shipmentTrackingCode":" TRACK-123 ","customerFullName":"سارا محمدی","customerMobile":"+98 912 345 6789","customerAddress":"نشانی اصلاح‌شده","customerPostalCode":"۱۲۳۴۵۶۷۸۹۰","customerNote":"یادداشت جدید","instagramUsername":" @sara.new ","internalNote":" یادداشت داخلی جدید "}`
	response := request(e, http.MethodPatch, fmt.Sprintf("/api/orders/%d", order.ID), update, testOrigin, cookie)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"status":"paid"`) || !strings.Contains(response.Body.String(), `"shipmentTrackingCode":"TRACK-123"`) || !strings.Contains(response.Body.String(), "سارا محمدی") {
		t.Fatalf("operation update returned %d: %s", response.Code, response.Body.String())
	}
	if err := db.First(&order, order.ID).Error; err != nil || order.Status != "paid" || order.CustomerMobile != "09123456789" || order.ShipmentTrackingCode != "TRACK-123" || order.InstagramUsername != "sara.new" || order.InternalNote != "یادداشت داخلی جدید" {
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
	if err := db.Model(&order).Update("receipt_file_path", "").Error; err != nil {
		t.Fatal(err)
	}
	for _, target := range []string{waitingInfoStatus, waitingPaymentStatus} {
		response := request(e, http.MethodPatch, fmt.Sprintf("/api/orders/%d", order.ID), fmt.Sprintf(`{"status":%q}`, target), testOrigin, cookie)
		if response.Code != http.StatusConflict {
			t.Fatalf("invalid transition to %s returned %d: %s", target, response.Code, response.Body.String())
		}
	}
	if err := db.First(&order, order.ID).Error; err != nil || order.Status != "paid" {
		t.Fatalf("invalid transition changed order: %#v, error %v", order, err)
	}
	public := request(e, http.MethodGet, "/api/o/"+order.SecretToken, "", "", nil)
	if public.Code != http.StatusOK || !strings.Contains(public.Body.String(), `"shipmentTrackingCode":"TRACK-123"`) || strings.Contains(public.Body.String(), `"receiptUploadAllowed":true`) {
		t.Fatalf("public operation state returned %d: %s", public.Code, public.Body.String())
	}
	var publicStatus struct {
		History []struct {
			Status string `json:"status"`
		} `json:"history"`
		CustomerSummary struct {
			Mobile           string `json:"mobile"`
			AddressPreview   string `json:"addressPreview"`
			PostalCodeSuffix string `json:"postalCodeSuffix"`
		} `json:"customerSummary"`
	}
	if err := json.Unmarshal(public.Body.Bytes(), &publicStatus); err != nil {
		t.Fatal(err)
	}
	if len(publicStatus.History) != 3 || publicStatus.History[2].Status != "paid" || publicStatus.CustomerSummary.Mobile != "0912•••6789" || publicStatus.CustomerSummary.PostalCodeSuffix != "7890" || publicStatus.CustomerSummary.AddressPreview == "نشانی اصلاح‌شده" {
		t.Fatalf("unexpected public status summary: %#v", publicStatus)
	}
	if body := public.Body.String(); strings.Contains(body, `"customerAddress"`) || strings.Contains(body, `"internalNote"`) || strings.Contains(body, `"instagramUsername"`) || strings.Contains(body, `"changedByAdmin`) || strings.Contains(body, admin.Name) || strings.Contains(body, "نشانی اصلاح‌شده") {
		t.Fatalf("public status exposed private data: %s", body)
	}
}

func TestOrderListViewsAndSorting(t *testing.T) {
	db, e, _, _ := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var shop Shop
	if err := db.First(&shop).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	today := now.In(iranTime)
	orders := []Order{
		{CreateKey: "sort-overdue", CreateFingerprint: "sort-overdue", SecretToken: "sort-overdue", ShopID: shop.ID, Amount: 100, EstimatedDeliveryDate: today.AddDate(0, 0, -1).Format("2006-01-02"), Status: "preparing", CreatedAt: now.Add(-4 * time.Hour), UpdatedAt: now.Add(-3 * time.Hour)},
		{CreateKey: "sort-soon", CreateFingerprint: "sort-soon", SecretToken: "sort-soon", ShopID: shop.ID, Amount: 500, EstimatedDeliveryDate: today.AddDate(0, 0, 2).Format("2006-01-02"), Status: "paid", CreatedAt: now.Add(-3 * time.Hour), UpdatedAt: now.Add(-4 * time.Hour)},
		{CreateKey: "sort-later", CreateFingerprint: "sort-later", SecretToken: "sort-later", ShopID: shop.ID, Amount: 900, EstimatedDeliveryDate: today.AddDate(0, 0, 8).Format("2006-01-02"), Status: waitingInfoStatus, CreatedAt: now.Add(-2 * time.Hour), UpdatedAt: now.Add(-2 * time.Hour)},
		{CreateKey: "sort-shipped", CreateFingerprint: "sort-shipped", SecretToken: "sort-shipped", ShopID: shop.ID, Amount: 700, EstimatedDeliveryDate: today.Format("2006-01-02"), InstagramUsername: "archived-search", Status: "shipped", CreatedAt: now.Add(-time.Hour), UpdatedAt: now.Add(-30 * time.Minute)},
		{CreateKey: "sort-cancelled", CreateFingerprint: "sort-cancelled", SecretToken: "sort-cancelled", ShopID: shop.ID, Amount: 300, EstimatedDeliveryDate: today.Format("2006-01-02"), InstagramUsername: "archived-search", Status: "cancelled", CreatedAt: now.Add(-30 * time.Minute), UpdatedAt: now.Add(-90 * time.Minute)},
	}
	if err := db.Create(&orders).Error; err != nil {
		t.Fatal(err)
	}

	type listOutput struct {
		Orders []struct {
			ID        uint      `json:"id"`
			UpdatedAt time.Time `json:"updatedAt"`
		} `json:"orders"`
		HasMore       bool  `json:"hasMore"`
		ActiveCount   int64 `json:"activeCount"`
		ArchivedCount int64 `json:"archivedCount"`
	}
	list := func(query string) listOutput {
		t.Helper()
		response := request(e, http.MethodGet, fmt.Sprintf("/api/orders?shopId=%d%s", shop.ID, query), "", "", cookie)
		if response.Code != http.StatusOK {
			t.Fatalf("list returned %d: %s", response.Code, response.Body.String())
		}
		var output listOutput
		if err := json.Unmarshal(response.Body.Bytes(), &output); err != nil {
			t.Fatal(err)
		}
		return output
	}
	listIDs := func(query string) []uint {
		output := list(query)
		ids := make([]uint, len(output.Orders))
		for i, order := range output.Orders {
			ids[i] = order.ID
		}
		return ids
	}

	for name, test := range map[string]struct {
		query string
		want  []uint
	}{
		"active due by default": {want: []uint{orders[0].ID, orders[1].ID, orders[2].ID}},
		"recent":                {query: "&sort=recent", want: []uint{orders[2].ID, orders[1].ID, orders[0].ID}},
		"amount":                {query: "&sort=amount", want: []uint{orders[2].ID, orders[1].ID, orders[0].ID}},
		"archive updated":       {query: "&view=archive", want: []uint{orders[3].ID, orders[4].ID}},
		"archive created":       {query: "&view=archive&sort=recent", want: []uint{orders[4].ID, orders[3].ID}},
		"global search":         {query: "&q=archived-search", want: []uint{orders[3].ID, orders[4].ID}},
		"search keeps status":   {query: "&q=archived-search&status=preparing", want: []uint{}},
	} {
		t.Run(name, func(t *testing.T) {
			if got := listIDs(test.query); fmt.Sprint(got) != fmt.Sprint(test.want) {
				t.Fatalf("order IDs = %v, want %v", got, test.want)
			}
		})
	}
	output := list("")
	if output.ActiveCount != 3 || output.ArchivedCount != 2 || output.HasMore || output.Orders[0].UpdatedAt.IsZero() {
		t.Fatalf("unexpected list metadata: %#v", output)
	}
	for _, query := range []string{"&sort=oldest", "&view=finished", "&offset=-1"} {
		if response := request(e, http.MethodGet, fmt.Sprintf("/api/orders?shopId=%d%s", shop.ID, query), "", "", cookie); response.Code != http.StatusBadRequest {
			t.Fatalf("invalid list query %q returned %d", query, response.Code)
		}
	}
}

func TestOrderListPagination(t *testing.T) {
	db, e, _, _ := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var shop Shop
	if err := db.First(&shop).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	orders := make([]Order, 21)
	for i := range orders {
		key := fmt.Sprintf("page-%d", i)
		orders[i] = Order{CreateKey: key, CreateFingerprint: key, SecretToken: key, ShopID: shop.ID, Amount: int64(i + 1), EstimatedDeliveryDate: now.Format("2006-01-02"), Status: "preparing", CreatedAt: now.Add(time.Duration(i) * time.Minute)}
	}
	if err := db.Create(&orders).Error; err != nil {
		t.Fatal(err)
	}

	page := func(offset int) ([]uint, bool) {
		t.Helper()
		response := request(e, http.MethodGet, fmt.Sprintf("/api/orders?shopId=%d&offset=%d", shop.ID, offset), "", "", cookie)
		if response.Code != http.StatusOK {
			t.Fatalf("list returned %d: %s", response.Code, response.Body.String())
		}
		var output struct {
			Orders []struct {
				ID uint `json:"id"`
			} `json:"orders"`
			HasMore bool `json:"hasMore"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &output); err != nil {
			t.Fatal(err)
		}
		ids := make([]uint, len(output.Orders))
		for i, order := range output.Orders {
			ids[i] = order.ID
		}
		return ids, output.HasMore
	}
	firstWant := make([]uint, 20)
	for i := range firstWant {
		firstWant[i] = orders[20-i].ID
	}
	if ids, more := page(0); fmt.Sprint(ids) != fmt.Sprint(firstWant) || !more {
		t.Fatalf("first page = %v, hasMore %v", ids, more)
	}
	if ids, more := page(20); fmt.Sprint(ids) != fmt.Sprint([]uint{orders[0].ID}) || more {
		t.Fatalf("second page = %v, hasMore %v", ids, more)
	}
}

func TestCancelStaleWaitingInfoOrders(t *testing.T) {
	db, _, _, _ := newAuthTestServer(t)
	var shop Shop
	if err := db.First(&shop).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	orders := []Order{
		{CreateKey: "expiry-stale", CreateFingerprint: "expiry-stale", SecretToken: "expiry-stale", ShopID: shop.ID, Amount: 100, EstimatedDeliveryDate: now.Format("2006-01-02"), Status: waitingInfoStatus, CreatedAt: now.Add(-staleWaitingInfoAge)},
		{CreateKey: "expiry-fresh", CreateFingerprint: "expiry-fresh", SecretToken: "expiry-fresh", ShopID: shop.ID, Amount: 100, EstimatedDeliveryDate: now.Format("2006-01-02"), Status: waitingInfoStatus, CreatedAt: now.Add(-staleWaitingInfoAge + time.Second)},
		{CreateKey: "expiry-payment", CreateFingerprint: "expiry-payment", SecretToken: "expiry-payment", ShopID: shop.ID, Amount: 100, EstimatedDeliveryDate: now.Format("2006-01-02"), Status: waitingPaymentStatus, CreatedAt: now.Add(-2 * staleWaitingInfoAge)},
	}
	if err := db.Create(&orders).Error; err != nil {
		t.Fatal(err)
	}

	count, err := cancelStaleWaitingInfoOrders(db, now)
	if err != nil || count != 1 {
		t.Fatalf("cancelled %d orders, error %v", count, err)
	}
	var updated []Order
	if err := db.Where("id IN ?", []uint{orders[0].ID, orders[1].ID, orders[2].ID}).Order("id").Find(&updated).Error; err != nil {
		t.Fatal(err)
	}
	if len(updated) != 3 || updated[0].Status != "cancelled" || updated[1].Status != waitingInfoStatus || updated[2].Status != waitingPaymentStatus {
		t.Fatalf("unexpected expiry statuses: %#v", updated)
	}
	var history []OrderStatusHistory
	if err := db.Where("order_id = ?", orders[0].ID).Find(&history).Error; err != nil {
		t.Fatal(err)
	}
	if len(history) != 1 || history[0].PreviousStatus != waitingInfoStatus || history[0].NewStatus != "cancelled" || history[0].ChangedByAdminID != nil {
		t.Fatalf("unexpected expiry history: %#v", history)
	}
	if count, err := cancelStaleWaitingInfoOrders(db, now); err != nil || count != 0 {
		t.Fatalf("repeat cancelled %d orders, error %v", count, err)
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
