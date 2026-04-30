// ASCII Horde tactical survivors-like prototype.
// Core loop per valid player action:
// 1) Resolve player action.
// 2) Remove dead enemies + update kills.
// 3) Enemies act.
// 4) Spawn/grow horde.
// 5) Render HUD/log/grid.
// 6) Check game over.

const WIDTH = 40;
const HEIGHT = 30;
const MAX_LOG_LINES = 4;
const CLIP_SIZE = 3;
const SPAWN_EVERY_TURNS = 2;

const ENEMY_TYPES = {
  weak: { maxHp: 2, damage: 1, fullSymbol: "W", hurtSymbol: "w" },
  moderate: { maxHp: 4, damage: 1, fullSymbol: "M", hurtSymbol: "m" },
  brute: { maxHp: 7, damage: 2, fullSymbol: "B", hurtSymbol: "b" }
};

const els = {
  grid: document.getElementById("grid"),
  hp: document.getElementById("hp"),
  shots: document.getElementById("shots"),
  turn: document.getElementById("turn"),
  kills: document.getElementById("kills"),
  enemyCount: document.getElementById("enemy-count"),
  log: document.getElementById("message-log"),
  dpad: document.querySelector(".dpad"),
  waitBtn: document.getElementById("wait-btn"),
  reloadBtn: document.getElementById("reload-btn"),
  restartBtn: document.getElementById("restart-btn")
};

let game;

function newGame() {
  game = {
    turn: 0,
    kills: 0,
    shots: CLIP_SIZE,
    over: false,
    logs: ["Survive the horde."],
    player: { x: Math.floor(WIDTH / 2), y: Math.floor(HEIGHT / 2), hp: 10 },
    walls: generateWalls(),
    enemies: []
  };
  spawnEnemies(4);
  render();
}

function generateWalls() {
  const walls = new Set();
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      if (Math.random() < 0.12) walls.add(`${x},${y}`);
      if (Math.random() < 0.025) {
        walls.add(`${x},${y}`); walls.add(`${x + 1},${y}`); walls.add(`${x},${y + 1}`);
      }
    }
  }
  // Keep center area clear and walkable.
  for (let y = gameCenterY() - 2; y <= gameCenterY() + 2; y++) {
    for (let x = gameCenterX() - 2; x <= gameCenterX() + 2; x++) walls.delete(`${x},${y}`);
  }
  return walls;
}

function gameCenterX() { return Math.floor(WIDTH / 2); }
function gameCenterY() { return Math.floor(HEIGHT / 2); }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT; }
function isWall(x, y) { return game.walls.has(`${x},${y}`); }
function enemyAt(x, y) { return game.enemies.find((e) => e.x === x && e.y === y); }

function addLog(text) {
  game.logs.push(text);
  game.logs = game.logs.slice(-MAX_LOG_LINES);
}

function randomEnemyType() {
  const roll = Math.random();
  if (roll < 0.5) return "weak";
  if (roll < 0.83) return "moderate";
  return "brute";
}

function spawnEnemies(count) {
  let spawned = 0;
  let tries = 0;
  while (spawned < count && tries < 150) {
    tries++;
    const fromEdge = Math.floor(Math.random() * 4);
    const x = fromEdge % 2 === 0 ? Math.floor(Math.random() * WIDTH) : (fromEdge === 1 ? WIDTH - 1 : 0);
    const y = fromEdge % 2 === 1 ? Math.floor(Math.random() * HEIGHT) : (fromEdge === 2 ? HEIGHT - 1 : 0);
    if (isWall(x, y) || enemyAt(x, y) || (game.player.x === x && game.player.y === y)) continue;
    const type = randomEnemyType();
    game.enemies.push({ x, y, type, hp: ENEMY_TYPES[type].maxHp });
    spawned++;
  }
}

function enemySymbol(enemy) {
  const t = ENEMY_TYPES[enemy.type];
  return enemy.hp === t.maxHp ? t.fullSymbol : t.hurtSymbol;
}

function resolvePlayerAction(action) {
  if (game.over) return;

  const valid = action();
  if (!valid) {
    render();
    return;
  }

  cleanupDeadEnemies();
  enemiesTakeTurn();
  if (!game.over && game.turn % SPAWN_EVERY_TURNS === 0) spawnEnemies(1);
  checkGameOver();
  render();
}

function cleanupDeadEnemies() {
  const before = game.enemies.length;
  game.enemies = game.enemies.filter((e) => e.hp > 0);
  const dead = before - game.enemies.length;
  if (dead > 0) {
    game.kills += dead;
    addLog(`You defeated ${dead} foe${dead > 1 ? "s" : ""}.`);
  }
}

function movePlayer(dx, dy) {
  return () => {
    const nx = game.player.x + dx;
    const ny = game.player.y + dy;
    if (!inBounds(nx, ny) || isWall(nx, ny)) {
      addLog("A wall blocks your way.");
      return false;
    }
    const enemy = enemyAt(nx, ny);
    if (enemy) {
      enemy.hp -= 1;
      addLog(`You strike ${enemySymbol(enemy).toUpperCase()} for 1.`);
    } else {
      game.player.x = nx;
      game.player.y = ny;
    }
    game.turn += 1;
    return true;
  };
}

function waitAction() {
  resolvePlayerAction(() => {
    game.turn += 1;
    addLog("You wait.");
    return true;
  });
}

function reloadAction() {
  resolvePlayerAction(() => {
    if (game.shots === CLIP_SIZE) {
      addLog("Your clip is already full.");
      return false;
    }
    game.shots = CLIP_SIZE;
    game.turn += 1;
    addLog("Reloaded.");
    return true;
  });
}

