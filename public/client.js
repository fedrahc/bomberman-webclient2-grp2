const socket = io();

// Écrans
const screens = {
  menu: document.getElementById('menu-screen'),
  lobby: document.getElementById('lobby-screen'),
  game: document.getElementById('game-screen'),
  gameover: document.getElementById('gameover-screen')
};

function showScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

// Éléments DOM
const nameInput = document.getElementById('player-name-input');
const btnSolo = document.getElementById('btn-solo');
const btnMulti = document.getElementById('btn-multi');
const btnLaunchMulti = document.getElementById('btn-launch-multi');
const btnLobbyBack = document.getElementById('btn-lobby-back');
const btnQuitGame = document.getElementById('btn-quit-game');
const btnRestartMatch = document.getElementById('btn-restart-match');
const btnGameoverMenu = document.getElementById('btn-gameover-menu');

const lobbyPlayerList = document.getElementById('lobby-player-list');
const lobbyStatus = document.getElementById('lobby-status');
const timerDisplay = document.getElementById('timer-display');
const playerListEl = document.getElementById('player-list');
const scoreListEl = document.getElementById('score-list');
const gameoverTitle = document.getElementById('gameover-title');
const finalScoreBody = document.getElementById('final-score-body');

// État local du jeu
const gameState = {
  myId: null,
  map: [],
  players: {},
  scores: {},
  bombs: [],
  powerUps: [],
  explosions: []
};

// --- ÉVÉNEMENTS BOUTONS ---
btnSolo.addEventListener('click', () => {
  socket.emit('startSolo');
});

btnMulti.addEventListener('click', () => {
  const name = nameInput.value.trim();
  socket.emit('joinLobby', name);
  showScreen('lobby');
});

btnLobbyBack.addEventListener('click', () => {
  socket.emit('leaveLobby');
  showScreen('menu');
});

btnLaunchMulti.addEventListener('click', () => {
  socket.emit('launchMultiGame');
});

btnQuitGame.addEventListener('click', () => {
  location.reload();
});

btnRestartMatch.addEventListener('click', () => {
  socket.emit('restartMatch');
});

btnGameoverMenu.addEventListener('click', () => {
  location.reload();
});

// --- ÉVÉNEMENTS SOCKET : LOBBY ---
socket.on('updateLobby', (players) => {
  lobbyPlayerList.innerHTML = '';
  let amIHost = false;

  players.forEach((p) => {
    if (p.id === socket.id && p.isHost) amIHost = true;
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${p.name} ${p.id === socket.id ? '<strong>(Vous)</strong>' : ''}</span>
      <span>${p.isHost ? '👑 Hôte' : 'Prêt'}</span>
    `;
    lobbyPlayerList.appendChild(li);
  });

  if (amIHost) {
    btnLaunchMulti.classList.remove('hidden');
    btnLaunchMulti.disabled = players.length < 2;
    lobbyStatus.innerText = players.length < 2
      ? 'En attente d’au moins 1 autre joueur...'
      : 'Prêt à démarrer !';
  } else {
    btnLaunchMulti.classList.add('hidden');
    lobbyStatus.innerText = 'En attente du lancement par l’hôte...';
  }
});

socket.on('lobbyError', (msg) => {
  alert(msg);
  showScreen('menu');
});

// --- ÉVÉNEMENTS SOCKET : JEU ---
socket.on('gameStarted', (data) => {
  gameState.myId = data.myId;
  gameState.map = data.map;
  gameState.players = data.players;
  gameState.scores = data.scores || {};
  gameState.bombs = data.bombs || [];
  gameState.powerUps = data.powerUps || [];
  gameState.explosions = [];

  showScreen('game');
  updateSidebarUI();
  requestAnimationFrame(gameLoop);
});

socket.on('timerUpdate', (seconds) => {
  const min = String(Math.floor(seconds / 60)).padStart(2, '0');
  const sec = String(seconds % 60).padStart(2, '0');
  timerDisplay.innerText = `${min}:${sec}`;
});

socket.on('playerMoved', (data) => {
  gameState.players = data.players;
  gameState.powerUps = data.powerUps;
  updateSidebarUI();
});

socket.on('bombPlaced', (bomb) => {
  gameState.bombs.push(bomb);
});

socket.on('bombExploded', (data) => {
  gameState.bombs = gameState.bombs.filter(b => b.id !== data.bombId);
  gameState.map = data.mapUpdate;
  gameState.powerUps = data.powerUps;

  gameState.explosions.push({ tiles: data.affectedTiles });
  setTimeout(() => {
    gameState.explosions.shift();
  }, 400);
});

socket.on('playerDied', (data) => {
  if (gameState.players[data.id]) {
    gameState.players[data.id].isAlive = false;
  }
  updateSidebarUI();
});

// --- ÉVÉNEMENT SOCKET : FIN DE PARTIE (PAGE DÉDIÉE) ---
socket.on('gameOver', (data) => {
  gameState.scores = data.scores;
  gameState.players = data.players;

  gameoverTitle.innerText = data.winnerMessage;
  finalScoreBody.innerHTML = '';

  // Trier les joueurs du meilleur score au plus bas
  const sortedPlayers = Object.values(gameState.players).sort((a, b) => {
    return (gameState.scores[b.id] || 0) - (gameState.scores[a.id] || 0);
  });

  sortedPlayers.forEach((p) => {
    const tr = document.createElement('tr');
    const pts = gameState.scores[p.id] || 0;
    tr.innerHTML = `
      <td><span class="player-dot" style="background-color:${p.color}"></span><strong>${p.name}</strong></td>
      <td style="color:${p.isAlive ? '#2ed573' : '#ff4757'}">${p.isAlive ? 'Survivant' : 'Éliminé'}</td>
      <td><strong>${pts} pt(s)</strong></td>
    `;
    finalScoreBody.appendChild(tr);
  });

  showScreen('gameover');
});

// --- CONTRÔLES CLAVIER ---
document.addEventListener('keydown', (e) => {
  if (screens.game.classList.contains('hidden')) return;

  if (e.key === 'ArrowUp') socket.emit('move', 'UP');
  if (e.key === 'ArrowDown') socket.emit('move', 'DOWN');
  if (e.key === 'ArrowLeft') socket.emit('move', 'LEFT');
  if (e.key === 'ArrowRight') socket.emit('move', 'RIGHT');
  if (e.code === 'Space') socket.emit('placeBomb');
});

// --- MISE À JOUR INTERFACE LATÉRALE ---
function updateSidebarUI() {
  playerListEl.innerHTML = '';
  scoreListEl.innerHTML = '';

  Object.values(gameState.players).forEach((p) => {
    // Liste joueurs vivants/morts
    const liPlayer = document.createElement('li');
    liPlayer.innerHTML = `
      <span><span class="player-dot" style="background-color:${p.color}"></span>${p.name} ${p.id === gameState.myId ? '(Vous)' : ''}</span>
      <span style="color: ${p.isAlive ? '#2ed573' : '#ff4757'}">${p.isAlive ? 'Vivant' : 'Mort 💀'}</span>
    `;
    playerListEl.appendChild(liPlayer);

    // Liste des scores
    const liScore = document.createElement('li');
    liScore.innerHTML = `
      <span><span class="player-dot" style="background-color:${p.color}"></span>${p.name}</span>
      <strong>${gameState.scores[p.id] || 0} pts</strong>
    `;
    scoreListEl.appendChild(liScore);
  });
}

// --- BOUCLE DE RENDU ---
function gameLoop() {
  if (screens.game.classList.contains('hidden')) return;
  renderGame(gameState);
  requestAnimationFrame(gameLoop);
}