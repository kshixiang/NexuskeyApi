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
import type { TFunction } from 'i18next'
import {
  DEFAULT_TOKEN_UNIT,
  QUOTA_TYPE_VALUES,
} from '@/features/pricing/constants'
import {
  getDynamicPricingSummary,
  isDynamicPricingModel,
} from '@/features/pricing/lib/dynamic-price'
import { filterByGroup, filterBySearch } from '@/features/pricing/lib/filters'
import { isTokenBasedModel } from '@/features/pricing/lib/model-helpers'
import {
  formatFixedPrice,
  formatGroupPrice,
} from '@/features/pricing/lib/price'
import type { PriceType, PricingModel, TokenUnit } from '@/features/pricing/types'

export type GroupModelPricingContext = {
  group: string
  tokenUnit?: TokenUnit
  priceRate?: number
  usdExchangeRate?: number
  showRechargePrice?: boolean
  groupRatio?: Record<string, number>
}

export type ModelPriceLine = {
  label: string
  value: string
}

const SECONDARY_PRICE_TYPES: PriceType[] = [
  'cache',
  'create_cache',
  'image',
  'audio_input',
  'audio_output',
]

const SECONDARY_PRICE_LABELS: Record<PriceType, string> = {
  input: 'Input',
  output: 'Output',
  cache: 'Cached input',
  create_cache: 'Cache write',
  image: 'Image input',
  audio_input: 'Audio input',
  audio_output: 'Audio output',
}

function getGroupRatioMultiplier(
  group: string,
  groupRatio: Record<string, number>
): number {
  return groupRatio[group] ?? 1
}

function formatTokenPrice(
  model: PricingModel,
  group: string,
  type: PriceType,
  ctx: GroupModelPricingContext
): string {
  const tokenUnit = ctx.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const groupRatio = ctx.groupRatio ?? model.group_ratio ?? {}
  return formatGroupPrice(
    model,
    group,
    type,
    tokenUnit,
    ctx.showRechargePrice ?? false,
    ctx.priceRate ?? 1,
    ctx.usdExchangeRate ?? 1,
    groupRatio
  )
}

function isSecondaryPriceAvailable(
  model: PricingModel,
  type: PriceType
): boolean {
  switch (type) {
    case 'cache':
      return model.cache_ratio != null
    case 'create_cache':
      return model.create_cache_ratio != null
    case 'image':
      return model.image_ratio != null
    case 'audio_input':
      return model.audio_ratio != null
    case 'audio_output':
      return (
        model.audio_ratio != null && model.audio_completion_ratio != null
      )
    default:
      return false
  }
}

export function shouldShowGroupModelsPanel(group: string | undefined): boolean {
  return Boolean(group && group !== 'auto')
}

export function getModelsForGroup(
  models: PricingModel[],
  group: string,
  searchQuery = ''
): PricingModel[] {
  const filtered = filterByGroup(models, group)
  const searched = searchQuery
    ? filterBySearch(filtered, searchQuery)
    : filtered
  return [...searched].sort((a, b) =>
    (a.model_name || '').localeCompare(b.model_name || '')
  )
}

export function getModelPriceLines(
  model: PricingModel,
  ctx: GroupModelPricingContext,
  t: TFunction,
  options?: { includeSecondary?: boolean }
): ModelPriceLine[] {
  const includeSecondary = options?.includeSecondary ?? false
  const tokenUnit = ctx.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'
  const groupRatio = ctx.groupRatio ?? model.group_ratio ?? {}
  const ratioMultiplier = getGroupRatioMultiplier(ctx.group, groupRatio)

  if (isDynamicPricingModel(model)) {
    const summary = getDynamicPricingSummary(model, {
      tokenUnit,
      showRechargePrice: ctx.showRechargePrice,
      priceRate: ctx.priceRate,
      usdExchangeRate: ctx.usdExchangeRate,
      groupRatioMultiplier: ratioMultiplier,
    })
    if (!summary) return []

    if (summary.isSpecialExpression) {
      return [{ label: t('Dynamic Pricing'), value: t('Special billing expression') }]
    }

    const entries = includeSecondary
      ? summary.entries
      : summary.primaryEntries.length > 0
        ? summary.primaryEntries
        : summary.entries.slice(0, 2)

    return entries.map((entry) => ({
      label: t(entry.shortLabel),
      value: `${entry.formatted} / ${tokenUnitLabel}`,
    }))
  }

  if (!isTokenBasedModel(model)) {
    if (model.quota_type !== QUOTA_TYPE_VALUES.REQUEST) {
      return []
    }
    return [
      {
        label: t('Per request'),
        value: formatFixedPrice(
          model,
          ctx.group,
          ctx.showRechargePrice ?? false,
          ctx.priceRate ?? 1,
          ctx.usdExchangeRate ?? 1,
          groupRatio
        ),
      },
    ]
  }

  const lines: ModelPriceLine[] = [
    {
      label: t('Input'),
      value: `${formatTokenPrice(model, ctx.group, 'input', ctx)} / ${tokenUnitLabel}`,
    },
    {
      label: t('Output'),
      value: `${formatTokenPrice(model, ctx.group, 'output', ctx)} / ${tokenUnitLabel}`,
    },
  ]

  if (includeSecondary) {
    for (const type of SECONDARY_PRICE_TYPES) {
      if (!isSecondaryPriceAvailable(model, type)) continue
      const formatted = formatTokenPrice(model, ctx.group, type, ctx)
      if (formatted === '-') continue
      lines.push({
        label: t(SECONDARY_PRICE_LABELS[type]),
        value: `${formatted} / ${tokenUnitLabel}`,
      })
    }
  }

  return lines
}

export function getModelTooltipLines(
  model: PricingModel,
  ctx: GroupModelPricingContext,
  t: TFunction
): string[] {
  const lines = getModelPriceLines(model, ctx, t, { includeSecondary: false })
  if (lines.length === 0) {
    return [t('Model Price Not Configured')]
  }
  return lines.map((line) => `${line.label}: ${line.value}`)
}
