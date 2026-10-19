// THIS VIEWER'S DATA, MAPPED FOR THE SHARED BASE (docs/base; the plan: C:\\Coding Repos\\VIEWER-BASE-PLAN.md). The base's
// modules never read armor.json or weapons.json themselves: what they need comes through here. Each function reads the
// app's live objects through `app`, set once at the top of the page (setApp): DATA (armor.json), WEAP (weapons.json),
// state (the hunter on screen), worn(slot) (the armour record worn there, or null). The MH4U Armor Viewer's adapter, on
// MHFU's rules and data.
// (Phase 1.6, 2026-10-19.)
let app = null;
export function setApp(a){ app = a; }

const hex2 = v => Math.round(v).toString(16).padStart(2, '0');
const rgbHex = c => '#' + c.map(hex2).join('');

// THE GAME'S ARMOUR COLOURS, READ 2026-10-19: the draw's per-slot colour (0x088CF094) takes, for an S-Series piece
// (colour mode 2), the low nibble of the slot's colour record into the u32 RGBA table at 0x089B7F74 -- these eleven,
// in the game's order -- or, for index 11, the Rainbow (game.js pigmentRainbow). An X/Z-Series piece (mode 3) takes
// the record's own RGB, or the Rainbow when its high nibble is 1; the same eleven are not its list in the game's code,
// they are offered to it here as the pigment selector offers every in-game colour. The game names none of them (no
// colour words in f0019).
export const ARMOR_COLOURS = [[255, 255, 255], [39, 40, 38], [141, 20, 21], [250, 89, 116], [255, 87, 31], [230, 147, 16],
  [41, 79, 42], [56, 175, 150], [37, 37, 53], [42, 89, 116], [83, 38, 79]];
// THE GAME'S HAIR COLOURS, READ 2026-10-19: character creation's HAIR COLOR page (overlay 2, f0064, 0x09A655F8) sets
// the player's hair colour (player data +0x4BC) to entry n of the u32 RGBA table at 0x09A66E80 -- these sixteen, in the
// game's order (alpha FF; the 17th word is not a colour); a new save starts on entry 0 (0x09A62EF0). The game names none.
export const HAIR_COLOURS = [[228, 154, 103], [191, 122, 89], [124, 92, 72], [110, 84, 70], [101, 93, 89], [114, 111, 114],
  [228, 181, 112], [255, 193, 142], [255, 223, 191], [187, 98, 97], [255, 98, 97], [103, 134, 146], [255, 159, 148],
  [114, 110, 79], [149, 140, 62], [254, 150, 0]];
// mode 1: the colour the draw writes for a piece whose colour is fixed (0x088CF114: 0x80 in R, G and B)
export const FIXED_GREY = [128, 128, 128];

// THE PIECE'S OWN COLOUR (Default, base/ui/pigment.js): what the draw gives the piece with the slot's colour record at
// 00 FF FF FF, the value every save state on this machine holds for an uncoloured slot (where a new save writes it is
// NOT read): preset 0, white, for S-Series; RGB FFFFFF, white, for X/Z-Series; the fixed grey for mode 1. Null for a
// piece that takes no colour, or an empty slot.
export function defaultPigHex(slot){
  const r = app.worn(slot);
  if (!r) return null;
  if (r.col === 1) return rgbHex(FIXED_GREY);
  if (r.col === 2 || r.col === 3) return rgbHex(ARMOR_COLOURS[0]);
  return null;
}

// WHETHER THE PIECE WORN IN A SLOT TAKES A COLOUR (the rows' disabled state, with the reason): its armour record's
// colour mode (+0x13, armor.json `col`). Modes 2 (S-Series) and 3 (X/Z-Series) take one; 0 takes none (the draw writes
// no colour); 1 is drawn in a fixed grey the player cannot change (8 pieces a slot: Kushala, Mizuha, Extravagant ...).
export function dyeable(slot){
  const r = app.worn(slot);
  if (!r) return { can: false, reason: 'Nothing is worn in this slot' };
  if (r.col === 2) return { can: true };
  if (r.col === 3) return { can: true };
  if (r.col === 1) return { can: false, reason: 'Its color is fixed in the game (a grey the player cannot change)' };
  return { can: false, reason: 'This piece takes no color in the game (only S-Series and X/Z-Series pieces do)' };
}
// the piece's colour rule as the game words it (f0019 section 1 414-416, "Color:" + "S-Series" / "X/Z-Series"), for a
// row's tooltip
export function colourSeries(slot){
  const r = app.worn(slot);
  return r && r.col === 2 ? 'S-Series' : r && r.col === 3 ? 'X/Z-Series' : null;
}

// ---- THE ARMOR LISTS (base/ui/armor-panel.js): the game's own table order, grouped by rarity ----
// One item per model this gender draws, named by every piece that draws it (a Blademaster and a Gunner piece usually
// share one), valued by the first record's id (a record id is what a slot holds; its colour mode is the record's own).
// Grouped by the rarity of the item's first record (armor.json `rar`, record +5 + 1). `type` is the Type filter: 'all',
// 'b' (Blademaster) or 'g' (Gunner), armor.json `wear` (record +4 bits 4 / 8).
// AN ITEM'S LABEL: every name that draws the model, joined -- up to four (a piece's base / S / U / X names and its
// Blademaster / Gunner pair). More would make the list as wide as all of them (the 22 Piercings did, before they were
// hidden): the first name and how many more share it.
const LABEL_NAMES = 4;
const itemLabel = names => (names.length <= LABEL_NAMES ? names.join(' / ')
  : names[0] + ' (+' + (names.length - 1) + ' more)');
