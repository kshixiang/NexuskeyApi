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
import { useQuery } from '@tanstack/react-query'
import { Check, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PublicLayout } from '@/components/layout'
import { getDigitalShopPublic, getDigitalOrderStatus } from './api'
import { DigitalPurchaseDialog } from './components/purchase-dialog'

export interface DigitalShopSearch {
  pay?: string
  trade_no?: string
}

function parseFeatures(featureLines: string): string[] {
  return featureLines
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function DigitalShopCursorPage({
  search,
}: {
  search: DigitalShopSearch
}) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTradeNo, setActiveTradeNo] = useState(search.trade_no || '')

  const { data, isLoading, error } = useQuery({
    queryKey: ['digital-shop-public'],
    queryFn: getDigitalShopPublic,
  })

  const orderQuery = useQuery({
    queryKey: ['digital-order-status', activeTradeNo],
    queryFn: () => getDigitalOrderStatus(activeTradeNo),
    enabled: !!activeTradeNo,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status
      if (status === 'pending') return 3000
      return false
    },
  })

  const shop = data?.data
  const product = useMemo(
    () =>
      shop?.products?.find((p) => p.slug === 'cursor-pro') ||
      shop?.products?.[0] ||
      null,
    [shop?.products]
  )
  const features = product ? parseFeatures(product.feature_lines) : []

  const payBanner = useMemo(() => {
    if (!search.pay) return null
    if (search.pay === 'success') {
      return {
        variant: 'default' as const,
        title: t('Payment successful'),
        description: t(
          'We received your payment. Account credentials will be sent to your contact soon.'
        ),
      }
    }
    if (search.pay === 'pending') {
      return {
        variant: 'default' as const,
        title: t('Payment processing'),
        description: t('Your payment is being confirmed. This page will update automatically.'),
      }
    }
    return {
      variant: 'destructive' as const,
      title: t('Payment failed'),
      description: t('Payment was not completed. You can try again.'),
    }
  }, [search.pay, t])

  const orderStatus = orderQuery.data?.data?.status

  return (
    <PublicLayout>
      <div className='mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6'>
        <div className='space-y-2 text-center'>
          <Badge variant='secondary' className='mx-auto'>
            <Sparkles className='mr-1 h-3.5 w-3.5' />
            {t('Digital Shop')}
          </Badge>
          <h1 className='text-3xl font-bold tracking-tight sm:text-4xl'>
            {t('Buy Cursor Pro')}
          </h1>
          <p className='text-muted-foreground mx-auto max-w-2xl text-sm sm:text-base'>
            {t(
              'Guest checkout — no account required. Pay online and receive your Cursor Pro account by email or SMS.'
            )}
          </p>
        </div>

        {payBanner ? (
          <Alert variant={payBanner.variant}>
            <AlertTitle>{payBanner.title}</AlertTitle>
            <AlertDescription>{payBanner.description}</AlertDescription>
          </Alert>
        ) : null}

        {activeTradeNo && orderStatus ? (
          <Alert>
            <AlertTitle>{t('Order {{tradeNo}}', { tradeNo: activeTradeNo })}</AlertTitle>
            <AlertDescription>
              {orderStatus === 'paid' || orderStatus === 'delivered'
                ? t('Paid — awaiting or completed delivery')
                : orderStatus === 'pending'
                  ? t('Awaiting payment confirmation')
                  : t('Status: {{status}}', { status: orderStatus })}
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <Skeleton className='h-80 w-full rounded-xl' />
        ) : error || !product ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('Unable to load products')}</AlertTitle>
            <AlertDescription>
              {t('Please try again later or contact support.')}
            </AlertDescription>
          </Alert>
        ) : (
          <Card className='overflow-hidden border-2'>
            <CardHeader className='bg-muted/40 pb-4'>
              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div className='space-y-1'>
                  <CardTitle className='text-2xl'>{product.title}</CardTitle>
                  {product.subtitle ? (
                    <p className='text-muted-foreground text-sm'>
                      {product.subtitle}
                    </p>
                  ) : null}
                </div>
                <div className='text-right'>
                  <div className='text-3xl font-bold'>
                    ¥{Number(product.price_amount).toFixed(2)}
                  </div>
                  <p className='text-muted-foreground text-xs'>
                    {product.currency || 'CNY'}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className='space-y-6 pt-6'>
              {product.description ? (
                <p className='text-muted-foreground text-sm leading-relaxed'>
                  {product.description}
                </p>
              ) : null}

              {features.length > 0 ? (
                <ul className='space-y-2'>
                  {features.map((feature) => (
                    <li key={feature} className='flex items-start gap-2 text-sm'>
                      <Check className='text-primary mt-0.5 h-4 w-4 shrink-0' />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {!shop?.enable_online_topup ? (
                <Alert>
                  <AlertDescription>
                    {t(
                      'Online payment is not enabled. Please contact the administrator.'
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Button
                  size='lg'
                  className='w-full sm:w-auto'
                  onClick={() => setDialogOpen(true)}
                >
                  {t('Buy now')}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <DigitalPurchaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={product}
        payMethods={shop?.pay_methods || []}
        onOrderCreated={(tradeNo) => setActiveTradeNo(tradeNo)}
      />
    </PublicLayout>
  )
}
