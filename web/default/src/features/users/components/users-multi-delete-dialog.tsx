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
import { useState } from 'react'
import { type Table } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { batchDeleteUsers } from '../api'
import { ERROR_MESSAGES } from '../constants'
import { type User } from '../types'
import { useUsers } from './users-provider'

type UsersMultiDeleteDialogProps<TData> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: Table<TData>
}

export function UsersMultiDeleteDialog<TData>({
  open,
  onOpenChange,
  table,
}: UsersMultiDeleteDialogProps<TData>) {
  const { t } = useTranslation()
  const { triggerRefresh } = useUsers()
  const [isDeleting, setIsDeleting] = useState(false)
  const selectedRows = table.getFilteredSelectedRowModel().rows

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      const ids = selectedRows.map((row) => (row.original as User).id)
      const { succeeded, failed } = await batchDeleteUsers(ids)

      if (succeeded.length > 0) {
        toast.success(
          t('Successfully deleted {{count}} user(s)', {
            count: succeeded.length,
          })
        )
      }
      if (failed.length > 0) {
        toast.error(
          t('Failed to delete {{count}} user(s)', { count: failed.length })
        )
      }

      table.resetRowSelection()
      triggerRefresh()
      onOpenChange(false)
    } catch (_error) {
      toast.error(t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <ConfirmDialog
      destructive
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleConfirm}
      isLoading={isDeleting}
      className='max-w-md'
      title={t('Delete {{count}} user(s)?', { count: selectedRows.length })}
      desc={
        <>
          {t('You are about to delete {{count}} user(s).', {
            count: selectedRows.length,
          })}{' '}
          <br />
          {t('This action cannot be undone.')}
        </>
      }
      confirmText={t('Delete')}
    />
  )
}
