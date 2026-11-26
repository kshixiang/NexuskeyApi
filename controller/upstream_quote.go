package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func LoadUpstreamQuoteSnapshot(c *gin.Context) {
	input, err := service.FetchUpstreamQuoteSnapshot(c.Request.Context(), c.Param("source"))
	upstreamQuoteResult(c, input, err)
}

func upstreamQuoteBody[T any](c *gin.Context, input *T) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8<<20)
	if err := common.DecodeJson(c.Request.Body, input); err != nil {
		common.ApiError(c, err)
		return false
	}
	return true
}

func upstreamQuoteID(c *gin.Context) int {
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		common.ApiErrorMsg(c, "Invalid ID")
	}
	return id
}

func ListUpstreamQuoteChannels(c *gin.Context) {
	channels, err := service.ListUpstreamQuoteChannels()
	upstreamQuoteResult(c, channels, err)
}

func ImportUpstreamQuotes(c *gin.Context) {
	var input struct {
		service.UpstreamImport
		Snapshot string `json:"snapshot"`
		Grouped  bool   `json:"grouped"`
	}
	if !upstreamQuoteBody(c, &input) {
		return
	}
	if input.Snapshot != "" {
		snapshot, err := service.ParseUpstreamQuoteSnapshot(input.Source, []byte(input.Snapshot))
		if err != nil {
			upstreamQuoteResult(c, nil, err)
			return
		}
		input.Groups = snapshot.Groups
	}
	if c.Param("action") == "preview" {
		if input.Grouped {
			groups, err := service.PreviewUpstreamImportGroups(input.UpstreamImport)
			upstreamQuoteResult(c, groups, err)
			return
		}
		changes, err := service.PreviewUpstreamImport(input.UpstreamImport)
		upstreamQuoteResult(c, changes, err)
		return
	}
	if c.Param("action") != "save" {
		c.Status(http.StatusNotFound)
		return
	}
	channel, err := service.SaveUpstreamImport(input.UpstreamImport)
	upstreamQuoteResult(c, channel, err)
}

func SaveUpstreamModelQuote(c *gin.Context) {
	var input struct {
		Revision int                   `json:"revision"`
		Quote    service.UpstreamQuote `json:"quote"`
	}
	if id := upstreamQuoteID(c); id > 0 && upstreamQuoteBody(c, &input) {
		upstreamQuoteResult(c, nil, service.SaveUpstreamModelQuote(id, input.Revision, input.Quote))
	}
}

func ConfirmUpstreamModelQuotes(c *gin.Context) {
	var input struct {
		Revision int `json:"revision"`
	}
	if id := upstreamQuoteID(c); id > 0 && upstreamQuoteBody(c, &input) {
		upstreamQuoteResult(c, nil, service.ConfirmUpstreamModelQuotes(id, input.Revision))
	}
}

func RenameUpstreamQuoteChannel(c *gin.Context) {
	var input struct {
		Name string `json:"name"`
	}
	if id := upstreamQuoteID(c); id > 0 && upstreamQuoteBody(c, &input) {
		upstreamQuoteResult(c, nil, service.RenameUpstreamQuoteChannel(id, input.Name))
	}
}

func GetUpstreamQuoteGroup(c *gin.Context) {
	if id := upstreamQuoteID(c); id > 0 {
		group, err := service.PreviewUpstreamGroup(id, nil)
		upstreamQuoteResult(c, group, err)
	}
}

func SaveUpstreamQuoteGroup(c *gin.Context) {
	var input service.UpstreamGroupConfig
	if id := upstreamQuoteID(c); id > 0 && upstreamQuoteBody(c, &input) {
		upstreamQuoteResult(c, nil, service.SaveUpstreamGroupConfig(id, input))
	}
}

func PublishUpstreamQuoteGroup(c *gin.Context) {
	var input struct {
		Revision int  `json:"revision"`
		Restore  int  `json:"restore_version"`
		Publish  bool `json:"publish"`
	}
	if id := upstreamQuoteID(c); id > 0 && upstreamQuoteBody(c, &input) {
		upstreamQuoteResult(c, nil, service.SetUpstreamGroupListing(id, input.Revision, input.Restore, input.Publish))
	}
}

func CompareUpstreamQuotes(c *gin.Context) {
	var input service.UpstreamComparison
	if upstreamQuoteBody(c, &input) {
		data, err := service.CompareUpstreamQuotes(input)
		upstreamQuoteResult(c, data, err)
	}
}

func upstreamQuoteResult(c *gin.Context, data any, err error) {
	switch {
	case errors.Is(err, service.ErrUpstreamDraftChanged):
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": err.Error()})
	case err != nil:
		common.ApiError(c, err)
	default:
		common.ApiSuccess(c, data)
	}
}
