package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

const testOrigin = "https://radif.test"

func newAuthTestServer(t *testing.T) (*gorm.DB, *echo.Echo, config, Admin) {
	t.Helper()
	t.Setenv("SEED_ADMIN_LOGIN", "admin")
	t.Setenv("SEED_ADMIN_PASSWORD", "test-password")
	t.Setenv("SEED_ADMIN_NAME", "مدیر آزمایشی")

	testDir := t.TempDir()
	db := openTestDatabase(t)
	if err := seed(db); err != nil {
		t.Fatal(err)
	}

	var admin Admin
	if err := db.First(&admin, "login = ?", "admin").Error; err != nil {
		t.Fatal(err)
	}
	shop := Shop{Name: "خانه آبی", LogoPath: "/images/shop-blue.svg", PaymentCardNumber: "6037991812345678", PaymentInstructions: "به نام فروشگاه خانه آبی", Active: true}
	if err := db.Create(&shop).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&ShopPaymentCard{ShopID: shop.ID, CardNumber: shop.PaymentCardNumber, PaymentInstructions: shop.PaymentInstructions}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&AdminShop{AdminID: admin.ID, ShopID: shop.ID}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create([]Product{
		{ShopID: shop.ID, Name: "شمع موج", MainImagePath: "/images/product-blue.svg", DefaultPrice: 420_000, Active: true},
		{ShopID: shop.ID, Name: "گلدان صدف", MainImagePath: "/images/product-saffron.svg", DefaultPrice: 680_000, Active: true},
	}).Error; err != nil {
		t.Fatal(err)
	}
	cfg := config{
		appOrigin: testOrigin, sessionLifetime: time.Hour, secureCookies: true,
		receiptDir: filepath.Join(testDir, "receipts"), productImageDir: filepath.Join(testDir, "product-images"), maxReceiptBytes: 1 << 20,
	}
	return db, newServer(db, cfg), cfg, admin
}

func request(e *echo.Echo, method, path, body, origin string, cookie *http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.RemoteAddr = "192.0.2.10:1234"
	if body != "" {
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
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

func loginCookie(t *testing.T, e *echo.Echo) *http.Cookie {
	t.Helper()
	recorder := request(e, http.MethodPost, "/api/session", `{"login":"admin","password":"test-password"}`, testOrigin, nil)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("login returned %d: %s", recorder.Code, recorder.Body.String())
	}
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == sessionCookieName {
			return cookie
		}
	}
	t.Fatal("login did not set a session cookie")
	return nil
}

func TestSessionLifecycle(t *testing.T) {
	db, e, _, _ := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode {
		t.Fatalf("insecure session cookie: %#v", cookie)
	}

	var session Session
	if err := db.First(&session).Error; err != nil {
		t.Fatal(err)
	}
	if session.TokenHash == cookie.Value || session.TokenHash != hashToken(cookie.Value) {
		t.Fatal("database did not contain only the session token hash")
	}

	meResponse := request(e, http.MethodGet, "/api/me", "", "", cookie)
	if meResponse.Code != http.StatusOK {
		t.Fatalf("me returned %d: %s", meResponse.Code, meResponse.Body.String())
	}
	if body := meResponse.Body.String(); strings.Contains(body, "password") || strings.Contains(body, "session") || !strings.Contains(body, "خانه آبی") {
		t.Fatalf("unexpected me response: %s", body)
	}
	if csp := meResponse.Header().Get(echo.HeaderContentSecurityPolicy); !strings.Contains(csp, "img-src 'self' data: blob:") || meResponse.Header().Get(echo.HeaderXContentTypeOptions) != "nosniff" {
		t.Fatal("security headers are missing")
	}

	logoutResponse := request(e, http.MethodDelete, "/api/session", "", testOrigin, cookie)
	if logoutResponse.Code != http.StatusNoContent {
		t.Fatalf("logout returned %d", logoutResponse.Code)
	}
	var sessions int64
	if err := db.Model(&Session{}).Count(&sessions).Error; err != nil || sessions != 0 {
		t.Fatalf("session count after logout = %d, error = %v", sessions, err)
	}
	if response := request(e, http.MethodGet, "/api/me", "", "", cookie); response.Code != http.StatusUnauthorized {
		t.Fatalf("logged-out session returned %d", response.Code)
	}
}

