const MAP_WIDTH = 72;
const MAP_HEIGHT = 40;
const MINI_WIDTH = 21;
const MINI_HEIGHT = 11;
const MAX_LOG_LINES = 4;
const VIS_RADIUS = 8;
const FIRST_PERSON_DEPTH = 4;

const BASE_MAX_HP = 10;
const BASE_CLIP_SIZE = 6;
const BASE_RESERVE_AMMO = 12;
const BASE_SHOT_DAMAGE = 2;
const ENEMY_MAX_HP = 5;
const ENEMY_DAMAGE = 1;
const BASE_ENEMY_CAP = 7;
const MISS_CHANCE = 0.08;

const COLORS = ["red", "blue", "yellow", "green"];
const FACINGS = ["north", "east", "south", "west"];

const DIR_VECTORS = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 }
};

const ITEM_POOL = ["Health Kit", "Body Armor", "Ammo Box", "Extended Magazine", "Improved Barrel", "Map"];

const el = {};
let game;

const key = (x, y) => `${x},${y}`;
const samePos = (a, b) => a.x === b.x && a.y === b.y;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const titleColor = (color) => color.charAt(0).toUpperCase() + color.slice(1);

function wireElements() {
  Object.assign(el, {
    level: document.getElementById("level"),
    condition: document.getElementById("condition"),
    mode: document.getElementById("mode"),
    shots: document.getElementById("shots"),
    turn: document.getElementById("turn"),
    kills: document.getElementById("kills"),
    enemyCount: document.getElementById("enemy-count"),
    log: document.getElementById("message-log"),
    inventory: document.getElementById("inventory"),
    firstPersonView: document.getElementById("first-person-view"),
    miniMap: document.getElementById("mini-map"),
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
  if (el.firstPersonView) el.firstPersonView.textContent = "The game failed to launch.";
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
    keys: [],
    totalKills: game.totalKills
  });
}

function startLevel(carry) {
  const map = generateDungeon();

  game = {
    level: carry.level,
    totalKills: carry.totalKills || 0,
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
    inventory: carry.inventory.map((item) => ({ ...item })),
    keys: [...new Set(carry.keys || [])],
    pendingChest: null,
    selectedTargetKey: null,
    aiming: false,
    player: {
      x: map.start.x,
      y: map.start.y,
      dir: "north",
      hp: carry.hp,
      maxHp: carry.maxHp
    },
    shots: carry.shots,
    maxShots: carry.maxShots,
    reserveAmmo: carry.reserveAmmo,
    shotDamage: carry.shotDamage,
    mapFound: false,
    turn: 0,
    kills: 0,
    over: false,
    won: false,
    logs: [`Floor ${carry.level}. Find a way out.`]
  };

  recalcVisibility();
  spawnEnemies(startingEnemyCount());
  recalcVisibility();
  closeChestOverlay();
  closeLevelOverlay();
  ensureTargetValid(false);
  render();
}

function generateDungeon() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const walls = new Set();
    const floors = new Set();

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) walls.add(key(x, y));
    }

    const rooms = [];
    const connections = [];
    const firstRoom = {
      x: randInt(28, 36),
      y: randInt(15, 22),
      w: randInt(6, 10),
      h: randInt(4, 7)
    };

    finishRoom(firstRoom);
    rooms.push(firstRoom);
    carveRoom(firstRoom, walls, floors);

    let failureStreak = 0;

    while (rooms.length < 22 && failureStreak < 180) {
      const made = tryAttachRoom(rooms, connections, walls, floors);
      if (made) failureStreak = 0;
      else failureStreak++;
    }

    if (rooms.length < 12) continue;

    addExtraRoomOpenings(rooms, connections, walls, floors);

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
  const parentIndex = randInt(0, rooms.length - 1);
  const parent = rooms[parentIndex];
  const dir = ["left", "right", "up", "down"][randInt(0, 3)];
  const w = randInt(5, 11);
  const h = randInt(4, 7);

  let x;
  let y;

  if (dir === "right") {
    x = parent.x + parent.w + 1;
    y = randInt(parent.y - h + 2, parent.y + parent.h - 2);
  } else if (dir === "left") {
    x = parent.x - w - 1;
    y = randInt(parent.y - h + 2, parent.y + parent.h - 2);
  } else if (dir === "down") {
    x = randInt(parent.x - w + 2, parent.x + parent.w - 2);
    y = parent.y + parent.h + 1;
  } else {
    x = randInt(parent.x - w + 2, parent.x + parent.w - 2);
    y = parent.y - h - 1;
  }

  const room = { x, y, w, h };
  finishRoom(room);

  if (room.x < 2 || room.y < 2 || room.x + room.w >= MAP_WIDTH - 2 || room.y + room.h >= MAP_HEIGHT - 2) return false;
  if (rooms.some((r) => rectanglesOverlap(room, r))) return false;

  const connection = sharedOpening(parent, room, dir);
  if (!connection) return false;

  const childIndex = rooms.length;
  rooms.push(room);
  connections.push({ ...connection, parentIndex, childIndex });
  carveRoom(room, walls, floors);
  carveFloor(connection.x, connection.y, walls, floors);

  return true;
}

function sharedOpening(parent, room, dir) {
  if (dir === "right" || dir === "left") {
    const top = Math.max(parent.y, room.y);
    const bottom = Math.min(parent.y + parent.h - 1, room.y + room.h - 1);
    if (bottom < top) return null;
    const y = randInt(top, bottom);
    const x = dir === "right" ? parent.x + parent.w : parent.x - 1;
    return { x, y, color: randomColor(), locked: false };
  }

  const left = Math.max(parent.x, room.x);
  const right = Math.min(parent.x + parent.w - 1, room.x + room.w - 1);
  if (right < left) return null;
  const x = randInt(left, right);
  const y = dir === "down" ? parent.y + parent.h : parent.y - 1;
  return { x, y, color: randomColor(), locked: false };
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

function addExtraRoomOpenings(rooms, connections, walls, floors) {
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (Math.random() > 0.16) continue;
      const opening = adjacentOpening(rooms[i], rooms[j]);
      if (!opening) continue;
      if (connections.some((c) => c.x === opening.x && c.y === opening.y)) continue;
      carveFloor(opening.x, opening.y, walls, floors);
      connections.push({ ...opening, parentIndex: i, childIndex: j, color: randomColor(), locked: false });
    }
  }
}

