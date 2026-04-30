const WIDTH = 32;
const HEIGHT = 18;
const MAX_LOG_LINES = 4;
const VIS_RADIUS = 7;

const BASE_MAX_HP = 10;
const BASE_CLIP_SIZE = 6;
const BASE_RESERVE_AMMO = 12;
const BASE_SHOT_DAMAGE = 2;
const ENEMY_MAX_HP = 5;
const ENEMY_DAMAGE = 1;
const BASE_ENEMY_CAP = 5;
const MISS_CHANCE = 0.08;

const COLORS = ["red", "blue", "yellow", "green"];

const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0]
};

const ITEM_POOL = ["Health Kit", "Body Armor", "Ammo Box", "Extended Magazine", "Improved Barrel", "Map"];

const el = {};
let game;

const key = (x, y) => `${x},${y}`;
const samePos = (a, b) => a.x === b.x && a.y === b.y;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const titleColor = (color) => color.charAt(0).toUpperCase() + color.slice(1);

function wireElements() {
  Object.assign(el, {
    grid: document.getElementById("grid"),
    level: document.getElementById("level"),
    condition: document.getElementById("condition"),
    mode: document.getElementById("mode"),
    shots: document.getElementById("shots"),
    turn: document.getElementById("turn"),
    kills: document.getElementById("kills"),
    enemyCount: document.getElementById("enemy-count"),
    log: document.getElementById("message-log"),
    inventory: document.getElementById("inventory"),
    build: document.getElementById("build"),
    chestOverlay: document.getElementById("chest-overlay"),
    chestText: document.getElementById("chest-text"),
    takeBtn: document.getElementById("take-btn"),
    leaveBtn: document.getElementById("leave-btn"),
    levelOverlay: document.getElementById("level-overlay"),
    levelText: document.getElementById("level-text"),
    nextLevelBtn: document.getElementById("next-level-btn"),
    levelRestartBtn: document.getElementById("level-restart-btn"),
    dpad: document.querySelector(".dpad"),
    targetBtn: document.getElementById("target-btn"),
    aimBtn: document.getElementById("aim-btn"),
    fireBtn: document.getElementById("fire-btn"),
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
  startLevel({
    level: 1,
    hp: BASE_MAX_HP,
    maxHp: BASE_MAX_HP,
    shots: BASE_CLIP_SIZE,
    maxShots: BASE_CLIP_SIZE,
    reserveAmmo: BASE_RESERVE_AMMO,
    shotDamage: BASE_SHOT_DAMAGE,
    inventory: [],
    keys: [],
    totalKills: 0
  });
}

function startNextLevel() {
  if (!game || !game.won) return;

  startLevel({
    level: game.level + 1,
    hp: Math.min(game.player.maxHp, game.player.hp + 2),
    maxHp: game.player.maxHp,
    shots: game.shots,
    maxShots: game.maxShots,
    reserveAmmo: game.reserveAmmo + 3,
    shotDamage: game.shotDamage,
    inventory: game.inventory,
    keys: game.keys,
    totalKills: game.totalKills
  });
}

function startLevel(carry) {
  const map = generateDungeon();

  game = {
    level: carry.level,
    totalKills: carry.totalKills || 0,
    map,
    walls: map.walls,
    floors: map.floors,
    rooms: map.rooms,
    doors: map.doors,
    chests: map.chests,
    pickups: [],
    exit: map.exit,
    visible: new Set(),
    discovered: new Set(),
    enemies: [],
    inventory: structuredCloneInventory(carry.inventory || []),
    keys: [...new Set(carry.keys || [])],
    pendingChest: null,
    selectedTargetKey: null,
    aiming: false,
    player: { x: map.start.x, y: map.start.y, hp: carry.hp, maxHp: carry.maxHp },
    shots: carry.shots,
    maxShots: carry.maxShots,
    reserveAmmo: carry.reserveAmmo,
    shotDamage: carry.shotDamage,
    mapFound: false,
    turn: 0,
    kills: 0,
    over: false,
    won: false,
    logs: [`Floor ${carry.level}. Find the ${titleColor(map.exit.color)} Key, then escape.`]
  };

  recalcVisibility();
  spawnEnemies(Math.min(3 + game.level, enemyCap()));
  recalcVisibility();
  closeChestOverlay();
  closeLevelOverlay();
  ensureTargetValid(false);
  render();
}

function structuredCloneInventory(items) {
  return items.map((item) => ({ ...item }));
}

function generateDungeon() {
  for (let attempt = 0; attempt < 40; attempt++) {
    const walls = new Set();
    const floors = new Set();

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) walls.add(key(x, y));
    }

    const rooms = [];
    const connections = [];
    const firstRoom = {
      x: randInt(3, 9),
      y: randInt(3, 8),
      w: randInt(5, 7),
      h: randInt(4, 5)
    };
    finishRoom(firstRoom);
    rooms.push(firstRoom);
    carveRoom(firstRoom, walls, floors);

    for (let i = 0; i < 12; i++) {
      const made = tryAttachRoom(rooms, connections, walls, floors);
      if (!made && rooms.length >= 5) break;
    }

    if (rooms.length < 4) continue;

    const startRoom = rooms[0];
    const start = { x: startRoom.cx, y: startRoom.cy };
    const exitRoom = farthestRoom(rooms, start);
    const exit = carveEdgeExit(exitRoom, walls, floors);
    const doors = placeDoorsFromConnections(connections, start, exit);
    const chests = placeChests(rooms, doors, start, exit);

    return { walls, floors, rooms, start, exit, doors, chests };
  }

  return fallbackDungeon();
}

