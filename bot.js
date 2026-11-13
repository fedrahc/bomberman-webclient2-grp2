function computeDangerMap(game) {
  const danger = new Set();
  game.bombs.forEach(bomb => {
    const affected = game.getAffectedTiles(bomb.x, bomb.y, bomb.range);
    affected.forEach(t => danger.add(`${t.x},${t.y}`));
  });
  return danger;
}

function getFirstStepTowardsClosestSafe(game, startX, startY, dangerMap) {
  if (!dangerMap.has(`${startX},${startY}`)) return null;

  const queue = [{ x: startX, y: startY, firstDir: null }];
  const visited = new Set([`${startX},${startY}`]);
  const dirs = [
    { dir: 'UP', x: 0, y: -1 },
    { dir: 'DOWN', x: 0, y: 1 },
    { dir: 'LEFT', x: -1, y: 0 },
    { dir: 'RIGHT', x: 1, y: 0 }
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!dangerMap.has(`${current.x},${current.y}`)) return current.firstDir;

    for (const d of dirs) {
      const nx = current.x + d.x;
      const ny = current.y + d.y;
      const key = `${nx},${ny}`;
      const isBomb = game.bombs.some(b => b.x === nx && b.y === ny);

      if (game.map[ny] && game.map[ny][nx] === 0 && !isBomb && !visited.has(key)) {
        visited.add(key);
        queue.push({
          x: nx,
          y: ny,
          firstDir: current.firstDir === null ? d.dir : current.firstDir
        });
      }
    }
  }
  return null;
}

function canBotSurviveAfterBomb(game, bot, dangerMap) {
  const futureDanger = new Set(dangerMap);
  game.getAffectedTiles(bot.x, bot.y, bot.bombRange).forEach(t => futureDanger.add(`${t.x},${t.y}`));

  const queue = [{ x: bot.x, y: bot.y }];
  const visited = new Set([`${bot.x},${bot.y}`]);
  const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

  while (queue.length > 0) {
    const curr = queue.shift();
    for (const d of dirs) {
      const nx = curr.x + d.x;
      const ny = curr.y + d.y;
      const key = `${nx},${ny}`;
      const isBombBlock = (nx === bot.x && ny === bot.y && (curr.x !== bot.x || curr.y !== bot.y)) ||
                          game.bombs.some(b => b.x === nx && b.y === ny);

      if (game.map[ny] && game.map[ny][nx] === 0 && !isBombBlock && !visited.has(key)) {
        if (!futureDanger.has(key)) return true;
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return false;
}

function evaluateBombPosition(game, x, y, range, botId) {
  const affected = game.getAffectedTiles(x, y, range);
  let score = 0;

  affected.forEach(tile => {
    if (game.map[tile.y] && game.map[tile.y][tile.x] === 2) score += 1;
    Object.values(game.players).forEach(p => {
      if (p.id !== botId && p.isAlive && p.x === tile.x && p.y === tile.y) score += 10;
    });
  });

  return score;
}

function updateBots(game) {
  const dangerMap = computeDangerMap(game);
  const now = Date.now();

  Object.values(game.players).forEach((bot) => {
    if (!bot.isBot || !bot.isAlive) return;

    // 1. Esquive prioritaire
    if (dangerMap.has(`${bot.x},${bot.y}`)) {
      const escapeDir = getFirstStepTowardsClosestSafe(game, bot.x, bot.y, dangerMap);
      if (escapeDir) {
        game.movePlayer(bot.id, escapeDir);
        return;
      }
    }

    // 2. Pose de bombe stratégique
    const elapsed = (now - bot.lastBombTime) / 1000;
    const hasBombHere = game.bombs.some(b => b.x === bot.x && b.y === bot.y);

    if (elapsed >= 2.5 && !hasBombHere) {
      const bombScore = evaluateBombPosition(game, bot.x, bot.y, bot.bombRange, bot.id);
      if (bombScore > 0 && canBotSurviveAfterBomb(game, bot, dangerMap)) {
        game.handlePlaceBomb(bot.id);
        bot.lastBombTime = now;
        return;
      }
    }

    // 3. Déplacement vers une cible
    const possibleMoves = [
      { dir: 'UP', x: bot.x, y: bot.y - 1 },
      { dir: 'DOWN', x: bot.x, y: bot.y + 1 },
      { dir: 'LEFT', x: bot.x - 1, y: bot.y },
      { dir: 'RIGHT', x: bot.x + 1, y: bot.y }
    ].filter(m => {
      const isBomb = game.bombs.some(b => b.x === m.x && b.y === m.y);
      return game.map[m.y] && game.map[m.y][m.x] === 0 && !isBomb && !dangerMap.has(`${m.x},${m.y}`);
    });

    if (possibleMoves.length > 0) {
      let best = possibleMoves.reduce((acc, m) => {
        const s = evaluateBombPosition(game, m.x, m.y, bot.bombRange, bot.id);
        return s > acc.score ? { move: m, score: s } : acc;
      }, { move: possibleMoves[0], score: -1 });

      if (best.score <= 0) {
        best.move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
      }
      game.movePlayer(bot.id, best.move.dir);
    }
  });
}

module.exports = { updateBots };