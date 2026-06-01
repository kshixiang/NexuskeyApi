package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	DigitalOrderStatusPending   = "pending"
	DigitalOrderStatusPaid      = "paid"
	DigitalOrderStatusDelivered = "delivered"
	DigitalOrderStatusFailed    = "failed"
	DigitalOrderStatusExpired   = "expired"

	defaultDigitalProductSlug = "cursor-pro"
)

var (
	ErrDigitalProductNotFound      = errors.New("digital product not found")
	ErrDigitalProductOrderNotFound = errors.New("digital product order not found")
	ErrDigitalProductOrderInvalid  = errors.New("digital product order status invalid")
)

type DigitalProduct struct {
	Id           int     `json:"id"`
	Slug         string  `json:"slug" gorm:"unique;type:varchar(64);index"`
	Title        string  `json:"title" gorm:"type:varchar(255)"`
	Subtitle     string  `json:"subtitle" gorm:"type:varchar(255);default:''"`
	Description  string  `json:"description" gorm:"type:text"`
	PriceAmount  float64 `json:"price_amount"`
	Currency     string  `json:"currency" gorm:"type:varchar(16);default:'CNY'"`
	Enabled      bool    `json:"enabled" gorm:"default:true"`
	Sort         int     `json:"sort" gorm:"default:0"`
	FeatureLines string  `json:"feature_lines" gorm:"type:text"` // newline-separated bullet points
	CreatedAt    int64   `json:"created_at" gorm:"bigint"`
	UpdatedAt    int64   `json:"updated_at" gorm:"bigint"`
}

func (p *DigitalProduct) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	if p.CreatedAt == 0 {
		p.CreatedAt = now
	}
	p.UpdatedAt = now
	return nil
}

func (p *DigitalProduct) BeforeUpdate(tx *gorm.DB) error {
	p.UpdatedAt = common.GetTimestamp()
	return nil
}

type DigitalProductOrder struct {
	Id              int     `json:"id"`
	ProductId       int     `json:"product_id" gorm:"index"`
	TradeNo         string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	ContactEmail    string  `json:"contact_email" gorm:"type:varchar(255);default:''"`
	ContactPhone    string  `json:"contact_phone" gorm:"type:varchar(64);default:''"`
	Money           float64 `json:"money"`
	PaymentMethod   string  `json:"payment_method" gorm:"type:varchar(50)"`
	PaymentProvider string  `json:"payment_provider" gorm:"type:varchar(50);default:''"`
	Status          string  `json:"status" gorm:"type:varchar(32);index"`
	CreateTime      int64   `json:"create_time" gorm:"bigint"`
	CompleteTime    int64   `json:"complete_time" gorm:"bigint;default:0"`
	ProviderPayload string  `json:"provider_payload" gorm:"type:text"`
	DeliverNote     string  `json:"deliver_note" gorm:"type:text"`
	DeliveredAt     int64   `json:"delivered_at" gorm:"bigint;default:0"`
	DeliveredBy     int     `json:"delivered_by" gorm:"default:0"`

	Product *DigitalProduct `json:"product,omitempty" gorm:"-"`
}

func (o *DigitalProductOrder) Insert() error {
	if o.CreateTime == 0 {
		o.CreateTime = common.GetTimestamp()
	}
	if o.Status == "" {
		o.Status = DigitalOrderStatusPending
	}
	return DB.Create(o).Error
}

func GetDigitalProductBySlug(slug string) (*DigitalProduct, error) {
	if slug == "" {
		return nil, ErrDigitalProductNotFound
	}
	var product DigitalProduct
	if err := DB.Where("slug = ?", slug).First(&product).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrDigitalProductNotFound
		}
		return nil, err
	}
	return &product, nil
}

func GetDigitalProductById(id int) (*DigitalProduct, error) {
	if id <= 0 {
		return nil, ErrDigitalProductNotFound
	}
	var product DigitalProduct
	if err := DB.Where("id = ?", id).First(&product).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrDigitalProductNotFound
		}
		return nil, err
	}
	return &product, nil
}

func ListEnabledDigitalProducts() ([]*DigitalProduct, error) {
	var products []*DigitalProduct
	err := DB.Where("enabled = ?", true).
		Order("sort asc, id asc").
		Find(&products).Error
	return products, err
}

