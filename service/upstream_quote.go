package service

import (
	"bytes"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type UpstreamImport struct {
	Source    string                `json:"source"`
	ChannelID int                   `json:"channel_id"`
	Groups    []UpstreamImportGroup `json:"groups"`
}

type UpstreamImportGroup struct {
	SourceID        string          `json:"source_id"`
	Name            string          `json:"name"`
	ExistingGroupID int             `json:"existing_group_id"`
	Quotes          []UpstreamQuote `json:"quotes"`
}

type UpstreamImportChange struct {
	Group              string         `json:"group"`
	Model              string         `json:"model"`
	Status             string         `json:"status"`
	Previous           *UpstreamQuote `json:"previous,omitempty"`
	PreviousMultiplier *float64       `json:"previous_multiplier,omitempty"`
	Incoming           *UpstreamQuote `json:"incoming,omitempty"`
	IncomingMultiplier *float64       `json:"incoming_multiplier,omitempty"`
}

type UpstreamImportGroupPreview struct {
	ID                 string                 `json:"id"`
	Name               string                 `json:"name"`
	UpstreamMultiplier *float64               `json:"upstream_multiplier,omitempty"`
	Changes            []UpstreamImportChange `json:"changes"`
}

type UpstreamGroupConfig struct {
	Name            string   `json:"name"`
	SalesName       string   `json:"sales_name"`
	APIKey          *string  `json:"api_key"`
	BaseURL         string   `json:"base_url"`
	Protocol        string   `json:"protocol"`
	Multiplier      float64  `json:"multiplier"`
	FinalMultiplier *float64 `json:"final_multiplier"`
	CreditCost      float64  `json:"credit_cost"`
	Revision        int      `json:"revision"`
}

type UpstreamChannelView struct {
	model.UpstreamQuoteChannel
	Groups []model.UpstreamQuoteGroup `json:"groups"`
}

type UpstreamQuotePreview struct {
	Quote              UpstreamQuote            `json:"quote"`
	UpstreamMultiplier *float64                 `json:"upstream_multiplier,omitempty"`
	QuoteVersion       int                      `json:"quote_version"`
	LastSeen           int64                    `json:"last_seen_import"`
	Sale               *model.UpstreamSaleModel `json:"sale,omitempty"`
	Error              string                   `json:"error,omitempty"`
}

type UpstreamGroupPreview struct {
	model.UpstreamQuoteGroup
	Quotes   []UpstreamQuotePreview      `json:"quotes"`
	Versions []model.UpstreamSaleVersion `json:"versions"`
}

var ErrUpstreamDraftChanged = errors.New("the draft changed; refresh and preview it again")

func upstreamSource(source string) (name, page, domain string) {
	switch source {
	case "kedaya":
		return "Kedaya", "https://kedaya.ai/model-plaza?embedded=1", "kedaya.ai"
	case "string":
		return "String AI", "https://www.string.ink/dashboard/pricing", "string.ink"
	case "geek2api":
		return "Geek2API", "https://www.geek2api.com/model-plaza", "geek2api.com"
	}
	return "", "", ""
}

func upstreamGroupIdentity(group UpstreamImportGroup) string {
	if group.SourceID != "" {
		return billingexpr.ExprHashString("id:" + strings.TrimSpace(group.SourceID))
	}
	return billingexpr.ExprHashString("name:" + strings.ToLower(strings.Join(strings.Fields(group.Name), " ")))
}

func validUpstreamName(name string) bool {
	return strings.TrimSpace(name) != "" && utf8.RuneCountInString(name) <= 250 && strings.IndexFunc(name, unicode.IsControl) == -1
}

func validUpstreamModel(name string) bool {
	return name != "" && utf8.RuneCountInString(name) <= 191 && strings.IndexFunc(name, func(r rune) bool {
		return unicode.IsSpace(r) || unicode.IsControl(r) || r == ','
	}) == -1
}

func ValidateUpstreamImport(input UpstreamImport) error {
	if name, _, _ := upstreamSource(input.Source); name == "" {
		return errors.New("unknown upstream quote source")
	}
	if len(input.Groups) == 0 {
		return errors.New("include at least one upstream quote group")
	}
	groups := make(map[string]bool)
	for _, group := range input.Groups {
		id := upstreamGroupIdentity(group)
		if !validUpstreamName(group.Name) || groups[id] {
			return fmt.Errorf("missing or duplicate upstream group %q", group.Name)
		}
		groups[id] = true
		models := make(map[string]bool)
		for _, quote := range group.Quotes {
			id := strings.ToLower(quote.ModelID)
			if !validUpstreamModel(quote.ModelID) || (quote.LocalModel != "" && !validUpstreamModel(quote.LocalModel)) || models[id] {
				return fmt.Errorf("%s: invalid or duplicate model %q", group.Name, quote.ModelID)
			}
			models[id] = true
		}
	}
	return nil
}

func findUpstreamImportGroup(tx *gorm.DB, channelID int, item UpstreamImportGroup, group *model.UpstreamQuoteGroup) error {
	query := tx.Where("channel_id = ?", channelID)
	if item.ExistingGroupID > 0 {
		return query.Where("id = ?", item.ExistingGroupID).Take(group).Error
	}
	return query.Where("source_group = ?", upstreamGroupIdentity(item)).Take(group).Error
}

func PreviewUpstreamImport(input UpstreamImport) ([]UpstreamImportChange, error) {
	groups, err := PreviewUpstreamImportGroups(input)
	if err != nil {
		return nil, err
	}
	var changes []UpstreamImportChange
	for _, group := range groups {
		changes = append(changes, group.Changes...)
	}
	return changes, nil
}

func PreviewUpstreamImportGroups(input UpstreamImport) ([]UpstreamImportGroupPreview, error) {
	if err := ValidateUpstreamImport(input); err != nil {
		return nil, err
	}
	var channel model.UpstreamQuoteChannel
	err := model.DB.Where("source = ?", input.Source).Take(&channel).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if input.ChannelID > 0 && input.ChannelID != channel.ID {
		return nil, errors.New("snapshot source does not match the selected channel")
	}
	groups := make([]UpstreamImportGroupPreview, 0, len(input.Groups))
	for _, item := range input.Groups {
		preview := UpstreamImportGroupPreview{
			ID:      upstreamGroupIdentity(item),
			Name:    item.Name,
			Changes: make([]UpstreamImportChange, 0, len(item.Quotes)),
		}
		multipliers := upstreamGroupMultipliers{}
		var group model.UpstreamQuoteGroup
		if channel.ID > 0 {
			err := findUpstreamImportGroup(model.DB, channel.ID, item, &group)
			if err != nil && (item.ExistingGroupID > 0 || !errors.Is(err, gorm.ErrRecordNotFound)) {
				return nil, err
			}
		}
		prior := make(map[string]UpstreamQuotePreview)
		if group.ID > 0 {
			rows, err := loadUpstreamQuotes(model.DB, group.ID)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				prior[strings.ToLower(row.Quote.ModelID)] = row
			}
		}
		for _, quote := range item.Quotes {
			groupRate, modelRate := upstreamQuoteMultipliers(quote)
			multipliers.add(groupRate, 0)
			change := UpstreamImportChange{
				Group: item.Name, Model: quote.ModelID, Status: "new", Incoming: &quote, IncomingMultiplier: modelRate,
			}
			key := strings.ToLower(quote.ModelID)
			if previous, ok := prior[key]; ok {
				change.Previous = &previous.Quote
				_, change.PreviousMultiplier = upstreamQuoteMultipliers(previous.Quote)
				oldJSON, _ := common.Marshal(previous.Quote)
				newJSON, _ := common.Marshal(quote)
				change.Status = "changed"
				if string(oldJSON) == string(newJSON) {
					change.Status = "unchanged"
				}
				delete(prior, key)
			}
			if !quote.Confirmed {
				change.Status = "needs_confirmation"
			}
			preview.Changes = append(preview.Changes, change)
		}
		for _, previous := range prior {
			_, modelRate := upstreamQuoteMultipliers(previous.Quote)
			preview.Changes = append(preview.Changes, UpstreamImportChange{
				Group: item.Name, Model: previous.Quote.ModelID, Status: "not_seen", Previous: &previous.Quote, PreviousMultiplier: modelRate,
			})
		}
		preview.UpstreamMultiplier = multipliers.common()
		groups = append(groups, preview)
	}
	return groups, nil
}

