const WIDTH = 40;
const HEIGHT = 30;
const MAX_LOG_LINES = 4;
const BASE_CLIP_SIZE = 3;
const BASE_SHOT_DAMAGE = 2;
const VIS_RADIUS = 10;

const ENEMY_TYPES = {
  weak: { maxHp: 2, damage: 1, fullSymbol: "W", hurtSymbol: "w" },
  moderate: { maxHp: 4, damage: 1, fullSymbol: "M", hurtSymbol: "m" },
  brute: { maxHp: 7, damage: 2, fullSymbol: "B", hurtSymbol: "b" }
};

const CHEST_ITEMS = ["Health Kit", "Body Armor", "Extended Magazine", "Improved Barrel", "Key", "Map"];
const el = {
  grid: document.getElementById("grid"), hp: document.getElementById("hp"), maxHp: document.getElementById("max-hp"), shots: document.getElementById("shots"),
  turn: document.getElementById("turn"), kills: document.getElementById("kills"), enemyCount: document.getElementById("enemy-count"), log: document.getElementById("message-log"),
  inventory: document.getElementById("inventory"), dpad: document.querySelector(".dpad"), waitBtn: document.getElementById("wait-btn"), reloadBtn: document.getElementById("reload-btn"), restartBtn: document.getElementById("restart-btn"),
  chestPrompt: document.getElementById("chest-prompt"), chestText: document.getElementById("chest-text"), takeBtn: document.getElementById("take-btn"), leaveBtn: document.getElementById("leave-btn")
};

let game;
const key = (x, y) => `${x},${y}`;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;

function newGame() {
  const map = generateDungeon();
  game = { turn: 0, kills: 0, over: false, won: false, hovered: null, logs: ["Explore the dungeon."], walls: map.walls, floors: map.floors, doors: map.doors, exit: map.exit, chests: map.chests, enemies: [],
    player: { x: map.start.x, y: map.start.y, hp: 10, maxHp: 10 }, shots: BASE_CLIP_SIZE, maxShots: BASE_CLIP_SIZE, shotDamage: BASE_SHOT_DAMAGE, mapFound: false, visible: new Set(), inventory: [], pendingChest: null };
  spawnEnemies(4); recalcVisibility(); render();
}

function generateDungeon() {
  const walls = new Set(); const floors = new Set(); const rooms = [];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) walls.add(key(x, y));
  for (let i = 0; i < 8; i++) {
    const rw = 5 + Math.floor(Math.random() * 6), rh = 4 + Math.floor(Math.random() * 5);
    const rx = 1 + Math.floor(Math.random() * (WIDTH - rw - 2)), ry = 1 + Math.floor(Math.random() * (HEIGHT - rh - 2));
    const overlaps = rooms.some((r) => rx < r.x + r.w + 1 && rx + rw + 1 > r.x && ry < r.y + r.h + 1 && ry + rh + 1 > r.y);
    if (overlaps) continue;
    const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) }; rooms.push(room);
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) { walls.delete(key(x, y)); floors.add(key(x, y)); }
  }
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    carveCorridor(a.cx, a.cy, b.cx, a.cy, walls, floors);
    carveCorridor(b.cx, a.cy, b.cx, b.cy, walls, floors);
  }
  const start = { x: rooms[0].cx, y: rooms[0].cy };
  const exitRoom = rooms[rooms.length - 1];
  const exit = { x: exitRoom.cx, y: exitRoom.cy };
  const doors = placeDoors(floors, walls, start, exit);
  const chests = placeChests(floors, doors, start, exit);
  return { walls, floors, start, exit, doors, chests };
}