func TestAuthenticationRejections(t *testing.T) {
	db, e, _, admin := newAuthTestServer(t)
	if response := request(e, http.MethodGet, "/api/me", "", "", nil); response.Code != http.StatusUnauthorized {
		t.Fatalf("missing session returned %d", response.Code)
	}
	if response := request(e, http.MethodPost, "/api/session", `{}`, "https://wrong.test", nil); response.Code != http.StatusForbidden {
		t.Fatalf("invalid origin returned %d", response.Code)
	}

	expiredCookie := loginCookie(t, e)
	if err := db.Model(&Session{}).Where("token_hash = ?", hashToken(expiredCookie.Value)).Update("expires_at", time.Now().Add(-time.Minute)).Error; err != nil {
		t.Fatal(err)
	}
	if response := request(e, http.MethodGet, "/api/me", "", "", expiredCookie); response.Code != http.StatusUnauthorized {
		t.Fatalf("expired session returned %d", response.Code)
	}
	var expiredCount int64
	if err := db.Model(&Session{}).Where("token_hash = ?", hashToken(expiredCookie.Value)).Count(&expiredCount).Error; err != nil || expiredCount != 0 {
		t.Fatalf("expired session count = %d, error = %v", expiredCount, err)
	}

	inactiveCookie := loginCookie(t, e)
	if err := db.Model(&Admin{}).Where("id = ?", admin.ID).Update("active", false).Error; err != nil {
		t.Fatal(err)
	}
	if response := request(e, http.MethodGet, "/api/me", "", "", inactiveCookie); response.Code != http.StatusUnauthorized {
		t.Fatalf("inactive admin session returned %d", response.Code)
	}
}

func TestLoginThrottling(t *testing.T) {
	_, e, _, _ := newAuthTestServer(t)
	for attempt := 1; attempt <= 6; attempt++ {
		response := request(e, http.MethodPost, "/api/session", `{"login":"admin","password":"wrong"}`, testOrigin, nil)
		want := http.StatusUnauthorized
		if attempt == 6 {
			want = http.StatusTooManyRequests
		}
		if response.Code != want {
			t.Fatalf("attempt %d returned %d, want %d", attempt, response.Code, want)
		}
	}
}

func TestShopAccess(t *testing.T) {
	db, e, cfg, _ := newAuthTestServer(t)
	var ownShop Shop
	if err := db.First(&ownShop).Error; err != nil {
		t.Fatal(err)
	}
	otherAdmin := Admin{Name: "مدیر دیگر", Login: "other", PasswordHash: "unused", Active: true}
	if err := db.Create(&otherAdmin).Error; err != nil {
		t.Fatal(err)
	}
	otherShop := Shop{Name: "فروشگاه دیگر", PaymentCardNumber: "6037991812345678", PaymentInstructions: "آزمایشی", Active: true}
	if err := db.Create(&otherShop).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&AdminShop{AdminID: otherAdmin.ID, ShopID: otherShop.ID}).Error; err != nil {
		t.Fatal(err)
	}

	e.GET("/api/test/shops/:shopID", func(c echo.Context) error {
		return c.NoContent(http.StatusNoContent)
	}, requireAdmin(db, cfg), requireShopAccess(db))
	cookie := loginCookie(t, e)

	for shopID, want := range map[uint]int{ownShop.ID: http.StatusNoContent, otherShop.ID: http.StatusNotFound} {
		response := request(e, http.MethodGet, fmt.Sprintf("/api/test/shops/%d", shopID), "", "", cookie)
		if response.Code != want {
			t.Errorf("shop %d returned %d, want %d", shopID, response.Code, want)
		}
	}

	// Grant admin access to otherAdmin's shop
	if err := db.Create(&AdminShop{AdminID: 1, ShopID: otherShop.ID}).Error; err != nil {
		t.Fatal(err)
	}
	response := request(e, http.MethodGet, fmt.Sprintf("/api/test/shops/%d", otherShop.ID), "", "", cookie)
	if response.Code != http.StatusNoContent {
		t.Errorf("shared shop access returned %d, want %d", response.Code, http.StatusNoContent)
	}
}