function finishRoom(room) {
  room.cx = room.x + Math.floor(room.w / 2);
  room.cy = room.y + Math.floor(room.h / 2);
}

function tryAttachRoom(rooms, connections, walls, floors) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const parent = rooms[randInt(0, rooms.length - 1)];
    const dir = ["left", "right", "up", "down"][randInt(0, 3)];
    const w = randInt(4, 8);
    const h = randInt(3, 5);
    let x;
    let y;

    if (dir === "right") {
      x = parent.x + parent.w;
      y = randInt(parent.y - h + 2, parent.y + parent.h - 2);
    } else if (dir === "left") {
      x = parent.x - w;
      y = randInt(parent.y - h + 2, parent.y + parent.h - 2);
    } else if (dir === "down") {
      x = randInt(parent.x - w + 2, parent.x + parent.w - 2);
      y = parent.y + parent.h;
    } else {
      x = randInt(parent.x - w + 2, parent.x + parent.w - 2);
      y = parent.y - h;
    }

    const room = { x, y, w, h };
    finishRoom(room);

    if (room.x < 1 || room.y < 1 || room.x + room.w >= WIDTH - 1 || room.y + room.h >= HEIGHT - 1) continue;
    if (rooms.some((r) => rectanglesOverlap(room, r))) continue;

    const connection = sharedOpening(parent, room, dir);
    if (!connection) continue;

    rooms.push(room);
    connections.push(connection);
    carveRoom(room, walls, floors);
    carveFloor(connection.x, connection.y, walls, floors);
    return true;
  }

  return false;
}

function sharedOpening(parent, room, dir) {
  if (dir === "right" || dir === "left") {
    const overlapTop = Math.max(parent.y, room.y);
    const overlapBottom = Math.min(parent.y + parent.h - 1, room.y + room.h - 1);
    if (overlapBottom < overlapTop) return null;
    const y = randInt(overlapTop, overlapBottom);
    const x = dir === "right" ? room.x : parent.x;
    return { x, y, color: randomColor(), locked: Math.random() < 0.28 };
  }

  const overlapLeft = Math.max(parent.x, room.x);
  const overlapRight = Math.min(parent.x + parent.w - 1, room.x + room.w - 1);
  if (overlapRight < overlapLeft) return null;
  const x = randInt(overlapLeft, overlapRight);
  const y = dir === "down" ? room.y : parent.y;
  return { x, y, color: randomColor(), locked: Math.random() < 0.28 };
}

