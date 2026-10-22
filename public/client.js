const socket = io();

const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const btnSolo = document.getElementById('btn-solo');
const btnMulti = document.getElementById('btn-multi');
const btnBack = document.getElementById('btn-back');
const timerDisplay = document.getElementById('timer-display');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const TILE_SIZE = 40;

let myId = null;
let map = [];
let players = {};
let bombs = [];
let powerUps = [];
let explosions = [];

const overlay = document.getElementById('game-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySubtitle = document.getElementById('overlay-subtitle');
const playerListEl = document.getElementById('player-list');

btnSolo.addEventListener('click', () => socket.emit('setGameMode', 'solo'));
btnMulti.addEventListener('click', () => socket.emit('setGameMode', 'multi'));
btnBack.addEventListener('click', () => location.reload());

socket.on('gameStarted', (data) => {
  myId = data.id;
  map = data.map;
  players = data.players;
  bombs = data.bombs || [];
  powerUps = data.powerUps || [];
  
  menuScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  updatePlayerList();
  requestAnimationFrame(draw);
});

socket.on('timerUpdate', (seconds) => {
  const min = String(Math.floor(seconds / 60)).padStart(2, '0');
  const sec = String(seconds % 60).padStart(2, '0');
  timerDisplay.innerText = `${min}:${sec}`;
});

socket.on('updateGameData', (data) => {
  if (data.players) players = data.players;
  if (data.powerUps) powerUps = data.powerUps;
  updatePlayerList();
});

socket.on('playerMoved', (data) => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
  }
  players = data.players;
  powerUps = data.powerUps;
  updatePlayerList();
});

socket.on('bombPlaced', (bomb) => {
  bombs.push(bomb);
});

socket.on('bombExploded', (data) => {
  bombs = bombs.filter((b) => b.id !== data.bombId);
  map = data.mapUpdate;
  powerUps = data.powerUps;

  explosions.push({
    tiles: data.affectedTiles,
    createdAt: Date.now()
  });

  setTimeout(() => {
    explosions.shift();
  }, 400);
});

socket.on('playerDied', (data) => {
  if (players[data.id]) {
    players[data.id].isAlive = false;
  }
  updatePlayerList();
});

socket.on('gameOver', (data) => {
  overlayTitle.innerText = data.winner;
  overlaySubtitle.innerText = 'Nouvelle partie imminente...';
  overlay.classList.remove('hidden');
});

socket.on('gameReset', (data) => {
  map = data.map;
  players = data.players;
  powerUps = data.powerUps || [];
  bombs = [];
  explosions = [];
  overlay.classList.add('hidden');
  updatePlayerList();
});

document.addEventListener('keydown', (e) => {
  if (gameScreen.classList.contains('hidden')) return;

  if (e.key === 'ArrowUp') socket.emit('move', 'UP');
  if (e.key === 'ArrowDown') socket.emit('move', 'DOWN');
  if (e.key === 'ArrowLeft') socket.emit('move', 'LEFT');
  if (e.key === 'ArrowRight') socket.emit('move', 'RIGHT');
  if (e.code === 'Space') socket.emit('placeBomb');
});

function updatePlayerList() {
  playerListEl.innerHTML = '';
  Object.values(players).forEach((p) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span><span class="player-dot" style="background-color:${p.color}"></span>${p.name} ${p.id === myId ? '(Vous)' : ''}</span>
      <span style="color: ${p.isAlive ? '#2ed573' : '#ff4757'}">${p.isAlive ? 'Vivant' : 'Mort 💀'}</span>
    `;
    playerListEl.appendChild(li);
  });
}

function draw() {
  if (gameScreen.classList.contains('hidden')) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Carte
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      if (map[r][c] === 1) {
        ctx.fillStyle = '#2f3542';
        ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#1e272c';
        ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      } else if (map[r][c] === 2) {
        ctx.fillStyle = '#e056fd';
        ctx.fillRect(c * TILE_SIZE + 3, r * TILE_SIZE + 3, TILE_SIZE - 6, TILE_SIZE - 6);
        ctx.fillStyle = '#be2edd';
        ctx.fillRect(c * TILE_SIZE + 6, r * TILE_SIZE + 6, TILE_SIZE - 12, TILE_SIZE - 12);
      }
    }
  }

  // 2. Bonus
  powerUps.forEach((pUp) => {
    const cx = pUp.x * TILE_SIZE + TILE_SIZE / 2;
    const cy = pUp.y * TILE_SIZE + TILE_SIZE / 2;

    ctx.fillStyle = pUp.type === 'BOMB' ? '#ffa502' : '#ff4757';
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE / 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pUp.type === 'BOMB' ? '+B' : '+F', cx, cy);
  });

  // 3. Bombes
  bombs.forEach((bomb) => {
    const cx = bomb.x * TILE_SIZE + TILE_SIZE / 2;
    const cy = bomb.y * TILE_SIZE + TILE_SIZE / 2;
    
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(cx, cy + 2, TILE_SIZE / 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(cx - 4, cy - 2, TILE_SIZE / 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#718093';
    ctx.fillRect(cx - 4, cy - TILE_SIZE / 3 - 4, 8, 4);

    ctx.strokeStyle = '#e1b12c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - TILE_SIZE / 3 - 4);
    ctx.quadraticCurveTo(cx + 6, cy - TILE_SIZE / 2 - 6, cx + 10, cy - TILE_SIZE / 2 - 2);
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.fillStyle = '#ff4757';
    ctx.beginPath();
    ctx.arc(cx + 10, cy - TILE_SIZE / 2 - 2, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // 4. Explosions
  explosions.forEach((exp) => {
    ctx.fillStyle = 'rgba(255, 107, 129, 0.85)';
    exp.tiles.forEach((tile) => {
      ctx.fillRect(
        tile.x * TILE_SIZE + 2,
        tile.y * TILE_SIZE + 2,
        TILE_SIZE - 4,
        TILE_SIZE - 4
      );
    });
  });

  // 5. Joueurs et Bots
  Object.values(players).forEach((player) => {
    if (!player.isAlive) return;

    const cx = player.x * TILE_SIZE + TILE_SIZE / 2;
    const cy = player.y * TILE_SIZE + TILE_SIZE / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(cx, cy + 4, TILE_SIZE / 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE / 2.5, 0, Math.PI * 2);
    ctx.fill();

    if (player.id === myId) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  });

  requestAnimationFrame(draw);
}