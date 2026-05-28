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

export const CHANNEL_CONN_CLIPBOARD_TYPE = 'newapi_channel_conn'

export type ParsedChannelConnection = {
  key: string
  url: string
}

export function encodeChannelConnectionString(key: string, url: string): string {
  return JSON.stringify({
    _type: CHANNEL_CONN_CLIPBOARD_TYPE,
    key,
    url,
  })
}

export function parseChannelConnectionString(
  text: string
): ParsedChannelConnection | null {
  if (!text || typeof text !== 'string') return null
  try {
    const parsed = JSON.parse(text.trim()) as {
      _type?: string
      key?: unknown
      url?: unknown
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed._type === CHANNEL_CONN_CLIPBOARD_TYPE &&
      typeof parsed.key === 'string' &&
      typeof parsed.url === 'string'
    ) {
      return { key: parsed.key, url: parsed.url }
    }
  } catch {
    // not valid JSON
  }
  return null
}
