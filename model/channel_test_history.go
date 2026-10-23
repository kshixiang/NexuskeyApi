/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

package model

import (
	"time"

	"github.com/QuantumNous/new-api/common"
)

// ChannelTestHistory records the outcome of a single channel test run.
// It powers the channel status monitoring dashboard (per-channel
// availability / latency / sparkline over a time window).
type ChannelTestHistory struct {
	Id             int    `json:"id" gorm:"primaryKey"`
	ChannelId      int    `json:"channel_id" gorm:"index:idx_channel_test_time"`
	CreatedAt      int64  `json:"created_at" gorm:"bigint;index:idx_channel_test_time"`
	Success        bool   `json:"success"`
	ResponseTimeMs int64  `json:"response_time_ms"` // total test duration in ms
	FirstTokenMs   *int64 `json:"first_token_ms"`   // first-token latency in ms (stream only, nullable)
	PromptTokens   int    `json:"prompt_tokens"`
	CachedTokens   int    `json:"cached_tokens"`
	IsStream       bool   `json:"is_stream"`
	TestModel      string `json:"test_model" gorm:"type:varchar(255);default:''"`
	ErrorMessage   string `json:"error_message" gorm:"type:varchar(512);default:''"`
}

// RecordChannelTestHistory inserts one history row for a channel test.
func RecordChannelTestHistory(record *ChannelTestHistory) {
	if record.CreatedAt == 0 {
		record.CreatedAt = common.GetTimestamp()
	}
	if len(record.ErrorMessage) > 512 {
		record.ErrorMessage = record.ErrorMessage[:512]
	}
	if err := DB.Create(record).Error; err != nil {
		common.SysLog("failed to record channel test history: " + err.Error())
	}
}

// ChannelStatusAggregated holds per-channel aggregates over a time window.
type ChannelStatusAggregated struct {
	ChannelId      int     `json:"channel_id"`
	TotalCount     int     `json:"total_count"`
	SuccessCount   int     `json:"success_count"`
	Availability    float64 `json:"availability"`    // success / total, 0 when no tests
	AvgResponseMs   float64 `json:"avg_response_ms"` // average total response time (successful tests)
	AvgFirstTokenMs float64 `json:"avg_first_token_ms"`
	CacheRate      float64 `json:"cache_rate"` // cached_tokens / prompt_tokens over successful tests
}

// GetChannelStatusWindow returns aggregates for all channels that have test
// records within the given time window (seconds). Channels with no records in
// the window are omitted.
func GetChannelStatusWindow(windowSeconds int64) ([]ChannelStatusAggregated, error) {
	since := time.Now().Unix() - windowSeconds
	var rows []ChannelStatusAggregated
	err := DB.Model(&ChannelTestHistory{}).
		Select(`
			channel_id,
			COUNT(*) AS total_count,
			SUM(CASE WHEN success THEN 1 ELSE 0 END) AS success_count,
			AVG(CASE WHEN success THEN response_time_ms ELSE NULL END) AS avg_response_ms,
			AVG(CASE WHEN success AND first_token_ms IS NOT NULL THEN first_token_ms ELSE NULL END) AS avg_first_token_ms,
			CAST(SUM(CASE WHEN success THEN cached_tokens ELSE 0 END) AS REAL) /
			NULLIF(CAST(SUM(CASE WHEN success THEN prompt_tokens ELSE 0 END) AS REAL), 0) AS cache_rate
		`).
		Where("created_at >= ?", since).
		Group("channel_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for i := range rows {
		if rows[i].TotalCount > 0 {
			rows[i].Availability = float64(rows[i].SuccessCount) / float64(rows[i].TotalCount)
		}
		// cache_rate computed as cached/prompt above; SQLite returns REAL.
	}
	return rows, nil
}

// ChannelTestHistoryPoint is one bar in the per-channel sparkline.
type ChannelTestHistoryPoint struct {
	CreatedAt      int64 `json:"created_at"`
	Success        bool  `json:"success"`
	ResponseTimeMs int64 `json:"response_time_ms"`
}

// GetChannelTestHistory returns the most recent `limit` test records for a
// channel, ordered oldest-first (for left-to-right "PAST → NOW" charts).
func GetChannelTestHistory(channelId int, limit int) ([]ChannelTestHistoryPoint, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	var records []ChannelTestHistoryPoint
	err := DB.Model(&ChannelTestHistory{}).
		Select("created_at", "success", "response_time_ms").
		Where("channel_id = ?", channelId).
		Order("created_at DESC").
		Limit(limit).
		Scan(&records).Error
	if err != nil {
		return nil, err
	}
	// reverse to oldest-first
	for i, j := 0, len(records)-1; i < j; i, j = i+1, j-1 {
		records[i], records[j] = records[j], records[i]
	}
	return records, nil
}

// CleanupChannelTestHistory deletes records older than maxAgeSeconds.
// Called at startup to bound table growth.
func CleanupChannelTestHistory(maxAgeSeconds int64) {
	if maxAgeSeconds <= 0 {
		maxAgeSeconds = 30 * 24 * 3600 // default: keep 30 days
	}
	cutoff := time.Now().Unix() - maxAgeSeconds
	if err := DB.Where("created_at < ?", cutoff).Delete(&ChannelTestHistory{}).Error; err != nil {
		common.SysLog("failed to cleanup channel test history: " + err.Error())
	}
}