func defaultUpstreamGroupProtocol(quotes []UpstreamQuote) string {
	protocol := "openai"
	for _, quote := range quotes {
		if quote.Kind != "token" && quote.Kind != "fixed" {
			continue
		}
		if len(quote.Endpoints) == 0 {
			return "openai"
		}
		for _, endpoint := range quote.Endpoints {
			if endpoint != string(constant.EndpointTypeAnthropic) {
				return "openai"
			}
		}
		protocol = "anthropic"
	}
	return protocol
}

func SaveUpstreamImport(input UpstreamImport) (model.UpstreamQuoteChannel, error) {
	var channel model.UpstreamQuoteChannel
	if err := ValidateUpstreamImport(input); err != nil {
		return channel, err
	}
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		name, page, _ := upstreamSource(input.Source)
		initial := model.UpstreamQuoteChannel{Source: input.Source, Name: name, SourceURL: page}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&initial).Error; err != nil {
			return err
		}
		// Serialize imports for this source across processes.
		if err := tx.Model(&model.UpstreamQuoteChannel{}).Where("source = ?", input.Source).
			UpdateColumn("imported", gorm.Expr("CASE WHEN imported >= ? THEN imported + 1 ELSE ? END", time.Now().UnixMilli(), time.Now().UnixMilli())).Error; err != nil {
			return err
		}
		if err := tx.Where("source = ?", input.Source).Take(&channel).Error; err != nil {
			return err
		}
		if input.ChannelID > 0 && input.ChannelID != channel.ID {
			return errors.New("snapshot source does not match the selected channel")
		}
		seen := make(map[int]bool)
		for _, item := range input.Groups {
			var group model.UpstreamQuoteGroup
			identity := upstreamGroupIdentity(item)
			protocol := defaultUpstreamGroupProtocol(item.Quotes)
			err := findUpstreamImportGroup(tx, channel.ID, item, &group)
			switch {
			case errors.Is(err, gorm.ErrRecordNotFound) && item.ExistingGroupID == 0:
				group = model.UpstreamQuoteGroup{
					ChannelID: channel.ID, SourceGroup: identity, OriginalName: item.Name, Name: item.Name,
					SalesName: fmt.Sprintf("%d_%s", channel.ID, item.Name), Multiplier: 1, Revision: 1,
					Protocol: protocol,
				}
				if err := tx.Create(&group).Error; err != nil {
					return err
				}
			case err != nil:
				return err
			default:
				if err := updateUpstreamDraft(tx, group.ID, group.Revision, map[string]any{
					"source_group": identity, "original_name": item.Name,
				}); err != nil {
					return err
				}
			}
			if seen[group.ID] {
				return errors.New("the same channel group appears more than once")
			}
			seen[group.ID] = true
			for _, quote := range item.Quotes {
				if err := saveUpstreamQuote(tx, group.ID, channel.Imported, quote); err != nil {
					return err
				}
			}
			if group.Protocol == "openai" && protocol == "anthropic" {
				if err := repairUpstreamAnthropicProtocol(tx, group.ID); err != nil {
					return err
				}
			}
		}
		return nil
	})
	return channel, err
}

