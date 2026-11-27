// Uses the same simulated annealing and grid rules as hatch.html.
function canBreed(sprite1, sprite2) {
    if (sprite1.gender === sprite2.gender) return false;

    const groups1 = sprite1.eggGroups;
    const groups2 = sprite2.eggGroups;

    if (groups1.length === 0 || groups2.length === 0) return false;

    return groups1.some(g => groups2.includes(g));
}

function manhattanDistance(pos1, pos2) {
    const center1 = { x: pos1.x + 1, y: pos1.y + 1 };
    const center2 = { x: pos2.x + 1, y: pos2.y + 1 };
    return Math.abs(center1.x - center2.x) + Math.abs(center1.y - center2.y);
}

function* findOptimalLayout(selectedSprites) {
    const n = selectedSprites.length;
    if (n === 0) return [];
    if (n === 1) return [{x: 0, y: 0}];

    const compatible = new Array(n).fill(0).map(() => new Array(n).fill(false));
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            compatible[i][j] = canBreed(selectedSprites[i], selectedSprites[j]);
            compatible[j][i] = compatible[i][j];
        }
    }

    const searchOffsets = [];
    for (let dx = -6; dx <= 6; dx++) {
        for (let dy = -6; dy <= 6; dy++) {
            if (Math.abs(dx) >= 2 || Math.abs(dy) >= 2) {
                if (Math.abs(dx) + Math.abs(dy) <= 6) {
                    searchOffsets.push({dx, dy});
                }
            }
        }
    }

    function evaluate(layout) {
        let pairs = 0;
        let compactness = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const dist = Math.abs(layout[i].x - layout[j].x) + Math.abs(layout[i].y - layout[j].y);
                if (dist <= 5 && compatible[i][j]) pairs++;
                compactness += dist;
            }
        }
        return { pairs, compactness };
    }

    function getValidEmpties(layout, excludeIdx) {
        const occupied = new Set();
        const seen = new Set();
        const candidates = [];
        // Each 2×2 nest blocks nine possible origins. Keep the same candidate order as the website.
        const width = Math.max(...layout.map(pos => pos.x)) - Math.min(...layout.map(pos => pos.x)) + 13;
        const key = (x, y) => x + y * width;
        for (let i = 0; i < layout.length; i++) {
            if (i === excludeIdx) continue;
            const { x, y } = layout[i];
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) occupied.add(key(x + dx, y + dy));
            }
        }
        for (let i = 0; i < layout.length; i++) {
            if (i === excludeIdx) continue;
            for (const { dx, dy } of searchOffsets) {
                const x = layout[i].x + dx;
                const y = layout[i].y + dy;
                const id = key(x, y);
                if (occupied.has(id) || seen.has(id)) continue;
                seen.add(id);
                candidates.push({ x, y });
            }
        }
        return candidates;
    }

    function getInitialLayout() {
        const layout = [{x: 0, y: 0}];
        while(layout.length < n) {
            const empties = getValidEmpties(layout, -1);
            const pick = empties[Math.floor(Math.random() * empties.length)];
            layout.push({x: pick.x, y: pick.y});
        }
        return layout;
    }

    let globalBestLayout = null;
    let globalBestPairs = -1;
    let globalBestCompactness = Infinity;

    const RESTARTS = 25;
    const ITERATIONS = 8000;

    for(let r = 0; r < RESTARTS; r++) {
        let current = getInitialLayout();
        let ev = evaluate(current);
        let currentPairs = ev.pairs;
        let currentComp = ev.compactness;

        let temp = 200.0;
        const cooling = Math.pow(0.1 / temp, 1.0 / ITERATIONS);

        for(let i = 0; i < ITERATIONS; i++) {
            const moveType = Math.random() < 0.5 ? 'swap' : 'move';

            if (moveType === 'swap') {
                const idx1 = Math.floor(Math.random() * n);
                const idx2 = Math.floor(Math.random() * n);
                if (idx1 !== idx2) {
                    const tempX = current[idx1].x;
                    const tempY = current[idx1].y;
                    current[idx1].x = current[idx2].x;
                    current[idx1].y = current[idx2].y;
                    current[idx2].x = tempX;
                    current[idx2].y = tempY;

                    const newEv = evaluate(current);
                    const deltaPairs = newEv.pairs - currentPairs;
                    const deltaComp = currentComp - newEv.compactness;

                    const deltaScore = deltaPairs * 100 + deltaComp;

                    if (deltaScore > 0 || Math.random() < Math.exp(deltaScore / temp)) {
                        currentPairs = newEv.pairs;
                        currentComp = newEv.compactness;
                    } else {
                        current[idx2].x = current[idx1].x;
                        current[idx2].y = current[idx1].y;
                        current[idx1].x = tempX;
                        current[idx1].y = tempY;
                    }
                }
            } else {
                const idx = Math.floor(Math.random() * n);
                const empties = getValidEmpties(current, idx);
                if (empties.length > 0) {
                    const pick = empties[Math.floor(Math.random() * empties.length)];
                    const oldX = current[idx].x;
                    const oldY = current[idx].y;

                    current[idx].x = pick.x;
                    current[idx].y = pick.y;

                    const newEv = evaluate(current);
                    const deltaPairs = newEv.pairs - currentPairs;
                    const deltaComp = currentComp - newEv.compactness;
                    const deltaScore = deltaPairs * 100 + deltaComp;

                    if (deltaScore > 0 || Math.random() < Math.exp(deltaScore / temp)) {
                        currentPairs = newEv.pairs;
                        currentComp = newEv.compactness;
                    } else {
                        current[idx].x = oldX;
                        current[idx].y = oldY;
                    }
                }
            }

            if (currentPairs > globalBestPairs || (currentPairs === globalBestPairs && currentComp < globalBestCompactness)) {
                globalBestPairs = currentPairs;
                globalBestCompactness = currentComp;
                globalBestLayout = current.map(p => ({x: p.x, y: p.y}));
            }

            temp *= cooling;
        }
        yield (r + 1) / RESTARTS;
    }

    return globalBestLayout;
}

module.exports = { canBreed, manhattanDistance, findOptimalLayout }
