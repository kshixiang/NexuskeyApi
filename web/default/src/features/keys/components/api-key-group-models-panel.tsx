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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import type { PricingModel } from '@/features/pricing/types'
import {
  getModelPriceLines,
  getModelsForGroup,
  getModelTooltipLines,
  shouldShowGroupModelsPanel,
  type GroupModelPricingContext,
} from '../lib/group-model-pricing'

const TOOLTIP_DELAY_MS = 1000

type ApiKeyGroupModelsPanelProps = {
  group: string | undefined
}

type GroupModelChipProps = {
  model: PricingModel
  pricingContext: GroupModelPricingContext
}

function GroupModelPriceDetails(props: GroupModelChipProps) {
  const { t } = useTranslation()
  const lines = getModelPriceLines(props.model, props.pricingContext, t, {
    includeSecondary: true,
  })

  if (lines.length === 0) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t('Model Price Not Configured')}
      </p>
    )
  }

  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{props.model.model_name}</p>
      <div className='space-y-1.5'>
        {lines.map((line) => (
          <div
            key={`${line.label}-${line.value}`}
            className='flex items-baseline justify-between gap-3'
          >
            <span className='text-muted-foreground text-xs'>{line.label}</span>
            <span className='text-foreground font-mono text-xs tabular-nums'>
              {line.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GroupModelChip(props: GroupModelChipProps) {
  const { t } = useTranslation()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const tooltipLines = getModelTooltipLines(
    props.model,
    props.pricingContext,
    t
  )

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type='button'
                  className={cn(
                    'bg-muted/50 hover:bg-muted inline-flex max-w-full items-center rounded-md border px-2 py-1 text-left text-xs transition-colors',
                    popoverOpen && 'ring-ring ring-2'
                  )}
                  aria-label={t('View model pricing')}
                >
                  <span className='truncate font-medium'>
                    {props.model.model_name}
                  </span>
                </button>
              }
            />
          }
        />
        <TooltipContent
          side='top'
          className='max-w-xs text-left whitespace-pre-line'
        >
          <span className='block font-medium'>{props.model.model_name}</span>
          {tooltipLines.map((line) => (
            <span key={line} className='block'>
              {line}
            </span>
          ))}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align='start'
        className='w-[min(100vw-2rem,20rem)] p-3 sm:w-80'
        side='bottom'
      >
        <GroupModelPriceDetails
          model={props.model}
          pricingContext={props.pricingContext}
        />
      </PopoverContent>
    </Popover>
  )
}

export function ApiKeyGroupModelsPanel(props: ApiKeyGroupModelsPanelProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const { models, groupRatio, isLoading, error, priceRate, usdExchangeRate } =
    usePricingData()

  const pricingContext = useMemo<GroupModelPricingContext | null>(() => {
    if (!shouldShowGroupModelsPanel(props.group)) return null
    return {
      group: props.group!,
      priceRate,
      usdExchangeRate,
      showRechargePrice: false,
      groupRatio,
    }
  }, [props.group, priceRate, usdExchangeRate, groupRatio])

  const groupModels = useMemo(() => {
    if (!pricingContext) return []
    return getModelsForGroup(models, pricingContext.group, searchQuery)
  }, [models, pricingContext, searchQuery])

  if (!pricingContext) {
    return null
  }

  return (
    <div className='space-y-2 rounded-lg border border-dashed px-3 py-2.5 sm:px-4 sm:py-3'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <Label className='text-sm font-normal'>
          {t('Models in this group')}
          {!isLoading && !error ? (
            <span className='text-muted-foreground ml-1.5 text-xs'>
              ({groupModels.length})
            </span>
          ) : null}
        </Label>
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t('Search models...')}
          className='h-8 sm:max-w-[220px]'
          disabled={isLoading || Boolean(error)}
        />
      </div>

      {isLoading ? (
        <div className='flex flex-wrap gap-2'>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className='h-7 w-24 rounded-md' />
          ))}
        </div>
      ) : error ? (
        <p className='text-destructive text-xs'>
          {t('Failed to load pricing data')}
        </p>
      ) : groupModels.length === 0 ? (
        <p className='text-muted-foreground text-xs'>
          {t('No models available for this group')}
        </p>
      ) : (
        <TooltipProvider delay={TOOLTIP_DELAY_MS}>
          <div className='max-h-40 overflow-y-auto overscroll-contain'>
            <div className='flex flex-wrap gap-1.5 pr-1'>
              {groupModels.map((model) => (
                <GroupModelChip
                  key={model.model_name}
                  model={model}
                  pricingContext={pricingContext}
                />
              ))}
            </div>
          </div>
        </TooltipProvider>
      )}

      {groupModels.length > 0 && (
        <p className='text-muted-foreground text-[11px]'>
          {t('Hover for a quick price summary. Click for full pricing details.')}
        </p>
      )}
    </div>
  )
}
