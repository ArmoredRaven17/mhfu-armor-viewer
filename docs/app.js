// The MHFU Armor Viewer. One figure: a hunter in the game's own armour, on the gender's 21-bone player rig, played in the
// game's own motions, with the chosen weapon where the game puts it. MHFU's shading is not decoded, so it draws under
// generic lighting; the armour colours are the game's (an S-Series or X/Z-Series piece's colour into the one material the
// game colours, render/piece.js applyDye).
//
// THE SHARED VIEWER BASE (docs/base; the plan: C:\Coding Repos\VIEWER-BASE-PLAN.md; Phase 1.6, 2026-10-19, ported from
// the MH4U Armor Viewer's Phase 1.4 app.js): the render core (stage, assets, skeleton, material, materials-db, pose, fx,
// lens, grid) and the UI -- the Hunter tab (Hunter Slots, Armor Pieces, Pigment, Weapon, Hunter), the Animation,
// Lighting, Camera and Effects panels, the camera bar, capture and Save / Open -- are the base's, GU's markup and
// behaviour. This file is MHFU's: its data (docs/adapter.js maps it for the base), the armour colour modes, the hair under
// an empty head, the travel node of its motions, the weapon's passes from running the game's own weapon code (stances/),
// the session and set shapes. render/piece.js builds one model.
//
// Data (scripts/build_viewer.py, from C:/MHFU-Extract/tools; see each json's `_about`):
//   armor.json      the game's five armour tables (names, the model each gender draws, who may wear it, its rarity, its
//                   colour mode), every player piece (its glb, its rig joints, the material the game colours), the faces
//                   and hairstyles, the rigs, the motion packs
//   weapons.json    the game's weapon tables, the class of each weapon, every weapon model
//   materials.json  each material's albedo map and draw state (the PSP's per-mesh blending)
//   stances/wNN     per class: where the game puts the weapon on every frame of every clip of the class's pack
//   models/<g>      one glb per piece, each skinned to the whole rig     poses/<g>   one glb per motion pack
import * as THREE from 'three';
import { createStage } from './base/render/stage.js';
import { createFx } from './base/render/fx.js';
import { initAssets, loadJson, loader, bust, poseCache } from './base/render/assets.js';
import { setBiasUnitsPerStep } from './base/render/material.js';
import { loadMaterialsDb } from './base/render/materials-db.js';
import { PoseDriver } from './base/render/pose.js';
import { playerBone } from './base/render/skeleton.js';
import { createFloorGrid } from './base/render/grid.js';
import { loadPiece, paintPiece, dyeRegs, hairRegs, flatRegs, releasePiece, restoreBind } from './render/piece.js';
import * as adapter from './adapter.js?v=4';
import { createLightingPanel } from './base/ui/lighting-panel.js';
import { createEffectsPanel } from './base/ui/effects-panel.js';
import { createGuildPanel } from './base/ui/guild-panel.js';
import { createArmorPanel } from './base/ui/armor-panel.js';
import { createHunterPanel } from './base/ui/hunter-panel.js';
import { createWeaponPanel, orderClasses } from './base/ui/weapon-panel.js';
import { createPigment } from './base/ui/pigment.js';
import { createColourRows } from './base/ui/colour-rows.js';
import { createSaveOpen } from './base/ui/save-open.js';
import { createAnimationPanel } from './base/ui/animation-panel.js';
import { createCameraBar } from './base/ui/camera-bar.js';
import { createCapture } from './base/ui/capture.js';
import { createCameraPanel } from './base/ui/camera-panel.js';

// the game this viewer shows, for the shared base (docs/game.js)
const GAME = window.VIEWER_GAME;
// the Weapon panel's class rows (game.weaponRows: none read for MHFU yet)
const weaponPanel = createWeaponPanel(GAME, {});
// the adapter (docs/adapter.js) reads the app's objects through these, lazily: set before anything asks it
adapter.setApp({ get DATA(){ return DATA; }, get WEAPONS(){ return WEAPONS; }, get state(){ return state; }, worn: slot => worn(slot) });

// the page's test hooks; base/ui/capture.js hangs its own on it when it is built, so it exists from the start
window.__view = {};
const errEl = document.getElementById('err');
const errors = [];
window.__errors = errors;
function noteError(msg){ errors.push(String(msg)); errEl.textContent = String(msg); }
addEventListener('error', e => noteError('ERROR: ' + e.message));
addEventListener('unhandledrejection', e => noteError('ERROR: ' + ((e.reason && e.reason.message) || e.reason)));

const DATA = await loadJson('armor.json');
const WEAPONS = await loadJson('weapons.json');      // the game's weapon tables and every weapon model
await loadMaterialsDb();
const SLOTS = DATA.slots;                            // helm, body, arm, wst, leg

const MARGIN = 1.25;
const viewport = document.getElementById('viewport');
const stage = createStage(viewport, { margin: MARGIN });
const { renderer, scene, camera, controls, world } = stage;
const head = stage.lights.head;     // the headlight; the render loop keeps it on the camera
initAssets(renderer);
// post-processing (base/render/fx.js), switched in only when an effect is on: with every effect off the frame is the
// plain renderer.render
const fx = createFx(renderer, scene);
const SCENE = null;                  // GU's dev scene runs (?scene=); this app has none

let restoring = true;                // the boot fires the same handlers; nothing saves until it is done

// ---- Lighting and Effects: the shared base's panels ------------------------------------------------------------------
const lightPanel = createLightingPanel(GAME, { stage, scene, camera: () => camera, onChange: () => saveState() });
let fxFocusLive = 0, fxFocusTick = 0;
const fxPanel = createEffectsPanel(GAME, { fx: () => fx, focusLive: () => fxFocusLive, onChange: () => saveState() });

// ---- the camera bar's icons ------------------------------------------------------------------------------------------
const ICON = {
  orbit:  '<circle cx="12" cy="12" r="3.2"/><ellipse cx="12" cy="12" rx="9.6" ry="4.3" transform="rotate(-30 12 12)"/>',
  pan:    '<path d="M12 3.5v17M3.5 12h17M12 3.5 9.6 6M12 3.5 14.4 6M12 20.5 9.6 18M12 20.5 14.4 18M3.5 12 6 9.6M3.5 12 6 14.4M20.5 12 18 9.6M20.5 12 18 14.4"/>',
  camera: '<path d="M3.5 8.6h3.2L8.2 6.5h7.6l1.5 2.1h3.2v10.4H3.5V8.6Z"/><circle cx="12" cy="13.6" r="3.3"/>',
  rec:    '<circle cx="12" cy="12" r="5.6" fill="currentColor" stroke="none"/>',
  stop:   '<rect x="7" y="7" width="10" height="10" rx="1.6" fill="currentColor" stroke="none"/>',
  check:  '<path d="m5 12.6 4.6 4.6L19 7.4"/>',
  eye:    '<path d="M2.5 12c2.4-4 5.6-6 9.5-6s7.1 2 9.5 6c-2.4 4-5.6 6-9.5 6s-7.1-2-9.5-6Z"/><circle cx="12" cy="12" r="3"/>'
};
function setIcon(btn, key){ btn.querySelector('svg').innerHTML = ICON[key]; }
function setLabel(btn, label, tip){ btn.setAttribute('aria-label', label); btn.title = label + ': ' + tip; }

