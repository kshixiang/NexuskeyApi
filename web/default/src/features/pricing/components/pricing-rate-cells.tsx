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
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { TableCell } from '@/components/ui/table'
import {
  formatDynamicUnitPrice,
  getDynamicPricingSummary,
  getDynamicPriceEntries,
} from '../lib/dynamic-price'
import { formatTokenCount } from '../lib/model-metadata'
import { formatPrice, formatRequestPrice } from '../lib/price'
import type { PricingModel, TokenUnit } from '../types'

interface PricingRateCellsProps {
  model: PricingModel
  group: string
  tokenUnit: TokenUnit
  priceRate: number
  usdExchangeRate: number
  showRechargePrice: boolean
  base?: boolean
}

export function PricingRateCells(props: PricingRateCellsProps) {
  const { t } = useTranslation()
  const ratio = props.base ? 1 : (props.model.group_ratio?.[props.group] ?? 1)
  const model: PricingModel = {
    ...props.model,
    enable_groups: [props.group],
    group_ratio: { [props.group]: ratio },
  }
  const options = {
    tokenUnit: props.tokenUnit,
    showRechargePrice: !props.base && props.showRechargePrice,
    priceRate: props.priceRate,
    usdExchangeRate: props.usdExchangeRate,
    groupRatioMultiplier: ratio,
  }
  const summary = getDynamicPricingSummary(model, options)
  const cellClass = cn(
    'px-3 py-3 align-middle font-mono text-xs tabular-nums',
    props.base ? 'text-muted-foreground' : 'bg-primary/5 font-medium'
  )

  if (summary?.isSpecialExpression) {
    return (
      <TableCell colSpan={3} className={cellClass}>
        <span className='font-sans'>{t('Special billing expression')}</span>
      </TableCell>
    )
  }

  if (summary) {
    const tiers = summary.tiers.map((tier) => ({
      source: tier,
      cacheEntries: getDynamicPriceEntries(tier, options).filter(
        (entry) => entry.variable.group === 'cache'
      ),
      displayLabel:
        tier.conditions.length > 0
          ? tier.conditions
              .map((condition) => {
                const label = condition.var === 'c' ? t('Output') : t('Input')
                return `${label} ${condition.op} ${formatTokenCount(condition.value)}`
              })
              .join(' · ')
          : tier.label,
    }))
    return (
      <>
        {['inputPrice', 'outputPrice', 'cache'].map((field) => (
          <TableCell key={field} className={cellClass}>
            <div className='flex flex-col gap-1.5'>
              {tiers.map((tier, index) => (
                <div key={index} className='flex items-baseline gap-2'>
                  {summary.tierCount > 1 && (
                    <span
                      className='text-muted-foreground font-sans text-[10px]'
                      title={tier.source.label}
                    >
                      {tier.displayLabel}
                    </span>
                  )}
                  {field === 'cache' ? (
                    <div className='flex flex-wrap gap-x-2 gap-y-0.5'>
                      {tier.cacheEntries.map((entry) => (
                        <span key={entry.key}>
                          <span className='text-muted-foreground mr-2 font-sans text-[10px]'>
                            {t(entry.shortLabel)}
                          </span>
                          {entry.formatted}
                        </span>
                      ))}
                      {tier.cacheEntries.length === 0 && '—'}
                    </div>
                  ) : (
                    <span>
                      {formatDynamicUnitPrice(
                        Number(tier.source[field]),
                        options
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </TableCell>
        ))}
      </>
    )
  }

  if (model.quota_type === 1) {
    return (
      <TableCell colSpan={3} className={cellClass}>
        {formatRequestPrice(
          model,
          options.showRechargePrice,
          props.priceRate,
          props.usdExchangeRate
        )}
        <span className='text-muted-foreground ml-1 font-sans'>
          / {t('request')}
        </span>
      </TableCell>
    )
  }

  return (
    <>
      {(['input', 'output'] as const).map((type) => (
        <TableCell key={type} className={cellClass}>
          {formatPrice(
            model,
            type,
            props.tokenUnit,
            options.showRechargePrice,
            props.priceRate,
            props.usdExchangeRate
          )}
        </TableCell>
      ))}
      <TableCell className={cellClass}>
        <div className='flex flex-wrap gap-x-2 gap-y-0.5'>
          {(
            [
              {
                type: 'create_cache',
                ratio: model.create_cache_ratio,
                label: t('Cache Write'),
              },
              {
                type: 'cache',
                ratio: model.cache_ratio,
                label: t('Cache Read'),
              },
            ] as const
          ).map((cache) => (
            <Fragment key={cache.type}>
              {cache.ratio != null && (
                <span>
                  <span className='text-muted-foreground mr-2 font-sans text-[10px]'>
                    {cache.label}
                  </span>
                  {formatPrice(
                    model,
                    cache.type,
                    props.tokenUnit,
                    options.showRechargePrice,
                    props.priceRate,
                    props.usdExchangeRate
                  )}
                </span>
              )}
            </Fragment>
          ))}
          {model.cache_ratio == null && model.create_cache_ratio == null && '—'}
        </div>
      </TableCell>
    </>
  )
}
