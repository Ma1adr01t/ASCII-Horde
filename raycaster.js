/* Experimental flat-shaded grid raycaster for ASCII Horde.
   Rendering only: no movement, combat, map, or inventory mutations. */
(function () {
  "use strict";
  const W = 320, H = 180, FOV = Math.PI * 0.46;
  const MAX_DISTANCE = 12;
  const COLORS = { red:"#ff6666", blue:"#66aaff", yellow:"#ffee66", green:"#77ff77" };
  const DIR = { north:[0,-1], east:[1,0], south:[0,1], west:[-1,0] };
  let canvas, ctx;

  function setup(host) {
    if (!canvas || canvas.parentElement !== host) {
      host.replaceChildren();
      canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      canvas.className = "raycast-canvas";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "First-person dungeon");
      host.appendChild(canvas);
      ctx = canvas.getContext("2d", { alpha: false });
    }
    return !!ctx;
  }

  function cast(state, ox, oy, dx, dy) {
    let x = Math.floor(ox), y = Math.floor(oy);
    const ddx = dx === 0 ? Infinity : Math.abs(1/dx);
    const ddy = dy === 0 ? Infinity : Math.abs(1/dy);
    const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
    let sideX = (dx < 0 ? ox-x : x+1-ox)*ddx;
    let sideY = (dy < 0 ? oy-y : y+1-oy)*ddy;
    let dist = MAX_DISTANCE, side = 0, hit = false;
    for (let i=0;i<32;i++) {
      if (sideX < sideY) {
        dist = sideX; sideX += ddx; x += sx; side = 0;
      } else {
        dist = sideY; sideY += ddy; y += sy; side = 1;
      }
      if (dist > MAX_DISTANCE) break;
      if (x<0 || y<0 || x>=72 || y>=40 || state.walls.has(x+","+y)) {
        hit = true;
        break;
      }
    }
    return {dist:Math.max(0.06,dist),side,hit,x,y};
  }

  function drawWalls(state, forward, right) {
    const ox = state.player.x+0.5, oy = state.player.y+0.5;
    const projection = W/(2*Math.tan(FOV/2));
    const depths = new Float32Array(W);
    ctx.fillStyle="#050909"; ctx.fillRect(0,0,W,H/2);
    ctx.fillStyle="#121512"; ctx.fillRect(0,H/2,W,H/2);
    ctx.fillStyle="#1d261d"; ctx.fillRect(0,H/2,W,1);
    for (let col=0;col<W;col++) {
      const cameraX=(col+0.5-W/2)/projection;
      const dx=forward[0]+right[0]*cameraX;
      const dy=forward[1]+right[1]*cameraX;
      const hit=cast(state,ox,oy,dx,dy);
      depths[col]=hit.dist;
      if (!hit.hit) continue;
      const height=Math.min(H*3,projection/hit.dist);
      const y0=Math.round((H-height)/2), y1=Math.round((H+height)/2);
      const fog=Math.max(0.22,1-hit.dist/(MAX_DISTANCE+1));
      const base=hit.side===0?88:66;
      const tone=Math.round(base*fog+10);
      ctx.fillStyle="rgb("+tone+","+tone+","+tone+")";
      ctx.fillRect(col,y0,1,y1-y0);
      // Very fine vertical borders at tile boundaries, no floating guides.
      const hitCoord=hit.side===0 ? oy+hit.dist*dy : ox+hit.dist*dx;
      const edge=Math.min(hitCoord-Math.floor(hitCoord),1-(hitCoord-Math.floor(hitCoord)));
      if(edge<0.035) {
        ctx.fillStyle="rgba(205,220,205,"+(0.65*fog)+")";
        ctx.fillRect(col,y0,1,y1-y0);
      }
    }
    return {depths,projection,ox,oy};
  }

  function drawSprite(state, obj, forward, right, wallData) {
    const vx=obj.x+0.5-wallData.ox, vy=obj.y+0.5-wallData.oy;
    const depth=vx*forward[0]+vy*forward[1];
    const lateral=vx*right[0]+vy*right[1];
    if(depth<=0.15 || depth>MAX_DISTANCE) return;
    const sx=W/2+wallData.projection*lateral/depth;
    const size=wallData.projection/depth;
    if(sx+size<0 || sx-size>W) return;
    const middle=Math.max(0,Math.min(W-1,Math.round(sx)));
    if(depth>wallData.depths[middle]+0.15) return;
    const fog=Math.max(0.30,1-depth/(MAX_DISTANCE+1));
    ctx.save();ctx.globalAlpha=fog;
    if(obj.type==="door" || obj.type==="exit") {
      const color=COLORS[obj.color]||"#aaaaaa";
      const w=size*0.48, h=size*0.83;
      const x=sx-w/2,y=H/2+size/2-h;
      ctx.fillStyle=obj.type==="exit"?"#080f08":"#151515";
      ctx.fillRect(x,y,w,h);
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,3/depth);
      ctx.strokeRect(x,y,w,h);
      ctx.beginPath();ctx.arc(x+w*0.8,y+h*0.55,Math.max(0.8,2/depth),0,Math.PI*2);
      ctx.fillStyle=color;ctx.fill();
      if(obj.type==="exit") {ctx.strokeRect(x+w*.13,y+h*.13,w*.74,h*.74);}
    } else if(obj.type==="chest") {
      const color=obj.locked?(COLORS[obj.color]||"#aaaaaa"):"#aaaaaa";
      const w=size*.48,h=size*.24;
      const x=sx-w/2,y=H/2+size*.46-h;
      ctx.fillStyle="#262626";ctx.fillRect(x,y,w,h);
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,2/depth);
      ctx.strokeRect(x,y,w,h);
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w*.12,y-h*.18);ctx.lineTo(x+w*.88,y-h*.18);ctx.lineTo(x+w,y);ctx.stroke();
    } else if(obj.type==="ammo") {
      const w=size*.16,h=size*.12,y=H/2+size*.45-h;
      ctx.fillStyle="#99ddff";ctx.fillRect(sx-w/2,y,w,h);
      ctx.fillStyle="#325d77";ctx.fillRect(sx-w/2,y,w,h*.3);
    } else if(obj.type==="enemy") {
      const w=size*.40,h=size*.72,x=sx-w/2,y=H/2+size*.46-h;
      const ratio=obj.enemy.hp/obj.enemy.maxHp;
      const color=ratio>.6?"#ff9999":ratio>.3?"#ffcc66":"#ff5555";
      ctx.fillStyle=color;
      ctx.fillRect(x+w*.22,y+h*.25,w*.56,h*.55);
      ctx.fillRect(x+w*.3,y,w*.4,h*.32);
      ctx.fillRect(x+w*.18,y+h*.8,w*.22,h*.2);
      ctx.fillRect(x+w*.6,y+h*.8,w*.22,h*.2);
      ctx.fillStyle="#000";ctx.fillRect(x+w*.39,y+h*.12,w*.08,h*.05);ctx.fillRect(x+w*.56,y+h*.12,w*.08,h*.05);
      if(state.selectedTargetKey===obj.x+","+obj.y) {
        ctx.strokeStyle="#fff";ctx.lineWidth=Math.max(1,2/depth);ctx.strokeRect(x-2,y-2,w+4,h+4);
      }
    }
    ctx.restore();
  }

  function render(state, host) {
    if(!setup(host)) return;
    const forward=DIR[state.player.dir]||DIR.north;
    const right=[-forward[1],forward[0]];
    const wallData=drawWalls(state,forward,right);
    const objects=[];
    const isVisible=(x,y)=>state.visible.has(x+","+y);
    state.doors.forEach(d=>{if(isVisible(d.x,d.y)) objects.push({type:"door",x:d.x,y:d.y,color:d.locked?d.color:null});});
    if(isVisible(state.exit.x,state.exit.y))objects.push({type:"exit",...state.exit});
    state.chests.forEach(c=>{if(isVisible(c.x,c.y))objects.push({type:"chest",x:c.x,y:c.y,locked:c.locked,color:c.lockColor});});
    state.pickups.forEach(p=>{if(isVisible(p.x,p.y))objects.push({type:"ammo",x:p.x,y:p.y});});
    state.enemies.forEach(e=>{if(isVisible(e.x,e.y))objects.push({type:"enemy",x:e.x,y:e.y,enemy:e});});
    objects.sort((a,b)=>(b.x-state.player.x)**2+(b.y-state.player.y)**2-((a.x-state.player.x)**2+(a.y-state.player.y)**2));
    objects.forEach(obj=>drawSprite(state,obj,forward,right,wallData));
  }
  window.ASCIIHordeRaycaster={render};
})();
