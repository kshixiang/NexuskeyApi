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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ClipboardPaste, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/multi-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useSystemOptions } from '@/features/system-settings/hooks/use-system-options'
import {
  emptyModelPricingSnapshot,
  modelHasPricing,
  snapshotFromOptionRecords,
  type ModelPricingOptionsSnapshot,
} from '@/features/system-settings/models/model-pricing-persist'
import { createChannel, getChannels, getGroups } from '../../api'
import { CHANNEL_TYPE_OPTIONS, SUCCESS_MESSAGES } from '../../constants'
import { channelsQueryKeys } from '../../lib/channel-actions'
import {
  CHANNEL_FORM_DEFAULT_VALUES,
  formatModels,
  parseModels,
  transformChannelToFormDefaults,
  transformFormDataToCreatePayload,
  type ChannelFormValues,
} from '../../lib/channel-form'
import { getChannelTypeConfig } from '../../lib/channel-type-config'
import { parseChannelConnectionString } from '../../lib/channel-connection'
import type { Channel } from '../../types'
import { ChannelUpstreamModelsPanel } from './channel-upstream-models-panel'

const POPULAR_CHANNEL_TYPE_IDS = [1, 14, 33, 24, 43, 3, 41, 48]

type QuickAddStep = 'source' | 'credentials' | 'models' | 'review'

type ChannelQuickAddDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenFullForm?: () => void
}

function getErrorMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: string }).message)
  }
  return undefined
}

function buildInheritFormValues(
  channel: Channel,
  options?: { inheritBaseUrl?: boolean }
): ChannelFormValues {
  const inherited = transformChannelToFormDefaults(channel)
  return {
    ...inherited,
    key: '',
    name: `${channel.name}_copy`,
    base_url:
      options?.inheritBaseUrl === false ? '' : inherited.base_url || '',
  }
}

