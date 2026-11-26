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
import { useState } from 'react'
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type PaginationState,
} from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { getLobeIcon } from '@/lib/lobe-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TableEmpty } from '@/components/data-table'
import { DataTablePagination } from '@/components/data-table/pagination'
import {
  DEFAULT_PRICING_PAGE_SIZE,
  DEFAULT_TOKEN_UNIT,
  FILTER_ALL,
} from '../constants'
import { hasDynamicRequestRules } from '../lib/dynamic-price'
import { parseTags } from '../lib/filters'
import type { PricingModel, TokenUnit } from '../types'
import { LoadingSkeleton } from './loading-skeleton'
import { PricingRateCells } from './pricing-rate-cells'

const columns = [{ accessorKey: 'model_name' }]

export interface PricingTableProps {
  models: PricingModel[]
  isLoading?: boolean
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  onModelClick?: (modelName: string) => void
  groups?: string[]
  groupFilter?: string
  groupNames?: Record<string, string>
  groupRatios?: Record<string, number>
}

export function PricingTable(props: PricingTableProps) {
  const { t } = useTranslation()
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PRICING_PAGE_SIZE,
  })

  const table = useReactTable({
    data: props.models,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: false,
  })

  const sections = new Map<string, PricingModel[]>()
  const tokenUnit = props.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const unitLabel = tokenUnit === 'K' ? '/ 1K tokens' : '/ 1M tokens'

  for (const row of table.getRowModel().rows) {
    const model = row.original
    let groups = model.sale_group
      ? [model.sale_group]
      : (model.enable_groups ?? [])
    groups = groups.filter(
      (group) => !props.groups || props.groups.includes(group)
    )
    if (props.groupFilter && props.groupFilter !== FILTER_ALL) {
      groups = groups.filter((group) => group === props.groupFilter)
    }
    for (const group of groups.length > 0 ? groups : ['']) {
      const models = sections.get(group) ?? []
      models.push(model)
      sections.set(group, models)
    }
  }

  if (props.isLoading) return <LoadingSkeleton viewMode='table' />
  if (props.models.length === 0) {
    return (
      <Table>
        <TableBody>
          <TableEmpty
            colSpan={1}
            title={t('No Models Found')}
            description={t('No models match your current filters.')}
          />
        </TableBody>
      </Table>
    )
  }

  return (
    <div className='flex flex-col gap-5'>
      {Array.from(sections, ([group, models]) => {
        const firstModel = models[0]
        const groupName =
          props.groupNames?.[group] ?? firstModel.sale_group_name ?? group
        const multiplier =
          props.groupRatios?.[group] ?? firstModel.group_ratio?.[group]
        // Published sale expressions already contain their markup. The API
        // supplies no separate base price for these models.
        const showBasePrice = !firstModel.sale_group
        return (
          <section
            key={group}
            aria-label={groupName || t('All Models')}
            className='bg-card overflow-hidden rounded-xl border'
          >
            <div className='flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3'>
              <div className='flex min-w-0 flex-wrap items-center gap-2.5'>
                <span
                  aria-hidden
                  className='bg-primary h-5 w-1 shrink-0 rounded-full'
                />
                <h2 className='text-sm font-semibold'>
                  {groupName || t('All Models')}
                </h2>
                {multiplier != null && (
                  <Badge variant='secondary'>{multiplier}×</Badge>
                )}
              </div>
              <span className='text-muted-foreground text-xs'>{unitLabel}</span>
            </div>
            <Table className='min-w-[720px]'>
              <TableHeader className='bg-muted/35'>
                <TableRow>
                  <TableHead
                    rowSpan={2}
                    scope='col'
                    className='w-1/4 min-w-52 px-4'
                  >
                    {t('Model')}
                  </TableHead>
                  <TableHead
                    colSpan={3}
                    scope='colgroup'
                    className='bg-primary/5 border-x text-center'
                  >
                    {t('Group price')}
                  </TableHead>
                  {showBasePrice && (
                    <TableHead
                      colSpan={3}
                      scope='colgroup'
                      className='text-center'
                    >
                      {t('Base Price')}
                    </TableHead>
                  )}
                  <TableHead
                    rowSpan={2}
                    scope='col'
                    className='w-20 border-l px-3 text-center'
                  >
                    {t('Multiplier')}
                  </TableHead>
                </TableRow>
                <TableRow>
                  {['Input', 'Output', 'Cached'].map((label) => (
                    <TableHead
                      key={label}
                      scope='col'
                      className='bg-primary/5 h-8 px-3 text-xs'
                    >
                      {t(label)}
                    </TableHead>
                  ))}
                  {showBasePrice &&
                    ['Input', 'Output', 'Cached'].map((label) => (
                      <TableHead
                        key={label}
                        scope='col'
                        className='h-8 px-3 text-xs'
                      >
                        {t(label)}
                      </TableHead>
                    ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model) => (
                  <TableRow
                    key={model.key ?? model.model_name}
                    className='cursor-pointer'
                    onClick={() =>
                      props.onModelClick?.(model.key ?? model.model_name)
                    }
                  >
                    <TableCell className='max-w-xs px-4 py-3 align-top whitespace-normal'>
                      <div className='flex items-start gap-2.5'>
                        {model.vendor_icon && (
                          <span aria-hidden className='mt-0.5 shrink-0'>
                            {getLobeIcon(model.vendor_icon, 20)}
                          </span>
                        )}
                        <div className='flex min-w-0 flex-col gap-1.5'>
                          <Button
                            variant='link'
                            className='h-auto justify-start p-0 text-left whitespace-normal'
                            onClick={(event) => {
                              event.stopPropagation()
                              props.onModelClick?.(
                                model.key ?? model.model_name
                              )
                            }}
                          >
                            <span className='break-all'>
                              {model.model_name}
                            </span>
                          </Button>
                          {model.description && (
                            <p className='text-muted-foreground line-clamp-1 text-xs leading-relaxed'>
                              {model.description}
                            </p>
                          )}
                          <div className='flex flex-wrap items-center gap-1'>
                            {parseTags(model.tags)
                              .slice(0, 3)
                              .map((tag) => (
                                <Badge key={tag} variant='secondary'>
                                  {tag}
                                </Badge>
                              ))}
                            {hasDynamicRequestRules(model) && (
                              <Badge variant='outline'>
                                {t('Dynamic Pricing')}
                              </Badge>
                            )}
                            <Button
                              variant='link'
                              size='sm'
                              className='h-auto px-1 py-0'
                              onClick={(event) => {
                                event.stopPropagation()
                                props.onModelClick?.(
                                  model.key ?? model.model_name
                                )
                              }}
                            >
                              {t('Details')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <PricingRateCells
                      model={model}
                      group={group}
                      tokenUnit={tokenUnit}
                      priceRate={props.priceRate ?? 1}
                      usdExchangeRate={props.usdExchangeRate ?? 1}
                      showRechargePrice={props.showRechargePrice ?? false}
                    />
                    {showBasePrice && (
                      <PricingRateCells
                        base
                        model={model}
                        group={group}
                        tokenUnit={tokenUnit}
                        priceRate={props.priceRate ?? 1}
                        usdExchangeRate={props.usdExchangeRate ?? 1}
                        showRechargePrice={false}
                      />
                    )}
                    <TableCell className='border-l px-3 text-center align-middle font-mono text-xs tabular-nums'>
                      {multiplier == null ? '—' : `${multiplier}×`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )
      })}
      {props.models.length > 0 && <DataTablePagination table={table} />}
    </div>
  )
}