// ---- pose ---------------------------------------------------------------------------------------------------------------
// The game's own motions (armor.json poses: the Common pack f0081 and one pack per weapon class), played on an off-screen
// proxy and copied to every piece by bone id each frame (base/render/pose.js).
//   THE PROXY is the motion pack's own rig: the pack's glb carries the 21 rig nodes ("<i>:<i>" and its "_s" leaf, the
// same names as every piece's), and no piece is skinned to all 21 (a piece's skin holds only the joints its bones ride:
// the face 0 and 20), so the base's skin-indexed lookup is handed a mesh-free skinned rig over the pack's 21 leaves.
//   THE TRAVEL: MHFU's motions carry the hunter's travel on rig bone 1 (its local x / z: a walk's runs 0.23 m to 5.37 m
// along z, Common 0:03), not on the pelvis the base's anchor pins (bone 0 here is the rig's root, which no motion moves).
// The travel is held at bone 1's rest (the rig's origin, armor.json rigs) before the base's anchor runs, so the figure
// stays in frame, as the base's anchor does for GU's lobby motions; the pelvis's own sway (bone 2) is the motion's and
// plays as the game has it.
const leafGid = name => {                 // three.js names "20:20_s" "2020_s": the halves are the joint id
  const m = /^(\d+)_s$/.exec(name || ''), d = m && m[1];
  return d && d.length % 2 === 0 && d.slice(0, d.length / 2) === d.slice(d.length / 2) ? +d.slice(0, d.length / 2) : null;
};
class FuPoseDriver extends PoseDriver {
  async play(entry, opt){
    let g = poseCache.get(entry.file);
    if (!g){
      g = await loader.loadAsync(bust(entry.file));
      const leaves = [];
      g.scene.traverse(o => { const k = leafGid(o.name); if (k !== null) leaves.push([k, o]); });
      leaves.sort((a, b) => a[0] - b[0]);
      const rig = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
      g.scene.add(rig); g.scene.updateMatrixWorld(true);
      rig.bind(new THREE.Skeleton(leaves.map(x => x[1])));
      g.userData.joints = leaves.map(x => ({ gid: x[0], leaf: true }));
      g.userData.bind = [];
      g.scene.traverse(o => g.userData.bind.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
      poseCache.set(entry.file, g);
    }
    return super.play(entry, Object.assign({}, opt, { joints: g.userData.joints }));
  }
  anchorProxy(){
    const travel = this.proxyBones && this.proxyBones.get(1);
    if (travel){ travel.position.x = 0; travel.position.z = 0; }
    super.anchorProxy();
  }
}
const pose = new FuPoseDriver({ frame: world, onError: msg => noteError(msg) });
const mounted = {};                       // helm/body/arm/wst/leg/face/hair -> root
function activeMounts(){ return Object.values(mounted); }

// ---- the camera (base/ui/camera-panel.js) ----------------------------------------------------------------------------
const camPanel = createCameraPanel(GAME, {
  get SCENE(){ return SCENE; },
  get activeMounts(){ return activeMounts; },
  get camera(){ return camera; },
  get controls(){ return controls; },
  get figure(){ return 'hunter'; },
  get figureBounds(){ return figureBounds; },
  get fitPlanes(){ return fitPlanes; },
  get fitRenderer(){ return fitRenderer; },
  get fx(){ return fx; },
  get fxPanel(){ return fxPanel; },
  get head(){ return head; },
  get paintSpin(){ return camBar.paintSpin; },
  get playerBone(){ return playerBone; },
  get pose(){ return pose; },
  get renderer(){ return renderer; },
  get restoring(){ return restoring; },
  get saveState(){ return saveState; },
  get setIcon(){ return setIcon; },
  get setLabel(){ return setLabel; },
  get viewport(){ return viewport; },
  get world(){ return world; },
});
const { FLY_SPEED, applyCameraState, applyLens, cameraState, figureCenter, fly, focalOfSlider, focusDistance, leaveFly,
        lensCamera, lensEdit, lensFileState, paintCamMode, paintFlySpeed, paintOrbitLock, setCamMode, setFaceLock,
        setFlySpeed, setFocal, setFov, speedOfSlider, stepFly, viewDistance } = camPanel;

function fitRenderer(){
  stage.fit();
  const sz = renderer.getSize(new THREE.Vector2());
  fx.setSize(sz.x, sz.y, renderer.getPixelRatio(), camPanel.lensState);
}
// THE ONE RENDER ENTRY for the loop, the Screenshot button and the recorder: the composer when an effect is on, the
// plain render through the lens's camera otherwise
const _aniso = new THREE.Vector2(1, 1);
function renderFrame(t){
  camPanel.frameNo++;
  const cam = lensCamera();
  plateUpdate(cam);
  const dof = fxPanel.state.dof;
  const following = fx.active && dof.on && dof.follow;
  const focus = following ? focusDistance(t !== undefined) : dof.focus;
  fxFocusLive = focus;
  _aniso.set(camPanel.lensState.type === 'anamorphic' ? 1 / camPanel.lensState.squeeze : 1, 1);
  fx.feed({ time: t === undefined ? performance.now() / 1000 : t,
            mask: document.documentElement.classList.contains('chroma'), aspect: camera.aspect,
            focus, near: cam.near, far: cam.far, ortho: !!cam.isOrthographicCamera, aniso: _aniso });
  if (following && ((++fxFocusTick) % 15) === 0) fxPanel.paintFocusLive();
  if (fx.active) fx.render(cam); else renderer.render(scene, cam);
}

// ---- framing ------------------------------------------------------------------------------------------------------------
// Under a clip a skinned mesh keeps its rest bounds, so the pose driver's own bounds -- the union of the whole loop --
// and its body centre win where it has them.
function figureBounds(){
  const objs = activeMounts();
  if (!objs.length) return null;
  const box = new THREE.Box3();
  if (pose.bounds && !pose.bounds.isEmpty()) box.copy(pose.bounds);
  else objs.forEach(o => box.expandByObject(o));
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  if (pose.center) c.copy(pose.center);
  return { box, size, c };
}
function frameAll(){
  if (camPanel.camMode === 'fly') leaveFly({ keepTarget: true });   // Fit to View is an orbit view
  const fb = figureBounds();
  if (!fb) return;
  const { box, size, c } = fb;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const reachY = Math.max(box.max.y - c.y, c.y - box.min.y) * 2;
  const reachX = Math.max(box.max.x - c.x, c.x - box.min.x) * 2;
  const dist = Math.max((Math.max(size.y, reachY) * 0.5) / Math.tan(vFov / 2),
                        (Math.max(size.x, reachX) * 0.5) / Math.tan(vFov / 2) / camera.aspect) * MARGIN + size.z * 0.5;
  controls.target.copy(c);
  camera.position.copy(c).add(new THREE.Vector3(0, 0, dist));
  fitPlanes(dist);
  camera.updateProjectionMatrix(); controls.update();
}
document.getElementById('fitBtn').onclick = () => frameAll();
// The clip planes follow the camera's distance every frame (GU's)
function fitPlanes(dist){
  if (!(dist > 0)) dist = viewDistance();
  const near = Math.min(dist / 4, Math.max(1e-4, dist * dist / 4194));
  const far = Math.max(50, dist * 20);
  if (Math.abs(near - camera.near) > near * 0.02 || Math.abs(far - camera.far) > far * 0.02){
    camera.near = near; camera.far = far; camera.updateProjectionMatrix();
  }
}
// the base material's depth-bias steps, as a fixed push at the model (MHFU's materials carry none; kept so a biased
// material would draw as in the other viewers)
const BIAS_STEP_M = 0.0005;
function updateDepthBias(){
  const dist = viewDistance();
  let lsb;
  if (camPanel.lensState.type === 'ortho'){ const rc = lensCamera(); lsb = (rc.far - rc.near) / 16777216; }
  else lsb = dist * dist / camera.near / 16777216;
  if (lsb > 0) setBiasUnitsPerStep(BIAS_STEP_M / lsb);
}

// ---- the floor grid (base/render/grid.js), a camera bar toggle -----------------------------------------------------
// The floor is where the figure's soles are: the lowest point of its meshes as they stand (GU's rule)
const floorAt = { key: null, y: 0, centre: new THREE.Vector3(), reach: 1 };
function figureFloor(){
  const roots = activeMounts();
  const clip = pose.action ? pose.action.getClip() : null;
  const key = [pose.ground, clip ? clip.uuid : ''].concat(roots.map(r => r.uuid)).join('|');
  if (key === floorAt.key) return floorAt;
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (const root of roots) root.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i += 2){ o.getVertexPosition(i, v); box.expandByPoint(v.applyMatrix4(o.matrixWorld)); }
  });
  if (box.isEmpty()) return floorAt;
  floorAt.key = key;
  floorAt.y = box.min.y;
  box.getCenter(floorAt.centre);
  floorAt.reach = 0.5 * Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  return floorAt;
}
const floorGrid = createFloorGrid({ scene, floor: () => figureFloor().y,
                                    centre: out => out.copy(figureFloor().centre), reach: () => figureFloor().reach });

// ---- the camera bar and the Camera panel's controls (base/ui/camera-bar.js) ----------------------------------------
const camBar = createCameraBar(GAME, {
  get FLY_SPEED(){ return FLY_SPEED; },
  get SCENE(){ return SCENE; },
  get applyLens(){ return applyLens; },
  get camPanel(){ return camPanel; },
  get controls(){ return controls; },
  get floorGrid(){ return floorGrid; },
  get focalOfSlider(){ return focalOfSlider; },
  get fxPanel(){ return fxPanel; },
  get lensEdit(){ return lensEdit; },
  get paintCamMode(){ return paintCamMode; },
  get saveState(){ return saveState; },
  get setCamMode(){ return setCamMode; },
  get setFaceLock(){ return setFaceLock; },
  get setFlySpeed(){ return setFlySpeed; },
  get setFocal(){ return setFocal; },
  get setLabel(){ return setLabel; },
  get speedOfSlider(){ return speedOfSlider; },
});
// no pointer lock (a touch device): the first-person camera is not offered
if (!('requestPointerLock' in document.body)){
  document.getElementById('flyBtn').hidden = true;
  document.querySelector('#camMode option[value=fly]').disabled = true;
}

// ---- what is worn -------------------------------------------------------------------------------------------------------
const LS_KEY = 'mhfu-armor-viewer';
const clone = o => JSON.parse(JSON.stringify(o));
const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

// THE WEAPON CLASSES: weapons.json's (each model's class is the game's, BOOT 0x089785A8), in GU's Guild Card order, each
// with its motion pack (the class's own list, wNN: armor.json poses, labelled by class) -- the Stance list and the
// stances file
const packOf = name => { const P = (DATA.poses.f || []).find(x => x.label === name); return P ? P.id : null; };
const W_CLASSES = orderClasses(WEAPONS.classes.filter(n => (WEAPONS.weapons[n] || []).length).map(n => ({ name: n, key: packOf(n) })),
                               adapter.classNameOf);
const wClass = name => W_CLASSES.find(c => c.name === name) || null;