function adjacentOpening(a, b) {
  if (a.x + a.w + 1 === b.x || b.x + b.w + 1 === a.x) {
    const leftRoom = a.x < b.x ? a : b;
    const rightRoom = a.x < b.x ? b : a;
    const top = Math.max(leftRoom.y, rightRoom.y);
    const bottom = Math.min(leftRoom.y + leftRoom.h - 1, rightRoom.y + rightRoom.h - 1);
    if (bottom < top) return null;
    return { x: leftRoom.x + leftRoom.w, y: randInt(top, bottom) };
  }

  if (a.y + a.h + 1 === b.y || b.y + b.h + 1 === a.y) {
    const topRoom = a.y < b.y ? a : b;
    const bottomRoom = a.y < b.y ? b : a;
    const left = Math.max(topRoom.x, bottomRoom.x);
    const right = Math.min(topRoom.x + topRoom.w - 1, bottomRoom.x + bottomRoom.w - 1);
    if (right < left) return null;
    return { x: randInt(left, right), y: topRoom.y + topRoom.h };
  }

  return null;
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
    { side: "right", value: MAP_WIDTH - 1 - room.cx },
    { side: "top", value: room.cy },
    { side: "bottom", value: MAP_HEIGHT - 1 - room.cy }
  ].sort((a, b) => a.value - b.value);

  const side = distances[0].side;
  let exit;

  if (side === "left") {
    const y = clamp(room.cy, 1, MAP_HEIGHT - 2);
    for (let x = room.x; x >= 0; x--) carveFloor(x, y, walls, floors);
    exit = { x: 0, y, color: randomColor() };
  } else if (side === "right") {
    const y = clamp(room.cy, 1, MAP_HEIGHT - 2);
    for (let x = room.x + room.w - 1; x < MAP_WIDTH; x++) carveFloor(x, y, walls, floors);
    exit = { x: MAP_WIDTH - 1, y, color: randomColor() };
  } else if (side === "top") {
    const x = clamp(room.cx, 1, MAP_WIDTH - 2);
    for (let y = room.y; y >= 0; y--) carveFloor(x, y, walls, floors);
    exit = { x, y: 0, color: randomColor() };
  } else {
    const x = clamp(room.cx, 1, MAP_WIDTH - 2);
    for (let y = room.y + room.h - 1; y < MAP_HEIGHT; y++) carveFloor(x, y, walls, floors);
    exit = { x, y: MAP_HEIGHT - 1, color: randomColor() };
  }

  return exit;
}

function placeDoorsFromConnections(connections, start, exit) {
  const doors = [];
  const candidates = shuffle([...connections]).filter((c) => !samePos(c, start) && !samePos(c, exit));

  for (const c of candidates) {
    if (doors.length >= 8) break;
    if (Math.random() < 0.48) {
      doors.push({
        x: c.x,
        y: c.y,
        locked: false,
        color: c.color,
        parentIndex: c.parentIndex,
        childIndex: c.childIndex
      });
    }
  }

  const lockable = shuffle(doors.filter((d) => d.parentIndex !== undefined));
  const lockCount = Math.min(3, Math.max(1, Math.floor(lockable.length / 3)));

  for (let i = 0; i < lockCount; i++) {
    if (Math.random() < 0.75) {
      lockable[i].locked = true;
      lockable[i].color = randomColor();
    }
  }

  return doors;
}

function placeChests(rooms, doors, start, exit) {
  const chestsByRoom = new Map();
  const blocked = new Set([key(start.x, start.y), key(exit.x, exit.y), ...doors.map((d) => key(d.x, d.y))]);
  const usedImportantRooms = new Set();

  function placeChestInRoom(roomIndex, items, locked = false, lockColor = null) {
    if (roomIndex === null || roomIndex === undefined) return false;
    if (chestsByRoom.has(roomIndex)) return false;
    chestsByRoom.set(roomIndex, { items, locked, lockColor });
    return true;
  }

  const exitRoomIndex = roomIndexForPoint(rooms, exit);
  const startRoomIndex = roomIndexForPoint(rooms, start);
  const exitKeyRoom = chooseKeyRoomAwayFrom(rooms, exitRoomIndex, new Set([exitRoomIndex]));
  placeChestInRoom(exitKeyRoom, [`${titleColor(exit.color)} Key`], false, null);
  usedImportantRooms.add(exitKeyRoom);

  for (const door of doors) {
    if (!door.locked) continue;

    const disallowed = new Set([...usedImportantRooms, exitRoomIndex]);
    let keyRoom = door.parentIndex;

    if (keyRoom === undefined || keyRoom === door.childIndex || disallowed.has(keyRoom) || chestsByRoom.has(keyRoom)) {
      keyRoom = chooseKeyRoomNearStart(rooms, startRoomIndex, disallowed);
    }

    placeChestInRoom(keyRoom, [`${titleColor(door.color)} Key`], false, null);
    usedImportantRooms.add(keyRoom);
  }

  const requiredColors = new Set([exit.color, ...doors.filter((d) => d.locked).map((d) => d.color)]);
  const targetChestCount = Math.min(rooms.length, Math.max(6, chestsByRoom.size + 4));
  const roomOrder = shuffle([...rooms.keys()]);

  while (chestsByRoom.size < targetChestCount && roomOrder.length) {
    const roomIndex = roomOrder.pop();
    if (chestsByRoom.has(roomIndex)) continue;

    const canLock = requiredColors.size > 0 && Math.random() < 0.28;
    const lockColor = canLock ? [...requiredColors][randInt(0, requiredColors.size - 1)] : null;

    chestsByRoom.set(roomIndex, {
      items: [randomChestItem()],
      locked: canLock,
      lockColor
    });
  }

  const chests = [];

  for (const [roomIndex, chestData] of chestsByRoom.entries()) {
    const room = rooms[roomIndex] || rooms[0];
    const pos = randomFloorInRoom(room, blocked);
    if (!pos) continue;

    chests.push({
      x: pos.x,
      y: pos.y,
      items: chestData.items,
      locked: chestData.locked,
      lockColor: chestData.lockColor,
      roomIndex
    });

    blocked.add(key(pos.x, pos.y));
  }

  return chests;
}

function chooseKeyRoomAwayFrom(rooms, avoidIndex, disallowed = new Set()) {
  const avoid = rooms[avoidIndex];
  const candidates = rooms
    .map((room, index) => ({ room, index }))
    .filter(({ index }) => !disallowed.has(index));

  if (!candidates.length) return 0;

  candidates.sort((a, b) => {
    const distA = Math.abs(a.room.cx - avoid.cx) + Math.abs(a.room.cy - avoid.cy);
    const distB = Math.abs(b.room.cx - avoid.cx) + Math.abs(b.room.cy - avoid.cy);
    return distB - distA;
  });

  const topChoices = candidates.slice(0, Math.min(5, candidates.length));
  return topChoices[randInt(0, topChoices.length - 1)].index;
}

