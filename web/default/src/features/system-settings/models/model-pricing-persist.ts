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
import { combineBillingExpr, splitBillingExprAndRequestRules } from '@/features/pricing/lib/billing-expr'
import type { UpdateOptionRequest } from '../types'
import { safeJsonParse } from '../utils/json-parser'
import { normalizeJsonString } from './utils'
import type { ModelRatioData } from './model-pricing-sheet'

export type ModelPricingOptionsSnapshot = {
  ModelPrice: string
  ModelRatio: string
  CacheRatio: string
  CreateCacheRatio: string
  CompletionRatio: string
  ImageRatio: string
  AudioRatio: string
  AudioCompletionRatio: string
  'billing_setting.billing_mode': string
  'billing_setting.billing_expr': string
}

const PRICING_OPTION_KEYS: Array<keyof ModelPricingOptionsSnapshot> = [
  'ModelPrice',
  'ModelRatio',
  'CacheRatio',
  'CreateCacheRatio',
  'CompletionRatio',
  'ImageRatio',
  'AudioRatio',
  'AudioCompletionRatio',
  'billing_setting.billing_mode',
  'billing_setting.billing_expr',
]

export function emptyModelPricingSnapshot(): ModelPricingOptionsSnapshot {
  return {
    ModelPrice: '{}',
    ModelRatio: '{}',
    CacheRatio: '{}',
    CreateCacheRatio: '{}',
    CompletionRatio: '{}',
    ImageRatio: '{}',
    AudioRatio: '{}',
    AudioCompletionRatio: '{}',
    'billing_setting.billing_mode': '{}',
    'billing_setting.billing_expr': '{}',
  }
}

export function snapshotFromOptionRecords(
  options: Array<{ key: string; value: string }> | undefined,
  fallback: ModelPricingOptionsSnapshot = emptyModelPricingSnapshot()
): ModelPricingOptionsSnapshot {
  const snapshot = { ...fallback }
  if (!options) return snapshot
  for (const option of options) {
    if (option.key in snapshot) {
      snapshot[option.key as keyof ModelPricingOptionsSnapshot] = option.value
    }
  }
  return snapshot
}

function parseMaps(snapshot: ModelPricingOptionsSnapshot) {
  return {
    priceMap: safeJsonParse<Record<string, number>>(snapshot.ModelPrice, {
      fallback: {},
      silent: true,
    }),
    ratioMap: safeJsonParse<Record<string, number>>(snapshot.ModelRatio, {
      fallback: {},
      silent: true,
    }),
    cacheMap: safeJsonParse<Record<string, number>>(snapshot.CacheRatio, {
      fallback: {},
      silent: true,
    }),
    createCacheMap: safeJsonParse<Record<string, number>>(
      snapshot.CreateCacheRatio,
      { fallback: {}, silent: true }
    ),
    completionMap: safeJsonParse<Record<string, number>>(
      snapshot.CompletionRatio,
      { fallback: {}, silent: true }
    ),
    imageMap: safeJsonParse<Record<string, number>>(snapshot.ImageRatio, {
      fallback: {},
      silent: true,
    }),
    audioMap: safeJsonParse<Record<string, number>>(snapshot.AudioRatio, {
      fallback: {},
      silent: true,
    }),
    audioCompletionMap: safeJsonParse<Record<string, number>>(
      snapshot.AudioCompletionRatio,
      { fallback: {}, silent: true }
    ),
    billingModeMap: safeJsonParse<Record<string, string>>(
      snapshot['billing_setting.billing_mode'],
      { fallback: {}, silent: true }
    ),
    billingExprMap: safeJsonParse<Record<string, string>>(
      snapshot['billing_setting.billing_expr'],
      { fallback: {}, silent: true }
    ),
  }
}

export function modelHasPricing(
  modelName: string,
  snapshot: ModelPricingOptionsSnapshot
): boolean {
  const maps = parseMaps(snapshot)
  return Boolean(
    maps.priceMap[modelName] !== undefined ||
      maps.ratioMap[modelName] !== undefined ||
      maps.billingModeMap[modelName]
  )
}

