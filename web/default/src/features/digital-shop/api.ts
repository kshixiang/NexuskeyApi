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
import { api } from '@/lib/api'
import type {
  CreateDigitalOrderRequest,
  CreateDigitalOrderResponse,
  DigitalOrderStatus,
  DigitalOrdersListResponse,
  DigitalProduct,
  DigitalShopPublicData,
} from './types'

export async function getDigitalShopPublic(): Promise<{
  success: boolean
  data: DigitalShopPublicData
}> {
  const res = await api.get('/api/digital-shop/public')
  return res.data
}

export async function createDigitalShopOrder(
  payload: CreateDigitalOrderRequest
): Promise<CreateDigitalOrderResponse> {
  const res = await api.post('/api/digital-shop/orders', payload)
  return res.data
}

export async function getDigitalOrderStatus(
  tradeNo: string
): Promise<{ success: boolean; data: DigitalOrderStatus }> {
  const res = await api.get(
    `/api/digital-shop/orders/${encodeURIComponent(tradeNo)}/status`
  )
  return res.data
}

export async function getAdminDigitalOrders(params: {
  p?: number
  page_size?: number
  status?: string
}): Promise<{ success: boolean; data: DigitalOrdersListResponse }> {
  const search = new URLSearchParams()
  if (params.p) search.set('p', String(params.p))
  if (params.page_size) search.set('page_size', String(params.page_size))
  if (params.status) search.set('status', params.status)
  const res = await api.get(`/api/digital-shop/admin/orders?${search}`)
  return res.data
}

export async function deliverDigitalOrder(
  orderId: number,
  note: string
): Promise<{ success: boolean }> {
  const res = await api.post(`/api/digital-shop/admin/orders/${orderId}/deliver`, {
    note,
  })
  return res.data
}

export async function getAdminCursorProProduct(): Promise<{
  success: boolean
  message?: string
  data: DigitalProduct
}> {
  const res = await api.get('/api/digital-shop/admin/products/cursor-pro')
  return res.data
}

export async function updateAdminCursorProProduct(payload: {
  price_amount: number
  enabled: boolean
}): Promise<{
  success: boolean
  message?: string
  data: DigitalProduct
}> {
  const res = await api.put(
    '/api/digital-shop/admin/products/cursor-pro',
    payload
  )
  return res.data
}