function rectanglesOverlap(a, b) {
  return a.x <= b.x + b.w &&
    a.x + a.w >= b.x &&
    a.y <= b.y + b.h &&
    a.y + a.h >= b.y;
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

function farthestRoom(rooms, start) {
  return rooms.reduce((best, room) => {
    const bestDist = Math.abs(best.cx - start.x) + Math.abs(best.cy - start.y);
    const roomDist = Math.abs(room.cx - start.x) + Math.abs(room.cy - start.y);
    return roomDist > bestDist ? room : best;
  }, rooms[0]);
}

function carveEdgeExit(room, walls, floors) {
  const distances = [
    { side: "left", value: room.cx },
    { side: "right", value: WIDTH - 1 - room.cx },
    { side: "top", value: room.cy },
    { side: "bottom", value: HEIGHT - 1 - room.cy }
  ].sort((a, b) => a.value - b.value);

  const side = distances[0].side;
  let exit;

  if (side === "left") {
    const y = clamp(room.cy, 1, HEIGHT - 2);
    for (let x = room.x; x >= 0; x--) carveFloor(x, y, walls, floors);
    exit = { x: 0, y, color: randomColor() };
  } else if (side === "right") {
    const y = clamp(room.cy, 1, HEIGHT - 2);
    for (let x = room.x + room.w - 1; x < WIDTH; x++) carveFloor(x, y, walls, floors);
    exit = { x: WIDTH - 1, y, color: randomColor() };
  } else if (side === "top") {
    const x = clamp(room.cx, 1, WIDTH - 2);
    for (let y = room.y; y >= 0; y--) carveFloor(x, y, walls, floors);
    exit = { x, y: 0, color: randomColor() };
  } else {
    const x = clamp(room.cx, 1, WIDTH - 2);
    for (let y = room.y + room.h - 1; y < HEIGHT; y++) carveFloor(x, y, walls, floors);
    exit = { x, y: HEIGHT - 1, color: randomColor() };
  }

  return exit;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function placeDoorsFromConnections(connections, start, exit) {
  const doors = [];
  const shuffled = shuffle([...connections]);

  for (const c of shuffled) {
    if (doors.length >= 4) break;
    if (samePos(c, start) || samePos(c, exit)) continue;
    if (Math.random() < 0.55) doors.push({ x: c.x, y: c.y, locked: c.locked, color: c.color });
  }

  return doors;
}

function placeChests(rooms, doors, start, exit) {
  const chests = [];
  const blocked = new Set([key(start.x, start.y), key(exit.x, exit.y), ...doors.map((d) => key(d.x, d.y))]);

  const neededColors = new Set([exit.color]);
  doors.filter((d) => d.locked).forEach((d) => neededColors.add(d.color));

  const chestRooms = shuffle([...rooms]);
  const usedRooms = new Set();

  for (const color of neededColors) {
    const room = nextUnusedRoom(chestRooms, usedRooms) || rooms[0];
    const pos = randomFloorInRoom(room, blocked);
    if (!pos) continue;
    chests.push({ ...pos, item: `${titleColor(color)} Key`, locked: false, lockColor: null, roomId: rooms.indexOf(room) });
    blocked.add(key(pos.x, pos.y));
    usedRooms.add(room);
  }

  const desiredChestCount = Math.min(rooms.length, Math.max(chests.length + 1, 3));

  while (chests.length < desiredChestCount) {
    const room = nextUnusedRoom(chestRooms, usedRooms);
    if (!room) break;
    const pos = randomFloorInRoom(room, blocked);
    if (!pos) continue;

    const canLock = gameLevelForGeneration() > 1 || Math.random() < 0.4;
    const locked = canLock && Math.random() < 0.35;
    const lockColor = locked ? [...neededColors][randInt(0, neededColors.size - 1)] : null;
    const item = randomChestItem();

    chests.push({ ...pos, item, locked, lockColor, roomId: rooms.indexOf(room) });
    blocked.add(key(pos.x, pos.y));
    usedRooms.add(room);
  }

  return chests;
}

function gameLevelForGeneration() {
  return game ? game.level : 1;
}

function nextUnusedRoom(rooms, usedRooms) {
  while (rooms.length) {
    const room = rooms.shift();
    if (!usedRooms.has(room)) return room;
  }
  return null;
}

function randomFloorInRoom(room, blocked) {
  const spots = [];

  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const p = key(x, y);
      if (!blocked.has(p)) spots.push({ x, y });
    }
  }

  return spots.length ? spots[randInt(0, spots.length - 1)] : null;
}

