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
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { ChannelStatusCard } from '../api'

interface ChannelStatusCardItemProps {
  card: ChannelStatusCard
}

function formatMs(ms: number): string {
  if (ms <= 0) {
    return '-'
  }
  if (ms < 1000) {
    return `${ms}ms`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function ChannelStatusCardItem(props: ChannelStatusCardItemProps) {
  const { card } = props
  const { t } = useTranslation()

  const availability = card.aggregated.availability
  const availabilityTone =
    availability >= 0.95
      ? 'text-emerald-600 dark:text-emerald-400'
      : availability >= 0.5
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400'

  const history = card.history ?? []

  return (
    <div className='bg-card text-card-foreground rounded-2xl border p-4 shadow-sm transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md'>
      <div className='mb-3 flex items-start justify-between gap-2'>
        <div className='min-w-0'>
          <p className='truncate text-sm font-semibold'>{card.channel_name}</p>
          {card.test_model ? (
            <p className='text-muted-foreground truncate text-xs'>
              {card.test_model}
            </p>
          ) : null}
        </div>
        <span className='text-muted-foreground shrink-0 text-xs'>
          {t('{{count}} tests', { count: card.aggregated.total_count })}
        </span>
      </div>

      <div className='mb-3 grid grid-cols-3 gap-2 text-center'>
        <div>
          <p className={cn('text-lg font-bold', availabilityTone)}>
            {formatPercent(availability)}
          </p>
          <p className='text-muted-foreground text-xs'>{t('Availability')}</p>
        </div>
        <div>
          <p className='text-foreground text-lg font-bold'>
            {card.aggregated.cache_rate > 0
              ? formatPercent(card.aggregated.cache_rate)
              : '-'}
          </p>
          <p className='text-muted-foreground text-xs'>{t('Cache Rate')}</p>
        </div>
        <div>
          <p className='text-foreground text-lg font-bold'>
            {card.aggregated.avg_first_token_ms > 0
              ? formatMs(card.aggregated.avg_first_token_ms)
              : formatMs(card.aggregated.avg_response_ms)}
          </p>
          <p className='text-muted-foreground text-xs'>{t('First Token')}</p>
        </div>
      </div>

      <div>
        <div className='mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide'>
          <span className='text-muted-foreground'>{t('Past')}</span>
          <span className='text-muted-foreground'>{t('Now')}</span>
        </div>
        <div className='flex h-10 items-end gap-0.5'>
          {history.length === 0 ? (
            <div className='bg-muted h-2 w-full rounded' />
          ) : (
            history.map((point, index) => {
              const maxMs = Math.max(
                ...history.map((h) => h.response_time_ms),
                1
              )
              const height = point.success
                ? Math.max(
                    (point.response_time_ms / maxMs) * 100,
                    15
                  )
                : 100
              return (
                <div
                  key={`${point.created_at}-${index}`}
                  className={cn(
                    'min-w-0 flex-1 rounded-sm',
                    point.success
                      ? 'bg-emerald-500/80'
                      : 'bg-red-500/80'
                  )}
                  style={{ height: `${height}%` }}
                  title={`${new Date(point.created_at * 1000).toLocaleString()} · ${formatMs(point.response_time_ms)}`}
                />
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
