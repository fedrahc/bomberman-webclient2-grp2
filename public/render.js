const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const TILE_SIZE = 40;

function renderGame(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Carte (Murs incassables = 1, Blocs destructibles = 2)
  for (let r = 0; r < state.map.length; r++) {
    for (let c = 0; c < state.map[r].length; c++) {
      if (state.map[r][c] === 1) {
        ctx.fillStyle = '#2f3542';
        ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#1e272c';
        ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      } else if (state.map[r][c] === 2) {
        ctx.fillStyle = '#878787';
        ctx.fillRect(c * TILE_SIZE + 3, r * TILE_SIZE + 3, TILE_SIZE - 6, TILE_SIZE - 6);
        ctx.fillStyle = '#515151';
        ctx.fillRect(c * TILE_SIZE + 6, r * TILE_SIZE + 6, TILE_SIZE - 12, TILE_SIZE - 12);
      }
    }
  }

  // 2. Bonus (Power-Ups)
  state.powerUps.forEach((pUp) => {
    const cx = pUp.x * TILE_SIZE + TILE_SIZE / 2;
    const cy = pUp.y * TILE_SIZE + TILE_SIZE / 2;

    ctx.fillStyle = pUp.type === 'BOMB' ? '#ffa502' : (pUp.type === 'FIRE' ? '#ff4757' : '#a55eea');
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE / 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = pUp.type === 'BOMB' ? '+B' : (pUp.type === 'FIRE' ? '+F' : '💀');
    ctx.fillText(label, cx, cy);
  });

  // 3. Bombes
  state.bombs.forEach((bomb) => {
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
  state.explosions.forEach((exp) => {
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
  Object.values(state.players).forEach((player) => {
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

    if (player.id === state.myId) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  });
}