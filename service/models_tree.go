package service

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
)

const (
	modelsTreeObject          = "models_tree"
	modelsTreeRegenDebounce   = 5 * time.Second
	modelsTreePathEnv         = "MODELS_TREE_PATH"
	modelsTreeDefaultPath     = "data/models-tree.json"
)

var (
	modelsTreeRegenMu    sync.Mutex
	modelsTreeRegenTimer *time.Timer
)

func ModelsTreeFilePath() string {
	return common.GetEnvOrDefaultString(modelsTreePathEnv, modelsTreeDefaultPath)
}

func BuildModelsTree() (*dto.ModelsTreeResponse, error) {
	abilities, err := model.GetAllEnableAbilityWithChannels()
	if err != nil {
		return nil, err
	}
	return buildModelsTreeFromAbilities(abilities), nil
}

func buildModelsTreeFromAbilities(abilities []model.AbilityWithChannel) *dto.ModelsTreeResponse {
	type channelBucket struct {
		typeID int
		models map[string]struct{}
	}

	buckets := make(map[int]*channelBucket)
	modelTotal := 0

	for _, ability := range abilities {
		modelName := strings.TrimSpace(ability.Model)
		if modelName == "" || ability.ChannelType == constant.ChannelTypeUnknown {
			continue
		}
		bucket, ok := buckets[ability.ChannelType]
		if !ok {
			bucket = &channelBucket{typeID: ability.ChannelType, models: make(map[string]struct{})}
			buckets[ability.ChannelType] = bucket
		}
		if _, exists := bucket.models[modelName]; !exists {
			bucket.models[modelName] = struct{}{}
			modelTotal++
		}
	}

	typeIDs := make([]int, 0, len(buckets))
	for typeID := range buckets {
		typeIDs = append(typeIDs, typeID)
	}
	sort.Ints(typeIDs)

	channels := make([]dto.ModelsTreeChannel, 0, len(typeIDs))
	for _, typeID := range typeIDs {
		bucket := buckets[typeID]
		modelNames := make([]string, 0, len(bucket.models))
		for modelName := range bucket.models {
			modelNames = append(modelNames, modelName)
		}
		sort.Strings(modelNames)

		models := make([]dto.ModelsTreeModel, 0, len(modelNames))
		for _, modelName := range modelNames {
			endpointTypes := model.GetModelSupportEndpointTypes(modelName)
			models = append(models, dto.ModelsTreeModel{
				ID:            modelName,
				EndpointTypes: endpointTypes,
			})
		}

		channels = append(channels, dto.ModelsTreeChannel{
			Type:   typeID,
			Key:    channelTypeKey(typeID),
			Name:   constant.GetChannelTypeName(typeID),
			Models: models,
		})
	}

	return &dto.ModelsTreeResponse{
		Version:      dto.ModelsTreeVersion,
		GeneratedAt:  time.Now().UTC().Format(time.RFC3339),
		Object:       modelsTreeObject,
		Channels:     channels,
		ModelCount:   modelTotal,
		ChannelCount: len(channels),
	}
}

func channelTypeKey(channelType int) string {
	name := constant.GetChannelTypeName(channelType)
	if name == "" || name == "Unknown" {
		return ""
	}
	key := strings.ToLower(name)
	key = strings.ReplaceAll(key, " ", "")
	key = strings.ReplaceAll(key, "_", "")
	return key
}

func RegenerateModelsTreeFile() error {
	tree, err := BuildModelsTree()
	if err != nil {
		return err
	}
	data, err := common.Marshal(tree)
	if err != nil {
		return err
	}
	return writeModelsTreeFile(data)
}

func writeModelsTreeFile(data []byte) error {
	path := ModelsTreeFilePath()
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create models tree directory: %w", err)
	}
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		return fmt.Errorf("write models tree temp file: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("rename models tree file: %w", err)
	}
	return nil
}

func ReadModelsTreeFile() ([]byte, error) {
	return os.ReadFile(ModelsTreeFilePath())
}

func ScheduleModelsTreeRegeneration() {
	modelsTreeRegenMu.Lock()
	defer modelsTreeRegenMu.Unlock()
	if modelsTreeRegenTimer != nil {
		modelsTreeRegenTimer.Stop()
	}
	modelsTreeRegenTimer = time.AfterFunc(modelsTreeRegenDebounce, func() {
		if err := RegenerateModelsTreeFile(); err != nil {
			common.SysLog("models tree regeneration failed: " + err.Error())
		}
	})
}
