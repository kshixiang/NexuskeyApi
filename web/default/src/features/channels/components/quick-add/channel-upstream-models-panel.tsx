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
import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DollarSign, Loader2, RefreshCw, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSystemOptions } from '@/features/system-settings/hooks/use-system-options'
import { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'
import {
  loadModelPricingData,
  mergeModelPricingData,
  modelHasPricing,
  snapshotFromOptionRecords,
  type ModelPricingOptionsSnapshot,
} from '@/features/system-settings/models/model-pricing-persist'
import { ModelPricingSheet, type ModelRatioData } from '@/features/system-settings/models/model-pricing-sheet'
import { fetchModels } from '../../api'
import { formatModels, parseModels } from '../../lib/channel-form'
import { parseModelsString } from '../../lib/model-mapping-validation'

type ChannelUpstreamModelsPanelProps = {
  channelType: number
  apiKey: string
  baseUrl: string
  models: string
  onModelsChange: (models: string) => void
  pricingSnapshot: ModelPricingOptionsSnapshot
  onPricingSnapshotChange: (snapshot: ModelPricingOptionsSnapshot) => void
}

function getErrorMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: string }).message)
  }
  return undefined
}

export function ChannelUpstreamModelsPanel({
  channelType,
  apiKey,
  baseUrl,
  models,
  onModelsChange,
  pricingSnapshot,
  onPricingSnapshotChange,
}: ChannelUpstreamModelsPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const updateOption = useUpdateOption()
  const { data: systemOptions } = useSystemOptions()

  const [fetchedModels, setFetchedModels] = useState<string[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [pricingOpen, setPricingOpen] = useState(false)
  const [pricingModel, setPricingModel] = useState<ModelRatioData | null>(null)

  const selectedSet = useMemo(() => new Set(parseModels(models)), [models])

  const effectiveSnapshot = useMemo(() => {
    if (systemOptions?.data) {
      return snapshotFromOptionRecords(systemOptions.data, pricingSnapshot)
    }
    return pricingSnapshot
  }, [pricingSnapshot, systemOptions?.data])

  const filteredModels = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase()
    if (!kw) return fetchedModels
    return fetchedModels.filter((m) => m.toLowerCase().includes(kw))
  }, [fetchedModels, searchKeyword])

  const handleFetch = useCallback(async () => {
    if (!apiKey.trim()) {
      toast.error(t('Please enter API key first'))
      return
    }
    setIsFetching(true)
    try {
      const response = await fetchModels({
        type: channelType,
        key: apiKey.trim(),
        base_url: baseUrl.trim(),
      })
      if (response.success && response.data?.length) {
        const unique = Array.from(
          new Set(
            response.data
              .map((m) => m.trim())
              .filter(Boolean)
          )
        )
        setFetchedModels(unique)
        const merged = Array.from(new Set([...selectedSet, ...unique]))
        onModelsChange(formatModels(merged))
        toast.success(
          t('Fetched {{count}} model(s) from upstream', { count: unique.length })
        )
      } else {
        toast.error(t('No models fetched from upstream'))
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || t('Failed to fetch models'))
    } finally {
      setIsFetching(false)
    }
  }, [apiKey, baseUrl, channelType, onModelsChange, selectedSet, t])

  const toggleModel = useCallback(
    (model: string, checked: boolean) => {
      const current = parseModels(models)
      const next = checked
        ? Array.from(new Set([...current, model]))
        : current.filter((m) => m !== model)
      onModelsChange(formatModels(next))
    },
    [models, onModelsChange]
  )

  const openPricing = useCallback(
    (modelName: string) => {
      setPricingModel(loadModelPricingData(modelName, effectiveSnapshot))
      setPricingOpen(true)
    },
    [effectiveSnapshot]
  )

  const handlePricingSave = useCallback(
    async (data: ModelRatioData) => {
      const { snapshot: nextSnapshot, updates } = mergeModelPricingData(
        effectiveSnapshot,
        data
      )
      if (updates.length === 0) {
        setPricingOpen(false)
        return
      }
      try {
        for (const update of updates) {
          await updateOption.mutateAsync(update)
        }
        onPricingSnapshotChange(nextSnapshot)
        await queryClient.invalidateQueries({ queryKey: ['system-options'] })
        toast.success(t('Setting updated successfully'))
        setPricingOpen(false)
      } catch (error: unknown) {
        toast.error(getErrorMessage(error) || t('Failed to update setting'))
      }
    },
    [effectiveSnapshot, onPricingSnapshotChange, queryClient, t, updateOption]
  )

  const unparsedCustom = useMemo(() => {
    const fetchedSet = new Set(fetchedModels)
    return parseModelsString(models).filter((m) => !fetchedSet.has(m))
  }, [fetchedModels, models])

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          disabled={isFetching}
          onClick={() => void handleFetch()}
        >
          {isFetching ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <RefreshCw className='h-4 w-4' />
          )}
          {t('Fetch from Upstream')}
        </Button>
        <div className='relative min-w-[12rem] flex-1'>
          <Search className='text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4' />
          <Input
            className='pl-8'
            placeholder={t('Search models...')}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
        </div>
      </div>

      {fetchedModels.length > 0 ? (
        <ScrollArea className='h-[220px] rounded-md border'>
          <div className='space-y-1 p-2'>
            {filteredModels.map((model) => {
              const priced = modelHasPricing(model, effectiveSnapshot)
              return (
                <div
                  key={model}
                  className='hover:bg-muted/50 flex items-center gap-2 rounded-md px-2 py-1.5'
                >
                  <Checkbox
                    checked={selectedSet.has(model)}
                    onCheckedChange={(checked) =>
                      toggleModel(model, checked === true)
                    }
                  />
                  <button
                    type='button'
                    className='min-w-0 flex-1 truncate text-left text-sm'
                    onClick={() => openPricing(model)}
                  >
                    {model}
                  </button>
                  <Badge variant={priced ? 'secondary' : 'outline'}>
                    {priced ? t('Priced') : t('Unset price')}
                  </Badge>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    onClick={() => openPricing(model)}
                    title={t('Set pricing')}
                  >
                    <DollarSign className='h-4 w-4' />
                  </Button>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      ) : (
        <p className='text-muted-foreground text-sm'>
          {t('Fetch models from upstream, then click a model to set pricing.')}
        </p>
      )}

      {unparsedCustom.length > 0 && (
        <div className='text-muted-foreground text-xs'>
          {t('Also selected')}: {unparsedCustom.join(', ')}
        </div>
      )}

      <div className='space-y-2'>
        <Label htmlFor='quick-add-models'>{t('Models *')}</Label>
        <Input
          id='quick-add-models'
          value={models}
          onChange={(e) => onModelsChange(e.target.value)}
          placeholder={t('gpt-4o,claude-3-5-sonnet')}
        />
      </div>

      <ModelPricingSheet
        open={pricingOpen}
        onOpenChange={setPricingOpen}
        editData={pricingModel}
        onSave={(data) => void handlePricingSave(data)}
        onCancel={() => setPricingOpen(false)}
      />
    </div>
  )
}
