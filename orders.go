package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
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
	staleWaitingInfoAge  = 2 * 24 * time.Hour
)

var validOrderStatuses = map[string]bool{
	"waiting_info": true, "waiting_payment": true, "paid": true,
	"preparing": true, "shipped": true, "cancelled": true,
}

var validSalesChannels = map[string]bool{
	"instagram": true, "whatsapp": true, "telegram": true, "bale": true, "other": true,
}

var errOrderAlreadyCreated = errors.New("order already created")
var iranTime = time.FixedZone("Iran", 3*60*60+30*60)

func lockedActiveShop(tx *gorm.DB, adminID, shopID uint) (Shop, error) {
	var shop Shop
	err := tx.Clauses(clause.Locking{Strength: "SHARE"}).Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", adminID).Where("shops.id = ? AND shops.active = ?", shopID, true).First(&shop).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Shop{}, echo.NewHTTPError(http.StatusNotFound, "محصول پیدا نشد.")
	}
	return shop, err
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
			InitialPaymentAmount  *int64 `json:"initialPaymentAmount"`
			EstimatedDeliveryDate string `json:"estimatedDeliveryDate"`
			SalesChannel          string `json:"salesChannel"`
			ConversationReference string `json:"conversationReference"`
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
		input.SalesChannel = strings.TrimSpace(input.SalesChannel)
		input.ConversationReference = strings.TrimSpace(input.ConversationReference)
		if input.ConversationReference == "" && strings.TrimSpace(input.InstagramUsername) != "" {
			input.ConversationReference = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(input.InstagramUsername), "@"))
		}
		if input.SalesChannel == "" {
			input.SalesChannel = "instagram"
		}
		input.InternalNote = strings.TrimSpace(input.InternalNote)
		if input.CreateKey == "" || len(input.CreateKey) > 100 || input.ShopID == 0 || len(input.Items) == 0 || len(input.Items) > 50 || input.Amount <= 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "محصول و مبلغ سفارش الزامی است.")
		}
		if input.InitialPaymentAmount != nil && (*input.InitialPaymentAmount <= 0 || *input.InitialPaymentAmount >= input.Amount) {
			return echo.NewHTTPError(http.StatusBadRequest, "مبلغ پرداخت اول باید بیشتر از صفر و کمتر از مبلغ سفارش باشد.")
		}
		if !validDeliveryDate(input.EstimatedDeliveryDate) {
			return echo.NewHTTPError(http.StatusBadRequest, "تاریخ تحویل باید امروز یا بعد از آن باشد.")
		}
		if !validSalesChannels[input.SalesChannel] {
			return echo.NewHTTPError(http.StatusBadRequest, "کانال فروش معتبر نیست.")
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
		if len([]rune(input.ConversationReference)) > 100 || len([]rune(input.InternalNote)) > 1000 {
			return echo.NewHTTPError(http.StatusBadRequest, "متن واردشده بیش از حد طولانی است.")
		}
		if input.ElapsedMS < 0 {
			input.ElapsedMS = 0
		}
		if input.ElapsedMS > int64((10 * time.Minute).Milliseconds()) {
			input.ElapsedMS = int64((10 * time.Minute).Milliseconds())
		}
		fingerprintInput := map[string]any{
			"shopId": input.ShopID, "items": input.Items, "amount": input.Amount,
			"estimatedDeliveryDate": input.EstimatedDeliveryDate,
			"instagramUsername":     input.ConversationReference, "internalNote": input.InternalNote,
		}
		if input.SalesChannel != "instagram" {
			fingerprintInput["salesChannel"] = input.SalesChannel
		}
		if input.InitialPaymentAmount != nil {
			fingerprintInput["initialPaymentAmount"] = *input.InitialPaymentAmount
		}
		fingerprintJSON, _ := json.Marshal(fingerprintInput)
		createFingerprint := hashToken(string(fingerprintJSON))

		admin := c.Get(adminContextKey).(*Admin)
		respondExisting := func(order Order) error {
			if order.CreateFingerprint != createFingerprint {
				return echo.NewHTTPError(http.StatusConflict, "این درخواست قبلاً برای سفارش دیگری استفاده شده است.")
			}
			return orderCreatedResponse(c, cfg, order)
		}
		var existing Order
		err := db.Preload("Items").Joins("JOIN shops ON shops.id = orders.shop_id").Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", admin.ID).Where("orders.create_key = ?", input.CreateKey).First(&existing).Error
		if err == nil {
			return respondExisting(existing)
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
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
			InitialPaymentAmount:  input.InitialPaymentAmount,
			EstimatedDeliveryDate: input.EstimatedDeliveryDate,
			SalesChannel:          input.SalesChannel,
			ConversationReference: input.ConversationReference,
			InternalNote:          input.InternalNote,
			Status:                waitingInfoStatus,
		}
		metadata, _ := json.Marshal(map[string]int64{"elapsedMs": input.ElapsedMS})
		now := time.Now()
		var products []Product
		err = db.Transaction(func(tx *gorm.DB) error {
			shop, err := lockedActiveShop(tx, admin.ID, input.ShopID)
			if err != nil {
				return err
			}
			order.PaymentCardNumber = shop.PaymentCardNumber
			order.PaymentInstructions = shop.PaymentInstructions
			if err := tx.Clauses(clause.Locking{Strength: "SHARE"}).Where("id IN ? AND shop_id = ? AND active = ?", productIDs, input.ShopID, true).Find(&products).Error; err != nil {
				return err
			}
			if len(products) != len(input.Items) {
				return echo.NewHTTPError(http.StatusNotFound, "محصول پیدا نشد.")
			}
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
			err := db.Preload("Items").Joins("JOIN shops ON shops.id = orders.shop_id").Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", admin.ID).Where("orders.create_key = ?", input.CreateKey).First(&existing).Error
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
	response := map[string]any{
		"id":                    order.ID,
		"orderCode":             fmt.Sprintf("#%d", order.ID),
		"customerUrl":           cfg.appOrigin + "/o/" + order.SecretToken,
		"status":                order.Status,
		"estimatedDeliveryDate": order.EstimatedDeliveryDate,
		"createdAt":             order.CreatedAt,
	}
	if order.InitialPaymentAmount != nil {
		response["initialPaymentAmount"] = *order.InitialPaymentAmount
		response["finalPaymentAmount"] = order.Amount - *order.InitialPaymentAmount
	}
	return c.JSON(http.StatusCreated, response)
}

func validDeliveryDate(value string) bool {
	deliveryDate, err := time.ParseInLocation("2006-01-02", value, iranTime)
	today, _ := time.ParseInLocation("2006-01-02", time.Now().In(iranTime).Format("2006-01-02"), iranTime)
	return err == nil && !deliveryDate.Before(today)
}

func cancelStaleWaitingInfoOrders(db *gorm.DB, now time.Time) (int64, error) {
	var cancelled int64
	err := db.Transaction(func(tx *gorm.DB) error {
		cutoff := now.Add(-staleWaitingInfoAge)
		var orderIDs []uint
		if err := tx.Model(&Order{}).Where("status = ? AND created_at <= ?", waitingInfoStatus, cutoff).Pluck("id", &orderIDs).Error; err != nil {
			return err
		}
		for _, orderID := range orderIDs {
			result := tx.Model(&Order{}).Where("id = ? AND status = ? AND created_at <= ?", orderID, waitingInfoStatus, cutoff).Update("status", "cancelled")
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				continue
			}
			if err := tx.Create(&OrderStatusHistory{OrderID: orderID, PreviousStatus: waitingInfoStatus, NewStatus: "cancelled"}).Error; err != nil {
				return err
			}
			cancelled++
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return cancelled, nil
}

func updateOrder(db *gorm.DB, cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		orderID, err := strconv.ParseUint(c.Param("orderID"), 10, 64)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
		}
		var input struct {
			EstimatedDeliveryDate *string `json:"estimatedDeliveryDate"`
			Status                *string `json:"status"`
			CustomerFullName      *string `json:"customerFullName"`
			CustomerMobile        *string `json:"customerMobile"`
			CustomerAddress       *string `json:"customerAddress"`
			CustomerPostalCode    *string `json:"customerPostalCode"`
			CustomerNote          *string `json:"customerNote"`
			ShipmentTrackingCode  *string `json:"shipmentTrackingCode"`
			SalesChannel          *string `json:"salesChannel"`
			ConversationReference *string `json:"conversationReference"`
			InstagramUsername     *string `json:"instagramUsername"`
			InternalNote          *string `json:"internalNote"`
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
		if input.EstimatedDeliveryDate == nil && input.Status == nil && input.CustomerFullName == nil && input.CustomerMobile == nil && input.CustomerAddress == nil && input.CustomerPostalCode == nil && input.CustomerNote == nil && input.ShipmentTrackingCode == nil && input.SalesChannel == nil && input.ConversationReference == nil && input.InstagramUsername == nil && input.InternalNote == nil {
			return echo.NewHTTPError(http.StatusBadRequest, "تغییری برای ذخیره ارسال نشده است.")
		}
		if input.EstimatedDeliveryDate != nil {
			value := strings.TrimSpace(*input.EstimatedDeliveryDate)
			if !validDeliveryDate(value) {
				return echo.NewHTTPError(http.StatusBadRequest, "تاریخ تحویل باید امروز یا بعد از آن باشد.")
			}
			input.EstimatedDeliveryDate = &value
		}
		if input.Status != nil {
			value := strings.TrimSpace(*input.Status)
			if !validOrderStatuses[value] {
				return echo.NewHTTPError(http.StatusBadRequest, "وضعیت سفارش معتبر نیست.")
			}
			input.Status = &value
		}
		if input.ShipmentTrackingCode != nil {
			value := strings.TrimSpace(*input.ShipmentTrackingCode)
			if len([]rune(value)) > 100 {
				return echo.NewHTTPError(http.StatusBadRequest, "کد رهگیری بیش از حد طولانی است.")
			}
			input.ShipmentTrackingCode = &value
		}
		if input.SalesChannel != nil {
			value := strings.TrimSpace(*input.SalesChannel)
			if !validSalesChannels[value] {
				return echo.NewHTTPError(http.StatusBadRequest, "کانال فروش معتبر نیست.")
			}
			input.SalesChannel = &value
		}
		if input.ConversationReference == nil && input.InstagramUsername != nil {
			value := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(*input.InstagramUsername), "@"))
			input.ConversationReference = &value
		}
		if input.ConversationReference != nil {
			value := strings.TrimSpace(*input.ConversationReference)
			if len([]rune(value)) > 100 {
				return echo.NewHTTPError(http.StatusBadRequest, "مرجع گفتگو بیش از حد طولانی است.")
			}
			input.ConversationReference = &value
		}
		if input.InternalNote != nil {
			value := strings.TrimSpace(*input.InternalNote)
			if len([]rune(value)) > 1000 {
				return echo.NewHTTPError(http.StatusBadRequest, "یادداشت داخلی بیش از حد طولانی است.")
			}
			input.InternalNote = &value
		}
		admin := c.Get(adminContextKey).(*Admin)
		err = db.Transaction(func(tx *gorm.DB) error {
			var order Order
			err := tx.Joins("JOIN shops ON shops.id = orders.shop_id").Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", admin.ID).Where("orders.id = ?", orderID).First(&order).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
			}
			if err != nil {
				return err
			}
			updates := map[string]any{}
			if input.EstimatedDeliveryDate != nil {
				updates["estimated_delivery_date"] = *input.EstimatedDeliveryDate
			}
			if input.ShipmentTrackingCode != nil {
				updates["shipment_tracking_code"] = *input.ShipmentTrackingCode
			}
			if input.SalesChannel != nil {
				updates["sales_channel"] = *input.SalesChannel
			}
			if input.ConversationReference != nil {
				updates["conversation_reference"] = *input.ConversationReference
			}
			if input.InternalNote != nil {
				updates["internal_note"] = *input.InternalNote
			}
			customerUpdate := input.CustomerFullName != nil || input.CustomerMobile != nil || input.CustomerAddress != nil || input.CustomerPostalCode != nil || input.CustomerNote != nil
			if customerUpdate {
				if order.CustomerSubmittedAt == nil {
					return echo.NewHTTPError(http.StatusConflict, "اطلاعات مشتری هنوز ثبت نشده است.")
				}
				details := customerDetails{order.CustomerFullName, order.CustomerMobile, order.CustomerAddress, order.CustomerPostalCode, order.CustomerNote}
				if input.CustomerFullName != nil {
					details.fullName = strings.TrimSpace(*input.CustomerFullName)
				}
				if input.CustomerMobile != nil {
					details.mobile = normalizeIranianMobile(*input.CustomerMobile)
				}
				if input.CustomerAddress != nil {
					details.address = strings.TrimSpace(*input.CustomerAddress)
				}
				if input.CustomerPostalCode != nil {
					details.postalCode = normalizeDigits(*input.CustomerPostalCode)
				}
				if input.CustomerNote != nil {
					details.note = strings.TrimSpace(*input.CustomerNote)
				}
				if err := validateCustomerDetails(details); err != nil {
					return err
				}
				updates["customer_full_name"], updates["customer_mobile"] = details.fullName, details.mobile
				updates["customer_address"], updates["customer_postal_code"], updates["customer_note"] = details.address, details.postalCode, details.note
			}
			statusChanged := input.Status != nil && *input.Status != order.Status
			previousStatus := order.Status
			if statusChanged {
				if *input.Status == waitingInfoStatus && order.CustomerSubmittedAt != nil {
					return echo.NewHTTPError(http.StatusConflict, "اطلاعات مشتری قبلاً ثبت شده است و سفارش نمی‌تواند در انتظار اطلاعات باشد.")
				}
				if *input.Status == waitingPaymentStatus && order.ReceiptFilePath == "" {
					return echo.NewHTTPError(http.StatusConflict, "برای وضعیت در انتظار تأیید پرداخت، تصویر رسید الزامی است.")
				}
				updates["status"] = *input.Status
			}
			if len(updates) > 0 {
				if err := tx.Model(&order).Updates(updates).Error; err != nil {
					return err
				}
			}
			if statusChanged {
				return tx.Create(&OrderStatusHistory{OrderID: order.ID, PreviousStatus: previousStatus, NewStatus: *input.Status, ChangedByAdminID: &admin.ID}).Error
			}
			return nil
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

func listOrders(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		shopID, err := strconv.ParseUint(c.QueryParam("shopId"), 10, 64)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "فروشگاه پیدا نشد.")
		}
		admin := c.Get(adminContextKey).(*Admin)
		var shop Shop
		if err := db.Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", admin.ID).Where("shops.id = ?", shopID).First(&shop).Error; errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "فروشگاه پیدا نشد.")
		} else if err != nil {
			return err
		}
		status := strings.TrimSpace(c.QueryParam("status"))
		if status != "" && !validOrderStatuses[status] {
			return echo.NewHTTPError(http.StatusBadRequest, "وضعیت سفارش معتبر نیست.")
		}
		view := strings.TrimSpace(c.QueryParam("view"))
		if view == "" {
			view = "active"
		}
		if view != "active" && view != "archive" && view != "all" {
			return echo.NewHTTPError(http.StatusBadRequest, "نمای سفارش‌ها معتبر نیست.")
		}
		search := strings.TrimSpace(c.QueryParam("q"))
		if len([]rune(search)) > 100 {
			return echo.NewHTTPError(http.StatusBadRequest, "عبارت جستجو بیش از حد طولانی است.")
		}
		if search != "" {
			view = "all"
		}
		sortBy := strings.TrimSpace(c.QueryParam("sort"))
		if sortBy == "" {
			if view == "active" {
				sortBy = "due"
			} else {
				sortBy = "updated"
			}
		}
		if sortBy != "due" && sortBy != "updated" && sortBy != "recent" && sortBy != "amount" {
			return echo.NewHTTPError(http.StatusBadRequest, "ترتیب سفارش‌ها معتبر نیست.")
		}
		offset := 0
		if value := strings.TrimSpace(c.QueryParam("offset")); value != "" {
			offset, err = strconv.Atoi(value)
			if err != nil || offset < 0 {
				return echo.NewHTTPError(http.StatusBadRequest, "صفحه سفارش‌ها معتبر نیست.")
			}
		}
		var counts []struct {
			Status string
			Count  int64
		}
		if err := db.Model(&Order{}).Select("status, COUNT(*) AS count").Where("shop_id = ?", shop.ID).Group("status").Scan(&counts).Error; err != nil {
			return err
		}
		var activeCount, archivedCount int64
		for _, count := range counts {
			if count.Status == "shipped" || count.Status == "cancelled" {
				archivedCount += count.Count
			} else {
				activeCount += count.Count
			}
		}
		query := db.Preload("Items.Product").Where("shop_id = ?", shop.ID)
		switch view {
		case "active":
			query = query.Where("status NOT IN ?", []string{"shipped", "cancelled"})
		case "archive":
			query = query.Where("status IN ?", []string{"shipped", "cancelled"})
		}
		if status != "" {
			query = query.Where("status = ?", status)
		}
		if search != "" {
			escaped := strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(search)
			like := "%" + escaped + "%"
			mobile := normalizeIranianMobile(search)
			conditions := "customer_full_name ILIKE ? ESCAPE '\\' OR conversation_reference ILIKE ? ESCAPE '\\'"
			args := []any{like, like}
			if mobile != "" {
				conditions += " OR customer_mobile LIKE ?"
				args = append(args, "%"+mobile+"%")
			}
			orderCode := strings.TrimPrefix(normalizeDigits(search), "#")
			if id, parseErr := strconv.ParseUint(orderCode, 10, 64); parseErr == nil {
				conditions += " OR id = ?"
				args = append(args, id)
			}
			query = query.Where("("+conditions+")", args...)
		}
		var orders []Order
		switch sortBy {
		case "due":
			query = query.Order("CASE WHEN status IN ('shipped', 'cancelled') THEN 1 ELSE 0 END, estimated_delivery_date ASC, created_at DESC, id DESC")
		case "updated":
			query = query.Order("updated_at DESC, id DESC")
		case "amount":
			query = query.Order("amount DESC, created_at DESC, id DESC")
		default:
			query = query.Order("created_at DESC, id DESC")
		}
		if err := query.Offset(offset).Limit(21).Find(&orders).Error; err != nil {
			return err
		}
		hasMore := len(orders) > 20
		if hasMore {
			orders = orders[:20]
		}
		type orderSummary struct {
			ID                    uint      `json:"id"`
			OrderCode             string    `json:"orderCode"`
			ProductSummary        string    `json:"productSummary"`
			CustomerFullName      string    `json:"customerFullName,omitempty"`
			CustomerSubmitted     bool      `json:"customerSubmitted"`
			ReceiptUploaded       bool      `json:"receiptUploaded"`
			InitialPaymentAmount  *int64    `json:"initialPaymentAmount,omitempty"`
			FinalPaymentRequested bool      `json:"finalPaymentRequested"`
			FinalReceiptUploaded  bool      `json:"finalReceiptUploaded"`
			FinalPaymentConfirmed bool      `json:"finalPaymentConfirmed"`
			HasTrackingCode       bool      `json:"hasTrackingCode"`
			Amount                int64     `json:"amount"`
			Status                string    `json:"status"`
			EstimatedDeliveryDate string    `json:"estimatedDeliveryDate"`
			CreatedAt             time.Time `json:"createdAt"`
			UpdatedAt             time.Time `json:"updatedAt"`
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
			response[i] = orderSummary{
				ID: order.ID, OrderCode: fmt.Sprintf("#%d", order.ID), ProductSummary: productSummary,
				CustomerFullName: order.CustomerFullName, CustomerSubmitted: order.CustomerSubmittedAt != nil,
				ReceiptUploaded: order.ReceiptFilePath != "", InitialPaymentAmount: order.InitialPaymentAmount,
				FinalPaymentRequested: order.FinalPaymentRequestedAt != nil, FinalReceiptUploaded: order.FinalReceiptFilePath != "", FinalPaymentConfirmed: order.FinalPaymentConfirmedAt != nil,
				HasTrackingCode: order.ShipmentTrackingCode != "",
				Amount:          order.Amount, Status: order.Status, EstimatedDeliveryDate: order.EstimatedDeliveryDate, CreatedAt: order.CreatedAt, UpdatedAt: order.UpdatedAt,
			}
		}
		return c.JSON(http.StatusOK, map[string]any{"orders": response, "hasMore": hasMore, "activeCount": activeCount, "archivedCount": archivedCount})
	}
}