function chooseKeyRoomNearStart(rooms, startIndex, disallowed = new Set()) {
  const startRoom = rooms[startIndex];
  const candidates = rooms
    .map((room, index) => ({ room, index }))
    .filter(({ index }) => !disallowed.has(index));

  if (!candidates.length) return startIndex;

  candidates.sort((a, b) => {
    const distA = Math.abs(a.room.cx - startRoom.cx) + Math.abs(a.room.cy - startRoom.cy);
    const distB = Math.abs(b.room.cx - startRoom.cx) + Math.abs(b.room.cy - startRoom.cy);
    return distA - distB;
  });

  const topChoices = candidates.slice(0, Math.min(5, candidates.length));
  return topChoices[randInt(0, topChoices.length - 1)].index;
}

function roomIndexForPoint(rooms, point) {
  let bestIndex = 0;
  let bestDist = Infinity;

  rooms.forEach((room, index) => {
    const dist = Math.abs(room.cx - point.x) + Math.abs(room.cy - point.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function roomAt(x, y) {
  return game.rooms.find((room) =>
    x >= room.x &&
    x < room.x + room.w &&
    y >= room.y &&
    y < room.y + room.h
  ) || null;
}

function sameRoom(a, b) {
  const roomA = roomAt(a.x, a.y);
  const roomB = roomAt(b.x, b.y);
  return Boolean(roomA && roomB && roomA === roomB);
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

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) walls.add(key(x, y));
  }

  const rooms = [
    { x: 8, y: 8, w: 10, h: 6 },
    { x: 19, y: 8, w: 10, h: 6 },
    { x: 30, y: 8, w: 10, h: 6 }
  ];

  rooms.forEach(finishRoom);
  rooms.forEach((room) => carveRoom(room, walls, floors));

  carveFloor(18, 10, walls, floors);
  carveFloor(29, 10, walls, floors);

  for (let x = 39; x < MAP_WIDTH; x++) carveFloor(x, 10, walls, floors);

  return {
    walls,
    floors,
    rooms,
    start: { x: rooms[0].cx, y: rooms[0].cy },
    exit: { x: MAP_WIDTH - 1, y: 10, color: "red" },
    doors: [{ x: 29, y: 10, color: "blue", locked: true, parentIndex: 1, childIndex: 2 }],
    chests: [
      { x: 10, y: 10, items: ["Blue Key"], locked: false, lockColor: null, roomIndex: 0 },
      { x: 21, y: 10, items: ["Red Key"], locked: false, lockColor: null, roomIndex: 1 },
      { x: 32, y: 10, items: ["Ammo Box"], locked: false, lockColor: null, roomIndex: 2 }
    ]
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function facingVector() {
  return DIR_VECTORS[game.player.dir];
}

function rightVector() {
  const table = {
    north: { x: 1, y: 0 },
    east: { x: 0, y: 1 },
    south: { x: -1, y: 0 },
    west: { x: 0, y: -1 }
  };
  return table[game.player.dir];
}

function rotateFacing(delta) {
  const current = FACINGS.indexOf(game.player.dir);
  game.player.dir = FACINGS[(current + delta + FACINGS.length) % FACINGS.length];
}

function miniMapOrigin() {
  return {
    x: clamp(game.player.x - Math.floor(MINI_WIDTH / 2), 0, MAP_WIDTH - MINI_WIDTH),
    y: clamp(game.player.y - Math.floor(MINI_HEIGHT / 2), 0, MAP_HEIGHT - MINI_HEIGHT)
  };
}

function relativeTile(depth, lateral) {
  const f = facingVector();
  const r = rightVector();

  return {
    x: game.player.x + f.x * depth + r.x * lateral,
    y: game.player.y + f.y * depth + r.y * lateral
  };
}

function recalcVisibility() {
  game.visible.clear();

  for (let y = Math.max(0, game.player.y - VIS_RADIUS); y <= Math.min(MAP_HEIGHT - 1, game.player.y + VIS_RADIUS); y++) {
    for (let x = Math.max(0, game.player.x - VIS_RADIUS); x <= Math.min(MAP_WIDTH - 1, game.player.x + VIS_RADIUS); x++) {
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

function enemyMaxHp() {
  return ENEMY_MAX_HP + Math.floor((game.level - 1) / 2);
}

function enemyDamage() {
  return ENEMY_DAMAGE + Math.floor((game.level - 1) / 4);
}

function startingEnemyCount() {
  return Math.min(4 + game.level, enemyCap());
}

function enemySymbol(enemy) {
  return enemy.hp === enemy.maxHp ? "H" : "h";
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

function isInForwardView(entity) {
  const f = facingVector();
  const r = rightVector();
  const dx = entity.x - game.player.x;
  const dy = entity.y - game.player.y;
  const depth = dx * f.x + dy * f.y;
  const lateral = dx * r.x + dy * r.y;

  if (depth < 1 || depth > FIRST_PERSON_DEPTH) return false;
  if (Math.abs(lateral) > depth + 1) return false;
  return hasLine(game.player.x, game.player.y, entity.x, entity.y, true);
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

  if (isInForwardView(enemy)) return true;

  const shooter = { x: game.player.x, y: game.player.y };
  const target = { x: enemy.x, y: enemy.y };

  return sameRoom(shooter, target) && hasLine(game.player.x, game.player.y, enemy.x, enemy.y, true);
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
  return Math.min(BASE_ENEMY_CAP + Math.floor((game.level - 1) / 2), 14);
}

function turnLeft() {
  resolveAction(() => {
    game.aiming = false;
    rotateFacing(-1);
    game.turn++;
    addLog(`You turn ${game.player.dir}.`);
    return true;
  });
}

function turnRight() {
  resolveAction(() => {
    game.aiming = false;
    rotateFacing(1);
    game.turn++;
    addLog(`You turn ${game.player.dir}.`);
    return true;
  });
}

function moveForward() {
  const f = facingVector();
  moveBy(f.x, f.y);
}

function moveBackward() {
  const f = facingVector();
  moveBy(-f.x, -f.y);
}

function moveBy(dx, dy) {
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
        addLog("The exit is sealed. A matching key is needed.");
        return false;
      }

      game.player.x = nx;
      game.player.y = ny;
      game.won = true;
      game.over = true;
      game.turn++;
      addLog("The exit seal breaks.");
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
      addLog(`Chest found: ${chestLabel(openedChest)}.`);
      openChestOverlay(openedChest);
    }

    game.turn++;
    return true;
  });
}

function chestLabel(chest) {
  return chest.items.join(", ");
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
      const condition = conditionLabel(healthCondition(foe.hp, foe.maxHp)).toLowerCase();
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
      applyDamage(enemyDamage());
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
    const pick = candidates.splice(randInt(0, Math.min(12, candidates.length - 1)), 1)[0];
    const maxHp = enemyMaxHp();
    game.enemies.push({ x: pick.x, y: pick.y, hp: maxHp, maxHp });
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
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + 3);
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

  for (const item of chest.items) takeItem(item);

  game.chests = game.chests.filter((c) => c !== chest);
  game.pendingChest = null;
  closeChestOverlay();

  resolveAction(() => {
    game.turn++;
    return true;
  });
}

function takeItem(item) {
  if (item.endsWith("Key")) {
    const color = item.split(" ")[0].toLowerCase();
    addKey(color);
    return;
  }

  if (item === "Health Kit") game.inventory.push({ name: "Health Kit" });
  if (item === "Body Armor") game.inventory.push({ name: "Body Armor", armor: 3 });

  if (item === "Ammo Box") {
    const amount = randInt(6, 10);
    game.reserveAmmo += amount;
    addLog(`Ammo box found. Reserve +${amount}.`);
  }

  if (item === "Extended Magazine") {
    game.maxShots += 3;
    addLog(`Extended Magazine installed. Magazine size is now ${game.maxShots}.`);
  }

  if (item === "Improved Barrel") {
    game.shotDamage += 1;
    addLog("Improved Barrel installed. Your shots hit harder.");
  }

  if (item === "Map") {
    game.mapFound = true;
    addLog("You found a map. The floor plan is outlined.");
  }

  if (!item.endsWith("Key")) addLog(`Item taken: ${item}.`);
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
  el.chestText.textContent = `${lockText}: ${chestLabel(chest)}`;
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
    addLog("You fall. Press Restart.");
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

  renderFirstPersonView();
  renderMiniMap();
  el.log.innerHTML = game.logs.map((msg) => `<p>${escapeHtml(msg)}</p>`).join("");
  renderInventory();
}

function renderFirstPersonView() {
  const scene = scanPerspectiveScene();
  const svg = buildPerspectiveSvg(scene);

  el.firstPersonView.innerHTML = `
    <div class="fp-svg-wrap">${svg}</div>
  `;
}

function scanPerspectiveScene() {
  const centerTiles = [];
  const leftTiles = [];
  const rightTiles = [];
  const objects = [];

  for (let depth = 1; depth <= FIRST_PERSON_DEPTH; depth++) {
    for (let lateral = -2; lateral <= 2; lateral++) {
      if (Math.abs(lateral) > depth + 1) continue;

      const pos = relativeTile(depth, lateral);
      if (!inBounds(pos.x, pos.y)) {
        objects.push({
          type: "wall",
          x: pos.x,
          y: pos.y,
          depth,
          lateral,
          colorClass: "fp-gray"
        });
        continue;
      }

      const desc = describeWorldTile(pos.x, pos.y);
      const visible = hasLine(game.player.x, game.player.y, pos.x, pos.y, true) || desc.type === "wall";

      if (!visible) continue;

      if (lateral === 0) centerTiles.push({ depth, ...pos, desc });
      if (lateral === -1) leftTiles.push({ depth, ...pos, desc });
      if (lateral === 1) rightTiles.push({ depth, ...pos, desc });

      const obj = describePerspectiveObject(pos.x, pos.y, desc);
      if (obj) {
        objects.push({ ...obj, x: pos.x, y: pos.y, depth, lateral });
      }
    }
  }

  return {
    centerTiles,
    leftTiles,
    rightTiles,
    objects
  };
}

function describeWorldTile(x, y) {
  if (!inBounds(x, y)) return { type: "wall" };

  const p = key(x, y);
  const foe = enemyAt(x, y);
  if (foe && game.visible.has(p)) return { type: "enemy", enemy: foe };

  const chest = chestAt(x, y);
  if (chest) return { type: "chest", locked: chest.locked, lockColor: chest.lockColor };

  const door = doorAt(x, y);
  if (door) return { type: "door", locked: door.locked, color: door.color };

  if (game.exit.x === x && game.exit.y === y) return { type: "exit", color: game.exit.color };

  const pickup = pickupAt(x, y);
  if (pickup) return { type: "ammo" };

  if (game.walls.has(p)) return { type: "wall" };
  if (game.floors.has(p)) return { type: "floor" };

  return { type: "void" };
}

function describePerspectiveObject(x, y, desc) {
  const p = key(x, y);

  if (desc.type === "enemy") {
    const condition = healthCondition(desc.enemy.hp, desc.enemy.maxHp);
    return {
      type: "enemy",
      colorClass: condition === "healthy" ? "fp-enemy" : `fp-enemy-${condition}`,
      selected: game.selectedTargetKey === p
    };
  }

  if (desc.type === "chest") {
    return {
      type: "chest",
      colorClass: desc.locked ? colorSvgClass(desc.lockColor) : "fp-gray"
    };
  }

  if (desc.type === "door") {
    return {
      type: "door",
      colorClass: desc.locked ? colorSvgClass(desc.color) : "fp-gray",
      locked: desc.locked
    };
  }

  if (desc.type === "exit") {
    return {
      type: "exit",
      colorClass: colorSvgClass(desc.color)
    };
  }

  if (desc.type === "ammo") {
    return {
      type: "ammo",
      colorClass: "fp-ammo"
    };
  }

  if (desc.type === "wall") {
    return {
      type: "wall",
      colorClass: "fp-gray"
    };
  }

  return null;
}

function colorSvgClass(color) {
  if (color === "red") return "fp-red";
  if (color === "blue") return "fp-blue";
  if (color === "yellow") return "fp-yellow";
  if (color === "green") return "fp-keygreen";
  return "fp-gray";
}

function buildPerspectiveSvg(scene) {
  const frames = perspectiveFrames();
  const parts = [];

  parts.push(`<svg class="fp-svg" viewBox="0 0 600 290" aria-hidden="true">`);
  drawRoomLines(parts, frames);
  drawWalls(parts, scene, frames);
  drawObjects(parts, scene);
  parts.push(`</svg>`);

  return parts.join("");
}

function perspectiveFrames() {
  return [
    null,
    { depth: 1, x: 32, y: 18, w: 536, h: 254 },
    { depth: 2, x: 96, y: 46, w: 408, h: 198 },
    { depth: 3, x: 166, y: 78, w: 268, h: 136 },
    { depth: 4, x: 236, y: 112, w: 128, h: 70 }
  ];
}

function drawRoomLines(parts, frames) {
  const outer = frames[1];
  const far = frames[4];

  parts.push(`<line class="fp-line" x1="${outer.x}" y1="${outer.y}" x2="${far.x}" y2="${far.y}" />`);
  parts.push(`<line class="fp-line" x1="${outer.x + outer.w}" y1="${outer.y}" x2="${far.x + far.w}" y2="${far.y}" />`);
  parts.push(`<line class="fp-line" x1="${outer.x}" y1="${outer.y + outer.h}" x2="${far.x}" y2="${far.y + far.h}" />`);
  parts.push(`<line class="fp-line" x1="${outer.x + outer.w}" y1="${outer.y + outer.h}" x2="${far.x + far.w}" y2="${far.y + far.h}" />`);
}

function drawWalls(parts, scene, frames) {
  const centerWalls = scene.objects
    .filter((obj) => obj.type === "wall" && obj.lateral === 0)
    .sort((a, b) => a.depth - b.depth);

  if (centerWalls.length) {
    const wall = centerWalls[0];
    const frame = frames[wall.depth];
    if (frame) {
      parts.push(`<rect class="fp-wall-plane" x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" />`);
    }
  }

  for (const obj of scene.objects.filter((item) => item.type === "wall" && item.lateral !== 0)) {
    if (Math.abs(obj.lateral) > 2) continue;
    if (obj.depth > 3 && Math.abs(obj.lateral) > 1) continue;

    const panel = sideWallPanel(obj.depth, obj.lateral);
    if (!panel) continue;

    parts.push(`<polygon class="fp-side-wall" points="${panel}" />`);
  }
}

function sideWallPanel(depth, lateral) {
  const frames = perspectiveFrames();
  const near = frames[depth];
  const far = frames[Math.min(depth + 1, FIRST_PERSON_DEPTH)];

  if (!near || !far) return null;

  const leftSide = lateral < 0;

  if (leftSide) {
    const nearX = near.x;
    const farX = far.x;
    const inset = Math.abs(lateral) === 2 ? 58 : 0;
    return `${nearX + inset},${near.y} ${farX + inset / 2},${far.y} ${farX + inset / 2},${far.y + far.h} ${nearX + inset},${near.y + near.h}`;
  }

  const nearX = near.x + near.w;
  const farX = far.x + far.w;
  const inset = Math.abs(lateral) === 2 ? 58 : 0;
  return `${nearX - inset},${near.y} ${farX - inset / 2},${far.y} ${farX - inset / 2},${far.y + far.h} ${nearX - inset},${near.y + near.h}`;
}

function drawObjects(parts, scene) {
  const drawable = scene.objects
    .filter((obj) => obj.type !== "wall")
    .filter((obj) => Math.abs(obj.lateral) <= 2)
    .filter((obj) => !(obj.depth > 3 && Math.abs(obj.lateral) > 1))
    .sort((a, b) => b.depth - a.depth);

  for (const obj of drawable) {
    const point = projectToView(obj.depth, obj.lateral);
    const scale = scaleForDepth(obj.depth, obj.lateral);

    if (obj.selected) {
      parts.push(drawTargetRing(point.x, point.y, scale));
    }

    if (obj.type === "enemy") parts.push(drawEnemy(point.x, point.y, scale, obj.colorClass, obj.depth));
    if (obj.type === "chest") parts.push(drawChest(point.x, point.y, scale, obj.colorClass));
    if (obj.type === "door") parts.push(drawDoor(point.x, point.y, scale, obj.colorClass, obj.locked));
    if (obj.type === "exit") parts.push(drawExit(point.x, point.y, scale, obj.colorClass));
    if (obj.type === "ammo") parts.push(drawAmmo(point.x, point.y, scale, obj.colorClass));
  }
}

function projectToView(depth, lateral) {
  const base = {
    1: { x: 300, y: 175, spread: 168 },
    2: { x: 300, y: 152, spread: 125 },
    3: { x: 300, y: 134, spread: 82 },
    4: { x: 300, y: 122, spread: 44 }
  }[depth] || { x: 300, y: 122, spread: 44 };

  return {
    x: base.x + lateral * base.spread,
    y: base.y + Math.abs(lateral) * 8
  };
}

function scaleForDepth(depth, lateral = 0) {
  const base = {
    1: 1.25,
    2: 0.9,
    3: 0.62,
    4: 0.42
  }[depth] || 0.42;

  return base * (Math.abs(lateral) === 2 ? 0.72 : 1);
}

function drawTargetRing(x, y, s) {
  const w = 58 * s;
  const h = 82 * s;
  return `<ellipse class="fp-target-glow" cx="${x}" cy="${y}" rx="${w}" ry="${h}" />`;
}

function drawEnemy(x, y, s, colorClass, depth) {
  const head = 10 * s;
  const body = 34 * s;
  const arm = 24 * s;
  const leg = 22 * s;
  const pose = depth % 3;

  const armTilt = pose === 0 ? 0 : pose === 1 ? 8 * s : -8 * s;
  const legTilt = pose === 0 ? 8 * s : pose === 1 ? -4 * s : 12 * s;

  return `
    <g class="${colorClass}">
      <circle class="fp-wire" cx="${x}" cy="${y - body * 0.72}" r="${head}" />
      <line class="fp-wire" x1="${x}" y1="${y - body * 0.48}" x2="${x}" y2="${y + body * 0.28}" />
      <line class="fp-wire" x1="${x - arm}" y1="${y - armTilt}" x2="${x + arm}" y2="${y + armTilt}" />
      <line class="fp-wire" x1="${x}" y1="${y + body * 0.28}" x2="${x - leg}" y2="${y + body * 0.72 + legTilt}" />
      <line class="fp-wire" x1="${x}" y1="${y + body * 0.28}" x2="${x + leg}" y2="${y + body * 0.72 - legTilt}" />
    </g>
  `;
}

function drawChest(x, y, s, colorClass) {
  const w = 70 * s;
  const h = 42 * s;
  const d = 18 * s;
  const top = y - h * 0.6;

  return `
    <g class="${colorClass}">
      <rect class="fp-wire" x="${x - w / 2}" y="${top}" width="${w}" height="${h}" />
      <path class="fp-wire-thin" d="M ${x - w / 2} ${top} L ${x - w / 2 + d} ${top - d} L ${x + w / 2 + d} ${top - d} L ${x + w / 2} ${top}" />
      <path class="fp-wire-thin" d="M ${x + w / 2} ${top} L ${x + w / 2 + d} ${top - d} L ${x + w / 2 + d} ${top + h - d} L ${x + w / 2} ${top + h}" />
      <line class="fp-wire-thin" x1="${x - w / 2}" y1="${top + h * 0.45}" x2="${x + w / 2}" y2="${top + h * 0.45}" />
    </g>
  `;
}

function drawDoor(x, y, s, colorClass, locked) {
  const w = 66 * s;
  const h = 104 * s;
  const knob = 4 * s;
  const top = y - h * 0.58;

  return `
    <g class="${colorClass}">
      <rect class="fp-wire" x="${x - w / 2}" y="${top}" width="${w}" height="${h}" />
      <line class="fp-wire-thin" x1="${x - w * 0.22}" y1="${top}" x2="${x - w * 0.22}" y2="${top + h}" />
      <circle class="fp-wire-thin" cx="${x + w * 0.22}" cy="${top + h * 0.53}" r="${knob}" />
      ${locked ? `<path class="fp-wire-thin" d="M ${x - 12 * s} ${top + h * 0.68} L ${x + 12 * s} ${top + h * 0.68} L ${x + 12 * s} ${top + h * 0.84} L ${x - 12 * s} ${top + h * 0.84} Z" />` : ""}
    </g>
  `;
}

function drawExit(x, y, s, colorClass) {
  const w = 86 * s;
  const h = 120 * s;
  const top = y - h * 0.6;

  return `
    <g class="${colorClass}">
      <path class="fp-wire" d="M ${x - w / 2} ${top + h} L ${x - w / 2} ${top + h * 0.25} Q ${x} ${top - h * 0.18} ${x + w / 2} ${top + h * 0.25} L ${x + w / 2} ${top + h}" />
      <path class="fp-wire-thin" d="M ${x - w * 0.28} ${top + h} L ${x - w * 0.28} ${top + h * 0.35} Q ${x} ${top + h * 0.05} ${x + w * 0.28} ${top + h * 0.35} L ${x + w * 0.28} ${top + h}" />
      <line class="fp-wire-thin" x1="${x - w / 2}" y1="${top + h}" x2="${x + w / 2}" y2="${top + h}" />
    </g>
  `;
}

function drawAmmo(x, y, s, colorClass) {
  const w = 14 * s;
  const h = 42 * s;
  const gap = 10 * s;
  const top = y - h * 0.5;

  return `
    <g class="${colorClass}">
      <rect class="fp-wire" x="${x - w - gap / 2}" y="${top}" width="${w}" height="${h}" />
      <rect class="fp-wire" x="${x + gap / 2}" y="${top}" width="${w}" height="${h}" />
      <path class="fp-wire-thin" d="M ${x - w - gap / 2} ${top} L ${x - w / 2 - gap / 2} ${top - 9 * s} L ${x - gap / 2} ${top}" />
      <path class="fp-wire-thin" d="M ${x + gap / 2} ${top} L ${x + w / 2 + gap / 2} ${top - 9 * s} L ${x + w + gap / 2} ${top}" />
    </g>
  `;
}

function renderMiniMap() {
  const origin = miniMapOrigin();
  const rows = [];

  for (let vy = 0; vy < MINI_HEIGHT; vy++) {
    const row = [];

    for (let vx = 0; vx < MINI_WIDTH; vx++) {
      row.push(renderMapCell(origin.x + vx, origin.y + vy));
    }

    rows.push(row.join(""));
  }

  el.miniMap.textContent = rows.join("\n");
}

function renderMapCell(x, y) {
  const p = key(x, y);
  const visible = game.visible.has(p);
  const remembered = game.discovered.has(p);

  if (game.player.x === x && game.player.y === y) return playerFacingSymbol();

  const foe = enemyAt(x, y);
  if (foe && visible) return enemySymbol(foe);

  if (visible || remembered) return knownMapChar(x, y);

  if (game.mapFound) {
    if (doorAt(x, y)) return "D";
    if (game.exit.x === x && game.exit.y === y) return "E";
    if (game.walls.has(p)) return "#";
  }

  return ".";
}

function knownMapChar(x, y) {
  const p = key(x, y);
  if (pickupAt(x, y)) return "a";
  if (chestAt(x, y)) return "C";
  if (game.exit.x === x && game.exit.y === y) return "E";
  if (doorAt(x, y)) return "D";
  if (game.walls.has(p)) return "#";
  if (game.floors.has(p)) return " ";
  return ".";
}

function playerFacingSymbol() {
  if (game.player.dir === "north") return "^";
  if (game.player.dir === "east") return ">";
  if (game.player.dir === "south") return "v";
  return "<";
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

    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
      event.preventDefault();
    }

    if (game.pendingChest || game.won) return;

    if (k === "w" || k === "arrowup") moveForward();
    if (k === "s" || k === "arrowdown") moveBackward();
    if (k === "a" || k === "arrowleft") turnLeft();
    if (k === "d" || k === "arrowright") turnRight();
    if (k === "t") cycleTarget();
    if (k === "f") fireSelectedTarget();
    if (k === "r") reload();
  });

  el.dpad.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-dir]");
    if (!button || game.pendingChest || game.won) return;

    const dir = button.dataset.dir;
    if (dir === "up") moveForward();
    if (dir === "down") moveBackward();
    if (dir === "left") turnLeft();
    if (dir === "right") turnRight();
  });

  el.targetBtn.addEventListener("click", cycleTarget);
  el.aimBtn.addEventListener("click", aimWeapon);
  el.fireBtn.addEventListener("click", fireSelectedTarget);
  el.waitBtn.addEventListener("click", () => { if (!game.pendingChest && !game.won) waitTurn(); });
  el.reloadBtn.addEventListener("click", () => { if (!game.pendingChest && !game.won) reload(); });
  el.restartBtn.addEventListener("click", newGame);
  el.takeBtn.addEventListener("click", takeChest);
  el.leaveBtn.addEventListener("click", leaveChest);
  el.nextLevelBtn.addEventListener("click", startNextLevel);
  el.levelRestartBtn.addEventListener("click", newGame);

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
// === First-person renderer override: clearer walls + grounded objects ===

