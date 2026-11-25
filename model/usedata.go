package model

import (
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// QuotaData 柱状图数据
type QuotaData struct {
	Id           int    `json:"id"`
	UserID       int    `json:"user_id" gorm:"index"`
	Username     string `json:"username" gorm:"index:idx_qdt_model_user_name,priority:2;size:64;default:''"`
	ModelName    string `json:"model_name" gorm:"index:idx_qdt_model_user_name,priority:1;size:64;default:''"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint;index:idx_qdt_created_at,priority:2"`
	TokenUsed    int    `json:"token_used" gorm:"default:0"`
	Count        int    `json:"count" gorm:"default:0"`
	Quota        int    `json:"quota" gorm:"default:0"`
	PromptTokens int64  `json:"-" gorm:"not null;default:0"`
	// TokenDetailCount excludes requests recorded before the split was stored.
	TokenDetailCount int64 `json:"-" gorm:"not null;default:0"`
}

const quotaDataBucketSeconds = 3600

func UpdateQuotaData() {
	for {
		if common.DataExportEnabled {
			common.SysLog("正在更新数据看板数据...")
			SaveQuotaDataCache()
		}
		time.Sleep(time.Duration(common.DataExportInterval) * time.Minute)
	}
}

var CacheQuotaData = make(map[string]*QuotaData)
var CacheQuotaDataLock = sync.Mutex{}

func LogQuotaData(userId int, username string, modelName string, quota int, createdAt int64, promptTokens, completionTokens int) {
	createdAt -= createdAt % quotaDataBucketSeconds
	CacheQuotaDataLock.Lock()
	defer CacheQuotaDataLock.Unlock()

	key := fmt.Sprintf("%d-%s-%s-%d", userId, username, modelName, createdAt)
	quotaData := CacheQuotaData[key]
	if quotaData == nil {
		quotaData = &QuotaData{
			UserID:    userId,
			Username:  username,
			ModelName: modelName,
			CreatedAt: createdAt,
		}
		CacheQuotaData[key] = quotaData
	}
	quotaData.Count++
	quotaData.Quota += quota
	quotaData.TokenUsed += promptTokens + completionTokens
	quotaData.PromptTokens += int64(promptTokens)
	quotaData.TokenDetailCount++
}

func SaveQuotaDataCache() {
	CacheQuotaDataLock.Lock()
	defer CacheQuotaDataLock.Unlock()
	size := len(CacheQuotaData)
	// 如果缓存中有数据，就保存到数据库中
	// 1. 先查询数据库中是否有数据
	// 2. 如果有数据，就更新数据
	// 3. 如果没有数据，就插入数据
	for _, quotaData := range CacheQuotaData {
		quotaDataDB := &QuotaData{}
		DB.Table("quota_data").Where("user_id = ? and username = ? and model_name = ? and created_at = ?",
			quotaData.UserID, quotaData.Username, quotaData.ModelName, quotaData.CreatedAt).First(quotaDataDB)
		if quotaDataDB.Id > 0 {
			increaseQuotaData(quotaData)
		} else {
			DB.Table("quota_data").Create(quotaData)
		}
	}
	CacheQuotaData = make(map[string]*QuotaData)
	common.SysLog(fmt.Sprintf("保存数据看板数据成功，共保存%d条数据", size))
}

func increaseQuotaData(data *QuotaData) {
	err := DB.Table("quota_data").
		Where("user_id = ? and username = ? and model_name = ? and created_at = ?",
			data.UserID, data.Username, data.ModelName, data.CreatedAt).
		Updates(map[string]interface{}{
			"count":              gorm.Expr("count + ?", data.Count),
			"quota":              gorm.Expr("quota + ?", data.Quota),
			"token_used":         gorm.Expr("token_used + ?", data.TokenUsed),
			"prompt_tokens":      gorm.Expr("prompt_tokens + ?", data.PromptTokens),
			"token_detail_count": gorm.Expr("token_detail_count + ?", data.TokenDetailCount),
		}).Error
	if err != nil {
		common.SysLog(fmt.Sprintf("increaseQuotaData error: %s", err))
	}
}

func GetQuotaDataByUsername(username string, startTime int64, endTime int64) (quotaData []*QuotaData, err error) {
	var quotaDatas []*QuotaData
	// 从quota_data表中查询数据
	err = DB.Table("quota_data").Where("username = ? and created_at >= ? and created_at <= ?", username, startTime, endTime).Find(&quotaDatas).Error
	return quotaDatas, err
}

func GetQuotaDataByUserId(userId int, startTime int64, endTime int64) (quotaData []*QuotaData, err error) {
	var quotaDatas []*QuotaData
	// 从quota_data表中查询数据
	err = DB.Table("quota_data").Where("user_id = ? and created_at >= ? and created_at <= ?", userId, startTime, endTime).Find(&quotaDatas).Error
	return quotaDatas, err
}

func GetQuotaDataGroupByUser(startTime int64, endTime int64) (quotaData []*QuotaData, err error) {
	var quotaDatas []*QuotaData
	err = DB.Table("quota_data").
		Select("user_id, username, created_at, sum(count) as count, sum(quota) as quota, sum(token_used) as token_used").
		Where("created_at >= ? and created_at <= ?", startTime, endTime).
		Group("user_id, username, created_at").
		Find(&quotaDatas).Error
	return quotaDatas, err
}

type UserModelUsage struct {
	ModelName    string `json:"model_name"`
	InputTokens  *int64 `json:"input_tokens" gorm:"-"`
	OutputTokens *int64 `json:"output_tokens" gorm:"-"`
	TokenUsed    int64  `json:"token_used"`
	Quota        int64  `json:"quota"`
}

type userModelUsageSummary struct {
	UserModelUsage
	Count            int64
	PromptTokens     int64
	TokenDetailCount int64
}

func (usage *UserModelUsage) setTokenDetails(promptTokens int64) {
	completionTokens := usage.TokenUsed - promptTokens
	usage.InputTokens = &promptTokens
	usage.OutputTokens = &completionTokens
}

func GetUserModelUsage(userID int, startTime, endTime int64) ([]UserModelUsage, error) {
	var summaries []userModelUsageSummary
	err := DB.Model(&QuotaData{}).
		Select(`COALESCE(model_name, '') AS model_name, COALESCE(SUM(token_used), 0) AS token_used,
			COALESCE(SUM(quota), 0) AS quota, COALESCE(SUM(count), 0) AS count,
			COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens, COALESCE(SUM(token_detail_count), 0) AS token_detail_count`).
		Where("user_id = ? AND created_at >= ? AND created_at <= ?", userID, startTime, endTime).
		Group("COALESCE(model_name, '')").
		Order("quota DESC, model_name ASC").
		Scan(&summaries).Error
	if err != nil {
		return nil, err
	}

	usage := make([]UserModelUsage, 0, len(summaries))
	var missingDetails []int
	for i, summary := range summaries {
		row := summary.UserModelUsage
		if summary.Count > 0 && summary.TokenDetailCount == summary.Count {
			row.setTokenDetails(summary.PromptTokens)
		} else {
			missingDetails = append(missingDetails, i)
		}
		usage = append(usage, row)
	}
	if len(missingDetails) == 0 {
		return usage, nil
	}

	logs, err := getUserModelUsageFromLogs(userID, startTime, endTime)
	if err != nil {
		common.SysError(fmt.Sprintf("failed to read model usage token details: %v", err))
		return usage, nil
	}
	for _, i := range missingDetails {
		summary := summaries[i]
		log, ok := logs[summary.ModelName]
		// Log retention and dashboard export can produce different coverage.
		if ok && log.Count == summary.Count && log.TokenUsed == summary.TokenUsed && log.Quota == summary.Quota {
			usage[i].setTokenDetails(log.PromptTokens)
		}
	}
	return usage, nil
}

func getUserModelUsageFromLogs(userID int, startTime, endTime int64) (map[string]userModelUsageSummary, error) {
	firstBucket := startTime - startTime%quotaDataBucketSeconds
	lastBucket := endTime - endTime%quotaDataBucketSeconds
	if firstBucket < startTime {
		if firstBucket == lastBucket {
			return nil, nil
		}
		firstBucket += quotaDataBucketSeconds
	}
	// Match the hours present in the dashboard query, including the last bucket.
	lastSecond := lastBucket + min(quotaDataBucketSeconds-1, math.MaxInt64-lastBucket)
	var summaries []userModelUsageSummary
	err := LOG_DB.Model(&Log{}).
		Select(`COALESCE(model_name, '') AS model_name, COUNT(*) AS count, COALESCE(SUM(quota), 0) AS quota,
			COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
			COALESCE(SUM(prompt_tokens), 0) + COALESCE(SUM(completion_tokens), 0) AS token_used`).
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at <= ?", userID, LogTypeConsume, firstBucket, lastSecond).
		Group("COALESCE(model_name, '')").
		Scan(&summaries).Error
	if err != nil {
		return nil, err
	}
	byModel := make(map[string]userModelUsageSummary, len(summaries))
	for _, summary := range summaries {
		byModel[summary.ModelName] = summary
	}
	return byModel, nil
}

func GetAllQuotaDates(startTime int64, endTime int64, username string) (quotaData []*QuotaData, err error) {
	if username != "" {
		return GetQuotaDataByUsername(username, startTime, endTime)
	}
	var quotaDatas []*QuotaData
	// 从quota_data表中查询数据
	// only select model_name, sum(count) as count, sum(quota) as quota, model_name, created_at from quota_data group by model_name, created_at;
	//err = DB.Table("quota_data").Where("created_at >= ? and created_at <= ?", startTime, endTime).Find(&quotaDatas).Error
	err = DB.Table("quota_data").Select("model_name, sum(count) as count, sum(quota) as quota, sum(token_used) as token_used, created_at").Where("created_at >= ? and created_at <= ?", startTime, endTime).Group("model_name, created_at").Find(&quotaDatas).Error
	return quotaDatas, err
}
