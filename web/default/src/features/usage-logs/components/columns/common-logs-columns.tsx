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
import { Fragment, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import {
  CircleAlert,
  Clipboard,
  Info,
  Sparkles,
  KeyRound,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import {
  formatBillingCurrencyFromUSD,
  getCurrencyDisplay,
} from '@/lib/currency'
import {
  formatTokens,
  formatLogQuota,
  formatTimestampToDate,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTableColumnHeader } from '@/components/data-table'
import { StatusBadge, type StatusBadgeProps } from '@/components/status-badge'
import type { UsageLog } from '../../data/schema'
import {
  formatModelName,
  getTieredBillingSummary,
  hasAnyCacheTokens,
  parseLogOther,
  isViolationFeeLog,
} from '../../lib/format'
import {
  isDisplayableLogType,
  isTimingLogType,
  getLogTypeConfig,
  isPerCallBilling,
} from '../../lib/utils'
import type { LogOtherData } from '../../types'
import { DetailsDialog } from '../dialogs/details-dialog'
import { ModelBadge } from '../model-badge'
import { useUsageLogsContext } from '../usage-logs-provider'

interface DetailSegment {
  text: string
  muted?: boolean
  danger?: boolean
}

function formatRatioCompact(ratio: number | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return '-'
  return ratio % 1 === 0
    ? String(ratio)
    : ratio.toFixed(4).replace(/\.?0+$/, '')
}

function getGroupRatioText(other: LogOtherData | null): string | null {
  const userGroupRatio = other?.user_group_ratio
  if (
    userGroupRatio != null &&
    userGroupRatio !== -1 &&
    Number.isFinite(userGroupRatio)
  ) {
    return `${formatRatioCompact(userGroupRatio)}x`
  }

  const groupRatio = other?.group_ratio
  if (groupRatio != null && groupRatio !== 1 && Number.isFinite(groupRatio)) {
    return `${formatRatioCompact(groupRatio)}x`
  }

  return null
}

interface TooltipRow {
  label: string
  value: string
  divider?: boolean
  tone?: 'highlight' | 'accent' | 'muted'
}

const AMOUNT_FORMAT_OPTS = {
  digitsLarge: 4,
  digitsSmall: 8,
  abbreviate: false,
}
const UNIT_PRICE_FORMAT_OPTS = {
  digitsLarge: 4,
  digitsSmall: 6,
  abbreviate: false,
}

function toNonNegative(value: number | undefined | null): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0
}

function getUsageTokens(log: UsageLog, other: LogOtherData | null) {
  const input = toNonNegative(log.prompt_tokens)
  const output = toNonNegative(log.completion_tokens)
  const cacheRead = toNonNegative(other?.cache_tokens)
  const cacheWrite5m = toNonNegative(other?.cache_creation_tokens_5m)
  const cacheWrite1h = toNonNegative(other?.cache_creation_tokens_1h)
  const hasSplitCache = cacheWrite5m > 0 || cacheWrite1h > 0
  const cacheWrite = hasSplitCache
    ? cacheWrite5m + cacheWrite1h
    : toNonNegative(other?.cache_creation_tokens)

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
  }
}

function getEffectiveRatio(other: LogOtherData | null): number | null {
  const userRatio = other?.user_group_ratio
  if (
    typeof userRatio === 'number' &&
    Number.isFinite(userRatio) &&
    userRatio >= 0
  ) {
    return userRatio
  }
  const ratio = other?.group_ratio
  if (typeof ratio === 'number' && Number.isFinite(ratio)) return ratio
  return null
}

function getServiceTierLabel(
  other: LogOtherData | null,
  t: (key: string) => string
): string {
  if (other?.billing_mode === 'tiered_expr') {
    const summary = getTieredBillingSummary(other)
    if (summary?.tier.label) return summary.tier.label
    if (other.matched_tier) return other.matched_tier
  }
  return t('Standard')
}