func repairUpstreamAnthropicProtocol(tx *gorm.DB, groupID int) error {
	// Reimports can retain missing or locally edited quotes. Check the saved draft.
	stored, err := loadUpstreamQuotes(tx, groupID)
	if err != nil {
		return err
	}
	quotes := make([]UpstreamQuote, 0, len(stored))
	for _, item := range stored {
		quotes = append(quotes, item.Quote)
	}
	if defaultUpstreamGroupProtocol(quotes) != "anthropic" {
		return nil
	}
	return tx.Model(&model.UpstreamQuoteGroup{}).Where("id = ?", groupID).Update("protocol", "anthropic").Error
}

func saveUpstreamQuote(tx *gorm.DB, groupID int, imported int64, quote UpstreamQuote) error {
	if len(quote.Reference) > 0 && !quote.Confirmed && !quote.UsageVerified {
		var prior struct {
			ID       int
			Snapshot string
		}
		err := tx.Table("upstream_quote_models AS qm").Select("qm.id, qv.snapshot").
			Joins("JOIN upstream_quote_versions AS qv ON qv.id = qm.quote_version").
			Where("qm.group_id = ? AND qm.model_id = ?", groupID, quote.ModelID).Scan(&prior).Error
		if err != nil {
			return err
		}
		if prior.ID > 0 {
			var previous UpstreamQuote
			if err := common.UnmarshalJsonStr(prior.Snapshot, &previous); err != nil {
				return err
			}
			if bytes.Equal(previous.Reference, quote.Reference) {
				return tx.Model(&model.UpstreamQuoteModel{}).Where("id = ?", prior.ID).Update("last_seen_import", imported).Error
			}
		}
	}
	return storeUpstreamQuote(tx, groupID, imported, quote)
}

