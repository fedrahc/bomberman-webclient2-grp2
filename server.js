const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Grille de jeu : 0 = Vide, 1 = Mur solide (Incassable)
const GRID_SIZE = 11;
const map = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];

const players = {};
const bombs = [];

// Couleurs attribuées aux joueurs successifs
const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f'];

io.on('connection', (socket) => {
  console.log(`Joueur connecté : ${socket.id}`);

  // Création du joueur
  const playerIndex = Object.keys(players).length % colors.length;
  players[socket.id] = {
    id: socket.id,
    x: 1, // Position sur la grille (colonne)
    y: 1, // Position sur la grille (ligne)
    color: colors[playerIndex]
  };

  // Envoie l'état initial au nouveau joueur
  socket.emit('init', { id: socket.id, map, players, bombs });

  // Informe les autres joueurs
  socket.broadcast.emit('playerJoined', players[socket.id]);

  // Déplacement d'un joueur
  socket.on('move', (dir) => {
    const player = players[socket.id];
    if (!player) return;

    let targetX = player.x;
    let targetY = player.y;

    if (dir === 'UP') targetY -= 1;
    if (dir === 'DOWN') targetY += 1;
    if (dir === 'LEFT') targetX -= 1;
    if (dir === 'RIGHT') targetX += 1;

    // Vérification de collision avec les murs de la carte
    if (map[targetY] && map[targetY][targetX] === 0) {
      player.x = targetX;
      player.y = targetY;
      io.emit('playerMoved', { id: socket.id, x: player.x, y: player.y });
    }
  });

  // Pose d'une bombe
  socket.on('placeBomb', () => {
    const player = players[socket.id];
    if (!player) return;

    const bomb = {
      x: player.x,
      y: player.y,
      owner: socket.id,
      id: Date.now()
    };

    bombs.push(bomb);
    io.emit('bombPlaced', bomb);

    // Explosion après 3 secondes
    setTimeout(() => {
      // Retirer la bombe du tableau
      const index = bombs.findIndex((b) => b.id === bomb.id);
      if (index !== -1) bombs.splice(index, 1);

      io.emit('bombExploded', { x: bomb.x, y: bomb.y });
    }, 3000);
  });

  // Déconnexion
  socket.on('disconnect', () => {
    console.log(`Joueur déconnecté : ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});