func getOrder(db *gorm.DB, cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		orderID, err := strconv.ParseUint(c.Param("orderID"), 10, 64)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
		}
		admin := c.Get(adminContextKey).(*Admin)
		order, err := findAdminOrder(db, admin.ID, uint(orderID))
		if err != nil {
			return err
		}
		return adminOrderResponse(c, cfg, order)
	}
}

func findAdminOrder(db *gorm.DB, adminID, orderID uint) (Order, error) {
	var order Order
	err := db.Preload("Shop").Preload("Items.Product").Preload("History", func(query *gorm.DB) *gorm.DB { return query.Order("created_at, id") }).Preload("History.ChangedByAdmin").
		Preload("FinalPaymentConfirmedByAdmin").
		Joins("JOIN shops ON shops.id = orders.shop_id").Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", adminID).Where("orders.id = ?", orderID).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Order{}, echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
	}
	return order, err
}

func adminOrderResponse(c echo.Context, cfg config, order Order) error {
	type itemResponse struct {
		Name      string `json:"name"`
		ImagePath string `json:"imagePath"`
		Quantity  int    `json:"quantity"`
		UnitPrice int64  `json:"unitPrice"`
	}
	items := make([]itemResponse, len(order.Items))
	for i, item := range order.Items {
		items[i] = itemResponse{item.Product.Name, item.Product.MainImagePath, item.Quantity, item.UnitPrice}
	}
	type historyResponse struct {
		PreviousStatus     string    `json:"previousStatus,omitempty"`
		NewStatus          string    `json:"newStatus"`
		ChangedByAdminName string    `json:"changedByAdminName,omitempty"`
		CreatedAt          time.Time `json:"createdAt"`
	}
	history := make([]historyResponse, len(order.History))
	for i, entry := range order.History {
		adminName := ""
		if entry.ChangedByAdmin != nil {
			adminName = entry.ChangedByAdmin.Name
		}
		history[i] = historyResponse{entry.PreviousStatus, entry.NewStatus, adminName, entry.CreatedAt}
	}
	response := map[string]any{
		"id": order.ID, "orderCode": fmt.Sprintf("#%d", order.ID),
		"shop": map[string]any{"id": order.Shop.ID, "name": order.Shop.Name}, "items": items,
		"amount": order.Amount, "status": order.Status, "estimatedDeliveryDate": order.EstimatedDeliveryDate,
		"salesChannel": order.SalesChannel, "conversationReference": order.ConversationReference, "internalNote": order.InternalNote,
		"customerFullName": order.CustomerFullName, "customerMobile": order.CustomerMobile,
		"customerAddress": order.CustomerAddress, "customerPostalCode": order.CustomerPostalCode,
		"customerNote": order.CustomerNote, "customerSubmitted": order.CustomerSubmittedAt != nil,
		"receiptUploaded":      order.ReceiptFilePath != "",
		"shipmentTrackingCode": order.ShipmentTrackingCode, "history": history,
		"createdAt": order.CreatedAt, "updatedAt": order.UpdatedAt, "customerSubmittedAt": order.CustomerSubmittedAt,
		"customerUrl":              cfg.appOrigin + "/o/" + order.SecretToken,
		"finalPaymentRequested":    order.FinalPaymentRequestedAt != nil,
		"finalPaymentRequestedAt":  order.FinalPaymentRequestedAt,
		"finalPaymentCardNumber":   order.FinalPaymentCardNumber,
		"finalPaymentInstructions": order.FinalPaymentInstructions,
		"finalReceiptUploaded":     order.FinalReceiptFilePath != "",
		"finalPaymentConfirmed":    order.FinalPaymentConfirmedAt != nil,
		"finalPaymentConfirmedAt":  order.FinalPaymentConfirmedAt,
	}
	if order.InitialPaymentAmount != nil {
		response["initialPaymentAmount"] = *order.InitialPaymentAmount
		response["finalPaymentAmount"] = order.Amount - *order.InitialPaymentAmount
	}
	if order.FinalPaymentConfirmedByAdmin != nil {
		response["finalPaymentConfirmedByAdminName"] = order.FinalPaymentConfirmedByAdmin.Name
	}
	if order.ReceiptFilePath != "" {
		response["receiptUrl"] = fmt.Sprintf("/api/orders/%d/receipt", order.ID)
	}
	if order.FinalReceiptFilePath != "" {
		response["finalReceiptUrl"] = fmt.Sprintf("/api/orders/%d/final-payment/receipt", order.ID)
	}
	return c.JSON(http.StatusOK, response)
}

