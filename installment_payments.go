package main

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func requestFinalPayment(db *gorm.DB, cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		orderID, err := strconv.ParseUint(c.Param("orderID"), 10, 64)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
		}
		admin := c.Get(adminContextKey).(*Admin)
		err = db.Transaction(func(tx *gorm.DB) error {
			var order Order
			err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Joins("JOIN shops ON shops.id = orders.shop_id").Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", admin.ID).Where("orders.id = ?", orderID).First(&order).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
			}
			if err != nil {
				return err
			}
			if order.InitialPaymentAmount == nil {
				return echo.NewHTTPError(http.StatusConflict, "این سفارش پرداخت یک‌مرحله‌ای دارد.")
			}
			if order.FinalPaymentRequestedAt != nil {
				return nil
			}
			if order.CustomerSubmittedAt == nil || order.ReceiptFilePath == "" {
				return echo.NewHTTPError(http.StatusConflict, "رسید پرداخت اول هنوز ثبت نشده است.")
			}
			if order.Status != "paid" && order.Status != "preparing" && order.Status != "shipped" {
				return echo.NewHTTPError(http.StatusConflict, "ابتدا پرداخت اول را تأیید کنید.")
			}
			var paidCount int64
			if err := tx.Model(&OrderStatusHistory{}).Where("order_id = ? AND new_status = ?", order.ID, "paid").Count(&paidCount).Error; err != nil {
				return err
			}
			if paidCount == 0 {
				return echo.NewHTTPError(http.StatusConflict, "ابتدا پرداخت اول را تأیید کنید.")
			}
			var shop Shop
			if err := tx.First(&shop, order.ShopID).Error; err != nil {
				return err
			}
			now := time.Now()
			return tx.Model(&order).Updates(map[string]any{
				"final_payment_requested_at": now,
				"final_payment_card_number":  shop.PaymentCardNumber,
				"final_payment_instructions": shop.PaymentInstructions,
			}).Error
		})
		if err != nil {
			return err
		}
		order, err := findAdminOrder(db, admin.ID, uint(orderID))
		if err != nil {
			return err
		}
		return adminOrderResponse(c, cfg, order)
	}
}

func submitFinalReceipt(db *gorm.DB, cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		maxBytes := cfg.maxReceiptBytes
		if maxBytes <= 0 {
			maxBytes = 5 << 20
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, maxBytes+(1<<20))
		if err := c.Request().ParseMultipartForm(1 << 20); err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				return echoImageTooLarge("receipt")
			}
			return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات فرم معتبر نیست.")
		}
		defer c.Request().MultipartForm.RemoveAll()
		files := c.Request().MultipartForm.File["receipt"]
		if len(files) != 1 {
			return echo.NewHTTPError(http.StatusBadRequest, "یک تصویر رسید پرداخت انتخاب کنید.")
		}
		token := strings.TrimSpace(c.Param("token"))
		order, err := findPublicOrder(db, token)
		if err != nil {
			return err
		}
		receipt, err := prepareReceipt(cfg, files[0])
		if err != nil {
			return err
		}
		defer func() { receipt.discard() }()
		var updated Order
		err = db.Transaction(func(tx *gorm.DB) error {
			var locked Order
			err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND secret_token = ?", order.ID, token).First(&locked).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
			}
			if err != nil {
				return err
			}
			if locked.InitialPaymentAmount == nil || locked.FinalPaymentRequestedAt == nil || locked.Status == "cancelled" {
				return echo.NewHTTPError(http.StatusConflict, "امکان ارسال رسید پرداخت نهایی برای این سفارش وجود ندارد.")
			}
			if locked.FinalReceiptFilePath != "" || locked.FinalPaymentConfirmedAt != nil {
				return echo.NewHTTPError(http.StatusConflict, "رسید پرداخت نهایی قبلاً ثبت شده است.")
			}
			if err := receipt.commit(); err != nil {
				return err
			}
			if err := tx.Model(&locked).Update("final_receipt_file_path", receipt.storedName).Error; err != nil {
				return err
			}
			return tx.Preload("Shop").Preload("Items.Product").Preload("History", func(query *gorm.DB) *gorm.DB { return query.Order("created_at, id") }).First(&updated, order.ID).Error
		})
		if err != nil {
			return err
		}
		receipt = nil
		return publicOrderResponse(c, http.StatusOK, updated)
	}
}

func confirmFinalPayment(db *gorm.DB, cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		orderID, err := strconv.ParseUint(c.Param("orderID"), 10, 64)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
		}
		admin := c.Get(adminContextKey).(*Admin)
		err = db.Transaction(func(tx *gorm.DB) error {
			var order Order
			err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Joins("JOIN shops ON shops.id = orders.shop_id").Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", admin.ID).Where("orders.id = ?", orderID).First(&order).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
			}
			if err != nil {
				return err
			}
			if order.FinalPaymentConfirmedAt != nil {
				return nil
			}
			if order.InitialPaymentAmount == nil || order.FinalPaymentRequestedAt == nil || order.FinalReceiptFilePath == "" || order.Status == "cancelled" {
				return echo.NewHTTPError(http.StatusConflict, "رسید پرداخت نهایی هنوز آماده تأیید نیست.")
			}
			now := time.Now()
			return tx.Model(&order).Updates(map[string]any{
				"final_payment_confirmed_at":          now,
				"final_payment_confirmed_by_admin_id": admin.ID,
			}).Error
		})
		if err != nil {
			return err
		}
		order, err := findAdminOrder(db, admin.ID, uint(orderID))
		if err != nil {
			return err
		}
		return adminOrderResponse(c, cfg, order)
	}
}

func getFinalPaymentReceipt(db *gorm.DB, cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		orderID, err := strconv.ParseUint(c.Param("orderID"), 10, 64)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "رسید پیدا نشد.")
		}
		admin := c.Get(adminContextKey).(*Admin)
		var order Order
		err = db.Joins("JOIN shops ON shops.id = orders.shop_id").Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", admin.ID).Where("orders.id = ?", orderID).First(&order).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "رسید پیدا نشد.")
		}
		if err != nil {
			return err
		}
		return serveReceipt(c, cfg, order.FinalReceiptFilePath)
	}
}
