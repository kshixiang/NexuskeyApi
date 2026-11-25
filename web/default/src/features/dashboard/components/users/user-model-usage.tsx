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
import { useMemo, useState } from 'react'
import { skipToken, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getUserModelUsage } from '@/features/dashboard/api'
import type {
  QuotaDataItem,
  UserModelUsage as UsageRow,
} from '@/features/dashboard/types'

type UserOption = { id: number; label: string }

type UserModelUsageProps = {
  userData?: QuotaDataItem[]
  isLoadingUsers: boolean
  usersLoadFailed: boolean
  timeRange: { start_timestamp: number; end_timestamp: number }
}

function getUserOptions(records: QuotaDataItem[]): UserOption[] {
  const latestByUser = new Map<number, { name: string; timestamp: number }>()
  for (const record of records) {
    const id = record.user_id
    if (!id || id < 0) continue

    const latest = latestByUser.get(id)
    if (!latest || record.created_at > latest.timestamp) {
      latestByUser.set(id, {
        name: record.username ?? '',
        timestamp: record.created_at,
      })
    }
  }

  return Array.from(latestByUser, ([id, user]) => ({
    id,
    label: user.name ? `${user.name} (#${id})` : `#${id}`,
  })).sort((a, b) => a.label.localeCompare(b.label))
}

function addTokenDetails(
  total: number | null,
  tokens: number | null | undefined
): number | null {
  return total === null || tokens == null ? null : total + tokens
}

function UserModelUsageTable(props: { rows: UsageRow[] }): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const numberFormat = new Intl.NumberFormat(i18n.language)
  const totals = props.rows.reduce<{
    input: number | null
    output: number | null
    tokens: number
    quota: number
  }>(
    (total, row) => ({
      input: addTokenDetails(total.input, row.input_tokens),
      output: addTokenDetails(total.output, row.output_tokens),
      tokens: total.tokens + row.token_used,
      quota: total.quota + row.quota,
    }),
    { input: 0, output: 0, tokens: 0, quota: 0 }
  )
  const renderTokenDetails = (tokens: number | null | undefined) => {
    if (tokens != null) return numberFormat.format(tokens)
    return (
      <span className='text-muted-foreground' title={t('Not available')}>
        —
      </span>
    )
  }
  const formatCharge = (quota: number) =>
    formatQuotaWithCurrency(quota, {
      digitsLarge: 6,
      digitsSmall: 6,
      abbreviate: false,
    })

  return (
    <Table aria-label={t('User Model Usage')}>
      <TableHeader>
        <TableRow>
          <TableHead scope='col' className='pl-3 sm:pl-5'>
            {t('Model')}
          </TableHead>
          <TableHead scope='col' className='text-right'>
            {t('Input Tokens')}
          </TableHead>
          <TableHead scope='col' className='text-right'>
            {t('Output Tokens')}
          </TableHead>
          <TableHead scope='col' className='text-right'>
            {t('Total Tokens')}
          </TableHead>
          <TableHead scope='col' className='pr-3 text-right sm:pr-5'>
            {t('User Charge')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.rows.map((row) => (
          <TableRow key={row.model_name}>
            <TableCell className='pl-3 font-medium sm:pl-5'>
              {row.model_name || '—'}
            </TableCell>
            <TableCell className='text-right tabular-nums'>
              {renderTokenDetails(row.input_tokens)}
            </TableCell>
            <TableCell className='text-right tabular-nums'>
              {renderTokenDetails(row.output_tokens)}
            </TableCell>
            <TableCell className='text-right tabular-nums'>
              {numberFormat.format(row.token_used)}
            </TableCell>
            <TableCell className='pr-3 text-right tabular-nums sm:pr-5'>
              {formatCharge(row.quota)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableHead scope='row' className='pl-3 sm:pl-5'>
            {t('Total')}
          </TableHead>
          <TableCell className='text-right tabular-nums'>
            {renderTokenDetails(totals.input)}
          </TableCell>
          <TableCell className='text-right tabular-nums'>
            {renderTokenDetails(totals.output)}
          </TableCell>
          <TableCell className='text-right tabular-nums'>
            {numberFormat.format(totals.tokens)}
          </TableCell>
          <TableCell className='pr-3 text-right tabular-nums sm:pr-5'>
            {formatCharge(totals.quota)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

export function UserModelUsage(props: UserModelUsageProps): React.JSX.Element {
  const { t } = useTranslation()
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null)
  const users = useMemo(
    () => getUserOptions(props.userData ?? []),
    [props.userData]
  )
  const userId = selectedUser?.id
  const usage = useQuery({
    queryKey: ['dashboard', 'user-model-usage', userId, props.timeRange],
    queryFn:
      userId !== undefined
        ? () => getUserModelUsage({ ...props.timeRange, user_id: userId })
        : skipToken,
    staleTime: 60_000,
    retry: false,
  })

  return (
    <section
      className='min-w-0 rounded-lg border'
      aria-label={t('User Model Usage')}
    >
      <div className='flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-5 sm:py-3'>
        <h2 className='text-sm font-semibold'>{t('User Model Usage')}</h2>
        <Combobox
          items={users}
          value={selectedUser}
          onValueChange={setSelectedUser}
          itemToStringLabel={(user) => user.label}
          isItemEqualToValue={(item, value) => item.id === value.id}
          disabled={props.isLoadingUsers && !selectedUser}
        >
          <ComboboxInput
            aria-label={t('Search users...')}
            placeholder={t('Search users...')}
            className='w-full sm:w-60'
            showClear
          />
          <ComboboxContent>
            <ComboboxEmpty>{t('No Users Found')}</ComboboxEmpty>
            <ComboboxList>
              {(user: UserOption) => (
                <ComboboxItem key={user.id} value={user}>
                  {user.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      {(usage.isLoading || (!selectedUser && props.isLoadingUsers)) && (
        <div className='p-3 sm:px-5' role='status' aria-label={t('Loading...')}>
          <Skeleton className='h-12 w-full' />
        </div>
      )}
      {usage.isError && (
        <div className='flex items-center justify-between gap-2 px-3 py-2 sm:px-5'>
          <p className='text-muted-foreground text-sm' role='status'>
            {t('Request failed')}
          </p>
          <Button
            variant='outline'
            size='sm'
            onClick={() => void usage.refetch()}
          >
            {t('Retry')}
          </Button>
        </div>
      )}
      {!selectedUser && props.usersLoadFailed && (
        <p
          className='text-muted-foreground px-3 py-4 text-sm sm:px-5'
          role='status'
        >
          {t('Request failed')}
        </p>
      )}
      {((usage.isSuccess && usage.data.length === 0) ||
        (!selectedUser &&
          !props.isLoadingUsers &&
          !props.usersLoadFailed &&
          users.length === 0)) && (
        <p
          className='text-muted-foreground px-3 py-4 text-sm sm:px-5'
          role='status'
        >
          {t('No data available')}
        </p>
      )}
      {usage.data && usage.data.length > 0 && (
        <UserModelUsageTable rows={usage.data} />
      )}
    </section>
  )
}
