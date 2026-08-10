package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const (
	sessionCookieName = "radif_session"
	adminContextKey   = "admin"
	shopContextKey    = "shop"
)

type loginLimiter struct {
	mu       sync.Mutex
	attempts map[string]loginAttempt
}

type loginAttempt struct {
	failures     int
	firstFailure time.Time
	blockedUntil time.Time
}

var dummyPasswordHash = func() []byte {
	hash, err := bcrypt.GenerateFromPassword([]byte("invalid-login-password"), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	return hash
}()

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{attempts: make(map[string]loginAttempt)}
}

func (l *loginLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	attempt, exists := l.attempts[key]
	if !exists {
		return true
	}
	now := time.Now()
	if attempt.blockedUntil.After(now) {
		return false
	}
	if now.Sub(attempt.firstFailure) >= 15*time.Minute {
		delete(l.attempts, key)
	}
	return true
}

func (l *loginLimiter) fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	attempt := l.attempts[key]
	if attempt.firstFailure.IsZero() || now.Sub(attempt.firstFailure) >= 15*time.Minute {
		attempt = loginAttempt{firstFailure: now}
	}
	attempt.failures++
	if attempt.failures >= 5 {
		attempt.blockedUntil = now.Add(15 * time.Minute)
	}
	l.attempts[key] = attempt
}

func (l *loginLimiter) clear(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}

func login(db *gorm.DB, cfg config, limiter *loginLimiter) echo.HandlerFunc {
	return func(c echo.Context) error {
		key := c.RealIP()
		if !limiter.allow(key) {
			return echo.NewHTTPError(http.StatusTooManyRequests, "تعداد تلاش‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.")
		}

		var input struct {
			Login    string `json:"login"`
			Password string `json:"password"`
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, 16<<10)
		if err := json.NewDecoder(c.Request().Body).Decode(&input); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات ورود معتبر نیست.")
		}
		input.Login = strings.TrimSpace(input.Login)
		if input.Login == "" || input.Password == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "نام کاربری و رمز عبور الزامی است.")
		}

		var admin Admin
		err := db.Where("login = ? AND active = ?", input.Login, true).First(&admin).Error
		passwordHash := []byte(admin.PasswordHash)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			passwordHash = dummyPasswordHash
		}
		passwordErr := bcrypt.CompareHashAndPassword(passwordHash, []byte(input.Password))
		if errors.Is(err, gorm.ErrRecordNotFound) || (err == nil && passwordErr != nil) {
			limiter.fail(key)
			return echo.NewHTTPError(http.StatusUnauthorized, "نام کاربری یا رمز عبور نادرست است.")
		}
		if err != nil {
			return err
		}
		limiter.clear(key)

		if err := db.Where("expires_at <= ?", time.Now()).Delete(&Session{}).Error; err != nil {
			return err
		}
		token, err := newOpaqueToken()
		if err != nil {
			return err
		}
		tokenHash := hashToken(token)
		expiresAt := time.Now().Add(cfg.sessionLifetime)
		if err := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(&Session{TokenHash: tokenHash, AdminID: admin.ID, ExpiresAt: expiresAt}).Error; err != nil {
				return err
			}
			return recordPilotEvent(tx, PilotEvent{EventName: "admin_login", AdminID: &admin.ID}, map[string]any{"userAgent": pilotUserAgent(c)})
		}); err != nil {
			return err
		}

		setSessionCookie(c, token, expiresAt, cfg)
		return c.NoContent(http.StatusNoContent)
	}
}

func logout(db *gorm.DB, cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		if cookie, err := c.Cookie(sessionCookieName); err == nil {
			if err := db.Delete(&Session{}, "token_hash = ?", hashToken(cookie.Value)).Error; err != nil {
				return err
			}
		}
		clearSessionCookie(c, cfg)
		return c.NoContent(http.StatusNoContent)
	}
}

func me(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		admin := c.Get(adminContextKey).(*Admin)
		var shops []Shop
		if err := db.Preload("PaymentCards", func(query *gorm.DB) *gorm.DB { return query.Order("id") }).Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id").Where("admin_shops.admin_id = ? AND shops.active = ?", admin.ID, true).Order("shops.id").Find(&shops).Error; err != nil {
			return err
		}

		type publicShop struct {
			ID                   uint                  `json:"id"`
			Name                 string                `json:"name"`
			LogoPath             string                `json:"logoPath,omitempty"`
			ShortDescription     string                `json:"shortDescription,omitempty"`
			InstagramUsername    string                `json:"instagramUsername,omitempty"`
			WhatsAppNumber       string                `json:"whatsappNumber,omitempty"`
			SupportChannel       string                `json:"supportChannel,omitempty"`
			ShareMessageTemplate string                `json:"shareMessageTemplate,omitempty"`
			PaymentCards         []paymentCardResponse `json:"paymentCards"`
		}
		responseShops := make([]publicShop, len(shops))
		for i, shop := range shops {
			cards := make([]paymentCardResponse, len(shop.PaymentCards))
			for j, card := range shop.PaymentCards {
				cards[j] = paymentCardResponse{card.ID, card.CardNumber, card.PaymentInstructions, card.CardNumber == shop.PaymentCardNumber}
			}
			responseShops[i] = publicShop{shop.ID, shop.Name, shop.LogoPath, shop.ShortDescription, shop.InstagramUsername, shop.WhatsAppNumber, shop.SupportChannel, shop.ShareMessageTemplate, cards}
		}

		return c.JSON(http.StatusOK, map[string]any{
			"admin": map[string]any{"id": admin.ID, "name": admin.Name, "login": admin.Login},
			"shops": responseShops,
		})
	}
}

