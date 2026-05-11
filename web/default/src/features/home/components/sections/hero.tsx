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
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSystemConfig } from '@/hooks/use-system-config'
import { Button } from '@/components/ui/button'
import { HeroTerminalDemo } from '../hero-terminal-demo'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()

  return (
    <section className='relative z-10 flex flex-col items-center overflow-hidden px-6 pt-28 pb-16 md:pt-36 md:pb-28'>
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
      {/* Subtle grid */}
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

      <div className='flex max-w-4xl flex-col items-center text-center'>
        <h1
          className='landing-animate-fade-up text-[clamp(2.1rem,5.8vw,3.65rem)] leading-[1.08] font-semibold tracking-tight text-balance'
          style={{ animationDelay: '0ms' }}
        >
          {t('Unified API Gateway for')}
          <br />
          <span className='bg-gradient-to-r from-emerald-200 via-teal-200 to-cyan-200 bg-clip-text text-transparent'>
            {t('All Your AI Models')}
          </span>
        </h1>
        <p
          className='landing-animate-fade-up text-muted-foreground mt-5 max-w-xl text-base leading-relaxed opacity-0 md:text-lg'
          style={{ animationDelay: '60ms' }}
        >
          {systemName}{' '}
          {t(
            'is an open-source AI API gateway for self-hosted deployments. Connect multiple upstream services, manage models, keys, quotas, logs, and routing policies in one place.'
          )}
        </p>
        <div
          className='landing-animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3 opacity-0'
          style={{ animationDelay: '120ms' }}
        >
          {props.isAuthenticated ? (
            <Button
              className='group h-11 rounded-md px-6 shadow-[0_0_0_1px_oklch(1_0_0/0.06),0_12px_40px_-16px_oklch(0.55_0.14_158/0.45)]'
              render={<Link to='/dashboard' />}
            >
              {t('Go to Dashboard')}
              <ArrowRight className='ml-1 size-3.5 transition-transform duration-200 group-hover:translate-x-0.5' />
            </Button>
          ) : (
            <>
              <Button
                className='group h-11 rounded-md px-6 shadow-[0_0_0_1px_oklch(1_0_0/0.06),0_12px_40px_-16px_oklch(0.55_0.14_158/0.45)]'
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
        className='landing-animate-fade-up w-full opacity-0'
        style={{ animationDelay: '200ms' }}
      >
        <HeroTerminalDemo />
      </div>
    </section>
  )
}
