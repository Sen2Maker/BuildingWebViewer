import { preferenceStorage } from './preference-storage.js';
import { FlyCameraPose, flyCameraSettings, FLY_CAMERA_DEFAULTS } from './fly-camera.js';
import { gsViewSpec } from './camera-geometry.js';

/** Owns keyboard/pointer/touch input only while the explicit first-person mode is active. */
export function mountFlyCameraControls(viewer, container) {
  const en = document.documentElement.lang === 'en', tr = (zh, english) => en ? english : zh;
  const make = (tag, text, cls) => { const el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; };
  const storage = 'BuildingWebViewer.camera.fly.v2';
  let settings = flyCameraSettings(); try { settings = flyCameraSettings(JSON.parse(preferenceStorage().getItem(storage))); } catch {}
  const canvas = viewer.canvas, stage = canvas.parentElement, listeners = [], keys = new Set(), holds = new Map(), rolls = new Map();
  let active = false, frame = null, last = 0, sceneSpan = 1, locked = false, joystick = [0,0], lookPointer = null, stickPointer = null, savedCursor = '';
  const on = (el, event, fn, options) => { el.addEventListener(event, fn, options); listeners.push(() => el.removeEventListener(event, fn, options)); };
  const entry = make('button', tr('漫游模式', 'Fly camera'), 'gs-fly-entry'); entry.type = 'button'; entry.setAttribute('aria-pressed','false');
  document.querySelector('.viewer-toolbar').append(entry);
  const section = make('details', null, 'gs-navigation'); section.open = true;
  section.append(make('summary', tr('第一人称漫游', 'First-person camera')));
  const fields = [];
  function field(key, zh, eng, min, max, step, unit) {
    const row = make('div', null, 'gs-navigation-field'); row.append(make('span',tr(zh,eng)));
    const range = make('input'), number = make('input'); range.type='range'; number.type='number';
    for (const input of [range,number]) {
      input.min=min; input.max=max; input.step=step; input.value=settings[key];
      input.setAttribute('aria-label',tr(zh,eng)+(input===range?tr('滑块',' slider'):tr('数值',' value')));
      on(input,'input',()=>{const value=Number(input.value); if(input.value===''||!Number.isFinite(value)||value<min||value>max)return;settings=flyCameraSettings({...settings,[key]:value});(input===range?number:range).value=value;try{preferenceStorage().setItem(storage,JSON.stringify(settings));}catch{}});
      on(input,'change',()=>{input.value=settings[key];});
    }
    fields.push([key,range,number]); row.append(range,number,make('small',unit)); section.append(row);
  }
  field('sensitivity','转头灵敏度','Look sensitivity',.01,1,.01,'°/px');
  field('speed','移动速度','Travel speed',.005,2,.005,tr('场景/秒','scene/s'));
  field('rollSpeed','滚转速度','Roll speed',5,120,5,'°/s');
  const touchLabel=make('label',null,'gs-navigation-toggle'), touchMode=make('input');touchMode.type='checkbox';touchMode.checked=matchMedia('(pointer: coarse)').matches;
  touchLabel.append(touchMode,make('span',tr('使用触屏摇杆','Use touch controls')));section.append(touchLabel);
  section.append(make('p',tr('WASD / 方向键移动，空格上升，Shift 下降，Q 逆时针 / E 顺时针滚转相机，Esc 退出。鼠标向右即向右看，无惯性；按住 Ctrl 临时慢行。升降沿进入时的画面上方向，移动速度按模型大小换算。触屏：左摇杆移动，右侧拖动转头，可同时操作升降与 ↶ / ↷ 滚转。滚转改变相机倾斜，画面会向相反方向转动。','WASD / arrows move, Space rises, Shift descends, Q rolls the camera counterclockwise / E clockwise, Esc exits. Direct mouse look; hold Ctrl for precision travel. Vertical movement uses the entry view’s up direction. Speed scales with scene size. Touch: left stick moves, right side looks; rise/descend and ↶ / ↷ roll can be held together. Camera roll turns the image in the opposite direction.'),'presentation-help'));
  const reset=make('button',tr('恢复漫游默认值','Reset fly controls'));reset.type='button';reset.onclick=()=>{settings=flyCameraSettings(FLY_CAMERA_DEFAULTS);for(const[k,r,n]of fields)r.value=n.value=settings[k];try{preferenceStorage().setItem(storage,JSON.stringify(settings));}catch{}};section.append(reset);container.append(section);
  const hud=make('div',null,'gs-fly-hud');hud.hidden=true;
  const top=make('div',null,'gs-fly-top'), status=make('span',null,'gs-fly-status'), exit=make('button',tr('退出漫游 · Esc','Exit fly · Esc'));exit.type='button';top.append(status,exit);
  const cross=make('div','+','gs-fly-cross');cross.setAttribute('aria-hidden','true');
  const pad=make('div',null,'gs-fly-stick');pad.setAttribute('aria-label',tr('移动摇杆','Movement joystick'));const thumb=make('i');pad.append(thumb,make('span',tr('移动','Move')));
  const look=make('div',tr('拖动转头','Drag to look'),'gs-fly-look');look.setAttribute('aria-label',tr('转头触控区','Touch look area'));
  const vertical=make('div',null,'gs-fly-vertical');
  for(const [value,zh,eng]of [[1,'上升','Rise'],[-1,'下降','Descend']]){const b=make('button',tr(zh,eng));b.type='button';vertical.append(b);on(b,'pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);holds.set(e.pointerId,value);schedule();});for(const name of ['pointerup','pointercancel','lostpointercapture'])on(b,name,e=>{holds.delete(e.pointerId);});}
  const rollPad=make('div',null,'gs-fly-roll');
  for(const [value,symbol,zh,eng]of [[1,'↶','逆时针滚转相机','Roll camera counterclockwise'],[-1,'↷','顺时针滚转相机','Roll camera clockwise']]){const b=make('button',symbol);b.type='button';b.setAttribute('aria-label',tr(zh,eng));rollPad.append(b);on(b,'pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);rolls.set(e.pointerId,value);schedule();});for(const name of ['pointerup','pointercancel','lostpointercapture'])on(b,name,e=>rolls.delete(e.pointerId));}
  hud.append(top,cross,look,pad,vertical,rollPad);stage.append(hud);
  function help(fallback=false){status.textContent=touchMode.checked?tr('漫游 · 左手移动 / 右手转头','Fly · left move / right look'):fallback?tr('鼠标锁定不可用：按住画面拖动转头 · WASD 移动 · Q/E 滚转 · Esc 退出','Pointer lock unavailable: drag to look · WASD moves · Q/E rolls · Esc exits'):tr('漫游 · WASD 移动 · 空格 ↑ / Shift ↓ · Q/E ↶↷ · Esc 退出','Fly · WASD moves · Space ↑ / Shift ↓ · Q/E ↶↷ · Esc exits');}
  function clearInput(){keys.clear();holds.clear();rolls.clear();joystick=[0,0];lookPointer=null;stickPointer=null;thumb.style.transform='';if(frame!==null)cancelAnimationFrame(frame);frame=null;last=0;}
  function schedule(){if(active&&frame===null){if(!last)last=performance.now();frame=requestAnimationFrame(tick);}}
  function tick(now){frame=null;if(!active)return;const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
    const has=(...codes)=>codes.some(code=>keys.has(code))?1:0;
    const x=has('KeyD','ArrowRight')-has('KeyA','ArrowLeft')+joystick[0], z=has('KeyW','ArrowUp')-has('KeyS','ArrowDown')+joystick[1], y=has('Space')-has('ShiftLeft','ShiftRight')+[...holds.values()].reduce((a,b)=>a+b,0);
    const roll=has('KeyQ')-has('KeyE')+[...rolls.values()].reduce((a,b)=>a+b,0);
    if(x||y||z||roll){viewer.flyPose.rollBy(Math.max(-1,Math.min(1,roll))*settings.rollSpeed*dt*(has('ControlLeft','ControlRight')?.2:1));viewer.flyPose.move(x,z,y,sceneSpan*settings.speed*dt*(has('ControlLeft','ControlRight')?.2:1));viewer.requestRender();schedule();}else last=0;
  }
  function turn(dx,dy){if(!active)return;viewer.flyPose.look(dx,dy,settings.sensitivity);viewer.requestRender();}
  function enter(){if(active||!(viewer.count||viewer.pointCount||viewer.edgeCount||viewer.triangleCount)||viewer.contextLost)return;viewer.stopNavigation();viewer.drag=null;viewer.prepareFly?.();
    const spec=gsViewSpec(viewer,canvas.clientWidth,canvas.clientHeight);
    viewer.flyPose=new FlyCameraPose(spec.eye,spec.basis); viewer.projection='perspective';
    // Preserve calibrated focal lengths rather than replacing the training lens on entry.
    if(!viewer.prepareFly&&!viewer.trainingPose)viewer.trainingPose={eye:[...spec.eye],basis:spec.basis,width:spec.width,height:spec.height,fx:spec.fx,fy:spec.fy};
    sceneSpan=Math.max(.001,viewer.baseHeight||1);active=true;entry.setAttribute('aria-pressed','true');savedCursor=canvas.style.cursor;canvas.style.cursor='crosshair';hud.hidden=false;stage.classList.add('gs-fly-active');hud.classList.toggle('touch',touchMode.checked);help();
    canvas.focus({preventScroll:true});viewer.requestRender();
    if(!touchMode.checked){try{if(!canvas.requestPointerLock){help(true);return;}const result=canvas.requestPointerLock();if(result?.catch)result.catch(()=>{if(active)help(true);});}catch{help(true);}}
  }
  function leave(){if(!active)return;active=false;clearInput();
    const pose=viewer.flyPose;viewer.flyPose=null;
    if(viewer.adoptFlyPose)viewer.adoptFlyPose(pose);
    else {viewer.trainingPose={...viewer.trainingPose,eye:[...pose.eye],basis:pose.basis.map(v=>[...v])};
    viewer.distance=Math.max(.01,viewer.distance/viewer.camera.zoom);viewer.camera.zoom=1;viewer.camera.pan=[0,0];viewer.target=pose.eye.map((v,i)=>v-pose.basis[2][i]*viewer.distance);}
    hud.hidden=true;stage.classList.remove('gs-fly-active');entry.setAttribute('aria-pressed','false');canvas.style.cursor=savedCursor;locked=false;
    if(document.pointerLockElement===canvas)document.exitPointerLock();viewer.requestRender();entry.focus({preventScroll:true});
  }
  entry.onclick=()=>active?leave():enter();exit.onclick=leave;
  on(document,'pointerlockchange',()=>{if(document.pointerLockElement===canvas){if(!active){document.exitPointerLock();return;}locked=true;}else if(locked)leave();});
  on(document,'pointerlockerror',()=>{if(active)help(true);});
  on(document,'mousemove',e=>{if(active&&document.pointerLockElement===canvas)turn(e.movementX,e.movementY);});
  const movement=new Set(['KeyQ','KeyE','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight']);
  on(document,'keydown',e=>{if(!active)return;if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();leave();return;}if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable)return;e.stopImmediatePropagation();if(movement.has(e.code)){e.preventDefault();keys.add(e.code);schedule();}},true);
  on(document,'keyup',e=>{if(!active)return;keys.delete(e.code);if(movement.has(e.code)){e.preventDefault();e.stopImmediatePropagation();}},true);
  on(window,'blur',leave);on(document,'visibilitychange',()=>{if(document.hidden)leave();});on(canvas,'webglcontextlost',leave);
  function bindLook(el){on(el,'pointerdown',e=>{if(!active||document.pointerLockElement===canvas||lookPointer||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();el.setPointerCapture(e.pointerId);lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY};},true);
    on(el,'pointermove',e=>{if(!active||lookPointer?.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();turn(e.clientX-lookPointer.x,e.clientY-lookPointer.y);lookPointer.x=e.clientX;lookPointer.y=e.clientY;},true);
    for(const name of ['pointerup','pointercancel','lostpointercapture'])on(el,name,e=>{if(lookPointer?.id===e.pointerId)lookPointer=null;});}
  bindLook(canvas);bindLook(look);
  function stick(e){const r=pad.getBoundingClientRect(),radius=r.width*.32,dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,length=Math.hypot(dx,dy),scale=length>radius?radius/length:1;joystick=length<radius*.08?[0,0]:[dx*scale/radius,-dy*scale/radius];thumb.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;schedule();}
  on(pad,'pointerdown',e=>{if(stickPointer!==null)return;e.preventDefault();stickPointer=e.pointerId;pad.setPointerCapture(e.pointerId);stick(e);});on(pad,'pointermove',e=>{if(e.pointerId===stickPointer){e.preventDefault();stick(e);}});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])on(pad,name,e=>{if(stickPointer===e.pointerId){stickPointer=null;joystick=[0,0];thumb.style.transform='';}});
  on(touchMode,'change',()=>{if(active)leave();});
  canvas.tabIndex=0;canvas.classList.add('camera-scene');
  viewer.fly={get active(){return active;},leave,dispose(){leave();listeners.forEach(fn=>fn());entry.remove();section.remove();hud.remove();}};
  return viewer.fly;
}
