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
import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getUserModels } from '@/lib/api'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Button } from '@/components/ui/button'
import { ComboboxInput } from '@/components/ui/combobox-input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  buildCCSwitchImportURL,
  buildCodeBuddyConfig,
  resolveAbsoluteHttpURL,
  withV1Endpoint,
  type CodeBuddyConfigFormat,
} from '../../lib/cc-switch'

const APP_CONFIGS = {
  claude: {
    label: 'Claude',
    importApp: 'claude',
    defaultName: 'My Claude',
    modelFields: [
      { key: 'model', labelKey: 'Primary Model', required: true },
      { key: 'haikuModel', labelKey: 'Haiku Model', required: false },
      { key: 'sonnetModel', labelKey: 'Sonnet Model', required: false },
      { key: 'opusModel', labelKey: 'Opus Model', required: false },
    ],
  },
  codex: {
    label: 'Codex',
    importApp: 'codex',
    defaultName: 'My Codex',
    defaultModel: 'gpt-5.5',
    modelFields: [{ key: 'model', labelKey: 'Primary Model', required: true }],
  },
  gemini: {
    label: 'Gemini',
    importApp: 'gemini',
    defaultName: 'My Gemini',
    modelFields: [{ key: 'model', labelKey: 'Primary Model', required: true }],
  },
  grok: {
    label: 'Grok',
    importApp: 'grokbuild',
    defaultName: 'My Grok',
    defaultModel: 'grok-4.5',
    modelFields: [{ key: 'model', labelKey: 'Primary Model', required: true }],
  },
  codebuddy: {
    label: 'CodeBuddy',
    importApp: null,
    defaultName: 'My CodeBuddy',
    modelFields: [{ key: 'model', labelKey: 'Primary Model', required: true }],
  },
} as const

type AppType = keyof typeof APP_CONFIGS

function getServerAddress(): string {
  try {
    const raw = localStorage.getItem('status')
    if (raw) {
      const status = JSON.parse(raw)
      if (status.server_address) {
        return resolveAbsoluteHttpURL(String(status.server_address))
      }
    }
  } catch {
    /* empty */
  }
  return resolveAbsoluteHttpURL(window.location.origin)
}

function getDefaultModels(app: AppType): Record<string, string> {
  const config = APP_CONFIGS[app]
  return 'defaultModel' in config ? { model: config.defaultModel } : {}
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tokenKey: string
}

export function CCSwitchDialog(props: Props) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const [app, setApp] = useState<AppType>('claude')
  const [name, setName] = useState<string>(APP_CONFIGS.claude.defaultName)
  const [models, setModels] = useState<Record<string, string>>({})

  const { data: modelsData } = useQuery({
    queryKey: ['user-models-ccswitch'],
    queryFn: getUserModels,
    enabled: props.open,
    staleTime: 5 * 60 * 1000,
  })

  const modelOptions = useMemo(() => {
    const items = modelsData?.data ?? []
    return items.map((m) => ({ value: m, label: m }))
  }, [modelsData?.data])

  useEffect(() => {
    if (props.open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModels({})

      setApp('claude')

      setName(APP_CONFIGS.claude.defaultName)
    }
  }, [props.open])

  const currentConfig = APP_CONFIGS[app]

  const handleAppChange = (val: string) => {
    const appVal = val as AppType
    setApp(appVal)
    setName(APP_CONFIGS[appVal].defaultName)
    setModels(getDefaultModels(appVal))
  }

  const handleSubmit = async (format: CodeBuddyConfigFormat = 'cc-switch') => {
    const model =
      app === 'codebuddy'
        ? models.model?.trim()
        : models.model
    if (!model) {
      toast.warning(t('Please select a primary model'))
      return
    }
    const key = props.tokenKey.startsWith('sk-')
      ? props.tokenKey
      : `sk-${props.tokenKey}`
    const serverAddress = getServerAddress().replace(/\/+$/, '')
    if (currentConfig.importApp === null) {
      await copyToClipboard(
        buildCodeBuddyConfig(serverAddress, name, model, key, format)
      )
      return
    }
    const endpoint =
      app === 'grok' ? withV1Endpoint(serverAddress) : serverAddress
    const url = buildCCSwitchImportURL({
      app: currentConfig.importApp,
      name,
      endpoint,
      homepage: serverAddress,
      apiKey: key,
      models: models,
    })
    window.open(url, '_self')
    props.onOpenChange(false)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Import to CC Switch')}</DialogTitle>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label>{t('Application')}</Label>
            <RadioGroup
              value={app}
              onValueChange={handleAppChange}
              className='flex flex-wrap gap-x-4 gap-y-2'
            >
              {(
                Object.entries(APP_CONFIGS) as [
                  AppType,
                  (typeof APP_CONFIGS)[AppType],
                ][]
              ).map(([key, cfg]) => (
                <div key={key} className='flex items-center gap-2'>
                  <RadioGroupItem value={key} id={`app-${key}`} />
                  <Label htmlFor={`app-${key}`} className='cursor-pointer'>
                    {cfg.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className='space-y-2'>
            <Label>{t('Name')}</Label>
            <ComboboxInput
              options={[]}
              value={name}
              onValueChange={setName}
              placeholder={currentConfig.defaultName}
              emptyText=''
            />
          </div>

          {currentConfig.modelFields.map((field) => (
            <div key={field.key} className='space-y-2'>
              <Label>
                {t(field.labelKey)}
                {field.required && (
                  <span className='text-destructive ml-0.5'>*</span>
                )}
              </Label>
              <ComboboxInput
                options={modelOptions}
                value={models[field.key] || ''}
                onValueChange={(v) =>
                  setModels((prev) => ({ ...prev, [field.key]: v }))
                }
                placeholder={t('Select or enter model name')}
                emptyText={t('No models found')}
              />
            </div>
          ))}

          {app === 'codebuddy' && (
            <div className='text-muted-foreground space-y-2 text-sm'>
              <p>
                {t(
                  'In CC Switch 4.0.41 or later, open CodeBuddy and choose Add Provider, then Custom. Enter a provider name and the selected model ID, paste into Configuration JSON, and save.'
                )}
              </p>
              <p>
                {t(
                  'Paste the JSON into {{path}}. If the file already exists, merge the entry into {{models}} and add its ID to {{availableModels}} if that list is in use. Then select the model with {{command}}.',
                  {
                    path: '~/.codebuddy/models.json',
                    models: 'models',
                    availableModels: 'availableModels',
                    command: '/model',
                  }
                )}
              </p>
              <Button
                variant='outline'
                size='sm'
                onClick={() => handleSubmit('models-file')}
              >
                {t('Copy Configuration')}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={() => handleSubmit()}>
            {app === 'codebuddy'
              ? t('Copy CC Switch JSON')
              : t('Open CC Switch')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
