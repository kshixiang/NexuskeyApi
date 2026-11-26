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
import { Claude, DeepSeek, Gemini, OpenAI } from '@lobehub/icons'
import { Check, Layers, Shapes } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  API_KEY_CATEGORIES,
  getApiKeyCategoryLabel,
} from '../lib/api-key-category'
import type { ApiKeyFormValues } from '../lib/api-key-form'

const categoryIcons = {
  general: Layers,
  openai: OpenAI,
  claude: Claude,
  gemini: Gemini,
  domestic: DeepSeek,
  other: Shapes,
}

type ApiKeyCategorySelectProps = {
  value: ApiKeyFormValues['category']
  onValueChange: (value: ApiKeyFormValues['category']) => void
}

export function ApiKeyCategorySelect(props: ApiKeyCategorySelectProps) {
  const { t } = useTranslation()

  return (
    <ToggleGroup
      aria-label={t('Category')}
      value={[props.value]}
      onValueChange={(values) => {
        const category = API_KEY_CATEGORIES.find((value) => value === values[0])
        if (category) props.onValueChange(category)
      }}
      variant='outline'
      spacing={2}
      className='grid w-full grid-cols-3 gap-2 sm:grid-cols-6'
    >
      {API_KEY_CATEGORIES.map((category) => {
        const Icon = categoryIcons[category]

        return (
          <ToggleGroupItem
            key={category}
            value={category}
            className='aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-foreground relative h-26 min-w-0 flex-col gap-2 rounded-xl border p-2 [&_svg]:size-6'
          >
            <Check
              aria-hidden
              className='absolute top-1.5 right-1.5 opacity-0 group-aria-pressed/toggle:opacity-100 [&]:size-3'
            />
            <span
              aria-hidden
              className='bg-muted flex size-10 items-center justify-center rounded-xl'
            >
              <Icon />
            </span>
            <span className='text-center text-xs leading-tight whitespace-normal'>
              {getApiKeyCategoryLabel(category, t)}
            </span>
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