function buildCostDetailRows(
  log: UsageLog,
  other: LogOtherData | null,
  t: (key: string, opts?: Record<string, unknown>) => string
): TooltipRow[] {
  const rows: TooltipRow[] = []
  const tokens = getUsageTokens(log, other)
  const ratio = getEffectiveRatio(other)
  const ratioText =
    ratio != null && Number.isFinite(ratio)
      ? `${formatRatioCompact(ratio)}x`
      : '-'
  const chargedUSD =
    (log.quota || 0) / getCurrencyDisplay().config.quotaPerUnit
  let originalUSD: number | null = null

  const hasModelRatio =
    other?.model_ratio != null &&
    Number.isFinite(other.model_ratio) &&
    other.billing_mode !== 'tiered_expr' &&
    !isPerCallBilling(other.model_price)

  if (hasModelRatio && other) {
    const inputPrice = other.model_ratio! * 2.0
    const outputPrice =
      other.completion_ratio != null && Number.isFinite(other.completion_ratio)
        ? inputPrice * other.completion_ratio
        : inputPrice
    const cacheReadPrice =
      other.cache_ratio != null && Number.isFinite(other.cache_ratio)
        ? inputPrice * other.cache_ratio
        : inputPrice

    // Claude's prompt_tokens already excludes cache tokens; for other
    // providers they are part of prompt_tokens and billed at cache rates.
    const cacheInInput =
      other.claude === true ? 0 : tokens.cacheRead + tokens.cacheWrite
    const billableInput = Math.max(0, tokens.input - cacheInInput)
    const inputCost = (billableInput / 1_000_000) * inputPrice
    const outputCost = (tokens.output / 1_000_000) * outputPrice
    const cacheReadCost = (tokens.cacheRead / 1_000_000) * cacheReadPrice
    const cacheWriteCost =
      (tokens.cacheWrite / 1_000_000) *
      inputPrice *
      toNonNegative(other.cache_creation_ratio ?? 1)
    originalUSD =
      inputCost + outputCost + cacheReadCost + cacheWriteCost

    if (billableInput > 0) {
      rows.push({
        label: t('Input Cost'),
        value: formatBillingCurrencyFromUSD(inputCost, AMOUNT_FORMAT_OPTS),
      })
    }
    if (tokens.output > 0) {
      rows.push({
        label: t('Output Cost'),
        value: formatBillingCurrencyFromUSD(outputCost, AMOUNT_FORMAT_OPTS),
      })
    }
    rows.push({
      label: t('Input Unit Price'),
      value: `${formatBillingCurrencyFromUSD(inputPrice, UNIT_PRICE_FORMAT_OPTS)} / 1M Token`,
    })
    rows.push({
      label: t('Output Unit Price'),
      value: `${formatBillingCurrencyFromUSD(outputPrice, UNIT_PRICE_FORMAT_OPTS)} / 1M Token`,
    })
    if (tokens.cacheRead > 0) {
      rows.push({
        label: t('Cache Read Cost'),
        value: formatBillingCurrencyFromUSD(cacheReadCost, AMOUNT_FORMAT_OPTS),
      })
    }
  }

  if (ratio != null && ratio > 0 && chargedUSD > 0) {
    originalUSD = chargedUSD / ratio
  }

  rows.push({
    label: t('Service Tier'),
    value: getServiceTierLabel(other, t),
    divider: true,
  })
  rows.push({ label: t('Ratio'), value: ratioText })

  rows.push({
    label: t('Original Cost'),
    value:
      originalUSD != null
        ? formatBillingCurrencyFromUSD(originalUSD, AMOUNT_FORMAT_OPTS)
        : formatBillingCurrencyFromUSD(chargedUSD, AMOUNT_FORMAT_OPTS),
    divider: true,
  })
  rows.push({
    label: t('User Charge'),
    value: formatBillingCurrencyFromUSD(chargedUSD, AMOUNT_FORMAT_OPTS),
    tone: 'highlight',
  })

  return rows
}

