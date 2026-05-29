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
import { ArrowRight, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSystemConfig } from '@/hooks/use-system-config'
import { Button } from '@/components/ui/button'
import { HeroCodeSymbols } from '../hero-code-symbols'
import { HeroTerminalDemo } from '../hero-terminal-demo'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

const primaryCtaClassName =
  'group h-11 rounded-md px-6 shadow-[0_0_0_1px_oklch(1_0_0/0.06),3px_3px_0_0_oklch(0.12_0.02_158/0.85),0_12px_40px_-16px_oklch(0.55_0.14_158/0.45)] transition-[transform,box-shadow] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[0_0_0_1px_oklch(1_0_0/0.06),1px_1px_0_0_oklch(0.12_0.02_158/0.85),0_12px_40px_-16px_oklch(0.55_0.14_158/0.45)]'

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()

  return (
    <section className='relative z-10 overflow-hidden px-6 pt-28 pb-16 md:pt-36 md:pb-28'>
      {/* Brand glow + cool depth (Supabase-style marketing) */}
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 -z-10'
        style={{
          background: [
            'radial-gradient(ellipse 55% 45% at 50% -10%, oklch(0.55 0.14 158 / 0.35) 0%, transparent 65%)',
            'radial-gradient(ellipse 50% 40% at 85% 25%, oklch(0.45 0.12 200 / 0.18) 0%, transparent 60%)',
            'radial-gradient(ellipse 45% 35% at 10% 40%, oklch(0.5 0.1 158 / 0.12) 0%, transparent 55%)',
          ].join(', '),
        }}
      />
      {/* Dot grid */}
      <div
        aria-hidden
        className='absolute inset-0 -z-10 bg-[radial-gradient(circle,oklch(1_0_0/0.07)_1px,transparent_1px)] bg-[size:1.5rem_1.5rem] [mask-image:radial-gradient(ellipse_75%_60%_at_50%_25%,black_10%,transparent_72%)]'
      />
      {/* Line grid */}
      <div
        aria-hidden
        className='absolute inset-0 -z-10 bg-[linear-gradient(to_right,oklch(1_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.04)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_20%,black_15%,transparent_75%)]'
      />
      {/* Soft diagonal sheen */}
      <div
        aria-hidden
        className='absolute inset-0 -z-10 opacity-[0.07]'
        style={{
          background:
            'repeating-linear-gradient(-35deg, transparent, transparent 80px, oklch(0.85 0.12 158) 80px, oklch(0.85 0.12 158) 81px)',
        }}
      />
      <HeroCodeSymbols />

      <div className='relative mx-auto w-full max-w-6xl'>
        <div className='flex flex-col items-center gap-12 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-10 xl:gap-14'>
          <div className='flex w-full max-w-xl flex-col items-center text-center lg:max-w-none lg:items-start lg:text-left'>
            <div
              className='landing-animate-fade-up border-primary/25 bg-primary/10 text-primary mb-6 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border px-3 py-1 text-xs font-medium opacity-0 lg:justify-start'
              style={{ animationDelay: '0ms' }}
            >
              <Zap className='size-3.5 shrink-0' aria-hidden />
              <span>{systemName}</span>
              <span className='text-foreground/25 hidden sm:inline' aria-hidden>
                ·
              </span>
              <span className='text-primary/90'>
                {t('1 CNY = 1 USD credit · Multi-channel')}
              </span>
            </div>
            <h1
              className='landing-animate-fade-up text-[clamp(2.1rem,5.8vw,3.65rem)] leading-[1.08] font-semibold tracking-tight text-balance'
              style={{ animationDelay: '40ms' }}
            >
              {t('Stable multi-channel routing,')}
              <br />
              <span className='bg-gradient-to-r from-emerald-200 via-teal-200 to-cyan-200 bg-clip-text text-transparent'>
                {t('every AI model you need')}
              </span>
            </h1>
            <p
              className='landing-animate-fade-up text-muted-foreground mt-5 max-w-xl text-base leading-relaxed opacity-0 md:text-lg'
              style={{ animationDelay: '100ms' }}
            >
              {t(
                '{{systemName}} offers multiple stable upstream channels with smart scheduling. Recharge at 1 CNY = 1 USD in credits—transparent pricing, no conversion markup.',
                { systemName }
              )}
            </p>
            <div
              className='landing-animate-fade-up mt-9 flex w-full flex-wrap items-center justify-center gap-3 opacity-0 lg:justify-start'
              style={{ animationDelay: '160ms' }}
            >
              {props.isAuthenticated ? (
                <Button
                  className={primaryCtaClassName}
                  render={<Link to='/dashboard' />}
                >
                  {t('Go to Dashboard')}
                  <ArrowRight className='ml-1 size-3.5 transition-transform duration-200 group-hover:translate-x-0.5' />
                </Button>
              ) : (
                <>
                  <Button
                    className={primaryCtaClassName}
                    render={<Link to='/sign-up' />}
                  >
                    {t('Get Started')}
                    <ArrowRight className='ml-1 size-3.5 transition-transform duration-200 group-hover:translate-x-0.5' />
                  </Button>
                  <Button
                    variant='outline'
                    className='h-11 rounded-md border-white/15 bg-transparent hover:bg-white/[0.06]'
                    render={<Link to='/pricing' />}
                  >
                    {t('View Pricing')}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div
            className='landing-animate-fade-right w-full min-w-0 opacity-0 lg:max-w-none'
            style={{ animationDelay: '200ms' }}
          >
            <HeroTerminalDemo className='mx-0 mt-0 max-w-none' />
          </div>
        </div>
      </div>
    </section>
  )
}
