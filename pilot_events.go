package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	pilotViewWindow           = 30 * time.Minute
	maxPilotFailuresPerWindow = 20
)

func pilotUserAgent(c echo.Context) string {
	userAgent := strings.ToLower(c.Request().UserAgent())
	switch {
	case strings.Contains(userAgent, "instagram"):
		return "instagram"
	case strings.Contains(userAgent, "mobile"), strings.Contains(userAgent, "android"), strings.Contains(userAgent, "iphone"), strings.Contains(userAgent, "ipad"):
		return "mobile"
	case userAgent == "":
		return "unknown"
	default:
		return "desktop"
	}
}

func pilotEventKey(parts ...string) string {
	return hashToken(strings.Join(parts, "\x00"))
}

func keyedPilotEvent(parts ...string) *string {
	key := pilotEventKey(parts...)
	return &key
}

func pilotViewKey(eventName string, now time.Time, subjectIDs ...uint) *string {
	bucket := now.Truncate(pilotViewWindow).Unix()
	parts := []string{eventName, strconv.FormatInt(bucket, 10)}
	for _, subjectID := range subjectIDs {
		parts = append(parts, strconv.FormatUint(uint64(subjectID), 10))
	}
	return keyedPilotEvent(parts...)
}

func recordPilotEvent(db *gorm.DB, event PilotEvent, metadata map[string]any) error {
	if len(metadata) > 0 {
		encoded, err := json.Marshal(metadata)
		if err != nil {
			return err
		}
		event.Metadata = string(encoded)
	}
	return db.Clauses(clause.OnConflict{DoNothing: true}).Create(&event).Error
}

func observePilotEvent(db *gorm.DB, event PilotEvent, metadata map[string]any) {
	if err := recordPilotEvent(db, event, metadata); err != nil {
		log.Printf("record pilot event %s: %v", event.EventName, err)
	}
}

func recordAdminPilotEvent(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		var input struct {
			EventName string `json:"eventName"`
			CreateKey string `json:"createKey"`
			EventKey  string `json:"eventKey"`
			Reason    string `json:"reason"`
			Source    string `json:"source"`
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, 4<<10)
		decoder := json.NewDecoder(c.Request().Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "رویداد معتبر نیست.")
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			return echo.NewHTTPError(http.StatusBadRequest, "رویداد معتبر نیست.")
		}
		input.CreateKey = strings.TrimSpace(input.CreateKey)
		if input.Source == "" {
			input.Source = "normal"
		}
		if (input.EventName != "order_create_started" && input.EventName != "order_create_failed") || input.CreateKey == "" || len(input.CreateKey) > 100 {
			return echo.NewHTTPError(http.StatusBadRequest, "رویداد معتبر نیست.")
		}
		if input.Source != "normal" && input.Source != "historical" {
			return echo.NewHTTPError(http.StatusBadRequest, "رویداد معتبر نیست.")
		}
		metadata := map[string]any{"source": input.Source, "userAgent": pilotUserAgent(c)}
		if input.EventName == "order_create_failed" {
			validReasons := map[string]bool{"client_validation": true, "conflict": true, "request": true, "network": true, "server": true}
			if !validReasons[input.Reason] || input.EventKey == "" || len(input.EventKey) > 100 {
				return echo.NewHTTPError(http.StatusBadRequest, "رویداد معتبر نیست.")
			}
			metadata["reason"] = input.Reason
		}
		admin := c.Get(adminContextKey).(*Admin)
		shop := c.Get(shopContextKey).(*Shop)
		eventKey := keyedPilotEvent(input.CreateKey)
		if input.EventName == "order_create_failed" {
			eventKey = keyedPilotEvent(input.CreateKey, input.EventKey)
		}
		if err := recordPilotEvent(db, PilotEvent{EventName: input.EventName, AdminID: &admin.ID, ShopID: &shop.ID, EventKey: eventKey}, metadata); err != nil {
			return err
		}
		return c.NoContent(http.StatusNoContent)
	}
}

func recordPublicPilotEvent(db *gorm.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		var input struct {
			EventName string `json:"eventName"`
			EventKey  string `json:"eventKey"`
			Reason    string `json:"reason"`
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, 4<<10)
		decoder := json.NewDecoder(c.Request().Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "رویداد معتبر نیست.")
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			return echo.NewHTTPError(http.StatusBadRequest, "رویداد معتبر نیست.")
		}
		if input.EventName != "customer_form_started" && input.EventName != "customer_submission_failed" {
			return echo.NewHTTPError(http.StatusBadRequest, "رویداد معتبر نیست.")
		}
		order, err := findPublicOrder(db, c.Param("token"))
		if err != nil {
			return err
		}
		if input.EventName == "customer_form_started" && (order.CustomerSubmittedAt != nil || order.Status != waitingInfoStatus) {
			return echo.NewHTTPError(http.StatusConflict, "ثبت اطلاعات این سفارش بسته شده است.")
		}
		metadata := map[string]any{"userAgent": pilotUserAgent(c)}
		now := time.Now()
		eventKey := keyedPilotEvent(input.EventName, order.SecretToken)
		if input.EventName == "customer_submission_failed" {
			validReasons := map[string]bool{"client_validation": true, "conflict": true, "request": true, "network": true, "server": true}
			if !validReasons[input.Reason] || input.EventKey == "" || len(input.EventKey) > 100 {
				return echo.NewHTTPError(http.StatusBadRequest, "رویداد معتبر نیست.")
			}
			metadata["reason"] = input.Reason
			eventKey = keyedPilotEvent(order.SecretToken, input.EventKey)
			var recentFailures int64
			if err := db.Model(&PilotEvent{}).Where("order_id = ? AND event_name = ? AND created_at >= ?", order.ID, input.EventName, now.Add(-pilotViewWindow)).Count(&recentFailures).Error; err != nil {
				return err
			}
			if recentFailures >= maxPilotFailuresPerWindow {
				return c.NoContent(http.StatusNoContent)
			}
		}
		if err := recordPilotEvent(db, PilotEvent{EventName: input.EventName, OrderID: &order.ID, ShopID: &order.ShopID, EventKey: eventKey, CreatedAt: now}, metadata); err != nil {
			return err
		}
		return c.NoContent(http.StatusNoContent)
	}
}

func observeOrderView(db *gorm.DB, c echo.Context, eventName string, order Order) {
	now := time.Now()
	event := PilotEvent{
		EventName: eventName,
		OrderID:   &order.ID,
		ShopID:    &order.ShopID,
		EventKey:  pilotViewKey(eventName, now, order.ID),
		CreatedAt: now,
	}
	if admin, ok := c.Get(adminContextKey).(*Admin); ok {
		event.AdminID = &admin.ID
		event.EventKey = pilotViewKey(eventName, now, order.ID, admin.ID)
	}
	observePilotEvent(db, event, map[string]any{"status": order.Status, "userAgent": pilotUserAgent(c)})
}

func observeAdminShopView(db *gorm.DB, c echo.Context, eventName string, adminID, shopID uint) {
	now := time.Now()
	observePilotEvent(db, PilotEvent{
		EventName: eventName,
		AdminID:   &adminID,
		ShopID:    &shopID,
		EventKey:  pilotViewKey(eventName, now, adminID, shopID),
		CreatedAt: now,
	}, map[string]any{"userAgent": pilotUserAgent(c)})
}
