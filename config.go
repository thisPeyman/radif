package main

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type config struct {
	appOrigin       string
	sessionLifetime time.Duration
	secureCookies   bool
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

	return config{
		appOrigin:       origin,
		sessionLifetime: lifetime,
		secureCookies:   secureCookies,
	}, nil
}
