package controller

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"os"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetPublicModelsTree(c *gin.Context) {
	data, err := service.ReadModelsTreeFile()
	if err != nil {
		if os.IsNotExist(err) {
			if regenErr := service.RegenerateModelsTreeFile(); regenErr != nil {
				common.ApiError(c, regenErr)
				return
			}
			data, err = service.ReadModelsTreeFile()
		}
		if err != nil {
			common.ApiError(c, err)
			return
		}
	}

	etag := sha256.Sum256(data)
	etagHex := `"` + hex.EncodeToString(etag[:]) + `"`
	if c.GetHeader("If-None-Match") == etagHex {
		c.Status(http.StatusNotModified)
		return
	}

	c.Header("Cache-Control", "public, max-age=60")
	c.Header("ETag", etagHex)
	c.Data(http.StatusOK, "application/json; charset=utf-8", data)
}

func notifyModelsTreeChanged() {
	service.ScheduleModelsTreeRegeneration()
}
