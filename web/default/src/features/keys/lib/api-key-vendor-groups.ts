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
import { resolveModelProvider } from '@/lib/model-provider'
import type { PricingModel, PricingVendor } from '@/features/pricing/types'

type ModelVendor = Pick<PricingVendor, 'name' | 'icon'>

export type ApiKeyVendorOption = {
  value: string
  label: string
  icon?: string
  groups: Set<string>
}

function getModelVendor(
  model: PricingModel,
  vendors: PricingVendor[]
): ModelVendor | undefined {
  if (model.vendor_name) {
    return { name: model.vendor_name, icon: model.vendor_icon }
  }

  const provider = resolveModelProvider(model.model_name)
  if (!provider) return undefined

  const name = provider.label === 'Claude' ? 'Anthropic' : provider.label
  const iconBrand = provider.icon.split('.')[0]
  return (
    vendors.find((vendor) => vendor.name === name) ??
    vendors.find((vendor) => vendor.icon?.split('.')[0] === iconBrand) ?? {
      name,
      icon: provider.icon,
    }
  )
}

export function getApiKeyVendorOptions(
  groups: string[],
  models: PricingModel[],
  vendors: PricingVendor[],
  otherLabel: string
): ApiKeyVendorOption[] {
  // A null entry marks a group with models from multiple vendors.
  const vendorByGroup = new Map<string, ModelVendor | null>()

  for (const model of models) {
    const vendor = getModelVendor(model, vendors)
    if (!vendor) continue

    const enabledGroups = model.enable_groups ?? []
    const modelGroups = enabledGroups.includes('all') ? groups : enabledGroups
    for (const group of modelGroups) {
      const current = vendorByGroup.get(group)
      if (current === undefined) {
        vendorByGroup.set(group, vendor)
      } else if (current && current.name !== vendor.name) {
        vendorByGroup.set(group, null)
      }
    }
  }

  const options = new Map<string, ApiKeyVendorOption>()
  const other: ApiKeyVendorOption = {
    value: 'other',
    label: otherLabel,
    groups: new Set(),
  }

  for (const group of groups) {
    if (group === 'auto') continue

    const vendor = vendorByGroup.get(group)
    if (!vendor) {
      other.groups.add(group)
      continue
    }

    const option = options.get(vendor.name) ?? {
      value: `vendor:${vendor.name}`,
      label: vendor.name,
      icon: vendor.icon,
      groups: new Set<string>(),
    }
    option.groups.add(group)
    options.set(vendor.name, option)
  }

  const vendorOptions = Array.from(options.values())
  if (other.groups.size > 0) vendorOptions.push(other)
  return vendorOptions
}
