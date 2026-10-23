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
import { Button } from '@/components/ui/button'
import { AnimateInView } from '@/components/animate-in-view'

interface CTAProps {
  className?: string
  isAuthenticated?: boolean
}

export function CTA(props: CTAProps) {
  const { t } = useTranslation()

  if (props.isAuthenticated) {
    return null
  }

  return (
    <section className='relative z-10 overflow-hidden px-6 py-24 md:py-36'>
      <div
        aria-hidden
        className='absolute inset-0 -z-10'
        style={{
          background: [
            'radial-gradient(ellipse 55% 70% at 50% 100%, oklch(0.596 0.145 191.4 / 0.30) 0%, transparent 55%)',
            'radial-gradient(ellipse 40% 50% at 20% 30%, oklch(0.596 0.145 191.4 / 0.16) 0%, transparent 50%)',
            'radial-gradient(ellipse 35% 45% at 85% 20%, oklch(0.699 0.176 188.6 / 0.14) 0%, transparent 50%)',
          ].join(', '),
        }}
      />
      <div
        aria-hidden
        className='absolute inset-0 -z-10 opacity-[0.04]'
        style={{
          background:
            'repeating-linear-gradient(-40deg, transparent, transparent 72px, oklch(0.779 0.192 188.1) 72px, oklch(0.779 0.192 188.1) 73px)',
        }}
      />

      <AnimateInView
        className='mx-auto max-w-2xl text-center'
        animation='scale-in'
      >
        <h2 className='text-2xl leading-tight font-semibold tracking-tight text-balance md:text-4xl'>
          {t('Ready to simplify')}
          <br />
          <span className='text-gradient-teal'>
            {t('your AI integration?')}
          </span>
        </h2>
        <p className='text-muted-foreground mx-auto mt-5 max-w-md text-sm leading-relaxed md:text-base'>
          {t(
            'Deploy your own gateway and start routing requests through your configured upstream services.'
          )}
        </p>
        <div className='mt-9 flex flex-wrap items-center justify-center gap-3'>
          <Button
            className='group h-11 rounded-xl px-6 bg-gradient-primary shadow-glow transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-glow-lg'
            render={<Link to='/sign-up' />}
          >
            {t('Get Started')}
            <ArrowRight className='ml-1 size-3.5 transition-transform duration-200 group-hover:translate-x-0.5' />
          </Button>
          <Button
            variant='outline'
            className='h-11 rounded-xl border-border/60 bg-transparent hover:bg-accent hover:text-accent-foreground'
            render={<Link to='/pricing' />}
          >
            {t('View Pricing')}
          </Button>
        </div>
      </AnimateInView>
    </section>
  )
}
