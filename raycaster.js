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
      const rowDist=(projection*.5)/Math.max(.5,offset);
      for(let x=0;x<W;x++) {
        const cameraX=(x+.5-W/2)/projection;
        const wx=ox+rowDist*(forward[0]+right[0]*cameraX);
        const wy=oy+rowDist*(forward[1]+right[1]*cameraX);
        const tileX=Math.floor(wx),tileY=Math.floor(wy);
        const fx=wx-tileX,fy=wy-tileY;
        const seam=Math.min(fx,fy,1-fx,1-fy);
        const checker=(tileX+tileY)&1;
        const fog=Math.max(.16,1-rowDist/(MAX_DISTANCE+1));
        const base=ceiling?(checker?17:19):(checker?28:39);
        const seamEffect=seam < Math.min(.022,.003*rowDist) ? (ceiling?3:6) : 0;
        const shade=Math.round((base+seamEffect)*fog+5);
        const i=(y*W+x)*4;
        pixels[i]=shade;
        pixels[i+1]=shade+(ceiling?1:2);
        pixels[i+2]=shade;
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
      const height=Math.min(H*4,projection/hit.dist);
      const y0=Math.round((H-height)/2),y1=Math.round((H+height)/2);
      const fog=Math.max(.25,1-hit.dist/(MAX_DISTANCE+2));
      const tone=Math.round((hit.side===0?91:72)*fog+9);
      ctx.fillStyle="rgb("+tone+","+tone+","+tone+")";
      ctx.fillRect(col,y0,1,y1-y0);
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
    const floor=H/2+size*.5;
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
      const ratio=obj.enemy.hp/obj.enemy.maxHp;
      const color=ratio>.6?"#ff9999":ratio>.3?"#ffcc66":"#ff5555";
      ctx.fillStyle=color;
      ctx.fillRect(left+w*.23,top+h*.25,w*.54,h*.57);
      ctx.fillRect(left+w*.3,top,w*.4,h*.33);
      ctx.fillRect(left+w*.18,top+h*.8,w*.22,h*.2);
      ctx.fillRect(left+w*.6,top+h*.8,w*.22,h*.2);
      ctx.fillStyle="#111";
      ctx.fillRect(left+w*.38,top+h*.11,Math.max(1,w*.09),Math.max(1,h*.05));
      ctx.fillRect(left+w*.57,top+h*.11,Math.max(1,w*.09),Math.max(1,h*.05));
      if(state.selectedTargetKey===obj.x+","+obj.y) {
        ctx.strokeStyle="#fff";ctx.lineWidth=Math.max(1,2/depth);ctx.strokeRect(left-2,top-2,w+4,h+4);
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
    state.chests.forEach(c=>{if(isVisible(c.x,c.y))objects.push({type:"chest",x:c.x,y:c.y,locked:c.locked,color:c.lockColor});});
    state.pickups.forEach(p=>{if(isVisible(p.x,p.y))objects.push({type:"ammo",x:p.x,y:p.y});});
    state.enemies.forEach(e=>{if(isVisible(e.x,e.y))objects.push({type:"enemy",x:e.x,y:e.y,enemy:e});});
    objects.sort((a,b)=>(b.x-state.player.x)**2+(b.y-state.player.y)**2-((a.x-state.player.x)**2+(a.y-state.player.y)**2));
    objects.forEach(obj=>drawSprite(state,obj,forward,right,wallData));
  }
  window.ASCIIHordeRaycaster={render};
})();
