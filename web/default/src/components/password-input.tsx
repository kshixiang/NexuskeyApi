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
import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from './ui/input-group'

type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> & {
  ref?: React.Ref<HTMLInputElement>
  startIcon?: React.ReactNode
}

export function PasswordInput({
  className,
  disabled,
  ref,
  startIcon,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = React.useState(false)
  const { t } = useTranslation()

  return (
    <InputGroup className={className}>
      {startIcon && (
        <InputGroupAddon aria-hidden='true'>{startIcon}</InputGroupAddon>
      )}
      <InputGroupInput
        type={showPassword ? 'text' : 'password'}
        ref={ref}
        disabled={disabled}
        {...props}
        data-slot='input-group-control'
      />
      <InputGroupAddon align='inline-end'>
        <InputGroupButton
          size='icon-xs'
          disabled={disabled}
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={t('Toggle password visibility')}
          aria-pressed={showPassword}
        >
          {showPassword ? (
            <EyeOff aria-hidden='true' />
          ) : (
            <Eye aria-hidden='true' />
          )}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
