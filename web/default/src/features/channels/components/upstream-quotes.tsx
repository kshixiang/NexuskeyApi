import { useState, type FormEvent, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Download, FileUp, Layers, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

const endpoint = '/api/upstream-quotes'
const channelsKey = ['upstream-quote-channels']
const groupKey = (id: number) => ['upstream-quote-group', id]
const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 10,
})
const profitAmounts = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 10,
  signDisplay: 'exceptZero',
})
const selectClass =
  'border-input bg-background h-8 rounded-lg border px-2 text-sm'

type Group = {
  id: number
  channel_id: number
  original_name: string
  name: string
  sales_name: string
  key_hint: string
  base_url: string
  protocol: string
  multiplier: number
  upstream_multiplier?: number
  upstream_multipliers?: number[]
  final_multiplier?: number
  credit_cost: number
  revision: number
  active_version: number
  published: boolean
  published_multipliers?: number[]
}
type Channel = {
  id: number
  source: string
  name: string
  source_url: string
  imported_at: number
  groups: Group[] | null
}
type Tier = {
  name?: string
  limit?: number
  operator?: string
  window?: {
    timezone: string
    start_minute: number
    end_minute: number
    weekdays?: number[]
  }
  input?: number | null
  output?: number | null
  cache_read?: number
  cache_write?: number
  cache_write_1h?: number
}
type Quote = {
  model_id: string
  local_model?: string
  unit: string
  kind: string
  confirmed?: boolean
  usage_verified?: boolean
  endpoints?: string[] | null
  fixed_price?: number
  tiers?: Tier[]
  media?: { spec: string; meter: string; price?: number | null }[]
  reference?: unknown
}
type Preview = {
  quote: Quote
  upstream_multiplier?: number
  quote_version: number
  last_seen_import: number
  sale?: { expression: string; fixed: boolean; fixed_price: number }
  error?: string
}
type GroupDetail = Group & {
  quotes: Preview[] | null
  versions:
    | {
        id: number
        created_at: number
        multiplier: number
        final_multiplier?: number
      }[]
    | null
}
type Change = {
  model: string
  status: string
  previous?: Quote
  previous_multiplier?: number
  incoming?: Quote
  incoming_multiplier?: number
}
type ImportGroupPreview = {
  id: string
  name: string
  upstream_multiplier?: number
  changes: Change[]
}
type Comparison = {
  channel: string
  group: string
  cost: number
  sale: number
  margin?: number
  tier: string
  components?: Record<string, number>
  error?: string
  estimated: boolean
}
type Envelope<T> = { success: boolean; message: string; data: T }

async function request<T>(
  method: 'get' | 'post' | 'put',
  path: string,
  data?: unknown,
  options?: { skipBusinessError: boolean }
) {
  const config = {
    method,
    url: endpoint + path,
    data,
    ...options,
  }
  const response = await api.request<Envelope<T>>(config)
  if (!response.data.success) throw new Error(response.data.message)
  return response.data.data
}