function renderFirstPersonView() {
  const f = facingVector();
  const frontX = game.player.x + f.x;
  const frontY = game.player.y + f.y;

  const frontWall = !inBounds(frontX, frontY) || game.walls.has(key(frontX, frontY));
  const frontDoor = doorAt(frontX, frontY);
  const frontChest = chestAt(frontX, frontY);
  const frontExit = game.exit.x === frontX && game.exit.y === frontY;
  const frontEnemy = enemyAt(frontX, frontY);

  let status = "Open space ahead.";
  if (frontWall) status = "Wall ahead.";
  if (frontDoor) status = frontDoor.locked ? `${titleColor(frontDoor.color)} locked door ahead.` : "Doorway ahead.";
  if (frontChest) status = frontChest.locked ? `${titleColor(frontChest.lockColor)} locked chest ahead.` : "Chest ahead.";
  if (frontExit) status = "Exit ahead.";
  if (frontEnemy) status = "Enemy ahead.";

  const compass = `Facing ${game.player.dir.toUpperCase()}`;
  const target = game.selectedTargetKey ? getEnemyByKey(game.selectedTargetKey) : null;
  const targetText = target ? `Target: ${enemySymbol(target)}` : "Target: none";

  el.firstPersonView.innerHTML = `
    <div class="fp-panel">
      <div class="fp-topline">${escapeHtml(compass)} · ${escapeHtml(targetText)}</div>
      ${renderPerspectiveSvg()}
      <div class="fp-status">${escapeHtml(status)}</div>
    </div>
  `;
}

