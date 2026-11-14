const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Game = require('./game');
const { updateBots } = require('./bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const game = new Game(io);
let lobbyPlayers = {};

io.on('connection', (socket) => {
  console.log(`[Connexion] ${socket.id}`);

  // --- MODE SOLO ---
  socket.on('startSolo', () => {
    game.initSolo(socket.id);
  });

  // --- SALON MULTIJOUEUR (LOBBY) ---
  socket.on('joinLobby', (playerName) => {
    if (game.isRunning && game.mode === 'multi') {
      socket.emit('lobbyError', 'Une partie est déjà en cours.');
      return;
    }

    if (Object.keys(lobbyPlayers).length >= 4) {
      socket.emit('lobbyError', 'Le salon est complet (4 joueurs max).');
      return;
    }

    const isHost = Object.keys(lobbyPlayers).length === 0;
    lobbyPlayers[socket.id] = {
      id: socket.id,
      name: playerName || `Joueur ${Object.keys(lobbyPlayers).length + 1}`,
      isHost
    };

    socket.join('multiRoom');
    io.to('multiRoom').emit('updateLobby', Object.values(lobbyPlayers));
  });

  socket.on('leaveLobby', () => {
    removePlayerFromLobby(socket.id);
    socket.leave('multiRoom');
  });

  // Lancement sécurisé avec prise en compte des bots
  socket.on('launchMultiGame', (data) => {
    const player = lobbyPlayers[socket.id];
    const fillWithBots = data && typeof data.fillWithBots === 'boolean' ? data.fillWithBots : false;
    const count = Object.keys(lobbyPlayers).length;
    const canStart = fillWithBots ? count >= 1 : count >= 2;

    if (player && player.isHost && canStart) {
      game.initMulti(lobbyPlayers, fillWithBots);
    }
  });

  // --- ACTIONS EN JEU ---
  socket.on('move', (dir) => {
    game.movePlayer(socket.id, dir);
  });

  socket.on('placeBomb', () => {
    game.handlePlaceBomb(socket.id);
  });

  // --- FIN DE PARTIE / RELANCE ---
  socket.on('restartMatch', () => {
    if (game.mode === 'solo') {
      game.initSolo(socket.id);
    } else if (game.mode === 'multi') {
      game.restartMulti();
    }
  });

  // --- DÉCONNEXION ---
  socket.on('disconnect', () => {
    console.log(`[Déconnexion] ${socket.id}`);
    removePlayerFromLobby(socket.id);
    game.removePlayer(socket.id);
  });
});

function removePlayerFromLobby(socketId) {
  if (!lobbyPlayers[socketId]) return;
  const wasHost = lobbyPlayers[socketId].isHost;
  delete lobbyPlayers[socketId];

  const remainingIds = Object.keys(lobbyPlayers);
  if (wasHost && remainingIds.length > 0) {
    lobbyPlayers[remainingIds[0]].isHost = true;
  }

  io.to('multiRoom').emit('updateLobby', Object.values(lobbyPlayers));
}

// Boucle IA pour les bots
setInterval(() => {
  if (game.isRunning && !game.isGameOver) {
    const hasBots = Object.values(game.players).some(p => p.isBot && p.isAlive);
    if (hasBots) {
      updateBots(game);
    }
  }
}, 500);

server.listen(3000, () => {
  console.log('Serveur Bomberman SNES lancé sur http://localhost:3000');
});