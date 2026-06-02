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
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  getAdminCursorProProduct,
  updateAdminCursorProProduct,
} from '@/features/digital-shop/api'

const CURSOR_PRO_PRODUCT_QUERY_KEY = ['digital-shop-admin-cursor-pro']

export function CursorProShopSettingsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [priceAmount, setPriceAmount] = useState(85)
  const [enabled, setEnabled] = useState(true)

  const { data, isLoading, isError } = useQuery({
    queryKey: CURSOR_PRO_PRODUCT_QUERY_KEY,
    queryFn: async () => {
      const res = await getAdminCursorProProduct()
      if (!res.success || !res.data) {
        throw new Error('load failed')
      }
      return res.data
    },
  })

  useEffect(() => {
    if (!data) return
    setPriceAmount(data.price_amount)
    setEnabled(data.enabled)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAdminCursorProProduct({
        price_amount: priceAmount,
        enabled,
      }),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Save failed'))
        return
      }
      toast.success(t('Saved successfully'))
      queryClient.setQueryData(CURSOR_PRO_PRODUCT_QUERY_KEY, res.data)
      queryClient.invalidateQueries({ queryKey: ['digital-shop-public'] })
    },
    onError: () => {
      toast.error(t('Save failed'))
    },
  })

  const handleSave = () => {
    if (priceAmount < 0.01) {
      toast.error(t('Price must be greater than 0'))
      return
    }
    saveMutation.mutate()
  }

  return (
    <div className='space-y-4'>
      <div>
        <h3 className='text-lg font-medium'>{t('Cursor Pro Shop')}</h3>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Configure Cursor Pro digital product price and storefront visibility'
          )}
        </p>
      </div>

      {isLoading ? (
        <p className='text-muted-foreground text-sm'>{t('Loading...')}</p>
      ) : isError ? (
        <p className='text-destructive text-sm'>
          {t('Failed to load Cursor Pro settings')}
        </p>
      ) : (
        <>
          <div className='grid gap-6 md:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='cursor-pro-price'>
                {t('Cursor Pro price (CNY)')}
              </Label>
              <Input
                id='cursor-pro-price'
                type='number'
                step='0.01'
                min={0.01}
                value={priceAmount}
                onChange={(e) =>
                  setPriceAmount(
                    Number.isFinite(e.target.valueAsNumber)
                      ? e.target.valueAsNumber
                      : 0
                  )
                }
              />
              <p className='text-muted-foreground text-sm'>
                {t(
                  'Default is ¥85. Shown on /shop/cursor and used at guest checkout.'
                )}
              </p>
            </div>

            <div className='flex flex-row items-center justify-between rounded-lg border p-4'>
              <div className='space-y-0.5'>
                <Label className='text-base'>{t('Product listing')}</Label>
                <p className='text-muted-foreground text-sm'>
                  {t('When disabled, Cursor Pro is hidden from the digital shop')}
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>

          <Button
            type='button'
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending
              ? t('Saving...')
              : t('Save Cursor Pro settings')}
          </Button>
        </>
      )}
    </div>
  )
}