function renderPerspectiveSvg() {
  const frames = perspectiveFrames();
  const parts = [];

  parts.push(`
    <svg class="fp-svg" viewBox="0 0 100 56" preserveAspectRatio="none" aria-label="First person dungeon scene">
      <defs>
        <radialGradient id="sceneGlow" cx="50%" cy="52%" r="62%">
          <stop offset="0%" stop-color="#151515" />
          <stop offset="60%" stop-color="#080808" />
          <stop offset="100%" stop-color="#020202" />
        </radialGradient>
        <linearGradient id="floorFade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#050505" />
          <stop offset="100%" stop-color="#171717" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="100" height="56" fill="url(#sceneGlow)" />
      <polygon points="6,50 94,50 61,31 39,31" fill="url(#floorFade)" opacity="0.75" />
      <polygon points="6,6 94,6 61,25 39,25" fill="#050505" opacity="0.65" />
  `);

  parts.push(drawPerspectiveGuide(frames));

  let blockedAheadAt = null;

  for (let depth = FIRST_PERSON_DEPTH; depth >= 1; depth--) {
    const center = relativeTile(depth, 0);

    if (!inBounds(center.x, center.y) || game.walls.has(key(center.x, center.y))) {
      blockedAheadAt = depth;
    }
  }

  for (let depth = FIRST_PERSON_DEPTH; depth >= 1; depth--) {
    parts.push(drawSideWallsAtDepth(depth, frames));
  }

  for (let depth = FIRST_PERSON_DEPTH; depth >= 1; depth--) {
    const center = relativeTile(depth, 0);
    const p = key(center.x, center.y);

    if (!inBounds(center.x, center.y) || game.walls.has(p)) {
      parts.push(drawFrontWall(depth, frames));
      break;
    }

    const door = doorAt(center.x, center.y);
    if (door) {
      parts.push(drawDoor(depth, door, frames));
      break;
    }

    if (game.exit.x === center.x && game.exit.y === center.y) {
      parts.push(drawExit(depth, frames));
      break;
    }
  }

  for (let depth = FIRST_PERSON_DEPTH; depth >= 1; depth--) {
    if (blockedAheadAt && depth > blockedAheadAt) continue;

    for (let lateral = -depth; lateral <= depth; lateral++) {
      const pos = relativeTile(depth, lateral);
      if (!inBounds(pos.x, pos.y)) continue;

      const p = key(pos.x, pos.y);
      if (!game.visible.has(p)) continue;
      if (!hasLine(game.player.x, game.player.y, pos.x, pos.y, true)) continue;

      const obj = sceneObjectAt(pos.x, pos.y);
      if (!obj) continue;

      parts.push(drawGroundedObject(obj, depth, lateral, frames));
    }
  }

  parts.push(`</svg>`);
  return parts.join("");
}

