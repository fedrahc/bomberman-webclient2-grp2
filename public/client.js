const socket = io();

// ==========================================
// 1. GESTION DES PARAMÈTRES (SON & TOUCHES)
// ==========================================
const defaultKeybinds = {
  UP: 'ArrowUp',
  DOWN: 'ArrowDown',
  LEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight',
  BOMB: 'Space'
};

let settings = JSON.parse(localStorage.getItem('bomberman_settings')) || {
  volume: 0.5,
  keys: { ...defaultKeybinds }
};

let listeningForAction = null;

function saveSettings() {
  localStorage.setItem('bomberman_settings', JSON.stringify(settings));
  updateSettingsUI();
}

// Synthétiseur audio rétro (aucun fichier audio requis)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
  if (settings.volume <= 0) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  const vol = settings.volume * 0.3;

  if (type === 'bomb') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  } else if (type === 'explosion') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.35);
    gain.gain.setValueAtTime(vol * 1.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.35);
  } else if (type === 'powerup') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(660, now + 0.08);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  } else if (type === 'die') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(70, now + 0.4);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  }
}

// Éléments DOM Paramètres
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnResetKeys = document.getElementById('btn-reset-keys');
const settingsModal = document.getElementById('settings-modal');
const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');
const keybindBtns = document.querySelectorAll('.keybind-btn');
const activeControlsSummary = document.getElementById('active-controls-summary');

function formatKeyCode(code) {
  if (code === 'Space') return 'Espace';
  return code.replace('Key', '').replace('Arrow', 'Flèche ');
}

function updateSettingsUI() {
  volumeSlider.value = Math.round(settings.volume * 100);
  volumeValue.innerText = `${volumeSlider.value}%`;

  keybindBtns.forEach(btn => {
    const action = btn.dataset.action;
    btn.innerText = formatKeyCode(settings.keys[action]);
    btn.classList.remove('listening');
  });

  activeControlsSummary.innerText =
    `Haut: ${formatKeyCode(settings.keys.UP)} | Bas: ${formatKeyCode(settings.keys.DOWN)} | ` +
    `Gauche: ${formatKeyCode(settings.keys.LEFT)} | Droite: ${formatKeyCode(settings.keys.RIGHT)} | ` +
    `Bombe: ${formatKeyCode(settings.keys.BOMB)}`;
}

btnOpenSettings.addEventListener('click', () => {
  updateSettingsUI();
  settingsModal.classList.remove('hidden');
});

btnCloseSettings.addEventListener('click', () => {
  listeningForAction = null;
  settingsModal.classList.add('hidden');
});

volumeSlider.addEventListener('input', (e) => {
  settings.volume = parseInt(e.target.value, 10) / 100;
  volumeValue.innerText = `${e.target.value}%`;
  saveSettings();
});

volumeSlider.addEventListener('change', () => {
  playSound('powerup'); // Petit son de test quand on relâche le curseur
});

keybindBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    keybindBtns.forEach(b => b.classList.remove('listening'));
    listeningForAction = btn.dataset.action;
    btn.innerText = 'Appuyez...';
    btn.classList.add('listening');
  });
});

btnResetKeys.addEventListener('click', () => {
  settings.keys = { ...defaultKeybinds };
  listeningForAction = null;
  saveSettings();
});

// ==========================================
// 2. NAVIGATION ENTRE LES ÉCRANS
// ==========================================
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
const hostBotOption = document.getElementById('host-bot-option');
const chkFillBots = document.getElementById('chk-fill-bots');

const timerDisplay = document.getElementById('timer-display');
const playerListEl = document.getElementById('player-list');
const scoreListEl = document.getElementById('score-list');
const gameoverTitle = document.getElementById('gameover-title');
const finalScoreBody = document.getElementById('final-score-body');

const gameState = {
  myId: null,
  map: [],
  players: {},
  scores: {},
  bombs: [],
  powerUps: [],
  explosions: []
};

let currentLobbyCount = 0;

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

chkFillBots.addEventListener('change', () => {
  updateLaunchButtonState();
});