func storeUpstreamQuote(tx *gorm.DB, groupID int, imported int64, quote UpstreamQuote) error {
	data, err := common.Marshal(quote)
	if err != nil {
		return err
	}
	digest := billingexpr.ExprHashString(string(data))
	var version model.UpstreamQuoteVersion
	err = tx.Where("group_id = ? AND digest = ?", groupID, digest).Take(&version).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		version = model.UpstreamQuoteVersion{GroupID: groupID, Digest: digest, Snapshot: string(data), ImportedAt: imported}
		err = tx.Create(&version).Error
	}
	if err != nil {
		return err
	}
	row := model.UpstreamQuoteModel{GroupID: groupID, ModelID: quote.ModelID, QuoteVersion: version.ID, LastSeenImport: imported}
	return tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "group_id"}, {Name: "model_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"quote_version", "last_seen_import"}),
	}).Create(&row).Error
}

func SaveUpstreamModelQuote(groupID, revision int, quote UpstreamQuote) error {
	if !validUpstreamModel(quote.ModelID) || (quote.LocalModel != "" && !validUpstreamModel(quote.LocalModel)) {
		return errors.New("invalid model mapping")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		if err := updateUpstreamDraft(tx, groupID, revision, map[string]any{}); err != nil {
			return err
		}
		var modelRow model.UpstreamQuoteModel
		if err := tx.Where("group_id = ? AND model_id = ?", groupID, quote.ModelID).Take(&modelRow).Error; err != nil {
			return err
		}
		var version model.UpstreamQuoteVersion
		if err := tx.First(&version, modelRow.QuoteVersion).Error; err != nil {
			return err
		}
		var source UpstreamQuote
		if err := common.UnmarshalJsonStr(version.Snapshot, &source); err != nil {
			return err
		}
		quote.Reference = source.Reference
		return storeUpstreamQuote(tx, groupID, modelRow.LastSeenImport, quote)
	})
}

func ConfirmUpstreamModelQuotes(groupID, revision int) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		if err := updateUpstreamDraft(tx, groupID, revision, map[string]any{}); err != nil {
			return err
		}
		quotes, err := loadUpstreamQuotes(tx, groupID)
		if err != nil {
			return err
		}
		for _, item := range quotes {
			quote := item.Quote
			if quote.Confirmed && quote.UsageVerified {
				continue
			}
			quote.Confirmed = true
			quote.UsageVerified = true
			if err := storeUpstreamQuote(tx, groupID, item.LastSeen, quote); err != nil {
				return err
			}
		}
		return nil
	})
}