// A slot holds an ARMOUR RECORD id (0 = nothing): the record is what the game colours by (its colour mode, +0x13).
// A PIGMENT ROW (pig[slot]): 'default' (the piece's own colour, following the armour), or { on, hex } (the shared base's
// rule). pigDev[slot]: the slot's Rainbow (its name) or null.
// THE POSE: { list, clip }, a clip of the Common pack ('' = Bind Pose); the default is its first clip, 0:01 -- the
// game's own standing loop -- as the 4U viewer starts on 4U's.
// THE WEAPON: cls a class name ('' none); model the weapon model (weNNN); drawn; stance a clip of the class's pack.
const PIG_DEFAULT = { helm: 'default', body: 'default', arm: 'default', wst: 'default', leg: 'default' };
// THE HAIR COLOR: '#rrggbb', or null for the row's Default -- the game's own: a new save's hair colour, entry 0 of the
// game's sixteen (adapter.js HAIR_COLOURS, READ 2026-10-19).
const DEFAULTS = { g: 'f', type: 'all', helm: 0, body: 0, arm: 0, wst: 0, leg: 0, face: 0, hair: 0, cloth: 0, hairC: null,
                   pig: clone(PIG_DEFAULT), pigDev: [null, null, null, null, null],
                   pose: { list: 'co', clip: '0:01' },
                   weapon: { cls: '', model: '', drawn: false, stance: '', attach: '' } };
