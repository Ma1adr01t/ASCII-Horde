const gridEl = document.getElementById('grid');
const hudEl = document.getElementById('hud');
const logEl = document.getElementById('message-log');
const dpadEl = document.querySelector('.dpad');

const WIDTH = 18;
const HEIGHT = 12;
const MAX_LOG = 6;

let state;

function newGame() {
  state = {
    turn: 1,
    hp: 10,
    over: false,
    player: { x: Math.floor(WIDTH / 2), y: Math.floor(HEIGHT / 2) },
    enemies: [
      { x: 2, y: 2 },
      { x: WIDTH - 3, y: 2 },
      { x: 2, y: HEIGHT - 3 },
      { x: WIDTH - 3, y: HEIGHT - 3 }
    ],
    logs: ['Survive the horde. Move one tile each turn.']
  };
  render();
}

function addLog(text) {
  state.logs.push(text);
  state.logs = state.logs.slice(-MAX_LOG);
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
}

function findClosestEnemy() {
  let best = null;
  let bestDist = Infinity;
  for (const enemy of state.enemies) {
    const d = Math.abs(state.player.x - enemy.x) + Math.abs(state.player.y - enemy.y);
    if (d < bestDist) {
      bestDist = d;
      best = enemy;
    }
  }
  return best;
}

function doTurn(dx, dy) {
  if (state.over) return;

  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  if (!inBounds(nx, ny)) {
    addLog('Bumped into a wall.');
    render();
    return;
  }

  state.player.x = nx;
  state.player.y = ny;

  const beforeCount = state.enemies.length;
  state.enemies = state.enemies.filter((enemy) => !(enemy.x === nx && enemy.y === ny));
  if (state.enemies.length < beforeCount) {
    addLog('You cut down an enemy.');
  }

  // Enemies move one tile toward the player.
  for (const enemy of state.enemies) {
    if (enemy.x < state.player.x) enemy.x += 1;
    else if (enemy.x > state.player.x) enemy.x -= 1;
    else if (enemy.y < state.player.y) enemy.y += 1;
    else if (enemy.y > state.player.y) enemy.y -= 1;
  }

  const hits = state.enemies.filter((e) => e.x === state.player.x && e.y === state.player.y).length;
  if (hits > 0) {
    state.hp -= hits;
    addLog(`You take ${hits} damage.`);
  }

  if (state.hp <= 0) {
    state.over = true;
    addLog('You were overrun. Press R to restart.');
  } else if (state.enemies.length === 0) {
    state.over = true;
    addLog('Victory! You cleared the horde. Press R to restart.');
  }

  state.turn += 1;
  render();
}

function render() {
  const target = findClosestEnemy();
  hudEl.textContent = `Turn ${state.turn} | HP ${state.hp} | Enemies ${state.enemies.length}`;

  const cells = Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, () => '.'));
  for (const enemy of state.enemies) {
    cells[enemy.y][enemy.x] = 'e';
  }
  if (target) cells[target.y][target.x] = 't';
  cells[state.player.y][state.player.x] = '@';

  gridEl.innerHTML = cells
    .map((row) =>
      row
        .map((ch) => {
          if (ch === 'e') return '<span class="enemy-char">e</span>';
          if (ch === 't') return '<span class="target-char">t</span>';
          return ch;
        })
        .join(' ')
    )
    .join('\n');

  logEl.innerHTML = state.logs.map((msg) => `<p class="log-line">${msg}</p>`).join('');
}

function moveByDirection(dir) {
  if (dir === 'up') doTurn(0, -1);
  else if (dir === 'down') doTurn(0, 1);
  else if (dir === 'left') doTurn(-1, 0);
  else if (dir === 'right') doTurn(1, 0);
}

// Keyboard and D-pad both route through moveByDirection,
// so each input path uses the same movement and turn logic.
document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'arrowup' || key === 'w') moveByDirection('up');
  else if (key === 'arrowdown' || key === 's') moveByDirection('down');
  else if (key === 'arrowleft' || key === 'a') moveByDirection('left');
  else if (key === 'arrowright' || key === 'd') moveByDirection('right');
  else if (key === 'r') newGame();
});

// Use pointerdown for touch and mouse in one event path.
// This prevents double movement that can happen when both touch and click fire.
dpadEl.addEventListener('pointerdown', (event) => {
  const button = event.target.closest('button[data-dir]');
  if (!button) return;
  event.preventDefault();
  moveByDirection(button.dataset.dir);
});

newGame();
