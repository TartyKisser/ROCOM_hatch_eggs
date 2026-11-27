const { normalize } = require('../../lib/tool-data')

// Family merging, starlight weighting, source filters and ranking from adventure.html.
function normalizeNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? digits.padStart(3, '0') : '';
}

function leadingNumber(value) {
    const match = String(value || '').match(/^(\d+)/);
    return match ? match[1].padStart(3, '0') : '';
}

function buildFirstRecordIndex(sourceRecords) {
    const index = new Map();
    sourceRecords.forEach(record => {
        const number = normalizeNumber(record.number);
        if (number && !index.has(number)) index.set(number, record);
    });
    return index;
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"' && inQuotes && next === '"') {
            cell += '"';
            i += 1;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            row.push(cell);
            cell = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') i += 1;
            row.push(cell);
            if (row.some(value => value !== '')) rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += char;
        }
    }

    if (cell || row.length) {
        row.push(cell);
        if (row.some(value => value !== '')) rows.push(row);
    }

    const headers = rows.shift() || [];
    return rows.map(values => Object.fromEntries(headers.map((header, index) => [header.trim(), (values[index] || '').trim()])));
}

function cleanList(values) {
    return (values || []).filter(Boolean);
}

function addToIndex(index, key, target) {
    if (!key) return;
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(target);
}

function buildTargetIndex(targets) {
    const attributeIndex = new Map();

    targets.forEach(target => {
        targetTriggerAttributes(target).forEach(attribute => addToIndex(attributeIndex, attribute, target));
    });

    return { attributeIndex };
}

function recordAttributes(record) {
    return cleanList(record.attributes).length ? cleanList(record.attributes) : ['普通'];
}

function targetTriggerAttributes(target) {
    return recordAttributes(target && target.representative ? target.representative : target);
}

function hasUsableEggGroup(record) {
    return cleanList(record && record.eggGroups).length > 0;
}

function primaryAttribute(record) {
    return recordAttributes(record)[0] || '普通';
}

function recordStarlight(record) {
    const value = Number(record && record.baseStarlightValue);
    return Number.isFinite(value) ? value : 0;
}

function familyKey(record, canonicalRecordByNumber) {
    const evolution = Array.isArray(record.evolution) && record.evolution.length
        ? record.evolution
        : [record.id];
    return uniqueList(evolution.map(id => {
        const number = leadingNumber(id);
        return (number && canonicalRecordByNumber.get(number))
            ? canonicalRecordByNumber.get(number).id
            : id;
    })).join('|');
}

function familyRepresentative(members, evolutionIds) {
    const firstEvolutionId = evolutionIds[0];
    return (
        members.find(member => member.id === firstEvolutionId)
        || members.slice().sort((a, b) => a.number.localeCompare(b.number))[0]
    );
}

function weightedFamilyStarlight(members, evolutionIds) {
    const orderedMembers = evolutionIds
        .map(id => members.find(member => member.id === id))
        .filter(Boolean);
    const usableMembers = orderedMembers.length ? orderedMembers : members;

    if (usableMembers.length === 1) {
        return recordStarlight(usableMembers[0]);
    }
    if (usableMembers.length === 2) {
        return (recordStarlight(usableMembers[0]) * 3.5 + recordStarlight(usableMembers[1]) * 1.5) / 5;
    }
    if (usableMembers.length === 3) {
        return (
            recordStarlight(usableMembers[0]) * 2.5
            + recordStarlight(usableMembers[1]) * 1.5
            + recordStarlight(usableMembers[2])
        ) / 5;
    }

    return usableMembers.reduce((sum, member) => sum + recordStarlight(member), 0) / usableMembers.length;
}

