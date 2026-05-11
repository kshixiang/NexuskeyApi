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
import { Download, LayoutDashboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AnimateInView } from '@/components/animate-in-view'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { isSafeHttpUrl } from '@/lib/safe-http-url'

export function SpecialNotice() {
  const { t } = useTranslation()
  const { nexusKeyDownloadUrl: fromStore } = useSystemConfig()
  const { status } = useStatus()
  const fromStatus =
    typeof status?.nexus_key_download_url === 'string'
      ? status.nexus_key_download_url.trim()
      : ''
  const downloadUrl = (fromStatus || (fromStore ?? '').trim()).trim()
  const downloadActive =
    downloadUrl.length > 0 && isSafeHttpUrl(downloadUrl)

  return (
    <section
      aria-labelledby='home-special-notice-heading'
      className='relative z-10 border-t border-white/[0.06] px-6 py-16 md:py-20'
    >
      <div className='mx-auto max-w-6xl'>
        <AnimateInView animation='fade-up'>
          <div className='rounded-2xl border border-white/[0.08] bg-card p-8 shadow-[0_0_0_1px_oklch(1_0_0/0.03)] md:p-10'>
            <div className='flex flex-col gap-6 md:flex-row md:items-start md:gap-10'>
              <div className='text-primary flex shrink-0 items-center gap-2'>
                <LayoutDashboard
                  className='size-5 shrink-0'
                  aria-hidden
                />
                <span className='text-xs font-medium tracking-[0.2em] uppercase'>
                  {t('Special note')}
                </span>
              </div>
              <div className='min-w-0 flex-1 space-y-4'>
                <h2
                  id='home-special-notice-heading'
                  className='text-lg font-semibold tracking-tight text-balance md:text-xl'
                >
                  {t('NexusKey companion title')}
                </h2>
                <p className='text-muted-foreground text-sm leading-relaxed md:text-base'>
                  {t('NexusKey companion description')}
                </p>
                <div className='flex flex-wrap items-center gap-3 pt-1'>
                  {downloadActive ? (
                    <Button
                      className='h-11 rounded-md px-5 shadow-[0_0_0_1px_oklch(1_0_0/0.06),0_12px_40px_-16px_oklch(0.55_0.14_158/0.45)]'
                      render={
                        <a
                          href={downloadUrl}
                          target='_blank'
                          rel='noopener noreferrer'
                          download
                          aria-label={t('Download NexusKey in one click')}
                        />
                      }
                    >
                      <Download className='size-4' aria-hidden />
                      {t('Download NexusKey in one click')}
                    </Button>
                  ) : (
                    <Button
                      type='button'
                      disabled
                      className='h-11 rounded-md px-5 opacity-80 shadow-[0_0_0_1px_oklch(1_0_0/0.06),0_12px_40px_-16px_oklch(0.55_0.14_158/0.45)]'
                      aria-label={t('Download NexusKey in one click')}
                    >
                      <Download className='size-4' aria-hidden />
                      {t('Download NexusKey in one click')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </AnimateInView>
      </div>
    </section>
  )
}
