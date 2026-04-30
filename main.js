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
