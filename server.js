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
let lobbyPlayers = {}; // Joueurs en attente dans le salon multijoueur

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

  socket.on('launchMultiGame', () => {
    const player = lobbyPlayers[socket.id];
    if (player && player.isHost && Object.keys(lobbyPlayers).length >= 2) {
      game.initMulti(lobbyPlayers);
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

  // Transfert du statut d'hôte si l'hôte quitte
  const remainingIds = Object.keys(lobbyPlayers);
  if (wasHost && remainingIds.length > 0) {
    lobbyPlayers[remainingIds[0]].isHost = true;
  }

  io.to('multiRoom').emit('updateLobby', Object.values(lobbyPlayers));
}

// Boucle d'intelligence artificielle pour le mode Solo (toutes les 500ms)
setInterval(() => {
  if (game.isRunning && game.mode === 'solo' && !game.isGameOver) {
    updateBots(game);
  }
}, 500);

server.listen(3000, () => {
  console.log('Serveur Bomberman SNES lancé sur http://localhost:3000');
});