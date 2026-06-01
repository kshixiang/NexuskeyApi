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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SectionPageLayout } from '@/components/layout'
import { deliverDigitalOrder, getAdminDigitalOrders } from '../api'
import type { DigitalProductOrder } from '../types'

function statusVariant(
  status: DigitalProductOrder['status']
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'paid':
      return 'default'
    case 'delivered':
      return 'secondary'
    case 'pending':
      return 'outline'
    default:
      return 'destructive'
  }
}

function formatTime(ts: number) {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleString()
}

export function DigitalOrdersAdmin() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('paid')
  const [page, setPage] = useState(1)
  const [deliverTarget, setDeliverTarget] = useState<DigitalProductOrder | null>(
    null
  )
  const [deliverNote, setDeliverNote] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-digital-orders', page, statusFilter],
    queryFn: () =>
      getAdminDigitalOrders({
        p: page,
        page_size: 20,
        status: statusFilter === 'all' ? undefined : statusFilter,
      }),
  })

  const deliverMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      deliverDigitalOrder(id, note),
    onSuccess: () => {
      toast.success(t('Marked as delivered'))
      setDeliverTarget(null)
      setDeliverNote('')
      void queryClient.invalidateQueries({ queryKey: ['admin-digital-orders'] })
    },
    onError: () => {
      toast.error(t('Failed to update order'))
    },
  })

  const items = data?.data?.items || []
  const total = data?.data?.total || 0
  const pageSize = data?.data?.size || 20
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Digital Product Orders')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('Review paid orders and mark them delivered after sending account credentials.')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Actions>
        <Select value={statusFilter} onValueChange={(v) => {
          setStatusFilter(v)
          setPage(1)
        }}>
          <SelectTrigger className='w-[180px]'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='paid'>{t('Paid (awaiting delivery)')}</SelectItem>
            <SelectItem value='delivered'>{t('Delivered')}</SelectItem>
            <SelectItem value='pending'>{t('Pending payment')}</SelectItem>
            <SelectItem value='all'>{t('All statuses')}</SelectItem>
          </SelectContent>
        </Select>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Order')}</TableHead>
                <TableHead>{t('Product')}</TableHead>
                <TableHead>{t('Contact')}</TableHead>
                <TableHead>{t('Amount')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Paid at')}</TableHead>
                <TableHead className='text-right'>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className='text-muted-foreground py-8 text-center'>
                    {t('Loading...')}
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className='text-muted-foreground py-8 text-center'>
                    {t('No orders found')}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className='font-mono text-xs'>
                      {order.trade_no}
                    </TableCell>
                    <TableCell>{order.product?.title || order.product_id}</TableCell>
                    <TableCell className='text-sm'>
                      <div>{order.contact_email || '-'}</div>
                      <div className='text-muted-foreground'>
                        {order.contact_phone || '-'}
                      </div>
                    </TableCell>
                    <TableCell>¥{Number(order.money).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(order.status)}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-sm'>
                      {formatTime(order.complete_time)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {order.status === 'paid' ? (
                        <Button
                          size='sm'
                          onClick={() => {
                            setDeliverTarget(order)
                            setDeliverNote('')
                          }}
                        >
                          {t('Mark delivered')}
                        </Button>
                      ) : order.deliver_note ? (
                        <span className='text-muted-foreground text-xs'>
                          {order.deliver_note}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className='mt-4 flex items-center justify-between'>
          <p className='text-muted-foreground text-sm'>
            {t('{{total}} orders', { total })}
          </p>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('Previous')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        </div>
      </SectionPageLayout.Content>

      <Dialog
        open={!!deliverTarget}
        onOpenChange={(open) => !open && setDeliverTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Mark order as delivered')}</DialogTitle>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='deliver-note'>{t('Delivery note (optional)')}</Label>
            <Input
              id='deliver-note'
              value={deliverNote}
              onChange={(e) => setDeliverNote(e.target.value)}
              placeholder={t('e.g. Sent account via email')}
            />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDeliverTarget(null)}>
              {t('Cancel')}
            </Button>
            <Button
              disabled={deliverMutation.isPending}
              onClick={() => {
                if (!deliverTarget) return
                deliverMutation.mutate({
                  id: deliverTarget.id,
                  note: deliverNote,
                })
              }}
            >
              {t('Confirm delivery')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionPageLayout>
  )
}