func getOrderReceipt(db *gorm.DB, cfg config) echo.HandlerFunc {
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
		return serveReceipt(c, cfg, order.ReceiptFilePath)
	}
}

func serveReceipt(c echo.Context, cfg config, receiptPath string) error {
	if receiptPath == "" || filepath.Base(receiptPath) != receiptPath {
		return echo.NewHTTPError(http.StatusNotFound, "رسید پیدا نشد.")
	}
	file, err := os.Open(filepath.Join(cfg.receiptDir, receiptPath))
	if os.IsNotExist(err) {
		return echo.NewHTTPError(http.StatusNotFound, "رسید پیدا نشد.")
	}
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return err
	}
	header := make([]byte, 512)
	read, err := file.Read(header)
	if err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return err
	}
	contentType := http.DetectContentType(header[:read])
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
		return echo.NewHTTPError(http.StatusNotFound, "رسید پیدا نشد.")
	}
	c.Response().Header().Set(echo.HeaderContentType, contentType)
	c.Response().Header().Set(echo.HeaderContentDisposition, "inline")
	c.Response().Header().Set(echo.HeaderCacheControl, "no-store")
	http.ServeContent(c.Response(), c.Request(), receiptPath, info.ModTime(), file)
	return nil
}

func rotateCustomerLink(db *gorm.DB, cfg config) echo.HandlerFunc {
	return func(c echo.Context) error {
		orderID, err := strconv.ParseUint(c.Param("orderID"), 10, 64)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
		}
		token, err := newOpaqueToken()
		if err != nil {
			return err
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
			if err := tx.Model(&order).Update("secret_token", token).Error; err != nil {
				return err
			}
			return tx.Create(&PilotEvent{EventName: "order_link_rotated", OrderID: &order.ID, AdminID: &admin.ID}).Error
		})
		if err != nil {
			return err
		}
		return c.JSON(http.StatusOK, map[string]string{"customerUrl": cfg.appOrigin + "/o/" + token})
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
	err := db.Preload("Shop").Preload("Items.Product").Preload("History", func(query *gorm.DB) *gorm.DB { return query.Order("created_at, id") }).First(&order, "secret_token = ?", token).Error
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
	type publicHistory struct {
		Status    string    `json:"status"`
		CreatedAt time.Time `json:"createdAt"`
	}
	history := make([]publicHistory, len(order.History))
	for i, entry := range order.History {
		history[i] = publicHistory{entry.NewStatus, entry.CreatedAt}
	}
	submitted := order.CustomerSubmittedAt != nil
	receiptUploaded := order.ReceiptFilePath != ""
	paymentCardNumber := order.PaymentCardNumber
	paymentInstructions := order.PaymentInstructions
	if paymentCardNumber == "" {
		paymentCardNumber = order.Shop.PaymentCardNumber
		paymentInstructions = order.Shop.PaymentInstructions
	}
	response := map[string]any{
		"orderCode":                 fmt.Sprintf("#%d", order.ID),
		"shop":                      map[string]any{"name": order.Shop.Name, "logoPath": order.Shop.LogoPath},
		"items":                     items,
		"amount":                    order.Amount,
		"status":                    order.Status,
		"estimatedDeliveryDate":     order.EstimatedDeliveryDate,
		"paymentCardNumber":         paymentCardNumber,
		"paymentInstructions":       paymentInstructions,
		"customerSubmitted":         submitted,
		"customerSubmissionAllowed": !submitted && order.Status == waitingInfoStatus,
		"receiptUploaded":           receiptUploaded,
		"shipmentTrackingCode":      order.ShipmentTrackingCode,
		"updatedAt":                 order.UpdatedAt,
		"history":                   history,
		"finalPaymentRequested":     order.FinalPaymentRequestedAt != nil,
		"finalReceiptUploaded":      order.FinalReceiptFilePath != "",
		"finalPaymentConfirmed":     order.FinalPaymentConfirmedAt != nil,
	}
	if order.InitialPaymentAmount != nil {
		response["initialPaymentAmount"] = *order.InitialPaymentAmount
		response["finalPaymentAmount"] = order.Amount - *order.InitialPaymentAmount
	}
	if order.FinalPaymentRequestedAt != nil {
		response["finalPaymentCardNumber"] = order.FinalPaymentCardNumber
		response["finalPaymentInstructions"] = order.FinalPaymentInstructions
	}
	if support := publicSupport(order); support != nil {
		response["support"] = support
	}
	if submitted {
		mobile := order.CustomerMobile
		if len(mobile) > 8 {
			mobile = mobile[:4] + "•••" + mobile[len(mobile)-4:]
		}
		address := []rune(order.CustomerAddress)
		visibleAddress := len(address) - 4
		if visibleAddress > 24 {
			visibleAddress = 24
		}
		if visibleAddress < 0 {
			visibleAddress = 0
		}
		postalCode := order.CustomerPostalCode
		if len(postalCode) > 4 {
			postalCode = postalCode[len(postalCode)-4:]
		}
		response["customerSummary"] = map[string]string{
			"fullName": order.CustomerFullName, "mobile": mobile,
			"addressPreview": string(address[:visibleAddress]) + "…", "postalCodeSuffix": postalCode,
		}
	}
	return c.JSON(status, response)
}

