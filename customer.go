package main

import (
	"errors"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type customerDetails struct {
	fullName   string
	mobile     string
	address    string
	postalCode string
	note       string
}

func normalizeDigits(value string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r >= '۰' && r <= '۹':
			return '0' + r - '۰'
		case r >= '٠' && r <= '٩':
			return '0' + r - '٠'
		case r >= '0' && r <= '9':
			return r
		default:
			return -1
		}
	}, value)
}

func normalizeIranianMobile(value string) string {
	digits := normalizeDigits(value)
	switch {
	case strings.HasPrefix(digits, "0098"):
		digits = "0" + digits[4:]
	case strings.HasPrefix(digits, "98"):
		digits = "0" + digits[2:]
	}
	return digits
}

func parseCustomerDetails(c echo.Context) (customerDetails, *multipart.FileHeader, error) {
	if err := c.Request().ParseMultipartForm(1 << 20); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			return customerDetails{}, nil, echo.NewHTTPError(http.StatusRequestEntityTooLarge, "حجم رسید بیش از حد مجاز است.")
		}
		return customerDetails{}, nil, echo.NewHTTPError(http.StatusBadRequest, "اطلاعات فرم معتبر نیست.")
	}
	details := customerDetails{
		fullName:   strings.TrimSpace(c.FormValue("fullName")),
		mobile:     normalizeIranianMobile(c.FormValue("mobile")),
		address:    strings.TrimSpace(c.FormValue("address")),
		postalCode: normalizeDigits(c.FormValue("postalCode")),
		note:       strings.TrimSpace(c.FormValue("note")),
	}
	if err := validateCustomerDetails(details); err != nil {
		return customerDetails{}, nil, err
	}
	files := c.Request().MultipartForm.File["receipt"]
	if len(files) != 1 {
		return customerDetails{}, nil, echo.NewHTTPError(http.StatusBadRequest, "یک تصویر رسید پرداخت انتخاب کنید.")
	}
	return details, files[0], nil
}

func validateCustomerDetails(details customerDetails) error {
	if details.fullName == "" || utf8.RuneCountInString(details.fullName) > 150 {
		return echo.NewHTTPError(http.StatusBadRequest, "نام و نام خانوادگی را کامل وارد کنید.")
	}
	if len(details.mobile) != 11 || !strings.HasPrefix(details.mobile, "09") {
		return echo.NewHTTPError(http.StatusBadRequest, "شماره موبایل معتبر ایرانی وارد کنید.")
	}
	if details.address == "" || utf8.RuneCountInString(details.address) > 2000 {
		return echo.NewHTTPError(http.StatusBadRequest, "نشانی کامل را وارد کنید.")
	}
	if details.postalCode != "" && len(details.postalCode) != 10 {
		return echo.NewHTTPError(http.StatusBadRequest, "کد پستی باید ۱۰ رقم باشد.")
	}
	if utf8.RuneCountInString(details.note) > 1000 {
		return echo.NewHTTPError(http.StatusBadRequest, "یادداشت بیش از حد طولانی است.")
	}
	return nil
}

func echoImageTooLarge(label string) error {
	if label == "receipt" {
		return echo.NewHTTPError(http.StatusRequestEntityTooLarge, "حجم رسید بیش از حد مجاز است.")
	}
	return echo.NewHTTPError(http.StatusRequestEntityTooLarge, "حجم تصویر محصول بیش از حد مجاز است.")
}

func echoInvalidImage(label string) error {
	if label == "receipt" {
		return echo.NewHTTPError(http.StatusBadRequest, "رسید باید تصویر JPEG، PNG یا WebP باشد.")
	}
	return echo.NewHTTPError(http.StatusBadRequest, "تصویر محصول باید JPEG، PNG یا WebP باشد.")
}

func echoImageUnreadable(label string) error {
	if label == "receipt" {
		return echo.NewHTTPError(http.StatusBadRequest, "تصویر رسید خوانده نشد.")
	}
	return echo.NewHTTPError(http.StatusBadRequest, "تصویر محصول خوانده نشد.")
}

func echoImageEmpty(label string) error {
	if label == "receipt" {
		return echo.NewHTTPError(http.StatusBadRequest, "تصویر رسید خالی است.")
	}
	return echo.NewHTTPError(http.StatusBadRequest, "تصویر محصول خالی است.")
}

func prepareReceipt(cfg config, fileHeader *multipart.FileHeader) (*pendingImage, error) {
	maxBytes := cfg.maxReceiptBytes
	if maxBytes <= 0 {
		maxBytes = 5 << 20
	}
	dir := cfg.receiptDir
	if dir == "" {
		dir = filepath.Join(dataDir(), "receipts")
	}
	return prepareImage(dir, maxBytes, fileHeader, "receipt")
}

func submitCustomerDetails(db *gorm.DB, cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		maxBytes := cfg.maxReceiptBytes
		if maxBytes <= 0 {
			maxBytes = 5 << 20
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, maxBytes+(1<<20))
		details, fileHeader, err := parseCustomerDetails(c)
		if err != nil {
			return err
		}
		order, err := findPublicOrder(db, c.Param("token"))
		if err != nil {
			return err
		}
		if order.CustomerSubmittedAt != nil {
			return echo.NewHTTPError(http.StatusConflict, "اطلاعات این سفارش قبلاً ثبت شده است.")
		}
		receipt, err := prepareReceipt(cfg, fileHeader)
		if err != nil {
			return err
		}
		defer func() { receipt.discard() }()
		now := time.Now()
		err = db.Transaction(func(tx *gorm.DB) error {
			updates := map[string]any{
				"customer_full_name": details.fullName, "customer_mobile": details.mobile,
				"customer_address": details.address, "customer_postal_code": details.postalCode,
				"customer_note": details.note, "customer_submitted_at": now, "status": waitingPaymentStatus,
			}
			if err := receipt.commit(); err != nil {
				return err
			}
			updates["receipt_file_path"] = receipt.storedName
			result := tx.Model(&Order{}).Where("id = ? AND customer_submitted_at IS NULL AND status = ?", order.ID, waitingInfoStatus).Updates(updates)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return echo.NewHTTPError(http.StatusConflict, "اطلاعات این سفارش قبلاً ثبت شده است.")
			}
			return tx.Create(&OrderStatusHistory{OrderID: order.ID, PreviousStatus: order.Status, NewStatus: waitingPaymentStatus}).Error
		})
		if err != nil {
			return err
		}
		receipt = nil
		updated, err := findPublicOrder(db, c.Param("token"))
		if err != nil {
			return err
		}
		return publicOrderResponse(c, http.StatusOK, updated)
	}
}