function carveCorridor(x1, y1, x2, y2, walls, floors) { for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) { walls.delete(key(x, y1)); floors.add(key(x, y1)); } for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) { walls.delete(key(x2, y)); floors.add(key(x2, y)); } }
function placeDoors(floors, walls, start, exit) { const doors = []; for (const pos of floors) { const [x, y] = pos.split(",").map(Number); if ((x === start.x && y === start.y) || (x === exit.x && y === exit.y)) continue; const n = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].map(([a,b])=>walls.has(key(a,b))); if ((n[0]&&n[1]&&!n[2]&&!n[3]) || (!n[0]&&!n[1]&&n[2]&&n[3])) if (Math.random() < 0.06) doors.push({ x, y, locked: Math.random() < 0.5 }); } return doors.slice(0, 6); }
function placeChests(floors, doors, start, exit) { const doorSet = new Set(doors.map((d)=>key(d.x,d.y))); const candidates = [...floors].filter((p)=>!doorSet.has(p) && p!==key(start.x,start.y) && p!==key(exit.x,exit.y)); const chests=[]; for (let i=0;i<5 && candidates.length;i++){ const idx=Math.floor(Math.random()*candidates.length); const p=candidates.splice(idx,1)[0]; const [x,y]=p.split(",").map(Number); chests.push({x,y,item:CHEST_ITEMS[Math.floor(Math.random()*CHEST_ITEMS.length)]}); } return chests; }
function enemyAt(x, y) { return game.enemies.find((e) => e.x === x && e.y === y); }
function chestAt(x, y) { return game.chests.find((c) => c.x === x && c.y === y); }
function doorAt(x, y) { return game.doors.find((d) => d.x === x && d.y === y); }
function addLog(msg) { game.logs.push(msg); game.logs = game.logs.slice(-MAX_LOG_LINES); }

function recalcVisibility() {
  game.visible.clear();
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const dx = x - game.player.x, dy = y - game.player.y;
    if (Math.hypot(dx, dy) > VIS_RADIUS) continue;
    if (hasLine(game.player.x, game.player.y, x, y, true)) game.visible.add(key(x, y));
  }
}
function hasLine(x0, y0, x1, y1, stopAtWall) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx - dy; let x = x0, y = y0;
  while (!(x === x1 && y === y1)) { const e2 = 2 * err; if (e2 > -dy) { err -= dy; x += sx; } if (e2 < dx) { err += dx; y += sy; } if (x === x1 && y === y1) break; if (stopAtWall && game.walls.has(key(x, y))) return false; }
  return true;
}
function enemySymbol(e){const t=ENEMY_TYPES[e.type]; return e.hp===t.maxHp?t.fullSymbol:t.hurtSymbol;}
function randomEnemyType(){const r=Math.random(); return r<0.5?"weak":r<0.83?"moderate":"brute";}
function spawnEnemies(count){let tries=0, made=0; while(made<count&&tries<300){tries++; const x=Math.random()<0.5?(Math.random()<0.5?1:WIDTH-2):Math.floor(Math.random()*WIDTH); const y=Math.random()<0.5?(Math.random()<0.5?1:HEIGHT-2):Math.floor(Math.random()*HEIGHT); if(!game.floors.has(key(x,y))||enemyAt(x,y)||chestAt(x,y)||doorAt(x,y)||(x===game.exit.x&&y===game.exit.y)||(x===game.player.x&&y===game.player.y)) continue; const type=randomEnemyType(); game.enemies.push({x,y,type,hp:ENEMY_TYPES[type].maxHp}); made++;}}

function resolveAction(fn){ if(game.over||game.pendingChest) return; const ok=fn(); if(!ok){render();return;} cleanupDead(); recalcVisibility(); enemiesTurn(); if(game.turn%2===0&&!game.over&&!game.won) spawnEnemies(1); recalcVisibility(); checkEnd(); render(); }
function cleanupDead(){const before=game.enemies.length; game.enemies=game.enemies.filter((e)=>e.hp>0); const dead=before-game.enemies.length; if(dead){game.kills+=dead; addLog(`You defeated ${dead} foe${dead>1?"s":""}.`);} }
function consumeKey(){const idx=game.inventory.findIndex((i)=>i.name==="Key"); if(idx>=0){game.inventory.splice(idx,1); return true;} return false;}
function move(dx,dy){resolveAction(()=>{const nx=game.player.x+dx, ny=game.player.y+dy; if(!inBounds(nx,ny)||game.walls.has(key(nx,ny))){addLog("A wall blocks your way."); return false;} const door=doorAt(nx,ny); if(door&&door.locked){ if(!consumeKey()){addLog("The door is locked. You need a key."); return false;} door.locked=false; addLog("You unlock the door with a key."); }
const foe=enemyAt(nx,ny); if(foe){foe.hp-=1; addLog(`You strike ${enemySymbol(foe).toUpperCase()} for 1.`);} else {game.player.x=nx; game.player.y=ny; const chest=chestAt(nx,ny); if(chest){game.pendingChest=chest; addLog(`Chest found: ${chest.item}.`); openChestPrompt(chest);} if(nx===game.exit.x&&ny===game.exit.y){game.won=true; game.over=true; addLog("You escaped. Level complete."); }} game.turn++; return true;});}

