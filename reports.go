package main

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

var confirmedOrderStatuses = []string{"paid", "preparing", "shipped"}

type reportTopProduct struct {
	ID       uint   `json:"id"`
	Name     string `json:"name"`
	Quantity int64  `json:"quantity"`
}

type shopReportResponse struct {
	OrderCount          int64              `json:"orderCount"`
	ConfirmedOrderCount int64              `json:"confirmedOrderCount"`
	ConfirmedOrderValue int64              `json:"confirmedOrderValue"`
	AverageOrderValue   int64              `json:"averageOrderValue"`
	StatusCounts        map[string]int64   `json:"statusCounts"`
	TopProducts         []reportTopProduct `json:"topProducts"`
}

func shopReport(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		shop := c.Get(shopContextKey).(*Shop)
		var summary struct {
			OrderCount          int64
			ConfirmedOrderCount int64
			ConfirmedOrderValue int64
		}
		if err := db.Model(&Order{}).
			Select("COUNT(*) AS order_count, COUNT(*) FILTER (WHERE status IN ?) AS confirmed_order_count, COALESCE(SUM(amount) FILTER (WHERE status IN ?), 0) AS confirmed_order_value", confirmedOrderStatuses, confirmedOrderStatuses).
			Where("shop_id = ?", shop.ID).
			Scan(&summary).Error; err != nil {
			return err
		}

		statusCounts := make(map[string]int64, len(validOrderStatuses))
		for status := range validOrderStatuses {
			statusCounts[status] = 0
		}
		var counts []struct {
			Status string
			Count  int64
		}
		if err := db.Model(&Order{}).Select("status, COUNT(*) AS count").Where("shop_id = ?", shop.ID).Group("status").Scan(&counts).Error; err != nil {
			return err
		}
		for _, count := range counts {
			statusCounts[count.Status] = count.Count
		}

		topProducts := make([]reportTopProduct, 0)
		if err := db.Table("order_items").
			Select("products.id, products.name, SUM(order_items.quantity) AS quantity").
			Joins("JOIN orders ON orders.id = order_items.order_id").
			Joins("JOIN products ON products.id = order_items.product_id").
			Where("orders.shop_id = ? AND orders.status IN ?", shop.ID, confirmedOrderStatuses).
			Group("products.id, products.name").
			Order("quantity DESC, products.id ASC").
			Limit(5).
			Scan(&topProducts).Error; err != nil {
			return err
		}

		average := int64(0)
		if summary.ConfirmedOrderCount > 0 {
			average = summary.ConfirmedOrderValue / summary.ConfirmedOrderCount
		}
		return c.JSON(http.StatusOK, shopReportResponse{
			OrderCount:          summary.OrderCount,
			ConfirmedOrderCount: summary.ConfirmedOrderCount,
			ConfirmedOrderValue: summary.ConfirmedOrderValue,
			AverageOrderValue:   average,
			StatusCounts:        statusCounts,
			TopProducts:         topProducts,
		})
	}
}
