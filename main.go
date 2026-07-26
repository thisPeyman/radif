package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"gorm.io/gorm"
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

	cfg, err := loadConfig()
	if err != nil {
		log.Fatal(err)
	}
	e := newServer(db, cfg)
	e.Logger.Fatal(e.Start(":8080"))
}

func newServer(db *gorm.DB, cfg config) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.IPExtractor = echo.ExtractIPFromRealIPHeader(echo.TrustLoopback(true), echo.TrustPrivateNet(true))
	e.HTTPErrorHandler = apiErrorHandler
	e.Use(middleware.Recover())
	e.Use(middleware.SecureWithConfig(middleware.SecureConfig{
		ContentTypeNosniff:    "nosniff",
		XFrameOptions:         "DENY",
		ContentSecurityPolicy: "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'",
		ReferrerPolicy:        "no-referrer",
	}))

	e.GET("/api/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})
	limiter := newLoginLimiter()
	origin := requireOrigin(cfg.appOrigin)
	e.POST("/api/session", login(db, cfg, limiter), origin)
	e.DELETE("/api/session", logout(db, cfg), origin)
	e.GET("/api/me", me(db), requireAdmin(db, cfg))
	e.GET("/api/shops/:shopID/products", products(db), requireAdmin(db, cfg), requireShopOwner(db))
	e.POST("/api/orders", createOrder(db, cfg), requireAdmin(db, cfg), origin)
	e.POST("/api/orders/:orderID/link-copied", recordLinkCopied(db), requireAdmin(db, cfg), origin)

	e.Use(middleware.StaticWithConfig(middleware.StaticConfig{
		Skipper: func(c echo.Context) bool {
			return strings.HasPrefix(c.Request().URL.Path, "/api/")
		},
		Root:  "web/dist",
		HTML5: true,
	}))

	return e
}

func apiErrorHandler(err error, c echo.Context) {
	if c.Response().Committed {
		return
	}

	code := http.StatusInternalServerError
	message := "خطایی رخ داد. دوباره تلاش کنید."
	var httpError *echo.HTTPError
	if errors.As(err, &httpError) {
		code = httpError.Code
		if text, ok := httpError.Message.(string); ok {
			message = text
		} else {
			switch code {
			case http.StatusNotFound:
				message = "صفحه یا اطلاعات درخواستی پیدا نشد."
			case http.StatusMethodNotAllowed:
				message = "این درخواست پشتیبانی نمی‌شود."
			}
		}
	}
	if code >= http.StatusInternalServerError {
		c.Logger().Error(err)
	}
	if err := c.JSON(code, map[string]string{"error": message}); err != nil {
		c.Logger().Error(err)
	}
}
