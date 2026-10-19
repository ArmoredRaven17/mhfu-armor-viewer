// One player model -- an armour piece, a face, a hairstyle -- or a weapon model, built on the shared base's render modules
// (docs/base/render) the way the MHFU Monster Viewer's loadMonster builds a monster (this module carries its MHFU parts
// over): the glb, its materials from materials.json, a skeleton clone.
//   * the material is the base's createMaterial() handed the materials.json record: its blend state (the PSP's per-mesh
//     blending, from the PMO) picks the lit, alpha-blended or additive path, and the albedo is all that is bound (MHFU's
//     shading is not decoded: no sphere, specular or extend map)
//   * every mesh keeps the (PMO mesh, PMO material) pair it draws, "<mesh>/<material>" (`fuKey`): the stances' material
//     pass shows and hides by it (app.js applyPass). The glb names each mesh node "mesh<N>" and each material "m<KK>"
//   * THE ARMOUR COLOUR and THE HAIR COLOUR (paintPiece): the game writes each into ONE material's colour bytes -- the
//     armour colour into entry 1 of mesh 0's material list (0x088CEFEC; armor.json pieces[].dyeMat, its PMO material
//     number), the hair colour into entry 0 of the head slot's model (0x088CEAB8; pieces[].hairMat) -- so every primitive
//     drawing that material takes it, whatever mesh it is in
import { loadGlb, getTexture } from '../base/render/assets.js';
import { skeletonClone, meshGroupId } from '../base/render/skeleton.js';
import { createMaterial, allMats, setChannelColor, setAmbientColor } from '../base/render/material.js';
import { specFor, refForGlb } from '../base/render/materials-db.js';

export const pieceMats = [];

// rec: { glb, joints?, dyeMat? } (armor.json pieces / weapons.json models)
export async function loadPiece(rec, ctx){
  const gltf = await loadGlb(rec.glb, rec.glb);
  const root = skeletonClone(gltf.scene);
  const ref = refForGlb(rec.glb);
  const jobs = [], mats = [];
  root.traverse(o => {
    if (!(o.isMesh || o.isSkinnedMesh)) return;
    const srcName = (o.material && o.material.name) || '';
    o.userData.part = meshGroupId(o);
    o.frustumCulled = false;              // skinned: the bind-pose bounds say nothing once posed
    let mi = null;
    for (let p = o; p && mi === null; p = p.parent){ const r = /^mesh(\d+)$/.exec(p.name || ''); if (r) mi = +r[1]; }
    const r = /^m(\d+)/.exec(srcName);
    if (r) o.userData.fuMat = +r[1];
    if (mi !== null && r) o.userData.fuKey = mi + '/' + (+r[1]);
    const rom = specFor(ref, srcName);
    const mat = createMaterial({ srcName, rom, alphaCut: 0, noTint: true,
                                 unlit: !!(rom && rom.cls && rom.cls !== 'Std'),
                                 wire: !!(ctx && ctx.wire) });
    // the materials the game colours (armor.json pieces[].dyeMat, .hairMat)
    mat.userData.dyed = rec.dyeMat !== undefined && rec.dyeMat !== null && o.userData.fuMat === rec.dyeMat;
    mat.userData.hairCol = rec.hairMat !== undefined && rec.hairMat !== null && o.userData.fuMat === rec.hairMat;
    o.material = mat; allMats.push(mat); pieceMats.push(mat); mats.push(mat);
    if (mat.userData.renderOrder) o.renderOrder = mat.userData.renderOrder;
    if (rom && rom.albedo) jobs.push(getTexture(rom.albedo).then(t => {
      mat.map = t; if (mat.userData.emissiveFromMap) mat.emissiveMap = t;
      mat.needsUpdate = true; }));
  });
  await Promise.all(jobs);
  root.userData.joints = rec.joints || [];
  root.userData.mats = mats;
  // the rest pose, so "Bind Pose" can put a posed piece back (the pose driver writes the bones directly)
  root.userData.bind = [];
  root.traverse(o => root.userData.bind.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  return root;
}

// HOW THE GAME COMBINES A COLOUR WITH THE TEXTURE (READ 2026-10-19, from the code, the GE lists in five PPSSPP save states
// and PPSSPP's GE lighting, GPU/Common/TransformCommon.cpp): the per-mesh draw 0x0886477C sends each material as
// 0x53000003 (material update: ambient and diffuse from the vertex colour -- which no player mesh has, so both come from
// the material registers), DIFFUSE 0x56 = bytes +0..+2, AMBIENT 0x55 = bytes +4..+6; lighting on, texture function
// modulate with no colour doubling (0xC7000000), global ambient and emissive black, the lights diffuse-only. So a texel is
// drawn as   texel x clamp( sum over lights of (light ambient x A + light diffuse x D x N.L) )   with A, D the material's
// ambient and diffuse. An undyed material's file colours are D = FFFFFF, A = 7F7F7F (94% of player materials).
//   * the ARMOUR colour C (0x088CF094 -> 0x088CEFEC): D = A = C. Against an undyed material the diffuse term is C / 255
//     and the ambient term C / 127 (twice as strong at the default white)
//   * the HAIR colour H (0x088CEAB8): D = trunc(0.65 x H), A = H >> 1: the diffuse term trunc(0.65 H) / 255, the ambient
//     term H / 254
// THE TWO TERMS IN THE VIEWER: D goes into the base's channel colour (it multiplies the map under the direct lights), A
// into the base's separate ambient colour (base/render/material.js setAmbientColor: the ambient / hemisphere term, added
// 2026-10-19 for MHFU). The viewer's lights are generic and tuned on the undyed materials, so both are taken RELATIVE to
// an undyed material (D FFFFFF, A 7F7F7F): D as it is (/ 255), A x 255 / 127. Undyed materials are left as they draw.
//   paintPiece(root, { dye, hair, rest }): each { d, a } -- [R, G, B] game bytes (0-255) for the diffuse and ambient
// registers -- or null (as the file draws it). An unlit (additive) material takes neither.
const ambRel = a => a.map(v => v * 255 / 127);
export function paintPiece(root, cols){
  root.traverse(o => {
    const m = (o.isMesh || o.isSkinnedMesh) && o.material;
    if (!m || !m.userData || !m.userData.u || !m.userData.u.uChan) return;
    const c = m.userData.dyed ? cols.dye : m.userData.hairCol ? cols.hair : cols.rest;
    setChannelColor(m, c ? c.d : null);
    setAmbientColor(m, c && c.a ? ambRel(c.a) : null);
  });
}
// the registers the game writes: ARMOUR colour C -> D = A = C; HAIR colour H -> D = trunc(0.65 x H), A = H >> 1
export const dyeRegs = c => (c ? { d: c, a: c } : null);
export const hairRegs = h => ({ d: h.map(v => Math.trunc(0.65 * v)), a: h.map(v => v >> 1) });
// a flat colour on both terms (the dye mask)
export const flatRegs = c => ({ d: c, a: null });

// Give a model's materials back when it leaves the scene (textures stay in the asset cache, shared between models)
export function releasePiece(root){
  if (!root) return;
  root.traverse(o => {
    if (!(o.isMesh || o.isSkinnedMesh)) return;
    const m = o.material;
    if (m){
      for (const list of [allMats, pieceMats]){ const i = list.indexOf(m); if (i >= 0) list.splice(i, 1); }
      m.dispose();
    }
  });
}

// put a model back exactly as it loaded
export function restoreBind(root){
  for (const [node, p, q, sc] of (root && root.userData.bind) || []){
    node.position.copy(p); node.quaternion.copy(q); node.scale.copy(sc);
  }
}