func ListUpstreamQuoteChannels() ([]UpstreamChannelView, error) {
	var channels []model.UpstreamQuoteChannel
	if err := model.DB.Order("id").Find(&channels).Error; err != nil {
		return nil, err
	}
	var groups []model.UpstreamQuoteGroup
	if err := model.DB.Omit("api_key").Order("id").Find(&groups).Error; err != nil {
		return nil, err
	}
	var rows []struct {
		GroupID        int
		LastSeenImport int64
		Snapshot       string
	}
	if len(groups) > 0 {
		if err := model.DB.Table("upstream_quote_models AS qm").
			Select("qm.group_id, qm.last_seen_import, qv.snapshot").
			Joins("JOIN upstream_quote_versions AS qv ON qv.id = qm.quote_version").
			Scan(&rows).Error; err != nil {
			return nil, err
		}
	}
	multipliers := make(map[int]upstreamGroupMultipliers)
	for _, row := range rows {
		var quote UpstreamQuote
		if err := common.UnmarshalJsonStr(row.Snapshot, &quote); err != nil {
			return nil, err
		}
		rate, _ := upstreamQuoteMultipliers(quote)
		groupRates := multipliers[row.GroupID]
		groupRates.add(rate, row.LastSeenImport)
		multipliers[row.GroupID] = groupRates
	}
	byChannel := make(map[int][]model.UpstreamQuoteGroup)
	for _, group := range groups {
		group.UpstreamMultiplier = multipliers[group.ID].common()
		byChannel[group.ChannelID] = append(byChannel[group.ChannelID], group)
	}
	result := make([]UpstreamChannelView, 0, len(channels))
	for _, channel := range channels {
		result = append(result, UpstreamChannelView{UpstreamQuoteChannel: channel, Groups: byChannel[channel.ID]})
	}
	return result, nil
}

func RenameUpstreamQuoteChannel(id int, name string) error {
	name = strings.TrimSpace(name)
	if !validUpstreamName(name) {
		return errors.New("invalid channel name")
	}
	return model.DB.Model(&model.UpstreamQuoteChannel{}).Where("id = ?", id).Update("name", name).Error
}

func updateUpstreamDraft(tx *gorm.DB, id, revision int, values map[string]any) error {
	values["revision"] = gorm.Expr("revision + 1")
	result := tx.Model(&model.UpstreamQuoteGroup{}).Where("id = ? AND revision = ?", id, revision).Updates(values)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrUpstreamDraftChanged
	}
	return nil
}

func SaveUpstreamGroupConfig(id int, input UpstreamGroupConfig) error {
	input.Name, input.SalesName = strings.TrimSpace(input.Name), strings.TrimSpace(input.SalesName)
	if !validUpstreamName(input.Name) || input.SalesName == "" || utf8.RuneCountInString(input.SalesName) > 272 ||
		strings.IndexFunc(input.SalesName, unicode.IsControl) != -1 || input.Multiplier <= 0 ||
		!validUpstreamAmount(input.Multiplier) || !validUpstreamAmount(input.CreditCost) ||
		(input.FinalMultiplier != nil && (*input.FinalMultiplier <= 0 || !validUpstreamAmount(*input.FinalMultiplier))) {
		return errors.New("check the group names, multiplier and credit cost")
	}
	if input.Protocol != "openai" && input.Protocol != "anthropic" {
		return errors.New("select an API protocol")
	}
	base := strings.TrimRight(strings.TrimSpace(input.BaseURL), "/")
	if base != "" {
		var source string
		err := model.DB.Table("upstream_quote_channels AS ch").Select("ch.source").
			Joins("JOIN upstream_quote_groups AS grp ON grp.channel_id = ch.id").Where("grp.id = ?", id).Scan(&source).Error
		if err != nil {
			return err
		}
		_, _, domain := upstreamSource(source)
		parsed, err := url.Parse(base)
		if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" ||
			(parsed.Port() != "" && parsed.Port() != "443") || domain == "" ||
			(parsed.Hostname() != domain && !strings.HasSuffix(parsed.Hostname(), "."+domain)) {
			return fmt.Errorf("enter an HTTPS API base URL for %s", domain)
		}
		base = strings.TrimSuffix(base, "/v1")
	}
	values := map[string]any{"name": input.Name, "sales_name": input.SalesName, "base_url": base,
		"protocol": input.Protocol, "multiplier": input.Multiplier, "credit_cost": input.CreditCost}
	if input.FinalMultiplier != nil {
		values["final_multiplier"] = *input.FinalMultiplier
	}
	if input.APIKey != nil {
		key := strings.TrimSpace(*input.APIKey)
		if len(key) > 4096 || strings.IndexFunc(key, func(r rune) bool { return unicode.IsControl(r) || unicode.IsSpace(r) }) != -1 {
			return errors.New("invalid upstream API key")
		}
		values["api_key"] = key
	}
	return updateUpstreamDraft(model.DB, id, input.Revision, values)
}

