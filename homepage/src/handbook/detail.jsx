import React, { useId, useState } from 'react'
import { ButtonNormal, Divider, Material, Panel, RuneText, Tab, TabList, TabPanel, Tabs } from 'rocokingdom-ui'
import { ALL, RARE_BADGE, STAT_LABELS, affinityStyle, eggGroups, rangeText, recordHref, skillIcon, smallPortrait, valueOr } from './data.js'
import { AssetImage, ChoiceBar, TypeBadges } from './common.jsx'

const imageChoices = [
  { value: 'egg', label: '精灵蛋' },
  { value: 'fruit', label: '精灵果实' },
]
const appearanceChoices = [
  { value: 'normal', label: '普通' },
  { value: 'shiny', label: '异色' },
]

function DetailSection({ title, actions, children, className = '' }) {
  const heading = useId()
  return (
    <Panel as="section" aria-labelledby={heading} material="paperSoft" curve="none"
      className={`dex-section ${className}`} contentClassName="dex-section-content">
      <div className="dex-section-heading">
        <RuneText as="h2" className="section-heading" id={heading}>{title}</RuneText>
        {actions}
      </div>
      {children}
    </Panel>
  )
}

function Measures({ items, className = '' }) {
  return (
    <dl className={`dex-measures ${className}`}>
      {items.map(([label, value]) => (
        <Material key={label} asChild material="paperMuted">
          <div><dt>{label}</dt><dd>{valueOr(value)}</dd></div>
        </Material>
      ))}
    </dl>
  )
}