function formatScore(score) {
    const value = Number(score);
    if (!Number.isFinite(value)) return '-';
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function uniqueList(values) {
    return [...new Set(values.filter(Boolean))];
}

function buildCandidateFamilies(sourceRecords, canonicalRecordByNumber) {
    const familyMap = new Map();
    sourceRecords.forEach(record => {
        const key = familyKey(record, canonicalRecordByNumber);
        if (!familyMap.has(key)) {
            familyMap.set(key, {
                key,
                evolutionIds: key.split('|').filter(Boolean),
                members: []
            });
        }
        familyMap.get(key).members.push(record);
    });

    return [...familyMap.values()].map(family => {
        const representative = familyRepresentative(family.members, family.evolutionIds);
        const sortedMembers = family.evolutionIds
            .map(id => family.members.find(member => member.id === id))
            .filter(Boolean);
        const members = sortedMembers.length ? sortedMembers : family.members;
        const memberNames = members.map(member => member.title);
        const memberNumbers = members.map(member => member.number);
        const attributes = uniqueList(members.flatMap(recordAttributes));
        const score = weightedFamilyStarlight(family.members, family.evolutionIds);
        const title = members.length > 1 ? `${representative.title}家族` : representative.title;
        const firstAttribute = primaryAttribute(representative);

        return {
            id: family.key,
            key: family.key,
            number: representative.number,
            title,
            portrait: representative.portrait,
            representative,
            attributes,
            firstAttribute,
            baseStarlightValue: score,
            members,
            memberNames,
            memberNumbers,
            searchText: normalize([
                title,
                representative.number,
                representative.title,
                ...memberNames,
                ...memberNumbers
            ].join(' '))
        };
    }).sort((a, b) => a.number.localeCompare(b.number));
}

function candidateSearchText(record) {
    return normalize([
        record.number,
        record.title,
        record.title,
        record.number,
        record.searchText || ''
    ].join(' '));
}

function candidateMatchesTerm(record, term) {
    return !term || candidateSearchText(record).includes(term);
}

function strategyMatchesCandidates(strategy, firstTerm, secondTerm) {
    const participants = [strategy.first, strategy.second].filter(Boolean);
    if (!firstTerm && !secondTerm) return true;
    if (firstTerm && !secondTerm) {
        return participants.some(record => candidateMatchesTerm(record, firstTerm));
    }
    if (!firstTerm && secondTerm) {
        return participants.some(record => candidateMatchesTerm(record, secondTerm));
    }
    if (participants.length < 2) return false;

    const [first, second] = participants;
    return (
        (candidateMatchesTerm(first, firstTerm) && candidateMatchesTerm(second, secondTerm))
        || (candidateMatchesTerm(first, secondTerm) && candidateMatchesTerm(second, firstTerm))
    );
}

function addRuleTarget(map, target, rule) {
    const item = map.get(target.key) || { target, rules: [] };
    if (!item.rules.includes(rule)) item.rules.push(rule);
    map.set(target.key, item);
}

function collectTriggeredTargets(targetIndex, attributes, rulePrefix) {
    const triggered = new Map();
    uniqueList(attributes).forEach(attribute => {
        const rule = `${rulePrefix}：${attribute}`;
        (targetIndex.attributeIndex.get(attribute) || []).forEach(target => addRuleTarget(triggered, target, rule));
    });
    return triggered;
}

function compareStrategyFallback(a, b) {
    return (
        a.target.number.localeCompare(b.target.number)
        || a.target.key.localeCompare(b.target.key, 'zh-CN')
        || a.first.number.localeCompare(b.first.number)
        || Number(Boolean(a.second)) - Number(Boolean(b.second))
        || String(a.second && a.second.number || '').localeCompare(String(b.second && b.second.number || ''))
    );
}

function otherTriggerMethodCount(strategy) {
    return strategy.otherTargets.reduce((total, item) => total + item.rules.length, 0);
}

function compareBySortKey(a, b, sortKey) {
    if (sortKey === 'score') return b.score - a.score;
    if (sortKey === 'rare') {
        return (a.otherTargets.length - b.otherTargets.length)
            || (otherTriggerMethodCount(a) - otherTriggerMethodCount(b));
    }

    return 0;
}

function fruitPaths(html) {
  const raw = String(html).match(/<script\b[^>]*\bid=["']fruit-paths["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  const paths = raw && JSON.parse(raw);
  if (!Array.isArray(paths)) throw new Error('果实素材清单暂不可用');
  return new Set(paths);
}

function buildModel(sourceRecords, csv, paths) {
  const canonical = buildFirstRecordIndex(sourceRecords);
  const records = [...canonical.values()];
  const numbers = new Set(parseCsv(csv).map(row => normalizeNumber(row['图鉴编号'])).filter(Boolean));
  if (!numbers.size) throw new Error('异色精灵名单暂不可用');
  const targets = buildCandidateFamilies(records, canonical).filter(family => family.members.some(member => numbers.has(member.number)));
  const targetKeys = new Set(targets.map(target => target.key));
  const candidates = buildCandidateFamilies(records.filter(record => Number.isFinite(record.baseStarlightValue)
    && hasUsableEggGroup(record) && paths.has(record['icon-fruit'])), canonical).filter(family => !targetKeys.has(family.key));
  const byAttribute = new Map();
  candidates.forEach(candidate => {
    if (!byAttribute.has(candidate.firstAttribute)) byAttribute.set(candidate.firstAttribute, []);
    byAttribute.get(candidate.firstAttribute).push(candidate);
  });
  return { targets, targetIndex: buildTargetIndex(targets), candidates, byAttribute };
}

function recommend(model, { target, mode, firstQuery, secondQuery, order }) {
  const firstTerm = normalize(firstQuery);
  const secondTerm = normalize(secondQuery);
  const strategies = [];
  for (const [attribute, families] of model.byAttribute) {
    const hits = [...collectTriggeredTargets(model.targetIndex, [attribute], mode === 'single' ? '单刷第一属性' : '共同第一属性').values()];
    const wanted = target ? hits.filter(hit => hit.target.key === target) : hits;
    if (!wanted.length) continue;
    const add = (first, second) => {
      if (!strategyMatchesCandidates({ first, second }, firstTerm, secondTerm)) return;
      const score = first.baseStarlightValue + (second?.baseStarlightValue || 0);
      for (const hit of wanted) strategies.push({ ...hit, first, second, score, otherTargets: hits.filter(other => other !== hit) });
    };
    families.forEach((first, index) => {
      if (mode === 'single') add(first, null);
      else for (let i = index + 1; i < families.length; i++) add(first, families[i]);
    });
  }
  return strategies.sort((a, b) => {
    for (const key of order) {
      const comparison = compareBySortKey(a, b, key);
      if (comparison) return comparison;
    }
    return compareStrategyFallback(a, b);
  });
}

module.exports = { fruitPaths, buildModel, recommend, formatScore, candidateMatchesTerm };
