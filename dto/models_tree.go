package dto

import "github.com/QuantumNous/new-api/constant"

const ModelsTreeVersion = 1

type ModelsTreeResponse struct {
	Version      int                  `json:"version"`
	GeneratedAt  string               `json:"generated_at"`
	Object       string               `json:"object"`
	Channels     []ModelsTreeChannel  `json:"channels"`
	ModelCount   int                  `json:"model_count"`
	ChannelCount int                  `json:"channel_count"`
}

type ModelsTreeChannel struct {
	Type   int                `json:"type"`
	Key    string             `json:"key"`
	Name   string             `json:"name"`
	Models []ModelsTreeModel  `json:"models"`
}

type ModelsTreeModel struct {
	ID             string                  `json:"id"`
	EndpointTypes  []constant.EndpointType `json:"endpoint_types,omitempty"`
}