function randomChestItem() {
  return ITEM_POOL[randInt(0, ITEM_POOL.length - 1)];
}

function randomColor() {
  return COLORS[randInt(0, COLORS.length - 1)];
}

function fallbackDungeon() {
  const walls = new Set();
  const floors = new Set();

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) walls.add(key(x, y));
  }

  const room = { x: 3, y: 3, w: WIDTH - 6, h: HEIGHT - 6, cx: 6, cy: 6 };
  carveRoom(room, walls, floors);

  return {
    walls,
    floors,
    rooms: [room],
    start: { x: 6, y: 6 },
    exit: { x: WIDTH - 1, y: 8, color: "red" },
    doors: [],
    chests: [
      { x: 8, y: 6, item: "Red Key", locked: false, lockColor: null, roomId: 0 },
      { x: 10, y: 6, item: "Ammo Box", locked: false, lockColor: null, roomId: 0 }
    ]
  };
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

      if (dist <= VIS_RADIUS && hasLine(game.player.x, game.player.y, x, y, true)) {
        const p = key(x, y);
        game.visible.add(p);
        game.discovered.add(p);
      }
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

    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }

    if (e2 < dx) {
      err += dx;
      y += sy;
    }

    if (x === x1 && y === y1) break;
    if (stopAtWall && game.walls.has(key(x, y))) return false;
  }

  return true;
}

function enemyAt(x, y) {
  return game.enemies.find((e) => e.x === x && e.y === y);
}

function chestAt(x, y) {
  return game.chests.find((c) => c.x === x && c.y === y);
}

function doorAt(x, y) {
  return game.doors.find((d) => d.x === x && d.y === y);
}

function pickupAt(x, y) {
  return game.pickups.find((p) => p.x === x && p.y === y);
}

function enemySymbol(enemy) {
  return enemy.hp === ENEMY_MAX_HP ? "H" : "h";
}

function healthCondition(current, max) {
  const ratio = current / max;
  if (ratio > 0.6) return "healthy";
  if (ratio > 0.3) return "injured";
  return "critical";
}

function conditionLabel(condition) {
  if (condition === "healthy") return "Healthy";
  if (condition === "injured") return "Injured";
  if (condition === "critical") return "Critical";
  return "None";
}

function addLog(message) {
  game.logs.push(message);
  game.logs = game.logs.slice(-MAX_LOG_LINES);
}

function hasKey(color) {
  return game.keys.includes(color);
}

function addKey(color) {
  if (!hasKey(color)) {
    game.keys.push(color);
    addLog(`${titleColor(color)} Key obtained.`);
  } else {
    addLog(`You already have the ${titleColor(color)} Key.`);
  }
}

function visibleShootableEnemies() {
  return game.enemies
    .filter((enemy) => isShootable(enemy))
    .sort((a, b) => {
      const da = Math.abs(a.x - game.player.x) + Math.abs(a.y - game.player.y);
      const db = Math.abs(b.x - game.player.x) + Math.abs(b.y - game.player.y);
      return da - db;
    });
}

function isShootable(enemy) {
  const targetKey = key(enemy.x, enemy.y);
  if (!game.visible.has(targetKey)) return false;

  const dx = enemy.x - game.player.x;
  const dy = enemy.y - game.player.y;
  const aligned = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);

  return aligned && hasLine(game.player.x, game.player.y, enemy.x, enemy.y, true);
}

function ensureTargetValid(autoSelect = true) {
  const targets = visibleShootableEnemies();

  if (game.selectedTargetKey && targets.some((enemy) => key(enemy.x, enemy.y) === game.selectedTargetKey)) {
    return;
  }

  game.selectedTargetKey = autoSelect && targets.length ? key(targets[0].x, targets[0].y) : null;
}