func TestUpdateShopSupport(t *testing.T) {
	db, e, _, _ := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var shop Shop
	if err := db.First(&shop).Error; err != nil {
		t.Fatal(err)
	}
	path := fmt.Sprintf("/api/shops/%d/support", shop.ID)

	if response := request(e, http.MethodPatch, path, `{"whatsappNumber":"۰۹۱۲ ۳۴۵ ۶۷۸۹","supportChannel":"whatsapp"}`, "https://wrong.test", cookie); response.Code != http.StatusForbidden {
		t.Fatalf("wrong origin returned %d", response.Code)
	}
	if response := request(e, http.MethodPatch, path, `{"supportChannel":"instagram"}`, testOrigin, cookie); response.Code != http.StatusBadRequest {
		t.Fatalf("missing selected contact returned %d: %s", response.Code, response.Body.String())
	}
	if response := request(e, http.MethodPatch, path, `{"shareMessageTemplate":"بدون لینک"}`, testOrigin, cookie); response.Code != http.StatusBadRequest {
		t.Fatalf("template without customer URL returned %d: %s", response.Code, response.Body.String())
	}
	tooLong := strings.Repeat("x", 1001) + "{customerUrl}"
	if response := request(e, http.MethodPatch, path, fmt.Sprintf(`{"shareMessageTemplate":%q}`, tooLong), testOrigin, cookie); response.Code != http.StatusBadRequest {
		t.Fatalf("oversized template returned %d: %s", response.Code, response.Body.String())
	}
	response := request(e, http.MethodPatch, path, `{"instagramUsername":" @blue.shop ","whatsappNumber":"۰۹۱۲ ۳۴۵ ۶۷۸۹","supportChannel":"whatsapp","shareMessageTemplate":"سفارش {orderCode}\n{customerUrl}"}`, testOrigin, cookie)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"whatsappNumber":"989123456789"`) || !strings.Contains(response.Body.String(), `"shareMessageTemplate":"سفارش {orderCode}\n{customerUrl}"`) {
		t.Fatalf("support update returned %d: %s", response.Code, response.Body.String())
	}
	if err := db.First(&shop, shop.ID).Error; err != nil || shop.InstagramUsername != "blue.shop" || shop.WhatsAppNumber != "989123456789" || shop.SupportChannel != "whatsapp" || shop.ShareMessageTemplate != "سفارش {orderCode}\n{customerUrl}" {
		t.Fatalf("unexpected stored support: %#v, error %v", shop, err)
	}
	response = request(e, http.MethodPatch, path, `{"instagramUsername":"blue.shop","whatsappNumber":"989123456789","supportChannel":"whatsapp"}`, testOrigin, cookie)
	if response.Code != http.StatusOK {
		t.Fatalf("support-only update returned %d: %s", response.Code, response.Body.String())
	}
	if err := db.First(&shop, shop.ID).Error; err != nil || shop.ShareMessageTemplate != "سفارش {orderCode}\n{customerUrl}" {
		t.Fatalf("support-only update cleared template: %#v, error %v", shop, err)
	}
	meResponse := request(e, http.MethodGet, "/api/me", "", "", cookie)
	if meResponse.Code != http.StatusOK || !strings.Contains(meResponse.Body.String(), `"supportChannel":"whatsapp"`) || !strings.Contains(meResponse.Body.String(), `"shareMessageTemplate":"سفارش {orderCode}\n{customerUrl}"`) {
		t.Fatalf("me did not include support settings: %s", meResponse.Body.String())
	}
	response = request(e, http.MethodPatch, path, `{"instagramUsername":"blue.shop","whatsappNumber":"989123456789","supportChannel":"whatsapp","shareMessageTemplate":""}`, testOrigin, cookie)
	if response.Code != http.StatusOK {
		t.Fatalf("clearing template returned %d: %s", response.Code, response.Body.String())
	}
	if err := db.First(&shop, shop.ID).Error; err != nil || shop.ShareMessageTemplate != "" {
		t.Fatalf("template was not cleared: %#v, error %v", shop, err)
	}
	if response := request(e, http.MethodPatch, "/api/shops/999999/support", `{}`, testOrigin, cookie); response.Code != http.StatusNotFound {
		t.Fatalf("unowned shop update returned %d", response.Code)
	}
}

func TestManageShopPaymentCards(t *testing.T) {
	db, e, _, _ := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var shop Shop
	if err := db.First(&shop).Error; err != nil {
		t.Fatal(err)
	}
	path := fmt.Sprintf("/api/shops/%d/payment-cards", shop.ID)
	body := `{"cardNumber":"۵۰۲۲ ۲۹۱۰ ۱۲۳۴ ۵۶۷۸","paymentInstructions":" به نام حساب دوم "}`
	if response := request(e, http.MethodPost, path, body, "https://wrong.test", cookie); response.Code != http.StatusForbidden {
		t.Fatalf("wrong-origin card add returned %d", response.Code)
	}
	if response := request(e, http.MethodPost, path, `{"cardNumber":"card 5022 2910 1234 5678","paymentInstructions":"test"}`, testOrigin, cookie); response.Code != http.StatusBadRequest {
		t.Fatalf("card number with text returned %d: %s", response.Code, response.Body.String())
	}
	response := request(e, http.MethodPost, path, body, testOrigin, cookie)
	if response.Code != http.StatusCreated || !strings.Contains(response.Body.String(), `"cardNumber":"5022291012345678"`) || !strings.Contains(response.Body.String(), `"active":false`) {
		t.Fatalf("card add returned %d: %s", response.Code, response.Body.String())
	}
	var card paymentCardResponse
	if err := json.Unmarshal(response.Body.Bytes(), &card); err != nil {
		t.Fatal(err)
	}
	if duplicate := request(e, http.MethodPost, path, body, testOrigin, cookie); duplicate.Code != http.StatusConflict {
		t.Fatalf("duplicate card returned %d: %s", duplicate.Code, duplicate.Body.String())
	}
	otherShop := Shop{Name: "فروشگاه کارت دیگر", PaymentCardNumber: "5892101012345678", PaymentInstructions: "دیگر", Active: true}
	if err := db.Create(&otherShop).Error; err != nil {
		t.Fatal(err)
	}
	otherCard := ShopPaymentCard{ShopID: otherShop.ID, CardNumber: otherShop.PaymentCardNumber, PaymentInstructions: otherShop.PaymentInstructions}
	if err := db.Create(&otherCard).Error; err != nil {
		t.Fatal(err)
	}
	if hidden := request(e, http.MethodPatch, fmt.Sprintf("%s/%d", path, otherCard.ID), `{"paymentInstructions":"نباید تغییر کند"}`, testOrigin, cookie); hidden.Code != http.StatusNotFound {
		t.Fatalf("cross-shop card edit returned %d: %s", hidden.Code, hidden.Body.String())
	}
	cardPath := fmt.Sprintf("%s/%d", path, card.ID)
	response = request(e, http.MethodPatch, cardPath, `{"paymentInstructions":"توضیحات ویرایش‌شده"}`, testOrigin, cookie)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "توضیحات ویرایش‌شده") {
		t.Fatalf("card edit returned %d: %s", response.Code, response.Body.String())
	}
	response = request(e, http.MethodPost, cardPath+"/activate", "", testOrigin, cookie)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"active":true`) {
		t.Fatalf("card activation returned %d: %s", response.Code, response.Body.String())
	}
	if err := db.First(&shop, shop.ID).Error; err != nil || shop.PaymentCardNumber != card.CardNumber || shop.PaymentInstructions != "توضیحات ویرایش‌شده" {
		t.Fatalf("active shop payment profile = %#v, error %v", shop, err)
	}
	response = request(e, http.MethodPatch, cardPath, `{"paymentInstructions":"توضیحات آینده"}`, testOrigin, cookie)
	if response.Code != http.StatusOK {
		t.Fatalf("active card edit returned %d: %s", response.Code, response.Body.String())
	}
	if err := db.First(&shop, shop.ID).Error; err != nil || shop.PaymentInstructions != "توضیحات آینده" {
		t.Fatalf("active instructions were not projected to shop: %#v, error %v", shop, err)
	}
	meResponse := request(e, http.MethodGet, "/api/me", "", "", cookie)
	if meResponse.Code != http.StatusOK || !strings.Contains(meResponse.Body.String(), `"cardNumber":"5022291012345678","paymentInstructions":"توضیحات آینده","active":true`) {
		t.Fatalf("me did not include active payment card: %s", meResponse.Body.String())
	}
}
