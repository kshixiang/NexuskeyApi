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

export const CC_SWITCH_USAGE_SCRIPT = `({
  request: {
    url: "{{baseUrl}}/v1/usage",
    method: "GET",
    headers: { "Authorization": "Bearer {{apiKey}}" }
  },
  extractor: function(response) {
    const remaining = response?.remaining ?? response?.quota?.remaining ?? response?.balance;
    const unit = response?.unit ?? response?.quota?.unit ?? "USD";
    return {
      isValid: response?.is_active ?? response?.isValid ?? true,
      remaining,
      unit
    };
  }
})`

export interface CCSwitchImportInput {
  app: string
  name: string
  endpoint: string
  homepage: string
  apiKey: string
  models: Record<string, string>
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return window.btoa(binary)
}

export function resolveAbsoluteHttpURL(value: string): string {
  const fallback = window.location.origin
  try {
    const rawValue = value.trim()
    const bareHostPattern =
      /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\]|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?(?:[/?#].*)?$/i
    const candidate = bareHostPattern.test(rawValue)
      ? `${window.location.protocol}//${rawValue}`
      : rawValue || fallback
    const url = new URL(candidate, fallback)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback
    return url.toString().replace(/\/+$/, '')
  } catch {
    return fallback
  }
}

export function withV1Endpoint(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  return normalizedBaseUrl.endsWith('/v1')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/v1`
}

export function buildCCSwitchImportURL(input: CCSwitchImportInput): string {
  const endpoint = resolveAbsoluteHttpURL(input.endpoint)
  const homepage = resolveAbsoluteHttpURL(input.homepage)
  const entries: [string, string][] = [
    ['resource', 'provider'],
    ['app', input.app],
    ['name', input.name],
    ['endpoint', endpoint],
    ['apiKey', input.apiKey],
  ]

  for (const [key, value] of Object.entries(input.models)) {
    if (value) entries.push([key, value])
  }

  entries.push(
    ['homepage', homepage],
    ['configFormat', 'json'],
    ['usageEnabled', 'true'],
    ['usageScript', encodeBase64(CC_SWITCH_USAGE_SCRIPT)],
    ['usageAutoInterval', '30']
  )

  return `ccswitch://v1/import?${new URLSearchParams(entries).toString()}`
}