func loadUpstreamQuotes(tx *gorm.DB, id int) ([]UpstreamQuotePreview, error) {
	var rows []struct {
		model.UpstreamQuoteModel `gorm:"embedded"`
		Snapshot                 string
	}
	err := tx.Table("upstream_quote_models AS qm").Select("qm.*, qv.snapshot").
		Joins("JOIN upstream_quote_versions AS qv ON qv.id = qm.quote_version").Where("qm.group_id = ?", id).
		Order("qm.model_id").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	quotes := make([]UpstreamQuotePreview, 0, len(rows))
	for _, row := range rows {
		item := UpstreamQuotePreview{QuoteVersion: row.QuoteVersion, LastSeen: row.LastSeenImport}
		if err := common.UnmarshalJsonStr(row.Snapshot, &item.Quote); err != nil {
			return nil, err
		}
		quotes = append(quotes, item)
	}
	return quotes, nil
}

func previewUpstreamGroup(tx *gorm.DB, id int, multiplier *float64) (UpstreamGroupPreview, error) {
	var preview UpstreamGroupPreview
	if err := tx.First(&preview.UpstreamQuoteGroup, id).Error; err != nil {
		return preview, err
	}
	if preview.APIKey != "" {
		preview.KeyHint = "••••"
		runes := []rune(preview.APIKey)
		if len(runes) > 4 {
			preview.KeyHint += string(runes[len(runes)-4:])
		}
	}
	ratio := preview.Multiplier
	if multiplier != nil {
		ratio = *multiplier
	}
	if ratio <= 0 || !validUpstreamAmount(ratio) {
		return preview, errors.New("invalid sales multiplier")
	}
	quotes, err := loadUpstreamQuotes(tx, id)
	if err != nil {
		return preview, err
	}
	multipliers := upstreamGroupMultipliers{}
	for index := range quotes {
		item := &quotes[index]
		group, applied := upstreamQuoteMultipliers(item.Quote)
		item.UpstreamMultiplier = applied
		multipliers.add(group, item.LastSeen)
	}
	preview.UpstreamMultiplier = multipliers.common()
	for index := range quotes {
		item := &quotes[index]
		adjustment, err := upstreamSalesAdjustment(preview.UpstreamQuoteGroup, ratio, item.UpstreamMultiplier)
		if err != nil {
			item.Error = err.Error()
			continue
		}
		price, err := upstreamSalePrice(preview.UpstreamQuoteGroup, item.Quote, adjustment)
		if err != nil {
			item.Error = err.Error()
			continue
		}
		price.QuoteVersion = item.QuoteVersion
		item.Sale = &price
	}
	preview.Quotes = quotes
	err = tx.Where("group_id = ?", id).Order("id desc").Find(&preview.Versions).Error
	return preview, err
}

func PreviewUpstreamGroup(id int, multiplier *float64) (UpstreamGroupPreview, error) {
	return previewUpstreamGroup(model.DB, id, multiplier)
}

