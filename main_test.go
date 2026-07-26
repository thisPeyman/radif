package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAPIRoutes(t *testing.T) {
	e := newServer()

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
