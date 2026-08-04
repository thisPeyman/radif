package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type historicalOrderInput struct {
	CreateKey string `json:"createKey"`
	ShopID    uint   `json:"shopId"`
	Items     []struct {
		ProductID uint `json:"productId"`
		Quantity  int  `json:"quantity"`
	} `json:"items"`
	Amount                int64  `json:"amount"`
	EstimatedDeliveryDate string `json:"estimatedDeliveryDate"`
	Status                string `json:"status"`
	CustomerFullName      string `json:"customerFullName"`
	CustomerMobile        string `json:"customerMobile"`
	CustomerAddress       string `json:"customerAddress"`
	CustomerPostalCode    string `json:"customerPostalCode"`
	InstagramUsername     string `json:"instagramUsername"`
	InternalNote          string `json:"internalNote"`
}

func historicalReceiptHash(file *multipart.FileHeader) (string, error) {
	if file == nil {
		return "", nil
	}
	source, err := file.Open()
	if err != nil {
		return "", echoImageUnreadable("receipt")
	}
	defer source.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, source); err != nil {
		return "", echoImageUnreadable("receipt")
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func importHistoricalOrder(db *gorm.DB, cfg config) echo.HandlerFunc {
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
			return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات سفارش معتبر نیست.")
		}
		defer c.Request().MultipartForm.RemoveAll()

		var input historicalOrderInput
		decoder := json.NewDecoder(strings.NewReader(c.FormValue("order")))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات سفارش معتبر نیست.")
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			return echo.NewHTTPError(http.StatusBadRequest, "اطلاعات سفارش معتبر نیست.")
		}
		files := c.Request().MultipartForm.File["receipt"]
		if len(files) > 1 {
			return echo.NewHTTPError(http.StatusBadRequest, "فقط یک تصویر رسید انتخاب کنید.")
		}
		var fileHeader *multipart.FileHeader
		if len(files) == 1 {
			fileHeader = files[0]
		}

		input.CreateKey = strings.TrimSpace(input.CreateKey)
		input.EstimatedDeliveryDate = strings.TrimSpace(input.EstimatedDeliveryDate)
		input.Status = strings.TrimSpace(input.Status)
		input.CustomerFullName = strings.TrimSpace(input.CustomerFullName)
		input.CustomerMobile = normalizeIranianMobile(input.CustomerMobile)
		input.CustomerAddress = strings.TrimSpace(input.CustomerAddress)
		input.CustomerPostalCode = normalizeDigits(input.CustomerPostalCode)
		input.InstagramUsername = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(input.InstagramUsername), "@"))
		input.InternalNote = strings.TrimSpace(input.InternalNote)
		if input.CreateKey == "" || len(input.CreateKey) > 100 || input.ShopID == 0 || len(input.Items) == 0 || len(input.Items) > 50 || input.Amount <= 0 || input.Amount > 1<<53-1 {
			return echo.NewHTTPError(http.StatusBadRequest, "محصول و مبلغ سفارش الزامی است.")
		}
		if _, err := time.ParseInLocation("2006-01-02", input.EstimatedDeliveryDate, iranTime); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "تاریخ تحویل معتبر نیست.")
		}
		if input.Status == waitingInfoStatus || !validOrderStatuses[input.Status] {
			return echo.NewHTTPError(http.StatusBadRequest, "وضعیت سفارش قدیمی معتبر نیست.")
		}
		if input.Status == waitingPaymentStatus && fileHeader == nil {
			return echo.NewHTTPError(http.StatusBadRequest, "برای وضعیت در انتظار تأیید پرداخت، تصویر رسید الزامی است.")
		}
		if err := validateCustomerDetails(customerDetails{
			fullName: input.CustomerFullName, mobile: input.CustomerMobile, address: input.CustomerAddress, postalCode: input.CustomerPostalCode,
		}); err != nil {
			return err
		}
		if len([]rune(input.InstagramUsername)) > 100 || len([]rune(input.InternalNote)) > 1000 {
			return echo.NewHTTPError(http.StatusBadRequest, "متن واردشده بیش از حد طولانی است.")
		}

		sort.Slice(input.Items, func(i, j int) bool { return input.Items[i].ProductID < input.Items[j].ProductID })
		productIDs := make([]uint, len(input.Items))
		quantities := make(map[uint]int, len(input.Items))
		for i, item := range input.Items {
			if item.ProductID == 0 || item.Quantity < 1 || item.Quantity > 99 || quantities[item.ProductID] != 0 {
				return echo.NewHTTPError(http.StatusBadRequest, "محصول‌های سفارش معتبر نیستند.")
			}
			productIDs[i] = item.ProductID
			quantities[item.ProductID] = item.Quantity
		}
		receiptHash, err := historicalReceiptHash(fileHeader)
		if err != nil {
			return err
		}
		fingerprintJSON, _ := json.Marshal(struct {
			Kind        string               `json:"kind"`
			Input       historicalOrderInput `json:"input"`
			ReceiptHash string               `json:"receiptHash"`
		}{Kind: "historical", Input: input, ReceiptHash: receiptHash})
		fingerprint := hashToken(string(fingerprintJSON))

		admin := c.Get(adminContextKey).(*Admin)
		respondExisting := func(order Order) error {
			if order.CreateFingerprint != fingerprint {
				return echo.NewHTTPError(http.StatusConflict, "این درخواست قبلاً برای سفارش دیگری استفاده شده است.")
			}
			return orderCreatedResponse(c, cfg, order)
		}
		var existing Order
		err = db.Joins("JOIN shops ON shops.id = orders.shop_id").Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", admin.ID).Where("orders.create_key = ?", input.CreateKey).First(&existing).Error
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
		var receipt *pendingImage
		if fileHeader != nil {
			receipt, err = prepareReceipt(cfg, fileHeader)
			if err != nil {
				return err
			}
			defer func() { receipt.discard() }()
		}
		now := time.Now()
		order := Order{
			CreateKey: input.CreateKey, CreateFingerprint: fingerprint, SecretToken: token,
			ShopID: input.ShopID, Amount: input.Amount, EstimatedDeliveryDate: input.EstimatedDeliveryDate,
			InstagramUsername: input.InstagramUsername, InternalNote: input.InternalNote,
			CustomerFullName: input.CustomerFullName, CustomerMobile: input.CustomerMobile,
			CustomerAddress: input.CustomerAddress, CustomerPostalCode: input.CustomerPostalCode,
			Status: input.Status, CustomerSubmittedAt: &now,
		}
		if receipt != nil {
			order.ReceiptFilePath = receipt.storedName
		}
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
			if err := receipt.commit(); err != nil {
				return err
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
				items[i] = OrderItem{OrderID: order.ID, ProductID: product.ID, Quantity: quantities[product.ID], UnitPrice: product.DefaultPrice}
			}
			if err := tx.Create(&items).Error; err != nil {
				return err
			}
			return tx.Create(&OrderStatusHistory{OrderID: order.ID, NewStatus: input.Status, ChangedByAdminID: &admin.ID}).Error
		})
		if errors.Is(err, errOrderAlreadyCreated) {
			err := db.Joins("JOIN shops ON shops.id = orders.shop_id").Joins("JOIN admin_shops ON admin_shops.shop_id = shops.id AND admin_shops.admin_id = ?", admin.ID).Where("orders.create_key = ?", input.CreateKey).First(&existing).Error
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
		receipt = nil
		return orderCreatedResponse(c, cfg, order)
	}
}