function pigRowOf(v){
  if (v && typeof v === 'object' && typeof v.on === 'boolean' && isHex(v.hex)) return { on: v.on, hex: v.hex.toLowerCase() };
  return 'default';
}
// A hunter, every field type-guarded onto the defaults: what a save, a slot or an older version of this app wrote is
// never trusted as it stands. The first version (before the shared base) kept the five records under `slots`, the
// weapon as wcls / weapon (a model) / carry / stance, and the pose as 'relaxed', 'bind' or 'co|<clip>'; its 'relaxed'
// was a hand-made pose, not the game's, and is gone (it reads as the default).
function hunterOf(h){
  const o = clone(DEFAULTS);
  if (!h || typeof h !== 'object') return o;
  if (h.g === 'f' || h.g === 'm') o.g = h.g;
  if (['all', 'b', 'g'].includes(h.type)) o.type = h.type;
  const recs = h.slots && typeof h.slots === 'object' ? h.slots : h;
  for (const k of SLOTS) if (Number.isInteger(recs[k]) && recs[k] >= 0) o[k] = recs[k];
  for (const k of ['face', 'hair']) if (Number.isInteger(h[k]) && h[k] >= 0) o[k] = h[k];
  if (Number.isInteger(h.cloth) && h.cloth >= 0 && h.cloth < 8) o.cloth = h.cloth;
  if (isHex(h.hairC)) o.hairC = h.hairC.toLowerCase();
  if (h.pig && typeof h.pig === 'object') for (const s of SLOTS) o.pig[s] = pigRowOf(h.pig[s]);
  // a slot on the Rainbow: the key base/ui/pigment.js saves it under (the game's name, or 'rainbow' where it gives none)
  const RB_KEY = GAME.pigmentRainbow.name || 'rainbow';
  if (Array.isArray(h.pigDev)) o.pigDev = SLOTS.map((s, i) => h.pigDev[i] === RB_KEY ? RB_KEY : null);
  if (h.pose && typeof h.pose === 'object' && typeof h.pose.list === 'string' && typeof h.pose.clip === 'string')
    o.pose = { list: h.pose.list, clip: h.pose.clip };
  else if (h.pose === 'bind') o.pose = { list: 'co', clip: '' };
  else if (typeof h.pose === 'string' && h.pose.indexOf('|') > 0){
    const [list, clip] = h.pose.split('|'); o.pose = { list, clip };
  }
  const w = h.weapon;
  if (w && typeof w === 'object'){
    if (typeof w.cls === 'string' && (w.cls === '' || wClass(w.cls)))
      o.weapon = { cls: w.cls, model: typeof w.model === 'string' ? w.model : '', drawn: w.drawn === true,
                   stance: typeof w.stance === 'string' ? w.stance : '',
                   attach: attachOf(w) };
  } else if (typeof h.wcls === 'string' && wClass(h.wcls))
    o.weapon = { cls: h.wcls, model: typeof w === 'string' ? w : '', drawn: h.carry === 'drawn',
                 stance: typeof h.stance === 'string' ? h.stance : '', attach: '' };
  return o;
}
// THE ATTACHMENT (one at a time): '' none, 'barrel' (flag 0x20: the Light Bowgun's Long Barrel, the Heavy's Power
// Barrel), 'silencer' (Light, 0x10), 'shield' (Heavy, 0x80). An earlier build of this port held checkboxes (`parts`, its
// barrel once called `scope`): the first one set, in that order, is kept.
function attachOf(w){
  if (['', 'barrel', 'silencer', 'shield'].includes(w.attach)) return w.attach;
  const p = w.parts && typeof w.parts === 'object' ? w.parts : {};
  return p.barrel === true || p.scope === true ? 'barrel' : p.silencer === true ? 'silencer' : p.shield === true ? 'shield' : '';
}
const state = clone(DEFAULTS);
// v2 is the shared base's session; the first version's had no `v` (its hunter reads the same through hunterOf)
let SAVED = null;
try { SAVED = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (_) {}
if (!SAVED || typeof SAVED !== 'object') SAVED = null;
const savedAny = (() => { try { return localStorage.getItem(LS_KEY) !== null; } catch (_) { return false; } })();
if (SAVED) Object.assign(state, hunterOf(SAVED));
let savedChain = SAVED && Array.isArray(SAVED.chain) ? { chain: SAVED.chain, chainLoop: !!SAVED.chainLoop } : null;

const recById = Object.fromEntries(SLOTS.map(s => [s, new Map(DATA.armor[s].map(r => [r.id, r]))]));
// the record worn in a slot; record 0 ("Nothing equipped.") is no piece worn
const worn = slot => (state[slot] ? recById[slot].get(state[slot]) || null : null);

// The model a slot draws: the worn record's model for this gender. With nothing worn (READ 2026-10-19, 0x088D6388):
// legs, chest and arms draw the CLOTHING -- the clothing choice's row of the game's table, in the column the face's skin
// tone picks (armor.json inner / tone); the waist draws record 0's model; the head draws no armour (the hairstyle shows).
function modelFor(slot){
  const r = worn(slot);
  if (r) return r[state.g];
  if (slot === 'helm') return null;
  const inner = DATA.inner && DATA.inner[state.g] && DATA.inner[state.g][slot];
  if (inner) return inner[state.cloth * 4 + DATA.tone[state.g][state.face]] || null;
  const r0 = recById[slot].get(0);
  return r0 ? r0[state.g] : null;
}
const pieceRec = slot => { const k = modelFor(slot); return k ? DATA.pieces[k] || null : null; };

// ---- the Hair Color row (base/ui/colour-rows.js) ---------------------------------------------------------------------------
// HAIR COLOR (READ 2026-10-19): the player data holds it as RGB (+0x4BC; the hunter copies it to +0x4E4, 0x088D66F4).
// Character creation picks one of the game's sixteen (adapter.js HAIR_COLOURS: the selector lists them with the armour
// colours); a save holds any RGB, so RGB... is offered too, with no board (none read). Default is the game's: entry 0,
// what a new save holds. It goes into the head slot's model, a hairstyle or a helm alike (render/piece.js paintPiece).
const HAIR_DEFAULT = adapter.HAIR_COLOURS[0];
const colourRows = createColourRows(GAME, {
  openPalette: (...a) => pigPanel.openCharacter(...a),
  get saveState(){ return saveState; },
  scene,
  defaultColour: part => (part === 'hair' ? '#' + HAIR_DEFAULT.map(v => v.toString(16).padStart(2, '0')).join('') : null),
  applyColours: cc => { state.hairC = isHex(cc.hair) ? cc.hair.toLowerCase() : null; applyAllColours(); },
});
colourRows.buildColorLists();
function paintColourRows(){ colourRows.charColor.hair = state.hairC || 'default'; colourRows.paintRow('hair'); }

// ---- pigment (base/ui/pigment.js) -------------------------------------------------------------------------------------------
// THE ARMOUR COLOUR (armor.json `col`, record +0x13; READ 2026-10-19, game.js pigmentRainbow / adapter.js): an S-Series
// (2) or X/Z-Series (3) piece takes the colour its pigment row holds, or the game's Rainbow (the base's selector offers
// and steps it, stepDeviant); a mode-1 piece is drawn in the fixed grey the game writes for it; a mode-0 piece takes none.
// The rows are the base's: they write the colour each row holds into `slotPigment` (the game's bytes, or null for an
// unticked row).
const rowPig = {};
const slotPigment = {};
let colourQueued = false;
function queueColours(){
  if (colourQueued) return;
  colourQueued = true;
  queueMicrotask(() => { colourQueued = false; applyAllColours(); });
}
for (const sl of SLOTS) Object.defineProperty(slotPigment, sl, {
  enumerable: true, get: () => rowPig[sl] || null, set: v => { rowPig[sl] = v || null; queueColours(); } });
// the colour the game writes for the piece worn in a slot (null: none)
function pigmentOf(slot){
  const r = worn(slot);
  if (!r) return null;
  if (r.col === 1) return adapter.FIXED_GREY;
  if (r.col === 2 || r.col === 3) return rowPig[slot] || null;
  return null;
}
const rgb255 = h => isHex(h) ? hexRGB(h) : null;
const pigPanel = createPigment(GAME, {
  SLOTS, slotPigment, rgb255,
  get saveState(){ return saveState; },
  DEVIANTS: [],                                           // GU's; MHFU has none
  deviant: { on: false, a: '#000000', b: '#000000', anim: 'fade' },
  deviantMix: () => 0,
  defaultPigHex: slot => adapter.defaultPigHex(slot),
  dyeable: slot => adapter.dyeable(slot),
  dyeableNoneReason: 'Nothing is worn: the clothing shows, which takes no color',
  pigmentColours: () => adapter.pigmentColours(),
  pigmentSections: () => adapter.pigmentSections(),
});
const { followDefaultPig, paintDyeable, pigOnDef, readSlotPigments, applyPigDef } = pigPanel;
const PIG_NONE = pigPanel.PIG_NONE;
// the rows, as the hunter's state holds them
function pigStateOfRows(){
  const o = {};
  for (const sl of SLOTS) o[sl] = pigOnDef.has(sl) ? 'default'
    : { on: document.getElementById('pgOn_' + sl).checked, hex: document.getElementById('pg_' + sl).value.toLowerCase() };
  return o;
}
// the hunter's rows onto the panel: Default rows take the worn piece's own colour (and follow the armour from here)
function applyPigRows(pig, pigDev){
  applyPigDef(SLOTS.filter(sl => pig[sl] === 'default'));
  for (const sl of SLOTS){
    const v = pig[sl], cb = document.getElementById('pgOn_' + sl), col = document.getElementById('pg_' + sl);
    if (v === 'default'){ const h = adapter.defaultPigHex(sl); cb.checked = !!h; col.value = h || PIG_NONE; }
    else { cb.checked = v.on; col.value = v.hex; }
  }
  document.getElementById('pgOn_all').checked = false; document.getElementById('pg_all').value = PIG_NONE;
  pigPanel.applySlotDev(pigDev || [null, null, null, null, null]);
  readSlotPigments(); paintDyeable();
}
// THE DYE MASK: the material the game colours, on every piece that takes a colour (modes 1-3), in magenta, every other
// material dimmed -- exact, since the game colours one material per piece. The region also glows magenta, so a dark map
// still shows it; each material's own emissive is kept and put back when the mask goes off.
const maskCb = document.getElementById('maskdbg');
maskCb.title = 'Show which part of each piece takes its color: that material in magenta, the rest dimmed';
const MASK_ON = [255, 0, 255], MASK_OFF = [70, 70, 70];
maskCb.onchange = () => applyAllColours();
function dyeMask(root, on, takes){
  root.traverse(o => {
    const m = (o.isMesh || o.isSkinnedMesh) && o.material;
    if (!m || !m.emissive) return;
    if (on){
      if (!m.userData.maskEmissive) m.userData.maskEmissive = m.emissive.clone();
      if (takes && m.userData.dyed) m.emissive.setRGB(0.45, 0, 0.45); else m.emissive.setRGB(0, 0, 0);
    } else if (m.userData.maskEmissive){ m.emissive.copy(m.userData.maskEmissive); delete m.userData.maskEmissive; }
  });
}
// every mounted model's colours: an armour slot's piece its colour (or none); the head slot's model (the hairstyle, or the
// helm) the hair colour; the face none
function applyAllColours(){
  const mask = maskCb.checked;
  const hair = hairRegs(state.hairC ? hexRGB(state.hairC) : HAIR_DEFAULT);
  for (const k of SLOTS.concat(['face', 'hair'])){
    const root = mounted[k];
    if (!root) continue;
    const r = SLOTS.includes(k) ? worn(k) : null, takes = !!r && r.col >= 1;
    const head = k === 'helm' || k === 'hair';
    if (mask) paintPiece(root, { dye: flatRegs(takes ? MASK_ON : MASK_OFF), hair: flatRegs(MASK_OFF), rest: flatRegs(MASK_OFF) });
    else paintPiece(root, { dye: SLOTS.includes(k) ? dyeRegs(pigmentOf(k)) : null, hair: head ? hair : null, rest: null });
    dyeMask(root, mask, takes);
  }
}

// ---- mounting -----------------------------------------------------------------------------------------------------------
// Each slot loads on its own ticket: a fast scroll through a list fires faster than models load, and a load that comes
// back stale drops its result instead of mounting it.
const shown = {};                         // the piece record each slot is showing
const ticket = {};
function unmount(k){
  if (mounted[k]){ world.remove(mounted[k]); releasePiece(mounted[k]); delete mounted[k]; delete shown[k]; }
}
async function mountOne(k, rec){
  const t = ticket[k] = (ticket[k] || 0) + 1;
  if (shown[k] === rec && mounted[k]) return;
  if (!rec){ unmount(k); return; }
  const root = await loadPiece(rec, { wire: camBar.wireOn });
  if (t !== ticket[k]){ releasePiece(root); return; }
  unmount(k);
  root.userData.slot = k;
  world.add(root); mounted[k] = root; shown[k] = rec;
}

let loads = 0;
function setLoading(on){
  loads = Math.max(0, loads + (on ? 1 : -1));
  document.getElementById('loading').hidden = loads === 0;
}
async function refresh(){
  setLoading(true);
  try {
    const chars = DATA.chars[state.g];
    const jobs = SLOTS.map(slot => mountOne(slot, pieceRec(slot)));
    jobs.push(mountOne('face', DATA.pieces[chars.face[state.face]] || null));
    // a helm replaces the hairstyle (the game's "Nothing equipped." head model is the hair itself)
    jobs.push(mountOne('hair', worn('helm') ? null : DATA.pieces[chars.hair[state.hair]] || null));
    jobs.push(refreshWeapon());
    await Promise.all(jobs);
    applyAllColours();
    if (camBar.wireOn) camBar.paintWire();
  } catch (e) { noteError(e && e.message || e); }
  finally { setLoading(false); }
  saveState();
}

// ---- the Armor Pieces panel (base/ui/armor-panel.js) --------------------------------------------------------------------
const filterEl = document.getElementById('filter');
const slotSel = Object.fromEntries(SLOTS.map(s => [s, document.querySelector('select[data-slot="' + s + '"]')]));
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function selectToken(sel, slot, v){
  sel.value = v;
  if (sel.value !== v && v){
    sel.insertAdjacentHTML('afterbegin', '<option value="' + esc(v) + '">' + esc(armorPanel.labelOf(slot, v)) + '</option>');
    sel.value = v;
  }
}
// what follows a new piece in a slot: its Default pigment, the rows it allows
function onPieceChange(slot){
  if (pigOnDef.has(slot)) followDefaultPig(slot);
  paintDyeable();
  applyAllColours();
  saveState();
}
const armorPanel = createArmorPanel(GAME, {
  get SAVED(){ return { hunterType: state.type }; },
  SLOTS,
  get gender(){ return state.g; },
  get saveState(){ return saveState; },
  selectToken,
  setSlot: async (slot, v) => { state[slot] = v === 'none' ? 0 : (+v || 0); await refresh(); },
  onPieceChange,
  armorOptions: (slot, type) => adapter.armorOptions(slot, type),
  armorSpecials: slot => adapter.armorSpecials(slot),
  legacyModel: (slot, v, any) => adapter.legacyModel(slot, v, any),
});
// the Type filter is the panel's view; the hunter keeps it (it saves with the slot)
document.getElementById('htype').addEventListener('change', e => { state.type = e.target.value; });
// the five selects from the hunter's records, then the panel's lists around them
function paintArmorSelects(){
  document.getElementById('htype').value = state.type;
  armorPanel.hunterType = state.type;
  for (const slot of SLOTS){
    const tok = adapter.tokenOfRecord(slot, state[slot]);
    if (tok === 'none') state[slot] = 0;                 // a record this gender cannot wear
    slotSel[slot].innerHTML = '<option value="' + tok + '"></option>';
    slotSel[slot].value = tok;
  }
  armorPanel.rebuildSelects(filterEl.value);
}

// ---- the Hunter panel (base/ui/hunter-panel.js) -------------------------------------------------------------------------
const poseSel = document.getElementById('pose');
const hunterPanel = createHunterPanel(GAME, {
  openPalette: (...a) => pigPanel.openCharacter(...a),
  charStyles: part => adapter.charStyles(part),
  paintCount: () => adapter.paintCount(),
  clothingOptions: () => adapter.clothingOptions(),
  get clothingDefault(){ return String(state.cloth); },
  poseOptions: () => adapter.poseOptions(),
  facePaint: null,
  get gender(){ return state.g; },
  get saveState(){ return saveState; },
  setGender: g => setGender(g),
  refreshChar: async () => {
    state.face = +document.getElementById('faceStyle').value || 0;
    state.hair = +document.getElementById('hairStyle').value || 0;
    await refresh();
  },
  applyFacePaint(){}, setBody(){},
  setClothing: async () => { state.cloth = +document.getElementById('clothing').value || 0; await refresh(); },
  onPoseChange: v => onPoseChange(v),
});
// THE FACE NOTE (game.js hunterRows 'faceNote'): MHFU sets skin tone by the face, so there is no Skin Tone row
{
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = 'The face type also sets the skin tone (MHFU has no separate skin tone option).';
  document.getElementById('faceNote').appendChild(note);
}
// the Hunter panel's selects from the hunter's state
function paintHunterRows(){
  document.getElementById('genderSel').value = state.g;
  hunterPanel.buildStyleLists();
  const chars = DATA.chars[state.g];
  state.face = Math.min(state.face, chars.face.length - 1);
  state.hair = Math.min(state.hair, chars.hair.length - 1);
  document.getElementById('faceStyle').value = String(state.face);
  document.getElementById('hairStyle').value = String(state.hair);
  document.getElementById('clothing').value = String(state.cloth);
  rebuildPoseList();
  paintColourRows();
}
// THE HUNTER'S POSE (the Hunter panel's Pose select, GU's): the Common pack's clips; "Bind Pose" stops the clip
function poseIndex(){
  const i = adapter.poseOptions().findIndex(p => p.list === state.pose.list && p.clip === state.pose.clip);
  return i >= 0 ? 'g:' + i : '';
}
function rebuildPoseList(){
  poseSel.innerHTML = '<option value="">Bind Pose</option>';
  hunterPanel.buildPoseList();
  poseSel.value = poseIndex();
  if (!poseSel.value) state.pose.clip = '';
}
function poseFromSelect(){
  const v = poseSel.value;
  const p = /^g:\d+$/.test(v) ? adapter.poseOptions()[+v.slice(2)] : null;
  if (p){ state.pose.list = p.list; state.pose.clip = p.clip; } else state.pose.clip = '';
}
async function onPoseChange(){
  if (!animPanel.chainDriving) animPanel.chainStop();
  sheatheForPose();
  poseFromSelect();
  await playPose(); saveState();
}
async function setGender(g){
  if (g !== 'f' && g !== 'm') return;
  state.g = g;
  // a record the other body cannot wear comes off (paintArmorSelects); the face and hair keep their index
  paintArmorSelects(); paintHunterRows(); buildStanceList();
  await refresh();
  for (const sl of SLOTS) if (pigOnDef.has(sl)) followDefaultPig(sl);
  paintDyeable();
  await playPose();
}

// ---- pose playing -----------------------------------------------------------------------------------------------------
// the gender's motion packs (the pose driver plays each on its own rig, FuPoseDriver)
function poseSet(){
  const lists = DATA.poses && DATA.poses[state.g];
  return lists ? { lists } : null;
}
function restoreAllBind(){ for (const root of Object.values(mounted)) restoreBind(root); }
// WHAT PLAYS (the MHGU viewer's applyWeaponState): a drawn weapon plays its Stance -- a clip of the class's own pack --
// and a sheathed one, or none, the hunter's Pose; the Pose keeps its choice while a stance plays, so sheathing returns to
// it, and picking a pose sheathes the weapon.
function nowPlaying(){
  const w = state.weapon, c = wClass(w.cls);
  if (c && w.model && w.drawn && w.stance) return { list: c.key, clip: w.stance, stance: true };
  return { list: state.pose.list, clip: state.pose.clip, stance: false };
}
// THE LOOP: the game's own flag on each clip (armor.json poses clips[].loop) where the Loop button has not been pressed:
// a stance the game loops repeats, the others play once and hold; the Common pack's clips repeat (the base's rule for a
// hunter pose). The Animation panel's Loop overrides it (pose.clipLoop, below).
function clipMeta(list, clip){
  const P = poseSet(), l = P && P.lists.find(x => x.id === list);
  return (l && l.clips.find(c => c.clip === clip)) || null;
}
let poseTicket = 0;
async function playPose(){
  const t = ++poseTicket;
  const P = poseSet(), now = nowPlaying();
  const l = P && P.lists.find(x => x.id === now.list);
  if (!P || !l || !now.clip || !l.clips.some(c => c.clip === now.clip)){ pose.stop(); restoreAllBind(); return; }
  const meta = clipMeta(now.list, now.clip);
  await pose.play(Object.assign({ file: l.file, clip: now.clip, loop: !!(meta && meta.loop) },
                                now.stance ? { stance: true } : {}));
  if (t !== poseTicket) return;
}
function sheatheForPose(){
  if (!state.weapon.cls || !state.weapon.drawn) return;
  state.weapon.drawn = false; weaponDrawnSel.value = '0'; buildStanceList();
}

// ---- weapon -------------------------------------------------------------------------------------------------------------
// THE WEAPON: one model per weapon (weapons.json models, weNNN), its parts each under their own root bone (the sword and
// its shield, the bow and its quiver). Where the game puts it is the class's stances file (below), from running the
// game's own weapon code over its tables; the weapon is no figure of the pose driver (its bones are its own, not the rig's).
const weaponClassSel = document.getElementById('weaponClass'), weaponModelSel = document.getElementById('weaponModel'),
      weaponDrawnSel = document.getElementById('weaponDrawn'), weaponPoseSel = document.getElementById('weaponPose');
const fieldOf = el => el.closest('.field');
// ONE ENTRY PER MODEL (the 4U viewer's rule): an upgrade line often keeps one model (Carbalite Sword, Carbalite Sword+),
// so the list is the class's models in table order, each named by every weapon that draws it
function weaponOptions(name){
  const groups = new Map();
  for (const w of WEAPONS.weapons[name] || []){
    if (!groups.has(w.model)) groups.set(w.model, { model: w.model, names: [] });
    const g = groups.get(w.model);
    if (!g.names.includes(w.name)) g.names.push(w.name);
  }
  return [...groups.values()];
}
function buildWeaponLists(){
  const w = state.weapon, c = wClass(w.cls);
  weaponClassSel.innerHTML = '<option value="">— none —</option>' +
    W_CLASSES.map(x => '<option value="' + esc(x.name) + '">' + esc(x.name) + '</option>').join('');
  weaponClassSel.value = w.cls;
  const opts = c ? weaponOptions(c.name) : [];
  if (c && !opts.some(o => o.model === w.model) && opts.length) w.model = opts[0].model;
  weaponModelSel.innerHTML = opts.map(o => '<option value="' + esc(o.model) + '" title="' + esc(o.names.join(' / ')) + '">' +
                                           esc(o.names.join(' / ')) + '</option>').join('');
  weaponModelSel.value = w.model;
  weaponDrawnSel.value = w.drawn ? '1' : '0';
  fieldOf(weaponModelSel).hidden = !c;
  fieldOf(weaponDrawnSel).hidden = !c;
  weaponPanel.paintRows(c ? c.key : '');
  if (typeof state.weapon.attach !== 'string') state.weapon.attach = '';
  paintAttachment();
  buildStanceList();
}
const weapon = { key: '', obj: null };
let weaponTicket = 0;
function unmountWeapon(){
  if (weapon.obj){ world.remove(weapon.obj); releasePiece(weapon.obj); }
  weapon.obj = null; weapon.key = '';
  dropExtras();
}
async function refreshWeapon(){
  const w = state.weapon, c = wClass(w.cls);
  const key = c && w.model ? w.model : '';
  wantStance();
  if (key === weapon.key && (key ? weapon.obj : true)) return;
  const t = ++weaponTicket;
  if (!key){ unmountWeapon(); return; }
  const rec = WEAPONS.models[key];
  if (!rec){ noteError('no weapon model ' + key); unmountWeapon(); return; }
  const obj = await loadPiece({ glb: rec.glb }, { wire: camBar.wireOn });
  if (t !== weaponTicket){ releasePiece(obj); return; }
  unmountWeapon();
  obj.visible = false;                    // until its pass places it (updateWeapon)
  world.add(obj); weapon.obj = obj; weapon.key = key;
}

// ---- stances --------------------------------------------------------------------------------------------------------------
// WHERE THE GAME PUTS THE WEAPON (stances/wNN.json, one per class; C:/MHFU-Extract/tools/build_stances.py, from running
// the game's weapon placement 0x09A933C0 and carry rule 0x09A92228 over its tables in an emulator). For each variant of
// the class (models the game's weapon pass treats alike) and each clip of the class pack, a timeline of states from clip
// frame f (60 a second); `rest` is the weapon away. A state is the frame's passes -- the game draws the Long Sword's blade
// in the hand and its scabbard on the back in two passes, so it gets a second copy of the model. Per pass:
//   m  each part root (the sword, the shield; the bow, the quiver) on hunter joint `joint`:
//      world = joint's world * T(pos) R(quat) S(scale); with `place` / `axes`, turned with `joint` but placed at joint
//      `place` plus pos along joint `axes` (the sheathed Sword & Shield)
//   b  bones the pass sets (the bow's fold, a gunlance's or bowgun's working parts): local quat and scale, and pos where
//      the pass moves it off the model's own offset (null: keep it)
//   s  the meshes drawn and their materials shown; the others the game hides by zeroing their alpha
const STANCES = new Map();
function loadStance(pack){
  if (!STANCES.has(pack))
    STANCES.set(pack, loadJson('stances/' + pack + '.json').catch(e => {
      STANCES.delete(pack); noteError('stances/' + pack + '.json: ' + (e && e.message || e)); return null; }));
  return STANCES.get(pack);
}
const stanceNow = { pack: null, data: null };
function wantStance(){
  const c = wClass(state.weapon.cls), pack = c ? c.key : null;
  if (stanceNow.pack === pack) return;
  stanceNow.pack = pack; stanceNow.data = null;
  if (pack) loadStance(pack).then(d => { if (stanceNow.pack === pack) stanceNow.data = d; });
}
// the second copy of the weapon for a frame with two passes (loaded once per model, hidden when not needed)
const extras = [];
let extrasFor = null, extrasLoading = false;
function dropExtras(){
  for (const o of extras){ world.remove(o); releasePiece(o); }
  extras.length = 0; extrasFor = null;
}
async function ensureExtras(n){
  if (!weapon.obj || extrasLoading) return;
  if (extrasFor !== weapon.key) dropExtras();
  if (extras.length >= n) return;
  extrasLoading = true;
  try {
    const key = weapon.key, rec = WEAPONS.models[key];
    while (extras.length < n){
      const o = await loadPiece({ glb: rec.glb }, { wire: camBar.wireOn });
      if (weapon.key !== key){ releasePiece(o); break; }
      extrasFor = key; extras.push(o); world.add(o);
    }
  } finally { extrasLoading = false; }
}
// a mounted piece carrying the rig the pose drives (every piece carries all of it)
function hunterRig(){
  for (const k of ['leg', 'body', 'wst', 'arm', 'face', 'hair', 'helm']) if (mounted[k]) return mounted[k];
  return null;
}
// the state for this frame: the drawn stance's timeline while its clip plays, else the variant's rest
function stanceState(){
  const D = stanceNow.data;
  if (!D || !weapon.obj) return null;
  const vi = D.variants.findIndex(v => v.models.includes(weapon.key));
  if (vi < 0) return null;
  const now = nowPlaying();
  if (now.stance && pose.action && now.list === D.pack && D.clips[now.clip]){
    const tl = D.clips[now.clip][vi], f = Math.floor(pose.action.time * D.fps + 1e-4);
    let si = tl[0][1];
    for (const [f0, k] of tl){ if (f0 > f) break; si = k; }
    return D.states[si];
  }
  return D.states[D.rest[vi]];
}
const _wm = new THREE.Matrix4(), _wi = new THREE.Matrix4(), _wv = new THREE.Vector3(), _wq = new THREE.Quaternion(),
      _ws = new THREE.Vector3();
const nodeOf = (root, j) => root.getObjectByName(String(j) + String(j));     // three.js names "12:12" "1212"
function applyPass(obj, pass, rig){
  restoreBind(obj);
  obj.updateMatrixWorld(true);
  for (const [r, [joint, pos, q, sc, place, axes]] of Object.entries(pass.m)){
    const node = nodeOf(obj, r), bone = nodeOf(rig, joint);
    if (!node || !bone) continue;
    if (place === undefined){
      _wm.compose(_wv.fromArray(pos), _wq.fromArray(q), _ws.fromArray(sc));
      _wm.premultiply(bone.matrixWorld);
    } else {
      const P = nodeOf(rig, place), A = nodeOf(rig, axes);
      if (!P || !A) continue;
      _wm.compose(_wv.set(0, 0, 0), _wq.fromArray(q), _ws.fromArray(sc));
      _wm.premultiply(_wi.extractRotation(bone.matrixWorld));
      _wv.fromArray(pos).applyMatrix4(_wi.extractRotation(A.matrixWorld)).add(_ws.setFromMatrixPosition(P.matrixWorld));
      _wm.setPosition(_wv);
    }
    _wm.premultiply(_wi.copy(node.parent.matrixWorld).invert());
    _wm.decompose(node.position, node.quaternion, node.scale);
  }
  for (const [g, [pos, q, sc]] of Object.entries(pass.b)){
    const node = nodeOf(obj, g);
    if (!node) continue;
    if (pos) node.position.fromArray(pos);
    node.quaternion.fromArray(q); node.scale.fromArray(sc);
  }
  const extra = bowgunParts();
  obj.traverse(o => {
    if (!o.isMesh || !o.userData.fuKey) return;
    const [mi, mat] = o.userData.fuKey.split('/'), shown = pass.s[mi];
    o.visible = (!!shown && shown.includes(+mat)) || (mi === '0' && extra.includes(+mat));
  });
}
// THE BOWGUN PARTS the weapon draw shows (0x088D5918; game.js weaponRows): mesh 0's material entry 1 with the barrel (flag
// 0x20: the Light Bowgun's Long Barrel, the Heavy's Power Barrel), entry 2 with the Silencer (Light, 0x10) or the Shield
// (Heavy, 0x80). The stances' material lists come from a gun with no part fitted. Every bowgun model's mesh 0 lists
// materials 0, 1, 2 in order, so an entry is its material number.
const LBG = 'Light Bowgun', HBG = 'Heavy Bowgun';
function bowgunParts(){
  const w = state.weapon;
  if (w.cls !== LBG && w.cls !== HBG) return [];
  if (w.attach === 'barrel') return [1];
  if ((w.cls === LBG && w.attach === 'silencer') || (w.cls === HBG && w.attach === 'shield')) return [2];
  return [];
}
// THE ATTACHMENT ROW: the panel's own Attachment / Form row (base/ui/hunter-tab.js weaponForm), as GU's bowguns use it --
// None, then the class's two parts in the game's words (f0019 section 1: 420 Long Barrel, 421 Silencer; 435 Power
// Barrel, 436 Shield). The Animation panel wires its change to weapon.setForm (below).
const weaponFormSel = document.getElementById('weaponForm');
const ATTACH = { [LBG]: [['', 'None'], ['barrel', 'Long Barrel'], ['silencer', 'Silencer']],
                 [HBG]: [['', 'None'], ['barrel', 'Power Barrel'], ['shield', 'Shield']] };
function paintAttachment(){
  const opts = ATTACH[state.weapon.cls], field = document.getElementById('weaponFormField');
  field.style.display = opts ? '' : 'none';
  if (!opts) return;
  field.querySelector('label').textContent = 'Attachment';
  weaponFormSel.innerHTML = opts.map(([v, l], i) => '<option value="' + (i ? i : '') + '">' + esc(l) + '</option>').join('');
  if (!opts.some(o => o[0] === state.weapon.attach)) state.weapon.attach = '';
  const i = opts.findIndex(o => o[0] === state.weapon.attach);
  weaponFormSel.value = i > 0 ? String(i) : '';
}
function setAttachment(v){
  const opts = ATTACH[state.weapon.cls];
  state.weapon.attach = opts && v && opts[v] ? opts[v][0] : '';
}
// every frame, after the hunter's pose: the weapon where the game has it
function updateWeapon(){
  if (!weapon.obj){ for (const o of extras) o.visible = false; return; }
  const st = stanceState(), rig = hunterRig();
  if (!st || !rig){ weapon.obj.visible = false; for (const o of extras) o.visible = false; return; }
  weapon.obj.visible = true;
  rig.updateMatrixWorld(true);
  st.forEach((pass, i) => {
    const o = i ? extras[i - 1] : weapon.obj;
    if (o){ o.visible = true; applyPass(o, pass, rig); }
  });
  if (st.length > 1 + extras.length) ensureExtras(st.length - 1);
  for (let i = st.length - 1; i < extras.length; i++) if (i >= 0) extras[i].visible = false;
}

// THE STANCE (the Weapon panel's, GU's): the class's own clips, enabled while drawn; drawing with none picked takes the
// first, as GU's does. The select's values are the clips' indices (the shared Animation panel's chain picks by index); the
// hunter keeps the clip's name. The game names none of its clips: they are set:slot, as it stores them.
function stanceClips(){
  const c = wClass(state.weapon.cls), P = poseSet();
  const l = c && P && P.lists.find(x => x.id === c.key);
  return (l && l.clips) || [];
}
function buildStanceList(){
  const w = state.weapon, clips = stanceClips();
  if (w.stance && !clips.some(x => x.clip === w.stance)) w.stance = '';
  if (w.drawn && !w.stance && clips.length) w.stance = clips[0].clip;
  weaponPoseSel.innerHTML = clips.map((x, i) => '<option value="' + i + '" title="' + esc(x.clip + ', ' + x.dur.toFixed(2) + ' s') + '">' +
                                                esc('Motion ' + x.clip) + '</option>').join('');
  const i = clips.findIndex(x => x.clip === w.stance);
  weaponPoseSel.value = i >= 0 ? String(i) : (clips.length ? '0' : '');
  weaponPoseSel.disabled = !w.drawn || !clips.length;
  fieldOf(weaponPoseSel).hidden = !wClass(w.cls);
}
weaponClassSel.onchange = async () => {
  if (!animPanel.chainDriving) animPanel.chainStop();
  state.weapon.cls = weaponClassSel.value; state.weapon.stance = '';      // a new class starts on its first stance
  const opts = weaponOptions(state.weapon.cls);
  state.weapon.model = opts.length ? opts[0].model : '';
  buildWeaponLists(); await refreshWeapon(); await playPose(); saveState();
  animPanel.paintChain();                                // another class's stances go muted, this one's play
};
weaponModelSel.onchange = () => {
  state.weapon.model = weaponModelSel.value;
  buildWeaponLists(); refreshWeapon().then(saveState);
};
weaponDrawnSel.onchange = async () => { animPanel.chainStop(); await applyWeaponState(); saveState(); };
weaponPoseSel.onchange = async () => { animPanel.chainStop(); await applyWeaponState(); saveState(); };
// what the Weapon panel's Carry and Stance and the Pose select say, on screen: the Animation panel's chain and previews
// set those controls and call this (base/ui/animation-panel.js applyWeaponState)
async function applyWeaponState(){
  state.weapon.drawn = weaponDrawnSel.value === '1' && !!wClass(state.weapon.cls);
  const clips = stanceClips();
  if (weaponPoseSel.value !== '' && clips[+weaponPoseSel.value]) state.weapon.stance = clips[+weaponPoseSel.value].clip;
  poseFromSelect();
  buildStanceList();
  await playPose();
}

// ---- the Animation panel (base/ui/animation-panel.js) ----------------------------------------------------------------------
// A stance is named to the panel by its clip (a class has one pack, wNN, so a clip names it).
const stancesOfClass = () => stanceClips().map(x => ({ clip: x.clip, label: 'Motion ' + x.clip }));
const dummySel = () => ({});
const animPanel = createAnimationPanel(GAME, {
  pose,
  weapon: {
    poses: stancesOfClass,
    classJson: () => { const c = wClass(state.weapon.cls); return c ? { name: c.name } : null; },
    // GU's weapon gimmicks: MHFU has none read (no Arrow or Kinsect)
    // the panel's Attachment / Form select is MHFU's bowgun Attachment (above): its change lands here
    setForm: v => setAttachment(v), step(){}, setArrow(){}, setKinsect: async () => {}, setKinsectElement(){},
    setKinsectMotion: async () => {},
  },
  weaponClassSel, weaponPoseSel, weaponDrawnSel,
  weaponFormSel,
  arrowSel: dummySel(), kinsectSel: dummySel(), kinsectElSel: dummySel(), kinsectMotSel: dummySel(),
  applyWeaponState,
  buildPoseList: () => rebuildPoseList(),
  get saveState(){ return saveState; },
  get SAVED(){ return savedChain; },
});
// the game's loop flag per clip (above, THE LOOP), the base's hook (base/render/pose.js clipLoop): a Common clip repeats
// (the base's rule for a hunter pose, null); a stance takes its clip's flag
pose.clipLoop = entry => (entry && entry.stance === true ? !!entry.loop : null);

// ---- Guild Info (base/ui/guild-panel.js): MHFU's Guild Card is not read (game.js guildInfo), so no plate and no titles --
const HUNTERS = [];
let hunterIndex = 0, hunterBusy = false, hunterRenaming = false, hunterBoot = true;
const guildPanel = createGuildPanel(GAME, {
  get HUNTERS(){ return HUNTERS; },
  get activeMounts(){ return activeMounts; },
  get figure(){ return 'hunter'; },
  get figureCenter(){ return figureCenter; },
  get hunterIndex(){ return hunterIndex; },
  get playerBone(){ return playerBone; },
  get renderer(){ return renderer; },
  get saveState(){ return saveState; },
  get scene(){ return scene; },
  get weaponClassSel(){ return weaponClassSel; },
});
const { applyPlateFile, paintPlate, plateFileState, plateUpdate, restorePlate } = guildPanel;

// ---- Capture (base/ui/capture.js) ------------------------------------------------------------------------------------------
const capturePanel = createCapture(GAME, {
  get camPanel(){ return camPanel; },
  get camera(){ return camera; },
  get captureName(){ return captureName; },
  get fx(){ return fx; },
  get head(){ return head; },
  get lightPanel(){ return lightPanel; },
  get renderFrame(){ return renderFrame; },
  get renderer(){ return renderer; },
  get setIcon(){ return setIcon; },
  get setLabel(){ return setLabel; },
});
const { recFrame } = capturePanel;
function captureName(ext){
  const who = (HUNTERS[hunterIndex] && HUNTERS[hunterIndex].name) || 'Hunter';
  return 'MHFU ' + who + ' ' + new Date().toISOString().slice(0, 10) + '.' + ext;
}

// ---- the session, the look and the set file -------------------------------------------------------------------------------
// The look (lighting, effects, the Camera panel and the camera bar's settings) rides beside the hunter as `look`; the
// hunter slots as `hunters` / `hunter`; the chain as its own fields.
function lookState(){
  return Object.assign(lightPanel.save(), {
    postfx: fxPanel.save(),
    camera: { fov: +camera.fov.toFixed(2), lens: lensFileState(), orbitLocked: camPanel.orbitLocked,
              spinStep: camBar.spinStep, spinRev: camBar.spinRev, damp: controls.enableDamping,
              zoomCursor: !!controls.zoomToCursor, face: camPanel.faceLock, flySpeed: +fly.speed.toFixed(3),
              wire: camBar.wireOn, cursor: camBar.hideCursor, grid: camBar.floorGridOn } });
}
// every field type-guarded: a save is whatever the last version of the app wrote
function restoreLook(o){
  if (!o || typeof o !== 'object'){ lightPanel.apply('studio'); return; }
  if ((o.lightRig && typeof o.lightRig === 'object') || typeof o.lighting === 'string') lightPanel.restore(o);
  else lightPanel.apply('studio');
  if (o.postfx && typeof o.postfx === 'object') fxPanel.restore(o.postfx);
  const c = o.camera;
  if (!c || typeof c !== 'object') return;
  if (Number.isFinite(c.fov)) setFov(c.fov);
  if (c.lens && typeof c.lens === 'object') applyLens(c.lens);
  if (typeof c.orbitLocked === 'boolean') camPanel.orbitLocked = c.orbitLocked;
  if (typeof c.spinStep === 'number') camBar.spinStep = Math.max(0, c.spinStep | 0) % camBar.SPIN_STEPS.length;
  if (typeof c.spinRev === 'boolean') camBar.spinRev = c.spinRev;
  if (typeof c.damp === 'boolean') controls.enableDamping = c.damp;
  if (typeof c.zoomCursor === 'boolean') controls.zoomToCursor = c.zoomCursor;
  document.getElementById('camDamp').checked = controls.enableDamping;
  document.getElementById('camZoomCursor').checked = !!controls.zoomToCursor;
  if (typeof c.face === 'boolean') setFaceLock(c.face);
  if (Number.isFinite(c.flySpeed)) setFlySpeed(c.flySpeed);
  if (typeof c.wire === 'boolean') camBar.wireOn = c.wire;
  if (typeof c.cursor === 'boolean') camBar.hideCursor = c.cursor;
  if (typeof c.grid === 'boolean') camBar.floorGridOn = c.grid;
  paintOrbitLock(); camBar.paintSpin(); camBar.paintWire(); camBar.paintCursor(); camBar.paintFloorGrid();
}
// the hunter on screen as a set and a slot keep it: its state, with the pigment rows read off the panel
function hunterNow(){ state.pig = pigStateOfRows(); state.pigDev = pigPanel.slotDevState(); return hunterOf(state); }
function saveState(){
  if (restoring) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Object.assign({ v: 2 }, hunterNow(), { look: lookState(), plate: plateFileState() },
      hunterSaveState(), animPanel.chainSaveState())));
  } catch (_) {}
}
function currentSet(){
  return { app: 'MHFU Armor Viewer', version: 1, hunter: hunterNow(), lighting: lightPanel.fileState(),
           effects: fxPanel.save(), view: cameraState(), plate: plateFileState() };
}
const isSet = d => !!d && typeof d === 'object' && (d.app === 'MHFU Armor Viewer' || (d.hunter && typeof d.hunter === 'object'));
// A set onto the page: the hunter, then its lighting and effects where it has them, then its view -- or, with none or
// { view: false }, a fresh framing of the hunter
async function applySet(d, opt){
  opt = opt || {};
  if (!d || typeof d !== 'object') d = {};
  Object.assign(state, hunterOf(d.hunter));
  paintArmorSelects(); paintHunterRows(); buildWeaponLists();
  applyPigRows(state.pig, state.pigDev);
  await refresh();
  applyPigRows(state.pig, state.pigDev);   // the Default rows again, now the pieces are worn
  await playPose();
  if (d.lighting && typeof d.lighting === 'object') lightPanel.applyFile(d.lighting);
  else if ((d.lightRig && typeof d.lightRig === 'object') || typeof d.lighting === 'string') lightPanel.restore(d);
  if (d.effects && typeof d.effects === 'object') fxPanel.restore(d.effects);
  if ('plate' in d || opt.plate) applyPlateFile(d.plate);
  if (!(opt.view !== false && applyCameraState(d.view))) frameAll();
}
const saveOpen = createSaveOpen(GAME, { currentSet, isSet, applySet: d => applyLoadedSet(d) });
async function applyLoadedSet(d){
  if (hunterBusy) return;
  hunterBusy = true; setLoading(true);
  try { await applySet(d, { plate: true }); } finally { hunterBusy = false; setLoading(false); }
  saveState();
}

