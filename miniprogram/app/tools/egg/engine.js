// Egg range, diagonal likelihood and softmax ranking from eggPred.html.
const EPSILON = 1e-9
const SOFTMAX_TEMPERATURE = 0.1

function numeric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function firstAttribute(record) {
    return Array.isArray(record.attributes) && record.attributes[0] ? record.attributes[0] : '普通';
}

function familyKey(record) {
    const evolution = Array.isArray(record.evolution) ? record.evolution.filter(Boolean) : [];
    return evolution[0] || record.id;
}

function buildFamilies(records) {
    const byId = new Map(records.map(record => [record.id, record]));
    const grouped = new Map();

    records.forEach(record => {
        const key = familyKey(record);
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key).push(record);
    });

    const families = [...grouped.entries()].map(([key, members]) => {
        const base = byId.get(key) || members[0];
        const sourceWithEgg = members.find(member => member.hasEgg !== false && member.eggSize);
        const eggSize = sourceWithEgg?.eggSize;
        if (!eggSize) return null;

        const heightMin = numeric(eggSize.heightMin);
        const heightMax = numeric(eggSize.heightMax);
        const weightMin = numeric(eggSize.weightMin);
        const weightMax = numeric(eggSize.weightMax);
        if ([heightMin, heightMax, weightMin, weightMax].some(value => value === null)) return null;

        const hMin = Math.min(heightMin, heightMax);
        const hMax = Math.max(heightMin, heightMax);
        const wMin = Math.min(weightMin, weightMax);
        const wMax = Math.max(weightMin, weightMax);
        const heightRange = Math.max(hMax - hMin, EPSILON);
        const weightRange = Math.max(wMax - wMin, EPSILON);

        return {
            key,
            base,
            members,
            name: `${base.title}家族`,
            heightMin: hMin,
            heightMax: hMax,
            weightMin: wMin,
            weightMax: wMax,
            heightRange,
            weightRange,
            area: heightRange * weightRange,
            attribute: firstAttribute(base)
        };
    }).filter(Boolean);

    const areas = families.map(family => family.area).filter(area => area > EPSILON).sort((a, b) => a - b);
    return { families, medianArea: areas[Math.floor(areas.length / 2)] || 1 };
}

function clamp(value, minValue, maxValue) {
    return Math.max(minValue, Math.min(maxValue, value));
}

function distanceToSegment(px, py, ax, ay, bx, by) {
    const vx = bx - ax;
    const vy = by - ay;
    const wx = px - ax;
    const wy = py - ay;
    const lengthSquared = vx * vx + vy * vy;
    if (lengthSquared <= EPSILON) {
        return Math.hypot(px - ax, py - ay);
    }
    const t = clamp((wx * vx + wy * vy) / lengthSquared, 0, 1);
    const closestX = ax + t * vx;
    const closestY = ay + t * vy;
    return Math.hypot(px - closestX, py - closestY);
}

function maxDiagonalDistance(family) {
    const a = distanceToSegment(
        family.heightMin,
        family.weightMax,
        family.heightMin,
        family.weightMin,
        family.heightMax,
        family.weightMax
    );
    const b = distanceToSegment(
        family.heightMax,
        family.weightMin,
        family.heightMin,
        family.weightMin,
        family.heightMax,
        family.weightMax
    );
    return Math.max(a, b, EPSILON);
}

function scoreFamily(family, height, weight, medianArea) {
    if (
        height < family.heightMin || height > family.heightMax ||
        weight < family.weightMin || weight > family.weightMax
    ) {
        return null;
    }

    const centerHeight = (family.heightMin + family.heightMax) / 2;
    const centerWeight = (family.weightMin + family.weightMax) / 2;
    const normalizedHeightDistance = Math.abs(height - centerHeight) / Math.max(family.heightRange / 2, EPSILON);
    const normalizedWeightDistance = Math.abs(weight - centerWeight) / Math.max(family.weightRange / 2, EPSILON);
    const centerScore = Math.exp(-0.5 * (
        normalizedHeightDistance * normalizedHeightDistance +
        normalizedWeightDistance * normalizedWeightDistance
    ));

    const diagonalDistance = distanceToSegment(
        height,
        weight,
        family.heightMin,
        family.weightMin,
        family.heightMax,
        family.weightMax
    );
    const normalizedDiagonalDistance = diagonalDistance / maxDiagonalDistance(family);
    const diagonalScore = Math.exp(-1.6 * normalizedDiagonalDistance * normalizedDiagonalDistance);

    const compactnessScore = clamp(Math.pow(medianArea / Math.max(family.area, EPSILON), 0.35), 0.55, 2.15);
    const rawScore = Math.pow(centerScore, 0.1) *
        Math.pow(diagonalScore, 0.74) *
        Math.pow(compactnessScore, 0.16);

    return {
        ...family,
        centerScore,
        diagonalScore,
        compactnessScore,
        rawScore
    };
}

function softmaxScores(rawScores) {
    if (!rawScores.length) return [];
    const logits = rawScores.map(score => Math.log(Math.max(score, EPSILON)) / SOFTMAX_TEMPERATURE);
    const maxLogit = Math.max(...logits);
    const expScores = logits.map(logit => Math.exp(logit - maxLogit));
    const total = expScores.reduce((sum, score) => sum + score, 0);
    return total > 0 ? expScores.map(score => score / total) : rawScores.map(() => 1 / rawScores.length);
}

function rankFamilies({ families, medianArea }, height, weight) {
    const matches = families.map(family => scoreFamily(family, height, weight, medianArea)).filter(Boolean);
    const probabilities = softmaxScores(matches.map(item => item.rawScore));
    return matches.map((item, index) => ({ ...item, probability: probabilities[index] }))
        .sort((a, b) => b.probability - a.probability || a.base.number.localeCompare(b.base.number, 'zh-CN'));
}

module.exports = { buildFamilies, rankFamilies }
