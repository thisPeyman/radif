package main

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type config struct {
	appOrigin           string
	sessionLifetime     time.Duration
	secureCookies       bool
	receiptDir          string
	productImageDir     string
	maxReceiptBytes     int64
	melipayamakUsername string
	melipayamakPassword string
	melipayamakBodyID   string
	devOTPCode          string
}

func dataDir() string {
	if value := os.Getenv("DATA_DIR"); value != "" {
		return value
	}
	return "data"
}

func loadConfig() (config, error) {
	origin := strings.TrimSuffix(os.Getenv("APP_ORIGIN"), "/")
	if origin == "" {
		origin = "http://localhost:8080"
	}
	parsedOrigin, err := url.Parse(origin)
	if err != nil || (parsedOrigin.Scheme != "http" && parsedOrigin.Scheme != "https") || parsedOrigin.Host == "" || parsedOrigin.Path != "" || parsedOrigin.RawQuery != "" || parsedOrigin.Fragment != "" || parsedOrigin.User != nil {
		return config{}, fmt.Errorf("APP_ORIGIN must be an HTTP origin without a path")
	}

	lifetime := 30 * 24 * time.Hour
	if value := os.Getenv("SESSION_LIFETIME"); value != "" {
		lifetime, err = time.ParseDuration(value)
		if err != nil || lifetime <= 0 {
			return config{}, fmt.Errorf("SESSION_LIFETIME must be a positive Go duration")
		}
	}

	secureCookies := false
	if value := os.Getenv("COOKIE_SECURE"); value != "" {
		secureCookies, err = strconv.ParseBool(value)
		if err != nil {
			return config{}, fmt.Errorf("COOKIE_SECURE must be true or false")
		}
	}

	maxReceiptBytes := int64(5 << 20)
	if value := os.Getenv("MAX_RECEIPT_BYTES"); value != "" {
		maxReceiptBytes, err = strconv.ParseInt(value, 10, 64)
		if err != nil || maxReceiptBytes <= 0 {
			return config{}, fmt.Errorf("MAX_RECEIPT_BYTES must be a positive integer")
		}
	}

	devOTPCode := os.Getenv("DEV_OTP_CODE")
	if devOTPCode != "" && len(normalizeDigits(devOTPCode)) != 6 {
		return config{}, fmt.Errorf("DEV_OTP_CODE must be six digits")
	}

	return config{
		appOrigin:           origin,
		sessionLifetime:     lifetime,
		secureCookies:       secureCookies,
		receiptDir:          filepath.Join(dataDir(), "receipts"),
		productImageDir:     filepath.Join(dataDir(), "product-images"),
		maxReceiptBytes:     maxReceiptBytes,
		melipayamakUsername: os.Getenv("MELIPAYAMAK_USERNAME"), melipayamakPassword: os.Getenv("MELIPAYAMAK_PASSWORD"), melipayamakBodyID: os.Getenv("MELIPAYAMAK_BODY_ID"),
		devOTPCode: normalizeDigits(devOTPCode),
	}, nil
}
