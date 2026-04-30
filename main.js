const WIDTH = 40;
const HEIGHT = 30;
const MAX_LOG_LINES = 4;
const VIS_RADIUS = 10;

const BASE_MAX_HP = 10;
const BASE_CLIP_SIZE = 3;
const BASE_SHOT_DAMAGE = 2;
const ENEMY_MAX_HP = 5;
const ENEMY_DAMAGE = 1;
const MAX_ENEMIES = 12;

const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0]
};

const ITEM_POOL = ["Health Kit", "Body Armor", "Extended Magazine", "Improved Barrel", "Map"];

const el = {};
let game;

const key = (x, y) => `${x},${y}`;
const samePos = (a, b) => a.x === b.x && a.y === b.y;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function wireElements() {
  Object.assign(el, {
    grid: document.getElementById("grid"),
    hp: document.getElementById("hp"),
    maxHp: document.getElementById("max-hp"),
    shots: document.getElementById("shots"),
    turn: document.getElementById("turn"),
    kills: document.getElementById("kills"),
    enemyCount: document.getElementById("enemy-count"),
    log: document.getElementById("message-log"),
    inventory: document.getElementById("inventory"),
    build: document.getElementById("build"),
    overlay: document.getElementById("chest-overlay"),
    chestText: document.getElementById("chest-text"),
    takeBtn: document.getElementById("take-btn"),
    leaveBtn: document.getElementById("leave-btn"),
    dpad: document.querySelector(".dpad"),
    waitBtn: document.getElementById("wait-btn"),
    reloadBtn: document.getElementById("reload-btn"),
    restartBtn: document.getElementById("restart-btn")
  });
}

function hasRequiredElements() {
  return Object.values(el).every(Boolean);
}

function showBootError(message) {
  const text = `Startup error: ${message}`;
  if (el.grid) el.grid.textContent = "The game failed to launch.";
  if (el.log) el.log.innerHTML = `<p>${escapeHtml(text)}</p>`;
  console.error(text);
}

function newGame() {
  const map = generateDungeon();
  game = {
    map,
    walls: map.walls,
    floors: map.floors,
    doors: map.doors,
    chests: map.chests,
    exit: map.exit,
    visible: new Set(),
    enemies: [],
    inventory: [],
    pendingChest: null,
    player: { x: map.start.x, y: map.start.y, hp: BASE_MAX_HP, maxHp: BASE_MAX_HP },
    shots: BASE_CLIP_SIZE,
    maxShots: BASE_CLIP_SIZE,
    shotDamage: BASE_SHOT_DAMAGE,
    mapFound: false,
    turn: 0,
    kills: 0,
    over: false,
    won: false,
    logs: ["Explore the dungeon."],
    hoverKey: null
  };

  recalcVisibility();
  spawnEnemies(6);
  recalcVisibility();
  closeChestOverlay();
  render();
}

function generateDungeon() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const walls = new Set();
    const floors = new Set();
    const rooms = [];

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) walls.add(key(x, y));
    }

    for (let i = 0; i < 12; i++) {
      const w = randInt(5, 9);
      const h = randInt(4, 7);
      const x = randInt(1, WIDTH - w - 2);
      const y = randInt(1, HEIGHT - h - 2);
      const room = { x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) };
      if (rooms.some((r) => rectanglesOverlap(room, r))) continue;
      rooms.push(room);
      carveRoom(room, walls, floors);
    }

    if (rooms.length < 4) continue;

    rooms.sort((a, b) => a.cx - b.cx);
    for (let i = 1; i < rooms.length; i++) {
      const a = rooms[i - 1];
      const b = rooms[i];
      if (Math.random() < 0.5) {
        carveCorridor(a.cx, a.cy, b.cx, a.cy, walls, floors);
        carveCorridor(b.cx, a.cy, b.cx, b.cy, walls, floors);
      } else {
        carveCorridor(a.cx, a.cy, a.cx, b.cy, walls, floors);
        carveCorridor(a.cx, b.cy, b.cx, b.cy, walls, floors);
      }
    }

    const startRoom = rooms[0];
    const exitRoom = rooms[rooms.length - 1];
    const start = { x: startRoom.cx, y: startRoom.cy };
    const exit = { x: exitRoom.cx, y: exitRoom.cy };
    const doors = placeDoors(floors, walls, start, exit);
    const chests = placeChests(floors, doors, start, exit, rooms);
    return { walls, floors, rooms, start, exit, doors, chests };
  }

  return fallbackDungeon();
}