function Profile({ record }) {
  const [shiny, setShiny] = useState(false)
  const groups = eggGroups(record)
  const availability = Boolean(record.rare && record.rarePath)

  return (
    <Panel as="section" aria-labelledby="dex-detail-title" material="paperSoft" curve="none" className="dex-profile"
      contentClassName="dex-profile-content" style={affinityStyle(record)}>
      <div className="dex-portrait-stage">
        <AssetImage className="dex-portrait" src={shiny ? record.rarePath : record.portrait}
          alt={shiny ? `${record.title} 异色` : record.title} width="320" height="320"
          fallback={<span className="dex-image-placeholder">暂无立绘</span>} />
        {availability && (
          <ButtonNormal className="dex-shiny-toggle" aria-label="切换异色" aria-pressed={shiny}
            material={shiny ? 'primary' : 'paperSoft'} size="middle" onClick={() => setShiny(!shiny)}>
            <AssetImage src={shiny ? RARE_BADGE : './web_images/no-rare.png'} width="18" height="18" alt="" />
            {shiny ? '异色形态' : '切换异色'}
          </ButtonNormal>
        )}
      </div>
      <div className="dex-profile-copy">
        <div className="dex-profile-number">No. {record.number}</div>
        <RuneText as="h1" id="dex-detail-title" className="dex-profile-title">{record.title}</RuneText>
        <TypeBadges record={record} />
        <dl className="dex-profile-facts">
          <div><dt>蛋组</dt><dd>{groups.length ? groups.join(' / ') : '不可繁殖'}</dd></div>
          <div><dt>性别</dt><dd>{valueOr(record.genderRatio)}</dd></div>
        </dl>
        <p className="dex-profile-description">{valueOr(record.description, '暂无简介。')}</p>
        <Measures items={[
          ['种族值', record.stats?.种族值],
          ['身高', record.height],
          ['体重', record.weight],
        ]} />
        <div className="dex-value-strip">
          <div>
            <AssetImage src="./web_images/values/base-starlight-value.png" width="23" height="23" alt="" />
            <span>基础星光值</span><strong>{valueOr(record.baseStarlightValue)}</strong>
          </div>
          <div>
            <AssetImage src="./web_images/values/base-review-rock-coin.png" width="23" height="23" alt="" />
            <span>基础回顾洛克贝</span><strong>{valueOr(record.baseReviewRockCoin)}</strong>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function ItemImages({ record }) {
  const [selectedKind, setKind] = useState('egg')
  const [appearance, setAppearance] = useState('normal')
  const hasEgg = record.hasEgg !== false
  const kind = hasEgg ? selectedKind : 'fruit'
  const isEgg = kind === 'egg'
  const isShiny = isEgg && appearance === 'shiny'
  const imageLabel = isShiny ? '异色蛋' : isEgg ? '精灵蛋' : '精灵果实'
  const path = record[isShiny ? 'icon-egg-rare' : `icon-${kind}`]

  return (
    <DetailSection title="精灵蛋与精灵果实" className="dex-items-section">
      {hasEgg
        ? <ChoiceBar label="图片类别" value={kind} choices={imageChoices} onChange={setKind} />
        : <p className="dex-placeholder">没有精灵蛋</p>}
      {(hasEgg || path) && (
        <div className="dex-item-preview">
          <AssetImage src={path} alt={`${record.title} ${imageLabel}`} width="104" height="104" loading="lazy"
            fallback={<p className="dex-placeholder" role="status">暂无{imageLabel}图片</p>} />
        </div>
      )}
      {isEgg && record['icon-egg-rare'] && (
        <ChoiceBar label="精灵蛋外观" value={appearance} choices={appearanceChoices} onChange={setAppearance} />
      )}
    </DetailSection>
  )
}

function Evolution({ record, byId }) {
  const chain = Array.isArray(record.evolution) ? record.evolution.filter(Boolean) : []

  return (
    <DetailSection title="进化链" className="dex-evolution-section">
      {chain.length > 1 ? (
        <div className="dex-evolution">
          {chain.map((id, index) => {
            const stage = byId.get(id)
            const current = id === record.id
            const body = (
              <>
                <AssetImage src={stage && smallPortrait(stage)} alt="" width="78" height="78" loading="lazy"
                  fallback={<span className="dex-evolution-missing" aria-hidden="true" />} />
                <small>No. {stage?.number || id.split('-', 1)[0]}</small>
                <strong>{stage?.title || id.replace(/^\d+-/, '')}</strong>
              </>
            )
            return (
              <React.Fragment key={`${id}-${index}`}>
                {index > 0 && <span className="dex-evolution-arrow" aria-hidden="true">→</span>}
                {stage && !current ? (
                  <a className="dex-evolution-card" href={recordHref(id)} style={affinityStyle(stage)}>{body}</a>
                ) : (
                  <div className="dex-evolution-card" aria-current={current ? 'true' : undefined}
                    style={stage && affinityStyle(stage)}>{body}</div>
                )}
              </React.Fragment>
            )
          })}
        </div>
      ) : <p className="dex-placeholder">当前精灵无进化链。</p>}
    </DetailSection>
  )
}

function Overview({ record, byId }) {
  const eggSize = record.eggSize
  const abilities = Array.isArray(record.abilities) ? record.abilities.filter(Boolean) : []
  return (
    <div className="dex-overview">
      <ItemImages record={record} />
      <Evolution record={record} byId={byId} />
      <DetailSection title="分布">
        <p className="dex-prose">{valueOr(record.distribution, '暂无分布资料。')}</p>
        {record.hasEgg !== false && (
          <>
            <Divider className="dex-section-divider" />
            <h3 className="dex-subheading">精灵蛋尺寸</h3>
            {eggSize ? (
              <Measures items={[
                ['蛋身高', rangeText(eggSize.heightMin, eggSize.heightMax, 'm')],
                ['蛋体重', rangeText(eggSize.weightMin, eggSize.weightMax, 'kg')],
              ]} />
            ) : <p className="dex-placeholder">暂无精灵蛋尺寸资料。</p>}
          </>
        )}
      </DetailSection>
      <DetailSection title="能力值">
        <dl className="dex-stats" style={affinityStyle(record)}>
          {STAT_LABELS.map(label => {
            const value = record.stats?.[label]
            const width = Math.min(100, Math.max(0, Number(value) || 0) / 180 * 100)
            return (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <span className="dex-stat-track" aria-hidden="true"><span style={{ width: `${width}%` }} /></span>
                  <strong>{valueOr(value, '-')}</strong>
                </dd>
              </div>
            )
          })}
        </dl>
      </DetailSection>
      <DetailSection title="特性" className="dex-section-wide">
        {abilities.length ? (
          <ul className="dex-detail-list">
            {abilities.map((ability, index) => (
              <li key={`${ability.name}-${index}`}>
                <h3>{valueOr(ability.name)}</h3>
                <p className="dex-prose">{valueOr(ability.description, '暂无描述。')}</p>
              </li>
            ))}
          </ul>
        ) : <p className="dex-placeholder">暂无特性资料。</p>}
      </DetailSection>
    </div>
  )
}

function Skills({ record, source, setSource }) {
  const skills = Array.isArray(record.skills) ? record.skills.filter(skill => skill?.name) : []
  const sources = [...new Set(skills.map(skill => skill.source).filter(Boolean))]
  const visible = source === ALL ? skills : skills.filter(skill => skill.source === source)
  const choices = [{ value: ALL, label: '全部' }, ...sources.map(value => ({ value, label: value }))]
  return (
    <DetailSection title="技能" actions={<ChoiceBar label="技能来源" value={source} choices={choices} onChange={setSource} />}>
      {visible.length ? (
        <div className="dex-skill-grid">
          {visible.map((skill, index) => (
            <Panel key={`${skill.name}-${index}`} as="article" material="paperMuted" curve="none" className="dex-skill-card"
              contentClassName="dex-skill-content">
              <AssetImage className="dex-skill-icon" src={skillIcon(skill)} width="40" height="40" alt="" loading="lazy"
                fallback={<span className="dex-skill-icon" aria-hidden="true" />} />
              <div className="dex-skill-info">
                <h3>{skill.name}{skill.level && <small>{skill.level}</small>}</h3>
                <div className="dex-skill-tags">
                  {[skill.source, skill.cost && `耗能 ${skill.cost}`, skill.category, skill.type && `${skill.type}系`,
                    Number(skill.power) > 0 && `威力 ${skill.power}`].filter(Boolean).map((label, tag) => (
                    <span className="dex-tag" key={tag}>{label}</span>
                  ))}
                </div>
                <p className="dex-prose">{valueOr(skill.description, '暂无描述。')}</p>
                {skill.unlock && <p className="dex-skill-unlock">解锁 {skill.unlock}</p>}
              </div>
            </Panel>
          ))}
        </div>
      ) : <p className="dex-placeholder">暂无技能资料。</p>}
    </DetailSection>
  )
}

function Research({ research }) {
  const tasks = Array.isArray(research?.tasks) ? research.tasks.filter(Boolean) : []
  return (
    <DetailSection title="图鉴课题" actions={research?.progress && <span className="dex-research-progress">进度 {research.progress}</span>}>
      {tasks.length ? (
        <ul className="dex-research-list">
          {tasks.map((task, index) => <li key={index}>{valueOr(task.name, '-')}</li>)}
        </ul>
      ) : <p className="dex-placeholder">暂无课题资料。</p>}
    </DetailSection>
  )
}

export function Detail({ record, byId, onBack }) {
  const [skillSource, setSkillSource] = useState(ALL)
  return (
    <div className="dex-detail">
      <div className="dex-detail-toolbar">
        <ButtonNormal material="paperSoft" onClick={onBack}>← 返回图鉴</ButtonNormal>
      </div>
      <Profile record={record} />
      <Tabs defaultValue="overview" listMaterial="stone" selectedMaterial="primary" className="dex-detail-tabs">
        <TabList aria-label="精灵详情">
          <Tab value="overview">资料</Tab>
          <Tab value="skills">技能</Tab>
          <Tab value="research">图鉴课题</Tab>
        </TabList>
        <TabPanel value="overview"><Overview record={record} byId={byId} /></TabPanel>
        <TabPanel value="skills" forceMount={false}>
          <Skills record={record} source={skillSource} setSource={setSkillSource} />
        </TabPanel>
        <TabPanel value="research" forceMount={false}><Research research={record.research} /></TabPanel>
      </Tabs>
      {record.url && (
        <p className="dex-source">
          <a href={record.url} target="_blank" rel="noreferrer">洛克王国世界 WIKI 原页面 <span className="link-arrow" aria-hidden="true" /></a>
        </p>
      )}
    </div>
  )
}