function DetailTooltipList({
  title,
  rows,
}: {
  title: string
  rows: TooltipRow[]
}) {
  return (
    <div className='flex w-60 flex-col gap-1.5'>
      <p className='text-sm font-semibold'>{title}</p>
      {rows.map((row, index) => (
        <Fragment key={`${row.label}-${index}`}>
          {row.divider && (
            <div className='bg-background/20 my-0.5 h-px shrink-0' />
          )}
          <div className='flex items-center justify-between gap-3'>
            <span className='text-background/70 shrink-0'>{row.label}</span>
            <span
              className={cn(
                'font-mono text-xs tabular-nums',
                row.tone === 'highlight' && 'text-emerald-300',
                row.tone === 'accent' && 'text-sky-300',
                row.tone === 'muted' && 'text-background/50'
              )}
            >
              {row.value}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  )
}

function buildDetailSegments(
  log: UsageLog,
  other: LogOtherData | null,
  t: (key: string, opts?: Record<string, unknown>) => string
): DetailSegment[] {
  if (log.type === 6) {
    return [{ text: t('Async task refund') }]
  }

  if (log.type !== 2) return []

  const isViolation = isViolationFeeLog(other)
  if (isViolation) {
    const segments: DetailSegment[] = []
    segments.push({ text: t('Violation Fee'), danger: true })
    if (other?.violation_fee_code) {
      segments.push({
        text: other.violation_fee_code,
        muted: true,
      })
    }
    segments.push({
      text: `${t('Fee')}: ${formatLogQuota(other?.fee_quota ?? log.quota)}`,
      muted: true,
    })
    return segments
  }

  if (!other) return []

  const segments: DetailSegment[] = []

  const priceOpts = { digitsLarge: 4, digitsSmall: 6, abbreviate: false }
  const formatPrice = (price: number) =>
    `${formatBillingCurrencyFromUSD(price, priceOpts)}/M`
  const formatPriceCompact = (price: number) =>
    formatBillingCurrencyFromUSD(price, priceOpts)
  const formatPriceList = (prices: string[], showUnit: boolean) => {
    const text = prices.join(' / ')
    return showUnit ? `${text}/M` : text
  }
  const isTieredExpr = other.billing_mode === 'tiered_expr'
  const tieredSummary = getTieredBillingSummary(other)
  if (isTieredExpr) {
    if (tieredSummary) {
      const baseEntries = tieredSummary.priceEntries
        .filter((entry) => ['inputPrice', 'outputPrice'].includes(entry.field))
        .map((entry) => formatPriceCompact(entry.price))
      if (baseEntries.length > 0) {
        const tierLabel = tieredSummary.tier.label || t('Default')
        segments.push({
          text: `${tierLabel} · ${formatPriceList(baseEntries, true)}`,
        })
      }

      const cacheEntries = tieredSummary.priceEntries
        .filter((entry) =>
          ['cacheReadPrice', 'cacheCreatePrice', 'cacheCreate1hPrice'].includes(
            entry.field
          )
        )
        .map((entry) => {
          return formatPriceCompact(entry.price)
        })
      if (cacheEntries.length > 0) {
        segments.push({
          text: `${t('Cache')} ${formatPriceList(cacheEntries, false)}`,
          muted: true,
        })
      }

      const otherEntries = tieredSummary.priceEntries
        .filter(
          (entry) =>
            ![
              'inputPrice',
              'outputPrice',
              'cacheReadPrice',
              'cacheCreatePrice',
              'cacheCreate1hPrice',
            ].includes(entry.field)
        )
        .map((entry) => `${t(entry.shortLabel)} ${formatPrice(entry.price)}`)
      if (otherEntries.length > 0) {
        segments.push({
          text: otherEntries.join(' · '),
          muted: true,
        })
      }
    } else {
      segments.push({
        text: `${t('Dynamic Pricing')} · ${t('No matching results')}`,
        muted: true,
      })
    }
  } else {
    const isPerCall = isPerCallBilling(other.model_price)
    if (isPerCall) {
      segments.push({
        text: `${t('Per-call')} · ${formatBillingCurrencyFromUSD(other.model_price!, priceOpts)}`,
      })
    } else if (other.model_ratio != null) {
      const inputPriceUSD = other.model_ratio * 2.0
      const baseEntries = [formatPriceCompact(inputPriceUSD)]
      if (other.completion_ratio != null) {
        baseEntries.push(
          formatPriceCompact(inputPriceUSD * other.completion_ratio)
        )
      }
      segments.push({
        text: `${t('Standard')} · ${formatPriceList(baseEntries, true)}`,
      })

      if (hasAnyCacheTokens(other)) {
        const cacheEntries = [
          other.cache_ratio != null && other.cache_ratio !== 1
            ? formatPriceCompact(inputPriceUSD * other.cache_ratio)
            : null,
          other.cache_creation_ratio != null && other.cache_creation_ratio !== 1
            ? formatPriceCompact(inputPriceUSD * other.cache_creation_ratio)
            : null,
          other.cache_creation_ratio_1h != null &&
          other.cache_creation_ratio_1h !== 0
            ? formatPriceCompact(inputPriceUSD * other.cache_creation_ratio_1h)
            : null,
        ].filter(Boolean) as string[]

        if (cacheEntries.length > 0) {
          segments.push({
            text: `${t('Cache')} ${formatPriceList(cacheEntries, false)}`,
            muted: true,
          })
        }
      }
    } else {
      const userGroupRatio = other.user_group_ratio
      const groupRatio = other.group_ratio
      const isUserGroup =
        userGroupRatio != null &&
        Number.isFinite(userGroupRatio) &&
        userGroupRatio !== -1
      const effectiveRatio = isUserGroup ? userGroupRatio : groupRatio
      const ratioLabel = isUserGroup
        ? t('User Exclusive Ratio')
        : t('Group Ratio')

      if (effectiveRatio != null && Number.isFinite(effectiveRatio)) {
        segments.push({
          text: `${ratioLabel} ${formatRatioCompact(effectiveRatio)}x`,
        })
      }
    }
  }

  if (other.is_system_prompt_overwritten) {
    segments.push({
      text: t('System Prompt Override'),
      danger: true,
    })
  }

  return segments
}

export function useCommonLogsColumns(isAdmin: boolean): ColumnDef<UsageLog>[] {
  const { t } = useTranslation()
  const columns: ColumnDef<UsageLog>[] = [
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Time')} />
      ),
      cell: ({ row }) => {
        const log = row.original
        const timestamp = row.getValue('created_at') as number
        const config = getLogTypeConfig(log.type)

        return (
          <div className='flex flex-col gap-0.5'>
            <span className='font-mono text-xs tabular-nums'>
              {formatTimestampToDate(timestamp)}
            </span>
            <StatusBadge
              label={t(config.label)}
              variant={config.color as StatusBadgeProps['variant']}
              size='sm'
              copyable={false}
            />
          </div>
        )
      },
      filterFn: (row, _id, value) => {
        if (!value || value.length === 0) return true
        return value.includes(String(row.original.type))
      },
      enableHiding: false,
      meta: { label: t('Time') },
    },
  ]

  if (isAdmin) {
    columns.push(
      {
        id: 'channel',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Channel')} />
        ),
        cell: function ChannelCell({ row }) {
          const { sensitiveVisible, setAffinityTarget, setAffinityDialogOpen } =
            useUsageLogsContext()
          const log = row.original

          if (!isDisplayableLogType(log.type)) return null

          const other = parseLogOther(log.other)
          const affinity = other?.admin_info?.channel_affinity
          const useChannel = other?.admin_info?.use_channel
          const channelChain =
            useChannel && useChannel.length > 0
              ? useChannel.join(' → ')
              : undefined
          const channelDisplay = log.channel_name
            ? `${log.channel_name} #${log.channel}`
            : `#${log.channel}`
          const channelIdDisplay = `#${log.channel}`
          const channelName = sensitiveVisible ? log.channel_name : '••••'

          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div className='flex max-w-[160px] flex-col gap-0.5' />
                  }
                >
                  <div className='relative inline-flex w-fit'>
                    <StatusBadge
                      label={channelIdDisplay}
                      autoColor={String(log.channel)}
                      copyText={String(log.channel)}
                      size='sm'
                      className='font-mono'
                    />
                    {affinity && (
                      <button
                        type='button'
                        className='absolute -top-1 -right-1 leading-none text-amber-500'
                        onClick={(e) => {
                          e.stopPropagation()
                          setAffinityTarget({
                            rule_name: affinity.rule_name || '',
                            using_group:
                              affinity.using_group ||
                              affinity.selected_group ||
                              '',
                            key_hint: affinity.key_hint || '',
                            key_fp: affinity.key_fp || '',
                          })
                          setAffinityDialogOpen(true)
                        }}
                      >
                        <Sparkles className='size-3 fill-current' />
                      </button>
                    )}
                  </div>
                  {log.channel_name && (
                    <span className='text-muted-foreground/70 truncate text-[11px]'>
                      {channelName}
                    </span>
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  <div className='space-y-1'>
                    <p>
                      {sensitiveVisible ? channelDisplay : channelIdDisplay}
                    </p>
                    {channelChain && (
                      <p className='text-muted-foreground text-xs'>
                        {t('Chain')}: {channelChain}
                      </p>
                    )}
                    {affinity && (
                      <div className='border-t pt-1 text-xs'>
                        <p className='font-medium'>{t('Channel Affinity')}</p>
                        <p>
                          {t('Rule')}: {affinity.rule_name || '-'}
                        </p>
                        <p>
                          {t('Group')}:{' '}
                          {sensitiveVisible
                            ? affinity.using_group ||
                              affinity.selected_group ||
                              '-'
                            : '••••'}
                        </p>
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
        meta: { label: t('Channel'), mobileHidden: true },
      },
      {
        id: 'user',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('User')} />
        ),
        cell: function UserCell({ row }) {
          const { sensitiveVisible, setSelectedUserId, setUserInfoDialogOpen } =
            useUsageLogsContext()
          const log = row.original

          if (!log.username) return null

          return (
            <button
              type='button'
              className='flex items-center gap-1.5 text-left'
              onClick={(e) => {
                e.stopPropagation()
                setSelectedUserId(log.user_id)
                setUserInfoDialogOpen(true)
              }}
            >
              <Avatar className='ring-border/60 size-6 ring-1'>
                <AvatarFallback
                  className={cn(
                    'text-[11px] font-semibold',
                    !sensitiveVisible && 'bg-muted text-muted-foreground'
                  )}
                  style={
                    sensitiveVisible
                      ? getUserAvatarStyle(log.username)
                      : undefined
                  }
                >
                  {sensitiveVisible ? getUserAvatarFallback(log.username) : '•'}
                </AvatarFallback>
              </Avatar>
              <span className='text-muted-foreground truncate text-sm hover:underline'>
                {sensitiveVisible ? log.username : '••••'}
              </span>
            </button>
          )
        },
        meta: { label: t('User'), mobileHidden: true },
      }
    )
  }

  columns.push({
    accessorKey: 'token_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('Token')} />
    ),
    cell: function TokenNameCell({ row }) {
      const { sensitiveVisible } = useUsageLogsContext()
      const log = row.original
      if (!isDisplayableLogType(log.type)) return null

      const tokenName = log.token_name
      if (!tokenName) return null

      const other = parseLogOther(log.other)
      const displayName = sensitiveVisible ? tokenName : '••••'
      let group = log.group
      if (!group) group = other?.group || ''

      const metaParts: string[] = []
      const groupRatioText = getGroupRatioText(other)
      if (group) {
        metaParts.push(sensitiveVisible ? group : '••••')
      }
      if (groupRatioText) metaParts.push(groupRatioText)

      return (
        <div className='flex max-w-[150px] flex-col gap-0.5'>
          <StatusBadge
            label={displayName}
            icon={KeyRound}
            copyText={sensitiveVisible ? tokenName : undefined}
            size='sm'
            showDot={false}
            className='border-border/60 bg-muted/30 text-foreground max-w-full overflow-hidden rounded-md border px-1.5 py-0.5 font-mono'
          />
          {metaParts.length > 0 && (
            <span className='text-muted-foreground/60 truncate text-[11px]'>
              {metaParts.join(' · ')}
            </span>
          )}
        </div>
      )
    },
    meta: { label: t('Token') },
    size: 130,
  })

  columns.push(
    {
      accessorKey: 'model_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Model')} />
      ),
      cell: function ModelCell({ row }) {
        const log = row.original
        if (!isDisplayableLogType(log.type)) return null

        const modelInfo = formatModelName(log)

        return (
          <div className='flex max-w-[220px] flex-col gap-0.5'>
            <ModelBadge
              modelName={modelInfo.name}
              actualModel={modelInfo.actualModel}
            />
          </div>
        )
      },
      meta: { label: t('Model'), mobileTitle: true },
    },

    {
      accessorKey: 'use_time',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Timing')} />
      ),
      cell: ({ row }) => {
        const log = row.original
        if (!isTimingLogType(log.type)) return null

        const useTime = row.getValue('use_time') as number
        const other = parseLogOther(log.other)
        const frt = other?.frt
        const frtSeconds =
          frt != null && Number.isFinite(frt) && frt > 0 ? frt / 1000 : null
        const tokensPerSecond =
          useTime > 0 && log.completion_tokens > 0
            ? log.completion_tokens / useTime
            : null
        const frtPortion =
          frtSeconds != null && useTime > 0
            ? Math.min(100, Math.max(0, (frtSeconds / useTime) * 100))
            : 0
        const formatSeconds = (seconds: number) => `${seconds.toFixed(2)}s`
        const streamError =
          log.is_stream &&
          other?.stream_status &&
          other.stream_status.status !== 'ok'

        return (
          <div className='flex items-center gap-2'>
            <div className='flex h-9 w-1 shrink-0 flex-col overflow-hidden rounded-full bg-emerald-400/80'>
              {frtSeconds != null && (
                <div
                  className='w-full shrink-0 bg-amber-400/90'
                  style={{ height: `${frtPortion}%` }}
                />
              )}
            </div>
            <div className='flex min-w-0 flex-col gap-0.5'>
              {frtSeconds != null && (
                <div className='flex items-center gap-1.5 text-xs'>
                  <span className='text-muted-foreground/70 w-12 shrink-0'>
                    {t('First Token Latency')}
                  </span>
                  <span className='font-mono text-amber-600 tabular-nums font-medium dark:text-amber-400'>
                    {formatSeconds(frtSeconds)}
                  </span>
                </div>
              )}
              <div className='flex items-center gap-1.5 text-xs'>
                <span className='text-muted-foreground/70 w-12 shrink-0'>
                  {t('Total Duration')}
                </span>
                <span className='font-mono text-emerald-600 tabular-nums font-medium dark:text-emerald-400'>
                  {formatSeconds(useTime)}
                </span>
              </div>
              <div className='flex items-center gap-1.5 text-xs'>
                <span className='text-muted-foreground/70 w-12 shrink-0'>
                  {t('Output Speed')}
                </span>
                <span className='font-mono text-violet-600 tabular-nums font-medium dark:text-violet-400'>
                  {tokensPerSecond != null
                    ? `${tokensPerSecond.toFixed(1)} t/s`
                    : '-'}
                </span>
                {streamError && other?.stream_status && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={<CircleAlert className='size-3 text-red-500' />}
                      ></TooltipTrigger>
                      <TooltipContent>
                        <div className='space-y-0.5 text-xs'>
                          <p>
                            {t('Stream Status')}: {t('Error')}
                          </p>
                          <p>{other.stream_status.end_reason || 'unknown'}</p>
                          {(other.stream_status.error_count ?? 0) > 0 && (
                            <p>
                              {t('Soft Errors')}:{' '}
                              {other.stream_status.error_count}
                            </p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </div>
        )
      },
      meta: { label: t('Timing'), mobileHidden: true },
    },

    {
      accessorKey: 'prompt_tokens',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Token' />
      ),
      cell: ({ row }) => {
        const log = row.original
        if (!isDisplayableLogType(log.type)) return null

        const other = parseLogOther(log.other)
        const tokens = getUsageTokens(log, other)
        if (tokens.input === 0 && tokens.output === 0) {
          return <span className='text-muted-foreground text-xs'>-</span>
        }

        const detailRows: TooltipRow[] = [
          {
            label: t('Input Tokens'),
            value: tokens.input.toLocaleString(),
          },
          {
            label: t('Output Tokens'),
            value: tokens.output.toLocaleString(),
          },
          {
            label: t('Cache Read Tokens'),
            value: tokens.cacheRead.toLocaleString(),
          },
        ]
        if (tokens.cacheWrite > 0) {
          detailRows.push({
            label: t('Cache Write'),
            value: tokens.cacheWrite.toLocaleString(),
          })
        }
        detailRows.push({
          label: t('Total Token Count'),
          value: tokens.total.toLocaleString(),
          divider: true,
        })

        return (
          <div className='flex flex-col gap-0.5'>
            <div className='flex items-center gap-1.5'>
              <span className='font-mono text-xs font-medium tabular-nums'>
                <span className='text-emerald-600 dark:text-emerald-400'>
                  ↓ {tokens.input.toLocaleString()}
                </span>
                {' '}
                <span className='text-sky-600 dark:text-sky-400'>
                  ↑ {tokens.output.toLocaleString()}
                </span>
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className='text-muted-foreground/50 hover:text-foreground inline-flex cursor-help items-center leading-none' />
                    }
                  >
                    <Info className='size-3' aria-hidden='true' />
                  </TooltipTrigger>
                  <TooltipContent className='rounded-lg px-3 py-2.5'>
                    <DetailTooltipList
                      title={t('Token Breakdown')}
                      rows={detailRows}
                    />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {tokens.cacheRead > 0 && (
              <div className='text-muted-foreground/60 flex items-center gap-1 text-[11px]'>
                <Clipboard className='size-3' aria-hidden='true' />
                <span className='text-sky-600/80 font-mono tabular-nums dark:text-sky-400/80'>
                  {formatTokens(tokens.cacheRead)}
                </span>
              </div>
            )}
          </div>
        )
      },
      meta: { label: 'Token', mobileHidden: true },
    },

    {
      accessorKey: 'quota',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Cost')} />
      ),
      cell: ({ row }) => {
        const log = row.original
        if (!isDisplayableLogType(log.type)) return null

        const quota = row.getValue('quota') as number
        const other = parseLogOther(log.other)
        const isSubscription = other?.billing_source === 'subscription'

        if (isSubscription) {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className='inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' />
                  }
                >
                  <span
                    className='size-1.5 rounded-full bg-emerald-500'
                    aria-hidden='true'
                  />
                  {t('Subscription')}
                </TooltipTrigger>
                <TooltipContent>
                  <span>
                    {t('Deducted by subscription')}: {formatLogQuota(quota)}
                  </span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        }

        const chargedUSD =
          quota / getCurrencyDisplay().config.quotaPerUnit
        const costRows = buildCostDetailRows(log, other, t)

        return (
          <div className='flex items-center gap-1.5'>
            <span className='font-mono text-emerald-600 text-xs font-semibold tabular-nums dark:text-emerald-400'>
              {formatBillingCurrencyFromUSD(chargedUSD, AMOUNT_FORMAT_OPTS)}
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className='text-muted-foreground/50 hover:text-foreground inline-flex cursor-help items-center leading-none' />
                  }
                >
                  <Info className='size-3' aria-hidden='true' />
                </TooltipTrigger>
                <TooltipContent className='rounded-lg px-3 py-2.5'>
                  <DetailTooltipList
                    title={t('Cost Details')}
                    rows={costRows}
                  />
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )
      },
      meta: { label: t('Cost') },
    },

    {
      accessorKey: 'content',
      header: t('Details'),
      cell: function DetailsCell({ row }) {
        const [dialogOpen, setDialogOpen] = useState(false)
        const log = row.original
        const other = parseLogOther(log.other)

        const segments = buildDetailSegments(log, other, t)
        const primary = segments[0]
        const hasMore = segments.length > 1

        return (
          <>
            <button
              type='button'
              className='group flex max-w-[200px] items-center gap-1 text-left text-xs'
              onClick={() => setDialogOpen(true)}
              title={t('Click to view full details')}
            >
              {primary ? (
                <span
                  className={cn(
                    'truncate leading-snug group-hover:underline',
                    primary.muted
                      ? 'text-muted-foreground/60'
                      : primary.danger
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-foreground'
                  )}
                >
                  {primary.text}
                  {hasMore && (
                    <span className='text-muted-foreground/40 ml-0.5'>
                      +{segments.length - 1}
                    </span>
                  )}
                </span>
              ) : log.content ? (
                <span className='text-muted-foreground truncate group-hover:underline'>
                  {log.content}
                </span>
              ) : (
                <span className='text-muted-foreground/40'>—</span>
              )}
            </button>
            <DetailsDialog
              log={log}
              isAdmin={isAdmin}
              open={dialogOpen}
              onOpenChange={setDialogOpen}
            />
          </>
        )
      },
      meta: { label: t('Details') },
      size: 180,
      maxSize: 200,
    }
  )

  return columns
}