function cycleTarget() {
  if (game.over || game.pendingChest || game.won) return;

  const targets = visibleShootableEnemies();

  if (!targets.length) {
    game.selectedTargetKey = null;
    addLog("No target in sight.");
    render();
    return;
  }

  const currentIndex = targets.findIndex((enemy) => key(enemy.x, enemy.y) === game.selectedTargetKey);
  const next = targets[(currentIndex + 1) % targets.length];

  game.selectedTargetKey = key(next.x, next.y);
  addLog(`Target selected: ${enemySymbol(next)}.`);
  render();
}

function aimWeapon() {
  resolveAction(() => {
    if (game.aiming) {
      addLog("Your weapon is already raised.");
      return false;
    }

    ensureTargetValid(true);
    game.aiming = true;
    game.turn++;
    addLog("You raise your weapon.");
    return true;
  });
}

function fireSelectedTarget() {
  const target = game.selectedTargetKey ? getEnemyByKey(game.selectedTargetKey) : null;

  if (!game.aiming) {
    addLog("You need to aim first.");
    render();
    return;
  }

  if (!target || !isShootable(target)) {
    addLog("No target selected.");
    ensureTargetValid(true);
    render();
    return;
  }

  tryShootAt(target.x, target.y);
}

function getEnemyByKey(posKey) {
  return game.enemies.find((enemy) => key(enemy.x, enemy.y) === posKey);
}

function resolveAction(action) {
  if (game.over || game.pendingChest) return;

  const valid = action();

  if (!valid) {
    render();
    return;
  }

  cleanupDead();
  recalcVisibility();

  if (!game.over && !game.won && game.turn % 2 === 0) enemiesTurn();
  if (!game.over && !game.won && game.turn % 5 === 0 && game.enemies.length < enemyCap()) spawnEnemies(1);

  cleanupDead();
  recalcVisibility();
  ensureTargetValid(false);
  checkEnd();
  render();
}

function enemyCap() {
  return Math.min(BASE_ENEMY_CAP + Math.floor(game.level / 2), 9);
}

