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
import { type FormEvent, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  getSystemOptions,
  updateSystemOption,
} from '@/features/system-settings/api'
import type { SystemOption } from '@/features/system-settings/types'

type EditGroupDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string | null
}

function parseOptionMap<T>(
  options: SystemOption[],
  key: string
): Record<string, T> {
  const value = options.find((option) => option.key === key)?.value
  if (!value) return {}

  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, T>
    }
  } catch {
    return {}
  }

  return {}
}

export function EditGroupDialog({
  open,
  onOpenChange,
  groupName,
}: EditGroupDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [ratio, setRatio] = useState('1')
  const [selectable, setSelectable] = useState(false)
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !groupName) return
    setError('')

    let cancelled = false
    getSystemOptions().then((response) => {
      if (cancelled) return
      if (!response.success) {
        setError(response.message || t('Failed to update setting'))
        return
      }
      const options = response.data || []
      const groupRatios = parseOptionMap<number>(options, 'GroupRatio')
      const userUsableGroups = parseOptionMap<string>(
        options,
        'UserUsableGroups'
      )
      setRatio(String(groupRatios[groupName] ?? 1))
      const isSelectable = Object.prototype.hasOwnProperty.call(
        userUsableGroups,
        groupName
      )
      setSelectable(isSelectable)
      setDescription(isSelectable ? userUsableGroups[groupName] || '' : '')
    })

    return () => {
      cancelled = true
    }
  }, [open, groupName, t])

  const updateGroup = useMutation({
    mutationFn: async () => {
      if (!groupName) throw new Error(t('Required'))

      const optionsResponse = await getSystemOptions()
      if (!optionsResponse.success) {
        throw new Error(
          optionsResponse.message || t('Failed to update setting')
        )
      }

      const options = optionsResponse.data || []
      const groupRatios = parseOptionMap<number>(options, 'GroupRatio')
      const userUsableGroups = parseOptionMap<string>(
        options,
        'UserUsableGroups'
      )
      const originalUserUsableGroups =
        options.find((option) => option.key === 'UserUsableGroups')?.value ||
        '{}'

      const normalizedRatio = Number(ratio)
      if (!Number.isFinite(normalizedRatio) || normalizedRatio < 0) {
        throw new Error(t('Ratio must be a non-negative number.'))
      }

      if (selectable) {
        userUsableGroups[groupName] = description.trim()
        const usableResponse = await updateSystemOption({
          key: 'UserUsableGroups',
          value: JSON.stringify(userUsableGroups),
        })
        if (!usableResponse.success) {
          throw new Error(
            usableResponse.message || t('Failed to update setting')
          )
        }
      } else if (
        Object.prototype.hasOwnProperty.call(userUsableGroups, groupName)
      ) {
        delete userUsableGroups[groupName]
        const usableResponse = await updateSystemOption({
          key: 'UserUsableGroups',
          value: JSON.stringify(userUsableGroups),
        })
        if (!usableResponse.success) {
          throw new Error(
            usableResponse.message || t('Failed to update setting')
          )
        }
      }

      try {
        groupRatios[groupName] = normalizedRatio
        const ratioResponse = await updateSystemOption({
          key: 'GroupRatio',
          value: JSON.stringify(groupRatios),
        })
        if (!ratioResponse.success) {
          throw new Error(
            ratioResponse.message || t('Failed to update setting')
          )
        }
      } catch (ratioError) {
        if (
          selectable ||
          Object.prototype.hasOwnProperty.call(
            parseOptionMap(options, 'UserUsableGroups'),
            groupName
          )
        ) {
          try {
            await updateSystemOption({
              key: 'UserUsableGroups',
              value: originalUserUsableGroups,
            })
          } catch {
            // Keep the original error when rollback also fails.
          }
        }
        throw ratioError
      }

      return groupName
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['system-options'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
      ])
      toast.success(t('Setting updated successfully'))
      onOpenChange(false)
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || t('Failed to update setting'))
    },
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedRatio = Number(ratio)

    if (!groupName) {
      setError(t('Required'))
      return
    }

    if (!ratio.trim() || !Number.isFinite(normalizedRatio)) {
      setError(t('Required'))
      return
    }

    if (normalizedRatio < 0) {
      setError(t('Ratio must be a non-negative number.'))
      return
    }

    setError('')
    updateGroup.mutate()
  }

  const isPending = updateGroup.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) onOpenChange(nextOpen)
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {t('Edit group')} — {groupName}
            </DialogTitle>
            <DialogDescription>
              {t('Configure the ratio for this group.')}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className='py-4'>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor='edit-channel-group-ratio'>
                {t('Ratio')}
              </FieldLabel>
              <Input
                id='edit-channel-group-ratio'
                type='number'
                min={0}
                step='any'
                value={ratio}
                onChange={(event) => setRatio(event.target.value)}
                aria-invalid={Boolean(error)}
                disabled={isPending}
                autoFocus
              />
            </Field>

            <Field orientation='horizontal'>
              <Checkbox
                id='edit-channel-group-selectable'
                checked={selectable}
                onCheckedChange={(checked) => setSelectable(checked === true)}
                disabled={isPending}
              />
              <FieldContent>
                <FieldLabel htmlFor='edit-channel-group-selectable'>
                  {t('User selectable')}
                </FieldLabel>
                <FieldDescription>
                  {t(
                    'When enabled, users can pick this group when creating tokens.'
                  )}
                </FieldDescription>
              </FieldContent>
            </Field>

            {selectable && (
              <Field>
                <FieldLabel htmlFor='edit-channel-group-description'>
                  {t('Group description')}
                </FieldLabel>
                <Input
                  id='edit-channel-group-description'
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t('Optional notes about when to use this group')}
                  disabled={isPending}
                />
              </Field>
            )}

            <FieldError>{error}</FieldError>
          </FieldGroup>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={isPending}>
              {isPending && <Spinner data-icon='inline-start' />}
              {t('Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
