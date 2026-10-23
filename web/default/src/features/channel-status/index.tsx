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
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { SectionPageLayout } from '@/components/layout'
import {
  CHANNEL_STATUS_WINDOW_CONFIG,
  CHANNEL_STATUS_WINDOWS,
} from './constants'
import { getChannelStatus } from './api'
import type { ChannelStatusWindowKey } from './api'
import { ChannelStatusCardItem } from './components/channel-status-card'

interface ChannelStatusPageProps {
  window: ChannelStatusWindowKey
  onWindowChange: (window: ChannelStatusWindowKey) => void
}

export function ChannelStatusPage(props: ChannelStatusPageProps) {
  const { t } = useTranslation()
  const currentWindow = props.window

  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } =
    useQuery({
      queryKey: ['channel-status', currentWindow],
      queryFn: () => getChannelStatus(currentWindow),
      refetchInterval: 60_000,
    })

  const cards = data?.data?.cards ?? []

  const updatedAtText = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : t('Not updated')

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Channel Status')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t(
          'Availability, cache rate and latency of each channel over the selected window'
        )}
      </SectionPageLayout.Description>
      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center gap-1 rounded-xl border bg-card p-1'>
          {CHANNEL_STATUS_WINDOWS.map((key) => {
            const config = CHANNEL_STATUS_WINDOW_CONFIG[key]
            return (
              <button
                key={key}
                type='button'
                onClick={() => props.onWindowChange(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  currentWindow === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {t(config.label)}
              </button>
            )
          })}
        </div>
        <Button
          variant='outline'
          className='rounded-xl'
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={isFetching ? 'animate-spin' : undefined}
            aria-hidden
          />
          {t('Refresh')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <p className='text-muted-foreground mb-4 text-xs'>
          {t('Updated at')} {updatedAtText}
        </p>
        {isLoading ? (
          <div className='text-muted-foreground py-16 text-center text-sm'>
            {t('Loading…')}
          </div>
        ) : isError ? (
          <div className='text-destructive py-16 text-center text-sm'>
            {t('Failed to load channel status')}
          </div>
        ) : cards.length === 0 ? (
          <div className='text-muted-foreground py-16 text-center text-sm'>
            {t(
              'No test records yet. Enable automatic channel testing or run a manual test first.'
            )}
          </div>
        ) : (
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {cards.map((card) => (
              <ChannelStatusCardItem key={card.channel_id} card={card} />
            ))}
          </div>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
