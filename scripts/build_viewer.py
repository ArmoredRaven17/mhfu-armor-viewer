r"""Build the MHFU Armor Viewer's data from the converted game files.

    python C:\MHFU-Extract\tools\convert_player.py   # player pieces + weapons -> C:\MHFU-Extract\conv
    python scripts/build_viewer.py                   # conv -> docs/

Reads  C:\MHFU-Extract\conv\player.json        the armour tables, every piece and weapon (convert_player.py)
       C:\MHFU-Extract\conv\player\{m,f}\*.glb  pieces on the gender's 21-bone rig, textures embedded
       C:\MHFU-Extract\conv\weapon\*.glb        weapon models on their own skeletons
       C:\MHFU-Extract\boot\BOOT.BIN            the weapon tables and the class of each weapon model (below)
       C:\MHFU-Extract\data\f0019.bin           the English text: armour names (sections 8-16), weapon names
                                                 (4 melee, 6 bows and bowguns)
Writes docs/: models/{m,f}/*.glb, models/weapons/*.glb (textures out), tex/<md5[:16]>.webp, armor.json,
weapons.json, materials.json.

What is ROM-sourced and what is not is written into each json's `_about`.

WEAPONS (all BOOT.BIN). A weapon is (table, id); the game's item -> model function 0x08851F20 reads the model
u16 at 0x0895A0EC + 24 * id for melee (item kind 5) and at 0x08960CBC + 28 * id for bows and bowguns, so the
records start 16 bytes before (0x0895A0DC, 0x08960CAC). The CLASS is the model's: 0x0885CCD0 returns the byte at
0x089785A8 + model, in the game's class order (CLASS_ORDER, the order of the motion packs). Names are f0019
section 4 (melee) / 6 (bows and bowguns) by id. An upgrade line often keeps one model; the viewer lists models.
"""
import datetime, hashlib, io, json, os, re, struct, sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from glbtools import glb_read, glb_write
import reduce_keys

EXTRACT = r'C:\MHFU-Extract'
CONV = os.path.join(EXTRACT, 'conv')
DOCS = os.path.join(REPO, 'docs')
sys.path.insert(0, os.path.join(EXTRACT, 'tools'))
from convert_player import text_section, VBASE, FBASE  # noqa: E402

MELEE_TABLE, MELEE_STRIDE, MELEE_N = 0x0895A0DC, 24, 1151
GUN_TABLE, GUN_STRIDE, GUN_N = 0x08960CAC, 28, 355
CLASS_TABLE = 0x089785A8              # byte per weapon model: its class, CLASS_ORDER
CLASS_ORDER = ['Great Sword', 'Heavy Bowgun', 'Hammer', 'Lance', 'Sword & Shield', 'Light Bowgun', 'Dual Blades',
               'Long Sword', 'Hunting Horn', 'Gunlance', 'Bow']
CLASSES = ['Great Sword', 'Long Sword', 'Sword & Shield', 'Dual Blades', 'Hammer', 'Hunting Horn', 'Lance',
           'Gunlance', 'Light Bowgun', 'Heavy Bowgun', 'Bow']
STATE = ['opaque', 'blend', 'add', 'revsub']
FEAT = [{'transp': 'AlphaConstant'}]
SLOTS = ['helm', 'body', 'arm', 'wst', 'leg']
SLOT_FILE = {'helm': 'hair', 'body': 'body', 'arm': 'arm', 'wst': 'wst', 'leg': 'reg'}


def webp(png_path):
    im = Image.open(png_path).convert('RGBA')
    buf = io.BytesIO()
    im.save(buf, 'WEBP', lossless=True, quality=100, method=6)
    return buf.getvalue(), im


def strip_and_compact(js, bin_):
    for m in js.get('materials', []):
        m.get('pbrMetallicRoughness', {}).pop('baseColorTexture', None)
    for k in ('images', 'textures', 'samplers'):
        js.pop(k, None)
    used = sorted({a['bufferView'] for a in js['accessors']})
    remap, out, views = {}, bytearray(), []
    for old in used:
        bv = js['bufferViews'][old]
        while len(out) % 4:
            out.append(0)
        start = len(out)
        out += bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        remap[old] = len(views)
        views.append(dict(bv, byteOffset=start))
    for a in js['accessors']:
        a['bufferView'] = remap[a['bufferView']]
    js['bufferViews'] = views
    return out


