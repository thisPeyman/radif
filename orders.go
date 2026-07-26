package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const waitingInfoStatus = "waiting_info"

var errOrderAlreadyCreated = errors.New("order already created")

func products(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		shop := c.Get(shopContextKey).(*Shop)
		var rows []Product
		if err := db.Where("shop_id = ? AND active = ?", shop.ID, true).Order("id").Find(&rows).Error; err != nil {
			return err
		}

		type productResponse struct {
			ID               uint   `json:"id"`
			Name             string `json:"name"`
			ImagePath        string `json:"imagePath"`
			DefaultPrice     int64  `json:"defaultPrice"`
			ShortDescription string `json:"shortDescription,omitempty"`
		}
		response := make([]productResponse, len(rows))
		for i, product := range rows {
			response[i] = productResponse{product.ID, product.Name, product.MainImagePath, product.DefaultPrice, product.ShortDescription}
		}
		return c.JSON(http.StatusOK, map[string]any{"products": response})
	}
}

func createOrder(db *gorm.DB, cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		var input struct {
			CreateKey         string `json:"createKey"`
			ShopID            uint   `json:"shopId"`
			ProductID         uint   `json:"productId"`
			Amount            int64  `json:"amount"`
			InstagramUsername string `json:"instagramUsername"`
			InternalNote      string `json:"internalNote"`
			ElapsedMS         int64  `json:"elapsedMs"`
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, 16<<10)
		decoder := json.NewDecoder(c.Request().Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات سفارش معتبر نیست.")
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات سفارش معتبر نیست.")
		}
		input.CreateKey = strings.TrimSpace(input.CreateKey)
		input.InstagramUsername = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(input.InstagramUsername), "@"))
		input.InternalNote = strings.TrimSpace(input.InternalNote)
		if input.CreateKey == "" || len(input.CreateKey) > 100 || input.ShopID == 0 || input.ProductID == 0 || input.Amount <= 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "محصول و مبلغ سفارش الزامی است.")
		}
		if len([]rune(input.InstagramUsername)) > 100 || len([]rune(input.InternalNote)) > 1000 {
			return echo.NewHTTPError(http.StatusBadRequest, "متن واردشده بیش از حد طولانی است.")
		}
		if input.ElapsedMS < 0 {
			input.ElapsedMS = 0
		}
		if input.ElapsedMS > int64((10 * time.Minute).Milliseconds()) {
			input.ElapsedMS = int64((10 * time.Minute).Milliseconds())
		}

		admin := c.Get(adminContextKey).(*Admin)
		respondExisting := func(order Order) error {
			if order.ShopID != input.ShopID || order.ProductID != input.ProductID || order.Amount != input.Amount || order.InstagramUsername != input.InstagramUsername || order.InternalNote != input.InternalNote {
				return echo.NewHTTPError(http.StatusConflict, "این درخواست قبلاً برای سفارش دیگری استفاده شده است.")
			}
			return orderCreatedResponse(c, cfg, order)
		}
		var existing Order
		err := db.Joins("JOIN shops ON shops.id = orders.shop_id").Where("orders.create_key = ? AND shops.owner_admin_id = ?", input.CreateKey, admin.ID).First(&existing).Error
		if err == nil {
			return respondExisting(existing)
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		var product Product
		err = db.Joins("JOIN shops ON shops.id = products.shop_id").Where(
			"products.id = ? AND products.shop_id = ? AND products.active = ? AND shops.active = ? AND shops.owner_admin_id = ?",
			input.ProductID, input.ShopID, true, true, admin.ID,
		).First(&product).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "محصول پیدا نشد.")
		}
		if err != nil {
			return err
		}
		token, err := newOpaqueToken()
		if err != nil {
			return err
		}
		order := Order{
			CreateKey:         input.CreateKey,
			SecretToken:       token,
			ShopID:            input.ShopID,
			ProductID:         input.ProductID,
			Amount:            input.Amount,
			InstagramUsername: input.InstagramUsername,
			InternalNote:      input.InternalNote,
			Status:            waitingInfoStatus,
		}
		metadata, _ := json.Marshal(map[string]int64{"elapsedMs": input.ElapsedMS})
		now := time.Now()
		err = db.Transaction(func(tx *gorm.DB) error {
			result := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "create_key"}}, DoNothing: true}).Create(&order)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				return errOrderAlreadyCreated
			}
			history := OrderStatusHistory{OrderID: order.ID, NewStatus: waitingInfoStatus, ChangedByAdminID: &admin.ID}
			if err := tx.Create(&history).Error; err != nil {
				return err
			}
			events := []PilotEvent{
				{EventName: "order_create_started", OrderID: &order.ID, AdminID: &admin.ID, CreatedAt: now.Add(-time.Duration(input.ElapsedMS) * time.Millisecond)},
				{EventName: "order_created", OrderID: &order.ID, AdminID: &admin.ID, Metadata: string(metadata), CreatedAt: now},
			}
			return tx.Create(&events).Error
		})
		if errors.Is(err, errOrderAlreadyCreated) {
			if err := db.Joins("JOIN shops ON shops.id = orders.shop_id").Where("orders.create_key = ? AND shops.owner_admin_id = ?", input.CreateKey, admin.ID).First(&existing).Error; err != nil {
				return err
			}
			return respondExisting(existing)
		}
		if err != nil {
			return err
		}

		return orderCreatedResponse(c, cfg, order)
	}
}

func orderCreatedResponse(c echo.Context, cfg config, order Order) error {
	return c.JSON(http.StatusCreated, map[string]any{
		"id":          order.ID,
		"orderCode":   fmt.Sprintf("#%d", order.ID),
		"customerUrl": cfg.appOrigin + "/o/" + order.SecretToken,
		"status":      order.Status,
		"createdAt":   order.CreatedAt,
	})
}

func recordLinkCopied(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		orderID, err := strconv.ParseUint(c.Param("orderID"), 10, 64)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
		}
		admin := c.Get(adminContextKey).(*Admin)
		var order Order
		err = db.Joins("JOIN shops ON shops.id = orders.shop_id").Where("orders.id = ? AND shops.owner_admin_id = ?", orderID, admin.ID).First(&order).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
		}
		if err != nil {
			return err
		}
		if err := db.Create(&PilotEvent{EventName: "order_link_copied", OrderID: &order.ID, AdminID: &admin.ID}).Error; err != nil {
			return err
		}
		return c.NoContent(http.StatusNoContent)
	}
}
