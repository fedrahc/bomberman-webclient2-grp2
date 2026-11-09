const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const GRID_SIZE = 11;
const baseMap = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 2, 2, 2, 2, 2, 0, 0, 1],
  [1, 0, 1, 2, 1, 2, 1, 2, 1, 0, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
  [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
  [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
  [1, 0, 1, 2, 1, 2, 1, 2, 1, 0, 1],
  [1, 0, 0, 2, 2, 2, 2, 2, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];

let map = JSON.parse(JSON.stringify(baseMap));
let players = {};
let scores = {}; // Stocke le total de victoires
let bombs = [];
let powerUps = [];
let gameMode = null;
let matchTimer = 180;
let timerInterval = null;
let isGameOver = false;

const spawnPositions = [
  { x: 1, y: 1 },
  { x: 9, y: 9 },
  { x: 9, y: 1 },
  { x: 1, y: 9 }
];

const colors = [
  { name: 'Rouge', hex: '#ff4757' },
  { name: 'Vert', hex: '#2ed573' },
  { name: 'Bleu', hex: '#1e90ff' },
  { name: 'Jaune', hex: '#ffa502' }
];

io.on('connection', (socket) => {
  console.log(`[Connexion] ${socket.id}`);

  socket.on('setGameMode', (mode) => {
    gameMode = mode;
    players = {};
    scores = {};
    resetAndStartMatch(socket);
  });

  socket.on('restartGame', () => {
    if (!gameMode) return;
    resetAndStartMatch(socket);
  });

  socket.on('move', (dir) => {
    if (!isGameOver) movePlayer(socket.id, dir);
  });

  socket.on('placeBomb', () => {
    if (!isGameOver) handlePlaceBomb(socket.id);
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    delete scores[socket.id];
    io.emit('updateGameData', { players, powerUps, scores });
  });
});

function resetAndStartMatch(socket) {
  isGameOver = false;
  map = JSON.parse(JSON.stringify(baseMap));
  bombs = [];
  powerUps = [];
  matchTimer = 180;

  // Initialisation ou réinitialisation des joueurs existants
  const currentIds = Object.keys(players);

  if (currentIds.length === 0) {
    // Premier lancement
    players[socket.id] = {
      id: socket.id,
      name: 'Vous',
      x: spawnPositions[0].x,
      y: spawnPositions[0].y,
      color: colors[0].hex,
      isAlive: true,
      isBot: false,
      maxBombs: 1,
      bombRange: 2,
      shield: false
    };
    scores[socket.id] = scores[socket.id] || 0;

    if (gameMode === 'solo') {
      for (let i = 0; i < 3; i++) {
        const botId = `bot_${i + 1}`;
        players[botId] = {
          id: botId,
          name: `Bot ${i + 1}`,
          x: spawnPositions[i + 1].x,
          y: spawnPositions[i + 1].y,
          color: colors[i + 1].hex,
          isAlive: true,
          isBot: true,
          maxBombs: 1,
          bombRange: 2,
          shield: false,
          lastBombTime: Date.now()
        };
        scores[botId] = scores[botId] || 0;
      }
    }
  } else {
    // Relance de partie
    Object.values(players).forEach((p, idx) => {
      p.isAlive = true;
      p.maxBombs = 1;
      p.bombRange = 2;
      p.shield = false;
      p.x = spawnPositions[idx % spawnPositions.length].x;
      p.y = spawnPositions[idx % spawnPositions.length].y;
      if (p.isBot) p.lastBombTime = Date.now();
      if (scores[p.id] === undefined) scores[p.id] = 0;
    });
  }

  io.emit('gameStarted', { id: socket.id, map, players, bombs, powerUps, matchTimer, scores });
  io.emit('updateGameData', { players, powerUps, scores });

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (matchTimer > 0) {
      matchTimer--;
      io.emit('timerUpdate', matchTimer);
    } else {
      triggerGameOver("Temps écoulé ! Égalité");
    }
  }, 1000);
}

function movePlayer(id, dir) {
  const player = players[id];
  if (!player || !player.isAlive) return;

  let targetX = player.x;
  let targetY = player.y;

  if (dir === 'UP') targetY -= 1;
  if (dir === 'DOWN') targetY += 1;
  if (dir === 'LEFT') targetX -= 1;
  if (dir === 'RIGHT') targetX += 1;

  const isBombOnTarget = bombs.some(b => b.x === targetX && b.y === targetY);

  if (map[targetY] && map[targetY][targetX] === 0 && !isBombOnTarget) {
    player.x = targetX;
    player.y = targetY;

    const pUpIndex = powerUps.findIndex(p => p.x === targetX && p.y === targetY);
    if (pUpIndex !== -1) {
      const pUp = powerUps[pUpIndex];
      if (pUp.type === 'BOMB' && player.maxBombs < 10) player.maxBombs += 1;
      else if (pUp.type === 'FIRE') player.bombRange += 1;
      else if (pUp.type === 'HEART') player.shield = true;
      else if (pUp.type === 'SKULL') player.maxBombs = Math.max(1, player.maxBombs - 1);
      powerUps.splice(pUpIndex, 1);
    }

    io.emit('playerMoved', { id: player.id, x: player.x, y: player.y, players, powerUps });
  }
}

function handlePlaceBomb(id) {
  const player = players[id];
  if (!player || !player.isAlive) return;

  const playerActiveBombs = bombs.filter((b) => b.owner === id).length;
  if (playerActiveBombs >= player.maxBombs) return;

  const alreadyHasBomb = bombs.some((b) => b.x === player.x && b.y === player.y);
  if (alreadyHasBomb) return;

  const bomb = {
    x: player.x,
    y: player.y,
    owner: id,
    id: Date.now() + Math.random(),
    range: player.bombRange
  };

  bombs.push(bomb);
  io.emit('bombPlaced', bomb);

  setTimeout(() => {
    explodeBomb(bomb);
  }, 3000);
}

function getAffectedTilesForBomb(bombX, bombY, bombRange) {
  const affectedTiles = [{ x: bombX, y: bombY }];
  const directions = [
    { x: 0, y: -1 }, { x: 0, y: 1 },
    { x: -1, y: 0 }, { x: 1, y: 0 }
  ];

  directions.forEach((dir) => {
    for (let i = 1; i <= bombRange; i++) {
      const tx = bombX + dir.x * i;
      const ty = bombY + dir.y * i;

      if (!map[ty] || map[ty][tx] === 1) break;
      affectedTiles.push({ x: tx, y: ty });

      if (map[ty][tx] === 2) break;
    }
  });
  return affectedTiles;
}

function explodeBomb(bomb) {
  const index = bombs.findIndex((b) => b.id === bomb.id);
  if (index === -1) return;
  bombs.splice(index, 1);

  const affectedTiles = getAffectedTilesForBomb(bomb.x, bomb.y, bomb.range);

  affectedTiles.forEach(tile => {
    if (map[tile.y] && map[tile.y][tile.x] === 2) {
      map[tile.y][tile.x] = 0;
      if (Math.random() < 0.45) {
        const types = ['BOMB', 'FIRE', 'HEART', 'SKULL'];
        const type = types[Math.floor(Math.random() * types.length)];
        powerUps.push({ x: tile.x, y: tile.y, type });
      }
    }
  });

  Object.values(players).forEach((player) => {
    if (!player.isAlive) return;
    const hit = affectedTiles.some((t) => t.x === player.x && t.y === player.y);
    if (hit) {
      if (player.shield) {
        player.shield = false;
      } else {
        player.isAlive = false;
        io.emit('playerDied', { id: player.id });
      }
    }
  });

  io.emit('bombExploded', {
    bombId: bomb.id,
    affectedTiles,
    mapUpdate: map,
    powerUps
  });

  checkWinCondition();
}

function checkWinCondition() {
  if (isGameOver) return;
  const alivePlayers = Object.values(players).filter((p) => p.isAlive);
  if (alivePlayers.length <= 1 && Object.keys(players).length > 1) {
    const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
    let message = "Égalité !";
    if (winner) {
      scores[winner.id] = (scores[winner.id] || 0) + 1;
      message = `🏆 Victoire de ${winner.name} !`;
    }
    triggerGameOver(message);
  }
}

function triggerGameOver(message) {
  isGameOver = true;
  if (timerInterval) clearInterval(timerInterval);
  io.emit('gameOver', { winner: message, scores });
}

// ==========================================
// LOGIQUE DES BOTS
// ==========================================

function computeDangerMap() {
  const danger = new Set();
  bombs.forEach(bomb => {
    const affected = getAffectedTilesForBomb(bomb.x, bomb.y, bomb.range);
    affected.forEach(t => danger.add(`${t.x},${t.y}`));
  });
  return danger;
}

function getFutureDangerMap(x, y, range) {
  const futureDanger = new Set();
  const affected = getAffectedTilesForBomb(x, y, range);
  affected.forEach(t => futureDanger.add(`${t.x},${t.y}`));
  return futureDanger;
}

function getFirstStepTowardsClosestSafe(startX, startY, dangerMap) {
  if (!dangerMap.has(`${startX},${startY}`)) return null;

  const queue = [{ x: startX, y: startY, firstDir: null }];
  const visited = new Set();
  visited.add(`${startX},${startY}`);

  const dirs = [
    { dir: 'UP', x: 0, y: -1 },
    { dir: 'DOWN', x: 0, y: 1 },
    { dir: 'LEFT', x: -1, y: 0 },
    { dir: 'RIGHT', x: 1, y: 0 }
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!dangerMap.has(`${current.x},${current.y}`)) {
      return current.firstDir;
    }

    for (const d of dirs) {
      const nx = current.x + d.x;
      const ny = current.y + d.y;
      const key = `${nx},${ny}`;
      const isBomb = bombs.some(b => b.x === nx && b.y === ny);

      if (map[ny] && map[ny][nx] === 0 && !isBomb && !visited.has(key)) {
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

function canBotSurviveAfterBomb(bot, dangerMap) {
  const futureDanger = getFutureDangerMap(bot.x, bot.y, bot.bombRange);
  const combinedDanger = new Set(dangerMap);
  futureDanger.forEach(val => combinedDanger.add(val));

  const queue = [{ x: bot.x, y: bot.y }];
  const visited = new Set();
  visited.add(`${bot.x},${bot.y}`);

  const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

  while (queue.length > 0) {
    const curr = queue.shift();

    for (const d of dirs) {
      const nx = curr.x + d.x;
      const ny = curr.y + d.y;
      const key = `${nx},${ny}`;

      const isBombBlock = (nx === bot.x && ny === bot.y && curr.x !== bot.x && curr.y !== bot.y) || 
                          bombs.some(b => b.x === nx && b.y === ny);

      if (map[ny] && map[ny][nx] === 0 && !isBombBlock && !visited.has(key)) {
        if (!combinedDanger.has(key)) {
          return true;
        }
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return false;
}

function evaluateBombPosition(x, y, range, botId) {
  const affected = getAffectedTilesForBomb(x, y, range);
  let score = 0;

  affected.forEach(tile => {
    if (map[tile.y] && map[tile.y][tile.x] === 2) {
      score += 1;
    }
    Object.values(players).forEach(p => {
      if (p.id !== botId && p.isAlive && p.x === tile.x && p.y === tile.y) {
        score += 10;
      }
    });
  });

  return score;
}

setInterval(() => {
  if (gameMode !== 'solo' || isGameOver) return;

  const dangerMap = computeDangerMap();
  const now = Date.now();

  Object.values(players).forEach((bot) => {
    if (bot.isBot && bot.isAlive) {
      const currentKey = `${bot.x},${bot.y}`;
      const isCurrentDangerous = dangerMap.has(currentKey);

      // --- 1. SÉCURITÉ URGENTE ---
      if (isCurrentDangerous) {
        const escapeDir = getFirstStepTowardsClosestSafe(bot.x, bot.y, dangerMap);
        if (escapeDir) {
          movePlayer(bot.id, escapeDir);
          return;
        }
      }

      // --- 2. POSER BOMBE SI STRATÉGIQUE (Score > 0 impératif pour éviter la boucle) ---
      const elapsedSinceLastBomb = (now - bot.lastBombTime) / 1000;
      const hasBombHere = bombs.some(b => b.x === bot.x && b.y === bot.y);

      if (elapsedSinceLastBomb >= 2.5 && !hasBombHere) {
        const bombScore = evaluateBombPosition(bot.x, bot.y, bot.bombRange, bot.id);
        
        if (bombScore > 0 && canBotSurviveAfterBomb(bot, dangerMap)) {
          handlePlaceBomb(bot.id);
          bot.lastBombTime = now;
          return;
        }
      }

      // --- 3. DÉPLACEMENT STRATÉGIQUE ---
      const possibleMoves = [
        { dir: 'UP', x: bot.x, y: bot.y - 1 },
        { dir: 'DOWN', x: bot.x, y: bot.y + 1 },
        { dir: 'LEFT', x: bot.x - 1, y: bot.y },
        { dir: 'RIGHT', x: bot.x + 1, y: bot.y }
      ].filter(m => {
        const isBombOnMove = bombs.some(b => b.x === m.x && b.y === m.y);
        return map[m.y] && map[m.y][m.x] === 0 && !isBombOnMove && !dangerMap.has(`${m.x},${m.y}`);
      });

      if (possibleMoves.length > 0) {
        let bestMove = possibleMoves.reduce((best, m) => {
          const score = evaluateBombPosition(m.x, m.y, bot.bombRange, bot.id);
          return score > best.score ? { move: m, score } : best;
        }, { move: possibleMoves[0], score: -1 });

        if (bestMove.score <= 0) {
          bestMove.move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        }

        movePlayer(bot.id, bestMove.move.dir);
      }
    }
  });
}, 500);

server.listen(3000, () => {
  console.log('Serveur lancé sur http://localhost:3000');
});