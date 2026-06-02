package controller

import (
	"fmt"
	"net/http"
	"net/mail"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

var chinaPhonePattern = regexp.MustCompile(`^1[3-9]\d{9}$`)

type digitalShopCreateOrderRequest struct {
	ProductSlug   string `json:"product_slug"`
	ContactEmail  string `json:"contact_email"`
	ContactPhone  string `json:"contact_phone"`
	PaymentMethod string `json:"payment_method"`
}

type digitalShopDeliverRequest struct {
	Note string `json:"note"`
}

type adminCursorProProductRequest struct {
	PriceAmount float64 `json:"price_amount"`
	Enabled     bool    `json:"enabled"`
}

func GetDigitalShopPublic(c *gin.Context) {
	products, err := model.ListEnabledDigitalProducts()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	payMethods := []map[string]string{}
	if isEpayTopUpEnabled() {
		payMethods = operation_setting.PayMethods
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"products":             products,
			"enable_online_topup":  isEpayTopUpEnabled(),
			"pay_methods":          payMethods,
			"server_address":       system_setting.ServerAddress,
		},
	})
}

func CreateDigitalShopOrder(c *gin.Context) {
	var req digitalShopCreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	req.ContactEmail = strings.TrimSpace(req.ContactEmail)
	req.ContactPhone = strings.TrimSpace(req.ContactPhone)
	req.ProductSlug = strings.TrimSpace(req.ProductSlug)
	if req.ProductSlug == "" {
		req.ProductSlug = "cursor-pro"
	}

	if req.ContactEmail == "" && req.ContactPhone == "" {
		common.ApiErrorMsg(c, "请填写邮箱或手机号")
		return
	}
	if req.ContactEmail != "" {
		if _, err := mail.ParseAddress(req.ContactEmail); err != nil {
			common.ApiErrorMsg(c, "邮箱格式不正确")
			return
		}
	}
	if req.ContactPhone != "" && !chinaPhonePattern.MatchString(req.ContactPhone) {
		common.ApiErrorMsg(c, "手机号格式不正确")
		return
	}
	if !isEpayTopUpEnabled() {
		common.ApiErrorMsg(c, "在线支付未启用")
		return
	}
	if !operation_setting.ContainsPayMethod(req.PaymentMethod) {
		common.ApiErrorMsg(c, "支付方式不存在")
		return
	}

	product, err := model.GetDigitalProductBySlug(req.ProductSlug)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !product.Enabled {
		common.ApiErrorMsg(c, "商品未上架")
		return
	}
	if product.PriceAmount < 0.01 {
		common.ApiErrorMsg(c, "商品价格无效")
		return
	}

	callBackAddress := service.GetCallbackAddress()
	returnUrl, err := url.Parse(callBackAddress + "/api/digital-shop/epay/return")
	if err != nil {
		common.ApiErrorMsg(c, "回调地址配置错误")
		return
	}
	notifyUrl, err := url.Parse(callBackAddress + "/api/digital-shop/epay/notify")
	if err != nil {
		common.ApiErrorMsg(c, "回调地址配置错误")
		return
	}

	tradeNo := fmt.Sprintf("DPNO%s%d", common.GetRandomString(6), time.Now().Unix())

	client := GetEpayClient()
	if client == nil {
		common.ApiErrorMsg(c, "当前管理员未配置支付信息")
		return
	}

	order := &model.DigitalProductOrder{
		ProductId:       product.Id,
		TradeNo:         tradeNo,
		ContactEmail:    req.ContactEmail,
		ContactPhone:    req.ContactPhone,
		Money:           product.PriceAmount,
		PaymentMethod:   req.PaymentMethod,
		PaymentProvider: model.PaymentProviderEpay,
		Status:          model.DigitalOrderStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	if err := order.Insert(); err != nil {
		common.ApiErrorMsg(c, "创建订单失败")
		return
	}

	uri, params, err := client.Purchase(&epay.PurchaseArgs{
		Type:           req.PaymentMethod,
		ServiceTradeNo: tradeNo,
		Name:           fmt.Sprintf("DP:%s", product.Title),
		Money:          strconv.FormatFloat(product.PriceAmount, 'f', 2, 64),
		Device:         epay.PC,
		NotifyUrl:      notifyUrl,
		ReturnUrl:      returnUrl,
	})
	if err != nil {
		_ = model.ExpireDigitalProductOrder(tradeNo, model.PaymentProviderEpay)
		common.ApiErrorMsg(c, "拉起支付失败")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "success",
		"data":      params,
		"url":       uri,
		"trade_no":  tradeNo,
	})
}

func GetDigitalShopOrderStatus(c *gin.Context) {
	tradeNo := strings.TrimSpace(c.Param("trade_no"))
	if tradeNo == "" {
		common.ApiErrorMsg(c, "订单号无效")
		return
	}
	order := model.GetDigitalProductOrderByTradeNo(tradeNo)
	if order == nil {
		common.ApiErrorMsg(c, "订单不存在")
		return
	}

	product, _ := model.GetDigitalProductById(order.ProductId)
	resp := gin.H{
		"trade_no":      order.TradeNo,
		"status":        order.Status,
		"money":         order.Money,
		"contact_email": maskContactEmail(order.ContactEmail),
		"contact_phone": maskContactPhone(order.ContactPhone),
		"create_time":   order.CreateTime,
		"complete_time": order.CompleteTime,
		"delivered_at":  order.DeliveredAt,
	}
	if product != nil {
		resp["product_title"] = product.Title
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    resp,
	})
}

