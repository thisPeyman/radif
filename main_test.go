package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestAPIRoutes(t *testing.T) {
	e := newServer(openTestDatabase(t), config{})

	for path, want := range map[string]int{
		"/api/health":  http.StatusOK,
		"/api/missing": http.StatusNotFound,
	} {
		recorder := httptest.NewRecorder()
		e.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		if recorder.Code != want {
			t.Errorf("GET %s returned %d, want %d", path, recorder.Code, want)
		}
	}
}

func TestPWAFilesRevalidate(t *testing.T) {
	e := newServer(openTestDatabase(t), config{})

	for _, request := range []*http.Request{
		httptest.NewRequest(http.MethodGet, "/sw.js", nil),
		httptest.NewRequest(http.MethodGet, "/manifest.webmanifest", nil),
		httptest.NewRequest(http.MethodGet, "/orders/new", nil),
	} {
		if request.URL.Path == "/orders/new" {
			request.Header.Set(echo.HeaderAccept, echo.MIMETextHTML)
		}
		response := httptest.NewRecorder()
		e.ServeHTTP(response, request)
		if got := response.Header().Get(echo.HeaderCacheControl); got != "no-cache" {
			t.Errorf("GET %s returned Cache-Control %q", request.URL.Path, got)
		}
	}
}