// ---- hunter slots ---------------------------------------------------------------------------------------------------------------
// The MHGU Armor Viewer's hunter slots (the shared base's Hunter Slots panel). A slot is a named hunter, { name, set }.
// The set is what the page shows of that hunter: what it wears, its face, hair, pigment, motion and weapon (`hunter`,
// the shape of `state`), its lighting and effects, and its view. Switching banks the hunter on screen into its slot and
// applies the other; a slot without lighting, effects or a view keeps what is on screen and frames the hunter. A first
// visit starts with two slots: the default female hunter and the default male.
const hunterList = document.getElementById('hunterList');
const escHtml = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function freeHunterName(){
  for (let n = 1; ; n++){ const nm = 'Hunter ' + n; if (!HUNTERS.some(h => h.name === nm)) return nm; }
}
{
  const savedHunters = SAVED && SAVED.hunters, savedHunter = SAVED && SAVED.hunter;
  const valid = h => h && typeof h === 'object' && typeof h.name === 'string' && h.name.trim() &&
                     (h.set === null || (h.set && typeof h.set === 'object'));
  if (Array.isArray(savedHunters) && savedHunters.some(h => valid(h) && h.set)){
    for (const h of savedHunters) if (valid(h)) HUNTERS.push({ name: h.name.trim().slice(0, 40), set: h.set, fresh: !!h.fresh });
    hunterIndex = Number.isInteger(savedHunter) && HUNTERS[savedHunter] ? savedHunter : 0;
  } else {
    HUNTERS.push({ name: 'Hunter 1', set: null });          // banked from the page once it is dressed
    if (!savedAny)                                          // a first visit: the other body, untouched
      HUNTERS.push({ name: 'Hunter 2', set: { hunter: Object.assign(clone(DEFAULTS), { g: state.g === 'f' ? 'm' : 'f' }) }, fresh: true });
  }
}
// the view the slot on screen was left with, taken before anything banks over it; the boot puts it back
const bootView = HUNTERS[hunterIndex] && HUNTERS[hunterIndex].set ? HUNTERS[hunterIndex].set.view : null;
function bankHunter(){ if (!hunterBusy && !hunterBoot && HUNTERS[hunterIndex]) HUNTERS[hunterIndex].set = currentSet(); }
// what saveState writes: the slots with the one on screen freshly banked. A hoisted function, so saveState can name it
function hunterSaveState(){
  try {
    bankHunter();
    if (!hunterRenaming) paintHunters();
    return { hunters: HUNTERS.map(h => ({ name: h.name, set: h.set, fresh: h.fresh || undefined })), hunter: hunterIndex };
  } catch (_) { return {}; }
}
function paintHunters(){
  hunterList.innerHTML = HUNTERS.map((h, i) => {
    const g = i === hunterIndex ? state.g : (h.set && h.set.hunter && h.set.hunter.g) || 'f';
    return '<li class="' + (i === hunterIndex ? 'on' : '') + '" data-k="' + i + '" title="' + (i === hunterIndex ? 'The hunter on screen' : 'Switch to this hunter') + '">' +
           '<span class="n">' + (i + 1) + '.</span><span class="lab">' + escHtml(h.name) + '</span>' +
           '<span class="tag">' + (g === 'm' ? 'Male' : 'Female') + '</span></li>';
  }).join('');
  document.getElementById('hunterDelete').disabled = HUNTERS.length < 2;
}
async function switchHunter(k, opt){
  opt = opt || {};
  if (!HUNTERS[k] || (k === hunterIndex && !opt.force) || hunterBusy) return;
  if (!opt.noBank) bankHunter();     // before the busy flag goes up: the bank skips while busy
  hunterBusy = true;
  setLoading(true);
  try {
    const to = HUNTERS[k];
    hunterIndex = k; paintHunters();
    await applySet(to.set, { plate: true });
    delete to.fresh;
  } finally { hunterBusy = false; setLoading(false); }
  paintPlate();
  saveState();
}
hunterList.onclick = e => {
  const li = e.target && e.target.closest ? e.target.closest('li') : null;
  if (!li || hunterRenaming) return;
  switchHunter(+li.dataset.k);
};
// Copy: a new hunter, a copy of the one on screen
document.getElementById('hunterCopy').onclick = () => {
  if (hunterBusy) return;
  bankHunter();
  HUNTERS.push({ name: freeHunterName(), set: currentSet() });
  hunterIndex = HUNTERS.length - 1;
  paintHunters(); saveState();
};
// New: a hunter of this gender with every Hunter option on its default (GU's): the view's own settings -- the weapon in
// hand, the lighting, the effects and the camera -- stay as they are
document.getElementById('hunterNew').onclick = async () => {
  if (hunterBusy) return;
  bankHunter();
  const hunter = Object.assign(clone(DEFAULTS), { g: state.g, weapon: clone(state.weapon) });
  HUNTERS.push({ name: freeHunterName(), set: { hunter, view: cameraState() } });
  await switchHunter(HUNTERS.length - 1, { noBank: true });
};
document.getElementById('hunterRename').onclick = () => {
  const li = hunterList.querySelector('li.on'); if (!li || hunterRenaming) return;
  const lab = li.querySelector('.lab'), h = HUNTERS[hunterIndex];
  const inp = document.createElement('input'); inp.type = 'text'; inp.maxLength = 40; inp.value = h.name;
  hunterRenaming = true;
  lab.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = keep => {
    if (done) return; done = true; hunterRenaming = false;
    const v = inp.value.trim();
    if (keep && v) h.name = v.slice(0, 40);
    paintHunters(); saveState();
  };
  inp.onkeydown = ev => { if (ev.key === 'Enter') finish(true); else if (ev.key === 'Escape') finish(false); };
  inp.onblur = () => finish(true);
};
document.getElementById('hunterDelete').onclick = async () => {
  if (HUNTERS.length < 2 || hunterBusy) return;
  const h = HUNTERS[hunterIndex];
  if (!confirm('Delete ' + h.name + '? Its look is lost.')) return;
  HUNTERS.splice(hunterIndex, 1);
  const next = Math.min(hunterIndex, HUNTERS.length - 1);
  hunterIndex = -1;
  await switchHunter(next, { noBank: true, force: true });
};
// Reset: the defaults for the hunter on screen -- its gender kept, no armour, the first face and hairstyle, the starting
// motion, the Studio lighting, no effects and a fresh framing. It replaces a slot's look, so it asks first.
document.getElementById('resetBtn').onclick = async () => {
  if (hunterBusy) return;
  const h = HUNTERS[hunterIndex];
  if (!confirm('Reset ' + (h ? h.name : 'the hunter') + ' (' + (state.g === 'm' ? 'male' : 'female') + ') to the defaults? The current look is replaced.')) return;
  filterEl.value = '';
  hunterBusy = true; setLoading(true);
  try {
    await applySet({ hunter: Object.assign(clone(DEFAULTS), { g: state.g }), lighting: { preset: 'studio' }, effects: { preset: 'off' } },
                   { view: false });
  } finally { hunterBusy = false; setLoading(false); }
  saveState();
};

