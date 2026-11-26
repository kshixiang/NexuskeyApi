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
import type { TFunction } from 'i18next'

export const API_KEY_CATEGORIES = [
  'general',
  'openai',
  'claude',
  'gemini',
  'domestic',
  'other',
] as const

export function getApiKeyCategoryLabel(
  category: string | null | undefined,
  t: TFunction
): string {
  switch (category) {
    case 'openai':
      return t('OpenAI')
    case 'claude':
      return t('Claude')
    case 'gemini':
      return t('Gemini')
    case 'domestic':
      return t('Domestic Models')
    case 'other':
      return t('Other')
    default:
      return t('General-purpose')
  }
}
