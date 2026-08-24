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

type AddGroupDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingGroups: string[]
  onCreated: (group: string) => void
}

type NewGroup = {
  name: string
  ratio: number
  selectable: boolean
  description: string
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

export function AddGroupDialog({
  open,
  onOpenChange,
  existingGroups,
  onCreated,
}: AddGroupDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [ratio, setRatio] = useState('1')
  const [selectable, setSelectable] = useState(true)
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName('')
    setRatio('1')
    setSelectable(true)
    setDescription('')
    setError('')
  }, [open])

  const createGroup = useMutation({
    mutationFn: async (group: NewGroup) => {
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

      if (
        Object.prototype.hasOwnProperty.call(groupRatios, group.name) ||
        Object.prototype.hasOwnProperty.call(userUsableGroups, group.name)
      ) {
        throw new Error(
          t('Duplicate group names: {{names}}', { names: group.name })
        )
      }

      const originalUserUsableGroups =
        options.find((option) => option.key === 'UserUsableGroups')?.value ||
        '{}'

      if (group.selectable) {
        userUsableGroups[group.name] = group.description
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
        groupRatios[group.name] = group.ratio
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
        if (group.selectable) {
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

      return group.name
    },
    onSuccess: async (group) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['system-options'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
      ])
      toast.success(t('Setting updated successfully'))
      onCreated(group)
      onOpenChange(false)
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || t('Failed to update setting'))
    },
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedName = name.trim()
    const normalizedRatio = Number(ratio)

    if (!normalizedName || !ratio.trim() || !Number.isFinite(normalizedRatio)) {
      setError(t('Required'))
      return
    }

    if (normalizedName.includes(',')) {
      setError(t('Group name cannot contain commas.'))
      return
    }

    if (normalizedRatio < 0) {
      setError(t('Ratio must be a non-negative number.'))
      return
    }

    if (existingGroups.includes(normalizedName)) {
      setError(t('Duplicate group names: {{names}}', { names: normalizedName }))
      return
    }

    setError('')
    createGroup.mutate({
      name: normalizedName,
      ratio: normalizedRatio,
      selectable,
      description: description.trim(),
    })
  }

  const isPending = createGroup.isPending

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
            <DialogTitle>{t('Add group')}</DialogTitle>
            <DialogDescription>
              {t('Configure the ratio for this group.')}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className='py-4'>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor='new-channel-group-name'>
                {t('Group name')}
              </FieldLabel>
              <Input
                id='new-channel-group-name'
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('default')}
                aria-invalid={Boolean(error)}
                disabled={isPending}
                autoFocus
              />
            </Field>

            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor='new-channel-group-ratio'>
                {t('Ratio')}
              </FieldLabel>
              <Input
                id='new-channel-group-ratio'
                type='number'
                min={0}
                step='any'
                value={ratio}
                onChange={(event) => setRatio(event.target.value)}
                aria-invalid={Boolean(error)}
                disabled={isPending}
              />
            </Field>

            <Field orientation='horizontal'>
              <Checkbox
                id='new-channel-group-selectable'
                checked={selectable}
                onCheckedChange={(checked) => setSelectable(checked === true)}
                disabled={isPending}
              />
              <FieldContent>
                <FieldLabel htmlFor='new-channel-group-selectable'>
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
                <FieldLabel htmlFor='new-channel-group-description'>
                  {t('Group description')}
                </FieldLabel>
                <Input
                  id='new-channel-group-description'
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
              {t('Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