class Shipper:
    """Ships one converted glb: textures to the WebP pool, the glb without them, its materials.json entry."""

    def __init__(self):
        self.mats, self.glb = {}, {}

    def ship(self, src_glb, rec, tex_dir, dst_rel, ref):
        tex_paths = []
        for name in rec['textures']:
            data, _ = webp(os.path.join(tex_dir, name))
            rel = f'tex/{hashlib.md5(data).hexdigest()[:16]}.webp'
            if not os.path.exists(os.path.join(DOCS, rel)):
                open(os.path.join(DOCS, rel), 'wb').write(data)
            tex_paths.append(rel)
        js, bin_ = glb_read(src_glb)
        bin_ = strip_and_compact(js, bin_)
        os.makedirs(os.path.dirname(os.path.join(DOCS, dst_rel)), exist_ok=True)
        glb_write(os.path.join(DOCS, dst_rel), js, bin_)
        mats = {}
        for gm in js.get('materials', []):
            nm = gm['name']
            k = int(nm[1:3])
            state = nm[4:] if len(nm) > 3 else 'opaque'
            unlit = state.startswith('unlit')
            blend = state.replace('unlit-', '').replace('unlit', 'opaque') or 'opaque'
            r = {'s': STATE.index(blend)}
            t = rec['materials'][k]['tex']
            if t is not None and t < len(tex_paths):
                r['t'] = {'albedo': t + 1}
                if blend == 'opaque':
                    im = Image.open(os.path.join(tex_dir, rec['textures'][t]))
                    if im.mode == 'RGBA' and im.getextrema()[3][0] < 128:
                        r['fb'] = '00100000'          # alpha test: see-through texels
            if blend != 'opaque':
                r['f'] = 0
            if unlit:
                r['cls'] = 'Unlit'
            mats[nm] = r
        self.mats[ref] = {'tex': tex_paths, 'mats': mats}
        self.glb[dst_rel] = ref
        return {'glb': dst_rel, 'tris': rec['tris']}


def skin_joints(glb):
    """THE PIECE'S SKIN, joint by joint: the rig joint each skin index binds ("<i>:<i>_s", the leaf), in the skin's own
    order -- the shared base pairs skeleton bone i with joints[i] (base/render/skeleton.js bonesByGid). A piece's skin
    holds only the joints its bones ride (the face: 0 and 20), so a list of the whole rig mislabelled every bone after
    the first it skips."""
    js, _ = glb_read(glb)
    names = [n.get('name', '') for n in js['nodes']]
    out = []
    for j in js['skins'][0]['joints']:
        m = re.match(r'^(\d+):(\d+)_s$', names[j])
        assert m, (glb, names[j])
        out.append({'gid': int(m.group(2)), 'leaf': True})
    return out


def hair_mat(file):
    """THE MATERIAL THE HAIR COLOUR GOES INTO, for a head-slot model (a hairstyle or a helm): 0x088CEAB8 writes the
    hunter's hair colour (player data +0x4BC, hunter +0x4E4) into ENTRY 0 of mesh 0's material list of the head slot's
    model -- diffuse 0.65 x H, ambient H / 2 -- as the armour colour goes into entry 1 (dyeMat). -> its PMO material."""
    import fu
    d = open(os.path.join(EXTRACT, 'data', 'f%04d.bin' % file), 'rb').read()
    n = struct.unpack_from('<I', d)[0]
    for i in range(n):
        off, sz = struct.unpack_from('<2I', d, 4 + 8 * i)
        if d[off:off + 4] == b'pmo\0':
            p = fu.Pmo(d[off:off + sz])
            m0 = p.meshes[0] if p.meshes else None
            if not m0 or not m0['nremap']:
                return None
            return p.remap[m0['first_remap']] if p.remap else m0['first_remap']
    return None


INNER_TABLES = {'leg': 0x089B6784, 'body': 0x089B680C, 'arm': 0x089B6894}   # per gender a pointer to 32 s16 models
TONE_TABLES = 0x089B66FC                                                      # per gender a pointer to 32 u8, by face