btnLaunchMulti.addEventListener('click', () => {
  socket.emit('launchMultiGame', { fillWithBots: chkFillBots.checked });
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

function updateLaunchButtonState() {
  const fillBots = chkFillBots.checked;
  if (fillBots) {
    btnLaunchMulti.disabled = currentLobbyCount < 1;
    lobbyStatus.innerText = currentLobbyCount < 4
      ? `Prêt ! (${4 - currentLobbyCount} bot(s) complèteront la partie)`
      : 'Salon complet (4 joueurs) !';
  } else {
    btnLaunchMulti.disabled = currentLobbyCount < 2;
    lobbyStatus.innerText = currentLobbyCount < 2
      ? 'En attente d’au moins 1 autre joueur (ou cochez les bots)...'
      : `Prêt à lancer avec ${currentLobbyCount} joueur(s) !`;
  }
}

// ==========================================
// 3. ÉVÉNEMENTS SOCKET.IO
// ==========================================
socket.on('updateLobby', (players) => {
  lobbyPlayerList.innerHTML = '';
  currentLobbyCount = players.length;
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
    hostBotOption.classList.remove('hidden');
    updateLaunchButtonState();
  } else {
    btnLaunchMulti.classList.add('hidden');
    hostBotOption.classList.add('hidden');
    lobbyStatus.innerText = 'En attente du lancement par l’hôte...';
  }
});

socket.on('lobbyError', (msg) => {
  alert(msg);
  showScreen('menu');
});

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
  if (data.pickedUp) playSound('powerup');
  updateSidebarUI();
});

socket.on('bombPlaced', (bomb) => {
  gameState.bombs.push(bomb);
  playSound('bomb');
});

socket.on('bombExploded', (data) => {
  gameState.bombs = gameState.bombs.filter(b => b.id !== data.bombId);
  gameState.map = data.mapUpdate;
  gameState.powerUps = data.powerUps;
  playSound('explosion');

  gameState.explosions.push({ tiles: data.affectedTiles });
  setTimeout(() => {
    gameState.explosions.shift();
  }, 400);
});

socket.on('playerDied', (data) => {
  if (gameState.players[data.id]) {
    gameState.players[data.id].isAlive = false;
  }
  playSound('die');
  updateSidebarUI();
});

socket.on('gameOver', (data) => {
  gameState.scores = data.scores;
  gameState.players = data.players;

  gameoverTitle.innerText = data.winnerMessage;
  finalScoreBody.innerHTML = '';

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

// ==========================================
// 4. ÉCOUTE DU CLAVIER (PARAMÈTRES & JEU)
// ==========================================
document.addEventListener('keydown', (e) => {
  // Si on est en train de reconfigurer une touche dans les paramètres
  if (listeningForAction) {
    e.preventDefault();
    settings.keys[listeningForAction] = e.code;
    listeningForAction = null;
    saveSettings();
    return;
  }

  // Bloquer les mouvements si la fenêtre des paramètres est ouverte ou hors jeu
  if (!settingsModal.classList.contains('hidden')) return;
  if (screens.game.classList.contains('hidden')) return;

  if (e.code === settings.keys.UP) socket.emit('move', 'UP');
  if (e.code === settings.keys.DOWN) socket.emit('move', 'DOWN');
  if (e.code === settings.keys.LEFT) socket.emit('move', 'LEFT');
  if (e.code === settings.keys.RIGHT) socket.emit('move', 'RIGHT');
  if (e.code === settings.keys.BOMB) {
    e.preventDefault();
    socket.emit('placeBomb');
  }
});

// Initialisation de l'affichage des paramètres au démarrage
updateSettingsUI();

function updateSidebarUI() {
  playerListEl.innerHTML = '';
  scoreListEl.innerHTML = '';

  Object.values(gameState.players).forEach((p) => {
    const liPlayer = document.createElement('li');
    liPlayer.innerHTML = `
      <span><span class="player-dot" style="background-color:${p.color}"></span>${p.name} ${p.id === gameState.myId ? '(Vous)' : ''}</span>
      <span style="color: ${p.isAlive ? '#2ed573' : '#ff4757'}">${p.isAlive ? 'Vivant' : 'Mort 💀'}</span>
    `;
    playerListEl.appendChild(liPlayer);

    const liScore = document.createElement('li');
    liScore.innerHTML = `
      <span><span class="player-dot" style="background-color:${p.color}"></span>${p.name}</span>
      <strong>${gameState.scores[p.id] || 0} pts</strong>
    `;
    scoreListEl.appendChild(liScore);
  });
}

function gameLoop() {
  if (screens.game.classList.contains('hidden')) return;
  renderGame(gameState);
  requestAnimationFrame(gameLoop);
}