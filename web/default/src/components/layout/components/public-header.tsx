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
import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { isSafeHttpUrl } from '@/lib/safe-http-url'
import { useNotifications } from '@/hooks/use-notifications'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationButton } from '@/components/notification-button'
import { NotificationDialog } from '@/components/notification-dialog'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { defaultTopNavLinks } from '../config/top-nav.config'
import type { TopNavLink } from '../types'
import { HeaderLogo } from './header-logo'

export interface PublicHeaderProps {
  navLinks?: TopNavLink[]
  mobileLinks?: TopNavLink[]
  navContent?: React.ReactNode
  showThemeSwitch?: boolean
  showLanguageSwitcher?: boolean
  logo?: React.ReactNode
  siteName?: string
  homeUrl?: string
  leftContent?: React.ReactNode
  rightContent?: React.ReactNode
  showNavigation?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  className?: string
}

export function PublicHeader(props: PublicHeaderProps) {
  const {
    navLinks = defaultTopNavLinks,
    showThemeSwitch = true,
    showLanguageSwitcher = true,
    logo: customLogo,
    siteName: customSiteName,
    homeUrl = '/',
    showAuthButtons = true,
    showNotifications = true,
  } = props

  const { t } = useTranslation()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { auth } = useAuthStore()
  const {
    systemName,
    logo: systemLogo,
    loading,
    logoLoaded,
    nexusKeyDownloadUrl: nexusKeyDownloadUrlFromStore,
  } = useSystemConfig()
  const { status } = useStatus()
  const nexusKeyDownloadUrlFromStatus =
    typeof status?.nexus_key_download_url === 'string'
      ? status.nexus_key_download_url.trim()
      : ''
  const nexusKeyDownloadUrl =
    nexusKeyDownloadUrlFromStatus ||
    (nexusKeyDownloadUrlFromStore ?? '').trim()
  const dynamicLinks = useTopNavLinks()
  const notifications = useNotifications()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const user = auth.user
  const isAuthenticated = !!user
  const displaySiteName = customSiteName || systemName
  const links = dynamicLinks.length > 0 ? dynamicLinks : navLinks

  const toolDownloadUrl = (nexusKeyDownloadUrl ?? '').trim()
  const toolDownloadActive =
    toolDownloadUrl.length > 0 && isSafeHttpUrl(toolDownloadUrl)

  const toolDownloadDesktopClass = cn(
    'hidden h-9 shrink-0 gap-1.5 rounded-full border border-emerald-500/50 px-3.5 font-semibold whitespace-nowrap sm:inline-flex',
    'bg-emerald-500 text-zinc-950 shadow-[0_0_22px_-6px_rgba(16,185,129,0.55)]',
    'hover:bg-emerald-400 hover:shadow-[0_0_26px_-4px_rgba(16,185,129,0.45)]',
    'active:translate-y-px',
    !toolDownloadActive && 'disabled:opacity-75'
  )
  const toolDownloadMobileRowClass = cn(
    'h-8 shrink-0 gap-1 rounded-full border border-emerald-500/50 px-2.5 text-xs font-semibold whitespace-nowrap',
    'bg-emerald-500 text-zinc-950 shadow-[0_0_18px_-6px_rgba(16,185,129,0.55)]',
    'hover:bg-emerald-400',
    !toolDownloadActive && 'disabled:opacity-75'
  )
  const toolDownloadOverlayClass = cn(
    'mb-2 flex items-center justify-center gap-2 rounded-xl border border-emerald-500/50 py-3.5 font-semibold',
    'bg-emerald-500 text-zinc-950 shadow-[0_0_24px_-8px_rgba(16,185,129,0.55)]',
    'hover:bg-emerald-400',
    !toolDownloadActive && 'pointer-events-none opacity-75'
  )

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  return (
    <>
      <header className='pointer-events-none fixed inset-x-0 top-0 z-50'>
        <div
          className={cn(
            'pointer-events-auto mx-auto transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
            scrolled ? 'max-w-[52rem] px-3 pt-3' : 'max-w-7xl px-4 pt-0 md:px-6'
          )}
        >
          <nav
            className={cn(
              'flex items-center justify-between transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
              scrolled
                ? 'bg-background/60 ring-border/50 h-12 rounded-2xl pr-1.5 pl-4 shadow-[0_2px_16px_-6px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(0,0,0,0.02)] ring-[0.5px] backdrop-blur-2xl dark:shadow-[0_2px_16px_-6px_rgba(0,0,0,0.4)]'
                : 'h-16 px-2'
            )}
          >
            {/* Logo */}
            <div className='flex min-w-0 items-center gap-2 sm:gap-3'>
              <Link
                to={homeUrl}
                className='group flex min-w-0 shrink-0 items-center gap-2.5'
              >
                <div className='flex size-7 shrink-0 items-center justify-center transition-all duration-300 group-hover:scale-105'>
                  {loading ? (
                    <Skeleton className='size-full rounded-lg' />
                  ) : customLogo ? (
                    customLogo
                  ) : (
                    <HeaderLogo
                      src={systemLogo}
                      loading={loading}
                      logoLoaded={logoLoaded}
                      className='size-full rounded-lg object-contain'
                    />
                  )}
                </div>
                <span className='truncate text-sm font-semibold tracking-tight'>
                  {loading ? <Skeleton className='h-4 w-16' /> : displaySiteName}
                </span>
              </Link>

              {toolDownloadActive ? (
                <Button
                  size='sm'
                  className={toolDownloadDesktopClass}
                  render={
                    <a
                      href={toolDownloadUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      download
                      aria-label={t('Tool download')}
                    />
                  }
                >
                  <Download className='size-3.5 shrink-0' aria-hidden />
                  {t('Tool download')}
                </Button>
              ) : (
                <Button
                  type='button'
                  size='sm'
                  disabled
                  className={toolDownloadDesktopClass}
                  aria-label={t('Tool download')}
                >
                  <Download className='size-3.5 shrink-0' aria-hidden />
                  {t('Tool download')}
                </Button>
              )}
            </div>

            {/* Desktop nav */}
            <div className='hidden flex-1 items-center justify-end gap-0.5 sm:flex'>
              {links.map((link, i) => {
                const isActive = pathname === link.href
                if (link.external) {
                  return (
                    <a
                      key={i}
                      href={link.href}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='text-muted-foreground hover:text-foreground rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-200'
                    >
                      {t(link.title)}
                    </a>
                  )
                }
                return (
                  <Link
                    key={i}
                    to={link.href}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-200',
                      isActive
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t(link.title)}
                  </Link>
                )
              })}

              {(showLanguageSwitcher ||
                showThemeSwitch ||
                showNotifications) && (
                <div className='bg-border/40 mx-2 h-4 w-px' />
              )}

              {showLanguageSwitcher && <LanguageSwitcher />}
              {showThemeSwitch && <ThemeSwitch />}
              {showNotifications && (
                <NotificationButton
                  unreadCount={notifications.unreadCount}
                  onClick={() => notifications.openDialog()}
                />
              )}

              {showAuthButtons && (
                <>
                  <div className='bg-border/40 mx-1 h-4 w-px' />
                  {loading ? (
                    <Skeleton className='h-8 w-20 rounded-lg' />
                  ) : isAuthenticated ? (
                    <ProfileDropdown />
                  ) : (
                    <Button
                      size='sm'
                      className='h-8 rounded-lg px-3.5 text-xs font-medium'
                      render={<Link to='/sign-in' />}
                    >
                      {t('Sign in')}
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Mobile: compact actions + hamburger */}
            <div className='flex flex-1 items-center justify-end gap-2 sm:hidden'>
              {toolDownloadActive ? (
                <Button
                  size='sm'
                  className={toolDownloadMobileRowClass}
                  render={
                    <a
                      href={toolDownloadUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      download
                      aria-label={t('Tool download')}
                    />
                  }
                >
                  <Download className='size-3 shrink-0' aria-hidden />
                  {t('Tool download')}
                </Button>
              ) : (
                <Button
                  type='button'
                  size='sm'
                  disabled
                  className={toolDownloadMobileRowClass}
                  aria-label={t('Tool download')}
                >
                  <Download className='size-3 shrink-0' aria-hidden />
                  {t('Tool download')}
                </Button>
              )}
              {showThemeSwitch && <ThemeSwitch />}
              {showAuthButtons && !loading && isAuthenticated && (
                <ProfileDropdown />
              )}
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-9'
                onClick={() => setMobileOpen((v) => !v)}
                aria-label={t('Toggle navigation menu')}
              >
                <div className='relative size-4'>
                  <span
                    className={cn(
                      'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300',
                      mobileOpen ? 'top-[7px] rotate-45' : 'top-[3px]'
                    )}
                  />
                  <span
                    className={cn(
                      'absolute inset-x-0 top-[7px] block h-[1.5px] rounded-full bg-current transition-all duration-300',
                      mobileOpen ? 'scale-x-0 opacity-0' : 'opacity-100'
                    )}
                  />
                  <span
                    className={cn(
                      'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300',
                      mobileOpen ? 'top-[7px] -rotate-45' : 'top-[11px]'
                    )}
                  />
                </div>
              </Button>
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile full-screen overlay */}
      <div
        className={cn(
          'bg-background/98 fixed inset-0 z-40 backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] sm:pointer-events-none sm:hidden',
          mobileOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      >
        <div className='flex h-full flex-col justify-between px-8 pt-20 pb-10'>
          <nav className='flex flex-col gap-1'>
            {toolDownloadActive ? (
              <a
                href={toolDownloadUrl}
                target='_blank'
                rel='noopener noreferrer'
                download
                onClick={() => setMobileOpen(false)}
                className={cn(
                  toolDownloadOverlayClass,
                  mobileOpen
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-4 opacity-0'
                )}
                style={{ transitionDelay: mobileOpen ? '60ms' : '0ms' }}
              >
                <Download className='size-4 shrink-0' aria-hidden />
                {t('Tool download')}
              </a>
            ) : (
              <div
                role='group'
                aria-label={t('Tool download')}
                aria-disabled='true'
                className={cn(
                  toolDownloadOverlayClass,
                  mobileOpen
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-4 opacity-0'
                )}
                style={{ transitionDelay: mobileOpen ? '60ms' : '0ms' }}
              >
                <Download className='size-4 shrink-0' aria-hidden />
                {t('Tool download')}
              </div>
            )}
            {links.map((link, i) => {
              const isActive = pathname === link.href
              return (
                <Link
                  key={i}
                  to={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 py-3 text-base font-medium tracking-tight transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    mobileOpen
                      ? 'translate-y-0 opacity-100'
                      : 'translate-y-4 opacity-0',
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  )}
                  style={{
                    transitionDelay: mobileOpen ? `${100 + i * 50}ms` : '0ms',
                  }}
                >
                  {t(link.title)}
                </Link>
              )
            })}
          </nav>

          <div
            className={cn(
              'flex flex-col gap-3 transition-all duration-500',
              mobileOpen
                ? 'translate-y-0 opacity-100'
                : 'translate-y-4 opacity-0'
            )}
            style={{ transitionDelay: mobileOpen ? '250ms' : '0ms' }}
          >
            {showAuthButtons && (
              <Link
                to={isAuthenticated ? '/dashboard' : '/sign-in'}
                onClick={() => setMobileOpen(false)}
                className='bg-foreground text-background inline-flex h-10 items-center justify-center rounded-lg text-sm font-medium transition-opacity hover:opacity-90 active:opacity-80'
              >
                {isAuthenticated ? t('Go to Dashboard') : t('Sign in')}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Notification Dialog */}
      {showNotifications && (
        <NotificationDialog
          open={notifications.dialogOpen}
          onOpenChange={notifications.setDialogOpen}
          activeTab={notifications.activeTab}
          onTabChange={notifications.setActiveTab}
          notice={notifications.notice}
          announcements={notifications.announcements}
          loading={notifications.loading}
          onCloseToday={notifications.closeToday}
        />
      )}
    </>
  )
}
