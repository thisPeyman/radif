package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	waitingInfoStatus    = "waiting_info"
	waitingPaymentStatus = "waiting_payment"
)

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
			CreateKey string `json:"createKey"`
			ShopID    uint   `json:"shopId"`
			Items     []struct {
				ProductID uint `json:"productId"`
				Quantity  int  `json:"quantity"`
			} `json:"items"`
			Amount                int64  `json:"amount"`
			EstimatedDeliveryDate string `json:"estimatedDeliveryDate"`
			InstagramUsername     string `json:"instagramUsername"`
			InternalNote          string `json:"internalNote"`
			ElapsedMS             int64  `json:"elapsedMs"`
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
		input.EstimatedDeliveryDate = strings.TrimSpace(input.EstimatedDeliveryDate)
		input.InstagramUsername = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(input.InstagramUsername), "@"))
		input.InternalNote = strings.TrimSpace(input.InternalNote)
		if input.CreateKey == "" || len(input.CreateKey) > 100 || input.ShopID == 0 || len(input.Items) == 0 || len(input.Items) > 50 || input.Amount <= 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "محصول و مبلغ سفارش الزامی است.")
		}
		if !validDeliveryDate(input.EstimatedDeliveryDate) {
			return echo.NewHTTPError(http.StatusBadRequest, "تاریخ تحویل باید امروز یا بعد از آن باشد.")
		}
		sort.Slice(input.Items, func(i, j int) bool { return input.Items[i].ProductID < input.Items[j].ProductID })
		productIDs := make([]uint, len(input.Items))
		inputQuantities := make(map[uint]int, len(input.Items))
		for i, item := range input.Items {
			if item.ProductID == 0 || item.Quantity < 1 || item.Quantity > 99 || inputQuantities[item.ProductID] != 0 {
				return echo.NewHTTPError(http.StatusBadRequest, "محصول‌های سفارش معتبر نیستند.")
			}
			productIDs[i] = item.ProductID
			inputQuantities[item.ProductID] = item.Quantity
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
		fingerprintJSON, _ := json.Marshal(map[string]any{
			"shopId": input.ShopID, "items": input.Items, "amount": input.Amount,
			"estimatedDeliveryDate": input.EstimatedDeliveryDate,
			"instagramUsername":     input.InstagramUsername, "internalNote": input.InternalNote,
		})
		createFingerprint := hashToken(string(fingerprintJSON))

		admin := c.Get(adminContextKey).(*Admin)
		respondExisting := func(order Order) error {
			if order.CreateFingerprint != createFingerprint {
				return echo.NewHTTPError(http.StatusConflict, "این درخواست قبلاً برای سفارش دیگری استفاده شده است.")
			}
			return orderCreatedResponse(c, cfg, order)
		}
		var existing Order
		err := db.Preload("Items").Joins("JOIN shops ON shops.id = orders.shop_id").Where("orders.create_key = ? AND shops.owner_admin_id = ?", input.CreateKey, admin.ID).First(&existing).Error
		if err == nil {
			return respondExisting(existing)
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		var products []Product
		err = db.Joins("JOIN shops ON shops.id = products.shop_id").Where(
			"products.id IN ? AND products.shop_id = ? AND products.active = ? AND shops.active = ? AND shops.owner_admin_id = ?",
			productIDs, input.ShopID, true, true, admin.ID,
		).Find(&products).Error
		if err == nil && len(products) != len(input.Items) {
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
			CreateKey:             input.CreateKey,
			CreateFingerprint:     createFingerprint,
			SecretToken:           token,
			ShopID:                input.ShopID,
			Amount:                input.Amount,
			EstimatedDeliveryDate: input.EstimatedDeliveryDate,
			InstagramUsername:     input.InstagramUsername,
			InternalNote:          input.InternalNote,
			Status:                waitingInfoStatus,
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
			items := make([]OrderItem, len(products))
			for i, product := range products {
				items[i] = OrderItem{OrderID: order.ID, ProductID: product.ID, Quantity: inputQuantities[product.ID], UnitPrice: product.DefaultPrice}
			}
			if err := tx.Create(&items).Error; err != nil {
				return err
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
			err := db.Preload("Items").Joins("JOIN shops ON shops.id = orders.shop_id").Where("orders.create_key = ? AND shops.owner_admin_id = ?", input.CreateKey, admin.ID).First(&existing).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return echo.NewHTTPError(http.StatusConflict, "شناسه ساخت سفارش قبلاً استفاده شده است.")
			}
			if err != nil {
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
		"id":                    order.ID,
		"orderCode":             fmt.Sprintf("#%d", order.ID),
		"customerUrl":           cfg.appOrigin + "/o/" + order.SecretToken,
		"status":                order.Status,
		"estimatedDeliveryDate": order.EstimatedDeliveryDate,
		"createdAt":             order.CreatedAt,
	})
}

func validDeliveryDate(value string) bool {
	iranTime := time.FixedZone("Iran", 3*60*60+30*60)
	deliveryDate, err := time.ParseInLocation("2006-01-02", value, iranTime)
	today, _ := time.ParseInLocation("2006-01-02", time.Now().In(iranTime).Format("2006-01-02"), iranTime)
	return err == nil && !deliveryDate.Before(today)
}

func updateDeliveryDate(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		orderID, err := strconv.ParseUint(c.Param("orderID"), 10, 64)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
		}
		var input struct {
			EstimatedDeliveryDate string `json:"estimatedDeliveryDate"`
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, 4<<10)
		decoder := json.NewDecoder(c.Request().Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil || !validDeliveryDate(strings.TrimSpace(input.EstimatedDeliveryDate)) {
			return echo.NewHTTPError(http.StatusBadRequest, "تاریخ تحویل باید امروز یا بعد از آن باشد.")
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			return echo.NewHTTPError(http.StatusBadRequest, "تاریخ تحویل باید امروز یا بعد از آن باشد.")
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
		if order.EstimatedDeliveryDate == strings.TrimSpace(input.EstimatedDeliveryDate) {
			return c.JSON(http.StatusOK, map[string]string{"estimatedDeliveryDate": order.EstimatedDeliveryDate})
		}
		order.EstimatedDeliveryDate = strings.TrimSpace(input.EstimatedDeliveryDate)
		if err := db.Model(&order).Update("estimated_delivery_date", order.EstimatedDeliveryDate).Error; err != nil {
			return err
		}
		return c.JSON(http.StatusOK, map[string]string{"estimatedDeliveryDate": order.EstimatedDeliveryDate})
	}
}

func listOrders(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		shopID, err := strconv.ParseUint(c.QueryParam("shopId"), 10, 64)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "فروشگاه پیدا نشد.")
		}
		admin := c.Get(adminContextKey).(*Admin)
		var shop Shop
		if err := db.Where("id = ? AND owner_admin_id = ?", shopID, admin.ID).First(&shop).Error; errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "فروشگاه پیدا نشد.")
		} else if err != nil {
			return err
		}
		var orders []Order
		if err := db.Preload("Items.Product").Where("shop_id = ?", shop.ID).Order("created_at DESC").Limit(100).Find(&orders).Error; err != nil {
			return err
		}
		type orderSummary struct {
			ID                    uint   `json:"id"`
			OrderCode             string `json:"orderCode"`
			ProductSummary        string `json:"productSummary"`
			Amount                int64  `json:"amount"`
			Status                string `json:"status"`
			EstimatedDeliveryDate string `json:"estimatedDeliveryDate"`
		}
		response := make([]orderSummary, len(orders))
		for i, order := range orders {
			productSummary := "سفارش بدون محصول"
			if len(order.Items) > 0 {
				productSummary = order.Items[0].Product.Name
				if len(order.Items) > 1 {
					productSummary += fmt.Sprintf(" و %d محصول دیگر", len(order.Items)-1)
				}
			}
			response[i] = orderSummary{order.ID, fmt.Sprintf("#%d", order.ID), productSummary, order.Amount, order.Status, order.EstimatedDeliveryDate}
		}
		return c.JSON(http.StatusOK, map[string]any{"orders": response})
	}
}

