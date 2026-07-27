package main

import (
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"os"
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

type pendingReceipt struct {
	temporaryPath string
	finalPath     string
	storedName    string
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
	if len(files) > 1 {
		return customerDetails{}, nil, echo.NewHTTPError(http.StatusBadRequest, "فقط یک تصویر رسید انتخاب کنید.")
	}
	if len(files) == 1 {
		return details, files[0], nil
	}
	return details, nil, nil
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

func prepareReceipt(cfg config, fileHeader *multipart.FileHeader) (*pendingReceipt, error) {
	if fileHeader == nil {
		return nil, nil
	}
	maxBytes := cfg.maxReceiptBytes
	if maxBytes <= 0 {
		maxBytes = 5 << 20
	}
	dir := cfg.receiptDir
	if dir == "" {
		dir = filepath.Join(filepath.Dir(databasePath()), "receipts")
	}
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	source, err := fileHeader.Open()
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusBadRequest, "تصویر رسید خوانده نشد.")
	}
	defer source.Close()
	temporary, err := os.CreateTemp(dir, ".upload-*")
	if err != nil {
		return nil, err
	}
	temporaryPath := temporary.Name()
	cleanup := func() {
		_ = temporary.Close()
		_ = os.Remove(temporaryPath)
	}
	written, copyErr := io.Copy(temporary, io.LimitReader(source, maxBytes+1))
	if closeErr := temporary.Close(); copyErr == nil {
		copyErr = closeErr
	}
	if copyErr != nil {
		cleanup()
		return nil, copyErr
	}
	if written == 0 {
		cleanup()
		return nil, echo.NewHTTPError(http.StatusBadRequest, "تصویر رسید خالی است.")
	}
	if written > maxBytes {
		cleanup()
		return nil, echo.NewHTTPError(http.StatusRequestEntityTooLarge, "حجم رسید بیش از حد مجاز است.")
	}
	file, err := os.Open(temporaryPath)
	if err != nil {
		cleanup()
		return nil, err
	}
	header := make([]byte, 512)
	read, readErr := file.Read(header)
	_ = file.Close()
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		cleanup()
		return nil, readErr
	}
	extensions := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
	extension, ok := extensions[http.DetectContentType(header[:read])]
	if !ok {
		cleanup()
		return nil, echo.NewHTTPError(http.StatusBadRequest, "رسید باید تصویر JPEG، PNG یا WebP باشد.")
	}
	token, err := newOpaqueToken()
	if err != nil {
		cleanup()
		return nil, err
	}
	storedName := token + extension
	return &pendingReceipt{temporaryPath: temporaryPath, finalPath: filepath.Join(dir, storedName), storedName: storedName}, nil
}

func (receipt *pendingReceipt) discard() {
	if receipt == nil {
		return
	}
	_ = os.Remove(receipt.temporaryPath)
	_ = os.Remove(receipt.finalPath)
}

func (receipt *pendingReceipt) commit() error {
	if receipt == nil {
		return nil
	}
	return os.Rename(receipt.temporaryPath, receipt.finalPath)
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
			if receipt != nil {
				if err := receipt.commit(); err != nil {
					return err
				}
				updates["receipt_file_path"] = receipt.storedName
				updates["receipt_uploaded_at"] = now
			}
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

func uploadCustomerReceipt(db *gorm.DB, cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		maxBytes := cfg.maxReceiptBytes
		if maxBytes <= 0 {
			maxBytes = 5 << 20
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, maxBytes+(1<<20))
		if err := c.Request().ParseMultipartForm(1 << 20); err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				return echo.NewHTTPError(http.StatusRequestEntityTooLarge, "حجم رسید بیش از حد مجاز است.")
			}
			return echo.NewHTTPError(http.StatusBadRequest, "تصویر رسید معتبر نیست.")
		}
		files := c.Request().MultipartForm.File["receipt"]
		if len(files) != 1 {
			return echo.NewHTTPError(http.StatusBadRequest, "یک تصویر رسید انتخاب کنید.")
		}
		order, err := findPublicOrder(db, c.Param("token"))
		if err != nil {
			return err
		}
		if order.CustomerSubmittedAt == nil || order.ReceiptFilePath != "" || order.Status == "paid" || order.Status == "cancelled" {
			return echo.NewHTTPError(http.StatusConflict, "بارگذاری رسید برای این سفارش امکان‌پذیر نیست.")
		}
		receipt, err := prepareReceipt(cfg, files[0])
		if err != nil {
			return err
		}
		defer func() { receipt.discard() }()
		now := time.Now()
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := receipt.commit(); err != nil {
				return err
			}
			result := tx.Model(&Order{}).Where(
				"id = ? AND customer_submitted_at IS NOT NULL AND receipt_file_path = ? AND status NOT IN ?",
				order.ID, "", []string{"paid", "cancelled"},
			).Updates(map[string]any{"receipt_file_path": receipt.storedName, "receipt_uploaded_at": now})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return echo.NewHTTPError(http.StatusConflict, "بارگذاری رسید برای این سفارش امکان‌پذیر نیست.")
			}
			return nil
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
