# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A static single-page web app: a hunter in MHFU armor, every piece swappable, with a weapon on the hunter.
A **basic version** (Raven, 2026-10-16: "Keep it basic for now, focus on armors and weapons").

No build step for the app, no framework. `docs/index.html` holds markup, styles and logic;
`docs/render/*.js` is the render core (ES modules, three.js 0.169 from jsdelivr), copied from the MHFU
Monster Viewer. Serve `docs/` with `dev/serve.py` (port 5624 in the quest randomizer's launch.json).

## How it is put together

- **The page shell is the MH4U Armor Viewer's** (panels, modals, theme script). Its Hunters, Colors,
  Pigment, Animation, Lighting, Camera and Effects panels and several fields are in the markup but
  `hidden`: their logic lived in the 4U main module, which is replaced. The main module (the last
  `<script type="module">`) is MHFU's own and small.
- **Pieces load through render/monster.js `loadMonster`** (the monster viewer's): glb, materials from
  materials.json by glTF material name, skeleton clone.
- **One rig per gender.** Every piece glb carries the gender's whole 21-bone rig (nodes "<i>:<i>", "_s"
  leaves), so `applyPose` (index.html `POSE`, rotations by rig bone) poses every piece the same.
  Rig: 0-2 root/hips, 3-5 / 6-8 legs, 9-10 spine, 11-14 the +x arm, 15-18 the -x arm, 19-20 neck/head.
- **Head rule:** an empty head draws the hairstyle (`f_head` files); a helm replaces it; the face is always
  drawn. The game's "Nothing equipped" head model (`hair000`) is the hair drawn blended and is not used.
- **Weapons** keep their own skeleton (one root per part). Carry: Sheathed (the weapon away, the Pose
  plays), Drawn (the Stance -- a clip of the class pack -- plays) or Beside (`placeWeapon`, parts side by
  side). On the hunter, `updateWeapon` runs every frame after the pose: `stances/wNN.json` gives, per
  variant and clip frame, passes of {m: part root on hunter joint k as T R S, b: bone locals the game
  sets, s: meshes/materials shown}. Two passes (the Long Sword's blade and scabbard) get a second copy
  of the model (`extras`). The data is the game's own routines run under emulation, not hand-placed:
  don't tune offsets here; fix tools/weapon_emu.py or build_stances.py in the extract.
- **Motions** are 60 fps (the game steps a motion 2 frames per 30 Hz update). The Pose list is Common
  only; a class's pack is the Weapon panel's Stance (the 4U viewer's rule).

## Data pipeline

    python C:\MHFU-Extract\tools\convert_player.py   # -> C:\MHFU-Extract\conv\player, conv\weapon, player.json
    python C:\MHFU-Extract\tools\convert_player_anim.py   # -> conv\player\anim (hunter motions)
    python C:\MHFU-Extract\tools\build_stances.py         # -> conv\player\stances (about 1 minute)
    python scripts/build_viewer.py                   # conv -> docs/ (about 6 minutes)

- convert_player.py's header has the file ranges, the rig matching and the armor table layout; faces go
  onto head bone 20 (`on_bone`), dangling chains the rig lacks ride their nearest mapped ancestor. Which rig
  joint each piece bone follows is the game's table (convert_player.py `rig_map`), never a guess by
  position: root, hips and spine share a place, and guessing put chest and waist hip bones on the root.
  Each piece glb's skin has one joint per piece bone (the rig node it follows, with that bone's full
  inverse bind -- some binds turn or scale a bone); weapon nodes carry their bind rotation and scale.
- build_viewer.py's header has the weapon tables and the class of each model (BOOT.BIN, from the game's
  own item -> model and model -> class functions). The Weapon list has one entry per model.

## Conventions

- Storage keys are `mhfu-armor-viewer*`.
- The theme palette is the MHFU Hunting Log's `COLORS` (the family's 31 hexes); keep it identical.
- Names come from the game's text; never put user text into the DOM with `innerHTML`.
- Credit every reference in NOTICE.md, the README and the About dialog in the same change.