function perspectiveFrames() {
  return [
    { l: 5, t: 5, r: 95, b: 51 },
    { l: 18, t: 10, r: 82, b: 46 },
    { l: 30, t: 16, r: 70, b: 40 },
    { l: 40, t: 22, r: 60, b: 34 },
    { l: 47, t: 26, r: 53, b: 30 },
    { l: 50, t: 28, r: 50, b: 28 }
  ];
}

function drawPerspectiveGuide(frames) {
  const outer = frames[0];
  const far = frames[4];

  return `
    <line x1="${outer.l}" y1="${outer.t}" x2="${far.l}" y2="${far.t}" stroke="#2a7a2a" stroke-width="0.55" opacity="0.75" />
    <line x1="${outer.r}" y1="${outer.t}" x2="${far.r}" y2="${far.t}" stroke="#2a7a2a" stroke-width="0.55" opacity="0.75" />
    <line x1="${outer.l}" y1="${outer.b}" x2="${far.l}" y2="${far.b}" stroke="#2a7a2a" stroke-width="0.55" opacity="0.75" />
    <line x1="${outer.r}" y1="${outer.b}" x2="${far.r}" y2="${far.b}" stroke="#2a7a2a" stroke-width="0.55" opacity="0.75" />

    <line x1="5" y1="51" x2="95" y2="51" stroke="#2f6d2f" stroke-width="0.5" opacity="0.5" />
    <line x1="18" y1="46" x2="82" y2="46" stroke="#2f6d2f" stroke-width="0.45" opacity="0.4" />
    <line x1="30" y1="40" x2="70" y2="40" stroke="#2f6d2f" stroke-width="0.4" opacity="0.32" />
  `;
}

