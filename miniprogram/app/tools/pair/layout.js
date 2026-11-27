// Shared egg-group regions and compact layout scoring from pair.html.
const MAP_CELL_WIDTH = 76;
const MAP_CELL_HEIGHT = 72;
const MAP_ICON_SIZE = 58;
const MAP_REGION_PADDING_X = (MAP_CELL_WIDTH - MAP_ICON_SIZE) / 2;
const MAP_REGION_PADDING_Y = (MAP_CELL_HEIGHT - MAP_ICON_SIZE) / 2;
const EGG_GROUP_COLORS = {
    '动物组': ['rgba(244,114,182,0.26)', 'rgba(244,114,182,0.56)'],
    '大地组': ['rgba(251,191,36,0.28)', 'rgba(217,119,6,0.5)'],
    '天空组': ['rgba(148,163,184,0.28)', 'rgba(71,85,105,0.48)'],
    '妖精组': ['rgba(45,212,191,0.24)', 'rgba(13,148,136,0.48)'],
    '巨灵组': ['rgba(168,85,247,0.24)', 'rgba(126,34,206,0.48)'],
    '拟人组': ['rgba(216,180,254,0.24)', 'rgba(147,51,234,0.46)'],
    '机械组': ['rgba(148,163,184,0.3)', 'rgba(75,85,99,0.5)'],
    '植物组': ['rgba(134,239,172,0.28)', 'rgba(22,163,74,0.48)'],
    '海洋组': ['rgba(147,197,253,0.3)', 'rgba(37,99,235,0.5)'],
    '两栖组': ['rgba(74,222,128,0.22)', 'rgba(21,128,61,0.46)'],
    '昆虫组': ['rgba(253,186,116,0.28)', 'rgba(234,88,12,0.5)'],
    '软体组': ['rgba(244,114,182,0.2)', 'rgba(219,39,119,0.42)'],
    '魔力组': ['rgba(96,165,250,0.26)', 'rgba(37,99,235,0.48)'],
    '飞龙组': ['rgba(248,113,113,0.26)', 'rgba(220,38,38,0.5)']
};

