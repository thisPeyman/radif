package main

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

func tehranToday(now time.Time) time.Time {
	loc, err := time.LoadLocation("Asia/Tehran")
	if err != nil {
		return now.UTC()
	}
	return now.In(loc)
}

func shopSubscription(shop Shop, now time.Time) (string, int) {
	if shop.SubscriptionMode == "grandfathered" || shop.TrialEndsAt == nil && shop.PaidThrough == nil {
		return "paid", 0
	}
	today := tehranToday(now)
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())
	if shop.PaidThrough != nil {
		paid := shop.PaidThrough.In(today.Location())
		paid = time.Date(paid.Year(), paid.Month(), paid.Day(), 0, 0, 0, 0, today.Location())
		if !today.After(paid) {
			return "paid", 0
		}
	}
	if shop.TrialEndsAt != nil && now.Before(*shop.TrialEndsAt) {
		return "trial", int(shop.TrialEndsAt.Sub(now).Hours()+23) / 24
	}
	return "inactive", 0
}

func shopWritable(shop Shop) bool {
	state, _ := shopSubscription(shop, time.Now())
	return state != "inactive"
}

func requireActiveShop(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		if !shopWritable(*c.Get(shopContextKey).(*Shop)) {
			return echo.NewHTTPError(http.StatusPaymentRequired, "دوره دسترسی این فروشگاه تمام شده است. برای فعال‌سازی در واتساپ پیام دهید.")
		}
		return next(c)
	}
}

func requireActiveOrderShop(db *gorm.DB) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			var shop Shop
			admin := c.Get(adminContextKey).(*Admin)
			if err := db.Table("orders").Select("shops.*").Joins("JOIN shops ON shops.id = orders.shop_id").Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", admin.ID).Where("orders.id = ?", c.Param("orderID")).First(&shop).Error; err != nil {
				return next(c)
			}
			if !shopWritable(shop) {
				return echo.NewHTTPError(http.StatusPaymentRequired, "دوره دسترسی این فروشگاه تمام شده است. برای فعال‌سازی در واتساپ پیام دهید.")
			}
			return next(c)
		}
	}
}