func publicSupport(order Order) map[string]string {
	message := fmt.Sprintf("سلام، درباره سفارش #%d سوال دارم.", order.ID)
	if order.CustomerSubmittedAt != nil {
		message = fmt.Sprintf("برای سفارش #%d نیاز به اصلاح اطلاعات دارم.", order.ID)
	}
	switch order.Shop.SupportChannel {
	case "instagram":
		if order.Shop.InstagramUsername != "" {
			return map[string]string{"channel": "instagram", "url": "https://ig.me/m/" + order.Shop.InstagramUsername, "message": message}
		}
	case "whatsapp":
		if order.Shop.WhatsAppNumber != "" {
			return map[string]string{"channel": "whatsapp", "url": "https://wa.me/" + order.Shop.WhatsAppNumber + "?text=" + url.QueryEscape(message), "message": message}
		}
	}
	return nil
}

func recordPublicSupportClick(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		order, err := findPublicOrder(db, c.Param("token"))
		if err != nil {
			return err
		}
		support := publicSupport(order)
		if support == nil {
			return echo.NewHTTPError(http.StatusNotFound, "راه ارتباطی فروشگاه پیدا نشد.")
		}
		action := "message_shop"
		if order.CustomerSubmittedAt != nil {
			action = "correction_request"
		}
		metadata, _ := json.Marshal(map[string]string{"action": action, "channel": support["channel"]})
		if err := db.Create(&PilotEvent{EventName: "public_support_clicked", OrderID: &order.ID, Metadata: string(metadata)}).Error; err != nil {
			return err
		}
		return c.NoContent(http.StatusNoContent)
	}
}

func recordLinkCopied(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		orderID, err := strconv.ParseUint(c.Param("orderID"), 10, 64)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "سفارش پیدا نشد.")
		}
		admin := c.Get(adminContextKey).(*Admin)
		var order Order
		err = db.Joins("JOIN shops ON shops.id = orders.shop_id").Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", admin.ID).Where("orders.id = ?", orderID).First(&order).Error
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
