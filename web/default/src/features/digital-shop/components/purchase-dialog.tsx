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
import { ShoppingBag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { submitPaymentForm } from '@/features/wallet/lib/payment'
import { createDigitalShopOrder } from '../api'
import type { DigitalProduct, PayMethod } from '../types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: DigitalProduct | null
  payMethods: PayMethod[]
  onOrderCreated?: (tradeNo: string) => void
}

export function DigitalPurchaseDialog({
  open,
  onOpenChange,
  product,
  payMethods,
  onOrderCreated,
}: Props) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (open && payMethods.length > 0) {
      setPaymentMethod(payMethods[0].type)
    } else if (!open) {
      setEmail('')
      setPhone('')
      setPaymentMethod('')
    }
  }, [open, payMethods])

  if (!product) return null

  const price = Number(product.price_amount || 0).toFixed(2)

  const handlePay = async () => {
    if (!email.trim() && !phone.trim()) {
      toast.error(t('Please provide an email or phone number'))
      return
    }
    if (!paymentMethod) {
      toast.error(t('Please select a payment method'))
      return
    }

    setPaying(true)
    try {
      const res = await createDigitalShopOrder({
        product_slug: product.slug,
        contact_email: email.trim(),
        contact_phone: phone.trim(),
        payment_method: paymentMethod,
      })
      if (res.message === 'success' && res.url) {
        submitPaymentForm(res.url, res.data || {})
        toast.success(t('Payment initiated'))
        onOrderCreated?.(res.trade_no)
        onOpenChange(false)
      } else {
        toast.error(
          res.message && res.message !== 'success'
            ? res.message
            : t('Payment request failed')
        )
      }
    } catch {
      toast.error(t('Payment request failed'))
    } finally {
      setPaying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <ShoppingBag className='h-5 w-5' />
            {t('Purchase {{product}}', { product: product.title })}
          </DialogTitle>
        </DialogHeader>

        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            {t(
              'After payment, we will send account credentials to your contact within 24 hours.'
            )}
          </p>

          <div className='space-y-2'>
            <Label htmlFor='digital-shop-email'>{t('Email')}</Label>
            <Input
              id='digital-shop-email'
              type='email'
              placeholder='you@example.com'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete='email'
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='digital-shop-phone'>{t('Phone')}</Label>
            <Input
              id='digital-shop-phone'
              type='tel'
              placeholder='13800138000'
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete='tel'
            />
          </div>

          <p className='text-muted-foreground text-xs'>
            {t('Provide at least one contact method for delivery.')}
          </p>

          {payMethods.length > 0 ? (
            <div className='space-y-2'>
              <Label>{t('Payment method')}</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder={t('Select payment method')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {payMethods.map((method) => (
                      <SelectItem key={method.type} value={method.type}>
                        {method.name || method.type}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className='flex items-center justify-between rounded-lg border p-3'>
            <span className='text-sm font-medium'>{t('Total')}</span>
            <span className='text-lg font-semibold'>
              ¥{price}
            </span>
          </div>

          <Button
            className='w-full'
            size='lg'
            disabled={paying || payMethods.length === 0}
            onClick={handlePay}
          >
            {paying ? t('Processing...') : t('Pay now')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
