const gridEl = document.getElementById('grid');
const hudEl = document.getElementById('hud');
const logEl = document.getElementById('message-log');
const dpadEl = document.querySelector('.dpad');

const WIDTH = 18;
const HEIGHT = 12;
const MAX_LOG = 6;
const SYNTHETIC_CLICK_GUARD_MS = 450;

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
  if (state.enemies.length < beforeCount) addLog('You cut down an enemy.');

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
  for (const enemy of state.enemies) cells[enemy.y][enemy.x] = 'e';
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

function directionFromKey(key) {
  if (key === 'arrowup' || key === 'w') return 'up';
  if (key === 'arrowdown' || key === 's') return 'down';
  if (key === 'arrowleft' || key === 'a') return 'left';
  if (key === 'arrowright' || key === 'd') return 'right';
  return null;
}

function findDirectionButton(eventTarget) {
  return eventTarget.closest('button[data-dir]');
}

function handleDpadMove(button) {
  if (!button) return;
  moveByDirection(button.dataset.dir);
}

function setupKeyboardControls() {
  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'r') {
      newGame();
      return;
    }

    const direction = directionFromKey(key);
    if (!direction) return;

    if (event.repeat) return;
    event.preventDefault();
    moveByDirection(direction);
  });
}

function setupDpadControls() {
  let mostRecentPointerMoveAt = 0;

  dpadEl.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) return;
    const button = findDirectionButton(event.target);
    if (!button) return;

    event.preventDefault();
    mostRecentPointerMoveAt = Date.now();
    handleDpadMove(button);
  });

  dpadEl.addEventListener('click', (event) => {
    const button = findDirectionButton(event.target);
    if (!button) return;

    if (Date.now() - mostRecentPointerMoveAt < SYNTHETIC_CLICK_GUARD_MS) {
      event.preventDefault();
      return;
    }

    handleDpadMove(button);
  });

  dpadEl.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });
}

setupKeyboardControls();
setupDpadControls();
newGame();
// ASCII Horde - proof-of-concept gameplay using a 40x30 text grid.
// Turn order:
// 1) Player moves one tile.
// 2) Player auto-attacks the closest enemy (1 damage).
// 3) Enemies move one tile toward player and may damage player on contact.

const GRID_WIDTH = 40;
const GRID_HEIGHT = 30;
const MAX_LOG_LINES = 4;
const SPAWN_EVERY_TURNS = 2;

const ENEMY_TYPES = {
  W: { name: "Weak", maxHp: 1 },
  M: { name: "Moderate", maxHp: 2 },
  B: { name: "Brute", maxHp: 3 },
};

const elements = {
  board: document.getElementById("board"),
  hp: document.getElementById("hp"),
  turn: document.getElementById("turn"),
  kills: document.getElementById("kills"),
  enemyCount: document.getElementById("enemy-count"),
  log: document.getElementById("log"),
  restart: document.getElementById("restart"),
};

let state;

function resetGame() {
  state = {
    player: {
      x: Math.floor(GRID_WIDTH / 2),
      y: Math.floor(GRID_HEIGHT / 2),
      hp: 10,
    },
    enemies: [],
    turn: 0,
    kills: 0,
    logs: [],
    gameOver: false,
    nextEnemyId: 1,
  };

  addLog("Welcome to ASCII Horde. Move to begin.");
  spawnEnemy();
  spawnEnemy();
  render();
}

function addLog(message) {
  state.logs.unshift(message);
  state.logs = state.logs.slice(0, MAX_LOG_LINES);
}

function randomTypeKey() {
  const roll = Math.random();
  if (roll < 0.55) return "W";
  if (roll < 0.85) return "M";
  return "B";
}

function spawnEnemy() {
  const edge = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;

  if (edge === 0) {
    x = Math.floor(Math.random() * GRID_WIDTH);
    y = 0;
  } else if (edge === 1) {
    x = GRID_WIDTH - 1;
    y = Math.floor(Math.random() * GRID_HEIGHT);
  } else if (edge === 2) {
    x = Math.floor(Math.random() * GRID_WIDTH);
    y = GRID_HEIGHT - 1;
  } else {
    x = 0;
    y = Math.floor(Math.random() * GRID_HEIGHT);
  }

  // If the spawn tile is occupied by the player or another enemy, skip spawn this turn.
  if (
    (state.player.x === x && state.player.y === y) ||
    state.enemies.some((enemy) => enemy.x === x && enemy.y === y)
  ) {
    return;
  }

  const typeKey = randomTypeKey();
  const config = ENEMY_TYPES[typeKey];

  state.enemies.push({
    id: state.nextEnemyId++,
    x,
    y,
    type: typeKey,
    hp: config.maxHp,
    maxHp: config.maxHp,
  });

  addLog(`${config.name} enemy spawned at (${x}, ${y}).`);
}

function getDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function getClosestEnemy() {
  if (state.enemies.length === 0) return null;

  let bestEnemy = state.enemies[0];
  let bestDistance = getDistance(state.player, bestEnemy);

  for (const enemy of state.enemies) {
    const distance = getDistance(state.player, enemy);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestEnemy = enemy;
    }
  }

  return bestEnemy;
}

function autoAttack() {
  const target = getClosestEnemy();
  if (!target) {
    addLog("No enemies in range to target.");
    return;
  }

  target.hp -= 1;
  addLog(`You hit ${ENEMY_TYPES[target.type].name} for 1 damage.`);

  if (target.hp <= 0) {
    state.enemies = state.enemies.filter((enemy) => enemy.id !== target.id);
    state.kills += 1;
    addLog(`${ENEMY_TYPES[target.type].name} was defeated.`);
  }
}

function moveEnemies() {
  for (const enemy of state.enemies) {
    const stepX = Math.sign(state.player.x - enemy.x);
    const stepY = Math.sign(state.player.y - enemy.y);

    // Prefer horizontal movement first, then vertical if needed.
    let newX = enemy.x;
    let newY = enemy.y;

    if (stepX !== 0) {
      newX += stepX;
    } else if (stepY !== 0) {
      newY += stepY;
    }

    enemy.x = newX;
    enemy.y = newY;

    if (enemy.x === state.player.x && enemy.y === state.player.y) {
      state.player.hp -= 1;
      addLog(`${ENEMY_TYPES[enemy.type].name} hits you for 1 damage.`);
    }
  }

  if (state.player.hp <= 0) {
    state.gameOver = true;
    addLog("You were overrun. Game over! Press Restart.");
  }
}

function getEnemyGlyph(enemy) {
  // Capital means full health; lowercase means injured.
  return enemy.hp === enemy.maxHp ? enemy.type : enemy.type.toLowerCase();
}

function renderBoard() {
  const closest = getClosestEnemy();
  let html = "";

  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      if (state.player.x === x && state.player.y === y) {
        html += "@";
        continue;
      }

      const enemy = state.enemies.find((unit) => unit.x === x && unit.y === y);
      if (enemy) {
        const glyph = getEnemyGlyph(enemy);
        if (closest && enemy.id === closest.id) {
          html += `<span class=\"target\">${glyph}</span>`;
        } else {
          html += glyph;
        }
      } else {
        html += ".";
      }
    }
    if (y < GRID_HEIGHT - 1) {
      html += "\n";
    }
  }

  elements.board.innerHTML = html;
}

function renderHUD() {
  elements.hp.textContent = Math.max(0, state.player.hp);
  elements.turn.textContent = state.turn;
  elements.kills.textContent = state.kills;
  elements.enemyCount.textContent = state.enemies.length;
}

function renderLog() {
  elements.log.innerHTML = "";

  for (const line of state.logs) {
    const item = document.createElement("li");
    item.textContent = line;
    elements.log.appendChild(item);
  }
}

function render() {
  renderBoard();
  renderHUD();
  renderLog();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function handleMove(dx, dy) {
  if (state.gameOver) return;

  const nextX = clamp(state.player.x + dx, 0, GRID_WIDTH - 1);
  const nextY = clamp(state.player.y + dy, 0, GRID_HEIGHT - 1);

  // Do not allow the player to move into an occupied enemy tile.
  if (state.enemies.some((enemy) => enemy.x === nextX && enemy.y === nextY)) {
    addLog("You cannot move into an occupied tile.");
    render();
    return;
  }

  if (nextX === state.player.x && nextY === state.player.y) {
    addLog("You bump into the edge of the map.");
    render();
    return;
  }

  state.player.x = nextX;
  state.player.y = nextY;
  state.turn += 1;

  autoAttack();

  if (!state.gameOver) {
    moveEnemies();
  }

  if (!state.gameOver && state.turn % SPAWN_EVERY_TURNS === 0) {
    spawnEnemy();
  }

  render();
}

function setupInput() {
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
    }

    if (key === "w" || key === "arrowup") handleMove(0, -1);
    if (key === "s" || key === "arrowdown") handleMove(0, 1);
    if (key === "a" || key === "arrowleft") handleMove(-1, 0);
    if (key === "d" || key === "arrowright") handleMove(1, 0);
  });

  elements.restart.addEventListener("click", resetGame);
}

setupInput();
resetGame();
