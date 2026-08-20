package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

func captchaConfig(cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"siteKey": cfg.hCaptchaSiteKey})
	}
}

func verifyHCaptcha(c echo.Context, cfg config, token string) error {
	if cfg.devOTPCode != "" {
		return nil
	}
	if token = strings.TrimSpace(token); token == "" || len(token) > 4096 {
		return echo.NewHTTPError(http.StatusBadRequest, "لطفاً تأیید کنید ربات نیستید.")
	}
	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()
	form := url.Values{"secret": {cfg.hCaptchaSecret}, "response": {token}, "remoteip": {c.RealIP()}, "sitekey": {cfg.hCaptchaSiteKey}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.hCaptchaVerifyURL, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationForm)
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "تأیید انسان بودن انجام نشد. دوباره تلاش کنید.")
	}
	defer response.Body.Close()
	var result struct {
		Success bool `json:"success"`
	}
	if response.StatusCode != http.StatusOK || json.NewDecoder(response.Body).Decode(&result) != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "تأیید انسان بودن انجام نشد. دوباره تلاش کنید.")
	}
	if !result.Success {
		return echo.NewHTTPError(http.StatusBadRequest, "لطفاً تأیید کنید ربات نیستید.")
	}
	return nil
}
