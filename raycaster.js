/* Experimental flat-shaded grid raycaster for ASCII Horde.
   Rendering only: no movement, combat, map, or inventory mutations. */
(function () {
  "use strict";
  const W = 320, H = 180, FOV = Math.PI * 0.46;
  const MAX_DISTANCE = 12;
  const WALL_HEIGHT = 1.35;
  // Deliberately subdued, room-specific wall/ceiling/floor tints.
  const PALETTES = [
    [1.00,1.02,1.00], [1.01,0.98,0.88], [0.88,0.98,1.08],
    [0.95,1.04,0.92], [1.07,0.94,0.96], [0.99,0.96,1.08]
  ];
  function paletteAt(state,x,y) {
    let best=-1, distance=Infinity;
    for(let i=0;i<state.rooms.length;i++) {
      const room=state.rooms[i];
      if(x>=room.x&&x<room.x+room.w&&y>=room.y&&y<room.y+room.h) {
        best=i;break;
      }
      const nearX=Math.max(room.x,Math.min(x,room.x+room.w-1));
      const nearY=Math.max(room.y,Math.min(y,room.y+room.h-1));
      const d=(nearX-x)*(nearX-x)+(nearY-y)*(nearY-y);
      if(d<distance){distance=d;best=i;}
    }
    if(best<0)return PALETTES[0];
    const room=state.rooms[best];
    const hash=(room.x*17+room.y*31+room.w*7+room.h*13+best*11);
    return PALETTES[Math.abs(hash)%PALETTES.length];
  }
  const COLORS = { red:"#ff6666", blue:"#66aaff", yellow:"#ffee66", green:"#77ff77" };
  const DIR = { north:[0,-1], east:[1,0], south:[0,1], west:[-1,0] };
  let canvas, ctx;
  let recoilStart = -1;
  let animationQueued = false;
  let currentState = null, currentHost = null;
  const RECOIL_MS = 260;
  function recoil() {
    recoilStart = performance.now();
  }

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
    let dist = MAX_DISTANCE, side = 0, hit = false, kind = "wall", door = null;
    for (let i=0;i<32;i++) {
      if (sideX < sideY) {
        dist = sideX; sideX += ddx; x += sx; side = 0;
      } else {
        dist = sideY; sideY += ddy; y += sy; side = 1;
      }
      if (dist > MAX_DISTANCE) break;
      door = state.doors.find(d => d.x === x && d.y === y);
      if (door) { hit = true; kind = "door"; break; }
      if (state.exit.x === x && state.exit.y === y) { hit = true; kind = "exit"; break; }
      if (x<0 || y<0 || x>=72 || y>=40 || state.walls.has(x+","+y)) {
        hit = true;
        break;
      }
    }
    return {dist:Math.max(0.06,dist),side,hit,x,y,kind,door};
  }

  function drawSurfaces(state,forward,right,projection,ox,oy) {
    // Row-based floor/ceiling casting: every seam belongs to a world grid line.
    const frame=ctx.createImageData(W,H), pixels=frame.data;
    for(let y=0;y<H;y++) {
      const ceiling=y<H/2;
      const offset=Math.abs(y-H/2+.5);
      const rowDist=(projection*WALL_HEIGHT*.5)/Math.max(.5,offset);
      for(let x=0;x<W;x++) {
        const cameraX=(x+.5-W/2)/projection;
        const wx=ox+rowDist*(forward[0]+right[0]*cameraX);
        const wy=oy+rowDist*(forward[1]+right[1]*cameraX);
        const tileX=Math.floor(wx),tileY=Math.floor(wy);
        const fx=wx-tileX,fy=wy-tileY;
        const seam=Math.min(fx,fy,1-fx,1-fy);
        const checker=(tileX+tileY)&1;
        const fog=Math.max(.16,1-rowDist/(MAX_DISTANCE+1));
        const base=ceiling?64:(checker?29:41);
        const tint=paletteAt(state,tileX,tileY);
        const seamEffect=!ceiling && seam < Math.min(.022,.003*rowDist) ? 6 : 0;
        const shade=Math.round((base+seamEffect)*fog+5);
        const i=(y*W+x)*4;
        pixels[i]=Math.min(255,Math.round(shade*tint[0]));
        pixels[i+1]=Math.min(255,Math.round((shade+1)*tint[1]));
        pixels[i+2]=Math.min(255,Math.round(shade*tint[2]));
        pixels[i+3]=255;
      }
    }
    ctx.putImageData(frame,0,0);
  }

  function drawWalls(state, forward, right) {
    const ox=state.player.x+.5,oy=state.player.y+.5;
    const projection=W/(2*Math.tan(FOV/2));
    const depths=new Float32Array(W);
    drawSurfaces(state,forward,right,projection,ox,oy);
    for(let col=0;col<W;col++) {
      const cameraX=(col+.5-W/2)/projection;
      const dx=forward[0]+right[0]*cameraX;
      const dy=forward[1]+right[1]*cameraX;
      const hit=cast(state,ox,oy,dx,dy);
      depths[col]=hit.dist;
      if(!hit.hit)continue;
      const height=Math.min(H*4,projection*WALL_HEIGHT/hit.dist);
      const y0=Math.round((H-height)/2),y1=Math.round((H+height)/2);
      const fog=Math.max(.25,1-hit.dist/(MAX_DISTANCE+2));
      const tone=Math.round((hit.side===0?95:76)*fog+11);
      const tint=paletteAt(state,hit.x,hit.y);
      ctx.fillStyle="rgb("+Math.round(tone*tint[0])+","+Math.round(tone*tint[1])+","+Math.round(tone*tint[2])+")";
      ctx.fillRect(col,y0,1,y1-y0);
      // Horizontal block courses remain quiet so doors and enemies dominate.
      if(hit.kind==="wall" && height>12) {
        ctx.fillStyle="rgba(170,180,170,"+(0.10*fog)+")";
        for(let course=1;course<4;course++) {
          const seamY=Math.round(y0+height*course/4);
          if(seamY>=0 && seamY<H) ctx.fillRect(col,seamY,1,1);
        }
      }
      const hitCoord=hit.side===0?oy+hit.dist*dy:ox+hit.dist*dx;
      const fraction=hitCoord-Math.floor(hitCoord);
      const edge=Math.min(fraction,1-fraction);
      if(edge<.027) {
        ctx.fillStyle="rgba(210,220,210,"+(.75*fog)+")";
        ctx.fillRect(col,y0,1,y1-y0);
      }
      if(hit.kind==="door"||hit.kind==="exit") {
        const color=hit.kind==="exit"?(COLORS[state.exit.color]||"#bbb")
          :hit.door.locked?(COLORS[hit.door.color]||"#bbb"):"#e5e5e5";
        const frameL=.21, frameR=.79, lintel=.14;
        const isOpening=fraction>frameL&&fraction<frameR;
        const top=y0+height*lintel;
        if(isOpening) {
          const locked=hit.kind==="exit"||hit.door.locked;
          // Dark doorway cavity, closed panel when locked; open passage when unlocked.
          ctx.fillStyle=locked?"#343936":"#101713";
          ctx.fillRect(col,top,1,y1-top);
          const border=(fraction<frameL+.028||fraction>frameR-.028);
          if(border) {
            ctx.fillStyle=color;
            ctx.fillRect(col,top,1,y1-top);
          }
          if(locked&&Math.abs(fraction-.64)<.013) {
            ctx.fillStyle=color;
            ctx.fillRect(col,top+height*.42,1,Math.max(1,height*.045));
          }
        }
        // Real jambs and lintel aligned with the same wall's projected surface.
        if(Math.abs(fraction-frameL)<.014||Math.abs(fraction-frameR)<.014) {
          ctx.fillStyle=color;
          ctx.fillRect(col,top,1,y1-top);
        }
        if(isOpening) {
          ctx.fillStyle=color;
          ctx.fillRect(col,top,1,Math.max(1,2.2/hit.dist));
        }
      }
    }
    return {depths,projection,ox,oy};
  }

  function drawSprite(state, obj, forward, right, data) {
    const vx=obj.x+0.5-data.ox, vy=obj.y+0.5-data.oy;
    const depth=vx*forward[0]+vy*forward[1];
    const lateral=vx*right[0]+vy*right[1];
    if(depth<=0.15 || depth>MAX_DISTANCE) return;
    const sx=W/2+data.projection*lateral/depth;
    const size=data.projection/depth;
    const w=size*(obj.type==="enemy" ? .38 : obj.type==="chest" ? .50 : .18);
    const h=size*(obj.type==="enemy" ? .72 : obj.type==="chest" ? .31 : .17);
    const floor=H/2+size*WALL_HEIGHT*.5;
    const left=Math.round(sx-w/2), top=Math.round(floor-h), rightEdge=Math.ceil(sx+w/2);
    if(rightEdge<0||left>=W) return;

    // Clip each object against the actual wall-depth buffer, column by column.
    ctx.save();
    ctx.beginPath();
    let visibleColumns=0;
    for(let x=Math.max(0,left);x<Math.min(W,rightEdge);x++) {
      if(depth<data.depths[x]+.05) {
        ctx.rect(x,Math.max(0,top-4),1,Math.min(H,Math.ceil(floor+3))-Math.max(0,top-4));
        visibleColumns++;
      }
    }
    if(!visibleColumns){ctx.restore();return;}
    ctx.clip();
    // Opaque solid silhouettes and ground contact shadow anchors every pickup or enemy to the floor.
    ctx.fillStyle="#050705";
    ctx.fillRect(left-Math.max(2,w*.18),Math.round(floor)-3,Math.max(3,w*1.36),Math.max(2,4/depth));
    ctx.strokeStyle="rgba(0,0,0,.65)";
    ctx.lineWidth=Math.max(1,1.6/depth);
    if(obj.type==="chest") {
      const col=obj.locked?(COLORS[obj.color]||"#aaa"):"#b3b3b3";
      ctx.fillStyle="#383838";ctx.fillRect(left,top,w,h);
      ctx.fillStyle="#555555";ctx.fillRect(left,top,w,Math.max(2,h*.24));
      ctx.strokeStyle=col;ctx.lineWidth=Math.max(1,2/depth);ctx.strokeRect(left,top,w,h);
      ctx.fillStyle=col;ctx.fillRect(sx-1,top+h*.40,2,Math.max(2,h*.28));
    } else if(obj.type==="ammo") {
      ctx.fillStyle="#9bdcff";ctx.fillRect(left,top,w,h);
      ctx.fillStyle="#35647a";ctx.fillRect(left,top,w,Math.max(1,h*.24));
    } else if(obj.type==="enemy") {
      // Stable pseudo-random corruption derived from each entity, never from frame time.
      const id=(obj.enemy.id===undefined?0:Number(obj.enemy.id)||0);
      let seed=(Math.imul(obj.x+1,73856093)^Math.imul(obj.y+1,19349663)^Math.imul(id+1,83492791))>>>0;
      const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const px=Math.max(1,w/11),py=Math.max(1,h/19);
      const variant=Math.floor(rand()*4);
      const body=["#a0abb1","#9ea8a0","#b9a3b3","#b3b09a"][variant];
      const accent=["#d6dece","#d6c9b2","#c4d5e7","#c8ddc8"][variant];
      const dark="#222a2d";
      // Coherent, upright, humanoid mass first; broken pixels deform its contour.
      ctx.fillStyle=dark;ctx.fillRect(left+w*.27,top+h*.21,w*.48,h*.58);
      ctx.fillStyle=body;
      ctx.fillRect(left+w*.32,top+h*.21,w*.36,h*.55);
      ctx.fillRect(left+w*.36,top+h*.04,w*.28,h*.25);
      ctx.fillRect(left+w*.16,top+h*.30,w*.18,h*.37);
      ctx.fillRect(left+w*.66,top+h*.30,w*.18,h*.37);
      ctx.fillRect(left+w*.34,top+h*.72,w*.15,h*.27);
      ctx.fillRect(left+w*.52,top+h*.72,w*.15,h*.27);
      // Different silhouettes share a recognizable corrupted shape language.
      for(let j=0;j<23;j++){
        const bx=Math.floor(rand()*11),by=Math.floor(rand()*17);
        const blockW=px*(1+Math.floor(rand()*3)),blockH=py*(1+Math.floor(rand()*3));
        ctx.fillStyle=rand()<.26?dark:rand()<.52?accent:body;
        ctx.fillRect(left+bx*px,top+by*py,blockW,blockH);
      }
      // An invariant bright fault line makes the entire species identifiable.
      ctx.fillStyle="#dce6e4";
      ctx.fillRect(left+w*.42,top+h*.10,Math.max(1,w*.13),Math.max(1,h*.05));
      ctx.fillRect(left+w*.45,top+h*.18,Math.max(1,w*.07),Math.max(1,h*.34));
      if(state.selectedTargetKey===obj.x+","+obj.y){
        ctx.strokeStyle="#fff";ctx.lineWidth=Math.max(1,2/depth);
        ctx.strokeRect(left-2,top-2,w+4,h+4);
      }
    }
    ctx.restore();
  }

  function drawWeapon(state) {
    const aiming=Boolean(state.aiming);
    const elapsed=performance.now()-recoilStart;
    const firing=elapsed>=0&&elapsed<RECOIL_MS;
    const phase=firing?elapsed/RECOIL_MS:1;
    const kick=firing?Math.sin(Math.PI*phase)*(1-phase)*12:0;
    // Kept intentionally blocky: silhouette, hand, and an uncomplicated muzzle.
    const x=aiming?W*.50:W*.79;
    const y=aiming?H-12:H+17;
    ctx.save();
    ctx.translate(x+(firing?kick*.28:0),y+kick);
    ctx.rotate((aiming?0:.22)+(firing?-.10*Math.sin(Math.PI*phase):0));
    ctx.lineJoin="miter";
    ctx.lineWidth=2;
    ctx.strokeStyle="#111714";
    // Hand / wrist, rendered as a solid foreground shape.
    ctx.fillStyle="#827769";
    ctx.beginPath();
    ctx.moveTo(12,5);ctx.lineTo(32,7);ctx.lineTo(47,30);
    ctx.lineTo(12,30);ctx.lineTo(3,17);ctx.closePath();
    ctx.fill();ctx.stroke();
    ctx.fillStyle="#a0927e";
    ctx.fillRect(8,-3,22,15);
    ctx.strokeRect(8,-3,22,15);
    // Rectangular grip and slide, with a sharply outlined barrel.
    ctx.fillStyle="#2d3433";
    ctx.beginPath();
    ctx.moveTo(-9,-12);ctx.lineTo(17,-12);ctx.lineTo(15,14);
    ctx.lineTo(2,20);ctx.lineTo(-8,9);ctx.closePath();
    ctx.fill();ctx.stroke();
    ctx.fillStyle="#414b4a";
    ctx.fillRect(-14,-51,27,43);
    ctx.strokeRect(-14,-51,27,43);
    ctx.fillStyle="#667271";
    ctx.fillRect(-14,-51,27,5);
    ctx.fillStyle="#171e1d";
    ctx.fillRect(-5,-56,10,6);
    ctx.fillStyle="#202a28";
    ctx.fillRect(-6,-49,12,31);
    ctx.strokeStyle="#91a09b";
    ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(-13,-44);ctx.lineTo(-13,-13);ctx.stroke();
    if(firing&&phase<.26) {
      const flare=1-phase/.26;
      ctx.fillStyle="#e7d49a";
      ctx.beginPath();
      ctx.moveTo(0,-59);ctx.lineTo(-8*flare,-65-14*flare);
      ctx.lineTo(0,-69-20*flare);ctx.lineTo(8*flare,-65-14*flare);
      ctx.closePath();ctx.fill();
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
    state.chests.forEach(c=>{if(isVisible(c.x,c.y))objects.push({type:"chest",x:c.x,y:c.y,locked:c.locked,color:c.lockColor});});
    state.pickups.forEach(p=>{if(isVisible(p.x,p.y))objects.push({type:"ammo",x:p.x,y:p.y});});
    state.enemies.forEach(e=>{if(isVisible(e.x,e.y))objects.push({type:"enemy",x:e.x,y:e.y,enemy:e});});
    objects.sort((a,b)=>(b.x-state.player.x)**2+(b.y-state.player.y)**2-((a.x-state.player.x)**2+(a.y-state.player.y)**2));
    objects.forEach(obj=>drawSprite(state,obj,forward,right,wallData));
    drawWeapon(state);
    currentState=state;
    currentHost=host;
    const elapsed=performance.now()-recoilStart;
    if(elapsed<RECOIL_MS && elapsed>=0 && !animationQueued) {
      animationQueued=true;
      requestAnimationFrame(()=>{
        animationQueued=false;
        if(currentState&&currentHost)render(currentState,currentHost);
      });
    }
  }
  window.ASCIIHordeRaycaster={render,recoil};
})();
