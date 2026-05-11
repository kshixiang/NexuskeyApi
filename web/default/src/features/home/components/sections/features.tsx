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
import {
  Zap,
  Shield,
  Globe,
  Code,
  Gauge,
  DollarSign,
  Users,
  HeartHandshake,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AnimateInView } from '@/components/animate-in-view'

interface FeaturesProps {
  className?: string
}

export function Features(_props: FeaturesProps) {
  const { t } = useTranslation()

  const features = [
    {
      id: 'fast',
      num: '01',
      title: t('Lightning Fast'),
      desc: t(
        'Optimized network architecture ensures millisecond response times'
      ),
      span: 'md:col-span-2',
      icon: <Zap className='size-4 text-primary' />,
      visual: (
        <div className='mt-4 grid grid-cols-3 gap-2'>
          {['OpenAI', 'Claude', 'Gemini', 'DeepSeek', 'Qwen'].map(
            (name) => (
              <div
                key={name}
                className='flex items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground transition-colors duration-200 hover:border-primary/35 hover:bg-primary/[0.06]'
              >
                {name}
              </div>
            )
          )}
        </div>
      ),
    },
    {
      id: 'secure',
      num: '02',
      title: t('Secure & Reliable'),
      desc: t(
        'Enterprise-grade security with comprehensive permission management'
      ),
      span: 'md:col-span-1',
      icon: <Shield className='size-4 text-emerald-400' />,
      visual: (
        <div className='mt-4 flex items-center justify-center'>
          <div className='relative'>
            <div className='flex size-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/5'>
              <Shield
                className='size-7 text-emerald-500/70'
                strokeWidth={1.5}
              />
            </div>
            <div className='absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-emerald-500'>
              <svg
                className='size-2.5 text-white'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                strokeWidth={3}
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='m4.5 12.75 6 6 9-13.5'
                />
              </svg>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'global',
      num: '03',
      title: t('Global Coverage'),
      desc: t('Multi-region deployment for stable global access'),
      span: 'md:col-span-1',
      icon: <Globe className='size-4 text-cyan-300/90' />,
      visual: (
        <div className='mt-4 space-y-2'>
          {[t('Load Balancing'), t('Rate Limiting'), t('Cost Tracking')].map(
            (step, i) => (
              <div key={step} className='flex items-center gap-2'>
                <div
                  className={`flex size-6 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums ${
                    i === 1
                      ? 'border-primary/40 bg-primary/15 text-primary'
                      : 'border-white/10 bg-white/[0.04] text-muted-foreground'
                  }`}
                >
                  {i + 1}
                </div>
                <div className='h-px flex-1 bg-white/[0.06]' />
                <span className='text-muted-foreground text-xs'>{step}</span>
              </div>
            )
          )}
        </div>
      ),
    },
    {
      id: 'developer',
      num: '04',
      title: t('Developer Friendly'),
      desc: t('Compatible API routes for common AI application workflows'),
      span: 'md:col-span-2',
      icon: <Code className='size-4 text-teal-300/90' />,
      visual: (
        <div className='mt-4 flex items-center gap-3'>
          <div className='flex -space-x-2'>
            {['API', 'SDK', 'CLI', 'Docs'].map((n) => (
              <div
                key={n}
                className='flex size-8 items-center justify-center rounded-full border-2 border-[oklch(0.082_0.016_264)] bg-gradient-to-br from-white/[0.08] to-white/[0.02] text-[9px] font-bold text-muted-foreground'
              >
                {n}
              </div>
            ))}
          </div>
          <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
            <Code className='size-3.5 text-primary' />
            {t('Multi-protocol Compatible')}
          </div>
        </div>
      ),
    },
  ]

  const additionalFeatures = [
    {
      icon: <Gauge className='size-5' strokeWidth={1.5} />,
      title: t('High Performance'),
      desc: t('Support for high concurrency with automatic load balancing'),
    },
    {
      icon: <DollarSign className='size-5' strokeWidth={1.5} />,
      title: t('Transparent Billing'),
      desc: t('Pay-as-you-go with real-time usage monitoring'),
    },
    {
      icon: <Users className='size-5' strokeWidth={1.5} />,
      title: t('Team Collaboration'),
      desc: t('Multi-user management with flexible permission allocation'),
    },
    {
      icon: <HeartHandshake className='size-5' strokeWidth={1.5} />,
      title: t('Open Source'),
      desc: t('Community driven, self-hosted, and extensible'),
    },
  ]

  return (
    <section className='relative z-10 px-6 py-24 md:py-32'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-16 max-w-lg'>
          <p className='mb-3 text-xs font-medium tracking-[0.2em] text-primary uppercase'>
            {t('Core Features')}
          </p>
          <h2 className='text-2xl leading-tight font-semibold tracking-tight text-balance md:text-3xl'>
            {t('Built for developers,')}
            <br />
            {t('designed for scale')}
          </h2>
        </AnimateInView>

        {/* Bento grid */}
        <div className='grid gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.06] shadow-[0_0_0_1px_oklch(1_0_0/0.03)] md:grid-cols-3'>
          {features.map((f, i) => (
            <AnimateInView
              key={f.id}
              delay={i * 100}
              animation='scale-in'
              className={`group bg-card p-7 transition-colors duration-200 hover:bg-white/[0.04] md:p-8 ${f.span}`}
            >
              <div className='mb-3 flex items-center gap-3'>
                <span className='flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-[10px] font-semibold text-muted-foreground tabular-nums'>
                  {f.num}
                </span>
                <h3 className='text-sm font-semibold'>{f.title}</h3>
              </div>
              <p className='text-muted-foreground text-sm leading-relaxed'>
                {f.desc}
              </p>
              {f.visual}
            </AnimateInView>
          ))}
        </div>

        {/* Additional features row */}
        <div className='mt-14 grid grid-cols-2 gap-10 md:grid-cols-4 md:gap-12'>
          {additionalFeatures.map((f, i) => (
            <AnimateInView
              key={f.title}
              delay={i * 100}
              animation='fade-up'
              className='group flex flex-col items-center text-center'
            >
              <div className='mb-3 flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-muted-foreground transition-colors duration-200 group-hover:border-primary/30 group-hover:text-primary'>
                {f.icon}
              </div>
              <h3 className='mb-1.5 text-sm font-semibold'>{f.title}</h3>
              <p className='text-muted-foreground max-w-[200px] text-xs leading-relaxed'>
                {f.desc}
              </p>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
