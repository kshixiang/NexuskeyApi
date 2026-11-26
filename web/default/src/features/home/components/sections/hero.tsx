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
import { Claude, DeepSeek, Gemini, OpenAI } from '@lobehub/icons'
import { ArrowRight, KeyRound, Scale, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSystemConfig } from '@/hooks/use-system-config'
import { Button } from '@/components/ui/button'

interface HeroProps {
  isAuthenticated: boolean
}

export function Hero({ isAuthenticated }: HeroProps) {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()
  const benefits = [
    {
      icon: KeyRound,
      title: t('Model Access'),
      description: t(
        'Use our unified OpenAI-compatible endpoint in your applications'
      ),
    },
    {
      icon: Scale,
      title: t('Load Balancing'),
      description: t(
        'Support for high concurrency with automatic load balancing'
      ),
    },
    {
      icon: Wallet,
      title: t('Transparent Billing'),
      description: t('Pay-as-you-go with real-time usage monitoring'),
    },
  ]

  return (
    <div className='home-content'>
      <section className='home-intro' aria-labelledby='home-title'>
        <p className='home-intro__brand'>{systemName}</p>
        <h1 id='home-title'>{t('One API key, multiple AI models')}</h1>
        <p className='home-intro__description'>
          {t('Access Claude, GPT, Gemini and more through one API.')}
        </p>
        <div className='flex flex-wrap justify-center gap-3'>
          <Button
            size='lg'
            render={<Link to={isAuthenticated ? '/dashboard' : '/sign-up'} />}
          >
            {isAuthenticated ? t('Go to Dashboard') : t('Get Started')}
            <ArrowRight data-icon='inline-end' />
          </Button>
          <Button size='lg' variant='outline' render={<Link to='/pricing' />}>
            {t('View Pricing')}
          </Button>
        </div>
        <ul className='home-providers' aria-label={t('All Your AI Models')}>
          {[
            { name: 'OpenAI', icon: OpenAI },
            { name: 'Claude', icon: Claude },
            { name: 'Gemini', icon: Gemini },
            { name: 'DeepSeek', icon: DeepSeek },
          ].map(({ name, icon: Icon }) => (
            <li key={name}>
              <Icon size={21} aria-hidden='true' />
              <span>{name}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className='home-benefits' aria-label={t('Core Features')}>
        {benefits.map(({ icon: Icon, title, description }) => (
          <article key={title}>
            <Icon
              className='text-primary mb-4 size-5'
              strokeWidth={1.6}
              aria-hidden='true'
            />
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
