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
import { useTranslation } from 'react-i18next'
import { getLobeIcon } from '@/lib/lobe-icon'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FILTER_ALL } from '../constants'
import type { PricingModel, PricingVendor } from '../types'

interface PricingVendorTabsProps {
  models: PricingModel[]
  vendors: PricingVendor[]
  value: string
  onChange: (value: string) => void
}

export function PricingVendorTabs(props: PricingVendorTabsProps) {
  const { t } = useTranslation()
  const vendors = useMemo(() => {
    const names = new Set(props.models.map((model) => model.vendor_name))
    return props.vendors.filter((vendor) => names.has(vendor.name))
  }, [props.models, props.vendors])

  return (
    <Tabs
      value={props.value}
      onValueChange={(value) => props.onChange(String(value))}
      className='min-w-0'
    >
      <div className='overflow-x-auto border-b pb-1.5'>
        <TabsList
          variant='line'
          aria-label={t('All Vendors')}
          className='h-10 gap-3'
        >
          <TabsTrigger value={FILTER_ALL} className='px-3'>
            {t('All Vendors')}
          </TabsTrigger>
          {vendors.map((vendor) => (
            <TabsTrigger key={vendor.id} value={vendor.name} className='px-3'>
              {vendor.icon && (
                <span
                  aria-hidden
                  className='flex size-4 items-center justify-center'
                >
                  {getLobeIcon(vendor.icon, 16)}
                </span>
              )}
              {vendor.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  )
}
