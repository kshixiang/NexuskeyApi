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
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import {
  LoadingSkeleton,
  EmptyState,
  SearchBar,
  PricingTable,
  PricingToolbar,
  ModelCardGrid,
  ModelDetailsDrawer,
} from './components'
import { PricingVendorTabs } from './components/pricing-vendor-tabs'
import { EXCLUDED_GROUPS, FILTER_ALL, VIEW_MODES } from './constants'
import { useFilters } from './hooks/use-filters'
import { usePricingData } from './hooks/use-pricing-data'

export function Pricing() {
  const { t } = useTranslation()
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )

  const {
    models,
    vendors,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const groupNames = useMemo(
    () =>
      Object.fromEntries(
        models.flatMap((model) =>
          model.sale_group && model.sale_group_name
            ? [[model.sale_group, model.sale_group_name]]
            : []
        )
      ),
    [models]
  )
  const displayGroupRatios = useMemo(() => {
    const ratios = { ...groupRatio }
    for (const model of models) {
      if (model.sale_group && model.sale_group_multiplier != null) {
        ratios[model.sale_group] = model.sale_group_multiplier
      }
    }
    return ratios
  }, [groupRatio, models])

  const {
    searchInput,
    sortBy,
    vendorFilter,
    groupFilter,
    quotaTypeFilter,
    endpointTypeFilter,
    tagFilter,
    tokenUnit,
    viewMode,
    showRechargePrice,
    setSearchInput,
    setSortBy,
    setVendorFilter,
    setGroupFilter,
    setQuotaTypeFilter,
    setEndpointTypeFilter,
    setTagFilter,
    setTokenUnit,
    setViewMode,
    setShowRechargePrice,
    filteredModels,
    hasActiveFilters,
    activeFilterCount,
    availableTags,
    clearFilters,
    clearSearch,
  } = useFilters(models || [])

  const handleModelClick = useCallback((modelName: string) => {
    setSelectedModelName(modelName)
  }, [])

  const selectedModel = useMemo(
    () =>
      selectedModelName
        ? (models || []).find((model) => model.key === selectedModelName) ||
          null
        : null,
    [models, selectedModelName]
  )

  const availableGroups = useMemo(
    () =>
      Object.keys(usableGroup || {}).filter(
        (g) => !EXCLUDED_GROUPS.includes(g)
      ),
    [usableGroup]
  )

  const handleClearAll = useCallback(() => {
    clearFilters()
    clearSearch()
  }, [clearFilters, clearSearch])

  const renderPricingContent = () => {
    if (filteredModels.length === 0) {
      return (
        <EmptyState
          searchQuery={searchInput}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearAll}
        />
      )
    }

    if (viewMode === VIEW_MODES.CARD) {
      return (
        <ModelCardGrid
          models={filteredModels}
          onModelClick={handleModelClick}
          priceRate={priceRate}
          usdExchangeRate={usdExchangeRate}
          tokenUnit={tokenUnit}
          showRechargePrice={showRechargePrice}
        />
      )
    }

    return (
      <PricingTable
        models={filteredModels}
        priceRate={priceRate}
        usdExchangeRate={usdExchangeRate}
        tokenUnit={tokenUnit}
        showRechargePrice={showRechargePrice}
        onModelClick={handleModelClick}
        groups={availableGroups}
        groupFilter={groupFilter}
        groupNames={groupNames}
        groupRatios={displayGroupRatios}
      />
    )
  }

  if (isLoading) {
    return (
      <PublicLayout showMainContainer={false}>
        <div className='mx-auto w-full max-w-[1440px] px-4 pt-24 pb-10 sm:px-6'>
          <LoadingSkeleton viewMode={viewMode} />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <div className='bg-muted/15'>
        <PageTransition className='mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pt-24 pb-10 sm:gap-5 sm:px-6'>
          <header className='flex flex-wrap items-center justify-between gap-2'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {t('Model Pricing')}
            </h1>
            <p className='text-muted-foreground text-sm'>
              {t('This site currently has {{count}} models enabled', {
                count: models?.length || 0,
              })}
            </p>
          </header>

          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
              <SearchBar
                value={searchInput}
                onChange={setSearchInput}
                onClear={clearSearch}
                placeholder={t(
                  'Search model name, provider, endpoint, or tag...'
                )}
                className='min-w-0 flex-1'
              />
              <Select
                value={groupFilter}
                onValueChange={(value) => setGroupFilter(value ?? FILTER_ALL)}
              >
                <SelectTrigger
                  aria-label={t('Groups')}
                  className='h-10 w-full sm:w-64'
                >
                  <SelectValue>
                    {groupFilter === FILTER_ALL
                      ? t('All Groups')
                      : (groupNames[groupFilter] ?? groupFilter)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={FILTER_ALL}>
                      {t('All Groups')}
                    </SelectItem>
                    {availableGroups.map((group) => (
                      <SelectItem key={group} value={group}>
                        {groupNames[group] ?? group}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <PricingVendorTabs
              models={models}
              vendors={vendors}
              value={vendorFilter}
              onChange={setVendorFilter}
            />
          </div>

          <main className='flex min-w-0 flex-col gap-5'>
            <PricingToolbar
              filteredCount={filteredModels.length}
              totalCount={models?.length}
              sortBy={sortBy}
              onSortChange={setSortBy}
              tokenUnit={tokenUnit}
              onTokenUnitChange={setTokenUnit}
              showRechargePrice={showRechargePrice}
              onRechargePriceChange={setShowRechargePrice}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              quotaTypeFilter={quotaTypeFilter}
              endpointTypeFilter={endpointTypeFilter}
              vendorFilter={vendorFilter}
              groupFilter={groupFilter}
              tagFilter={tagFilter}
              onQuotaTypeChange={setQuotaTypeFilter}
              onEndpointTypeChange={setEndpointTypeFilter}
              onVendorChange={setVendorFilter}
              onGroupChange={setGroupFilter}
              onTagChange={setTagFilter}
              vendors={vendors || []}
              groups={availableGroups}
              groupNames={groupNames}
              groupRatios={displayGroupRatios}
              tags={availableTags}
              models={models || []}
              hasActiveFilters={hasActiveFilters}
              activeFilterCount={activeFilterCount}
              onClearFilters={clearFilters}
            />

            {renderPricingContent()}
          </main>

          {selectedModel && (
            <ModelDetailsDrawer
              open={Boolean(selectedModel)}
              onOpenChange={(open) => {
                if (!open) setSelectedModelName(null)
              }}
              model={selectedModel}
              groupRatio={groupRatio || {}}
              usableGroup={usableGroup || {}}
              endpointMap={
                (endpointMap as Record<
                  string,
                  { path?: string; method?: string }
                >) || {}
              }
              autoGroups={autoGroups || []}
              priceRate={priceRate ?? 1}
              usdExchangeRate={usdExchangeRate ?? 1}
              tokenUnit={tokenUnit}
              showRechargePrice={showRechargePrice}
            />
          )}
        </PageTransition>
      </div>
    </PublicLayout>
  )
}