def inner_wear(ship):
    """THE CLOTHING UNDER AN EMPTY SLOT, READ 2026-10-19. 0x088D6388: an empty (model 0) legs / chest / arms slot draws
    table[gender][clothing * 4 + tone], where clothing is the character's CLOTHING choice (the equipment set's +0x42 =
    player +0x4B5, character creation's page 2: 0-7) and tone = TONE[gender][face] (0x08851FEC: the set's gender +0x40
    and face +0x43) -- each clothing type in four variants by the face's skin. Gender 0 is male. -> (inner, tone):
    inner[g][slot] = 32 piece keys, tone[g] = 32 indices; every model shipped."""
    import allegrex
    boot = allegrex.boot()
    at = lambda va: va - allegrex.VBASE + allegrex.FBASE
    inner, tone = {}, {}
    for gi, g in enumerate('mf'):
        inner[g] = {}
        for slot, tab in INNER_TABLES.items():
            ptr = struct.unpack_from('<I', boot, at(tab) + 4 * gi)[0]
            models = struct.unpack_from('<32h', boot, at(ptr))
            inner[g][slot] = [ship(g, slot, m) for m in models]
        ptr = struct.unpack_from('<I', boot, at(TONE_TABLES) + 4 * gi)[0]
        tone[g] = list(boot[at(ptr):at(ptr) + 32])
    return inner, tone


PLATE_SHEET_FILE = 5355              # the HUD icon sheet (.TMH, image 0, 256 x 256; f5355-f5359 are identical copies)
SPRITES = 0x089392C8                 # the HUD sprite records, 12 bytes: u, v, w, h, flags, sheet (0x0882A9DC reads them)
CLASS_SPRITE = 0x0893AF88            # u16 per weapon class (the game's class order): the sprite of its glyph


