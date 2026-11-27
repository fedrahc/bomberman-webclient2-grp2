const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Game = require('./game');
const { updateBots } = require('./bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Gestion des parties
const soloGames = new Map();
const multiGame = new Game(io);

let lobbyPlayers = {};

// Récupérer la partie d'un joueur
function getPlayerGame(socketId) {
    if (soloGames.has(socketId)) {
        return soloGames.get(socketId);
    }

    if (multiGame.players[socketId]) {
        return multiGame;
    }

    return null;
}

// Supprimer une partie solo
function removeSoloGame(socketId) {
    const game = soloGames.get(socketId);

    if (game) {
        game.reset();
        soloGames.delete(socketId);
    }
}

io.on('connection', (socket) => {

    console.log(`[Connexion] ${socket.id}`);

    // --- MODE SOLO ---
    socket.on('startSolo', () => {

        if (lobbyPlayers[socket.id] || multiGame.players[socket.id]) {
            return;
        }

        removeSoloGame(socket.id);

        const game = new Game(io);

        soloGames.set(socket.id, game);

        game.initSolo(socket.id);

        console.log(`[Solo] Partie créée pour ${socket.id}`);
    });

    // --- SALON MULTIJOUEUR ---
    socket.on('joinLobby', (playerName) => {

        if (multiGame.isRunning) {
            socket.emit('lobbyError', 'Une partie est déjà en cours.');
            return;
        }

        if (lobbyPlayers[socket.id]) {
            socket.emit('updateLobby', Object.values(lobbyPlayers));
            return;
        }

        if (Object.keys(lobbyPlayers).length >= 4) {
            socket.emit('lobbyError', 'Le salon est complet (4 joueurs max).');
            return;
        }

        removeSoloGame(socket.id);

        const isHost = Object.keys(lobbyPlayers).length === 0;

        lobbyPlayers[socket.id] = {
            id: socket.id,
            name: typeof playerName === 'string' && playerName.trim()
                ? playerName.trim()
                : `Joueur ${Object.keys(lobbyPlayers).length + 1}`,
            isHost
        };

        socket.join('multiRoom');

        io.to('multiRoom').emit(
            'updateLobby',
            Object.values(lobbyPlayers)
        );
    });

    // --- QUITTER LE SALON ---
    socket.on('leaveLobby', () => {

        socket.leave('multiRoom');

        removePlayerFromLobby(socket.id);

        multiGame.removePlayer(socket.id);
    });

    // --- LANCER LA PARTIE MULTIJOUEUR ---
    socket.on('launchMultiGame', (data) => {

        const player = lobbyPlayers[socket.id];

        const fillWithBots =
            data && typeof data.fillWithBots === 'boolean'
                ? data.fillWithBots
                : false;

        const count = Object.keys(lobbyPlayers).length;

        const canStart = fillWithBots ? count >= 1 : count >= 2;

        if (player && player.isHost && canStart && !multiGame.isRunning) {

            multiGame.initMulti(lobbyPlayers, fillWithBots);
        }
    });

    // --- DÉPLACEMENT ---
    socket.on('move', (dir) => {

        const directions = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

        if (!directions.includes(dir)) {
            return;
        }

        const game = getPlayerGame(socket.id);

        if (!game) {
            return;
        }

        game.movePlayer(socket.id, dir);
    });

    // --- POSE DE BOMBE ---
    socket.on('placeBomb', () => {

        const game = getPlayerGame(socket.id);

        if (!game) {
            return;
        }

        game.handlePlaceBomb(socket.id);
    });

    // --- RELANCER UNE PARTIE ---
    socket.on('restartMatch', () => {

        const game = getPlayerGame(socket.id);

        if (!game || !game.isGameOver) {
            return;
        }

        if (game.mode === 'solo') {

            game.initSolo(socket.id);

        } else if (game.mode === 'multi') {

          const player = lobbyPlayers[socket.id];

          const count = Object.keys(game.players).length;

          if (count < 2) {
            socket.emit('lobbyError',
            'Impossible de relancer : pas assez de joueurs.');
            return;
          }

          if (player && player.isHost) {
            game.restartMulti();
          }
        }
    });

    // --- DÉCONNEXION ---
    socket.on('disconnect', () => {

        console.log(`[Déconnexion] ${socket.id}`);

        removeSoloGame(socket.id);

        removePlayerFromLobby(socket.id);

        multiGame.removePlayer(socket.id);

        console.log('Parties solo actives :', soloGames.size);
    });
});

// --- SUPPRIMER UN JOUEUR DU SALON ---
function removePlayerFromLobby(socketId) {

    if (!lobbyPlayers[socketId]) {
        return;
    }

    const wasHost = lobbyPlayers[socketId].isHost;

    delete lobbyPlayers[socketId];

    const remainingIds = Object.keys(lobbyPlayers);

    if (wasHost && remainingIds.length > 0) {

        lobbyPlayers[remainingIds[0]].isHost = true;
    }

    io.to('multiRoom').emit(
        'updateLobby',
        Object.values(lobbyPlayers)
    );
}

// --- GESTION DES BOTS ---
setInterval(() => {

    // Bots des parties solo
    for (const game of soloGames.values()) {

        if (game.isRunning && !game.isGameOver) {

            const hasBots = Object.values(game.players)
                .some(p => p.isBot && p.isAlive);

            if (hasBots) {
                updateBots(game);
            }
        }
    }

    // Bots de la partie multijoueur
    if (multiGame.isRunning && !multiGame.isGameOver) {

        const hasBots = Object.values(multiGame.players)
            .some(p => p.isBot && p.isAlive);

        if (hasBots) {
            updateBots(multiGame);
        }
    }

}, 500);

// --- DÉMARRAGE DU SERVEUR ---
server.listen(3000, () => {

    console.log('Serveur Bomberman lancé sur http://localhost:3000');
});