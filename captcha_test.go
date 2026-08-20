package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestHCaptchaVerification(t *testing.T) {
	forms := make(chan string, 1)
	verify := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		forms <- r.Form.Encode()
		_, _ = w.Write([]byte(`{"success":true}`))
	}))
	defer verify.Close()

	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.RemoteAddr = "192.0.2.10:1234"
	if err := verifyHCaptcha(e.NewContext(req, httptest.NewRecorder()), config{hCaptchaSiteKey: "site", hCaptchaSecret: "secret", hCaptchaVerifyURL: verify.URL}, "good"); err != nil {
		t.Fatal(err)
	}
	if got := <-forms; got != "remoteip=192.0.2.10&response=good&secret=secret&sitekey=site" {
		t.Fatalf("verification form = %v", got)
	}
	if err := verifyHCaptcha(e.NewContext(req, httptest.NewRecorder()), config{hCaptchaSiteKey: "site", hCaptchaSecret: "secret", hCaptchaVerifyURL: verify.URL}, ""); echoErrCode(err) != http.StatusBadRequest {
		t.Fatalf("missing token error = %#v", err)
	}
}

func TestHCaptchaRejectsFailure(t *testing.T) {
	verify := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(`{"success":false}`)) }))
	defer verify.Close()
	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.RemoteAddr = "192.0.2.10:1234"
	err := verifyHCaptcha(e.NewContext(req, httptest.NewRecorder()), config{hCaptchaSiteKey: "site", hCaptchaSecret: "secret", hCaptchaVerifyURL: verify.URL}, "bad")
	if echoErrCode(err) != http.StatusBadRequest {
		t.Fatalf("invalid token error = %#v", err)
	}
}

func TestHCaptchaConfiguration(t *testing.T) {
	t.Setenv("APP_ORIGIN", "https://radif.test")
	t.Setenv("DEV_OTP_CODE", "")
	t.Setenv("HCAPTCHA_SITE_KEY", "")
	t.Setenv("HCAPTCHA_SECRET", "")
	if _, err := loadConfig(); err == nil {
		t.Fatal("configuration without hCaptcha keys succeeded")
	}
	t.Setenv("HCAPTCHA_SITE_KEY", "site")
	t.Setenv("HCAPTCHA_SECRET", "secret")
	if _, err := loadConfig(); err != nil {
		t.Fatalf("configuration with hCaptcha keys failed: %v", err)
	}
}

func echoErrCode(err error) int {
	if httpErr, ok := err.(*echo.HTTPError); ok {
		return httpErr.Code
	}
	return 0
}
