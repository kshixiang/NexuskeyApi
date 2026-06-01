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
export interface DigitalProduct {
  id: number
  slug: string
  title: string
  subtitle: string
  description: string
  price_amount: number
  currency: string
  enabled: boolean
  sort: number
  feature_lines: string
}

export interface PayMethod {
  type: string
  name?: string
  color?: string
}

export interface DigitalShopPublicData {
  products: DigitalProduct[]
  enable_online_topup: boolean
  pay_methods: PayMethod[]
  server_address: string
}

export interface CreateDigitalOrderRequest {
  product_slug: string
  contact_email?: string
  contact_phone?: string
  payment_method: string
}

export interface CreateDigitalOrderResponse {
  message: string
  data: Record<string, unknown>
  url: string
  trade_no: string
}

export interface DigitalOrderStatus {
  trade_no: string
  status: 'pending' | 'paid' | 'delivered' | 'failed' | 'expired'
  money: number
  contact_email: string
  contact_phone: string
  create_time: number
  complete_time: number
  delivered_at: number
  product_title?: string
}

export interface DigitalProductOrder {
  id: number
  product_id: number
  trade_no: string
  contact_email: string
  contact_phone: string
  money: number
  payment_method: string
  payment_provider: string
  status: DigitalOrderStatus['status']
  create_time: number
  complete_time: number
  deliver_note: string
  delivered_at: number
  delivered_by: number
  product?: DigitalProduct
}

export interface DigitalOrdersListResponse {
  items: DigitalProductOrder[]
  total: number
  page: number
  size: number
}