function drawSideWallsAtDepth(depth, frames) {
  const near = frames[depth - 1];
  const far = frames[depth];
  const leftTile = relativeTile(depth, -1);
  const rightTile = relativeTile(depth, 1);
  const parts = [];

  if (!inBounds(leftTile.x, leftTile.y) || game.walls.has(key(leftTile.x, leftTile.y))) {
    parts.push(`
      <polygon
        points="${near.l},${near.t} ${far.l},${far.t} ${far.l},${far.b} ${near.l},${near.b}"
        fill="#202020"
        stroke="#777777"
        stroke-width="${sideStroke(depth)}"
        opacity="${sideOpacity(depth)}"
      />
    `);
  }

  if (!inBounds(rightTile.x, rightTile.y) || game.walls.has(key(rightTile.x, rightTile.y))) {
    parts.push(`
      <polygon
        points="${near.r},${near.t} ${far.r},${far.t} ${far.r},${far.b} ${near.r},${near.b}"
        fill="#202020"
        stroke="#777777"
        stroke-width="${sideStroke(depth)}"
        opacity="${sideOpacity(depth)}"
      />
    `);
  }

  return parts.join("");
}

function drawFrontWall(depth, frames) {
  const frame = frames[depth - 1];
  const inset = depth === 1 ? 3 : 1.2;
  const l = frame.l + inset;
  const r = frame.r - inset;
  const t = frame.t + inset;
  const b = frame.b - inset;
  const cx = (l + r) / 2;
  const cy = (t + b) / 2;

  return `
    <rect
      x="${l}"
      y="${t}"
      width="${r - l}"
      height="${b - t}"
      fill="#252525"
      stroke="#999999"
      stroke-width="${frontStroke(depth)}"
      opacity="${frontOpacity(depth)}"
    />
    <text
      x="${cx}"
      y="${cy + wallTextSize(depth) / 3}"
      text-anchor="middle"
      font-family="Courier New, monospace"
      font-size="${wallTextSize(depth)}"
      fill="#aaaaaa"
      opacity="0.85"
    >#</text>
  `;
}

