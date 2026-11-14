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

const spawnPositions = [
  { x: 1, y: 1 },
  { x: 9, y: 9 },
  { x: 9, y: 1 },
  { x: 1, y: 9 }
];

const colors = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502'];

class Game {
  constructor(io) {
    this.io = io;
    this.mode = null;
    this.isRunning = false;
    this.isGameOver = false;
    this.map = [];
    this.players = {};
    this.scores = {};
    this.bombs = [];
    this.powerUps = [];
    this.matchTimer = 180;
    this.timerInterval = null;
  }

  // Réinitialisation complète de l'état du jeu (débloque le bug "partie en cours")
  reset() {
    this.mode = null;
    this.isRunning = false;
    this.isGameOver = false;
    this.map = [];
    this.players = {};
    this.scores = {};
    this.bombs = [];
    this.powerUps = [];
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  initSolo(socketId) {
    this.reset();
    this.mode = 'solo';
    this.scores = { [socketId]: 0, bot_1: 0, bot_2: 0, bot_3: 0 };
    this.players = {
      [socketId]: this.createPlayerObj(socketId, 'Vous', 0, false)
    };

    for (let i = 0; i < 3; i++) {
      const botId = `bot_${i + 1}`;
      this.players[botId] = this.createPlayerObj(botId, `Bot ${i + 1}`, i + 1, true);
    }

    this.startMatch(socketId);
  }

  initMulti(lobbyPlayers, fillWithBots = false) {
    this.reset();
    this.mode = 'multi';
    this.scores = {};
    this.players = {};

    const humans = Object.values(lobbyPlayers).slice(0, 4);
    humans.forEach((lp, idx) => {
      this.players[lp.id] = this.createPlayerObj(lp.id, lp.name, idx, false);
      this.scores[lp.id] = 0;
    });

    // Ajout des bots si demandé et si la salle n'est pas pleine
    if (fillWithBots && humans.length < 4) {
      let botNum = 1;
      for (let idx = humans.length; idx < 4; idx++) {
        const botId = `bot_${botNum}`;
        this.players[botId] = this.createPlayerObj(botId, `Bot ${botNum}`, idx, true);
        this.scores[botId] = 0;
        botNum++;
      }
    }

    this.startMatch();
  }

  restartMulti() {
    Object.values(this.players).forEach((p, idx) => {
      p.isAlive = true;
      p.maxBombs = 1;
      p.bombRange = 2;
      p.x = spawnPositions[idx % spawnPositions.length].x;
      p.y = spawnPositions[idx % spawnPositions.length].y;
      if (p.isBot) p.lastBombTime = Date.now();
    });
    this.startMatch();
  }

  createPlayerObj(id, name, idx, isBot) {
    return {
      id,
      name,
      x: spawnPositions[idx].x,
      y: spawnPositions[idx].y,
      color: colors[idx],
      isAlive: true,
      isBot,
      maxBombs: 1,
      bombRange: 2,
      lastBombTime: Date.now()
    };
  }

  startMatch(targetSocketId = null) {
    this.isRunning = true;
    this.isGameOver = false;
    this.map = JSON.parse(JSON.stringify(baseMap));
    this.bombs = [];
    this.powerUps = [];
    this.matchTimer = 180;

    if (this.timerInterval) clearInterval(this.timerInterval);

    const payload = {
      map: this.map,
      players: this.players,
      bombs: this.bombs,
      powerUps: this.powerUps,
      matchTimer: this.matchTimer,
      scores: this.scores
    };

    if (this.mode === 'solo' && targetSocketId) {
      this.io.to(targetSocketId).emit('gameStarted', { ...payload, myId: targetSocketId });
    } else {
      Object.values(this.players).forEach((p) => {
        if (!p.isBot) {
          this.io.to(p.id).emit('gameStarted', { ...payload, myId: p.id });
        }
      });
    }

    this.timerInterval = setInterval(() => {
      if (this.matchTimer > 0) {
        this.matchTimer--;
        this.emitToGame('timerUpdate', this.matchTimer);
      } else {
        this.triggerGameOver('Temps écoulé ! Égalité');
      }
    }, 1000);
  }

  emitToGame(event, data) {
    if (this.mode === 'solo') {
      const human = Object.values(this.players).find(p => !p.isBot);
      if (human) this.io.to(human.id).emit(event, data);
    } else {
      this.io.to('multiRoom').emit(event, data);
    }
  }

  movePlayer(id, dir) {
    if (this.isGameOver || !this.isRunning) return;
    const player = this.players[id];
    if (!player || !player.isAlive) return;

    let targetX = player.x;
    let targetY = player.y;

    if (dir === 'UP') targetY -= 1;
    if (dir === 'DOWN') targetY += 1;
    if (dir === 'LEFT') targetX -= 1;
    if (dir === 'RIGHT') targetX += 1;

    const isBombOnTarget = this.bombs.some(b => b.x === targetX && b.y === targetY);

    if (this.map[targetY] && this.map[targetY][targetX] === 0 && !isBombOnTarget) {
      player.x = targetX;
      player.y = targetY;

      let pickedUp = false;
      const pUpIndex = this.powerUps.findIndex(p => p.x === targetX && p.y === targetY);
      if (pUpIndex !== -1) {
        const pUp = this.powerUps[pUpIndex];
        if (pUp.type === 'BOMB' && player.maxBombs < 10) player.maxBombs += 1;
        else if (pUp.type === 'FIRE') player.bombRange += 1;
        this.powerUps.splice(pUpIndex, 1);
        pickedUp = true;
      }

      this.emitToGame('playerMoved', {
        players: this.players,
        powerUps: this.powerUps,
        pickedUp
      });
    }
  }

  handlePlaceBomb(id) {
    if (this.isGameOver || !this.isRunning) return;
    const player = this.players[id];
    if (!player || !player.isAlive) return;

    const activeBombs = this.bombs.filter(b => b.owner === id).length;
    if (activeBombs >= player.maxBombs) return;

    if (this.bombs.some(b => b.x === player.x && b.y === player.y)) return;

    const bomb = {
      x: player.x,
      y: player.y,
      owner: id,
      id: Date.now() + Math.random(),
      range: player.bombRange
    };

    this.bombs.push(bomb);
    this.emitToGame('bombPlaced', bomb);

    setTimeout(() => {
      this.explodeBomb(bomb);
    }, 3000);
  }

  getAffectedTiles(bombX, bombY, bombRange) {
    const tiles = [{ x: bombX, y: bombY }];
    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

    dirs.forEach(dir => {
      for (let i = 1; i <= bombRange; i++) {
        const tx = bombX + dir.x * i;
        const ty = bombY + dir.y * i;
        if (!this.map[ty] || this.map[ty][tx] === 1) break;
        tiles.push({ x: tx, y: ty });
        if (this.map[ty][tx] === 2) break;
      }
    });
    return tiles;
  }

  explodeBomb(bomb) {
    const idx = this.bombs.findIndex(b => b.id === bomb.id);
    if (idx === -1) return;
    this.bombs.splice(idx, 1);

    const affectedTiles = this.getAffectedTiles(bomb.x, bomb.y, bomb.range);

    affectedTiles.forEach(tile => {
      if (this.map[tile.y] && this.map[tile.y][tile.x] === 2) {
        this.map[tile.y][tile.x] = 0;
        if (Math.random() < 0.45) {
          const types = ['BOMB', 'FIRE'];
          const type = types[Math.floor(Math.random() * types.length)];
          this.powerUps.push({ x: tile.x, y: tile.y, type });
        }
      }
    });

    Object.values(this.players).forEach(player => {
      if (!player.isAlive) return;
      if (affectedTiles.some(t => t.x === player.x && t.y === player.y)) {
        player.isAlive = false;
        this.emitToGame('playerDied', { id: player.id });
      }
    });

    this.emitToGame('bombExploded', {
      bombId: bomb.id,
      affectedTiles,
      mapUpdate: this.map,
      powerUps: this.powerUps
    });

    this.checkWinCondition();
  }

  checkWinCondition() {
    if (this.isGameOver) return;
    const alive = Object.values(this.players).filter(p => p.isAlive);
    if (alive.length <= 1 && Object.keys(this.players).length > 1) {
      const winner = alive.length === 1 ? alive[0] : null;
      let message = 'Égalité !';
      if (winner) {
        this.scores[winner.id] = (this.scores[winner.id] || 0) + 1;
        message = `🏆 Victoire de ${winner.name} !`;
      }
      this.triggerGameOver(message);
    }
  }

  triggerGameOver(message) {
    this.isGameOver = true;
    this.isRunning = false;
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.emitToGame('gameOver', {
      winnerMessage: message,
      players: this.players,
      scores: this.scores
    });
  }

  removePlayer(id) {
    if (this.players[id]) {
      delete this.players[id];
      delete this.scores[id];

      // S'il ne reste plus de joueurs humains, on réinitialise totalement la session
      const remainingHumans = Object.values(this.players).filter(p => !p.isBot);
      if (remainingHumans.length === 0) {
        this.reset();
      } else {
        this.checkWinCondition();
      }
    }
  }
}

module.exports = Game;