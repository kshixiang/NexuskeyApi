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
import { Link } from '@tanstack/react-router'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface CursorProPromoCardProps {
  className?: string
}

export function CursorProPromoCard(props: CursorProPromoCardProps) {
  const { t } = useTranslation()

  return (
    <Link
      to='/shop/cursor'
      className={cn('group relative block w-full', props.className)}
    >
      <div
        aria-hidden
        className='landing-cursor-promo-glow pointer-events-none absolute -inset-1 rounded-2xl bg-gradient-to-r from-violet-500/45 via-cyan-400/35 to-emerald-400/40 blur-xl'
      />
      <div className='relative overflow-hidden rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/10 via-violet-500/5 to-transparent p-px shadow-[0_0_0_1px_oklch(1_0_0/0.06),0_24px_60px_-28px_oklch(0.65_0.16_200/0.65)] transition-[transform,box-shadow] duration-300 group-hover:scale-[1.015] group-hover:shadow-[0_0_0_1px_oklch(1_0_0/0.08),0_28px_70px_-26px_oklch(0.65_0.16_200/0.75)] group-active:scale-[0.995]'>
        <div
          aria-hidden
          className='landing-cursor-promo-shimmer pointer-events-none absolute inset-0'
        />
        <div className='relative flex flex-col gap-4 rounded-[calc(1rem-1px)] bg-zinc-950/85 p-4 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:p-5 md:p-6'>
          <div className='min-w-0 space-y-2'>
            <div className='inline-flex items-center gap-1.5 rounded-full border border-cyan-400/35 bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-cyan-100 uppercase'>
              <Sparkles className='size-3 shrink-0 animate-pulse' aria-hidden />
              {t('Digital Shop')}
            </div>
            <p
              id='home-cursor-pro-heading'
              className='text-lg font-semibold tracking-tight sm:text-xl md:text-2xl'
            >
              {t('Buy Cursor Pro')}
            </p>
            <p className='text-muted-foreground text-xs leading-relaxed sm:text-sm md:max-w-2xl md:text-base'>
              {t(
                'Guest checkout — no account required. Pay online and receive your Cursor Pro account by email or SMS.'
              )}
            </p>
          </div>
          <span className='inline-flex h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 via-cyan-500 to-emerald-500 px-5 text-sm font-semibold text-white shadow-[0_0_28px_-10px_rgba(6,182,212,0.85)] transition-shadow duration-300 group-hover:shadow-[0_0_36px_-8px_rgba(6,182,212,1)] sm:w-auto md:h-12 md:px-6'>
            {t('Buy now')}
            <ArrowRight className='size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
          </span>
        </div>
      </div>
    </Link>
  )
}