func DigitalShopEpayNotify(c *gin.Context) {
	params := parseEpayCallbackParams(c)
	if len(params) == 0 {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	client := GetEpayClient()
	if client == nil {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	verifyInfo, err := client.Verify(params)
	if err != nil || !verifyInfo.VerifyStatus {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	if verifyInfo.TradeStatus != epay.StatusTradeSuccess {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	LockOrder(verifyInfo.ServiceTradeNo)
	defer UnlockOrder(verifyInfo.ServiceTradeNo)

	if err := model.CompleteDigitalProductOrder(
		verifyInfo.ServiceTradeNo,
		common.GetJsonString(verifyInfo),
		model.PaymentProviderEpay,
		verifyInfo.Type,
	); err != nil {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	_, _ = c.Writer.Write([]byte("success"))
}

func DigitalShopEpayReturn(c *gin.Context) {
	params := parseEpayCallbackParams(c)
	failRedirect := system_setting.ServerAddress + "/shop/cursor?pay=fail"
	successBase := system_setting.ServerAddress + "/shop/cursor"

	if len(params) == 0 {
		c.Redirect(http.StatusFound, failRedirect)
		return
	}

	client := GetEpayClient()
	if client == nil {
		c.Redirect(http.StatusFound, failRedirect)
		return
	}
	verifyInfo, err := client.Verify(params)
	if err != nil || !verifyInfo.VerifyStatus {
		c.Redirect(http.StatusFound, failRedirect)
		return
	}

	tradeNo := verifyInfo.ServiceTradeNo
	if verifyInfo.TradeStatus == epay.StatusTradeSuccess {
		LockOrder(tradeNo)
		defer UnlockOrder(tradeNo)
		if err := model.CompleteDigitalProductOrder(
			tradeNo,
			common.GetJsonString(verifyInfo),
			model.PaymentProviderEpay,
			verifyInfo.Type,
		); err != nil {
			c.Redirect(http.StatusFound, failRedirect)
			return
		}
		c.Redirect(http.StatusFound, successBase+"?pay=success&trade_no="+url.QueryEscape(tradeNo))
		return
	}

	c.Redirect(http.StatusFound, successBase+"?pay=pending&trade_no="+url.QueryEscape(tradeNo))
}

func AdminGetCursorProProduct(c *gin.Context) {
	product, err := model.EnsureCursorProDigitalProduct()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    product,
	})
}

func AdminUpdateCursorProProduct(c *gin.Context) {
	var req adminCursorProProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if req.PriceAmount < 0.01 {
		common.ApiErrorMsg(c, "价格必须大于 0")
		return
	}

	product, err := model.EnsureCursorProDigitalProduct()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	product.PriceAmount = req.PriceAmount
	product.Enabled = req.Enabled
	if err := model.UpdateDigitalProduct(product); err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    product,
	})
}

func AdminListDigitalShopOrders(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	status := strings.TrimSpace(c.Query("status"))
	orders, total, err := model.ListDigitalProductOrders(pageInfo, status)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"items": orders,
			"total": total,
			"page":  pageInfo.GetPage(),
			"size":  pageInfo.GetPageSize(),
		},
	})
}

func AdminDeliverDigitalShopOrder(c *gin.Context) {
	orderId, err := strconv.Atoi(c.Param("id"))
	if err != nil || orderId <= 0 {
		common.ApiErrorMsg(c, "订单 ID 无效")
		return
	}
	var req digitalShopDeliverRequest
	_ = c.ShouldBindJSON(&req)

	adminId := c.GetInt("id")
	if err := model.DeliverDigitalProductOrder(orderId, adminId, strings.TrimSpace(req.Note)); err != nil {
		if err == model.ErrDigitalProductOrderNotFound {
			common.ApiErrorMsg(c, "订单不存在")
			return
		}
		if err == model.ErrDigitalProductOrderInvalid {
			common.ApiErrorMsg(c, "订单状态不允许发货")
			return
		}
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func parseEpayCallbackParams(c *gin.Context) map[string]string {
	if c.Request.Method == http.MethodPost {
		if err := c.Request.ParseForm(); err != nil {
			return nil
		}
		return lo.Reduce(lo.Keys(c.Request.PostForm), func(r map[string]string, t string, _ int) map[string]string {
			r[t] = c.Request.PostForm.Get(t)
			return r
		}, map[string]string{})
	}
	return lo.Reduce(lo.Keys(c.Request.URL.Query()), func(r map[string]string, t string, _ int) map[string]string {
		r[t] = c.Request.URL.Query().Get(t)
		return r
	}, map[string]string{})
}

func maskContactEmail(email string) string {
	email = strings.TrimSpace(email)
	if email == "" {
		return ""
	}
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return "***"
	}
	local := parts[0]
	if len(local) <= 2 {
		return "**@" + parts[1]
	}
	return local[:2] + "***@" + parts[1]
}

func maskContactPhone(phone string) string {
	phone = strings.TrimSpace(phone)
	if len(phone) < 7 {
		return phone
	}
	return phone[:3] + "****" + phone[len(phone)-4:]
}
