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
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getUserModels, getUserGroups } from '@/lib/api'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { resolveModelProvider } from '@/lib/model-provider'
import { cn } from '@/lib/utils'
import { useStatus } from '@/hooks/use-status'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldGroup, FieldLegend, FieldSet } from '@/components/ui/field'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { SheetContent } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { DateTimePicker } from '@/components/datetime-picker'
import { MultiSelect } from '@/components/multi-select'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import type { PricingModel, PricingVendor } from '@/features/pricing/types'
import { createApiKey, updateApiKey, getApiKey } from '../api'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants'
import {
  apiKeyFormSchema,
  type ApiKeyFormValues,
  getApiKeyFormDefaultValues,
  transformFormDataToPayload,
  transformApiKeyToFormDefaults,
} from '../lib'
import { type ApiKey } from '../types'
import { ApiKeyCategorySelect } from './api-key-category-select'
import { ApiKeyGroupCards, ApiKeyVendorCards } from './api-key-group-cards'
import {
  ApiKeyGroupCombobox,
  type ApiKeyGroupOption,
} from './api-key-group-combobox'
import { ApiKeyGroupModelsPanel } from './api-key-group-models-panel'
import { useApiKeys } from './api-keys-provider'

type ApiKeysMutateFormProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: ApiKey
}

function getInferredVendor(model: PricingModel): PricingVendor | null {
  const provider = resolveModelProvider(model.model_name)
  if (!provider) return null

  return {
    id: -1,
    name: provider.label === 'Claude' ? 'Anthropic' : provider.label,
    icon: provider.icon,
  }
}

function modelMatchesVendor(model: PricingModel, vendor: PricingVendor) {
  if (model.vendor_name === vendor.name) return true

  const inferredVendor = getInferredVendor(model)
  return Boolean(
    inferredVendor &&
    (inferredVendor.name === vendor.name ||
      (inferredVendor.icon && inferredVendor.icon === vendor.icon))
  )
}

