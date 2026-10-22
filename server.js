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
let bombs = [];
let powerUps = [];
let gameMode = null;
let matchTimer = 120;
let timerInterval = null;

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
    map = JSON.parse(JSON.stringify(baseMap));
    bombs = [];
    powerUps = [];
    matchTimer = 120;

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

    if (gameMode === 'solo') {
      const numBots = 3;
      for (let i = 0; i < numBots; i++) {
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
          escapeDir: null,
          gameStartTime: Date.now()
        };
      }
    }

    socket.emit('gameStarted', { id: socket.id, map, players, bombs, powerUps, matchTimer });
    io.emit('updateGameData', { players, powerUps });

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (matchTimer > 0) {
        matchTimer--;
        io.emit('timerUpdate', matchTimer);
      } else {
        triggerGameOver("Temps écoulé ! Égalité");
      }
    }, 1000);
  });

  socket.on('move', (dir) => {
    movePlayer(socket.id, dir);
  });

  socket.on('placeBomb', () => {
    handlePlaceBomb(socket.id);
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('updateGameData', { players, powerUps });
  });
});

function movePlayer(id, dir) {
  const player = players[id];
  if (!player || !player.isAlive) return;

  let targetX = player.x;
  let targetY = player.y;

  if (dir === 'UP') targetY -= 1;
  if (dir === 'DOWN') targetY += 1;
  if (dir === 'LEFT') targetX -= 1;
  if (dir === 'RIGHT') targetX += 1;

  if (map[targetY] && map[targetY][targetX] === 0) {
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

  // Forcer le bot à s'écarter immédiatement sur une case sûre adjacente
  if (player.isBot) {
    const adj = [
      { dir: 'UP', x: 0, y: -1 },
      { dir: 'DOWN', x: 0, y: 1 },
      { dir: 'LEFT', x: -1, y: 0 },
      { dir: 'RIGHT', x: 1, y: 0 }
    ];
    // Trouver une case vide qui ne sera PAS touchée par cette bombe
    const safeEscapes = adj.filter(a => {
      let nx = player.x + a.x;
      let ny = player.y + a.y;
      if (!map[ny] || map[ny][nx] !== 0) return false;
      // Vérifier si cette case est dans la ligne de mire de la bombe
      const isHit = (nx === bomb.x && Math.abs(ny - bomb.y) <= bomb.range) ||
                    (ny === bomb.y && Math.abs(nx - bomb.x) <= bomb.range);
      return !isHit;
    });

    if (safeEscapes.length > 0) {
      player.escapeDir = safeEscapes[Math.floor(Math.random() * safeEscapes.length)].dir;
    } else {
      // S'il n'y a pas de case totalement hors de portée, prendre n'importe quelle case vide adjacente pour reculer
      const anyEmpty = adj.filter(a => map[player.y + a.y] && map[player.y + a.y][player.x + a.x] === 0);
      if (anyEmpty.length > 0) {
        player.escapeDir = anyEmpty[0].dir;
      }
    }
  }

  setTimeout(() => {
    explodeBomb(bomb);
  }, 3000);
}

function explodeBomb(bomb) {
  const index = bombs.findIndex((b) => b.id === bomb.id);
  if (index === -1) return;
  bombs.splice(index, 1);

  const affectedTiles = [{ x: bomb.x, y: bomb.y }];
  const directions = [
    { x: 0, y: -1 }, { x: 0, y: 1 },
    { x: -1, y: 0 }, { x: 1, y: 0 }
  ];

  directions.forEach((dir) => {
    for (let i = 1; i <= bomb.range; i++) {
      const tx = bomb.x + dir.x * i;
      const ty = bomb.y + dir.y * i;

      if (!map[ty] || map[ty][tx] === 1) break;
      affectedTiles.push({ x: tx, y: ty });

      if (map[ty][tx] === 2) {
        map[ty][tx] = 0;
        if (Math.random() < 0.45) {
          const types = ['BOMB', 'FIRE', 'HEART', 'SKULL'];
          const type = types[Math.floor(Math.random() * types.length)];
          powerUps.push({ x: tx, y: ty, type });
        }
        break;
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
  const alivePlayers = Object.values(players).filter((p) => p.isAlive);
  if (alivePlayers.length <= 1 && Object.keys(players).length > 1) {
    const winner = alivePlayers.length === 1 ? alivePlayers[0].name : 'Personne';
    triggerGameOver(`🏆 Victoire de ${winner} !`);
  }
}

function triggerGameOver(message) {
  if (timerInterval) clearInterval(timerInterval);
  io.emit('gameOver', { winner: message });

  setTimeout(() => {
    map = JSON.parse(JSON.stringify(baseMap));
    bombs = [];
    powerUps = [];
    matchTimer = 120;
    Object.values(players).forEach((p, idx) => {
      p.isAlive = true;
      p.maxBombs = 1;
      p.bombRange = 2;
      p.shield = false;
      p.x = spawnPositions[idx % spawnPositions.length].x;
      p.y = spawnPositions[idx % spawnPositions.length].y;
      if (p.isBot) {
        p.gameStartTime = Date.now();
        p.escapeDir = null;
      }
    });
    io.emit('gameReset', { map, players, powerUps, matchTimer });
    
    timerInterval = setInterval(() => {
      if (matchTimer > 0) {
        matchTimer--;
        io.emit('timerUpdate', matchTimer);
      }
    }, 1000);
  }, 4000);
}

// Carte des dangers précise
function getDangerMap() {
  const danger = {};
  bombs.forEach(bomb => {
    danger[`${bomb.x},${bomb.y}`] = true;
    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    dirs.forEach(d => {
      for (let i = 1; i <= bomb.range; i++) {
        let tx = bomb.x + d.x * i;
        let ty = bomb.y + d.y * i;
        if (!map[ty] || map[ty][tx] === 1) break;
        danger[`${tx},${ty}`] = true;
        if (map[ty][tx] === 2) break;
      }
    });
  });
  return danger;
}

// IA intelligente : Fuite immédiate si danger, attente en zone sûre, pose réfléchie
setInterval(() => {
  if (gameMode !== 'solo') return;
  const dangerMap = getDangerMap();

  Object.values(players).forEach((bot) => {
    if (bot.isBot && bot.isAlive) {
      // 1. Si le bot vient de poser une bombe, il exécute son pas de fuite en priorité absolue
      if (bot.escapeDir) {
        movePlayer(bot.id, bot.escapeDir);
        bot.escapeDir = null;
        return;
      }

      const justSpawned = (Date.now() - bot.gameStartTime) < 2500;
      const currentKey = `${bot.x},${bot.y}`;
      const inDanger = dangerMap[currentKey];

      // Si le bot est en zone de danger, il doit fuir vers une case sûre
      if (inDanger) {
        const possibleMoves = [
          { dir: 'UP', x: bot.x, y: bot.y - 1 },
          { dir: 'DOWN', x: bot.x, y: bot.y + 1 },
          { dir: 'LEFT', x: bot.x - 1, y: bot.y },
          { dir: 'RIGHT', x: bot.x + 1, y: bot.y }
        ].filter(m => map[m.y] && map[m.y][m.x] === 0);

        const safeMoves = possibleMoves.filter(m => !dangerMap[`${m.x},${m.y}`]);
        if (safeMoves.length > 0) {
          const chosen = safeMoves[Math.floor(Math.random() * safeMoves.length)];
          movePlayer(bot.id, chosen.dir);
        } else if (possibleMoves.length > 0) {
          const chosen = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
          movePlayer(bot.id, chosen.dir);
        }
        return; // S'il fuyait, il ne fait rien d'autre ce tour-ci
      }

      // 2. S'il est en sécurité : s'il n'y a pas de danger, il peut décider de poser une bombe ou d'attendre sagement
      const hasBombHere = bombs.some(b => b.x === bot.x && b.y === bot.y);
      if (!justSpawned && !hasBombHere && Math.random() < 0.15) {
        // Vérifier s'il y a un mur en bois autour de lui à détruire
        const adj = [
          { dir: 'UP', x: 0, y: -1 },
          { dir: 'DOWN', x: 0, y: 1 },
          { dir: 'LEFT', x: -1, y: 0 },
          { dir: 'RIGHT', x: 1, y: 0 }
        ];
        const hasWoodNearby = adj.some(a => map[bot.y + a.y] && map[bot.y + a.y][bot.x + a.x] === 2);
        
        if (hasWoodNearby) {
          handlePlaceBomb(bot.id);
          return;
        }
      }

      // 3. Sinon, déplacement modéré et intelligent (il s'arrête souvent s'il est en sécurité pour ne pas faire n'importe quoi)
      if (Math.random() < 0.4) {
        const possibleMoves = [
          { dir: 'UP', x: bot.x, y: bot.y - 1 },
          { dir: 'DOWN', x: bot.x, y: bot.y + 1 },
          { dir: 'LEFT', x: bot.x - 1, y: bot.y },
          { dir: 'RIGHT', x: bot.x + 1, y: bot.y }
        ].filter(m => map[m.y] && map[m.y][m.x] === 0 && !dangerMap[`${m.x},${m.y}`]);

        if (possibleMoves.length > 0) {
          const chosen = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
          movePlayer(bot.id, chosen.dir);
        }
      }
    }
  });
}, 600);

server.listen(3000, () => {
  console.log('Serveur lancé sur http://localhost:3000');
});