function drawDoor(depth, door, frames) {
  const frame = frames[depth - 1];
  const color = door.locked ? sceneColor(door.color) : "#aaaaaa";
  const w = (frame.r - frame.l) * 0.34;
  const h = (frame.b - frame.t) * 0.58;
  const x = 50 - w / 2;
  const y = frame.b - h - 2;

  return `
    <rect
      x="${x}"
      y="${y}"
      width="${w}"
      height="${h}"
      fill="#111111"
      stroke="${color}"
      stroke-width="${frontStroke(depth)}"
      opacity="0.95"
    />
    <text
      x="50"
      y="${y + h * 0.58}"
      text-anchor="middle"
      font-family="Courier New, monospace"
      font-size="${objectTextSize(depth)}"
      fill="${color}"
      font-weight="700"
    >D</text>
  `;
}

function drawExit(depth, frames) {
  const frame = frames[depth - 1];
  const color = sceneColor(game.exit.color);
  const w = (frame.r - frame.l) * 0.38;
  const h = (frame.b - frame.t) * 0.62;
  const x = 50 - w / 2;
  const y = frame.b - h - 2;

  return `
    <rect
      x="${x}"
      y="${y}"
      width="${w}"
      height="${h}"
      fill="#111111"
      stroke="${color}"
      stroke-width="${frontStroke(depth)}"
      opacity="0.95"
    />
    <text
      x="50"
      y="${y + h * 0.6}"
      text-anchor="middle"
      font-family="Courier New, monospace"
      font-size="${objectTextSize(depth)}"
      fill="${color}"
      font-weight="700"
    >E</text>
  `;
}

function drawGroundedObject(obj, depth, lateral, frames) {
  const frame = frames[depth - 1];
  const scale = objectScale(depth);
  const laneWidth = (frame.r - frame.l) / Math.max(2.2, depth * 1.15);
  const x = 50 + lateral * laneWidth;
  const floorY = frame.b - 2;
  const color = obj.color || "#eeeeee";

  if (obj.type === "enemy") {
    return `
      <text
        x="${x}"
        y="${floorY - scale * 0.15}"
        text-anchor="middle"
        font-family="Courier New, monospace"
        font-size="${scale}"
        fill="${color}"
        font-weight="700"
        ${obj.target ? `stroke="#ffffff" stroke-width="0.3"` : ""}
      >${escapeHtml(obj.label)}</text>
    `;
  }

  if (obj.type === "chest") {
    const w = scale * 0.9;
    const h = scale * 0.42;
    return `
      <rect
        x="${x - w / 2}"
        y="${floorY - h}"
        width="${w}"
        height="${h}"
        fill="#101010"
        stroke="${color}"
        stroke-width="${Math.max(0.5, scale / 16)}"
      />
      <text
        x="${x}"
        y="${floorY - h * 0.25}"
        text-anchor="middle"
        font-family="Courier New, monospace"
        font-size="${scale * 0.55}"
        fill="${color}"
        font-weight="700"
      >C</text>
    `;
  }

  if (obj.type === "ammo") {
    return `
      <text
        x="${x}"
        y="${floorY}"
        text-anchor="middle"
        font-family="Courier New, monospace"
        font-size="${scale * 0.55}"
        fill="#99ddff"
        font-weight="700"
      >a</text>
    `;
  }

  return "";
}

function sceneObjectAt(x, y) {
  const p = key(x, y);

  const foe = enemyAt(x, y);
  if (foe && game.visible.has(p)) {
    const condition = healthCondition(foe.hp, foe.maxHp);
    return {
      type: "enemy",
      label: enemySymbol(foe),
      color: condition === "healthy" ? "#ff9999" : condition === "injured" ? "#ffcc66" : "#ff5555",
      target: game.selectedTargetKey === p
    };
  }

  const chest = chestAt(x, y);
  if (chest) {
    return {
      type: "chest",
      label: "C",
      color: chest.locked ? sceneColor(chest.lockColor) : "#aaaaaa"
    };
  }

  const pickup = pickupAt(x, y);
  if (pickup) {
    return {
      type: "ammo",
      label: "a",
      color: "#99ddff"
    };
  }

  return null;
}

function relativeTile(depth, lateral) {
  const f = facingVector();
  const l = leftVector();

  return {
    x: game.player.x + f.x * depth + l.x * lateral,
    y: game.player.y + f.y * depth + l.y * lateral
  };
}

function sceneColor(color) {
  if (color === "red") return "#ff6666";
  if (color === "blue") return "#66aaff";
  if (color === "yellow") return "#ffee66";
  if (color === "green") return "#77ff77";
  return "#eeeeee";
}

function sideStroke(depth) {
  return Math.max(0.35, 1.35 - depth * 0.18);
}

function frontStroke(depth) {
  return Math.max(0.45, 1.8 - depth * 0.22);
}

function sideOpacity(depth) {
  return Math.max(0.28, 0.92 - depth * 0.11);
}

function frontOpacity(depth) {
  return Math.max(0.42, 1 - depth * 0.08);
}

function wallTextSize(depth) {
  return Math.max(4, 20 - depth * 2.7);
}

function objectTextSize(depth) {
  return Math.max(5, 22 - depth * 2.5);
}

function objectScale(depth) {
  return Math.max(7, 25 - depth * 3.2);
}
// === Missing helper for first-person renderer override ===

function leftVector() {
  const table = {
    north: { x: -1, y: 0 },
    east: { x: 0, y: -1 },
    south: { x: 1, y: 0 },
    west: { x: 0, y: 1 }
  };

  return table[game.player.dir] || { x: -1, y: 0 };
}