function move(dx, dy) {
  resolveAction(() => {
    const nx = game.player.x + dx;
    const ny = game.player.y + dy;
    const p = key(nx, ny);

    game.aiming = false;

    if (!inBounds(nx, ny) || game.walls.has(p)) {
      addLog("A wall blocks your way.");
      return false;
    }

    const door = doorAt(nx, ny);

    if (door && door.locked) {
      if (!hasKey(door.color)) {
        addLog(`The ${door.color} door is locked.`);
        return false;
      }

      door.locked = false;
      addLog(`The ${titleColor(door.color)} Key opens the door.`);
    }

    const foe = enemyAt(nx, ny);

    if (foe) {
      foe.hp -= 1;
      addLog(foe.hp > 0 ? "You shove into the enemy. It staggers, but holds." : "You crush the weakened enemy at close range.");
      game.turn++;
      return true;
    }

    const chest = chestAt(nx, ny);

    if (chest && chest.locked) {
      if (!hasKey(chest.lockColor)) {
        addLog(`The chest is locked. It needs a ${titleColor(chest.lockColor)} Key.`);
        return false;
      }

      chest.locked = false;
      addLog(`The ${titleColor(chest.lockColor)} Key opens the chest.`);
    }

    if (nx === game.exit.x && ny === game.exit.y) {
      if (!hasKey(game.exit.color)) {
        addLog(`The ${game.exit.color} exit is sealed.`);
        return false;
      }

      game.player.x = nx;
      game.player.y = ny;
      game.won = true;
      game.over = true;
      game.turn++;
      addLog(`The ${titleColor(game.exit.color)} Key breaks the exit seal.`);
      addLog("Level complete.");
      openLevelOverlay();
      return true;
    }

    game.player.x = nx;
    game.player.y = ny;

    const pickup = pickupAt(nx, ny);
    if (pickup) collectPickup(pickup);

    const openedChest = chestAt(nx, ny);
    if (openedChest) {
      game.pendingChest = openedChest;
      addLog(`Chest found: ${openedChest.item}.`);
      openChestOverlay(openedChest);
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

    if (!isShootable(foe)) {
      addLog("No clear shot.");
      return false;
    }

    if (game.shots <= 0) {
      addLog(game.reserveAmmo > 0 ? "Your magazine is empty. Reload." : "Your weapon clicks dry. No ammunition remains.");
      return false;
    }

    game.shots--;
    game.turn++;

    if (Math.random() < MISS_CHANCE) {
      addLog("Your shot snaps wide in the dark.");
      return true;
    }

    foe.hp -= game.shotDamage;

    if (foe.hp > 0) {
      const condition = conditionLabel(healthCondition(foe.hp, ENEMY_MAX_HP)).toLowerCase();
      addLog(`Your shot hits the enemy. It persists, now ${condition}.`);
    } else {
      addLog("Your shot drops the enemy into the dark.");
    }

    return true;
  });
}

function reload() {
  resolveAction(() => {
    game.aiming = false;

    if (game.shots === game.maxShots) {
      addLog("Your magazine is already full.");
      return false;
    }

    if (game.reserveAmmo <= 0) {
      addLog("No reserve ammunition.");
      return false;
    }

    const needed = game.maxShots - game.shots;
    const loaded = Math.min(needed, game.reserveAmmo);

    game.shots += loaded;
    game.reserveAmmo -= loaded;
    game.turn++;

    addLog(`You reload ${loaded} round${loaded === 1 ? "" : "s"}.`);
    return true;
  });
}

function waitTurn() {
  resolveAction(() => {
    game.turn++;
    addLog(game.aiming ? "You hold your aim." : "You hold your ground.");
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

  if (attacks) addLog(`The horde claws at you: ${attacks} hit${attacks > 1 ? "s" : ""}.`);
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
    if (enemyAt(x, y) || chestAt(x, y) || doorAt(x, y) || pickupAt(x, y)) continue;
    if (x === game.exit.x && y === game.exit.y) continue;

    candidates.push({ x, y, dist: Math.abs(x - game.player.x) + Math.abs(y - game.player.y) });
  }

  candidates.sort((a, b) => b.dist - a.dist);

  let spawned = 0;

  while (spawned < count && candidates.length && game.enemies.length < enemyCap()) {
    const pick = candidates.splice(randInt(0, Math.min(8, candidates.length - 1)), 1)[0];
    game.enemies.push({ x: pick.x, y: pick.y, hp: ENEMY_MAX_HP });
    spawned++;
  }
}

function cleanupDead() {
  const survivors = [];
  let dead = 0;

  for (const enemy of game.enemies) {
    if (enemy.hp > 0) {
      survivors.push(enemy);
      continue;
    }

    dead++;
    maybeDropAmmo(enemy.x, enemy.y);
  }

  game.enemies = survivors;

  if (dead) {
    game.kills += dead;
    game.totalKills += dead;
    addLog(dead === 1 ? "The enemy falls silent." : `${dead} enemies fall silent.`);
  }
}

function maybeDropAmmo(x, y) {
  if (Math.random() > 0.25) return;
  if (pickupAt(x, y) || chestAt(x, y) || doorAt(x, y)) return;
  if (!game.floors.has(key(x, y))) return;

  game.pickups.push({ x, y, type: "Ammo", amount: randInt(2, 4) });
}

function collectPickup(pickup) {
  if (pickup.type === "Ammo") {
    game.reserveAmmo += pickup.amount;
    addLog(`You recover ${pickup.amount} round${pickup.amount === 1 ? "" : "s"}.`);
  }

  game.pickups = game.pickups.filter((p) => p !== pickup);
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
    const condition = conditionLabel(healthCondition(Math.max(0, game.player.hp), game.player.maxHp)).toLowerCase();
    addLog(`You take ${remaining} damage. You are ${condition}.`);
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
      addLog(`You use a Health Kit and recover to ${conditionLabel(healthCondition(game.player.hp, game.player.maxHp)).toLowerCase()}.`);
      return true;
    }

    addLog("That item is used automatically.");
    return false;
  });
}

