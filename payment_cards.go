package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type paymentCardResponse struct {
	ID                  uint   `json:"id"`
	CardNumber          string `json:"cardNumber"`
	IBAN                string `json:"iban"`
	PaymentInstructions string `json:"paymentInstructions"`
	Active              bool   `json:"active"`
}

func respondPaymentCard(c echo.Context, status int, card ShopPaymentCard, active bool) error {
	return c.JSON(status, paymentCardResponse{ID: card.ID, CardNumber: card.CardNumber, IBAN: card.IBAN, PaymentInstructions: card.PaymentInstructions, Active: active})
}

func validPaymentInstructions(value string) bool {
	count := utf8.RuneCountInString(value)
	return count > 0 && count <= 1000
}

func normalizePaymentCardNumber(value string) (string, bool) {
	for _, r := range value {
		if r != '-' && !unicode.IsSpace(r) && (r < '0' || r > '9') && (r < '۰' || r > '۹') && (r < '٠' || r > '٩') {
			return "", false
		}
	}
	number := normalizeDigits(value)
	return number, len(number) == 16
}

func normalizeIBAN(value string) (string, bool) {
	if strings.TrimSpace(value) == "" {
		return "", true
	}
	var normalized strings.Builder
	for _, r := range value {
		switch {
		case r == '-' || unicode.IsSpace(r):
		case r == 'i' || r == 'I':
			normalized.WriteByte('I')
		case r == 'r' || r == 'R':
			normalized.WriteByte('R')
		case r >= '0' && r <= '9':
			normalized.WriteRune(r)
		case r >= '۰' && r <= '۹':
			normalized.WriteByte(byte(r - '۰' + '0'))
		case r >= '٠' && r <= '٩':
			normalized.WriteByte(byte(r - '٠' + '0'))
		default:
			return "", false
		}
	}
	iban := normalized.String()
	if len(iban) != 26 || !strings.HasPrefix(iban, "IR") {
		return "", false
	}
	for _, r := range iban[2:] {
		if r < '0' || r > '9' {
			return "", false
		}
	}
	return iban, true
}

func createPaymentCard(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		var input struct {
			CardNumber          string `json:"cardNumber"`
			IBAN                string `json:"iban"`
			PaymentInstructions string `json:"paymentInstructions"`
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, 16<<10)
		decoder := json.NewDecoder(c.Request().Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات کارت معتبر نیست.")
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات کارت معتبر نیست.")
		}
		cardNumber, validCardNumber := normalizePaymentCardNumber(input.CardNumber)
		iban, validIBAN := normalizeIBAN(input.IBAN)
		instructions := strings.TrimSpace(input.PaymentInstructions)
		if !validCardNumber {
			return echo.NewHTTPError(http.StatusBadRequest, "شماره کارت باید ۱۶ رقم باشد.")
		}
		if !validIBAN {
			return echo.NewHTTPError(http.StatusBadRequest, "شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد.")
		}
		if !validPaymentInstructions(instructions) {
			return echo.NewHTTPError(http.StatusBadRequest, "توضیحات پرداخت باید بین ۱ تا ۱۰۰۰ نویسه باشد.")
		}
		shop := c.Get(shopContextKey).(*Shop)
		card := ShopPaymentCard{ShopID: shop.ID, CardNumber: cardNumber, IBAN: iban, PaymentInstructions: instructions}
		if err := db.Create(&card).Error; err != nil {
			var postgresError *pgconn.PgError
			if errors.As(err, &postgresError) && postgresError.Code == "23505" && postgresError.ConstraintName == "uq_shop_payment_cards_shop_number" {
				return echo.NewHTTPError(http.StatusConflict, "این شماره کارت قبلاً برای فروشگاه ثبت شده است.")
			}
			return err
		}
		return respondPaymentCard(c, http.StatusCreated, card, false)
	}
}

func ownedPaymentCard(tx *gorm.DB, shopID uint, rawID string) (ShopPaymentCard, error) {
	cardID, err := strconv.ParseUint(rawID, 10, 64)
	if err != nil || cardID == 0 {
		return ShopPaymentCard{}, echo.NewHTTPError(http.StatusNotFound, "کارت پیدا نشد.")
	}
	var card ShopPaymentCard
	err = tx.First(&card, "id = ? AND shop_id = ?", cardID, shopID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ShopPaymentCard{}, echo.NewHTTPError(http.StatusNotFound, "کارت پیدا نشد.")
	}
	return card, err
}

func updatePaymentCard(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		var input struct {
			PaymentInstructions string  `json:"paymentInstructions"`
			IBAN                *string `json:"iban"`
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, 16<<10)
		decoder := json.NewDecoder(c.Request().Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "توضیحات پرداخت معتبر نیست.")
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			return echo.NewHTTPError(http.StatusBadRequest, "توضیحات پرداخت معتبر نیست.")
		}
		instructions := strings.TrimSpace(input.PaymentInstructions)
		if !validPaymentInstructions(instructions) {
			return echo.NewHTTPError(http.StatusBadRequest, "توضیحات پرداخت باید بین ۱ تا ۱۰۰۰ نویسه باشد.")
		}
		iban := ""
		if input.IBAN != nil {
			var valid bool
			iban, valid = normalizeIBAN(*input.IBAN)
			if !valid {
				return echo.NewHTTPError(http.StatusBadRequest, "شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد.")
			}
		}
		shop := c.Get(shopContextKey).(*Shop)
		var card ShopPaymentCard
		active := false
		err := db.Transaction(func(tx *gorm.DB) error {
			var current Shop
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, shop.ID).Error; err != nil {
				return err
			}
			var err error
			card, err = ownedPaymentCard(tx, shop.ID, c.Param("cardID"))
			if err != nil {
				return err
			}
			active = current.PaymentCardNumber == card.CardNumber
			updates := map[string]any{"payment_instructions": instructions}
			if input.IBAN != nil {
				updates["iban"] = iban
			}
			if err := tx.Model(&card).Updates(updates).Error; err != nil {
				return err
			}
			card.PaymentInstructions = instructions
			if input.IBAN != nil {
				card.IBAN = iban
			}
			if active {
				shopUpdates := map[string]any{"payment_instructions": instructions}
				if input.IBAN != nil {
					shopUpdates["payment_iban"] = iban
				}
				return tx.Model(&current).Updates(shopUpdates).Error
			}
			return nil
		})
		if err != nil {
			return err
		}
		return respondPaymentCard(c, http.StatusOK, card, active)
	}
}

func activatePaymentCard(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		shop := c.Get(shopContextKey).(*Shop)
		var card ShopPaymentCard
		err := db.Transaction(func(tx *gorm.DB) error {
			var current Shop
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, shop.ID).Error; err != nil {
				return err
			}
			var err error
			card, err = ownedPaymentCard(tx, shop.ID, c.Param("cardID"))
			if err != nil {
				return err
			}
			return tx.Model(&current).Updates(map[string]any{
				"payment_card_number":  card.CardNumber,
				"payment_iban":         card.IBAN,
				"payment_instructions": card.PaymentInstructions,
			}).Error
		})
		if err != nil {
			return err
		}
		return respondPaymentCard(c, http.StatusOK, card, true)
	}
}