export function ApiKeysMutateForm({
  open,
  onOpenChange,
  currentRow,
}: ApiKeysMutateFormProps) {
  const { t } = useTranslation()
  const isUpdate = !!currentRow
  const Content = isUpdate ? SheetContent : DialogContent
  const { triggerRefresh } = useApiKeys()
  const { status } = useStatus()
  const {
    models: pricingModels,
    vendors: pricingVendors,
    isLoading: pricingPending,
  } = usePricingData()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState('')
  const defaultUseAutoGroup = status?.default_use_auto_group === true

  // Fetch models
  const { data: modelsData } = useQuery({
    queryKey: ['user-models'],
    queryFn: getUserModels,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })

  // Fetch groups
  const { data: groupsData, isPending: groupsPending } = useQuery({
    queryKey: ['user-groups'],
    queryFn: getUserGroups,
    staleTime: 5 * 60 * 1000,
  })

  const models = modelsData?.data || []
  const vendorOptions = useMemo(() => {
    const options = pricingVendors.filter((vendor) =>
      pricingModels.some((model) => modelMatchesVendor(model, vendor))
    )
    const knownVendors = new Set(
      options.flatMap((vendor) => [vendor.name, vendor.icon])
    )

    for (const model of pricingModels) {
      const inferredVendor = getInferredVendor(model)
      if (!inferredVendor) continue
      if (
        knownVendors.has(inferredVendor.name) ||
        knownVendors.has(inferredVendor.icon)
      ) {
        continue
      }
      options.push({
        ...inferredVendor,
        id: -(options.length + 1),
      })
      knownVendors.add(inferredVendor.name)
      knownVendors.add(inferredVendor.icon)
    }

    return options
  }, [pricingModels, pricingVendors])
  const groupsRaw = groupsData?.success ? groupsData.data || {} : {}
  const groups: ApiKeyGroupOption[] = Object.entries(groupsRaw).map(
    ([key, info]) => ({
      value: key,
      label: key.startsWith('upstream-sale-') ? info.desc || key : key,
      desc: key.startsWith('upstream-sale-') ? undefined : info.desc || key,
      ratio: info.ratio,
    })
  )

  // Keep the automatic option available once the group list has loaded.
  if (
    (isUpdate || groupsData?.success) &&
    !groups.some((g) => g.value === 'auto')
  ) {
    groups.unshift({
      value: 'auto',
      label: 'auto',
      desc: t('Auto (Circuit Breaker)'),
    })
  }

  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: getApiKeyFormDefaultValues(defaultUseAutoGroup),
  })

  // Load existing data when updating
  useEffect(() => {
    if (open) setAdvancedOpen(false)
    if (open && !isUpdate) setSelectedVendor('')
    if (open && isUpdate && currentRow) {
      // For update, fetch fresh data
      getApiKey(currentRow.id).then((result) => {
        if (result.success && result.data) {
          form.reset(transformApiKeyToFormDefaults(result.data))
        }
      })
    } else if (open && !isUpdate) {
      // For create, reset to defaults
      form.reset(getApiKeyFormDefaultValues(defaultUseAutoGroup))
    }
  }, [open, isUpdate, currentRow, form, defaultUseAutoGroup])

  const onSubmit = async (data: ApiKeyFormValues) => {
    if (!isUpdate && !groups.some((group) => group.value === data.group)) {
      form.setError('group', { message: t('Group is required') })
      return
    }

    setIsSubmitting(true)
    try {
      const basePayload = transformFormDataToPayload(data)

      if (isUpdate && currentRow) {
        const result = await updateApiKey({
          ...basePayload,
          id: currentRow.id,
        })
        if (result.success) {
          toast.success(t(SUCCESS_MESSAGES.API_KEY_UPDATED))
          onOpenChange(false)
          triggerRefresh()
        } else {
          toast.error(result.message || t(ERROR_MESSAGES.UPDATE_FAILED))
        }
      } else {
        // Create mode - handle batch creation
        const count = data.tokenCount || 1
        let successCount = 0

        for (let i = 0; i < count; i++) {
          const result = await createApiKey({
            ...basePayload,
            name:
              i === 0 && data.name
                ? data.name
                : `${data.name || 'default'}-${Math.random().toString(36).slice(2, 8)}`,
          })
          if (result.success) {
            successCount++
          } else {
            toast.error(result.message || t(ERROR_MESSAGES.CREATE_FAILED))
            break
          }
        }

        if (successCount > 0) {
          toast.success(
            t('Successfully created {{count}} API Key(s)', {
              count: successCount,
            })
          )
          onOpenChange(false)
          triggerRefresh()
        }
      }
    } catch (_error) {
      toast.error(t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSetExpiry = (months: number, days: number, hours: number) => {
    if (months === 0 && days === 0 && hours === 0) {
      form.setValue('expired_time', undefined)
      return
    }

    const now = new Date()
    now.setMonth(now.getMonth() + months)
    now.setDate(now.getDate() + days)
    now.setHours(now.getHours() + hours)

    form.setValue('expired_time', now)
  }

  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'
  const quotaLabel = t('Quota ({{currency}})', { currency: currencyLabel })
  const quotaPlaceholder = tokensOnly
    ? t('Enter quota in tokens')
    : t('Enter quota in {{currency}}', { currency: currencyLabel })
  const selectedGroup = form.watch('group')
  const selectedVendorOption = vendorOptions.find(
    (vendor) => vendor.name === selectedVendor
  )
  const selectedVendorModels = selectedVendor
    ? pricingModels.filter((model) =>
        selectedVendorOption
          ? modelMatchesVendor(model, selectedVendorOption)
          : false
      )
    : pricingModels
  const vendorHasAllGroups = selectedVendorModels.some((model) =>
    model.enable_groups?.includes('all')
  )
  const vendorGroups = new Set(
    selectedVendorModels.flatMap((model) => model.enable_groups ?? [])
  )
  const visibleGroups =
    !isUpdate && selectedVendor && !vendorHasAllGroups
      ? groups.filter(
          (group) => group.value === 'auto' || vendorGroups.has(group.value)
        )
      : groups
  const hasSelectedGroup = groups.some((group) => group.value === selectedGroup)
  const unlimitedQuota = form.watch('unlimited_quota')

  const handleVendorChange = (vendor: string) => {
    setSelectedVendor(vendor)
    const nextVendor = vendorOptions.find((option) => option.name === vendor)
    const nextVendorModels = nextVendor
      ? pricingModels.filter((model) => modelMatchesVendor(model, nextVendor))
      : pricingModels
    const nextVendorHasAllGroups = nextVendorModels.some((model) =>
      model.enable_groups?.includes('all')
    )
    const nextVendorGroups = new Set(
      nextVendorModels.flatMap((model) => model.enable_groups ?? [])
    )
    if (
      vendor &&
      selectedGroup &&
      selectedGroup !== 'auto' &&
      !nextVendorGroups.has(selectedGroup) &&
      !nextVendorHasAllGroups
    ) {
      form.setValue('group', '')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) {
          form.reset()
        }
      }}
    >
      <Content
        className={cn(
          'bg-background flex flex-col gap-0 overflow-hidden p-0',
          isUpdate
            ? '!h-dvh !w-screen max-w-none sm:!w-full sm:!max-w-[680px]'
            : 'max-h-[calc(100dvh-2rem)] sm:max-w-[680px]'
        )}
      >
        <header className='bg-background flex shrink-0 flex-col gap-0.5 border-b py-3 ps-4 pe-12 text-start sm:py-4 sm:ps-5'>
          <DialogTitle className='text-base font-semibold sm:text-lg'>
            {isUpdate ? t('Update API Key') : t('Create API Key')}
          </DialogTitle>
          <DialogDescription className='text-xs sm:text-sm'>
            {isUpdate
              ? t('Update the API key by providing necessary info.')
              : t('Select a group')}
          </DialogDescription>
        </header>
        <Form {...form}>
          <form
            id='api-key-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6'
          >
            <FieldGroup>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Name')}{' '}
                      <span aria-hidden className='text-destructive'>
                        *
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        maxLength={50}
                        required
                        placeholder={t('Enter a name')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isUpdate && (
                <FormField
                  control={form.control}
                  name='category'
                  render={({ field }) => (
                    <FieldSet>
                      <FieldLegend variant='label'>{t('Category')}</FieldLegend>
                      <ApiKeyCategorySelect
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FieldSet>
                  )}
                />
              )}

              {!isUpdate && (
                <FormItem>
                  <FormLabel>{t('Vendor')}</FormLabel>
                  <ApiKeyVendorCards
                    options={vendorOptions}
                    value={selectedVendor}
                    onValueChange={handleVendorChange}
                    isLoading={pricingPending}
                  />
                </FormItem>
              )}

              <FormField
                control={form.control}
                name='group'
                render={({ field, fieldState }) =>
                  isUpdate ? (
                    <FormItem>
                      <FormLabel>{t('Group')}</FormLabel>
                      <FormControl>
                        <ApiKeyGroupCombobox
                          options={groups}
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder={t('Select a group')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  ) : (
                    <FormItem>
                      <FieldSet
                        data-invalid={fieldState.invalid}
                        className='gap-0'
                      >
                        <FieldLegend variant='label'>
                          {t('Group')}{' '}
                          <span aria-hidden className='text-destructive'>
                            *
                          </span>
                        </FieldLegend>
                        <ApiKeyGroupCards
                          options={visibleGroups}
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value)
                            if (value) {
                              const selectedOption = groups.find(
                                (group) => group.value === value
                              )
                              if (selectedOption) {
                                form.setValue('name', selectedOption.label, {
                                  shouldValidate: true,
                                })
                              }
                            }
                          }}
                          isLoading={groupsPending}
                        />
                      </FieldSet>
                      <FormMessage />
                    </FormItem>
                  )
                }
              />

              {selectedGroup === 'auto' && (isUpdate || hasSelectedGroup) && (
                <FormField
                  control={form.control}
                  name='cross_group_retry'
                  render={({ field }) => (
                    <FormItem className='flex min-h-16 flex-row items-center justify-between gap-3 rounded-lg border px-3 py-2.5 sm:min-h-20 sm:gap-4 sm:px-4 sm:py-3'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-sm'>
                          {t('Cross-group retry')}
                        </FormLabel>
                        <FormDescription className='line-clamp-2 text-xs sm:line-clamp-none'>
                          {t(
                            'When enabled, if channels in the current group fail, it will try channels in the next group in order.'
                          )}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
            </FieldGroup>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <section className='bg-card rounded-lg border'>
                <CollapsibleTrigger
                  render={
                    <button
                      type='button'
                      className='hover:bg-muted/50 flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors sm:gap-3 sm:px-4 sm:py-3'
                    />
                  }
                >
                  <div className='bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg border sm:size-10'>
                    <Settings2 className='size-4 sm:size-5' />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <h3 className='text-sm leading-none font-medium'>
                      {t('Advanced Settings')}
                    </h3>
                    <p className='text-muted-foreground mt-1 text-xs'>
                      {t(
                        'Expiration, quantity, quota, and access restrictions'
                      )}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      'text-muted-foreground size-4 shrink-0 transition-transform',
                      advancedOpen && 'rotate-180'
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <FieldGroup className='border-t p-3 sm:p-4'>
                    <FormField
                      control={form.control}
                      name='expired_time'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Expiration Time')}</FormLabel>
                          <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
                            <FormControl>
                              <DateTimePicker
                                value={field.value}
                                onChange={field.onChange}
                                placeholder={t('Never expires')}
                                className='min-w-0 [&_input[type=time]]:w-24 sm:[&_input[type=time]]:w-32'
                              />
                            </FormControl>
                            <div className='grid grid-cols-4 gap-2 sm:flex'>
                              <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                className='px-2 text-xs sm:px-3 sm:text-sm'
                                onClick={() => handleSetExpiry(0, 0, 0)}
                              >
                                {t('Never')}
                              </Button>
                              <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                className='px-2 text-xs sm:px-3 sm:text-sm'
                                onClick={() => handleSetExpiry(1, 0, 0)}
                              >
                                {t('1 Month')}
                              </Button>
                              <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                className='px-2 text-xs sm:px-3 sm:text-sm'
                                onClick={() => handleSetExpiry(0, 1, 0)}
                              >
                                {t('1 Day')}
                              </Button>
                              <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                className='px-2 text-xs sm:px-3 sm:text-sm'
                                onClick={() => handleSetExpiry(0, 0, 1)}
                              >
                                {t('1 Hour')}
                              </Button>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {!isUpdate && (
                      <FormField
                        control={form.control}
                        name='tokenCount'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('Quantity')}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type='number'
                                min='1'
                                placeholder={t('Number of keys to create')}
                                onChange={(e) =>
                                  field.onChange(
                                    parseInt(e.target.value, 10) || 1
                                  )
                                }
                              />
                            </FormControl>
                            <FormDescription>
                              {t(
                                'Create multiple API keys at once (random suffix will be added to names)'
                              )}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    {!unlimitedQuota && (
                      <FormField
                        control={form.control}
                        name='remain_quota_dollars'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{quotaLabel}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type='number'
                                step={tokensOnly ? 1 : 0.01}
                                placeholder={quotaPlaceholder}
                                onChange={(e) =>
                                  field.onChange(
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                              />
                            </FormControl>
                            <FormDescription>
                              {tokensOnly
                                ? t('Enter the quota amount in tokens')
                                : t('Enter the quota amount in {{currency}}', {
                                    currency: currencyLabel,
                                  })}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name='unlimited_quota'
                      render={({ field }) => (
                        <FormItem className='flex min-h-16 flex-row items-center justify-between gap-3 rounded-lg border px-3 py-2.5 sm:min-h-20 sm:gap-4 sm:px-4 sm:py-3'>
                          <div className='space-y-0.5'>
                            <FormLabel className='text-sm'>
                              {t('Unlimited Quota')}
                            </FormLabel>
                            <FormDescription className='text-xs'>
                              {t('Enable unlimited quota for this API key')}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <ApiKeyGroupModelsPanel group={selectedGroup} />
                    <FormField
                      control={form.control}
                      name='model_limits'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Model Limits')}</FormLabel>
                          <FormControl>
                            <MultiSelect
                              options={models.map((m) => ({
                                label: m,
                                value: m,
                              }))}
                              selected={field.value}
                              onChange={field.onChange}
                              placeholder={t(
                                'Select models (empty for allow all)'
                              )}
                            />
                          </FormControl>
                          <FormDescription>
                            {t('Limit which models can be used with this key')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='allow_ips'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('IP Whitelist (supports CIDR)')}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              className='min-h-20 resize-none'
                              placeholder={t(
                                'One IP per line (empty for no restriction)'
                              )}
                              rows={3}
                            />
                          </FormControl>
                          <FormDescription>
                            {t(
                              'Do not over-trust this feature. IP may be spoofed. Please use with nginx, CDN and other gateways.'
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FieldGroup>
                </CollapsibleContent>
              </section>
            </Collapsible>
          </form>
        </Form>
        <footer className='bg-background grid shrink-0 grid-cols-2 gap-2 border-t px-3 py-3 sm:flex sm:flex-row sm:justify-end sm:px-5 sm:py-4'>
          <DialogClose
            render={<Button variant='outline' className='w-full sm:w-auto' />}
          >
            {t('Cancel')}
          </DialogClose>
          <Button
            form='api-key-form'
            type='submit'
            disabled={isSubmitting || (!isUpdate && !hasSelectedGroup)}
            className='w-full sm:w-auto'
          >
            {isSubmitting && t('Saving...')}
            {!isSubmitting && (isUpdate ? t('Save changes') : t('Create'))}
          </Button>
        </footer>
      </Content>
    </Dialog>
  )
}
