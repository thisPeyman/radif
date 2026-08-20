package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	challengeSignup = "signup"
	challengeReset  = "reset"
)

func decodeAuthInput(c echo.Context, input any) error {
	c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, 16<<10)
	d := json.NewDecoder(c.Request().Body)
	d.DisallowUnknownFields()
	if err := d.Decode(input); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات ورود معتبر نیست.")
	}
	return nil
}

func validPassword(password string) bool { return len([]rune(password)) >= 8 }

func issueChallenge(db *gorm.DB, cfg config, mobile, purpose string) error {
	var latest OTPChallenge
	if err := db.Where("mobile = ? AND purpose = ?", mobile, purpose).Order("sent_at DESC").First(&latest).Error; err == nil && time.Since(latest.SentAt) < time.Minute {
		return echo.NewHTTPError(http.StatusTooManyRequests, "کد جدید را یک دقیقه بعد درخواست کنید.")
	}
	code := cfg.devOTPCode
	if code == "" {
		var err error
		code, err = otpCode()
		if err != nil {
			return err
		}
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if cfg.devOTPCode == "" {
		if err := sendOTP(cfg, mobile, code); err != nil {
			return err
		}
	}
	now := time.Now()
	return db.Create(&OTPChallenge{Mobile: mobile, Purpose: purpose, CodeHash: string(hash), SentAt: now, ExpiresAt: now.Add(5 * time.Minute)}).Error
}

func identifyAccount(db *gorm.DB, cfg config, limiter *loginLimiter) echo.HandlerFunc {
	return func(c echo.Context) error {
		if !limiter.allow(c.RealIP()) {
			return echo.NewHTTPError(http.StatusTooManyRequests, "کمی بعد دوباره تلاش کنید.")
		}
		var input struct {
			Identifier string `json:"identifier"`
		}
		if err := decodeAuthInput(c, &input); err != nil {
			return err
		}
		identifier := strings.TrimSpace(input.Identifier)
		mobile := validIranianMobile(identifier)
		var admin Admin
		if mobile != "" {
			err := db.Where("mobile = ? AND active = ?", mobile, true).First(&admin).Error
			if err == nil {
				return c.JSON(http.StatusOK, map[string]string{"next": "password"})
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			if err := issueChallenge(db, cfg, mobile, challengeSignup); err != nil {
				return err
			}
			return c.JSON(http.StatusAccepted, map[string]string{"next": "otp"})
		}
		if identifier == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "شماره موبایل یا نام کاربری را وارد کنید.")
		}
		if err := db.Where("login = ? AND active = ?", identifier, true).First(&admin).Error; errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "حسابی با این نام کاربری پیدا نشد.")
		} else if err != nil {
			return err
		}
		return c.JSON(http.StatusOK, map[string]string{"next": "password"})
	}
}

func passwordLogin(db *gorm.DB, cfg config, limiter *loginLimiter) echo.HandlerFunc {
	return func(c echo.Context) error {
		key := c.RealIP()
		if !limiter.allow(key) {
			return echo.NewHTTPError(http.StatusTooManyRequests, "تعداد تلاش‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.")
		}
		var input struct {
			Identifier string `json:"identifier"`
			Password   string `json:"password"`
		}
		if err := decodeAuthInput(c, &input); err != nil {
			return err
		}
		identifier := strings.TrimSpace(input.Identifier)
		if identifier == "" || input.Password == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "شناسه ورود و رمز عبور الزامی است.")
		}
		var admin Admin
		mobile := validIranianMobile(identifier)
		q := db.Where("login = ? AND active = ?", identifier, true)
		if mobile != "" {
			q = db.Where("mobile = ? AND active = ?", mobile, true)
		}
		err := q.First(&admin).Error
		hash := []byte(admin.PasswordHash)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			hash = dummyPasswordHash
		}
		passwordErr := bcrypt.CompareHashAndPassword(hash, []byte(input.Password))
		if errors.Is(err, gorm.ErrRecordNotFound) || (err == nil && passwordErr != nil) {
			limiter.fail(key)
			return echo.NewHTTPError(http.StatusUnauthorized, "شناسه ورود یا رمز عبور نادرست است.")
		}
		if err != nil {
			return err
		}
		limiter.clear(key)
		if err := createSession(db, cfg, c, admin); err != nil {
			return err
		}
		return c.NoContent(http.StatusNoContent)
	}
}