export function ChannelQuickAddDialog({
  open,
  onOpenChange,
  onOpenFullForm,
}: ChannelQuickAddDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: systemOptions } = useSystemOptions()

  const [step, setStep] = useState<QuickAddStep>('source')
  const [sourceMode, setSourceMode] = useState<'blank' | 'template'>('blank')
  const [templateChannelId, setTemplateChannelId] = useState<string>('')
  const [inheritBaseUrl, setInheritBaseUrl] = useState(true)
  const [formValues, setFormValues] = useState<ChannelFormValues>(
    CHANNEL_FORM_DEFAULT_VALUES
  )
  const [pricingSnapshot, setPricingSnapshot] =
    useState<ModelPricingOptionsSnapshot>(emptyModelPricingSnapshot())
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: groupsData, isLoading: isLoadingGroups } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
    enabled: open,
  })

  const { data: channelsList } = useQuery({
    queryKey: channelsQueryKeys.list({ p: 1, page_size: 200 }),
    queryFn: () => getChannels({ p: 1, page_size: 200 }),
    enabled: open,
  })

  const channels = useMemo(
    () => channelsList?.data?.items ?? [],
    [channelsList]
  )

  const groupOptions = useMemo(() => {
    const all = new Set([
      ...(groupsData?.data ?? []),
      ...(formValues.group ?? []),
    ])
    return Array.from(all).map((group) => ({ value: group, label: group }))
  }, [formValues.group, groupsData?.data])

  const popularTypes = useMemo(
    () =>
      CHANNEL_TYPE_OPTIONS.filter((opt) =>
        POPULAR_CHANNEL_TYPE_IDS.includes(opt.value)
      ),
    []
  )

  const otherTypes = useMemo(
    () =>
      CHANNEL_TYPE_OPTIONS.filter(
        (opt) => !POPULAR_CHANNEL_TYPE_IDS.includes(opt.value)
      ),
    []
  )

  const effectivePricingSnapshot = useMemo(() => {
    if (systemOptions?.data) {
      return snapshotFromOptionRecords(systemOptions.data, pricingSnapshot)
    }
    return pricingSnapshot
  }, [pricingSnapshot, systemOptions?.data])

  const unpricedModels = useMemo(() => {
    return parseModels(formValues.models).filter(
      (m) => !modelHasPricing(m, effectivePricingSnapshot)
    )
  }, [effectivePricingSnapshot, formValues.models])

  const resetState = useCallback(() => {
    setStep('source')
    setSourceMode('blank')
    setTemplateChannelId('')
    setInheritBaseUrl(true)
    setFormValues(CHANNEL_FORM_DEFAULT_VALUES)
    setPricingSnapshot(emptyModelPricingSnapshot())
    setIsSubmitting(false)
  }, [])

  useEffect(() => {
    if (!open) {
      resetState()
    }
  }, [open, resetState])

  useEffect(() => {
    if (systemOptions?.data) {
      setPricingSnapshot(snapshotFromOptionRecords(systemOptions.data))
    }
  }, [systemOptions?.data])

  const patchForm = useCallback((patch: Partial<ChannelFormValues>) => {
    setFormValues((prev) => ({ ...prev, ...patch }))
  }, [])

  const applyTemplate = useCallback(
    (channelId: string) => {
      const channel = channels.find((c) => String(c.id) === channelId)
      if (!channel) return
      setFormValues(buildInheritFormValues(channel, { inheritBaseUrl }))
      setSourceMode('template')
      setTemplateChannelId(channelId)
    },
    [channels, inheritBaseUrl]
  )

  const handlePasteClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      const parsed = parseChannelConnectionString(text)
      if (!parsed) {
        toast.error(t('Invalid connection string in clipboard'))
        return
      }
      patchForm({
        key: parsed.key,
        base_url: parsed.url,
      })
      toast.success(t('Pasted from clipboard'))
    } catch {
      toast.error(t('Failed to read clipboard'))
    }
  }, [patchForm, t])

  const handleTypeChange = useCallback((type: number) => {
    const config = getChannelTypeConfig(type)
    patchForm({
      type,
      base_url: config?.defaultBaseUrl ?? '',
    })
  }, [patchForm])

  const canNextFromSource =
    sourceMode === 'blank'
      ? formValues.type > 0
      : Boolean(templateChannelId)

  const canNextFromCredentials = Boolean(formValues.key?.trim())

  const canNextFromModels =
    Boolean(formValues.models?.trim()) && (formValues.group?.length ?? 0) > 0

  const handleNext = useCallback(() => {
    if (step === 'source') {
      if (sourceMode === 'template' && templateChannelId) {
        applyTemplate(templateChannelId)
      }
      setStep('credentials')
      return
    }
    if (step === 'credentials') {
      setStep('models')
      return
    }
    if (step === 'models') {
      setStep('review')
    }
  }, [applyTemplate, sourceMode, step, templateChannelId])

  const handleBack = useCallback(() => {
    if (step === 'credentials') setStep('source')
    else if (step === 'models') setStep('credentials')
    else if (step === 'review') setStep('models')
  }, [step])

  const handleSubmit = useCallback(async () => {
    if (!formValues.name.trim()) {
      patchForm({ name: `${CHANNEL_TYPE_OPTIONS.find((o) => o.value === formValues.type)?.label ?? 'Channel'}_${Date.now()}` })
    }
    const values: ChannelFormValues = {
      ...formValues,
      name:
        formValues.name.trim() ||
        `${CHANNEL_TYPE_OPTIONS.find((o) => o.value === formValues.type)?.label ?? 'Channel'}_${Date.now()}`,
    }
    setIsSubmitting(true)
    try {
      const payload = transformFormDataToCreatePayload(values)
      const response = await createChannel(payload)
      if (response.success) {
        toast.success(t(SUCCESS_MESSAGES.CREATED))
        await queryClient.invalidateQueries({ queryKey: channelsQueryKeys.all })
        onOpenChange(false)
      } else {
        toast.error(response.message || t('Failed to create channel'))
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || t('Failed to create channel'))
    } finally {
      setIsSubmitting(false)
    }
  }, [formValues, onOpenChange, patchForm, queryClient, t])

  const stepTitle = useMemo(() => {
    switch (step) {
      case 'source':
        return t('Quick Add Channel')
      case 'credentials':
        return t('API credentials')
      case 'models':
        return t('Models and pricing')
      case 'review':
        return t('Review and create')
      default:
        return t('Quick Add Channel')
    }
  }, [step, t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{stepTitle}</DialogTitle>
          <DialogDescription>
            {t(
              'Add a channel in a few steps. Use full form for advanced settings.'
            )}
          </DialogDescription>
        </DialogHeader>

        {step === 'source' && (
          <div className='space-y-4 py-2'>
            <div className='flex gap-2'>
              <Button
                type='button'
                variant={sourceMode === 'blank' ? 'default' : 'outline'}
                size='sm'
                onClick={() => setSourceMode('blank')}
              >
                {t('Blank')}
              </Button>
              <Button
                type='button'
                variant={sourceMode === 'template' ? 'default' : 'outline'}
                size='sm'
                onClick={() => setSourceMode('template')}
              >
                {t('From existing channel')}
              </Button>
            </div>

            {sourceMode === 'blank' ? (
              <div className='space-y-3'>
                <Label>{t('Channel type')}</Label>
                <Select
                  value={String(formValues.type)}
                  onValueChange={(v) => handleTypeChange(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('Select channel type')} />
                  </SelectTrigger>
                  <SelectContent>
                    {popularTypes.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {t(opt.label)}
                      </SelectItem>
                    ))}
                    <Separator className='my-1' />
                    {otherTypes.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {t(opt.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className='space-y-3'>
                <Label>{t('Template channel')}</Label>
                <Select
                  value={templateChannelId}
                  onValueChange={(v) => {
                    if (!v) return
                    setTemplateChannelId(v)
                    applyTemplate(v)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('Select a channel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((ch) => (
                      <SelectItem key={ch.id} value={String(ch.id)}>
                        #{ch.id} {ch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className='flex items-center gap-2'>
                  <Checkbox
                    id='inherit-base-url'
                    checked={inheritBaseUrl}
                    onCheckedChange={(c) => {
                      const checked = c === true
                      setInheritBaseUrl(checked)
                      if (templateChannelId) {
                        const template = channels.find(
                          (item) => String(item.id) === templateChannelId
                        )
                        if (template) {
                          setFormValues(
                            buildInheritFormValues(template, {
                              inheritBaseUrl: checked,
                            })
                          )
                        }
                      }
                    }}
                  />
                  <Label htmlFor='inherit-base-url' className='font-normal'>
                    {t('Inherit base URL')}
                  </Label>
                </div>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Inherits models, groups, and mapping. API key is not copied.'
                  )}
                </p>
              </div>
            )}

            <div className='space-y-2'>
              <Label htmlFor='quick-name'>{t('Channel name')}</Label>
              <Input
                id='quick-name'
                value={formValues.name}
                onChange={(e) => patchForm({ name: e.target.value })}
                placeholder={t('My OpenAI channel')}
              />
            </div>
          </div>
        )}

        {step === 'credentials' && (
          <div className='space-y-4 py-2'>
            <div className='flex justify-end'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => void handlePasteClipboard()}
              >
                <ClipboardPaste className='h-4 w-4' />
                {t('Paste from clipboard')}
              </Button>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='quick-key'>{t('API Key *')}</Label>
              <Input
                id='quick-key'
                type='password'
                value={formValues.key}
                onChange={(e) => patchForm({ key: e.target.value })}
                placeholder={t('sk-...')}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='quick-base-url'>{t('Base URL')}</Label>
              <Input
                id='quick-base-url'
                value={formValues.base_url ?? ''}
                onChange={(e) => patchForm({ base_url: e.target.value })}
                placeholder={
                  getChannelTypeConfig(formValues.type)?.defaultBaseUrl ?? ''
                }
              />
            </div>
          </div>
        )}

        {step === 'models' && (
          <div className='space-y-4 py-2'>
            <div className='space-y-2'>
              <Label>{t('Groups *')}</Label>
              {isLoadingGroups ? (
                <div className='text-muted-foreground text-sm'>
                  {t('Loading...')}
                </div>
              ) : (
                <MultiSelect
                  options={groupOptions}
                  selected={formValues.group}
                  onChange={(group) => patchForm({ group })}
                  placeholder={t('default')}
                />
              )}
            </div>
            <ChannelUpstreamModelsPanel
              channelType={formValues.type}
              apiKey={formValues.key}
              baseUrl={formValues.base_url ?? ''}
              models={formValues.models}
              onModelsChange={(models) => patchForm({ models })}
              pricingSnapshot={pricingSnapshot}
              onPricingSnapshotChange={setPricingSnapshot}
            />
          </div>
        )}

        {step === 'review' && (
          <div className='space-y-4 py-2'>
            <dl className='grid gap-2 text-sm'>
              <div className='flex justify-between gap-4'>
                <dt className='text-muted-foreground'>{t('Name')}</dt>
                <dd className='text-right font-medium'>{formValues.name}</dd>
              </div>
              <div className='flex justify-between gap-4'>
                <dt className='text-muted-foreground'>{t('Type')}</dt>
                <dd className='text-right font-medium'>
                  {t(
                    CHANNEL_TYPE_OPTIONS.find((o) => o.value === formValues.type)
                      ?.label ?? String(formValues.type)
                  )}
                </dd>
              </div>
              <div className='flex justify-between gap-4'>
                <dt className='text-muted-foreground'>{t('Models')}</dt>
                <dd className='max-w-[60%] truncate text-right font-medium'>
                  {formValues.models}
                </dd>
              </div>
              <div className='flex justify-between gap-4'>
                <dt className='text-muted-foreground'>{t('Groups')}</dt>
                <dd className='text-right font-medium'>
                  {formatModels(formValues.group)}
                </dd>
              </div>
            </dl>
            {unpricedModels.length > 0 && (
              <Alert variant='destructive'>
                <AlertTriangle className='h-4 w-4' />
                <AlertDescription>
                  {t(
                    '{{count}} model(s) have no pricing configured yet. You can still create the channel.',
                    { count: unpricedModels.length }
                  )}
                  : {unpricedModels.slice(0, 5).join(', ')}
                  {unpricedModels.length > 5 ? '…' : ''}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className='flex-col gap-2 sm:flex-row sm:justify-between'>
          <div className='flex gap-2'>
            {onOpenFullForm && (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => {
                  onOpenChange(false)
                  onOpenFullForm()
                }}
              >
                {t('Full form')}
              </Button>
            )}
          </div>
          <div className='flex gap-2'>
            {step !== 'source' && (
              <Button type='button' variant='outline' onClick={handleBack}>
                {t('Back')}
              </Button>
            )}
            {step !== 'review' ? (
              <Button
                type='button'
                onClick={handleNext}
                disabled={
                  (step === 'source' && !canNextFromSource) ||
                  (step === 'credentials' && !canNextFromCredentials) ||
                  (step === 'models' && !canNextFromModels)
                }
              >
                {t('Next')}
              </Button>
            ) : (
              <Button
                type='button'
                disabled={isSubmitting}
                onClick={() => void handleSubmit()}
              >
                {isSubmitting && (
                  <Loader2 className='h-4 w-4 animate-spin' />
                )}
                {t('Create channel')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
