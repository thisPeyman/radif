package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestPilotEventCollection(t *testing.T) {
	db, e, _, admin := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var product Product
	if err := db.First(&product).Error; err != nil {
		t.Fatal(err)
	}

	adminEventPath := fmt.Sprintf("/api/shops/%d/pilot-events", product.ShopID)
	for range 2 {
		response := request(e, http.MethodPost, adminEventPath, `{"eventName":"order_create_started","createKey":"pilot-journey"}`, testOrigin, cookie)
		if response.Code != http.StatusNoContent {
			t.Fatalf("creation start returned %d: %s", response.Code, response.Body.String())
		}
	}
	if response := request(e, http.MethodPost, adminEventPath, `{"eventName":"order_create_failed","createKey":"pilot-journey","eventKey":"failure-1","reason":"client_validation"}`, testOrigin, cookie); response.Code != http.StatusNoContent {
		t.Fatalf("creation failure returned %d: %s", response.Code, response.Body.String())
	}
	if response := request(e, http.MethodPost, adminEventPath, `{"eventName":"order_create_failed","createKey":"pilot-journey","eventKey":"failure-2","reason":"conflict"}`, testOrigin, cookie); response.Code != http.StatusNoContent {
		t.Fatalf("second creation failure returned %d: %s", response.Code, response.Body.String())
	}

	deliveryDate := time.Now().AddDate(0, 0, 7).Format("2006-01-02")
	createBody := fmt.Sprintf(`{"createKey":"pilot-journey","shopId":%d,"items":[{"productId":%d,"quantity":1}],"amount":420000,"estimatedDeliveryDate":%q,"salesChannel":"instagram","elapsedMs":900}`, product.ShopID, product.ID, deliveryDate)
	created := request(e, http.MethodPost, "/api/orders", createBody, testOrigin, cookie)
	if created.Code != http.StatusCreated {
		t.Fatalf("create returned %d: %s", created.Code, created.Body.String())
	}
	var output struct {
		ID          uint   `json:"id"`
		CustomerURL string `json:"customerUrl"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &output); err != nil {
		t.Fatal(err)
	}
	token := output.CustomerURL[strings.LastIndex(output.CustomerURL, "/")+1:]

	for range 2 {
		if response := request(e, http.MethodGet, "/api/o/"+token, "", "", nil); response.Code != http.StatusOK {
			t.Fatalf("public open returned %d: %s", response.Code, response.Body.String())
		}
	}
	publicEventPath := "/api/o/" + token + "/pilot-events"
	for range 2 {
		if response := request(e, http.MethodPost, publicEventPath, `{"eventName":"customer_form_started"}`, testOrigin, nil); response.Code != http.StatusNoContent {
			t.Fatalf("form start returned %d: %s", response.Code, response.Body.String())
		}
	}
	if response := request(e, http.MethodPost, publicEventPath, `{"eventName":"customer_submission_failed","eventKey":"submission-failure-1","reason":"client_validation"}`, testOrigin, nil); response.Code != http.StatusNoContent {
		t.Fatalf("submission failure returned %d: %s", response.Code, response.Body.String())
	}
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)
	if response := multipartRequest(e, http.MethodPost, "/api/o/"+token+"/details", validCustomerFields(), "receipt.png", png); response.Code != http.StatusOK {
		t.Fatalf("customer submission returned %d: %s", response.Code, response.Body.String())
	}
	if response := request(e, http.MethodPost, publicEventPath, `{"eventName":"customer_submission_failed","eventKey":"submission-failure-2","reason":"conflict"}`, testOrigin, nil); response.Code != http.StatusNoContent {
		t.Fatalf("closed-order submission failure returned %d: %s", response.Code, response.Body.String())
	}

	update := `{"status":"paid","shipmentTrackingCode":"TRACK-PII"}`
	if response := request(e, http.MethodPatch, fmt.Sprintf("/api/orders/%d", output.ID), update, testOrigin, cookie); response.Code != http.StatusOK {
		t.Fatalf("order update returned %d: %s", response.Code, response.Body.String())
	}
	copyBody := `{"method":"clipboard","source":"order_detail","eventKey":"copy-1"}`
	for range 2 {
		if response := request(e, http.MethodPost, fmt.Sprintf("/api/orders/%d/link-copied", output.ID), copyBody, testOrigin, cookie); response.Code != http.StatusNoContent {
			t.Fatalf("link copy returned %d: %s", response.Code, response.Body.String())
		}
	}
	for range 2 {
		if response := request(e, http.MethodGet, "/api/o/"+token, "", "", nil); response.Code != http.StatusOK {
			t.Fatalf("status view returned %d: %s", response.Code, response.Body.String())
		}
	}

	var events []PilotEvent
	if err := db.Order("id").Find(&events).Error; err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{}
	for _, event := range events {
		counts[event.EventName]++
		if strings.Contains(event.Metadata, token) || strings.Contains(event.Metadata, "09123456789") || strings.Contains(event.Metadata, "تهران") || strings.Contains(event.Metadata, "TRACK-PII") {
			t.Fatalf("event metadata contains private data: %#v", event)
		}
		if event.EventName != "admin_login" && event.ShopID == nil {
			t.Fatalf("event lacks shop attribution: %#v", event)
		}
	}
	for _, eventName := range []string{
		"admin_login", "order_create_started", "order_created", "public_order_opened",
		"customer_form_started", "customer_submitted",
		"tracking_added", "order_link_copied", "customer_status_viewed",
	} {
		if counts[eventName] != 1 {
			t.Errorf("%s count = %d, want 1", eventName, counts[eventName])
		}
	}
	if counts["order_status_changed"] != 2 {
		t.Errorf("order_status_changed count = %d, want 2", counts["order_status_changed"])
	}
	for _, eventName := range []string{"order_create_failed", "customer_submission_failed"} {
		if counts[eventName] != 2 {
			t.Errorf("%s count = %d, want 2", eventName, counts[eventName])
		}
	}
	var loginEvent PilotEvent
	if err := db.First(&loginEvent, "event_name = ?", "admin_login").Error; err != nil || loginEvent.AdminID == nil || *loginEvent.AdminID != admin.ID {
		t.Fatalf("unexpected login event: %#v, error %v", loginEvent, err)
	}
}

func TestPilotEventInputIsRestricted(t *testing.T) {
	db, e, _, _ := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var shop Shop
	if err := db.First(&shop).Error; err != nil {
		t.Fatal(err)
	}
	adminPath := fmt.Sprintf("/api/shops/%d/pilot-events", shop.ID)
	for _, test := range []struct {
		path string
		body string
	}{
		{adminPath, `{"eventName":"admin_password_changed","createKey":"x"}`},
		{adminPath, `{"eventName":"order_create_failed","createKey":"x","eventKey":"failure","reason":"password"}`},
	} {
		response := request(e, http.MethodPost, test.path, test.body, testOrigin, cookie)
		if response.Code != http.StatusBadRequest {
			t.Errorf("restricted event returned %d: %s", response.Code, response.Body.String())
		}
	}
	validAdminEvent := `{"eventName":"order_create_started","createKey":"origin-test"}`
	if response := request(e, http.MethodPost, adminPath, validAdminEvent, "https://wrong.test", cookie); response.Code != http.StatusForbidden {
		t.Errorf("wrong-origin admin event returned %d", response.Code)
	}
	order := createCustomerTestOrder(t, db, "pilot-event-token")
	publicBody := `{"eventName":"customer_form_started"}`
	if response := request(e, http.MethodPost, "/api/o/"+order.SecretToken+"/pilot-events", publicBody, "https://wrong.test", nil); response.Code != http.StatusForbidden {
		t.Errorf("wrong-origin public event returned %d", response.Code)
	}
	if response := request(e, http.MethodPost, "/api/o/wrong-token/pilot-events", publicBody, testOrigin, nil); response.Code != http.StatusNotFound {
		t.Errorf("wrong-token public event returned %d", response.Code)
	}
	for attempt := range maxPilotFailuresPerWindow + 5 {
		body := fmt.Sprintf(`{"eventName":"customer_submission_failed","eventKey":"attempt-%d","reason":"request"}`, attempt)
		if response := request(e, http.MethodPost, "/api/o/"+order.SecretToken+"/pilot-events", body, testOrigin, nil); response.Code != http.StatusNoContent {
			t.Fatalf("failure event %d returned %d: %s", attempt, response.Code, response.Body.String())
		}
	}
	var failureCount int64
	if err := db.Model(&PilotEvent{}).Where("order_id = ? AND event_name = ?", order.ID, "customer_submission_failed").Count(&failureCount).Error; err != nil || failureCount != maxPilotFailuresPerWindow {
		t.Errorf("capped failure count = %d, error %v", failureCount, err)
	}
}
