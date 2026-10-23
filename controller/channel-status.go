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

package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// channelStatusWindows maps supported window keys to seconds.
var channelStatusWindows = map[string]int64{
	"90m": 90 * 60,
	"24h": 24 * 3600,
	"7d":  7 * 24 * 3600,
	"30d": 30 * 24 * 3600,
}

// ChannelStatusCard aggregates one channel for the status dashboard.
type ChannelStatusCard struct {
	ChannelId       int                        `json:"channel_id"`
	ChannelName     string                     `json:"channel_name"`
	ChannelType     int                        `json:"channel_type"`
	Status          int                        `json:"status"`
	TestModel       string                     `json:"test_model"`
	Aggregated      model.ChannelStatusAggregated `json:"aggregated"`
	History         []model.ChannelTestHistoryPoint `json:"history"`
}

// GetChannelStatus returns per-channel test aggregates plus recent history
// points for the sparkline. Query: window=90m|24h|7d|30d (default 90m),
// history_limit=N (default 30).
func GetChannelStatus(c *gin.Context) {
	windowKey := c.DefaultQuery("window", "90m")
	windowSeconds, ok := channelStatusWindows[windowKey]
	if !ok {
		windowKey = "90m"
		windowSeconds = channelStatusWindows["90m"]
	}
	historyLimit, err := strconv.Atoi(c.DefaultQuery("history_limit", "30"))
	if err != nil || historyLimit <= 0 {
		historyLimit = 30
	}

	aggregates, err := model.GetChannelStatusWindow(windowSeconds)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	channelById := make(map[int]*model.Channel, len(channels))
	for _, ch := range channels {
		channelById[ch.Id] = ch
	}

	cards := make([]ChannelStatusCard, 0, len(aggregates))
	for _, agg := range aggregates {
		ch, exists := channelById[agg.ChannelId]
		if !exists {
			continue
		}
		delete(channelById, agg.ChannelId)
		history, histErr := model.GetChannelTestHistory(agg.ChannelId, historyLimit)
		if histErr != nil {
			history = []model.ChannelTestHistoryPoint{}
		}
		card := ChannelStatusCard{
			ChannelId:   ch.Id,
			ChannelName: ch.Name,
			ChannelType: ch.Type,
			Status:      ch.Status,
			Aggregated:  agg,
			History:     history,
		}
		if ch.TestModel != nil {
			card.TestModel = *ch.TestModel
		}
		cards = append(cards, card)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"window": windowKey,
			"cards":  cards,
		},
	})
}