function buildPairMap(selectedSprites) {
  function eggGroupColor(group) {
      return EGG_GROUP_COLORS[group] || ['rgba(99,102,241,0.22)', 'rgba(79,70,229,0.46)'];
  }

  function visibleEggGroups(groupCounts) {
      return [...groupCounts.entries()]
          .filter(([, groupCount]) => groupCount > 1)
          .map(([group]) => group);
  }

  function slotForIndex(index, columns) {
      return {
          col: index % columns,
          row: Math.floor(index / columns)
      };
  }

  function connectedComponentCount(members) {
      const cells = new Set(members.map(member => `${member.col},${member.row}`));
      let components = 0;

      members.forEach(member => {
          const startKey = `${member.col},${member.row}`;
          if (!cells.has(startKey)) return;

          components += 1;
          const stack = [member];
          cells.delete(startKey);

          while (stack.length) {
              const current = stack.pop();
              [
                  [current.col - 1, current.row],
                  [current.col + 1, current.row],
                  [current.col, current.row - 1],
                  [current.col, current.row + 1]
              ].forEach(([col, row]) => {
                  const key = `${col},${row}`;
                  if (!cells.has(key)) return;
                  cells.delete(key);
                  stack.push({ col, row });
              });
          }
      });

      return components;
  }

  function layoutOrderScore(order, columns, groups) {
      if (!groups.length) return 0;

      const slots = order.map((sprite, index) => ({
          sprite,
          ...slotForIndex(index, columns)
      }));

      return groups.reduce((score, group) => {
          const members = slots.filter(slot => slot.sprite.eggGroups.includes(group));
          if (members.length <= 1) return score;

          const minCol = Math.min(...members.map(member => member.col));
          const maxCol = Math.max(...members.map(member => member.col));
          const minRow = Math.min(...members.map(member => member.row));
          const maxRow = Math.max(...members.map(member => member.row));
          const coveredCells = (maxCol - minCol + 1) * (maxRow - minRow + 1);
          const coveredNonMembers = slots.filter(slot => (
              !slot.sprite.eggGroups.includes(group)
              && slot.col >= minCol
              && slot.col <= maxCol
              && slot.row >= minRow
              && slot.row <= maxRow
          )).length;
          const components = connectedComponentCount(members);
          let memberDistance = 0;

          for (let i = 0; i < members.length; i += 1) {
              for (let j = i + 1; j < members.length; j += 1) {
                  memberDistance += Math.abs(members[i].col - members[j].col) + Math.abs(members[i].row - members[j].row);
              }
          }

          return score
              + coveredNonMembers * 100000
              + (components - 1) * 50000
              + (coveredCells - members.length) * 200
              + memberDistance * 10;
      }, 0);
  }

  function displayOrderScore(order, columns, groups, originalIndex) {
      const layoutScore = layoutOrderScore(order, columns, groups);
      const orderDrift = order.reduce((total, sprite, index) => (
          total + Math.abs(index - originalIndex.get(sprite.slotId))
      ), 0);
      return layoutScore + orderDrift * 0.01;
  }

  function exhaustiveDisplayOrder(columns, groups, originalIndex) {
      const sprites = selectedSprites;
      const used = new Array(sprites.length).fill(false);
      const order = [];
      let bestOrder = sprites;
      let bestScore = Infinity;

      function visit() {
          if (order.length === sprites.length) {
              const score = displayOrderScore(order, columns, groups, originalIndex);
              if (score < bestScore) {
                  bestScore = score;
                  bestOrder = [...order];
              }
              return;
          }

          for (let i = 0; i < sprites.length; i += 1) {
              if (used[i]) continue;
              used[i] = true;
              order.push(sprites[i]);
              visit();
              order.pop();
              used[i] = false;
          }
      }

      visit();
      return bestOrder;
  }

  function beamDisplayOrder(columns, groups, originalIndex) {
      const beamWidth = 260;
      let beam = [{ order: [], rest: selectedSprites, score: 0 }];

      for (let depth = 0; depth < selectedSprites.length; depth += 1) {
          const nextBeam = [];
          beam.forEach(state => {
              state.rest.forEach((sprite, index) => {
                  const nextOrder = [...state.order, sprite];
                  const nextRest = state.rest.filter((_, restIndex) => restIndex !== index);
                  const roughScore = displayOrderScore(nextOrder, columns, groups, originalIndex);
                  nextBeam.push({ order: nextOrder, rest: nextRest, score: roughScore });
              });
          });

          beam = nextBeam
              .sort((a, b) => a.score - b.score)
              .slice(0, beamWidth);
      }

      return beam
          .map(state => ({
              order: state.order,
              score: displayOrderScore(state.order, columns, groups, originalIndex)
          }))
          .sort((a, b) => a.score - b.score)[0].order;
  }

  function optimizeDisplayOrder(columns, groupCounts) {
      const groups = visibleEggGroups(groupCounts);
      if (selectedSprites.length <= 2 || !groups.length) return selectedSprites;

      const originalIndex = new Map(selectedSprites.map((sprite, index) => [sprite.slotId, index]));
      if (selectedSprites.length <= 8) {
          return exhaustiveDisplayOrder(columns, groups, originalIndex);
      }

      const seeds = [
          selectedSprites,
          beamDisplayOrder(columns, groups, originalIndex),
          ...groups.map(group => [...selectedSprites].sort((a, b) => {
              const aInGroup = a.eggGroups.includes(group) ? 0 : 1;
              const bInGroup = b.eggGroups.includes(group) ? 0 : 1;
              return aInGroup - bInGroup || originalIndex.get(a.slotId) - originalIndex.get(b.slotId);
          }))
      ];

      const improve = seed => {
          const order = [...seed];
          let bestScore = displayOrderScore(order, columns, groups, originalIndex);
          let improved = true;

          while (improved) {
              improved = false;
              for (let i = 0; i < order.length; i += 1) {
                  for (let j = i + 1; j < order.length; j += 1) {
                      [order[i], order[j]] = [order[j], order[i]];
                      const nextScore = displayOrderScore(order, columns, groups, originalIndex);
                      if (nextScore < bestScore) {
                          bestScore = nextScore;
                          improved = true;
                      } else {
                          [order[i], order[j]] = [order[j], order[i]];
                      }
                  }
              }
          }

          return { order, score: bestScore };
      };

      return seeds
          .map(improve)
          .sort((a, b) => a.score - b.score)[0].order;
  }

  function selectedMapLayout() {
      const count = selectedSprites.length;
      const columns = count <= 6 ? 4 : 5;
      const groupCounts = selectedSprites.reduce((counts, sprite) => {
          sprite.eggGroups.forEach(group => {
              counts.set(group, (counts.get(group) || 0) + 1);
          });
          return counts;
      }, new Map());
      const visibleGroupCount = visibleEggGroups(groupCounts).length;
      const labelRows = visibleGroupCount ? Math.ceil(visibleGroupCount / 3) : 0;
      const topPadding = 48 + labelRows * 34;
      const positions = new Map();
      const groupPositions = new Map();
      const displaySprites = optimizeDisplayOrder(columns, groupCounts);

      displaySprites.forEach((sprite, index) => {
          const col = index % columns;
          const row = Math.floor(index / columns);
          const position = {
              x: 34 + col * MAP_CELL_WIDTH,
              y: topPadding + row * MAP_CELL_HEIGHT,
              width: MAP_ICON_SIZE,
              height: MAP_ICON_SIZE
          };
          positions.set(sprite.slotId, position);
          sprite.eggGroups.forEach(group => {
              if ((groupCounts.get(group) || 0) <= 1) return;
              if (!groupPositions.has(group)) groupPositions.set(group, []);
              groupPositions.get(group).push({
                  x: position.x - MAP_REGION_PADDING_X,
                  y: position.y - MAP_REGION_PADDING_Y,
                  width: MAP_CELL_WIDTH,
                  height: MAP_CELL_HEIGHT,
                  col,
                  row
              });
          });
      });

      const rows = Math.max(1, Math.ceil(count / columns));
      const width = Math.max(390, columns * MAP_CELL_WIDTH + 82);
      const minHeight = 210;
      const height = Math.max(minHeight, topPadding + rows * MAP_CELL_HEIGHT + 50);
      const regions = [...groupPositions.entries()].map(([group, items]) => {
          const [fill, border] = eggGroupColor(group);
          const cellKeys = new Set(items.map(item => `${item.col},${item.row}`));
          const cells = items.map(item => {
              const hasLeft = cellKeys.has(`${item.col - 1},${item.row}`);
              const hasRight = cellKeys.has(`${item.col + 1},${item.row}`);
              const hasTop = cellKeys.has(`${item.col},${item.row - 1}`);
              const hasBottom = cellKeys.has(`${item.col},${item.row + 1}`);
              const radius = 24;

              return {
                  ...item,
                  borderTop: hasTop ? 'transparent' : border,
                  borderRight: hasRight ? 'transparent' : border,
                  borderBottom: hasBottom ? 'transparent' : border,
                  borderLeft: hasLeft ? 'transparent' : border,
                  radius: [
                      !hasTop && !hasLeft ? radius : 0,
                      !hasTop && !hasRight ? radius : 0,
                      !hasBottom && !hasRight ? radius : 0,
                      !hasBottom && !hasLeft ? radius : 0
                  ].map(value => `${value}px`).join(' ')
              };
          });

          return {
              group,
              cells,
              fill,
              border,
              area: items.length * MAP_CELL_WIDTH * MAP_CELL_HEIGHT
          };
      }).sort((a, b) => b.area - a.area || a.group.localeCompare(b.group, 'zh-CN'));

      let labelX = 10;
      let labelY = 10;
      const labels = regions
          .slice()
          .sort((a, b) => a.group.localeCompare(b.group, 'zh-CN'))
          .map(region => {
              const labelWidth = Math.max(70, region.group.length * 16 + 30);
              if (labelX + labelWidth > width - 10) {
                  labelX = 10;
                  labelY += 34;
              }
              const label = {
                  group: region.group,
                  x: labelX,
                  y: labelY,
                  width: labelWidth,
                  border: region.border
              };
              labelX += labelWidth + 8;
              return label;
          });

      return { positions, regions, labels, width, height };
  }

  return selectedMapLayout();
}

module.exports = { buildPairMap }