function rectanglesOverlap(a, b) {
  return a.x <= b.x + b.w + 1 && a.x + a.w + 1 >= b.x && a.y <= b.y + b.h + 1 && a.y + a.h + 1 >= b.y;
}

function carveRoom(room, walls, floors) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) carveFloor(x, y, walls, floors);
  }
}

function carveFloor(x, y, walls, floors) {
  if (!inBounds(x, y)) return;
  walls.delete(key(x, y));
  floors.add(key(x, y));
}

function carveCorridor(x1, y1, x2, y2, walls, floors) {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) carveFloor(x, y1, walls, floors);
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) carveFloor(x2, y, walls, floors);
}

function fallbackDungeon() {
  const walls = new Set();
  const floors = new Set();
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) walls.add(key(x, y));
  const room = { x: 4, y: 4, w: WIDTH - 8, h: HEIGHT - 8, cx: 8, cy: 8 };
  carveRoom(room, walls, floors);
  return {
    walls,
    floors,
    rooms: [room],
    start: { x: 8, y: 8 },
    exit: { x: WIDTH - 9, y: HEIGHT - 9 },
    doors: [],
    chests: [{ x: 10, y: 8, item: "Health Kit" }]
  };
}

function placeDoors(floors, walls, start, exit) {
  const candidates = [];
  for (const pos of floors) {
    const [x, y] = pos.split(",").map(Number);
    if (samePos({ x, y }, start) || samePos({ x, y }, exit)) continue;
    const leftWall = walls.has(key(x - 1, y));
    const rightWall = walls.has(key(x + 1, y));
    const upWall = walls.has(key(x, y - 1));
    const downWall = walls.has(key(x, y + 1));
    const horizontalPassage = !leftWall && !rightWall && upWall && downWall;
    const verticalPassage = leftWall && rightWall && !upWall && !downWall;
    if (horizontalPassage || verticalPassage) candidates.push({ x, y });
  }

  shuffle(candidates);
  const doors = [];
  const maxDoors = Math.min(4, candidates.length);
  for (let i = 0; i < maxDoors; i++) {
    if (Math.random() < 0.55) doors.push({ ...candidates[i], locked: false });
  }

  for (let i = 0; i < doors.length && i < 2; i++) {
    if (Math.random() < 0.45) doors[i].locked = true;
  }
  return doors;
}

function placeChests(floors, doors, start, exit, rooms) {
  const blocked = new Set([key(start.x, start.y), key(exit.x, exit.y), ...doors.map((d) => key(d.x, d.y))]);
  const lockedCount = doors.filter((d) => d.locked).length;
  const chestCount = Math.min(4, Math.max(2, lockedCount + 2));
  const chests = [];
  const earlyRoom = rooms[0];

  for (let i = 0; i < lockedCount; i++) {
    const pos = randomFloorInRoom(earlyRoom, blocked, floors);
    if (pos) {
      chests.push({ ...pos, item: "Key" });
      blocked.add(key(pos.x, pos.y));
    }
  }

  const floorList = [...floors].filter((p) => !blocked.has(p));
  shuffle(floorList);
  while (chests.length < chestCount && floorList.length) {
    const [x, y] = floorList.pop().split(",").map(Number);
    const item = ITEM_POOL[randInt(0, ITEM_POOL.length - 1)];
    chests.push({ x, y, item });
    blocked.add(key(x, y));
  }

  return chests;
}

function randomFloorInRoom(room, blocked, floors) {
  const spots = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const p = key(x, y);
      if (floors.has(p) && !blocked.has(p)) spots.push({ x, y });
    }
  }
  return spots.length ? spots[randInt(0, spots.length - 1)] : null;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function recalcVisibility() {
  game.visible.clear();
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dist = Math.hypot(x - game.player.x, y - game.player.y);
      if (dist <= VIS_RADIUS && hasLine(game.player.x, game.player.y, x, y, true)) game.visible.add(key(x, y));
    }
  }
}

function hasLine(x0, y0, x1, y1, stopAtWall) {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;

  while (!(x === x1 && y === y1)) {
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if (x === x1 && y === y1) break;
    if (stopAtWall && game.walls.has(key(x, y))) return false;
  }
  return true;
}

function enemyAt(x, y) { return game.enemies.find((e) => e.x === x && e.y === y); }
function chestAt(x, y) { return game.chests.find((c) => c.x === x && c.y === y); }
function doorAt(x, y) { return game.doors.find((d) => d.x === x && d.y === y); }
function enemySymbol(enemy) { return enemy.hp === ENEMY_MAX_HP ? "H" : "h"; }

