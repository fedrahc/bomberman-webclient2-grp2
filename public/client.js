const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 40; // Taille d'une case en pixels

let myId = null;
let map = [];
let players = {};
let bombs = [];

// Événement initial : réception de la carte et des joueurs
socket.on('init', (data) => {
  myId = data.id;
  map = data.map;
  players = data.players;
  bombs = data.bombs;
  requestAnimationFrame(draw);
});

// Événements réseau
socket.on('playerJoined', (player) => {
  players[player.id] = player;
});

socket.on('playerMoved', (data) => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
  }
});

socket.on('bombPlaced', (bomb) => {
  bombs.push(bomb);
});

socket.on('bombExploded', (data) => {
  bombs = bombs.filter((b) => !(b.x === data.x && b.y === data.y));
});

socket.on('playerLeft', (id) => {
  delete players[id];
});

// Gestion des entrées clavier
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') socket.emit('move', 'UP');
  if (e.key === 'ArrowDown') socket.emit('move', 'DOWN');
  if (e.key === 'ArrowLeft') socket.emit('move', 'LEFT');
  if (e.key === 'ArrowRight') socket.emit('move', 'RIGHT');
  if (e.code === 'Space') socket.emit('placeBomb');
});

// Fonction de rendu principal (Canvas 2D)
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Dessiner la carte (les murs solides)
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      if (map[r][c] === 1) {
        ctx.fillStyle = '#4a4e69';
        ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#22223b';
        ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // 2. Dessiner les bombes
  bombs.forEach((bomb) => {
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(
      bomb.x * TILE_SIZE + TILE_SIZE / 2,
      bomb.y * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE / 3,
      0,
      Math.PI * 2
    );
    ctx.fill();
  });

  // 3. Dessiner les joueurs
  Object.values(players).forEach((player) => {
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(
      player.x * TILE_SIZE + TILE_SIZE / 2,
      player.y * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE / 2.5,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Indicateur pour son propre personnage
    if (player.id === myId) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  });

  requestAnimationFrame(draw);
}