function takeChest() {
  if (!game.pendingChest) return;

  const chest = game.pendingChest;

  if (chest.item.endsWith("Key")) {
    const color = chest.item.split(" ")[0].toLowerCase();
    addKey(color);
  }

  if (chest.item === "Health Kit") game.inventory.push({ name: "Health Kit" });

  if (chest.item === "Body Armor") game.inventory.push({ name: "Body Armor", armor: 3 });

  if (chest.item === "Ammo Box") {
    const amount = randInt(6, 10);
    game.reserveAmmo += amount;
    addLog(`Ammo box found. Reserve +${amount}.`);
  }

  if (chest.item === "Extended Magazine") {
    game.maxShots += 3;
    addLog(`Extended Magazine installed. Magazine size is now ${game.maxShots}.`);
  }

  if (chest.item === "Improved Barrel") {
    game.shotDamage += 1;
    addLog("Improved Barrel installed. Your shots hit harder.");
  }

  if (chest.item === "Map") {
    game.mapFound = true;
    addLog("You found a map. The floor plan is outlined.");
  }

  if (!chest.item.endsWith("Key")) addLog(`Item taken: ${chest.item}.`);

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
  const lockText = chest.locked ? `Locked ${titleColor(chest.lockColor)} Chest` : "Chest";
  el.chestText.textContent = `${lockText}: ${chest.item}`;
  el.chestOverlay.classList.remove("hidden");
}

function closeChestOverlay() {
  if (el.chestOverlay) el.chestOverlay.classList.add("hidden");
}

function openLevelOverlay() {
  el.levelText.textContent = `Floor ${game.level} cleared. Kills this floor: ${game.kills}. Total kills: ${game.totalKills}.`;
  el.levelOverlay.classList.remove("hidden");
}

function closeLevelOverlay() {
  if (el.levelOverlay) el.levelOverlay.classList.add("hidden");
}

function checkEnd() {
  if (game.player.hp <= 0) {
    game.player.hp = 0;
    game.over = true;
    game.aiming = false;
    addLog("You fall. Press Restart or Space.");
  }
}

function render() {
  el.level.textContent = game.level;

  const playerCondition = healthCondition(game.player.hp, game.player.maxHp);
  el.condition.textContent = conditionLabel(playerCondition);
  el.condition.className = `condition ${playerCondition}`;

  el.mode.textContent = game.aiming ? "Aim" : "Move";
  el.mode.className = game.aiming ? "aiming" : "moving";

  el.shots.textContent = `${game.shots}/${game.reserveAmmo}`;
  el.turn.textContent = game.turn;
  el.kills.textContent = game.kills;
  el.enemyCount.textContent = game.enemies.length;

  const rows = [];

  for (let y = 0; y < HEIGHT; y++) {
    const row = [];

    for (let x = 0; x < WIDTH; x++) {
      row.push(renderCell(x, y));
    }

    rows.push(row.join(""));
  }

  el.grid.innerHTML = rows.join("\n");
  el.log.innerHTML = game.logs.map((msg) => `<p>${escapeHtml(msg)}</p>`).join("");
  renderInventory();
}

function renderCell(x, y) {
  const p = key(x, y);
  const visible = game.visible.has(p);
  const remembered = game.discovered.has(p);
  const mapReveal = game.mapFound;

  if (game.player.x === x && game.player.y === y) return cell("@", x, y, "player");

  const foe = enemyAt(x, y);

  if (foe && visible) {
    const c = healthCondition(foe.hp, ENEMY_MAX_HP);
    const targetClass = game.selectedTargetKey === p ? " target" : "";
    return cell(enemySymbol(foe), x, y, `enemy ${c}${targetClass}`);
  }

  if (visible) return renderKnownCell(x, y, "");
  if (remembered) return renderKnownCell(x, y, " memory");

  if (mapReveal) {
    const d = doorAt(x, y);
    if (d) return cell("D", x, y, `door ${d.color}${d.locked ? " locked" : ""} memory`);
    if (game.exit.x === x && game.exit.y === y) return cell("E", x, y, `exit ${game.exit.color} memory`);
    if (game.walls.has(p)) return cell("#", x, y, "wall memory");
    return ".";
  }

  return ".";
}