export function loadModelPricingData(
  modelName: string,
  snapshot: ModelPricingOptionsSnapshot
): ModelRatioData {
  const maps = parseMaps(snapshot)
  const price = maps.priceMap[modelName]?.toString() || ''
  const ratio = maps.ratioMap[modelName]?.toString() || ''
  const modeForModel = maps.billingModeMap[modelName]

  if (modeForModel === 'tiered_expr') {
    const fullExpr = maps.billingExprMap[modelName] || ''
    const { billingExpr, requestRuleExpr } =
      splitBillingExprAndRequestRules(fullExpr)
    return {
      name: modelName,
      billingMode: 'tiered_expr',
      billingExpr,
      requestRuleExpr,
      price,
      ratio,
      cacheRatio: maps.cacheMap[modelName]?.toString() || '',
      createCacheRatio: maps.createCacheMap[modelName]?.toString() || '',
      completionRatio: maps.completionMap[modelName]?.toString() || '',
      imageRatio: maps.imageMap[modelName]?.toString() || '',
      audioRatio: maps.audioMap[modelName]?.toString() || '',
      audioCompletionRatio:
        maps.audioCompletionMap[modelName]?.toString() || '',
    }
  }

  if (price !== '') {
    return {
      name: modelName,
      billingMode: 'per-request',
      price,
      ratio,
      cacheRatio: maps.cacheMap[modelName]?.toString() || '',
      createCacheRatio: maps.createCacheMap[modelName]?.toString() || '',
      completionRatio: maps.completionMap[modelName]?.toString() || '',
      imageRatio: maps.imageMap[modelName]?.toString() || '',
      audioRatio: maps.audioMap[modelName]?.toString() || '',
      audioCompletionRatio:
        maps.audioCompletionMap[modelName]?.toString() || '',
    }
  }

  return {
    name: modelName,
    billingMode: 'per-token',
    ratio,
    cacheRatio: maps.cacheMap[modelName]?.toString() || '',
    createCacheRatio: maps.createCacheMap[modelName]?.toString() || '',
    completionRatio: maps.completionMap[modelName]?.toString() || '',
    imageRatio: maps.imageMap[modelName]?.toString() || '',
    audioRatio: maps.audioMap[modelName]?.toString() || '',
    audioCompletionRatio: maps.audioCompletionMap[modelName]?.toString() || '',
  }
}

export function mergeModelPricingData(
  snapshot: ModelPricingOptionsSnapshot,
  data: ModelRatioData,
  targetNames: string[] = [data.name]
): { snapshot: ModelPricingOptionsSnapshot; updates: UpdateOptionRequest[] } {
  const maps = parseMaps(snapshot)

  const setIfPresent = (
    target: Record<string, number>,
    name: string,
    value: string | undefined
  ) => {
    if (!value || value === '') return
    const parsed = parseFloat(value)
    if (Number.isFinite(parsed)) target[name] = parsed
  }

  targetNames.forEach((name) => {
    delete maps.priceMap[name]
    delete maps.ratioMap[name]
    delete maps.cacheMap[name]
    delete maps.createCacheMap[name]
    delete maps.completionMap[name]
    delete maps.imageMap[name]
    delete maps.audioMap[name]
    delete maps.audioCompletionMap[name]
    delete maps.billingModeMap[name]
    delete maps.billingExprMap[name]

    if (data.billingMode === 'tiered_expr') {
      const combined = combineBillingExpr(
        data.billingExpr || '',
        data.requestRuleExpr || ''
      )
      if (combined) {
        maps.billingModeMap[name] = 'tiered_expr'
        maps.billingExprMap[name] = combined
      }
      setIfPresent(maps.priceMap, name, data.price)
      setIfPresent(maps.ratioMap, name, data.ratio)
      setIfPresent(maps.cacheMap, name, data.cacheRatio)
      setIfPresent(maps.createCacheMap, name, data.createCacheRatio)
      setIfPresent(maps.completionMap, name, data.completionRatio)
      setIfPresent(maps.imageMap, name, data.imageRatio)
      setIfPresent(maps.audioMap, name, data.audioRatio)
      setIfPresent(maps.audioCompletionMap, name, data.audioCompletionRatio)
    } else if (data.price && data.price !== '') {
      setIfPresent(maps.priceMap, name, data.price)
    } else {
      setIfPresent(maps.ratioMap, name, data.ratio)
      setIfPresent(maps.cacheMap, name, data.cacheRatio)
      setIfPresent(maps.createCacheMap, name, data.createCacheRatio)
      setIfPresent(maps.completionMap, name, data.completionRatio)
      setIfPresent(maps.imageMap, name, data.imageRatio)
      setIfPresent(maps.audioMap, name, data.audioRatio)
      setIfPresent(maps.audioCompletionMap, name, data.audioCompletionRatio)
    }
  })

  const nextSnapshot: ModelPricingOptionsSnapshot = {
    ModelPrice: JSON.stringify(maps.priceMap, null, 2),
    ModelRatio: JSON.stringify(maps.ratioMap, null, 2),
    CacheRatio: JSON.stringify(maps.cacheMap, null, 2),
    CreateCacheRatio: JSON.stringify(maps.createCacheMap, null, 2),
    CompletionRatio: JSON.stringify(maps.completionMap, null, 2),
    ImageRatio: JSON.stringify(maps.imageMap, null, 2),
    AudioRatio: JSON.stringify(maps.audioMap, null, 2),
    AudioCompletionRatio: JSON.stringify(maps.audioCompletionMap, null, 2),
    'billing_setting.billing_mode': JSON.stringify(maps.billingModeMap, null, 2),
    'billing_setting.billing_expr': JSON.stringify(maps.billingExprMap, null, 2),
  }

  const updates: UpdateOptionRequest[] = []
  for (const key of PRICING_OPTION_KEYS) {
    const prev = normalizeJsonString(snapshot[key])
    const next = normalizeJsonString(nextSnapshot[key])
    if (prev !== next) {
      updates.push({ key, value: nextSnapshot[key] })
    }
  }

  return { snapshot: nextSnapshot, updates }
}