export function armorOptions(slot, type){
  const g = app.state.g;
  const groups = new Map();
  // HIDDEN FOR NOW (Raven, 2026-10-19: "we can hide Piercings since they all use the same model and I don't see
  // anything"): a head piece that draws head model 0 -- the "Nothing equipped." model, the bare head -- has nothing of its
  // own to show (all 22 Piercings)
  const bare = slot === 'helm' ? (app.DATA.armor.helm.find(x => x.id === 0) || {})[g] : null;
  for (const r of app.DATA.armor[slot]){
    if (r.id === 0 || !r[g] || r.wear.indexOf(g) < 0) continue;
    if (bare && r[g] === bare) continue;
    if (!groups.has(r[g])) groups.set(r[g], { id: r.id, model: r[g], rare: r.rar, ids: [], names: [] });
    const e = groups.get(r[g]);
    e.ids.push(r.id);
    // the Type filter: the game's flags (record +4); on the Head, the viewer's split (armor.json `ftype`, build_viewer.py
    // head_filter_types -- every MHFU head is both in game; Settings -> "Treat Head Armors as Blademaster/Gunner" asks
    // armor-panel.js for 'all' here, the game's own both)
    const fits = slot === 'helm' && r.ftype ? r.ftype : r.wear;
    if (type !== 'all' && fits.indexOf(type) < 0) continue;
    if (e.names.indexOf(r.name) < 0) e.names.push(r.name);
  }
  const out = [];
  for (const e of groups.values()){
    if (!e.names.length) continue;
    out.push({ value: String(e.id), label: itemLabel(e.names), model: e.model, ids: e.ids, rare: e.rare,
               group: 'Rarity ' + e.rare });
  }
  return out.sort((a, b) => a.rare - b.rare);
}
export function armorSpecials(){ return []; }
// the item a record id belongs to, for a slot holding a record that is not an item's first
export function legacyModel(slot, v){
  const id = +v;
  if (!Number.isInteger(id) || id <= 0) return null;
  const r = app.DATA.armor[slot].find(x => x.id === id);
  return r ? r[app.state.g] : null;
}
// the token the select holds for a record id: the value of the item that lists it ('none' for nothing)
export function tokenOfRecord(slot, id, type){
  if (!id) return 'none';
  const o = armorOptions(slot, type || 'all').find(x => x.ids.indexOf(id) >= 0);
  return o ? o.value : 'none';
}

// ---- THE HUNTER PANEL'S LISTS (base/ui/hunter-panel.js) ----
// the faces and hairstyles of the gender shown, in the game's order, labelled as the game labels them: TYPE%02d (f0019
// section 1, 603), in the panel's case
const pad2 = n => String(n).padStart(2, '0');
export function charStyles(part){
  return (app.DATA.chars[app.state.g][part] || []).map((e, i) => ({ label: 'Type ' + pad2(i + 1), rec: e }));
}
// MHFU has no face paint
export function paintCount(){ return 0; }
// THE CLOTHING PAGE (READ 2026-10-19): character creation's page 2 steps the player's clothing (+0x4B5) through 0-7
// (overlay 2, 0x09A615CC), labelled as the game labels its options, TYPE%02d (f0019 section 1, 603), in the panel's case
export function clothingOptions(){
  return Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: 'Type ' + pad2(i + 1) }));
}
// the hunter's own motions: the Common pack (f0081), its clips the entries (the game names none; set:slot); the class
// packs are the Weapon panel's Stance. The option value is the flat index.
export function poseOptions(){
  const P = app.DATA.poses && app.DATA.poses[app.state.g];
  const out = [];
  for (const p of P || []){
    if (p.id !== 'co') continue;
    for (const c of p.clips)
      out.push({ label: 'Motion ' + c.clip, group: p.label, src: p.label, clip: c.clip, dur: c.dur, list: p.id });
  }
  return out;
}

// EVERY COLOUR LIST THE GAME HAS (base/ui/pigment.js pigmentSections): the eleven armour colours, then the sixteen hair
// colours (both above, in the game's order). The weapons take no colour in this viewer's read.
export function pigmentSections(){
  return [{ label: 'Armor colors', colours: ARMOR_COLOURS.map(c => ({ hex: rgbHex(c), name: null })) },
          { label: 'Hair colors', colours: HAIR_COLOURS.map(c => ({ hex: rgbHex(c), name: null })) }];
}
export function pigmentColours(){ return pigmentSections().flatMap(x => x.colours); }

// THE WEAPON CLASSES BY IDENTITY (base/ui/weapon-panel.js orderClasses: GU's Guild Card order): weapons.json already
// names MHFU's classes by the family's canonical names (each model's class is the game's, BOOT 0x089785A8)
export const classNameOf = c => (typeof c === 'string' ? c : c.name);