function tryShootEnemy(target) {
  resolvePlayerAction(() => {
    if (game.shots <= 0) {
      addLog("Out of shots. Reload first.");
      return false;
    }
    const shot = getShotInfo(target.x, target.y);
    if (!shot.aligned) {
      addLog(`No clear shot to ${enemySymbol(target).toUpperCase()}.`);
      return false;
    }
    if (shot.blockedByWall) {
      addLog("A wall blocks your shot.");
      return false;
    }

    target.hp -= 2;
    game.shots -= 1;
    game.turn += 1;
    addLog(`You shoot ${enemySymbol(target).toUpperCase()} for 2.`);
    return true;
  });
}

function getShotInfo(tx, ty) {
  const dx = tx - game.player.x;
  const dy = ty - game.player.y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const aligned = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
  if (!aligned) return { aligned: false, blockedByWall: false };

  let x = game.player.x + sx;
  let y = game.player.y + sy;
  while (!(x === tx && y === ty)) {
    if (isWall(x, y)) return { aligned: true, blockedByWall: true };
    x += sx;
    y += sy;
  }
  return { aligned: true, blockedByWall: false };
}

function enemiesTakeTurn() {
  for (const enemy of game.enemies) {
    const dx = game.player.x - enemy.x;
    const dy = game.player.y - enemy.y;
    const adjacent = Math.abs(dx) + Math.abs(dy) === 1;
    if (adjacent || (dx === 0 && dy === 0)) {
      game.player.hp -= ENEMY_TYPES[enemy.type].damage;
      addLog(`${enemySymbol(enemy).toUpperCase()} hits you.`);
      continue;
    }

    const options = [];
    if (dx !== 0) options.push({ x: enemy.x + Math.sign(dx), y: enemy.y });
    if (dy !== 0) options.push({ x: enemy.x, y: enemy.y + Math.sign(dy) });

    for (const option of options) {
      if (!inBounds(option.x, option.y) || isWall(option.x, option.y) || enemyAt(option.x, option.y)) continue;
      if (option.x === game.player.x && option.y === game.player.y) continue;
      enemy.x = option.x;
      enemy.y = option.y;
      break;
    }
  }
}

function checkGameOver() {
  if (game.player.hp <= 0) {
    game.over = true;
    addLog("You fall. Press Restart or Space.");
  }
}

function hoveredTarget() {
  if (game.hoveredEnemyId === null || game.hoveredEnemyId === undefined || game.hoveredEnemyId < 0) return null;
  return game.enemies[game.hoveredEnemyId] || null;
}

function render() {
  els.hp.textContent = Math.max(0, game.player.hp);
  els.shots.textContent = `${game.shots}/${CLIP_SIZE}`;
  els.turn.textContent = game.turn;
  els.kills.textContent = game.kills;
  els.enemyCount.textContent = game.enemies.length;

  const hover = hoveredTarget();
  const lines = [];
  for (let y = 0; y < HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < WIDTH; x++) {
      if (game.player.x === x && game.player.y === y) {
        row.push('<span class="cell player">@</span>');
        continue;
      }
      const enemy = enemyAt(x, y);
      if (enemy) {
        const isHover = hover && hover.x === x && hover.y === y;
        row.push(`<span class="cell enemy clickable${isHover ? " target" : ""}" data-x="${x}" data-y="${y}">${enemySymbol(enemy)}</span>`);
        continue;
      }
      row.push(isWall(x, y) ? '<span class="cell wall">#</span>' : '.');
    }
    lines.push(row.join(""));
  }
  els.grid.innerHTML = lines.join("\n");
  els.log.innerHTML = game.logs.map((line) => `<p>${line}</p>`).join("");
}

function setupInput() {
  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === " " && game.over) return newGame();
    if (key === "arrowup" || key === "w") return resolvePlayerAction(movePlayer(0, -1));
    if (key === "arrowdown" || key === "s") return resolvePlayerAction(movePlayer(0, 1));
    if (key === "arrowleft" || key === "a") return resolvePlayerAction(movePlayer(-1, 0));
    if (key === "arrowright" || key === "d") return resolvePlayerAction(movePlayer(1, 0));
  });

  els.dpad.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-dir]");
    if (!btn) return;
    const dir = btn.dataset.dir;
    if (dir === "up") resolvePlayerAction(movePlayer(0, -1));
    if (dir === "down") resolvePlayerAction(movePlayer(0, 1));
    if (dir === "left") resolvePlayerAction(movePlayer(-1, 0));
    if (dir === "right") resolvePlayerAction(movePlayer(1, 0));
  });

  els.waitBtn.addEventListener("click", waitAction);
  els.reloadBtn.addEventListener("click", reloadAction);
  els.restartBtn.addEventListener("click", newGame);

  els.grid.addEventListener("mousemove", (event) => {
    const span = event.target.closest(".enemy");
    game.hoveredEnemyId = null;
    if (span) {
      const x = Number(span.dataset.x);
      const y = Number(span.dataset.y);
      game.hoveredEnemyId = game.enemies.findIndex((e) => e.x === x && e.y === y);
    }
    render();
  });

  els.grid.addEventListener("click", (event) => {
    const span = event.target.closest(".enemy");
    if (!span) return;
    const target = enemyAt(Number(span.dataset.x), Number(span.dataset.y));
    if (target) tryShootEnemy(target);
  });
}

setupInput();
newGame();