func SetUpstreamGroupListing(id, revision, restoreVersion int, publish bool) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		if err := updateUpstreamDraft(tx, id, revision, map[string]any{}); err != nil {
			return err
		}
		preview, err := previewUpstreamGroup(tx, id, nil)
		if err != nil {
			return err
		}
		version := model.UpstreamSaleVersion{
			GroupID: id, Markup: preview.Multiplier, CreditCost: preview.CreditCost,
			FinalMultiplier: preview.FinalMultiplier,
			Protocol:        preview.Protocol, CreatedAt: time.Now().Unix(),
		}
		if publish {
			if err := publishUpstreamGroup(tx, preview, &version, restoreVersion); err != nil {
				return err
			}
		}
		if preview.ActiveVersion > 0 {
			previousChannel := tx.Model(&model.UpstreamSaleVersion{}).Select("channel_id").Where("id = ?", preview.ActiveVersion)
			if err := tx.Model(&model.Channel{}).Where("id IN (?)", previousChannel).
				Updates(map[string]any{"status": common.ChannelStatusManuallyDisabled, "key": ""}).Error; err != nil {
				return err
			}
		}
		return tx.Model(&model.UpstreamQuoteGroup{}).Where("id = ?", id).Update("active_version", version.ID).Error
	})
}

func publishUpstreamGroup(tx *gorm.DB, preview UpstreamGroupPreview, version *model.UpstreamSaleVersion, restoreVersion int) error {
	if preview.APIKey == "" || preview.BaseURL == "" {
		return errors.New("configure the group's upstream API key and base URL")
	}
	var prices []model.UpstreamSaleModel
	if restoreVersion > 0 {
		var previous model.UpstreamSaleVersion
		if err := tx.Where("group_id = ?", preview.ID).First(&previous, restoreVersion).Error; err != nil {
			return err
		}
		version.Markup = previous.Markup
		version.FinalMultiplier = previous.FinalMultiplier
		version.CreditCost = previous.CreditCost
		if err := tx.Where("version_id = ?", previous.ID).Find(&prices).Error; err != nil {
			return err
		}
	} else {
		for _, item := range preview.Quotes {
			if item.Sale != nil {
				prices = append(prices, *item.Sale)
			} else if item.Quote.Confirmed && item.Quote.UsageVerified && (item.Quote.Kind == "token" || item.Quote.Kind == "fixed") {
				return fmt.Errorf("%s: %s", item.Quote.ModelID, item.Error)
			}
		}
	}
	if len(prices) == 0 {
		return errors.New("the group has no publishable models")
	}
	names := make([]string, 0, len(prices))
	mappings := make(map[string]string)
	seen := make(map[string]bool)
	for _, price := range prices {
		key := strings.ToLower(price.ModelName)
		if seen[key] {
			return fmt.Errorf("duplicate local model %s", price.ModelName)
		}
		seen[key] = true
		for _, endpoint := range strings.Split(price.Endpoints, ",") {
			if (endpoint == string(constant.EndpointTypeAnthropic)) != (preview.Protocol == "anthropic") {
				return fmt.Errorf("%s: current protocol does not support %s", price.ModelName, endpoint)
			}
		}
		names = append(names, price.ModelName)
		if price.ModelName != price.UpstreamName {
			mappings[price.ModelName] = price.UpstreamName
		}
	}
	mapping, err := common.Marshal(mappings)
	if err != nil {
		return err
	}
	channelType := constant.ChannelTypeOpenAI
	if preview.Protocol == "anthropic" {
		channelType = constant.ChannelTypeAnthropic
	}
	channel := model.Channel{
		Type: channelType, Key: preview.APIKey, Status: common.ChannelStatusEnabled,
		Name: model.UpstreamSaleGroupKey(preview.ID), CreatedTime: time.Now().Unix(), BaseURL: &preview.BaseURL,
		Models: strings.Join(names, ","), Group: model.UpstreamSaleGroupKey(preview.ID),
		ModelMapping: common.GetPointer(string(mapping)), AutoBan: common.GetPointer(0),
	}
	if err := tx.Create(&channel).Error; err != nil {
		return err
	}
	version.ChannelID = channel.Id
	if err := tx.Create(version).Error; err != nil {
		return err
	}
	for i := range prices {
		prices[i].ID, prices[i].VersionID = 0, version.ID
	}
	return tx.CreateInBatches(&prices, 50).Error
}