def plate_icons():
    """THE NAME TAG'S WEAPON GLYPHS, READ 2026-10-19. The tag over a hunter (0x08835470: the name at the hunter's projected
    position, its glyph 14 px to the left) draws sprite CLASS_SPRITE[class] of the HUD sprite table, a 12 x 16 cell of
    sheet 11 -- the HUD icon sheet, loaded from f5355. One 16 x 16 cell per class here, in the game's class order
    (CLASS_ORDER), the glyph centred, so the shared base's square cells keep its shape. -> docs/ui/plate-icons.png and
    {class name: cell}."""
    import allegrex, fu
    boot = allegrex.boot()
    at = lambda va: va - allegrex.VBASE + allegrex.FBASE
    sheet = fu.tmh_images(open(os.path.join(EXTRACT, 'data', 'f%04d.bin' % PLATE_SHEET_FILE), 'rb').read())[0]
    rgba = sheet.rgba()
    img = rgba if isinstance(rgba, Image.Image) else Image.fromarray(rgba, 'RGBA')
    strip = Image.new('RGBA', (16 * len(CLASS_ORDER), 16), (0, 0, 0, 0))
    cells = {}
    for k, name in enumerate(CLASS_ORDER):
        sid = struct.unpack_from('<H', boot, at(CLASS_SPRITE) + 2 * k)[0]
        u, v, w, h, _flags, sh = struct.unpack_from('<6H', boot, at(SPRITES) + 12 * sid)
        assert sh == 11 and (w, h) == (12, 16), (name, sid, u, v, w, h, sh)
        strip.paste(img.crop((u, v, u + w, v + h)), (16 * k + (16 - w) // 2, (16 - h) // 2))
        cells[name] = k
    os.makedirs(os.path.join(DOCS, 'ui'), exist_ok=True)
    strip.save(os.path.join(DOCS, 'ui', 'plate-icons.png'))
    return cells


def weapon_tables():
    boot = open(os.path.join(EXTRACT, 'boot', 'BOOT.BIN'), 'rb').read()
    at = lambda va: va - VBASE + FBASE
    rows = []
    for sec, base, stride, n in ((4, MELEE_TABLE, MELEE_STRIDE, MELEE_N), (6, GUN_TABLE, GUN_STRIDE, GUN_N)):
        names = text_section(sec)
        for i in range(1, n):
            nm = names[i] if i < len(names) else ''
            if not nm or nm.lower() == 'dummy':
                continue
            model = struct.unpack_from('<H', boot, at(base) + i * stride + 16)[0]
            rows.append({'table': 'melee' if sec == 4 else 'gun', 'id': i, 'name': nm, 'model': model,
                         'cls': CLASS_ORDER[boot[at(CLASS_TABLE) + model]]})
    return rows


def main():
    import argparse, shutil
    globals()['shutil'] = shutil
    ap = argparse.ArgumentParser()
    ap.add_argument('--skip-poses', action='store_true', help='keep the shipped pose glbs')
    global args
    args = ap.parse_args()
    man = json.load(open(os.path.join(CONV, 'player.json')))
    for sub in ('models/m', 'models/f', 'models/weapons', 'tex'):
        os.makedirs(os.path.join(DOCS, sub), exist_ok=True)
    sh = Shipper()
    pieces = {}

    def piece(g, kind, n):
        key = f'{g}_{kind}{n:03d}'
        if key in pieces:
            return key
        rec = man['pieces'].get(key)
        if not rec or rec.get('error'):
            return None
        out = sh.ship(os.path.join(CONV, 'player', g, key + '.glb'), rec, os.path.join(CONV, 'player', 'tex'),
                      f'models/{g}/{key}.glb', f'pl/{key}')
        pieces[key] = dict(out, joints=skin_joints(os.path.join(CONV, 'player', g, key + '.glb')),
                           dyeMat=rec.get('dyeMat'))
        if kind in ('hair', 'head'):
            pieces[key]['hairMat'] = hair_mat(rec['file'])
        return key

    armor = {}
    for slot in SLOTS:
        rows = []
        for r in man['armor'][slot]:
            if not r['name'] or r['name'].lower() == 'dummy':
                continue
            row = {'id': r['id'], 'name': r['name'], 'rar': r['rar'], 'col': r.get('col', 0),
                   'wear': ''.join(c for bit, c in ((1, 'm'), (2, 'f'), (4, 'b'), (8, 'g')) if r['who'] & bit)}
            for g in 'mf':
                mdl = r[g]
                row[g] = None if mdl < 0 else piece(g, SLOT_FILE[slot], mdl)
            rows.append(row)
        armor[slot] = rows
    chars = {g: {'face': [piece(g, 'face', i) for i in range(32)],
                 'hair': [piece(g, 'head', i) for i in range(27)]} for g in 'mf'}
    rigs = {g: [{'i': b['i'], 'parent': b['parent'], 'pos': b['pos']} for b in man['rigs'][g]] for g in 'mf'}
    inner, tone = inner_wear(lambda g, slot, n: piece(g, SLOT_FILE[slot], n))
    plate_cells = plate_icons()

    weapons, models = {c: [] for c in CLASSES}, {}
    for w in weapon_tables():
        key = f"we{w['model']:03d}"
        rec = man['weapons'].get(key)
        if not w['cls'] or not rec or rec.get('error'):
            continue
        if key not in models:
            out = sh.ship(os.path.join(CONV, 'weapon', key + '.glb'), rec, os.path.join(CONV, 'weapon', 'tex'),
                          f'models/weapons/{key}.glb', f'we/{key}')
            models[key] = dict(out, meshes=len(rec['meshes']), parts=rec['parts'])
        weapons[w['cls']].append({'id': f"{w['table']}:{w['id']}", 'name': w['name'], 'model': key})

    # the hunter's motions (convert_player_anim.py): the shared pack and one per weapon class, per gender
    am = json.load(open(os.path.join(CONV, 'player', 'anim.json')))
    poses = {}
    for g in 'mf':
        packs = []
        for pack, rec in am['packs'].items():
            rel = f'poses/{g}/{pack}.glb'
            os.makedirs(os.path.join(DOCS, 'poses', g), exist_ok=True)
            if not (args.skip_poses and os.path.exists(os.path.join(DOCS, rel))):
                shutil.copyfile(os.path.join(CONV, 'player', 'anim', f'{g}_{pack}.glb'), os.path.join(DOCS, rel))
                reduce_keys.fix(os.path.join(DOCS, rel))
            label = 'Common' if pack == 'co' else am['classOrder'][int(pack[1:])]
            packs.append({'id': pack, 'label': label, 'file': rel,
                          'clips': [{'clip': c['clip'], 'dur': c['dur'], 'loop': c['loop']} for c in rec['clips']]})
        poses[g] = packs

    # where the game puts each weapon on every frame of its class's motions (build_stances.py in the extract:
    # the game's own carry rule and placement pass run under emulation), one file per class, shipped as built
    os.makedirs(os.path.join(DOCS, 'stances'), exist_ok=True)
    for pack in am['packs']:
        src = os.path.join(CONV, 'player', 'stances', pack + '.json')
        if pack != 'co' and os.path.exists(src):
            shutil.copyfile(src, os.path.join(DOCS, 'stances', pack + '.json'))

    now =datetime.datetime.now().isoformat(timespec='seconds')
    json.dump({'version': 1, 'generated': now,
               '_about': {
                   'armor': "the game's five armour tables (BOOT.BIN, pointer table at file 0x176b48; 0x28-byte "
                            "records): `m`/`f` the piece each gender draws (record +0 / +2 model -> "
                            "<g>_<hair|body|arm|wst|reg><model>), `wear` record +4 (m, f, b Blademaster, g "
                            "Gunner), `rar` +5 + 1, `col` +0x13 the piece's colour mode (0 none, 1 a fixed grey, 2 S-Series, "
                            "3 X/Z-Series; pieces[].dyeMat is the material the game colours). Names: the game's English text. Model 0 is the clothing "
                            "drawn under an empty slot.",
                   'chars': '32 faces and 27 hairstyles per gender (f_face / f_head files).',
                   'inner': "the clothing drawn in an EMPTY legs / chest / arms slot (0x088D6388): inner[g][slot][clothing x 4 "
                            "+ tone[g][face]] (BOOT s16 tables 0x089B6784 legs, 0x089B680C chest, 0x089B6894 arms; the tone "
                            "u8 tables 0x089B66BC male / 0x089B66DC female by face, 0x08851FEC); clothing = the character's "
                            "CLOTHING choice (player +0x4B5, 0-7). An empty waist draws record 0's model; an empty head the "
                            "hairstyle.",
                   'rigs': 'the 21-bone player rig of each gender; every piece is skinned to it.',
                   'poses': "the hunter's motions: f0081 (Common) and f3397-f3407 (one per weapon class, in the "
                            "game's class order, BOOT.BIN u16 table at 0x1b4c18), on the rig, clips named "
                            "'<set>:<slot>' as the game stores them (no names in the data); 60 fps (the game steps a "
                            "motion 2 frames per 30 Hz update)."},
               'genders': ['m', 'f'], 'slots': SLOTS, 'armor': armor, 'pieces': pieces, 'chars': chars,
               'rigs': rigs, 'poses': poses, 'inner': inner, 'tone': tone},
              open(os.path.join(DOCS, 'armor.json'), 'w'), indent=1)
    json.dump({'version': 1, 'generated': now,
               '_about': {'weapons': "the game's weapon tables (BOOT.BIN: melee 0x895A0DC, 24-byte records; bows "
                                     "and bowguns after it, 28-byte; model id at +16 -> weNNN). Names: the game's "
                                     "English text. The class is the model's: byte [0x089785A8 + model] (BOOT 0x0885CCD0), "
                                     "in the game's class order. Gun records: 0x08960CAC (item -> model, 0x08851F20)."},
               'classes': CLASSES, 'weapons': weapons, 'models': models},
              open(os.path.join(DOCS, 'weapons.json'), 'w'), indent=1)
    json.dump({'_about': 'Per glb: its textures and, per glTF material name, the albedo (1-based into tex), the '
                         'draw state (index into state), f (feat), fb (alpha-test bit), cls (Unlit).',
               'state': [{'blend': b} for b in STATE], 'feat': FEAT, 'glb': sh.glb, 'monsters': sh.mats},
              open(os.path.join(DOCS, 'materials.json'), 'w'), indent=1)
    print({s: len(v) for s, v in armor.items()}, len(pieces), 'pieces;',
          {c: len(v) for c, v in weapons.items()}, len(models), 'weapon models')


if __name__ == '__main__':
    main()
