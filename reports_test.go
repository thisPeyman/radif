package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func TestShopReport(t *testing.T) {
	db, e, _, admin := newAuthTestServer(t)
	cookie := loginCookie(t, e)
	var shop Shop
	if err := db.First(&shop).Error; err != nil {
		t.Fatal(err)
	}
	var products []Product
	if err := db.Where("shop_id = ?", shop.ID).Order("id").Find(&products).Error; err != nil {
		t.Fatal(err)
	}

	statuses := []string{"waiting_info", "waiting_payment", "paid", "preparing", "shipped", "cancelled"}
	amounts := []int64{100, 200, 300, 500, 700, 900}
	orders := make([]Order, len(statuses))
	for i, status := range statuses {
		key := fmt.Sprintf("report-%d", i)
		orders[i] = Order{CreateKey: key, CreateFingerprint: key, SecretToken: key, ShopID: shop.ID, Amount: amounts[i], EstimatedDeliveryDate: "2026-01-01", Status: status}
		if err := db.Create(&orders[i]).Error; err != nil {
			t.Fatal(err)
		}
	}
	items := []OrderItem{
		{OrderID: orders[0].ID, ProductID: products[0].ID, Quantity: 20, UnitPrice: 100},
		{OrderID: orders[2].ID, ProductID: products[0].ID, Quantity: 2, UnitPrice: 100},
		{OrderID: orders[3].ID, ProductID: products[1].ID, Quantity: 3, UnitPrice: 100},
		{OrderID: orders[4].ID, ProductID: products[0].ID, Quantity: 4, UnitPrice: 100},
		{OrderID: orders[4].ID, ProductID: products[1].ID, Quantity: 1, UnitPrice: 100},
		{OrderID: orders[5].ID, ProductID: products[1].ID, Quantity: 20, UnitPrice: 100},
	}
	if err := db.Create(&items).Error; err != nil {
		t.Fatal(err)
	}

	path := fmt.Sprintf("/api/shops/%d/report", shop.ID)
	response := request(e, http.MethodGet, path, "", "", cookie)
	if response.Code != http.StatusOK {
		t.Fatalf("report returned %d: %s", response.Code, response.Body.String())
	}
	var report shopReportResponse
	if err := json.Unmarshal(response.Body.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if report.OrderCount != 6 || report.ConfirmedOrderCount != 3 || report.ConfirmedOrderValue != 1500 || report.AverageOrderValue != 500 {
		t.Fatalf("unexpected summary: %#v", report)
	}
	for _, status := range statuses {
		if report.StatusCounts[status] != 1 {
			t.Errorf("status %s count = %d, want 1", status, report.StatusCounts[status])
		}
	}
	if len(report.TopProducts) != 2 || report.TopProducts[0].ID != products[0].ID || report.TopProducts[0].Quantity != 6 || report.TopProducts[1].ID != products[1].ID || report.TopProducts[1].Quantity != 4 {
		t.Fatalf("unexpected top products: %#v", report.TopProducts)
	}

	if response := request(e, http.MethodGet, path, "", "", nil); response.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated report returned %d", response.Code)
	}
	foreignShop := Shop{Name: "فروشگاه گزارش دیگر", PaymentCardNumber: "6037991812345678", PaymentInstructions: "آزمایشی", Active: true}
	if err := db.Create(&foreignShop).Error; err != nil {
		t.Fatal(err)
	}
	if response := request(e, http.MethodGet, fmt.Sprintf("/api/shops/%d/report", foreignShop.ID), "", "", cookie); response.Code != http.StatusNotFound {
		t.Fatalf("foreign report returned %d", response.Code)
	}

	emptyShop := Shop{Name: "فروشگاه گزارش خالی", PaymentCardNumber: "6037991812345678", PaymentInstructions: "آزمایشی", Active: true}
	if err := db.Create(&emptyShop).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&AdminShop{AdminID: admin.ID, ShopID: emptyShop.ID}).Error; err != nil {
		t.Fatal(err)
	}
	response = request(e, http.MethodGet, fmt.Sprintf("/api/shops/%d/report", emptyShop.ID), "", "", cookie)
	if response.Code != http.StatusOK {
		t.Fatalf("empty report returned %d: %s", response.Code, response.Body.String())
	}
	if err := json.Unmarshal(response.Body.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if report.OrderCount != 0 || report.ConfirmedOrderValue != 0 || len(report.TopProducts) != 0 {
		t.Fatalf("unexpected empty report: %#v", report)
	}
}
