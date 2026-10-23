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

export type ChannelStatusWindowKey = '90m' | '24h' | '7d' | '30d'

export interface ChannelStatusHistoryPoint {
  created_at: number
  success: boolean
  response_time_ms: number
}

export interface ChannelStatusAggregated {
  channel_id: number
  total_count: number
  success_count: number
  availability: number
  avg_response_ms: number
  avg_first_token_ms: number
  cache_rate: number
}

export interface ChannelStatusCard {
  channel_id: number
  channel_name: string
  channel_type: number
  status: number
  test_model: string
  aggregated: ChannelStatusAggregated
  history: ChannelStatusHistoryPoint[]
}

export interface ChannelStatusResponse {
  success: boolean
  message?: string
  data?: {
    window: ChannelStatusWindowKey
    cards: ChannelStatusCard[]
  }
}

export async function getChannelStatus(
  window: ChannelStatusWindowKey,
  historyLimit = 30
): Promise<ChannelStatusResponse> {
  const res = await api.get('/api/channel/status', {
    params: { window, history_limit: historyLimit },
  })
  return res.data
}