func GetDigitalProductOrderByTradeNo(tradeNo string) *DigitalProductOrder {
	if tradeNo == "" {
		return nil
	}
	var order DigitalProductOrder
	if err := DB.Where("trade_no = ?", tradeNo).First(&order).Error; err != nil {
		return nil
	}
	return &order
}

func CompleteDigitalProductOrder(tradeNo string, providerPayload string, expectedPaymentProvider string, actualPaymentMethod string) error {
	if tradeNo == "" {
		return errors.New("tradeNo is empty")
	}
	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var order DigitalProductOrder
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(&order).Error; err != nil {
			return ErrDigitalProductOrderNotFound
		}
		if expectedPaymentProvider != "" && order.PaymentProvider != expectedPaymentProvider {
			return ErrPaymentMethodMismatch
		}
		if order.Status == DigitalOrderStatusPaid || order.Status == DigitalOrderStatusDelivered {
			return nil
		}
		if order.Status != DigitalOrderStatusPending {
			return ErrDigitalProductOrderInvalid
		}
		order.Status = DigitalOrderStatusPaid
		order.CompleteTime = common.GetTimestamp()
		order.ProviderPayload = providerPayload
		if actualPaymentMethod != "" {
			order.PaymentMethod = actualPaymentMethod
		}
		return tx.Save(&order).Error
	})
}

func ExpireDigitalProductOrder(tradeNo string, expectedPaymentProvider string) error {
	if tradeNo == "" {
		return errors.New("tradeNo is empty")
	}
	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var order DigitalProductOrder
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(&order).Error; err != nil {
			return ErrDigitalProductOrderNotFound
		}
		if expectedPaymentProvider != "" && order.PaymentProvider != expectedPaymentProvider {
			return ErrPaymentMethodMismatch
		}
		if order.Status != DigitalOrderStatusPending {
			return nil
		}
		order.Status = DigitalOrderStatusExpired
		order.CompleteTime = common.GetTimestamp()
		return tx.Save(&order).Error
	})
}

func DeliverDigitalProductOrder(orderId int, adminUserId int, note string) error {
	if orderId <= 0 {
		return errors.New("invalid order id")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var order DigitalProductOrder
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("id = ?", orderId).First(&order).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrDigitalProductOrderNotFound
			}
			return err
		}
		if order.Status != DigitalOrderStatusPaid {
			return ErrDigitalProductOrderInvalid
		}
		order.Status = DigitalOrderStatusDelivered
		order.DeliverNote = note
		order.DeliveredAt = common.GetTimestamp()
		order.DeliveredBy = adminUserId
		return tx.Save(&order).Error
	})
}

func ListDigitalProductOrders(pageInfo *common.PageInfo, status string) ([]*DigitalProductOrder, int64, error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&DigitalProductOrder{})
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	var orders []*DigitalProductOrder
	if err := query.Order("id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&orders).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	productCache := map[int]*DigitalProduct{}
	for _, order := range orders {
		if order.ProductId <= 0 {
			continue
		}
		if cached, ok := productCache[order.ProductId]; ok {
			order.Product = cached
			continue
		}
		product, err := GetDigitalProductById(order.ProductId)
		if err == nil && product != nil {
			productCache[order.ProductId] = product
			order.Product = product
		}
	}

	return orders, total, nil
}

func ensureDefaultDigitalProduct() error {
	var count int64
	if err := DB.Model(&DigitalProduct{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	product := &DigitalProduct{
		Slug:        defaultDigitalProductSlug,
		Title:       "Cursor Pro",
		Subtitle:    "Official-style subscription account",
		Description: "Purchase Cursor Pro. After payment we will send account credentials to your email or phone.",
		PriceAmount: 168,
		Currency:    "CNY",
		Enabled:     true,
		Sort:        0,
		FeatureLines: "Full Cursor Pro features\nFast AI coding assistance\nManual delivery after payment",
	}
	if err := DB.Create(product).Error; err != nil {
		return fmt.Errorf("seed default digital product failed: %w", err)
	}
	common.SysLog("default digital product seeded")
	return nil
}