func verifyChallenge(db *gorm.DB, mobile, purpose, code string, apply func(*gorm.DB) error) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var challenge OTPChallenge
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("mobile = ? AND purpose = ? AND invalidated_at IS NULL", mobile, purpose).Order("sent_at DESC").First(&challenge).Error; err != nil {
			return echo.NewHTTPError(http.StatusUnauthorized, "کد واردشده معتبر نیست.")
		}
		now := time.Now()
		if !challenge.ExpiresAt.After(now) || challenge.Attempts >= 5 || bcrypt.CompareHashAndPassword([]byte(challenge.CodeHash), []byte(code)) != nil {
			tx.Model(&challenge).Update("attempts", gorm.Expr("attempts + 1"))
			if challenge.Attempts+1 >= 5 || !challenge.ExpiresAt.After(now) {
				tx.Model(&challenge).Update("invalidated_at", now)
			}
			return echo.NewHTTPError(http.StatusUnauthorized, "کد واردشده معتبر نیست.")
		}
		if err := apply(tx); err != nil {
			return err
		}
		return tx.Model(&challenge).Update("invalidated_at", now).Error
	})
}

func signupVerify(db *gorm.DB, cfg config, limiter *loginLimiter) echo.HandlerFunc {
	return func(c echo.Context) error {
		var input struct {
			Mobile   string `json:"mobile"`
			Code     string `json:"code"`
			Password string `json:"password"`
		}
		if err := decodeAuthInput(c, &input); err != nil {
			return err
		}
		mobile := validIranianMobile(input.Mobile)
		code := normalizeDigits(input.Code)
		if mobile == "" || len(code) != 6 || !validPassword(input.Password) {
			return echo.NewHTTPError(http.StatusBadRequest, "کد و رمز عبور حداقل ۸ نویسه‌ای وارد کنید.")
		}
		var admin Admin
		err := verifyChallenge(db, mobile, challengeSignup, code, func(tx *gorm.DB) error {
			var count int64
			if err := tx.Model(&Admin{}).Where("mobile = ?", mobile).Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				return echo.NewHTTPError(http.StatusConflict, "این شماره قبلاً ثبت شده است.")
			}
			hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
			if err != nil {
				return err
			}
			admin = Admin{Name: "کاربر ردیف", Login: "mobile-" + mobile, Mobile: mobile, PasswordHash: string(hash), Active: true}
			return tx.Create(&admin).Error
		})
		if err != nil {
			limiter.fail(c.RealIP())
			return err
		}
		limiter.clear(c.RealIP())
		if err := createSession(db, cfg, c, admin); err != nil {
			return err
		}
		return c.NoContent(http.StatusNoContent)
	}
}

func requestPasswordReset(db *gorm.DB, cfg config, limiter *loginLimiter) echo.HandlerFunc {
	return func(c echo.Context) error {
		if !limiter.allow(c.RealIP()) {
			return echo.NewHTTPError(http.StatusTooManyRequests, "کمی بعد دوباره تلاش کنید.")
		}
		var input struct {
			Mobile string `json:"mobile"`
		}
		if err := decodeAuthInput(c, &input); err != nil {
			return err
		}
		mobile := validIranianMobile(input.Mobile)
		if mobile == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "شماره موبایل معتبر ایرانی وارد کنید.")
		}
		var count int64
		if err := db.Model(&Admin{}).Where("mobile = ? AND active = ?", mobile, true).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			if err := issueChallenge(db, cfg, mobile, challengeReset); err != nil {
				return err
			}
		}
		return c.NoContent(http.StatusNoContent)
	}
}

func verifyPasswordReset(db *gorm.DB, cfg config, limiter *loginLimiter) echo.HandlerFunc {
	return func(c echo.Context) error {
		var input struct {
			Mobile   string `json:"mobile"`
			Code     string `json:"code"`
			Password string `json:"password"`
		}
		if err := decodeAuthInput(c, &input); err != nil {
			return err
		}
		mobile := validIranianMobile(input.Mobile)
		code := normalizeDigits(input.Code)
		if mobile == "" || len(code) != 6 || !validPassword(input.Password) {
			return echo.NewHTTPError(http.StatusBadRequest, "کد و رمز عبور حداقل ۸ نویسه‌ای وارد کنید.")
		}
		var admin Admin
		err := verifyChallenge(db, mobile, challengeReset, code, func(tx *gorm.DB) error {
			if err := tx.Where("mobile = ? AND active = ?", mobile, true).First(&admin).Error; err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "کد واردشده معتبر نیست.")
			}
			hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
			if err != nil {
				return err
			}
			return tx.Model(&admin).Update("password_hash", string(hash)).Error
		})
		if err != nil {
			limiter.fail(c.RealIP())
			return err
		}
		limiter.clear(c.RealIP())
		if err := createSession(db, cfg, c, admin); err != nil {
			return err
		}
		return c.NoContent(http.StatusNoContent)
	}
}