function tryShootAt(x,y){resolveAction(()=>{ if(!game.visible.has(key(x,y))){addLog("You can’t see a target there."); return false;} const foe=enemyAt(x,y); if(!foe){addLog("You can’t see a target there."); return false;} if(game.shots<=0){addLog("Out of shots. Reload first."); return false;} const dx=x-game.player.x, dy=y-game.player.y; const aligned = dx===0||dy===0||Math.abs(dx)===Math.abs(dy); if(!aligned){addLog(`No clear shot to ${enemySymbol(foe).toUpperCase()}.`); return false;} if(!hasLine(game.player.x,game.player.y,x,y,true)){addLog("A wall blocks your shot."); return false;} foe.hp-=game.shotDamage; game.shots--; game.turn++; addLog(`You shoot ${enemySymbol(foe).toUpperCase()} for ${game.shotDamage}.`); return true;});}
function reload(){resolveAction(()=>{if(game.shots===game.maxShots){addLog("Your clip is already full."); return false;} game.shots=game.maxShots; game.turn++; addLog("Reloaded."); return true;});}
function waitTurn(){resolveAction(()=>{game.turn++; addLog("You wait."); return true;});}

function enemiesTurn(){for(const e of game.enemies){const dx=game.player.x-e.x, dy=game.player.y-e.y; if(Math.abs(dx)+Math.abs(dy)===1){applyDamage(ENEMY_TYPES[e.type].damage); continue;} const opts=[]; if(dx!==0)opts.push([e.x+Math.sign(dx),e.y]); if(dy!==0)opts.push([e.x,e.y+Math.sign(dy)]); for(const [nx,ny] of opts){const d=doorAt(nx,ny); if(!inBounds(nx,ny)||game.walls.has(key(nx,ny))||enemyAt(nx,ny)||(d&&d.locked)||(nx===game.player.x&&ny===game.player.y)) continue; e.x=nx;e.y=ny;break;}}}
function applyDamage(dmg){let left=dmg; const armor=game.inventory.find((i)=>i.name==="Body Armor"); if(armor&&armor.armor>0){const blocked=Math.min(armor.armor,left); armor.armor-=blocked; left-=blocked; addLog(`Your armor absorbs ${blocked} damage.`); if(armor.armor===0){game.inventory=game.inventory.filter((i)=>i!==armor); addLog("Body Armor breaks.");}} if(left>0){game.player.hp-=left; addLog(`You take ${left} damage.`);} }
function useItem(index){resolveAction(()=>{const item=game.inventory[index]; if(!item)return false; if(item.name==="Health Kit"){const heal=Math.min(3,game.player.maxHp-game.player.hp); game.player.hp+=heal; game.inventory.splice(index,1); addLog(`You use a Health Kit and recover ${heal} HP.`); game.turn++; return true;} return false;});}
function takeChest(){const c=game.pendingChest; if(!c)return; const invNeeds=["Health Kit","Body Armor","Key"].includes(c.item); if(invNeeds&&game.inventory.length>=2){addLog("Inventory full."); closeChestPrompt(); game.pendingChest=null; render(); return;} if(c.item==="Health Kit") game.inventory.push({name:"Health Kit"});
if(c.item==="Body Armor") game.inventory.push({name:"Body Armor",armor:3});
if(c.item==="Key") game.inventory.push({name:"Key"});
if(c.item==="Extended Magazine"){game.maxShots=5; game.shots=Math.min(game.shots,game.maxShots); addLog("Extended Magazine installed. Clip size increased to 5.");}
if(c.item==="Improved Barrel"){game.shotDamage=3; addLog("Improved Barrel installed. Shot damage increased.");}
if(c.item==="Map"){game.mapFound=true; addLog("You found a map. The floor plan is revealed.");}
if(invNeeds) addLog(`Item taken: ${c.item}.`);
game.chests = game.chests.filter((x)=>x!==c); game.pendingChest=null; closeChestPrompt(); resolveAction(()=>{game.turn++; return true;});}
function leaveChest(){game.pendingChest=null; closeChestPrompt(); addLog("You leave the chest for now."); render();}
function openChestPrompt(c){el.chestText.textContent=`Take ${c.item}?`; el.chestPrompt.classList.remove("hidden");}
function closeChestPrompt(){el.chestPrompt.classList.add("hidden");}
function checkEnd(){if(game.player.hp<=0){game.over=true; addLog("You fall. Press Restart or Space.");}}

