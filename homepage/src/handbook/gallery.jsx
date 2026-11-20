import React, { memo, useMemo } from 'react'
import { ButtonNormal, Divider, Input, Panel, Select } from 'rocokingdom-ui'
import { ALL, ATTRIBUTES, RARE_BADGE, affinityStyle, filterRecords, recordHref, smallPortrait } from './data.js'
import { AssetImage, ChoiceBar, TypeBadges } from './common.jsx'

export const emptyFilters = { query: '', attribute: ALL, eggGroup: ALL, rare: ALL }

const typeChoices = [
  { value: ALL, label: '全部' },
  ...ATTRIBUTES.map(type => ({ value: type, label: type, icon: type })),
]

const rareChoices = [
  { value: ALL, label: '全部' },
  { value: 'yes', label: '有异色' },
  { value: 'no', label: '无异色' },
]

function GalleryControls({ groups, filters, setFilters }) {
  const groupChoices = useMemo(() => [
    { value: ALL, label: '全部蛋组' },
    ...groups.map(group => ({ value: group, label: group })),
  ].map(({ value, label }) => ({
    value,
    textValue: label,
    label: <span className="dex-egg-value">{label}</span>,
  })), [groups])
  const filtered = filters.query || filters.attribute !== ALL || filters.eggGroup !== ALL || filters.rare !== ALL

  return (
    <Panel as="section" aria-label="图鉴筛选" material="paperSoft" curve="none" className="dex-filters"
      contentClassName="dex-filter-content">
      <div className="dex-filter-row">
        <div className="dex-search">
          <Input className="dex-search-input" material="paperMuted" size="large" type="search" aria-label="搜索精灵"
            title="可搜索编号、名称、属性、蛋组和分布" autoComplete="off" placeholder="搜索编号、名称或分布"
            value={filters.query}
            onChange={event => setFilters({ ...filters, query: event.target.value })} />
          <ButtonNormal material="stone" onClick={() => setFilters(emptyFilters)} disabled={!filtered}>清空</ButtonNormal>
        </div>
        <div className="dex-filter-group">
          <span>蛋组</span>
          <Select ariaLabel="蛋组" material="paperMuted" value={filters.eggGroup} options={groupChoices}
            triggerClassName="dex-egg-select" contentProps={{ position: 'popper', sideOffset: 6 }}
            onValueChange={eggGroup => setFilters({ ...filters, eggGroup })} />
        </div>
        <div className="dex-filter-group">
          <span>异色</span>
          <ChoiceBar label="异色" choices={rareChoices} value={filters.rare}
            onChange={rare => setFilters({ ...filters, rare })} />
        </div>
      </div>
      <Divider className="dex-filter-divider" />
      <div className="dex-filter-group dex-type-filter">
        <span>系别</span>
        <ChoiceBar label="系别" choices={typeChoices} value={filters.attribute}
          onChange={attribute => setFilters({ ...filters, attribute })} />
      </div>
    </Panel>
  )
}

const SpeciesCard = memo(function SpeciesCard({ record }) {
  return (
    <Panel as="a" material="paperSoft" curve="none" href={recordHref(record.id)} aria-label={`No. ${record.number} ${record.title}`}
      className="dex-card" contentClassName="dex-card-content" style={affinityStyle(record)}>
      <div className="dex-card-stage">
        <span className="dex-card-number">No. {record.number}</span>
        {record.rare && <AssetImage className="dex-card-rare" src={RARE_BADGE} width="24" height="24" alt="有异色" />}
        <AssetImage className="dex-card-image" src={smallPortrait(record)} width="180" height="180" alt="" loading="lazy"
          decoding="async" fallback={<span className="dex-image-placeholder">暂无立绘</span>} />
      </div>
      <div className="dex-card-body">
        <h3>{record.title}</h3>
        <TypeBadges record={record} />
      </div>
    </Panel>
  )
})

export function Gallery({ index, groups, filters, setFilters }) {
  const records = useMemo(() => filterRecords(index, filters), [index, filters])

  return (
    <>
      <GalleryControls groups={groups} filters={filters} setFilters={setFilters} />
      <section aria-labelledby="dex-result-title" className="dex-results">
        <div className="dex-results-header">
          <h2 className="section-heading" id="dex-result-title">精灵列表</h2>
          <p role="status" className="dex-result-count">显示 {records.length} / {index.length} 只</p>
        </div>
        {records.length ? (
          <div className="dex-grid">{records.map(record => <SpeciesCard key={record.id} record={record} />)}</div>
        ) : (
          <Panel curve="none" className="dex-empty"><p>没有符合条件的精灵。</p></Panel>
        )}
      </section>
    </>
  )
}
