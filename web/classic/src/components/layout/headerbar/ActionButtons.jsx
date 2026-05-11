/*
Copyright (C) 2025 QuantumNous

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

import React from 'react';
import { IconDownload } from '@douyinfe/semi-icons';
import NewYearButton from './NewYearButton';
import NotificationButton from './NotificationButton';
import ThemeToggle from './ThemeToggle';
import LanguageSelector from './LanguageSelector';
import UserArea from './UserArea';

const pillClass =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-zinc-950 shadow-[0_0_18px_-6px_rgba(16,185,129,0.55)] transition-colors md:px-3.5 md:text-sm';

const ActionButtons = ({
  isNewYear,
  toolDownloadLinkActive,
  toolDownloadUrl,
  unreadCount,
  onNoticeOpen,
  theme,
  onThemeToggle,
  currentLang,
  onLanguageChange,
  userState,
  isLoading,
  isMobile,
  isSelfUseMode,
  logout,
  navigate,
  t,
}) => {
  return (
    <div className='flex items-center gap-2 md:gap-3'>
      <NewYearButton isNewYear={isNewYear} />

      {toolDownloadLinkActive ? (
        <a
          href={toolDownloadUrl}
          target='_blank'
          rel='noopener noreferrer'
          download
          aria-label={t('Tool download')}
          className={`${pillClass} hover:bg-emerald-400`}
        >
          <IconDownload aria-hidden className='text-base' />
          {t('Tool download')}
        </a>
      ) : (
        <span
          className={`${pillClass} cursor-default opacity-75`}
          aria-disabled='true'
          aria-label={t('Tool download')}
        >
          <IconDownload aria-hidden className='text-base' />
          {t('Tool download')}
        </span>
      )}

      <NotificationButton
        unreadCount={unreadCount}
        onNoticeOpen={onNoticeOpen}
        t={t}
      />

      <ThemeToggle theme={theme} onThemeToggle={onThemeToggle} t={t} />

      <LanguageSelector
        currentLang={currentLang}
        onLanguageChange={onLanguageChange}
        t={t}
      />

      <UserArea
        userState={userState}
        isLoading={isLoading}
        isMobile={isMobile}
        isSelfUseMode={isSelfUseMode}
        logout={logout}
        navigate={navigate}
        t={t}
      />
    </div>
  );
};

export default ActionButtons;
