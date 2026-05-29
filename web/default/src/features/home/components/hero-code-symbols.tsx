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
import { cn } from '@/lib/utils'

const CODE_SYMBOLS = [
  { label: '0x1', className: 'left-[5%] top-[14%]' },
  { label: 'fn', className: 'left-[14%] top-[62%]' },
  { label: 'API', className: 'right-[8%] top-[20%]' },
  { label: 'git', className: 'right-[16%] top-[58%]' },
  { label: '&&', className: 'left-[38%] top-[8%]' },
  { label: '{}', className: 'right-[32%] top-[78%]' },
  { label: '/**/', className: 'left-[72%] top-[12%]' },
  { label: '$_', className: 'left-[8%] top-[38%]' },
  { label: '==', className: 'right-[6%] top-[42%]' },
  { label: '()', className: 'right-[42%] top-[6%]' },
] as const

export function HeroCodeSymbols() {
  return (
    <div
      aria-hidden
      className='pointer-events-none absolute inset-0 -z-10 overflow-hidden'
    >
      {CODE_SYMBOLS.map((symbol) => (
        <span
          key={symbol.label}
          className={cn(
            'absolute font-mono text-xs text-foreground/[0.07] select-none sm:text-sm',
            symbol.className
          )}
        >
          {symbol.label}
        </span>
      ))}
    </div>
  )
}