function addLog(message) {
  game.logs.push(message);
  game.logs = game.logs.slice(-MAX_LOG_LINES);
}

function resolveAction(action) {
  if (game.over || game.pendingChest) return;
  const valid = action();
  if (!valid) { render(); return; }

  cleanupDead();
  recalcVisibility();

  if (!game.over && !game.won && game.turn % 2 === 0) enemiesTurn();
  if (!game.over && !game.won && game.turn % 4 === 0 && game.enemies.length < MAX_ENEMIES) spawnEnemies(1);

  cleanupDead();
  recalcVisibility();
  checkEnd();
  render();
}

function move(dx, dy) {
  resolveAction(() => {
    const nx = game.player.x + dx;
    const ny = game.player.y + dy;
    const p = key(nx, ny);

    if (!inBounds(nx, ny) || game.walls.has(p)) {
      addLog("A wall blocks your way.");
      return false;
    }

    const door = doorAt(nx, ny);
    if (door && door.locked) {
      if (!consumeKey()) {
        addLog("The door is locked. You need a key.");
        return false;
      }
      door.locked = false;
      addLog("You unlock the door with a key.");
    }

    const foe = enemyAt(nx, ny);
    if (foe) {
      foe.hp -= 1;
      addLog(`You strike ${enemySymbol(foe)} for 1.`);
    } else {
      game.player.x = nx;
      game.player.y = ny;

      const chest = chestAt(nx, ny);
      if (chest) {
        game.pendingChest = chest;
        addLog(`Chest found: ${chest.item}.`);
        openChestOverlay(chest);
      }

      if (nx === game.exit.x && ny === game.exit.y) {
        game.won = true;
        game.over = true;
        addLog("Exit reached.");
        addLog("Level complete.");
      }
    }

    game.turn++;
    return true;
  });
}

function tryShootAt(x, y) {
  resolveAction(() => {
    const targetKey = key(x, y);
    if (!game.visible.has(targetKey)) {
      addLog("You can't see a target there.");
      return false;
    }

    const foe = enemyAt(x, y);
    if (!foe) {
      addLog("No visible target.");
      return false;
    }

    if (game.shots <= 0) {
      addLog("Out of shots. Reload first.");
      return false;
    }

    const dx = x - game.player.x;
    const dy = y - game.player.y;
    const aligned = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
    if (!aligned) {
      addLog("No clear shot.");
      return false;
    }

    if (!hasLine(game.player.x, game.player.y, x, y, true)) {
      addLog("A wall blocks your shot.");
      return false;
    }

    foe.hp -= game.shotDamage;
    game.shots--;
    game.turn++;
    addLog(`You shoot ${enemySymbol(foe)} for ${game.shotDamage}.`);
    return true;
  });
}

function reload() {
  resolveAction(() => {
    if (game.shots === game.maxShots) {
      addLog("Your clip is already full.");
      return false;
    }
    game.shots = game.maxShots;
    game.turn++;
    addLog("Reloaded.");
    return true;
  });
}

function waitTurn() {
  resolveAction(() => {
    game.turn++;
    addLog("You wait.");
    return true;
  });
}

function enemiesTurn() {
  let attacks = 0;
  for (const enemy of game.enemies) {
    const dx = game.player.x - enemy.x;
    const dy = game.player.y - enemy.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      applyDamage(ENEMY_DAMAGE);
      attacks++;
      continue;
    }

    const options = [];
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) options.push([enemy.x + Math.sign(dx), enemy.y]);
    if (dy !== 0) options.push([enemy.x, enemy.y + Math.sign(dy)]);
    if (Math.abs(dx) < Math.abs(dy) && dx !== 0) options.push([enemy.x + Math.sign(dx), enemy.y]);

    for (const [nx, ny] of options) {
      const d = doorAt(nx, ny);
      if (!isEnemyPassable(nx, ny) || (d && d.locked)) continue;
      enemy.x = nx;
      enemy.y = ny;
      break;
    }
  }
  if (attacks) addLog(`Enemy pressure: ${attacks} attack${attacks > 1 ? "s" : ""}.`);
}

function isEnemyPassable(x, y) {
  return inBounds(x, y) &&
    game.floors.has(key(x, y)) &&
    !game.walls.has(key(x, y)) &&
    !enemyAt(x, y) &&
    !(game.player.x === x && game.player.y === y);
}