export function UpstreamQuotes() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(0)
  const [importMode, setImportMode] = useState<Channel | 'new' | null>(null)
  const list = useQuery({
    queryKey: channelsKey,
    queryFn: () => request<Channel[]>('get', ''),
  })
  const channels = list.data ?? []
  const publishedGroups = channels.flatMap((channel) =>
    (channel.groups ?? [])
      .filter((item) => item.published)
      .map((item) => ({ channel, group: item }))
  )
  const active = channels.find((channel) =>
    channel.groups?.some((group) => group.id === selected)
  )
  const group = useQuery({
    queryKey: groupKey(selected),
    queryFn: () => request<GroupDetail>('get', '/groups/' + selected),
    enabled: selected > 0,
  })
  function selectGroup(id: number): void {
    setSelected(id)
    setImportMode(null)
  }
  return (
    <div className='space-y-6'>
      <div className='grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]'>
        <aside className='space-y-3 rounded-xl border p-3'>
          <Button
            className='w-full justify-start'
            onClick={() => setImportMode('new')}
          >
            <Plus /> {t('Import upstream quotes')}
          </Button>
          {list.isLoading && (
            <p className='text-muted-foreground px-2 text-sm'>
              {t('Loading...')}
            </p>
          )}
          {list.isError && (
            <p className='text-destructive px-2 text-sm'>
              {t('Unable to load upstream quotes')}
            </p>
          )}
          {list.isSuccess && (
            <Collapsible defaultOpen className='border-t pt-2'>
              <CollapsibleTrigger
                render={<Button type='button' variant='ghost' />}
                className='group w-full justify-start gap-2 px-2 text-left'
              >
                <span
                  className='size-2 shrink-0 rounded-full bg-emerald-500'
                  aria-hidden='true'
                />
                <span className='flex-1 font-semibold'>
                  {t('Published groups')}
                </span>
                <span className='text-muted-foreground font-mono text-xs'>
                  {publishedGroups.length}
                </span>
                <ChevronRight
                  aria-hidden='true'
                  className='transition-transform group-data-[panel-open]:rotate-90'
                />
              </CollapsibleTrigger>
              <CollapsibleContent className='flex flex-col gap-1 pt-1'>
                {publishedGroups.map((item) => (
                  <UpstreamGroupButton
                    key={item.group.id}
                    group={item.group}
                    channelId={item.channel.id}
                    showPublishedPrice
                    selected={selected === item.group.id && !importMode}
                    onSelect={selectGroup}
                  />
                ))}
                {publishedGroups.length === 0 && (
                  <p className='text-muted-foreground px-2 py-2 text-xs'>
                    {t('No published groups')}
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
          {channels.length > 0 && (
            <h2 className='px-2 pt-2 text-sm font-semibold'>{t('Channels')}</h2>
          )}
          {channels.map((channel) => (
            <Collapsible
              key={channel.id}
              defaultOpen
              className='space-y-1 border-t pt-2'
            >
              <CollapsibleTrigger
                render={<Button type='button' variant='ghost' />}
                className='group w-full justify-start gap-2 px-2 text-left'
                title={channel.name}
              >
                <Layers data-icon='inline-start' aria-hidden='true' />
                <span className='min-w-0 flex-1 truncate text-sm font-semibold'>
                  {channel.name}
                </span>
                <span className='text-muted-foreground font-mono text-xs'>
                  #{channel.id}
                </span>
                <ChevronRight
                  data-icon='inline-end'
                  aria-hidden='true'
                  className='transition-transform group-data-[panel-open]:rotate-90'
                />
              </CollapsibleTrigger>
              <CollapsibleContent className='flex flex-col gap-1'>
                {channel.groups?.map((item) => (
                  <UpstreamGroupButton
                    key={item.id}
                    group={item}
                    selected={selected === item.id && !importMode}
                    onSelect={selectGroup}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </aside>
        <section className='min-w-0 space-y-4'>
          {importMode ? (
            <ImportQuotes
              key={importMode === 'new' ? 'new' : importMode.id}
              channel={importMode === 'new' ? undefined : importMode}
              onClose={() => setImportMode(null)}
            />
          ) : active && group.data ? (
            <>
              <ChannelSettings
                key={active.id + active.name}
                channel={active}
                onImport={() => setImportMode(active)}
              />
              <GroupSettings
                key={group.data.id}
                group={group.data}
                importedAt={active.imported_at}
              />
            </>
          ) : (
            <p className='text-muted-foreground rounded-xl border p-6 text-sm'>
              {group.isError
                ? t('Unable to load upstream quotes')
                : group.isLoading && selected
                  ? t('Loading...')
                  : t('Select a channel group to configure and publish')}
            </p>
          )}
        </section>
      </div>
      <QuoteComparison />
    </div>
  )
}

function UpstreamGroupButton(props: {
  group: Group
  channelId?: number
  showPublishedPrice?: boolean
  selected: boolean
  onSelect: (id: number) => void
}) {
  const { t } = useTranslation()
  let multiplier = formatGroupUpstreamMultiplier(props.group)
  let multiplierTitle =
    t('Upstream multiplier') +
    ' · ' +
    formatUpstreamMultipliers(
      props.group.upstream_multiplier,
      props.group.upstream_multipliers ?? []
    )
  if (props.showPublishedPrice) {
    const rates = props.group.published_multipliers ?? []
    multiplier = formatMultiplierRange(rates)
    multiplierTitle =
      t('Final sales multiplier') +
      ' · ' +
      (rates.map(formatQuoteMultiplier).join(' / ') || '—')
  }
  return (
    <Button
      type='button'
      variant={props.selected ? 'secondary' : 'ghost'}
      className='h-auto min-h-8 w-full justify-start py-1.5'
      title={[
        props.channelId != null ? `#${props.channelId}` : '',
        props.group.name,
      ]
        .filter(Boolean)
        .join(' · ')}
      onClick={() => props.onSelect(props.group.id)}
    >
      <ChevronRight className='size-3 shrink-0' aria-hidden='true' />
      <span className='flex min-w-0 flex-1 flex-col text-left'>
        <span className='truncate'>{props.group.name}</span>
        {props.channelId != null && (
          <span className='text-muted-foreground truncate text-xs font-normal'>
            #{props.channelId}
          </span>
        )}
      </span>
      <span
        className='shrink-0 font-mono text-xs text-yellow-600 tabular-nums dark:text-yellow-400'
        title={multiplierTitle}
      >
        {multiplier}
      </span>
      {props.group.published && (
        <span
          className='ml-auto size-2 shrink-0 rounded-full bg-emerald-500'
          aria-hidden='true'
        />
      )}
    </Button>
  )
}

function ChannelSettings({
  channel,
  onImport,
}: {
  channel: Channel
  onImport: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [name, setName] = useState(channel.name)
  const rename = useMutation({
    mutationFn: () => request('put', '/channels/' + channel.id, { name }),
    onSuccess: () => client.invalidateQueries({ queryKey: channelsKey }),
  })
  return (
    <form
      className='flex flex-wrap items-end gap-2 rounded-xl border p-4'
      onSubmit={(event) => {
        event.preventDefault()
        rename.mutate()
      }}
    >
      <div className='min-w-40 flex-1 space-y-1'>
        <Label htmlFor='upstream-name'>
          {t('Channel Name')} #{channel.id}
        </Label>
        <Input
          id='upstream-name'
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <Button
        type='submit'
        variant='outline'
        disabled={rename.isPending || name === channel.name}
      >
        {t('Save')}
      </Button>
      <Button type='button' variant='outline' onClick={onImport}>
        {t('Reimport quotes')}
      </Button>
      <a
        className='text-primary self-center px-2 text-sm underline'
        href={channel.source_url}
        target='_blank'
        rel='noreferrer'
      >
        {t('Source')}
      </a>
    </form>
  )
}

const exampleSnapshot = {
  groups: [
    {
      source_id: 'example-group',
      name: 'Example group',
      quotes: [
        {
          model_id: 'example-model',
          kind: 'token',
          unit: 'usd',
          confirmed: false,
          usage_verified: false,
          endpoints: ['openai'],
          tiers: [
            { name: 'base', input: 0.05, output: 0.2, cache_read: 0.001 },
          ],
        },
      ],
    },
  ],
}

const changeLabels: Record<string, string> = {
  new: 'New',
  changed: 'Quote changed',
  unchanged: 'Unchanged',
  needs_confirmation: 'Needs confirmation',
  not_seen: 'Missing from this import',
}

function ImportQuotes({
  channel,
  onClose,
}: {
  channel?: Channel
  onClose: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [source, setSource] = useState(channel?.source ?? 'kedaya')
  const [snapshot, setSnapshot] = useState<{ raw: string; manual: boolean }>()
  const [prepared, setPrepared] = useState<{
    input: unknown
    groups: ImportGroupPreview[]
  }>()
  const [error, setError] = useState('')
  const load = useMutation({
    mutationFn: async (file: File | undefined) => {
      if (file) return file.text()
      const catalog = await request<unknown>('get', '/source/' + source)
      return JSON.stringify(catalog)
    },
    onMutate: () => setError(''),
    onSuccess: (raw) => updateSnapshot({ raw, manual: false }),
    onError: (cause) => setError(cause.message),
  })
  const preview = useMutation({
    mutationFn: async (raw: string) => {
      const snapshot = JSON.parse(raw)
      if (snapshot.source && snapshot.source !== source)
        throw new Error(t('Snapshot source does not match'))
      const input = {
        source,
        channel_id: channel?.id,
        ...(snapshot.data && typeof snapshot.code === 'number'
          ? { snapshot: raw }
          : { groups: snapshot.groups ?? snapshot }),
      }
      const groups = await request<ImportGroupPreview[]>(
        'post',
        '/import/preview',
        { ...input, grouped: true }
      )
      return { input, groups }
    },
    onSuccess: (data) => {
      setPrepared(data)
      setError('')
    },
    onError: (cause) => {
      setPrepared(undefined)
      setError(cause.message)
    },
  })
  const save = useMutation({
    mutationFn: () => request('post', '/import/save', prepared?.input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: channelsKey })
      await client.invalidateQueries({ queryKey: ['upstream-quote-group'] })
      onClose()
    },
  })
  const busy = load.isPending || preview.isPending || save.isPending
  const showEditor = snapshot?.manual && !prepared
  function updateSnapshot(value?: { raw: string; manual: boolean }) {
    setSnapshot(value)
    setPrepared(undefined)
    setError('')
  }
  return (
    <div className='space-y-3 rounded-xl border p-4'>
      <h2 className='font-semibold'>
        {channel ? t('Reimport quotes') : t('Import upstream quotes')}
      </h2>
      <div className='flex flex-wrap items-center gap-2'>
        <Label htmlFor='upstream-source'>{t('Source')}</Label>
        <select
          id='upstream-source'
          className={selectClass}
          value={source}
          disabled={!!channel || busy}
          onChange={(event) => {
            setSource(event.target.value)
            updateSnapshot()
          }}
        >
          <option value='kedaya'>Kedaya</option>
          <option value='string'>String AI</option>
          <option value='geek2api'>Geek2API</option>
        </select>
        <Button
          type='button'
          variant='outline'
          disabled={busy}
          onClick={() => load.mutate(undefined)}
        >
          <Download /> {t('Fetch latest quotes')}
        </Button>
        <label className='hover:bg-accent inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs'>
          <FileUp className='size-4' /> {t('Upload JSON')}
          <input
            type='file'
            accept='.json,application/json'
            className='sr-only'
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) load.mutate(file)
              event.currentTarget.value = ''
            }}
          />
        </label>
        <Button
          type='button'
          variant='ghost'
          aria-expanded={Boolean(showEditor)}
          disabled={busy || showEditor}
          onClick={() =>
            updateSnapshot({
              raw: snapshot?.manual ? snapshot.raw : '',
              manual: true,
            })
          }
        >
          {t('Paste JSON')}
        </Button>
        <Button
          type='button'
          variant='ghost'
          onClick={() =>
            updateSnapshot({
              raw: JSON.stringify(exampleSnapshot, null, 2),
              manual: true,
            })
          }
          disabled={busy}
        >
          <Download /> {t('Load JSON example')}
        </Button>
      </div>
      {showEditor && (
        <div className='flex flex-col gap-2'>
          <Label htmlFor='upstream-snapshot'>{t('Quote snapshot')}</Label>
          <Textarea
            id='upstream-snapshot'
            className='min-h-40 font-mono text-xs'
            value={snapshot.raw}
            autoFocus
            onChange={(event) =>
              updateSnapshot({ raw: event.target.value, manual: true })
            }
            disabled={busy}
          />
        </div>
      )}
      {load.isPending && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t('Loading...')}
        </p>
      )}
      {!load.isPending &&
        !error &&
        !showEditor &&
        !prepared &&
        snapshot?.raw.trim() && (
          <p role='status' className='text-muted-foreground text-sm'>
            {t('Quotes ready to preview')}
          </p>
        )}
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      {prepared && (
        <div className='max-h-72 overflow-auto rounded-lg border'>
          <table className='w-full text-left text-sm'>
            <thead className='bg-muted'>
              <tr>
                <th scope='col' className='p-2'>
                  {t('Group')}
                </th>
                <th scope='col' className='p-2 text-right'>
                  {t('Models')}
                </th>
                <th scope='col' className='p-2 text-right'>
                  {t('Upstream multiplier')}
                </th>
                <th scope='col' className='p-2 text-right'>
                  {t('Details')}
                </th>
              </tr>
            </thead>
            <tbody>
              {prepared.groups.map((group) => (
                <tr className='border-t' key={group.id}>
                  <th
                    scope='row'
                    className='p-2 font-medium [overflow-wrap:anywhere]'
                  >
                    {group.name}
                  </th>
                  <td className='p-2 text-right tabular-nums'>
                    {group.changes.length}
                  </td>
                  <td className='p-2 text-right tabular-nums'>
                    {formatUpstreamMultipliers(
                      group.upstream_multiplier,
                      group.changes.map((change) => change.incoming_multiplier)
                    )}
                  </td>
                  <td className='p-2 text-right'>
                    <GroupQuotesDialog name={group.name}>
                      <ImportQuoteChanges changes={group.changes} />
                    </GroupQuotesDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='outline'
          onClick={onClose}
          disabled={save.isPending}
        >
          {t('Cancel')}
        </Button>
        <Button
          type='button'
          variant='outline'
          disabled={!snapshot?.raw.trim() || busy}
          onClick={() => snapshot && preview.mutate(snapshot.raw)}
        >
          {t('Preview')}
        </Button>
        <Button
          type='button'
          disabled={!prepared || busy}
          onClick={() => save.mutate()}
        >
          {t('Save import')}
        </Button>
      </div>
    </div>
  )
}

function GroupQuotesDialog(props: {
  name: string
  actions?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Dialog>
      <DialogTrigger
        aria-label={t('Details') + ' · ' + props.name}
        render={<Button type='button' variant='outline' size='sm' />}
      >
        {t('Details')}
      </DialogTrigger>
      <DialogContent className='flex max-h-[85dvh] min-h-0 flex-col overflow-hidden sm:max-w-5xl'>
        <DialogHeader className='shrink-0 flex-row flex-wrap items-start justify-between pr-8'>
          <div className='min-w-0 space-y-2'>
            <DialogTitle>{t('Group model quotes')}</DialogTitle>
            <DialogDescription className='[overflow-wrap:anywhere]'>
              {props.name}
            </DialogDescription>
          </div>
          {props.actions}
        </DialogHeader>
        <div
          role='region'
          aria-label={t('Group model quotes')}
          tabIndex={0}
          className='min-h-0 overflow-auto overscroll-contain rounded-lg border'
        >
          {props.children}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ImportQuoteChanges({ changes }: { changes: Change[] }) {
  const { t } = useTranslation()
  return (
    <table className='w-full min-w-150 text-left text-sm'>
      <thead className='bg-muted sticky top-0'>
        <tr>
          <th scope='col' className='p-2'>
            {t('Model')}
          </th>
          <th scope='col' className='p-2'>
            {t('Status')}
          </th>
          <th scope='col' className='p-2'>
            {t('Previous quote')}
          </th>
          <th scope='col' className='p-2'>
            {t('Incoming quote')}
          </th>
        </tr>
      </thead>
      <tbody>
        {changes.map((change) => (
          <tr key={change.model} className='border-t align-top'>
            <th
              scope='row'
              className='max-w-48 p-2 font-mono text-xs font-medium [overflow-wrap:anywhere]'
            >
              {change.model}
            </th>
            <td className='p-2'>
              {t(changeLabels[change.status] ?? change.status)}
            </td>
            <td className='p-2'>
              <UpstreamQuoteRates
                quote={change.previous}
                multiplier={change.previous_multiplier}
              />
            </td>
            <td className='p-2'>
              <UpstreamQuoteRates
                quote={change.incoming}
                multiplier={change.incoming_multiplier}
              />
            </td>
          </tr>
        ))}
        {!changes.length && (
          <tr>
            <td colSpan={4} className='text-muted-foreground p-4'>
              {t('No models available for this group')}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

function formatQuoteMultiplier(value: number) {
  return (
    new Intl.NumberFormat(undefined, { maximumSignificantDigits: 12 }).format(
      value
    ) + '×'
  )
}

function formatGroupUpstreamMultiplier(group: Group): string {
  if (group.upstream_multiplier != null) {
    return formatQuoteMultiplier(group.upstream_multiplier)
  }
  return formatMultiplierRange(group.upstream_multipliers ?? [])
}

function formatMultiplierRange(rates: number[]): string {
  if (rates.length === 0) return '—'
  const min = Math.min(...rates)
  const max = Math.max(...rates)
  if (min === max) return formatQuoteMultiplier(min)
  return `${formatQuoteMultiplier(min)}–${formatQuoteMultiplier(max)}`
}

function formatUpstreamMultipliers(
  groupMultiplier: number | undefined,
  modelMultipliers: (number | undefined)[]
) {
  if (groupMultiplier != null) return formatQuoteMultiplier(groupMultiplier)
  const rates = [...new Set(modelMultipliers.filter((rate) => rate != null))]
  return (
    rates
      .sort((a, b) => a - b)
      .map(formatQuoteMultiplier)
      .join(' / ') || '—'
  )
}

function groupSaleMultiplier(group: GroupDetail) {
  return (
    group.final_multiplier ??
    Number(
      (group.multiplier * (group.upstream_multiplier ?? 1)).toPrecision(15)
    )
  )
}

function groupFormValues(group: GroupDetail) {
  return {
    name: group.name,
    sales: group.sales_name,
    key: '',
    base: group.base_url,
    protocol: group.protocol,
    mark: String(groupSaleMultiplier(group)),
    revision: group.revision,
  }
}

function UpstreamModelTestDialog({
  group,
  quotes,
}: {
  group: Group
  quotes: Preview[]
}) {
  const { t } = useTranslation()
  const [selectedModel, setSelectedModel] = useState('')
  const [search, setSearch] = useState('')
  const keyword = search.trim().toLowerCase()
  const matchingModels = quotes.filter(({ quote }) =>
    quote.model_id.toLowerCase().includes(keyword)
  )
  const model = matchingModels.some(
    ({ quote }) => quote.model_id === selectedModel
  )
    ? selectedModel
    : ''
  const configured = Boolean(group.key_hint && group.base_url)
  const test = useMutation({
    mutationFn: (model: string) =>
      request<{ elapsed_ms: number; error?: string }>(
        'post',
        `/groups/${group.id}/test`,
        { model },
        { skipBusinessError: true }
      ),
  })
  const result = test.variables === model ? test.data : undefined
  const error =
    test.variables === model
      ? (test.error?.message ?? result?.error)
      : undefined

  return (
    <Dialog>
      <DialogTrigger
        render={<Button type='button' variant='outline' size='sm' />}
      >
        {t('Test Model')}
      </DialogTrigger>
      <DialogContent className='max-h-[85dvh] overflow-y-auto sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Test Model')}</DialogTitle>
          <DialogDescription className='break-words'>
            {group.name} · {t("Uses the group's saved upstream settings.")}
          </DialogDescription>
        </DialogHeader>
        <div className='flex min-w-0 flex-col gap-4'>
          {quotes.length > 0 ? (
            <FieldGroup className='gap-2'>
              <Field>
                <FieldLabel htmlFor='upstream-test-search'>
                  {t('Select Model')}
                </FieldLabel>
                <Input
                  id='upstream-test-search'
                  type='search'
                  placeholder={t('Search models...')}
                  disabled={test.isPending}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </Field>
              {matchingModels.length > 0 ? (
                <RadioGroup
                  aria-label={t('Model')}
                  className='max-h-52 gap-0.5 overflow-y-auto rounded-lg border p-1'
                  disabled={test.isPending}
                  value={model}
                  onValueChange={(value: string) => {
                    setSelectedModel(value)
                    test.reset()
                  }}
                >
                  {matchingModels.map(({ quote }) => {
                    const id = `upstream-test-${group.id}-${encodeURIComponent(quote.model_id)}`
                    return (
                      <FieldLabel
                        key={quote.model_id}
                        htmlFor={id}
                        className='hover:bg-accent has-data-checked:bg-accent w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5'
                      >
                        <RadioGroupItem id={id} value={quote.model_id} />
                        <span className='min-w-0 [overflow-wrap:anywhere]'>
                          {quote.model_id}
                        </span>
                      </FieldLabel>
                    )
                  })}
                </RadioGroup>
              ) : (
                <p className='text-muted-foreground' role='status'>
                  {t('No models found')}
                </p>
              )}
            </FieldGroup>
          ) : (
            <p className='text-muted-foreground'>
              {t('No models available for this group')}
            </p>
          )}
          {!configured && (
            <p className='text-muted-foreground'>
              {t('Save the upstream API key and base URL before testing.')}
            </p>
          )}
          {(test.isPending || result || error) && (
            <div role='status' className='flex min-w-0 flex-col gap-1'>
              {test.isPending ? (
                <span>{t('Testing...')}</span>
              ) : (
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant={error ? 'destructive' : 'secondary'}>
                    {error ? t('Failed') : t('Success')}
                  </Badge>
                  {result && (
                    <span className='text-muted-foreground tabular-nums'>
                      {t('Response Time')} ·{' '}
                      {t('{{value}}ms', { value: result.elapsed_ms })}
                    </span>
                  )}
                </div>
              )}
              {error && (
                <p className='text-destructive [overflow-wrap:anywhere]'>
                  {t(error, { defaultValue: error })}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button type='button' variant='outline' />}>
              {t('Close')}
            </DialogClose>
            <Button
              type='button'
              disabled={!model || !configured || test.isPending}
              onClick={() => test.mutate(model)}
            >
              {t('Test Connection')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GroupSettings({
  group,
  importedAt,
}: {
  group: GroupDetail
  importedAt: number
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [form, setForm] = useState(() => groupFormValues(group))
  const [historic, setHistoric] = useState(0)
  const [confirmedRevision, setConfirmedRevision] = useState<number>()
  if (form.revision !== group.revision) {
    if (group.revision === confirmedRevision) {
      setForm({ ...form, revision: group.revision })
    } else {
      setForm(groupFormValues(group))
      setHistoric(0)
    }
    setConfirmedRevision(undefined)
  }
  const { name, sales, key, base, protocol, mark } = form
  const quotes = group.quotes ?? []
  const pendingQuoteCount = quotes.filter(
    ({ quote }) => !quote.confirmed || !quote.usage_verified
  ).length
  const finalMode =
    group.upstream_multiplier != null || group.final_multiplier != null
  const ratio = Number(mark)
  const markChanged = ratio !== groupSaleMultiplier(group)
  const finalMultiplier =
    finalMode && markChanged ? ratio : group.final_multiplier
  const draft = {
    name,
    sales_name: sales,
    api_key: key || undefined,
    base_url: base,
    protocol,
    multiplier: finalMode ? group.multiplier : ratio,
    final_multiplier: finalMultiplier,
    credit_cost: group.credit_cost,
    revision: group.revision,
  }
  const dirty =
    name !== group.name ||
    sales !== group.sales_name ||
    key !== '' ||
    base !== group.base_url ||
    protocol !== group.protocol ||
    markChanged
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: groupKey(group.id) }),
      client.invalidateQueries({ queryKey: channelsKey }),
      client.invalidateQueries({ queryKey: ['pricing'] }),
      client.invalidateQueries({ queryKey: ['user-groups'] }),
    ])
  }
  const save = useMutation({
    mutationFn: () => request('put', '/groups/' + group.id, draft),
    onSuccess: refresh,
    onError: (error) => {
      if ('response' in error) void refresh()
    },
  })
  const listing = useMutation({
    mutationFn: (publish: boolean) =>
      request('post', '/groups/' + group.id + '/listing', {
        revision: group.revision,
        publish,
        restore_version: historic || undefined,
      }),
    onSuccess: refresh,
    onError: (error) => {
      if ('response' in error) void refresh()
    },
  })
  const confirmAll = useMutation({
    mutationFn: (revision: number) =>
      request('post', '/groups/' + group.id + '/quotes/confirm', { revision }),
    onSuccess: async (_, revision) => {
      setConfirmedRevision(revision + 1)
      await refresh()
      toast.success(t('Saved successfully'))
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409) return refresh()
    },
  })
  const confirmationError = isAxiosError<Envelope<unknown>>(confirmAll.error)
    ? confirmAll.error.response?.data?.message || confirmAll.error.message
    : confirmAll.error?.message
  const costMultiplier = group.upstream_multiplier
  const latestQuoteImport = quotes.reduce(
    (latest, item) => Math.max(latest, item.last_seen_import),
    0
  )
  const upstreamMultipliers = formatUpstreamMultipliers(
    costMultiplier,
    quotes
      .filter((item) => item.last_seen_import === latestQuoteImport)
      .map((item) => item.upstream_multiplier)
  )
  const margin =
    ratio > 0 && (!finalMode || costMultiplier != null)
      ? ((1 - (costMultiplier ?? 1) / ratio) * 100).toFixed(2) + '%'
      : '—'
  const busy = save.isPending || listing.isPending || confirmAll.isPending
  const blockedQuote = quotes.find(
    (item) =>
      !item.sale &&
      item.quote.confirmed &&
      item.quote.usage_verified &&
      (item.quote.kind === 'token' || item.quote.kind === 'fixed')
  )
  const quoteError = blockedQuote?.error
  let publishBlocker: string | undefined
  if (dirty) {
    publishBlocker = t('Save group settings before publishing')
  } else if (!group.key_hint || !group.base_url) {
    publishBlocker = t(
      'Configure the upstream API key and base URL before publishing'
    )
  } else if (!historic) {
    if (blockedQuote && quoteError) {
      publishBlocker = `${blockedQuote.quote.model_id} · ${t(quoteError, { defaultValue: quoteError })}`
    } else if (blockedQuote || !quotes.some((item) => item.sale)) {
      publishBlocker = t(
        'No publishable models. Check the group quote details.'
      )
    }
  }
  const listingError = isAxiosError<Envelope<unknown>>(listing.error)
    ? listing.error.response?.data?.message || listing.error.message
    : listing.error?.message
  let state = 'Needs configuration'
  if (group.published) {
    state = 'Published'
  } else if (group.key_hint && group.base_url) {
    state = 'Ready to publish'
  }
  return (
    <div className='space-y-4 rounded-xl border p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h2 className='text-lg font-semibold'>{group.name}</h2>
          <p className='text-muted-foreground text-sm'>
            {t('Original group name')} · {group.original_name}
          </p>
        </div>
        <Badge variant='outline'>
          {t(state)}
          {group.active_version > 0 && ' · #' + group.active_version}
        </Badge>
      </div>
      <form
        id='upstream-group-form'
        className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <QuoteField
          label={t('Channel group name')}
          id='quote-group-name'
          value={name}
          onChange={(name) => setForm({ ...form, name })}
          required
        />
        <QuoteField
          label={t('Sales group name')}
          id='quote-sales-name'
          value={sales}
          onChange={(sales) => setForm({ ...form, sales })}
          required
        />
        <QuoteField
          label={t('Upstream API Key')}
          id='quote-key'
          value={key}
          onChange={(key) => setForm({ ...form, key })}
          type='password'
          placeholder={group.key_hint || undefined}
        />
        <QuoteField
          label={t('Upstream API base URL')}
          id='quote-base'
          value={base}
          onChange={(base) => setForm({ ...form, base })}
          type='url'
        />
        <div className='space-y-1'>
          <Label htmlFor='quote-protocol'>{t('API protocol')}</Label>
          <select
            id='quote-protocol'
            className={selectClass + ' w-full'}
            value={protocol}
            onChange={(event) =>
              setForm({ ...form, protocol: event.target.value })
            }
          >
            <option value='openai'>OpenAI</option>
            <option value='anthropic'>Anthropic</option>
          </select>
        </div>
        <div className='space-y-1'>
          <span className='text-sm font-medium'>
            {t('Upstream multiplier')}
          </span>
          <p className='flex min-h-8 items-center font-mono tabular-nums'>
            {upstreamMultipliers}
          </p>
        </div>
        <QuoteField
          label={
            finalMode ? t('Final sales multiplier') : t('Sales multiplier')
          }
          id='quote-markup'
          value={mark}
          onChange={(mark) => setForm({ ...form, mark })}
          type='number'
          min='0.000000001'
          required
        />
        {costMultiplier != null && (
          <div className='space-y-1'>
            <span className='text-sm font-medium'>
              {t('Multiplier spread')}
            </span>
            <p className='font-mono tabular-nums'>
              {ratio > 0 ? formatQuoteMultiplier(ratio - costMultiplier) : '—'}
            </p>
          </div>
        )}
        <div className='space-y-1'>
          <span className='text-muted-foreground text-xs'>
            {t('Estimated gross margin')}
          </span>
          <p className='font-mono text-sm'>{margin}</p>
        </div>
        <div className='flex items-end'>
          <Button disabled={!dirty || busy} type='submit'>
            {t('Save group settings')}
          </Button>
        </div>
      </form>
      <div className='flex flex-wrap items-center gap-3 rounded-lg border p-3'>
        <span className='flex-1 text-sm font-medium'>
          {t('Models in this group')} ({quotes.length})
        </span>
        <UpstreamModelTestDialog group={group} quotes={quotes} />
        <GroupQuotesDialog
          name={group.name}
          actions={
            <div className='flex flex-col items-start gap-2'>
              <Button
                type='button'
                size='sm'
                disabled={busy || pendingQuoteCount === 0}
                onClick={() => confirmAll.mutate(group.revision)}
              >
                {confirmAll.isPending ? t('Saving...') : t('Confirm all quotes')}
                {!confirmAll.isPending &&
                  pendingQuoteCount > 0 &&
                  ` (${pendingQuoteCount})`}
              </Button>
              {confirmationError && (
                <p className='text-destructive text-sm' role='alert'>
                  {t(confirmationError, { defaultValue: confirmationError })}
                </p>
              )}
            </div>
          }
        >
          <SavedGroupQuotes
            group={group}
            quotes={quotes}
            ratio={finalMode ? group.multiplier : ratio}
            finalMultiplier={finalMultiplier}
            credit={group.credit_cost}
            importedAt={importedAt}
            isConfirming={confirmAll.isPending}
            onSaved={refresh}
          />
        </GroupQuotesDialog>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        {!!group.versions?.length && (
          <select
            aria-label={t('Listing version')}
            className={selectClass}
            value={historic}
            onChange={(event) => setHistoric(Number(event.target.value))}
          >
            <option value={0}>{t('Latest draft')}</option>
            {group.versions.map((version) => (
              <option key={version.id} value={version.id}>
                #{version.id} ·{' '}
                {new Date(version.created_at * 1000).toLocaleString()} ·{' '}
                {formatQuoteMultiplier(
                  version.final_multiplier ?? version.multiplier
                )}
              </option>
            ))}
          </select>
        )}
        <Button
          disabled={busy || Boolean(publishBlocker)}
          aria-describedby={
            publishBlocker ? 'upstream-publish-blocker' : undefined
          }
          onClick={() => listing.mutate(true)}
        >
          {historic
            ? t('Publish historical version')
            : group.published
              ? t('Update published group')
              : t('Publish group')}
        </Button>
        {group.published && (
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => listing.mutate(false)}
          >
            {t('Unpublish group')}
          </Button>
        )}
      </div>
      {publishBlocker && (
        <p
          className='text-warning text-sm'
          id='upstream-publish-blocker'
          role='status'
        >
          {publishBlocker}
        </p>
      )}
      {listingError && (
        <p className='text-destructive text-sm' role='alert'>
          {t(listingError, { defaultValue: listingError })}
        </p>
      )}
    </div>
  )
}

function SavedGroupQuotes(props: {
  group: GroupDetail
  quotes: Preview[]
  ratio: number
  finalMultiplier?: number
  credit: number
  importedAt: number
  isConfirming: boolean
  onSaved: () => Promise<void>
}) {
  const { t } = useTranslation()
  return (
    <table className='w-full min-w-150 text-left text-sm'>
      <thead className='bg-muted sticky top-0'>
        <tr>
          <th scope='col' className='p-2'>
            {t('Model')}
          </th>
          <th scope='col' className='p-2'>
            {t('Upstream cost')}
          </th>
          <th scope='col' className='p-2'>
            {t('Sale price')}
          </th>
          <th scope='col' className='p-2'>
            {t('Status')}
          </th>
        </tr>
      </thead>
      <tbody>
        {props.quotes.map((item) => {
          const sourceMultiplier = item.upstream_multiplier
          const adjustment =
            props.finalMultiplier == null
              ? props.ratio
              : sourceMultiplier != null && sourceMultiplier > 0
                ? props.finalMultiplier / sourceMultiplier
                : 0
          const currencyFactor = item.quote.unit === 'credit' ? props.credit : 1
          return (
            <tr key={item.quote.model_id} className='border-t align-top'>
              <th
                scope='row'
                className='max-w-48 p-2 text-left text-xs font-medium [overflow-wrap:anywhere]'
              >
                <div className='font-mono'>
                  {item.quote.local_model || item.quote.model_id}
                </div>
                <span className='text-muted-foreground'>
                  #{item.quote_version}
                </span>
              </th>
              <td className='p-2'>
                <UpstreamQuoteRates
                  quote={item.quote}
                  multiplier={sourceMultiplier}
                />
              </td>
              <td className='p-2'>
                {adjustment > 0 &&
                  Number.isFinite(adjustment) &&
                  currencyFactor > 0 && (
                    <QuoteRates
                      quote={item.quote}
                      factor={adjustment * currencyFactor}
                      costFactor={currencyFactor}
                      usd
                    />
                  )}
              </td>
              <td className='space-y-1.5 p-2 text-xs'>
                <div className='flex flex-wrap gap-1'>
                  <Badge
                    variant={item.quote.confirmed ? 'secondary' : 'outline'}
                  >
                    {item.quote.confirmed
                      ? t('Upstream cost confirmed')
                      : t('Upstream cost pending confirmation')}
                  </Badge>
                  <Badge
                    variant={
                      item.quote.usage_verified ? 'secondary' : 'outline'
                    }
                  >
                    {item.quote.usage_verified
                      ? t('API usage verified')
                      : t('API usage pending verification')}
                  </Badge>
                </div>
                {item.sale ? (
                  <Badge variant='outline'>{t('Eligible for listing')}</Badge>
                ) : (
                  item.error && (
                    <p className='text-muted-foreground'>
                      {t(item.error, { defaultValue: item.error })}
                    </p>
                  )
                )}
                <QuoteEditorDialog
                  group={props.group}
                  quote={item.quote}
                  disabled={props.isConfirming}
                  onSaved={props.onSaved}
                />
                {item.last_seen_import < props.importedAt && (
                  <p className='text-muted-foreground mt-1'>
                    {t('Missing from this import')}
                  </p>
                )}
                {item.quote.reference != null && (
                  <details>
                    <summary>{t('Source')}</summary>
                    <pre className='max-w-56 overflow-auto'>
                      {JSON.stringify(item.quote.reference, null, 2)}
                    </pre>
                  </details>
                )}
              </td>
            </tr>
          )
        })}
        {!props.quotes.length && (
          <tr>
            <td colSpan={4} className='text-muted-foreground p-4'>
              {t('No models available for this group')}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

const quotePriceColumns = [
  ['input', 'Input'],
  ['output', 'Output'],
  ['cache_read', 'Cache Read'],
  ['cache_write', 'Cache Write'],
  ['cache_write_1h', 'One-hour cache write'],
] as const

const quoteEndpointPaths = new Map([
  ['openai', '/v1/chat/completions'],
  ['openai-response', '/v1/responses'],
  ['anthropic', '/v1/messages'],
])

function readQuoteForm(form: HTMLFormElement, quote: Quote): Quote {
  const data = new FormData(form)
  const price = (name: string) => {
    const value = data.get(name)
    return typeof value === 'string' && value !== '' ? Number(value) : undefined
  }
  const updated = {
    ...quote,
    local_model: String(data.get('local_model') ?? '').trim() || undefined,
    unit: String(data.get('unit')),
    confirmed: data.has('confirmed'),
    usage_verified: data.has('usage_verified'),
    endpoints: data.getAll('endpoints').map(String),
    reference: undefined,
  }
  if (quote.kind === 'token') {
    updated.tiers = quote.tiers?.map((tier, index) => ({
      ...tier,
      ...Object.fromEntries(
        quotePriceColumns.map(([field]) => [field, price(field + '-' + index)])
      ),
    }))
  } else if (quote.kind === 'fixed') {
    updated.fixed_price = price('fixed_price')
  } else {
    updated.media = quote.media?.map((rate, index) => ({
      ...rate,
      price: price('media-' + index),
    }))
  }
  return updated
}

function QuoteEditorDialog({
  group,
  quote,
  disabled,
  onSaved,
}: {
  group: Group
  quote: Quote
  disabled: boolean
  onSaved: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<{ quote: Quote; revision: number }>()
  const [json, setJson] = useState<string>()
  const save = useMutation({
    mutationFn: (draft: Quote | string) =>
      request('put', '/groups/' + group.id + '/quote', {
        revision: editing?.revision,
        quote: {
          ...(typeof draft === 'string' ? JSON.parse(draft) : draft),
          model_id: quote.model_id,
        },
      }),
    onSuccess: async () => {
      await onSaved()
      setEditing(undefined)
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || save.isPending) return
    if (json !== undefined) {
      save.mutate(json)
    } else {
      save.mutate(readQuoteForm(event.currentTarget, editing.quote))
    }
  }

  const draft = editing?.quote
  return (
    <Dialog
      open={!!editing}
      onOpenChange={(open) => {
        if (save.isPending) return
        if (open) {
          save.reset()
          setJson(undefined)
          setEditing({ quote, revision: group.revision })
        } else {
          setEditing(undefined)
        }
      }}
    >
      <DialogTrigger
        aria-label={t('Edit quote') + ' · ' + quote.model_id}
        disabled={disabled}
        render={<Button type='button' size='xs' variant='ghost' />}
      >
        {t('Edit quote')}
      </DialogTrigger>
      <DialogContent className='flex max-h-[85dvh] min-h-0 flex-col overflow-hidden sm:max-w-5xl'>
        <DialogHeader className='shrink-0 pr-8'>
          <DialogTitle>{t('Edit quote')}</DialogTitle>
          <DialogDescription className='font-mono [overflow-wrap:anywhere]'>
            {quote.model_id}
          </DialogDescription>
        </DialogHeader>
        {draft && (
          <form className='flex min-h-0 flex-col gap-4' onSubmit={submit}>
            <div className='min-h-0 space-y-4 overflow-y-auto overscroll-contain p-1'>
              {json === undefined ? (
                <QuoteEditorFields quote={draft} />
              ) : (
                <Field>
                  <FieldLabel htmlFor='upstream-quote-editor'>
                    {t('Edit quote JSON')}
                  </FieldLabel>
                  <Textarea
                    id='upstream-quote-editor'
                    className='min-h-64 font-mono text-xs'
                    value={json}
                    onChange={(event) => setJson(event.target.value)}
                  />
                </Field>
              )}
              {save.error && (
                <p role='alert' className='text-destructive text-sm'>
                  {save.error.message}
                </p>
              )}
            </div>
            <DialogFooter className='shrink-0'>
              {json === undefined && (
                <Button
                  type='button'
                  variant='ghost'
                  className='sm:mr-auto'
                  disabled={save.isPending}
                  onClick={(event) => {
                    const form = event.currentTarget.form
                    if (form?.reportValidity()) {
                      save.reset()
                      setJson(
                        JSON.stringify(readQuoteForm(form, draft), null, 2)
                      )
                    }
                  }}
                >
                  {t('Edit quote JSON')}
                </Button>
              )}
              <DialogClose
                render={
                  <Button
                    type='button'
                    variant='outline'
                    disabled={save.isPending}
                  />
                }
              >
                {t('Cancel')}
              </DialogClose>
              <Button type='submit' disabled={save.isPending}>
                {t('Save quote')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function QuoteEditorFields({ quote }: { quote: Quote }) {
  const { t } = useTranslation()
  const endpoints = new Set([
    ...quoteEndpointPaths.keys(),
    ...(quote.endpoints ?? []),
  ])
  return (
    <FieldGroup className='gap-4'>
      <div className='grid gap-3 sm:grid-cols-[1fr_12rem]'>
        <Field className='gap-1.5'>
          <FieldLabel htmlFor='quote-local-model'>
            {t('Local model name')}
          </FieldLabel>
          <Input
            id='quote-local-model'
            name='local_model'
            defaultValue={quote.local_model}
            placeholder={quote.model_id}
          />
        </Field>
        <Field className='gap-1.5'>
          <FieldLabel htmlFor='quote-unit'>{t('Currency')}</FieldLabel>
          <select
            className={selectClass}
            id='quote-unit'
            name='unit'
            defaultValue={quote.unit}
          >
            <option value='usd'>{t('USD')}</option>
            <option value='credit'>{t('Credits')}</option>
            {quote.unit !== 'usd' && quote.unit !== 'credit' && (
              <option value={quote.unit}>{quote.unit || '—'}</option>
            )}
          </select>
        </Field>
      </div>
      <QuotePriceTable quote={quote} />
      <fieldset className='flex flex-wrap gap-x-6 gap-y-3'>
        <legend className='mb-2 font-medium'>{t('API Endpoints')}</legend>
        {Array.from(endpoints, (endpoint, index) => (
          <Field orientation='horizontal' className='w-auto' key={endpoint}>
            <Checkbox
              id={'quote-endpoint-' + index}
              name='endpoints'
              value={endpoint}
              defaultChecked={quote.endpoints?.includes(endpoint)}
            />
            <FieldLabel
              htmlFor={'quote-endpoint-' + index}
              className='font-mono text-xs'
            >
              {quoteEndpointPaths.get(endpoint) ?? endpoint}
            </FieldLabel>
          </Field>
        ))}
      </fieldset>
      <div className='flex flex-wrap gap-x-6 gap-y-3 border-t pt-4'>
        <Field orientation='horizontal' className='w-auto'>
          <Checkbox
            id='quote-confirmed'
            name='confirmed'
            defaultChecked={quote.confirmed}
          />
          <FieldLabel htmlFor='quote-confirmed'>
            {t('Upstream cost confirmed')}
          </FieldLabel>
        </Field>
        <Field orientation='horizontal' className='w-auto'>
          <Checkbox
            id='quote-usage-verified'
            name='usage_verified'
            defaultChecked={quote.usage_verified}
          />
          <FieldLabel htmlFor='quote-usage-verified'>
            {t('API usage verified')}
          </FieldLabel>
        </Field>
      </div>
    </FieldGroup>
  )
}

function QuotePriceTable({ quote }: { quote: Quote }) {
  const { t } = useTranslation()
  return (
    <div className='rounded-lg border'>
      {quote.kind === 'token' ? (
        <Table className='min-w-180' aria-label={t('Price per million tokens')}>
          <TableHeader className='bg-muted/50'>
            <TableRow>
              <TableHead scope='col'>
                {t('Tier')} · {t('Price per million tokens')}
              </TableHead>
              {quotePriceColumns.map(([field, label]) => (
                <TableHead key={field} scope='col'>
                  {t(label)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {quote.tiers?.map((tier, index) => {
              const name = tier.name || t('Tier') + ' ' + (index + 1)
              return (
                <TableRow key={index}>
                  <TableCell>
                    <div className='font-medium'>{name}</div>
                    {tier.limit != null && (
                      <div className='text-muted-foreground text-xs'>
                        {tier.operator} {tier.limit}
                      </div>
                    )}
                    {tier.window && <QuoteTimeWindow window={tier.window} />}
                  </TableCell>
                  {quotePriceColumns.map(([field, label]) => (
                    <TableCell key={field}>
                      <QuotePriceInput
                        name={field + '-' + index}
                        label={name + ' · ' + t(label)}
                        value={tier[field]}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : (
        <Table aria-label={t('Upstream cost')}>
          <TableHeader className='bg-muted/50'>
            <TableRow>
              <TableHead scope='col'>{t('Specification')}</TableHead>
              <TableHead scope='col'>{t('Price')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quote.kind === 'fixed' ? (
              <TableRow>
                <TableCell>{t('Per Request')}</TableCell>
                <TableCell>
                  <QuotePriceInput
                    name='fixed_price'
                    label={t('Per Request')}
                    value={quote.fixed_price}
                  />
                </TableCell>
              </TableRow>
            ) : (
              quote.media?.map((rate, index) => (
                <TableRow key={index}>
                  <TableCell>
                    {rate.spec} · {rate.meter}
                  </TableCell>
                  <TableCell>
                    <QuotePriceInput
                      name={'media-' + index}
                      label={rate.spec + ' · ' + rate.meter}
                      value={rate.price}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function QuotePriceInput({
  name,
  label,
  value,
}: {
  name: string
  label: string
  value?: number | null
}) {
  return (
    <Input
      aria-label={label}
      className='h-8 min-w-24 font-mono tabular-nums'
      name={name}
      type='number'
      min='0'
      step='any'
      defaultValue={value ?? ''}
      placeholder='—'
    />
  )
}

function QuoteField({
  label,
  onChange,
  ...props
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  min?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <div className='space-y-1'>
      <Label htmlFor={props.id}>{label}</Label>
      <Input
        {...props}
        step={props.type === 'number' ? 'any' : undefined}
        autoComplete={props.type === 'password' ? 'new-password' : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function UpstreamQuoteRates({
  quote,
  multiplier,
}: {
  quote?: Quote
  multiplier?: number
}) {
  const { t } = useTranslation()
  return (
    <>
      {multiplier != null && (
        <div className='text-muted-foreground mb-1 text-xs'>
          {t('Upstream multiplier')} · {formatQuoteMultiplier(multiplier)}
        </div>
      )}
      <QuoteRates quote={quote} factor={1} />
    </>
  )
}

function QuoteRates({
  quote,
  factor,
  costFactor,
  usd,
}: {
  quote?: Quote
  factor: number
  costFactor?: number
  usd?: boolean
}) {
  const { t } = useTranslation()
  if (!quote) return '—'
  const currency = usd || quote.unit === 'usd'
  const amount = (value?: number | null) => {
    if (value == null) return '—'
    const price = currency
      ? dollars.format(value * factor)
      : (value * factor).toLocaleString()
    if (costFactor == null) return price
    const profit = Number((value * (factor - costFactor)).toFixed(10))
    return (
      <span className='whitespace-nowrap'>
        {price}{' '}
        <span className='text-yellow-500'>
          （{profit === 0 ? '0' : profitAmounts.format(profit)}）
        </span>
      </span>
    )
  }
  if (quote.kind === 'fixed')
    return (
      <span className='font-mono'>
        {amount(quote.fixed_price)} / {t('Request')}
      </span>
    )
  if (quote.kind !== 'token')
    return (
      <div className='space-y-1 font-mono text-xs'>
        {quote.media?.map((rate, index) => (
          <div key={index}>
            {rate.spec} · {amount(rate.price)} / {rate.meter}
          </div>
        ))}
        {!quote.media?.length && <span>—</span>}
      </div>
    )
  return (
    <div className='space-y-1 font-mono text-xs'>
      {quote.tiers?.map((tier, index) => (
        <div key={index} className='space-y-0.5'>
          <div className='text-muted-foreground'>
            {tier.name}
            {tier.limit != null &&
              ' · ' + tier.operator + ' ' + tier.limit} ·{' '}
            {currency ? 'USD' : t('Credits')} / 1M
          </div>
          {tier.window && <QuoteTimeWindow window={tier.window} />}
          <div>
            {t('Input')} {amount(tier.input)} · {t('Output')}{' '}
            {amount(tier.output)}
          </div>
          {tier.cache_read != null && (
            <div>
              {t('Cache Read')} {amount(tier.cache_read)}
            </div>
          )}
          {tier.cache_write != null && (
            <div>
              {t('Cache Write')} {amount(tier.cache_write)}
            </div>
          )}
          {tier.cache_write_1h != null && (
            <div>
              {t('Cache Write')} (1h) {amount(tier.cache_write_1h)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function QuoteTimeWindow(props: { window: NonNullable<Tier['window']> }) {
  const { i18n } = useTranslation()
  const { start_minute, end_minute, timezone, weekdays } = props.window
  const weekday = weekdays?.length
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        weekday: 'short',
        timeZone: 'UTC',
      })
    : undefined
  const days = weekdays
    ?.filter((day) => day >= 0 && day <= 6)
    .map((day) => weekday?.format(Date.UTC(2024, 0, 7 + day)))
    .join(', ')
  const time = (minutes: number) =>
    [Math.floor(minutes / 60), minutes % 60]
      .map((part) => String(part).padStart(2, '0'))
      .join(':')
  return (
    <div className='text-muted-foreground'>
      {time(start_minute)}–{time(end_minute)} {timezone}
      {days && ' · ' + days}
    </div>
  )
}

const usageFields = [
  ['P', 'Input', '100000'],
  ['C', 'Output', '10000'],
  ['CR', 'Cache Read', '0'],
  ['CC', 'Cache Write', '0'],
  ['CC1h', 'One-hour cache write', '0'],
] as const

function QuoteComparison() {
  const { t } = useTranslation()
  const comparison = useMutation({
    mutationFn: (payload: unknown) =>
      request<Comparison[]>('post', '/compare', payload),
    onError: (error) => {
      if (!('response' in error)) toast.error(error.message)
    },
  })
  function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const at = String(form.get('at') ?? '')
    comparison.mutate({
      model: String(form.get('model')).trim(),
      usage: Object.fromEntries(
        usageFields.map(([key]) => [key, Number(form.get(key))])
      ),
      at: at ? new Date(at).toISOString() : undefined,
      sale: form.get('sale') === '' ? undefined : Number(form.get('sale')),
      published: form.get('published') === 'published',
      unit: String(form.get('meter') ?? ''),
      spec: String(form.get('spec') ?? '').trim(),
      quantity: Number(form.get('quantity')),
    })
  }
  return (
    <section className='space-y-3 rounded-xl border p-4'>
      <h2 className='font-semibold'>{t('Compare upstream quotes')}</h2>
      <form
        className='grid gap-2 sm:grid-cols-3 lg:grid-cols-5'
        onSubmit={compare}
      >
        <label className='space-y-1 text-sm'>
          {t('Model ID')}
          <Input name='model' required placeholder='gpt-6.2-sol' />
        </label>
        {usageFields.map(([key, label, value]) => (
          <label key={key} className='space-y-1 text-sm'>
            {t(label)}
            <Input name={key} type='number' min={0} defaultValue={value} />
          </label>
        ))}
        <label className='space-y-1 text-sm'>
          {t('Request time')}
          <Input name='at' type='datetime-local' />
        </label>
        <label className='space-y-1 text-sm'>
          {t('Trial sale total (USD)')}
          <Input name='sale' type='number' min={0} step='any' />
        </label>
        <label className='space-y-1 text-sm'>
          {t('Listing version')}
          <select name='published' className={selectClass + ' w-full'}>
            <option value='draft'>{t('Latest draft')}</option>
            <option value='published'>{t('Published')}</option>
          </select>
        </label>
        <label className='space-y-1 text-sm'>
          {t('Specification')}
          <Input name='spec' />
        </label>
        <label className='space-y-1 text-sm'>
          {t('Usage unit')}
          <select name='meter' className={selectClass + ' w-full'}>
            <option value=''>{t('Token')}</option>
            <option value='per_image'>{t('Per image')}</option>
            <option value='per_request'>{t('Per request')}</option>
            <option value='per_second'>{t('Per second')}</option>
            <option value='reference_per_second'>
              {t('Reference video seconds')}
            </option>
          </select>
        </label>
        <label className='space-y-1 text-sm'>
          {t('Quantity')}
          <Input
            name='quantity'
            type='number'
            min={0}
            step='any'
            defaultValue={1}
          />
        </label>
        <div className='flex items-end'>
          <Button type='submit' disabled={comparison.isPending}>
            {t('Compare')}
          </Button>
        </div>
      </form>
      {comparison.data && (
        <div className='overflow-x-auto'>
          <table className='w-full text-left text-sm'>
            <thead className='bg-muted'>
              <tr>
                {[
                  'Channel',
                  'Group',
                  'Pricing tier',
                  'Upstream cost',
                  'Sale price',
                  'Estimated gross margin',
                ].map((label) => (
                  <th key={label} className='p-2'>
                    {t(label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.data.map((row, index) => (
                <tr key={index} className='border-t'>
                  <td className='p-2'>{row.channel}</td>
                  <td className='p-2'>{row.group}</td>
                  <td className='p-2'>
                    {row.tier || '—'}
                    {row.estimated && (
                      <span className='text-muted-foreground block text-xs'>
                        {t('Catalog estimate')}
                      </span>
                    )}
                  </td>
                  {row.error ? (
                    <td colSpan={3} className='text-muted-foreground p-2'>
                      {row.error}
                    </td>
                  ) : (
                    <>
                      <td className='p-2 font-mono'>
                        {row.components ? (
                          <details>
                            <summary>{dollars.format(row.cost)}</summary>
                            {Object.entries(row.components).map(
                              ([metric, value]) => (
                                <div key={metric} className='text-xs'>
                                  {t(
                                    (
                                      {
                                        input: 'Input',
                                        output: 'Output',
                                        cache_read: 'Cache Read',
                                        cache_write: 'Cache Write',
                                        cache_write_1h: 'One-hour cache write',
                                      } as Record<string, string>
                                    )[metric] ?? metric
                                  )}{' '}
                                  {dollars.format(value)}
                                </div>
                              )
                            )}
                          </details>
                        ) : (
                          dollars.format(row.cost)
                        )}
                      </td>
                      <td className='p-2 font-mono'>
                        {dollars.format(row.sale)}
                      </td>
                      <td className='p-2 font-mono'>
                        {row.margin == null
                          ? '—'
                          : (100 * row.margin).toFixed(2) + '%'}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!comparison.data.length && (
            <p className='text-muted-foreground p-2 text-sm'>
              {t('No matching upstream quotes')}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