function renderKnownCell(x, y, suffix) {
  const p = key(x, y);

  const pickup = pickupAt(x, y);
  if (!suffix && pickup) return cell("a", x, y, "ammo");

  const chest = chestAt(x, y);
  if (chest) return cell("C", x, y, `chest${suffix}`);

  if (game.exit.x === x && game.exit.y === y) return cell("E", x, y, `exit ${game.exit.color}${suffix}`);

  const d = doorAt(x, y);
  if (d) return cell("D", x, y, `door ${d.color}${d.locked ? " locked" : ""}${suffix}`);

  if (game.walls.has(p)) return cell("#", x, y, `wall${suffix}`);

  if (game.floors.has(p)) return cell(" ", x, y, `floor${suffix}`);

  return ".";
}

function cell(char, x, y, className) {
  return `<span class="cell ${className}" data-x="${x}" data-y="${y}">${escapeHtml(char)}</span>`;
}

function renderInventory() {
  const keyText = game.keys.length
    ? `Keys: ${game.keys.map(titleColor).join(", ")}`
    : "Keys: none";

  const rows = game.inventory.map((item, index) => {
    const label = item.name === "Body Armor" ? `${item.name} (${item.armor})` : item.name;
    const button = item.name === "Health Kit" ? `<button class="btn use-item" data-idx="${index}" type="button">Use</button>` : "";
    return `<div class="inventory-row"><span>${escapeHtml(label)}</span>${button}</div>`;
  }).join("");

  el.inventory.innerHTML = `<strong>${escapeHtml(keyText)}</strong>${rows || `<div class="inventory-row"><span>No carried items</span></div>`}`;
}

function setup() {
  document.addEventListener("touchmove", (event) => {
    event.preventDefault();
  }, { passive: false });

  document.addEventListener("keydown", (event) => {
    if (!game) return;

    const k = event.key.toLowerCase();

    if (k === " " && game.over && !game.won) {
      newGame();
      return;
    }

    if (game.pendingChest || game.won) return;

    if (k === "w" || k === "arrowup") move(0, -1);
    if (k === "s" || k === "arrowdown") move(0, 1);
    if (k === "a" || k === "arrowleft") move(-1, 0);
    if (k === "d" || k === "arrowright") move(1, 0);
    if (k === "t") cycleTarget();
    if (k === "f") fireSelectedTarget();
    if (k === "r") reload();
  });

  el.dpad.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-dir]");
    if (!button || game.pendingChest || game.won) return;

    const [dx, dy] = DIRS[button.dataset.dir];
    move(dx, dy);
  });

  el.targetBtn.addEventListener("click", cycleTarget);
  el.aimBtn.addEventListener("click", aimWeapon);
  el.fireBtn.addEventListener("click", fireSelectedTarget);

  el.waitBtn.addEventListener("click", () => {
    if (!game.pendingChest && !game.won) waitTurn();
  });

  el.reloadBtn.addEventListener("click", () => {
    if (!game.pendingChest && !game.won) reload();
  });

  el.restartBtn.addEventListener("click", newGame);
  el.takeBtn.addEventListener("click", takeChest);
  el.leaveBtn.addEventListener("click", leaveChest);
  el.nextLevelBtn.addEventListener("click", startNextLevel);
  el.levelRestartBtn.addEventListener("click", newGame);

  el.grid.addEventListener("pointerdown", (event) => {
    const target = event.target.closest(".enemy");
    if (!target || game.pendingChest || game.won) return;

    event.preventDefault();
    game.selectedTargetKey = key(Number(target.dataset.x), Number(target.dataset.y));
    addLog("Target marked.");
    render();
  });

  el.inventory.addEventListener("click", (event) => {
    const button = event.target.closest(".use-item");
    if (!button || game.pendingChest || game.won) return;

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
