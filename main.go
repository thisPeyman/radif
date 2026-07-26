package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	db, err := openDatabase(databasePath())
	if err != nil {
		log.Fatal(err)
	}

	if len(os.Args) > 1 {
		if os.Args[1] != "seed" {
			log.Fatalf("unknown command %q", os.Args[1])
		}
		if err := seed(db); err != nil {
			log.Fatal(err)
		}
		log.Print("seed completed")
		return
	}

	e := newServer()
	e.Logger.Fatal(e.Start(":8080"))
}

func newServer() *echo.Echo {
	e := echo.New()
	e.HideBanner = true

	e.GET("/api/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	e.Use(middleware.StaticWithConfig(middleware.StaticConfig{
		Skipper: func(c echo.Context) bool {
			return strings.HasPrefix(c.Request().URL.Path, "/api/")
		},
		Root:  "web/dist",
		HTML5: true,
	}))

	return e
}