function render(){el.hp.textContent=Math.max(0,game.player.hp); el.maxHp.textContent=game.player.maxHp; el.shots.textContent=`${game.shots}/${game.maxShots}`; el.turn.textContent=game.turn; el.kills.textContent=game.kills; el.enemyCount.textContent=game.enemies.length;
const rows=[]; for(let y=0;y<HEIGHT;y++){const row=[]; for(let x=0;x<WIDTH;x++){const vis=game.visible.has(key(x,y)); const reveal=vis||game.mapFound; let ch="."; let cls="cell";
if(game.player.x===x&&game.player.y===y){ch="@";}
else {const foe=enemyAt(x,y); if(foe&&vis){ch=enemySymbol(foe); cls+=" enemy"; if(game.hovered===key(x,y)) cls+=" target";}
else if(chestAt(x,y)&&vis) ch="C";
else if(x===game.exit.x&&y===game.exit.y&&reveal) ch="E";
else {const d=doorAt(x,y); if(d&&reveal) ch="D"; else if(game.walls.has(key(x,y))&&reveal){ch="#"; cls+=" wall";} else if(reveal&&game.floors.has(key(x,y))) ch=" ";}}
if(ch===".") row.push("."); else row.push(`<span class="${cls}" data-x="${x}" data-y="${y}">${ch}</span>`);} rows.push(row.join(""));}
el.grid.innerHTML=rows.join("\n"); el.log.innerHTML=game.logs.map((l)=>`<p>${l}</p>`).join("");
el.inventory.innerHTML = `<strong>Inventory (${game.inventory.length}/2)</strong>` + (game.inventory.length?game.inventory.map((i,idx)=>`<div class="inventory-row"><span>${i.name}${i.name==="Body Armor"?` (${i.armor})`:""}</span>${i.name!=="Key"&&i.name!=="Body Armor"?`<button class="btn use-item" data-idx="${idx}">Use</button>`:""}</div>`).join(""):`<div class="inventory-row"><span>(empty)</span></div>`);
}

function setup(){document.addEventListener("keydown",(e)=>{const k=e.key.toLowerCase(); if(k===" "&&game.over) return newGame(); if(game.pendingChest) return; if(k==="w"||k==="arrowup") move(0,-1); if(k==="s"||k==="arrowdown") move(0,1); if(k==="a"||k==="arrowleft") move(-1,0); if(k==="d"||k==="arrowright") move(1,0);});
el.dpad.addEventListener("click",(e)=>{const b=e.target.closest("button[data-dir]"); if(!b||game.pendingChest) return; const d=b.dataset.dir; if(d==="up")move(0,-1); if(d==="down")move(0,1); if(d==="left")move(-1,0); if(d==="right")move(1,0);});
el.waitBtn.addEventListener("click",waitTurn); el.reloadBtn.addEventListener("click",reload); el.restartBtn.addEventListener("click",newGame);
// Pointer events unify mouse/touch so one tap doesn't trigger duplicate shot actions.
el.grid.addEventListener("pointermove",(e)=>{const s=e.target.closest(".enemy"); game.hovered=s?key(Number(s.dataset.x),Number(s.dataset.y)):null; render();});
el.grid.addEventListener("pointerdown",(e)=>{const s=e.target.closest(".enemy"); if(!s) return; e.preventDefault(); tryShootAt(Number(s.dataset.x),Number(s.dataset.y));});
el.inventory.addEventListener("click",(e)=>{const b=e.target.closest(".use-item"); if(b) useItem(Number(b.dataset.idx));});
el.takeBtn.addEventListener("click",takeChest); el.leaveBtn.addEventListener("click",leaveChest);
}

setup();
newGame();