func updateShopSupport(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		var input struct {
			InstagramUsername    string  `json:"instagramUsername"`
			WhatsAppNumber       string  `json:"whatsappNumber"`
			SupportChannel       string  `json:"supportChannel"`
			ShareMessageTemplate *string `json:"shareMessageTemplate"`
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, 16<<10)
		if err := json.NewDecoder(c.Request().Body).Decode(&input); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات تماس معتبر نیست.")
		}

		instagram := strings.TrimPrefix(strings.TrimSpace(input.InstagramUsername), "@")
		if instagram != "" && !validInstagramUsername(instagram) {
			return echo.NewHTTPError(http.StatusBadRequest, "نام کاربری اینستاگرام معتبر نیست.")
		}
		whatsapp := ""
		if strings.TrimSpace(input.WhatsAppNumber) != "" {
			mobile := normalizeIranianMobile(input.WhatsAppNumber)
			if len(mobile) != 11 || !strings.HasPrefix(mobile, "09") {
				return echo.NewHTTPError(http.StatusBadRequest, "شماره واتساپ معتبر ایرانی وارد کنید.")
			}
			whatsapp = "98" + mobile[1:]
		}
		channel := strings.TrimSpace(input.SupportChannel)
		if channel != "" && channel != "instagram" && channel != "whatsapp" {
			return echo.NewHTTPError(http.StatusBadRequest, "راه ارتباطی پیش‌فرض معتبر نیست.")
		}
		if channel == "instagram" && instagram == "" || channel == "whatsapp" && whatsapp == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات راه ارتباطی پیش‌فرض را کامل کنید.")
		}
		shop := c.Get(shopContextKey).(*Shop)
		template := shop.ShareMessageTemplate
		if input.ShareMessageTemplate != nil {
			template = strings.TrimSpace(*input.ShareMessageTemplate)
		}
		if len([]rune(template)) > 1000 {
			return echo.NewHTTPError(http.StatusBadRequest, "متن پیام اشتراک‌گذاری بیش از حد طولانی است.")
		}
		if template != "" && !strings.Contains(template, "{customerUrl}") {
			return echo.NewHTTPError(http.StatusBadRequest, "متن پیام باید شامل {customerUrl} باشد.")
		}

		updates := map[string]any{"instagram_username": instagram, "whatsapp_number": whatsapp, "support_channel": channel, "share_message_template": template}
		if err := db.Model(shop).Updates(updates).Error; err != nil {
			return err
		}
		return c.JSON(http.StatusOK, map[string]string{
			"instagramUsername":    instagram,
			"whatsappNumber":       whatsapp,
			"supportChannel":       channel,
			"shareMessageTemplate": template,
		})
	}
}

func validInstagramUsername(value string) bool {
	if len(value) > 30 {
		return false
	}
	for _, r := range value {
		if r != '.' && r != '_' && (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') {
			return false
		}
	}
	return value != ""
}

func requireAdmin(db *gorm.DB, cfg config) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			cookie, err := c.Cookie(sessionCookieName)
			if err != nil || cookie.Value == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "برای ادامه وارد حساب شوید.")
			}

			var session Session
			err = db.Preload("Admin").First(&session, "token_hash = ?", hashToken(cookie.Value)).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				clearSessionCookie(c, cfg)
				return echo.NewHTTPError(http.StatusUnauthorized, "نشست شما معتبر نیست. دوباره وارد شوید.")
			}
			if err != nil {
				return err
			}
			if !session.Admin.Active || !session.ExpiresAt.After(time.Now()) {
				if err := db.Delete(&session).Error; err != nil {
					return err
				}
				clearSessionCookie(c, cfg)
				return echo.NewHTTPError(http.StatusUnauthorized, "نشست شما منقضی شده است. دوباره وارد شوید.")
			}

			c.Set(adminContextKey, &session.Admin)
			return next(c)
		}
	}
}

func requireShopAccess(db *gorm.DB) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			shopID, err := strconv.ParseUint(c.Param("shopID"), 10, 64)
			if err != nil {
				return echo.NewHTTPError(http.StatusNotFound, "فروشگاه پیدا نشد.")
			}
			admin := c.Get(adminContextKey).(*Admin)
			var shop Shop
			err = db.Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", admin.ID).Where("shops.id = ?", shopID).First(&shop).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return echo.NewHTTPError(http.StatusNotFound, "فروشگاه پیدا نشد.")
			}
			if err != nil {
				return err
			}
			c.Set(shopContextKey, &shop)
			return next(c)
		}
	}
}

func requireOrigin(origin string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if c.Request().Header.Get(echo.HeaderOrigin) != origin {
				return echo.NewHTTPError(http.StatusForbidden, "مبدأ درخواست معتبر نیست.")
			}
			return next(c)
		}
	}
}

func newOpaqueToken() (string, error) {
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(random), nil
}

func hashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

func setSessionCookie(c echo.Context, token string, expiresAt time.Time, cfg config) {
	c.SetCookie(&http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		MaxAge:   int(cfg.sessionLifetime.Seconds()),
		HttpOnly: true,
		Secure:   cfg.secureCookies,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(c echo.Context, cfg config) {
	c.SetCookie(&http.Cookie{
		Name:     sessionCookieName,
		Path:     "/",
		Expires:  time.Unix(1, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   cfg.secureCookies,
		SameSite: http.SameSiteLaxMode,
	})
}
