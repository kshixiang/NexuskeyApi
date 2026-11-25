/*
Copyright (C) 2025 QuantumNous

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
import React, { useState, useEffect, useMemo } from 'react';
import {
  Button,
  Modal,
  RadioGroup,
  Radio,
  Select,
  Input,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { copy, selectFilter } from '../../../../helpers';

const APP_CONFIGS = {
  claude: {
    label: 'Claude',
    importApp: 'claude',
    defaultName: 'My Claude',
    modelFields: [
      { key: 'model', label: '主模型' },
      { key: 'haikuModel', label: 'Haiku 模型' },
      { key: 'sonnetModel', label: 'Sonnet 模型' },
      { key: 'opusModel', label: 'Opus 模型' },
    ],
  },
  codex: {
    label: 'Codex',
    importApp: 'codex',
    defaultName: 'My Codex',
    defaultModel: 'gpt-5.5',
    modelFields: [{ key: 'model', label: '主模型' }],
  },
  gemini: {
    label: 'Gemini',
    importApp: 'gemini',
    defaultName: 'My Gemini',
    modelFields: [{ key: 'model', label: '主模型' }],
  },
  grok: {
    label: 'Grok',
    importApp: 'grokbuild',
    defaultName: 'My Grok',
    defaultModel: 'grok-4.5',
    modelFields: [{ key: 'model', label: '主模型' }],
  },
  codebuddy: {
    label: 'CodeBuddy',
    defaultName: 'My CodeBuddy',
    modelFields: [{ key: 'model', label: '主模型' }],
  },
};

const CC_SWITCH_USAGE_SCRIPT = `({
  request: {
    url: "{{baseUrl}}/v1/usage",
    method: "GET",
    headers: { "Authorization": "Bearer {{apiKey}}" }
  },
  extractor: function(response) {
    const remaining = response?.remaining ?? response?.quota?.remaining ?? response?.balance;
    const unit = response?.unit ?? response?.quota?.unit ?? "USD";
    return {
      isValid: response?.is_active ?? response?.isValid ?? true,
      remaining,
      unit
    };
  }
})`;

function resolveAbsoluteHttpURL(value) {
  const fallback = window.location.origin;
  try {
    const rawValue = String(value || '').trim();
    const bareHostPattern =
      /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\]|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?(?:[/?#].*)?$/i;
    const candidate = bareHostPattern.test(rawValue)
      ? `${window.location.protocol}//${rawValue}`
      : rawValue || fallback;
    const url = new URL(candidate, fallback);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback;
    return url.toString().replace(/\/+$/, '');
  } catch (_) {
    return fallback;
  }
}

function getServerAddress() {
  try {
    const raw = localStorage.getItem('status');
    if (raw) {
      const status = JSON.parse(raw);
      if (status.server_address) {
        return resolveAbsoluteHttpURL(status.server_address);
      }
    }
  } catch (_) {}
  return resolveAbsoluteHttpURL(window.location.origin);
}

function withV1Endpoint(baseUrl) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  return normalizedBaseUrl.endsWith('/v1')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/v1`;
}

function chatCompletionsEndpoint(serverAddress) {
  const url = new URL(serverAddress);
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/chat/completions')
    ? path
    : `${withV1Endpoint(path)}/chat/completions`;
  url.hash = '';
  return url;
}

function buildCodeBuddyConfig(serverAddress, name, model, apiKey, format) {
  const modelConfig = {
    id: model,
    name: model,
    vendor: name.trim() || 'CodeBuddy',
    url: chatCompletionsEndpoint(serverAddress).toString(),
    apiKey,
    supportsToolCall: true,
  };
  return JSON.stringify(
    format === 'cc-switch' ? modelConfig : { models: [modelConfig] },
    null,
    2,
  );
}

function getDefaultModels(app) {
  const defaultModel = APP_CONFIGS[app].defaultModel;
  return defaultModel ? { model: defaultModel } : {};
}

function buildCCSwitchURL(app, name, models, apiKey) {
  const serverAddress = getServerAddress().replace(/\/+$/, '');
  const config = APP_CONFIGS[app];
  const endpoint =
    app === 'grok' ? withV1Endpoint(serverAddress) : serverAddress;
  const params = new URLSearchParams();
  params.set('resource', 'provider');
  params.set('app', config.importApp);
  params.set('name', name);
  params.set('endpoint', endpoint);
  params.set('apiKey', apiKey);
  for (const [k, v] of Object.entries(models)) {
    if (v) params.set(k, v);
  }
  params.set('homepage', serverAddress);
  params.set('configFormat', 'json');
  params.set('usageEnabled', 'true');
  params.set('usageScript', window.btoa(CC_SWITCH_USAGE_SCRIPT));
  params.set('usageAutoInterval', '30');
  return `ccswitch://v1/import?${params.toString()}`;
}

export default function CCSwitchModal({
  visible,
  onClose,
  tokenKey,
  modelOptions,
}) {
  const { t } = useTranslation();
  const [app, setApp] = useState('claude');
  const [name, setName] = useState(APP_CONFIGS.claude.defaultName);
  const [models, setModels] = useState({});

  const currentConfig = APP_CONFIGS[app];

  useEffect(() => {
    if (visible) {
      setModels({});
      setApp('claude');
      setName(APP_CONFIGS.claude.defaultName);
    }
  }, [visible]);

  const handleAppChange = (val) => {
    setApp(val);
    setName(APP_CONFIGS[val].defaultName);
    setModels(getDefaultModels(val));
  };

  const handleModelChange = (field, value) => {
    setModels((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (format = 'cc-switch') => {
    const model = app === 'codebuddy' ? models.model?.trim() : models.model;
    if (!model) {
      Toast.warning(t('请选择主模型'));
      return;
    }
    const key = tokenKey.startsWith('sk-') ? tokenKey : `sk-${tokenKey}`;
    if (app === 'codebuddy') {
      const config = buildCodeBuddyConfig(
        getServerAddress(),
        name,
        model,
        key,
        format,
      );
      if (await copy(config)) {
        Toast.success(t('复制成功'));
      } else {
        Toast.error(t('复制失败'));
      }
      return;
    }
    const url = buildCCSwitchURL(app, name, models, key);
    window.open(url, '_self');
    onClose();
  };

  const fieldLabelStyle = useMemo(
    () => ({
      marginBottom: 4,
      fontSize: 13,
      color: 'var(--semi-color-text-1)',
    }),
    [],
  );

  return (
    <Modal
      title={t('填入 CC Switch')}
      visible={visible}
      onCancel={onClose}
      onOk={() => handleSubmit()}
      okText={
        app === 'codebuddy' ? t('复制 CC Switch JSON') : t('打开 CC Switch')
      }
      cancelText={t('取消')}
      maskClosable={false}
      width={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={fieldLabelStyle}>{t('应用')}</div>
          <RadioGroup
            type='button'
            value={app}
            onChange={(e) => handleAppChange(e.target.value)}
            style={{ width: '100%' }}
          >
            {Object.entries(APP_CONFIGS).map(([key, cfg]) => (
              <Radio key={key} value={key}>
                {cfg.label}
              </Radio>
            ))}
          </RadioGroup>
        </div>

        <div>
          <div style={fieldLabelStyle}>{t('名称')}</div>
          <Input
            value={name}
            onChange={setName}
            placeholder={currentConfig.defaultName}
          />
        </div>

        {currentConfig.modelFields.map((field) => (
          <div key={field.key}>
            <div style={fieldLabelStyle}>
              {t(field.label)}
              {field.key === 'model' && (
                <Typography.Text type='danger'> *</Typography.Text>
              )}
            </div>
            <Select
              placeholder={t('请选择模型')}
              optionList={modelOptions}
              value={models[field.key] || undefined}
              onChange={(val) => handleModelChange(field.key, val)}
              filter={selectFilter}
              style={{ width: '100%' }}
              showClear
              searchable
              emptyContent={t('暂无数据')}
            />
          </div>
        ))}

        {app === 'codebuddy' && (
          <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
            <Typography.Text type='secondary'>
              {t(
                '在 CC Switch 4.0.41 或更高版本中，进入 CodeBuddy，选择「添加供应商」里的「自定义」。填写供应商名称和所选模型 ID，将内容粘贴到「配置 JSON」并保存。',
              )}
            </Typography.Text>
            <Typography.Text type='secondary'>
              {t(
                '将 JSON 粘贴到 {{path}}。如果文件已存在，将模型条目合并到 {{models}}。如果已启用 {{availableModels}} 列表，也将模型 ID 加入该列表。最后通过 {{command}} 选择模型。',
                {
                  path: '~/.codebuddy/models.json',
                  models: 'models',
                  availableModels: 'availableModels',
                  command: '/model',
                },
              )}
            </Typography.Text>
            <Button size='small' onClick={() => handleSubmit('models-file')}>
              {t('复制配置')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
