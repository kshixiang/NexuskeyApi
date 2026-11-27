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
import { useMemo } from 'react'
import { Check, Layers3, Shuffle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getLobeIcon } from '@/lib/lobe-icon'
import { resolveModelProvider, type ModelProvider } from '@/lib/model-provider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import type { PricingVendor } from '@/features/pricing/types'
import {
  GroupRatioBadge,
  type ApiKeyGroupOption,
} from './api-key-group-combobox'

type ApiKeyGroupCardsProps = {
  options: ApiKeyGroupOption[]
  value?: string
  onValueChange: (value: string) => void
  isLoading: boolean
}

const MAX_VISIBLE_PROVIDERS = 3

type ApiKeyVendorCardsProps = {
  options: PricingVendor[]
  value?: string
  onValueChange: (value: string) => void
  isLoading: boolean
}

export function ApiKeyVendorCards({
  options,
  value,
  onValueChange,
  isLoading,
}: ApiKeyVendorCardsProps) {
  const { t } = useTranslation()

  if (options.length === 0) {
    return isLoading ? (
      <p role='status' className='text-muted-foreground text-sm'>
        {t('Loading...')}
      </p>
    ) : null
  }

  return (
    <div className='overflow-x-auto p-1'>
      <ToggleGroup
        aria-label={t('Vendor')}
        value={value ? [value] : []}
        onValueChange={([nextValue]) => onValueChange(nextValue ?? '')}
        variant='outline'
        spacing={2}
        className='grid w-full grid-cols-2 items-stretch gap-2 sm:grid-cols-4'
      >
        {options.map((vendor) => (
          <ToggleGroupItem
            key={vendor.id}
            value={vendor.name}
            className='aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-foreground relative h-auto min-h-24 min-w-0 flex-col gap-2 rounded-xl p-2.5 text-center whitespace-normal sm:p-3'
          >
            <Check
              aria-hidden
              className='text-primary absolute top-2 right-2 size-4 opacity-0 group-aria-pressed/toggle:opacity-100'
            />
            <span className='bg-muted group-aria-pressed/toggle:bg-primary/15 group-aria-pressed/toggle:text-primary flex size-10 items-center justify-center rounded-xl'>
              {vendor.icon ? (
                getLobeIcon(vendor.icon, 22)
              ) : (
                <Layers3 className='size-5' />
              )}
            </span>
            <span className='w-full font-medium [overflow-wrap:anywhere]'>
              {vendor.name}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

export function ApiKeyGroupCards({
  options,
  value,
  onValueChange,
  isLoading,
}: ApiKeyGroupCardsProps) {
  const { t } = useTranslation()
  const { models } = usePricingData()
  const providersByGroup = useMemo(() => {
    const groups = new Map<string, Map<string, ModelProvider>>()

    for (const model of models) {
      const vendorIcon = model.vendor_icon?.trim()
      const provider = vendorIcon
        ? {
            icon: vendorIcon,
            label: model.vendor_name || vendorIcon,
          }
        : resolveModelProvider(model.model_name)
      if (!provider) continue

      // Each brand can appear with different icon variants.
      const brand = provider.icon.split('.')[0]
      for (const group of model.enable_groups ?? []) {
        const providers = groups.get(group) ?? new Map<string, ModelProvider>()
        if (!providers.has(brand) || vendorIcon) {
          providers.set(brand, provider)
        }
        groups.set(group, providers)
      }
    }

    return groups
  }, [models])

  if (options.length === 0) {
    return (
      <p role='status' className='text-muted-foreground text-sm'>
        {isLoading ? t('Loading...') : t('No group found.')}
      </p>
    )
  }

  return (
    <div className='max-h-[min(22rem,42dvh)] overflow-y-auto p-1'>
      <ToggleGroup
        aria-label={t('Group')}
        value={value ? [value] : []}
        onValueChange={([nextValue]) => onValueChange(nextValue ?? '')}
        variant='outline'
        spacing={2}
        className='grid w-full grid-cols-2 items-stretch gap-2 sm:grid-cols-3'
      >
        {options.map((option) => {
          const isAutoGroup = option.value === 'auto'
          const providers = isAutoGroup
            ? []
            : Array.from(providersByGroup.get(option.value)?.values() ?? [])
          providers.sort((a, b) => a.label.localeCompare(b.label))
          const providerNames = providers
            .map((provider) => provider.label)
            .join(', ')
          const visibleProviders = providers.slice(0, MAX_VISIBLE_PROVIDERS)
          const hiddenProviderCount = providers.length - visibleProviders.length
          const FallbackIcon = isAutoGroup ? Shuffle : Layers3

          return (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              className='aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-foreground relative h-auto min-h-28 min-w-0 flex-col gap-1.5 rounded-xl p-2.5 text-center whitespace-normal sm:p-3'
            >
              <Check
                aria-hidden
                className='text-primary absolute top-2 right-2 size-4 opacity-0 group-aria-pressed/toggle:opacity-100'
              />
              <span
                role={providerNames ? 'img' : undefined}
                aria-label={providerNames || undefined}
                aria-hidden={!providerNames}
                title={providerNames || undefined}
                className='bg-muted group-aria-pressed/toggle:bg-primary/15 group-aria-pressed/toggle:text-primary flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-xl px-2'
              >
                {visibleProviders.length > 0 ? (
                  <>
                    {visibleProviders.map((provider) => (
                      <span key={provider.icon} className='flex shrink-0'>
                        {getLobeIcon(provider.icon, 16)}
                      </span>
                    ))}
                    {hiddenProviderCount > 0 && (
                      <span className='text-muted-foreground text-xs'>
                        +{hiddenProviderCount}
                      </span>
                    )}
                  </>
                ) : (
                  <FallbackIcon className='size-5' />
                )}
              </span>
              <span className='w-full font-medium [overflow-wrap:anywhere]'>
                {option.label}
              </span>
              {option.desc && option.desc !== option.label && (
                <span className='text-muted-foreground w-full text-xs [overflow-wrap:anywhere]'>
                  {option.desc}
                </span>
              )}
              {!isAutoGroup && <GroupRatioBadge ratio={option.ratio} />}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
    </div>
  )
}