function spawnEnemies(count) {
  const candidates = [];
  for (const p of game.floors) {
    const [x, y] = p.split(",").map(Number);
    if (game.visible.has(p)) continue;
    if (enemyAt(x, y) || chestAt(x, y) || doorAt(x, y)) continue;
    if (x === game.exit.x && y === game.exit.y) continue;
    candidates.push({ x, y, dist: Math.abs(x - game.player.x) + Math.abs(y - game.player.y) });
  }

  candidates.sort((a, b) => b.dist - a.dist);
  let spawned = 0;
  while (spawned < count && candidates.length) {
    const pick = candidates.splice(randInt(0, Math.min(10, candidates.length - 1)), 1)[0];
    game.enemies.push({ x: pick.x, y: pick.y, hp: ENEMY_MAX_HP });
    spawned++;
  }
}

function cleanupDead() {
  const before = game.enemies.length;
  game.enemies = game.enemies.filter((e) => e.hp > 0);
  const dead = before - game.enemies.length;
  if (dead) {
    game.kills += dead;
    addLog(`Enemy killed (${dead}).`);
  }
}

function consumeKey() {
  const index = game.inventory.findIndex((item) => item.name === "Key");
  if (index === -1) return false;
  game.inventory.splice(index, 1);
  return true;
}

function applyDamage(damage) {
  let remaining = damage;
  const armor = game.inventory.find((item) => item.name === "Body Armor");
  if (armor && armor.armor > 0) {
    const blocked = Math.min(armor.armor, remaining);
    armor.armor -= blocked;
    remaining -= blocked;
    addLog(`Your armor absorbs ${blocked} damage.`);
    if (armor.armor <= 0) {
      game.inventory = game.inventory.filter((item) => item !== armor);
      addLog("Body Armor breaks.");
    }
  }

  if (remaining > 0) {
    game.player.hp -= remaining;
    addLog(`You take ${remaining} damage.`);
  }
}

function useItem(index) {
  resolveAction(() => {
    const item = game.inventory[index];
    if (!item) return false;

    if (item.name === "Health Kit") {
      const healed = Math.min(3, game.player.maxHp - game.player.hp);
      game.player.hp += healed;
      game.inventory.splice(index, 1);
      game.turn++;
      addLog(`You use a Health Kit and recover ${healed} HP.`);
      return true;
    }

    addLog("That item is used automatically.");
    return false;
  });
}

function takeChest() {
  if (!game.pendingChest) return;
  const chest = game.pendingChest;
  const inventoryItem = ["Health Kit", "Body Armor", "Key"].includes(chest.item);

  if (inventoryItem && game.inventory.length >= 2) {
    addLog("Inventory full.");
    closeChestOverlay();
    game.pendingChest = null;
    render();
    return;
  }

  if (chest.item === "Health Kit") game.inventory.push({ name: "Health Kit" });
  if (chest.item === "Body Armor") game.inventory.push({ name: "Body Armor", armor: 3 });
  if (chest.item === "Key") {
    game.inventory.push({ name: "Key" });
    addLog("Key obtained.");
  }
  if (chest.item === "Extended Magazine") {
    game.maxShots = 5;
    game.shots = Math.min(game.shots, game.maxShots);
    addLog("Extended Magazine installed.");
  }
  if (chest.item === "Improved Barrel") {
    game.shotDamage = 3;
    addLog("Improved Barrel installed.");
  }
  if (chest.item === "Map") {
    game.mapFound = true;
    addLog("You found a map. The floor plan is revealed.");
  }

  if (inventoryItem) addLog(`Item taken: ${chest.item}.`);
  game.chests = game.chests.filter((c) => c !== chest);
  game.pendingChest = null;
  closeChestOverlay();
  resolveAction(() => {
    game.turn++;
    return true;
  });
}

function leaveChest() {
  if (!game.pendingChest) return;
  game.pendingChest = null;
  closeChestOverlay();
  addLog("Item left.");
  render();
}

function openChestOverlay(chest) {
  el.chestText.textContent = `Found: ${chest.item}`;
  el.overlay.classList.remove("hidden");
}

function closeChestOverlay() {
  if (el.overlay) el.overlay.classList.add("hidden");
}

function checkEnd() {
  if (game.player.hp <= 0) {
    game.player.hp = 0;
    game.over = true;
    addLog("You fall. Press Restart or Space.");
  }
}

