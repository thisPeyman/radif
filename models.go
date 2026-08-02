package main

import "time"

type Admin struct {
	ID           uint   `gorm:"primaryKey"`
	Name         string `gorm:"not null"`
	Login        string `gorm:"not null;uniqueIndex"`
	PasswordHash string `gorm:"not null"`
	Active       bool   `gorm:"not null"`
	CreatedAt    time.Time
}

type Session struct {
	TokenHash string `gorm:"primaryKey"`
	AdminID   uint   `gorm:"not null;index"`
	Admin     Admin
	ExpiresAt time.Time `gorm:"not null;index"`
	CreatedAt time.Time
}

type AdminShop struct {
	AdminID   uint `gorm:"primaryKey"`
	ShopID    uint `gorm:"primaryKey"`
	CreatedAt time.Time
}

type Shop struct {
	ID                   uint   `gorm:"primaryKey"`
	Name                 string `gorm:"not null"`
	LogoPath             string
	ShortDescription     string
	PaymentCardNumber    string `gorm:"not null"`
	PaymentInstructions  string `gorm:"not null"`
	InstagramUsername    string `gorm:"not null"`
	WhatsAppNumber       string `gorm:"column:whatsapp_number;not null"`
	SupportChannel       string `gorm:"not null"`
	ShareMessageTemplate string `gorm:"not null"`
	Active               bool   `gorm:"not null;index"`
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

type Product struct {
	ID               uint `gorm:"primaryKey"`
	ShopID           uint `gorm:"not null;uniqueIndex:idx_products_shop_name"`
	Shop             Shop
	Name             string `gorm:"not null;uniqueIndex:idx_products_shop_name"`
	MainImagePath    string `gorm:"not null"`
	DefaultPrice     int64  `gorm:"not null"`
	ShortDescription string
	Active           bool `gorm:"not null;index"`
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type Order struct {
	ID                    uint   `gorm:"primaryKey"`
	CreateKey             string `gorm:"not null;uniqueIndex"`
	CreateFingerprint     string `gorm:"not null"`
	SecretToken           string `gorm:"not null;uniqueIndex"`
	ShopID                uint   `gorm:"not null;index"`
	Shop                  Shop
	Items                 []OrderItem
	History               []OrderStatusHistory
	Amount                int64  `gorm:"not null"`
	EstimatedDeliveryDate string `gorm:"not null"`
	InstagramUsername     string
	InternalNote          string
	CustomerFullName      string
	CustomerMobile        string
	CustomerAddress       string
	CustomerPostalCode    string
	CustomerNote          string
	ReceiptFilePath       string
	Status                string `gorm:"not null;index"`
	ShipmentTrackingCode  string
	CustomerSubmittedAt   *time.Time
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

type OrderItem struct {
	ID        uint `gorm:"primaryKey"`
	OrderID   uint `gorm:"not null;uniqueIndex:idx_order_items_order_product"`
	Order     Order
	ProductID uint `gorm:"not null;uniqueIndex:idx_order_items_order_product"`
	Product   Product
	Quantity  int   `gorm:"not null"`
	UnitPrice int64 `gorm:"not null"`
	CreatedAt time.Time
}

type OrderStatusHistory struct {
	ID               uint `gorm:"primaryKey"`
	OrderID          uint `gorm:"not null;index"`
	Order            Order
	PreviousStatus   string
	NewStatus        string `gorm:"not null"`
	ChangedByAdminID *uint
	ChangedByAdmin   *Admin `gorm:"foreignKey:ChangedByAdminID"`
	CreatedAt        time.Time
}

type PilotEvent struct {
	ID        uint   `gorm:"primaryKey"`
	EventName string `gorm:"not null;index"`
	OrderID   *uint  `gorm:"index"`
	Order     *Order
	AdminID   *uint `gorm:"index"`
	Admin     *Admin
	Metadata  string `gorm:"type:text"`
	CreatedAt time.Time
}
