package main

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const melipayamakBaseServiceURL = "https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber"

func validIranianMobile(value string) string {
	mobile := normalizeIranianMobile(value)
	if len(mobile) != 11 || !strings.HasPrefix(mobile, "09") {
		return ""
	}
	return mobile
}

func otpCode() (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return string([]byte{'0' + b[0]%10, '0' + b[1]%10, '0' + b[2]%10, '0' + b[3]%10, '0' + b[0]/10%10, '0' + b[1]/10%10}), nil
}

func sendOTP(cfg config, mobile, code string) error {
	if cfg.melipayamakUsername == "" || cfg.melipayamakPassword == "" || cfg.melipayamakBodyID == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "ارسال پیامک هنوز پیکربندی نشده است.")
	}
	body, _ := json.Marshal(map[string]string{"username": cfg.melipayamakUsername, "password": cfg.melipayamakPassword, "to": "98" + mobile[1:], "bodyId": cfg.melipayamakBodyID, "text": code})
	req, err := http.NewRequest(http.MethodPost, melipayamakBaseServiceURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "ارسال پیامک انجام نشد. دوباره تلاش کنید.")
	}
	defer response.Body.Close()
	io.Copy(io.Discard, response.Body)
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return echo.NewHTTPError(http.StatusBadGateway, "ارسال پیامک انجام نشد. دوباره تلاش کنید.")
	}
	return nil
}

func createSelfServiceShop(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		var input struct {
			Name                string `json:"name"`
			InstagramUsername   string `json:"instagramUsername"`
			CardNumber          string `json:"cardNumber"`
			IBAN                string `json:"iban"`
			PaymentInstructions string `json:"paymentInstructions"`
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, 16<<10)
		d := json.NewDecoder(c.Request().Body)
		d.DisallowUnknownFields()
		if err := d.Decode(&input); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات فروشگاه معتبر نیست.")
		}
		name := strings.TrimSpace(input.Name)
		instagram := strings.TrimPrefix(strings.TrimSpace(input.InstagramUsername), "@")
		card, ok := normalizePaymentCardNumber(input.CardNumber)
		iban, ibanOK := normalizeIBAN(input.IBAN)
		instructions := strings.TrimSpace(input.PaymentInstructions)
		if name == "" || len([]rune(name)) > 150 || (instagram != "" && !validInstagramUsername(instagram)) || !ok || !ibanOK || !validPaymentInstructions(instructions) {
			return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات فروشگاه یا پرداخت معتبر نیست.")
		}
		admin := c.Get(adminContextKey).(*Admin)
		var shop Shop
		err := db.Transaction(func(tx *gorm.DB) error {
			var current Admin
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, admin.ID).Error; err != nil {
				return err
			}
			if current.Mobile == "" {
				return echo.NewHTTPError(http.StatusForbidden, "ساخت فروشگاه از این حساب امکان‌پذیر نیست.")
			}
			var count int64
			if err := tx.Model(&AdminShop{}).Where("admin_id = ?", admin.ID).Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				return echo.NewHTTPError(http.StatusConflict, "فقط یک فروشگاه آزمایشی قابل ساخت است.")
			}
			ends := time.Now().Add(14 * 24 * time.Hour)
			shop = Shop{Name: name, InstagramUsername: instagram, PaymentCardNumber: card, PaymentIBAN: iban, PaymentInstructions: instructions, Active: true, TrialEndsAt: &ends, SubscriptionMode: "trial"}
			if err := tx.Create(&shop).Error; err != nil {
				return err
			}
			if err := tx.Create(&AdminShop{AdminID: admin.ID, ShopID: shop.ID}).Error; err != nil {
				return err
			}
			return tx.Create(&ShopPaymentCard{ShopID: shop.ID, CardNumber: card, IBAN: iban, PaymentInstructions: instructions}).Error
		})
		if err != nil {
			return err
		}
		return c.JSON(http.StatusCreated, shopResponse(shop))
	}
}