func getOrder(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		orderID, err := strconv.ParseUint(c.Param("orderID"), 10, 64)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
		}
		admin := c.Get(adminContextKey).(*Admin)
		var order Order
		err = db.Preload("Items.Product").Joins("JOIN shops ON shops.id = orders.shop_id").Where("orders.id = ? AND shops.owner_admin_id = ?", orderID, admin.ID).First(&order).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
		}
		if err != nil {
			return err
		}
		type itemResponse struct {
			Name      string `json:"name"`
			ImagePath string `json:"imagePath"`
			Quantity  int    `json:"quantity"`
		}
		items := make([]itemResponse, len(order.Items))
		for i, item := range order.Items {
			items[i] = itemResponse{item.Product.Name, item.Product.MainImagePath, item.Quantity}
		}
		return c.JSON(http.StatusOK, map[string]any{
			"id": order.ID, "orderCode": fmt.Sprintf("#%d", order.ID), "items": items,
			"amount": order.Amount, "status": order.Status,
			"estimatedDeliveryDate": order.EstimatedDeliveryDate,
		})
	}
}

func publicOrder(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		order, err := findPublicOrder(db, c.Param("token"))
		if err != nil {
			return err
		}
		return publicOrderResponse(c, http.StatusOK, order)
	}
}

func findPublicOrder(db *gorm.DB, rawToken string) (Order, error) {
	token := strings.TrimSpace(rawToken)
	if token == "" || len(token) > 100 {
		return Order{}, echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
	}
	var order Order
	err := db.Preload("Shop").Preload("Items.Product").First(&order, "secret_token = ?", token).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Order{}, echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
	}
	return order, err
}

func publicOrderResponse(c echo.Context, status int, order Order) error {
	type publicItem struct {
		Name      string `json:"name"`
		ImagePath string `json:"imagePath"`
		Quantity  int    `json:"quantity"`
	}
	items := make([]publicItem, len(order.Items))
	for i, item := range order.Items {
		items[i] = publicItem{item.Product.Name, item.Product.MainImagePath, item.Quantity}
	}
	submitted := order.CustomerSubmittedAt != nil
	receiptUploaded := order.ReceiptFilePath != ""
	return c.JSON(status, map[string]any{
		"orderCode":             fmt.Sprintf("#%d", order.ID),
		"shop":                  map[string]any{"name": order.Shop.Name, "logoPath": order.Shop.LogoPath},
		"items":                 items,
		"amount":                order.Amount,
		"status":                order.Status,
		"estimatedDeliveryDate": order.EstimatedDeliveryDate,
		"paymentInstructions":   order.Shop.PaymentInstructions,
		"customerSubmitted":     submitted,
		"receiptUploaded":       receiptUploaded,
		"receiptUploadAllowed":  submitted && !receiptUploaded && order.Status != "paid" && order.Status != "cancelled",
		"shipmentTrackingCode":  order.ShipmentTrackingCode,
		"updatedAt":             order.UpdatedAt,
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
