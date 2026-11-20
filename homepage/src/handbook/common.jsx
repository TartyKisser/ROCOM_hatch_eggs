import React, { useState } from 'react'
import { Material, RadioGroup, RadioItem, RocoShape } from 'rocokingdom-ui'
import { ATTRIBUTES, attributes } from './data.js'

export function AssetImage({ src, fallback = null, ...props }) {
  const [failedSrc, setFailedSrc] = useState(null)
  if (!src || failedSrc === src) return fallback
  return <img {...props} src={src} onError={() => setFailedSrc(src)} />
}

export function AttributeIcon({ type }) {
  if (!ATTRIBUTES.includes(type)) return null
  return <AssetImage className="dex-attribute-icon" src={`./web_images/types/${type}.png`} width="18" height="18" alt="" />
}

export function TypeBadges({ record }) {
  const list = attributes(record)
  return (
    <div className="dex-type-badges">
      {(list.length ? list : ['无属性']).map(type => (
        <Material asChild material="paperMuted" key={type}>
          <span className="dex-tag"><AttributeIcon type={type} />{type}</span>
        </Material>
      ))}
    </div>
  )
}

export function ChoiceBar({ label, choices, value, onChange }) {
  return (
    <RadioGroup aria-label={label} className="dex-choices" size="small" value={value} onValueChange={onChange}
      activeMaterial="primary" inactiveMaterial="paperMuted">
      {choices.map(choice => (
        <RadioItem key={choice.value} value={choice.value}>
          {choice.icon && <AttributeIcon type={choice.icon} />}
          {choice.label}
        </RadioItem>
      ))}
    </RadioGroup>
  )
}

export function PageLink({ href, children }) {
  return (
    <Material asChild material="paperSoft">
      <RocoShape as="a" href={href} className="dex-page-link">
        {children}
      </RocoShape>
    </Material>
  )
}
