package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"gorm.io/gorm"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	command := ""
	if len(os.Args) > 1 {
		command = os.Args[1]
		if command != "seed" {
			return fmt.Errorf("unknown command %q", command)
		}
	}

	var cfg config
	var err error
	if command == "" {
		cfg, err = loadConfig()
		if err != nil {
			return err
		}
	}

	db, err := openDatabase(databaseURL())
	if err != nil {
		return err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("get database connection: %w", err)
	}
	defer sqlDB.Close()

	if command == "seed" {
		if err := seed(db); err != nil {
			return err
		}
		log.Print("seed completed")
		return nil
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	startStaleOrderCancellation(ctx, db)
	e := newServer(db, cfg)
	serverErr := make(chan error, 1)
	go func() { serverErr <- e.Start(":8080") }()

	select {
	case err := <-serverErr:
		if !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve HTTP: %w", err)
		}
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := e.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown HTTP server: %w", err)
		}
	}
	return nil
}

func startStaleOrderCancellation(ctx context.Context, db *gorm.DB) {
	cancel := func(now time.Time) {
		count, err := cancelStaleWaitingInfoOrders(db, now)
		if err != nil {
			log.Printf("cancel stale orders: %v", err)
		} else if count > 0 {
			log.Printf("cancelled %d stale orders", count)
		}
	}
	cancel(time.Now())
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case now := <-ticker.C:
				cancel(now)
			case <-ctx.Done():
				return
			}
		}
	}()
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
		ContentSecurityPolicy: "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'",
		ReferrerPolicy:        "no-referrer",
	}))

	e.GET("/api/health", func(c echo.Context) error {
		sqlDB, err := db.DB()
		if err != nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
		}
		ctx, cancel := context.WithTimeout(c.Request().Context(), 2*time.Second)
		defer cancel()
		if err := sqlDB.PingContext(ctx); err != nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
		}
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})
	limiter := newLoginLimiter()
	origin := requireOrigin(cfg.appOrigin)
	e.POST("/api/session", login(db, cfg, limiter), origin)
	e.DELETE("/api/session", logout(db, cfg), origin)
	e.GET("/api/me", me(db), requireAdmin(db, cfg))
	e.GET("/api/product-images/:file", getProductImage(cfg))
	e.GET("/api/shops/:shopID/products", products(db), requireAdmin(db, cfg), requireShopAccess(db))
	e.GET("/api/shops/:shopID/report", shopReport(db), requireAdmin(db, cfg), requireShopAccess(db))
	e.PATCH("/api/shops/:shopID/support", updateShopSupport(db), requireAdmin(db, cfg), requireShopAccess(db), origin)
	e.POST("/api/shops/:shopID/pilot-events", recordAdminPilotEvent(db), requireAdmin(db, cfg), requireShopAccess(db), origin)
	e.POST("/api/shops/:shopID/payment-cards", createPaymentCard(db), requireAdmin(db, cfg), requireShopAccess(db), origin)
	e.PATCH("/api/shops/:shopID/payment-cards/:cardID", updatePaymentCard(db), requireAdmin(db, cfg), requireShopAccess(db), origin)
	e.POST("/api/shops/:shopID/payment-cards/:cardID/activate", activatePaymentCard(db), requireAdmin(db, cfg), requireShopAccess(db), origin)
	e.POST("/api/shops/:shopID/products", createProduct(db, cfg), requireAdmin(db, cfg), requireShopAccess(db), origin)
	e.PATCH("/api/shops/:shopID/products/:productID", updateProduct(db, cfg), requireAdmin(db, cfg), requireShopAccess(db), origin)
	e.DELETE("/api/shops/:shopID/products/:productID", archiveProduct(db), requireAdmin(db, cfg), requireShopAccess(db), origin)
	e.POST("/api/shops/:shopID/products/:productID/activate", activateProduct(db), requireAdmin(db, cfg), requireShopAccess(db), origin)
	e.POST("/api/orders", createOrder(db, cfg), requireAdmin(db, cfg), origin)
	e.POST("/api/orders/import", importHistoricalOrder(db, cfg), requireAdmin(db, cfg), origin)
	e.GET("/api/orders", listOrders(db), requireAdmin(db, cfg))
	e.GET("/api/orders/:orderID", getOrder(db, cfg), requireAdmin(db, cfg))
	e.PATCH("/api/orders/:orderID", updateOrder(db, cfg), requireAdmin(db, cfg), origin)
	e.GET("/api/orders/:orderID/receipt", getOrderReceipt(db, cfg), requireAdmin(db, cfg))
	e.POST("/api/orders/:orderID/final-payment/request", requestFinalPayment(db, cfg), requireAdmin(db, cfg), origin)
	e.POST("/api/orders/:orderID/final-payment/confirm", confirmFinalPayment(db, cfg), requireAdmin(db, cfg), origin)
	e.GET("/api/orders/:orderID/final-payment/receipt", getFinalPaymentReceipt(db, cfg), requireAdmin(db, cfg))
	e.POST("/api/orders/:orderID/link-copied", recordLinkCopied(db), requireAdmin(db, cfg), origin)
	e.POST("/api/orders/:orderID/customer-link/rotate", rotateCustomerLink(db, cfg), requireAdmin(db, cfg), origin)
	e.GET("/api/o/:token", publicOrder(db))
	e.POST("/api/o/:token/support-click", recordPublicSupportClick(db), origin)
	e.POST("/api/o/:token/pilot-events", recordPublicPilotEvent(db), origin)
	e.POST("/api/o/:token/details", submitCustomerDetails(db, cfg), origin)
	e.POST("/api/o/:token/final-payment/receipt", submitFinalReceipt(db, cfg), origin)

	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			path := c.Request().URL.Path
			if !strings.HasPrefix(path, "/api/") && (path == "/sw.js" || path == "/manifest.webmanifest" || strings.Contains(c.Request().Header.Get(echo.HeaderAccept), echo.MIMETextHTML)) {
				c.Response().Header().Set(echo.HeaderCacheControl, "no-cache")
			}
			return next(c)
		}
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
