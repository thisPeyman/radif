package main

import (
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
	db, err := openDatabase(filepath.Join(testDir, "app.db"))
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := seed(db); err != nil {
		t.Fatal(err)
	}

	var admin Admin
	if err := db.First(&admin, "login = ?", "admin").Error; err != nil {
		t.Fatal(err)
	}
	cfg := config{appOrigin: testOrigin, sessionLifetime: time.Hour, secureCookies: true, receiptDir: filepath.Join(testDir, "receipts"), maxReceiptBytes: 1 << 20}
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

func TestShopOwnership(t *testing.T) {
	db, e, cfg, _ := newAuthTestServer(t)
	var ownShop Shop
	if err := db.First(&ownShop).Error; err != nil {
		t.Fatal(err)
	}
	otherAdmin := Admin{Name: "مدیر دیگر", Login: "other", PasswordHash: "unused", Active: true}
	if err := db.Create(&otherAdmin).Error; err != nil {
		t.Fatal(err)
	}
	otherShop := Shop{OwnerAdminID: otherAdmin.ID, Name: "فروشگاه دیگر", PaymentInstructions: "آزمایشی", Active: true}
	if err := db.Create(&otherShop).Error; err != nil {
		t.Fatal(err)
	}

	e.GET("/api/test/shops/:shopID", func(c echo.Context) error {
		return c.NoContent(http.StatusNoContent)
	}, requireAdmin(db, cfg), requireShopOwner(db))
	cookie := loginCookie(t, e)

	for shopID, want := range map[uint]int{ownShop.ID: http.StatusNoContent, otherShop.ID: http.StatusNotFound} {
		response := request(e, http.MethodGet, fmt.Sprintf("/api/test/shops/%d", shopID), "", "", cookie)
		if response.Code != want {
			t.Errorf("shop %d returned %d, want %d", shopID, response.Code, want)
		}
	}
}
