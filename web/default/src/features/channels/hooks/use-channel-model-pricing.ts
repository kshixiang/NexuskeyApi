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
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useSystemOptions } from '@/features/system-settings/hooks/use-system-options'
import { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'
import {
  emptyModelPricingSnapshot,
  loadModelPricingData,
  mergeModelPricingData,
  modelHasPricing,
  snapshotFromOptionRecords,
  type ModelPricingOptionsSnapshot,
} from '@/features/system-settings/models/model-pricing-persist'
import type { ModelRatioData } from '@/features/system-settings/models/model-pricing-sheet'

function getErrorMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: string }).message)
  }
  return undefined
}

export function useChannelModelPricing() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const updateOption = useUpdateOption()
  const { data: systemOptions } = useSystemOptions()

  const [pricingSnapshot, setPricingSnapshot] =
    useState<ModelPricingOptionsSnapshot>(emptyModelPricingSnapshot())
  const [pricingOpen, setPricingOpen] = useState(false)
  const [pricingModel, setPricingModel] = useState<ModelRatioData | null>(null)

  useEffect(() => {
    if (systemOptions?.data) {
      setPricingSnapshot(snapshotFromOptionRecords(systemOptions.data))
    }
  }, [systemOptions?.data])

  const effectiveSnapshot = useMemo(() => {
    if (systemOptions?.data) {
      return snapshotFromOptionRecords(systemOptions.data, pricingSnapshot)
    }
    return pricingSnapshot
  }, [pricingSnapshot, systemOptions?.data])

  const openModelPricing = useCallback(
    (modelName: string) => {
      setPricingModel(loadModelPricingData(modelName, effectiveSnapshot))
      setPricingOpen(true)
    },
    [effectiveSnapshot]
  )

  const hasModelPricing = useCallback(
    (modelName: string) => modelHasPricing(modelName, effectiveSnapshot),
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
        setPricingSnapshot(nextSnapshot)
        await queryClient.invalidateQueries({ queryKey: ['system-options'] })
        toast.success(t('Setting updated successfully'))
        setPricingOpen(false)
      } catch (error: unknown) {
        toast.error(getErrorMessage(error) || t('Failed to update setting'))
      }
    },
    [effectiveSnapshot, queryClient, t, updateOption]
  )

  return {
    pricingOpen,
    setPricingOpen,
    pricingModel,
    openModelPricing,
    hasModelPricing,
    handlePricingSave,
    effectiveSnapshot,
  }
}