// ---- the loop ---------------------------------------------------------------------------------------------------------------
// one frame's pose and weapon (the loop's, and __view.tick's: checks run with the page hidden, where the loop stops)
function stepFigure(){
  if (pose.mixer) pose.step(Object.values(mounted));
  updateWeapon();                          // the weapon follows the bones the pose just set
}
addEventListener('resize', fitRenderer);
new ResizeObserver(fitRenderer).observe(viewport);
fitRenderer();
renderer.setAnimationLoop(() => {
  stepFigure();
  pigPanel.stepDeviant(performance.now() / 1000);   // a Rainbow pigment row steps (the game's own table and blend)
  fitPlanes(); updateDepthBias();
  animPanel.paintAnim(); animPanel.stepChainHold();
  lightPanel.step();                       // the key light's orbit
  if (camPanel.camMode === 'fly') stepFly(); else controls.update();   // update() would look at the target
  lightPanel.track(); head.position.copy(camera.position);
  renderFrame();
  recFrame();
});

// ---- the boot ---------------------------------------------------------------------------------------------------------------
restoreLook(SAVED && SAVED.look);
paintCamMode(); paintFlySpeed();
paintArmorSelects(); paintHunterRows(); buildWeaponLists();
applyPigRows(state.pig, state.pigDev);
await refresh();
applyPigRows(state.pig, state.pigDev);     // the Default rows take the worn pieces' own colours
await playPose();
animPanel.paintChain();
if (SAVED && SAVED.plate) restorePlate(SAVED.plate); else paintPlate();
frameAll();
// the slot on screen comes back with the view it was left with, as the MHGU Armor Viewer's does
if (bootView) applyCameraState(bootView);
restoring = false;
hunterBoot = false;
bankHunter(); paintHunters(); saveState();   // the hunter on screen into its slot, now that it is dressed
document.dispatchEvent(new Event('viewer-ready'));   // the side panels unlock (base/ui/shell.js)

Object.assign(window.__view, { DATA, WEAPONS, state, mounted, scene, camera, controls, world, pose, refresh, frameAll,
                  playPose, applyAllColours, renderer, setFocal, setFov, lookState, restoreLook, currentSet, applySet,
                  pigPanel, armorPanel, hunterPanel, animPanel, camPanel, camBar, lightPanel, fxPanel, guildPanel, saveOpen,
                  weaponPanel, slotPigment, pigmentOf, tick: stepFigure,
  weapon: { obj: () => weapon.obj, key: () => weapon.key, extras, place: updateWeapon, refresh: refreshWeapon,
            stance: stanceState, stanceNow, playing: nowPlaying, stances: stancesOfClass },
  hunters: { list: () => HUNTERS.map((h, i) => ({ name: h.name, g: i === hunterIndex ? state.g : (h.set && h.set.hunter && h.set.hunter.g) || null,
                                                   banked: !!h.set, fresh: !!h.fresh })),
             index: () => hunterIndex, switchTo: k => switchHunter(k) },
  aimPoint: () => camPanel.aimPoint(new THREE.Vector3()).toArray(),
});