function render() {
  el.hp.textContent = Math.max(0, game.player.hp);
  el.maxHp.textContent = game.player.maxHp;
  el.shots.textContent = `${game.shots}/${game.maxShots}`;
  el.turn.textContent = game.turn;
  el.kills.textContent = game.kills;
  el.enemyCount.textContent = game.enemies.length;

  const rows = [];
  for (let y = 0; y < HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < WIDTH; x++) row.push(renderCell(x, y));
    rows.push(row.join(""));
  }

  el.grid.innerHTML = rows.join("\n");
  el.log.innerHTML = game.logs.map((msg) => `<p>${escapeHtml(msg)}</p>`).join("");
  renderInventory();
}

function renderCell(x, y) {
  const p = key(x, y);
  const visible = game.visible.has(p);
  const mapReveal = game.mapFound;

  if (game.player.x === x && game.player.y === y) return cell("@", x, y, "player");

  const foe = enemyAt(x, y);
  if (foe && visible) return cell(enemySymbol(foe), x, y, `enemy${game.hoverKey === p ? " target" : ""}`);

  if (visible) {
    const chest = chestAt(x, y);
    if (chest) return cell("C", x, y, "chest");
    if (game.exit.x === x && game.exit.y === y) return cell("E", x, y, "exit");
    const d = doorAt(x, y);
    if (d) return cell("D", x, y, d.locked ? "door locked" : "door");
    if (game.walls.has(p)) return cell("#", x, y, "wall");
    if (game.floors.has(p)) return cell(" ", x, y, "floor");
  }

  if (mapReveal) {
    if (game.exit.x === x && game.exit.y === y) return cell("E", x, y, "exit");
    const d = doorAt(x, y);
    if (d) return cell("D", x, y, d.locked ? "door locked" : "door");
    if (game.walls.has(p)) return cell("#", x, y, "wall");
    if (game.floors.has(p)) return cell(" ", x, y, "floor known");
  }

  return ".";
}

function cell(char, x, y, className) {
  return `<span class="cell ${className}" data-x="${x}" data-y="${y}">${escapeHtml(char)}</span>`;
}

function renderInventory() {
  const rows = game.inventory.map((item, index) => {
    const label = item.name === "Body Armor" ? `${item.name} (${item.armor})` : item.name;
    const button = item.name === "Health Kit" ? `<button class="btn use-item" data-idx="${index}" type="button">Use</button>` : "";
    return `<div class="inventory-row"><span>${escapeHtml(label)}</span>${button}</div>`;
  }).join("");
  el.inventory.innerHTML = `<strong>Inventory (${game.inventory.length}/2)</strong>${rows || `<div class="inventory-row"><span>(empty)</span></div>`}`;
}

function setup() {
  document.addEventListener("keydown", (event) => {
    if (!game) return;
    const k = event.key.toLowerCase();
    if (k === " " && game.over) { newGame(); return; }
    if (game.pendingChest) return;
    if (k === "w" || k === "arrowup") move(0, -1);
    if (k === "s" || k === "arrowdown") move(0, 1);
    if (k === "a" || k === "arrowleft") move(-1, 0);
    if (k === "d" || k === "arrowright") move(1, 0);
  });

  el.dpad.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-dir]");
    if (!button || game.pendingChest) return;
    const [dx, dy] = DIRS[button.dataset.dir];
    move(dx, dy);
  });

  el.waitBtn.addEventListener("click", () => { if (!game.pendingChest) waitTurn(); });
  el.reloadBtn.addEventListener("click", () => { if (!game.pendingChest) reload(); });
  el.restartBtn.addEventListener("click", newGame);
  el.takeBtn.addEventListener("click", takeChest);
  el.leaveBtn.addEventListener("click", leaveChest);

  el.grid.addEventListener("pointermove", (event) => {
    const target = event.target.closest(".enemy");
    const next = target ? key(Number(target.dataset.x), Number(target.dataset.y)) : null;
    if (game.hoverKey !== next) {
      game.hoverKey = next;
      render();
    }
  });

  el.grid.addEventListener("pointerdown", (event) => {
    const target = event.target.closest(".enemy");
    if (!target || game.pendingChest) return;
    event.preventDefault();
    tryShootAt(Number(target.dataset.x), Number(target.dataset.y));
  });

  el.inventory.addEventListener("click", (event) => {
    const button = event.target.closest(".use-item");
    if (!button || game.pendingChest) return;
    useItem(Number(button.dataset.idx));
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function bootGame() {
  wireElements();
  if (!hasRequiredElements()) {
    showBootError("Required UI elements are missing.");
    return;
  }

  try {
    setup();
    newGame();
  } catch (error) {
    showBootError(error && error.message ? error.message : "Unknown startup failure.");
    throw error;
  }
}

bootGame();
