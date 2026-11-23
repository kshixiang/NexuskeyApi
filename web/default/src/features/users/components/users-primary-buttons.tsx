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
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { cleanupInactiveUsers, previewCleanupInactiveUsers } from '../api'
import { useUsers } from './users-provider'

export function UsersPrimaryButtons() {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow, triggerRefresh } = useUsers()
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [previewCount, setPreviewCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const handleCreate = () => {
    setCurrentRow(null)
    setOpen('create')
  }

  const handlePreviewCleanup = async () => {
    setIsLoading(true)
    try {
      const result = await previewCleanupInactiveUsers()
      if (result.success) {
        setPreviewCount(result.data ?? 0)
        setCleanupOpen(true)
      } else {
        toast.error(result.message || t('Failed to preview inactive users'))
      }
    } catch {
      toast.error(t('Failed to preview inactive users'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCleanupConfirm = async () => {
    setIsLoading(true)
    try {
      const result = await cleanupInactiveUsers()
      if (result.success) {
        const count = result.data ?? 0
        toast.success(t('{{count}} inactive user(s) deleted', { count }))
        setCleanupOpen(false)
        triggerRefresh()
      } else {
        toast.error(result.message || t('Failed to delete inactive users'))
      }
    } catch {
      toast.error(t('Failed to delete inactive users'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className='flex gap-2'>
      <Button size='sm' onClick={handleCreate}>
        <Plus className='h-4 w-4' />
        {t('Add User')}
      </Button>
      <Button
        size='sm'
        variant='destructive'
        onClick={handlePreviewCleanup}
        disabled={isLoading}
      >
        <Trash2 className='h-4 w-4' />
        {t('Cleanup Inactive Users')}
      </Button>

      <ConfirmDialog
        destructive
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        handleConfirm={handleCleanupConfirm}
        isLoading={isLoading}
        disabled={previewCount === 0}
        className='max-w-md'
        title={t('Cleanup inactive users?')}
        desc={t(
          'Found {{count}} inactive user(s) with no balance, inactive for over 30 days. This will permanently delete them and cannot be undone.',
          { count: previewCount }
        )}
        confirmText={t('Delete')}
      />
    </div>
  )
}
