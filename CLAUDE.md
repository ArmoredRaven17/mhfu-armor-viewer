# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A static single-page web app: a hunter in MHFU armor, every piece swappable, with a weapon on the hunter.

No build step for the app, no framework. Since Phase 1.6 of the shared viewer base (2026-10-19; the plan:
`C:\Coding Repos\VIEWER-BASE-PLAN.md`) the page is GU's layout, ported from the MH4U Armor Viewer:
`docs/index.html` is markup only, `docs/base/` is the shared base (pulled, never edited here:
`python dev/sync-base.py --pull --source "C:\Coding Repos\mhgu-armor-viewer\docsase"`, `--check`;
`docs/base/README.md` is its contract), `docs/game.js` and `docs/adapter.js` are MHFU's values and data for it,
`docs/app.js` is MHFU's main module and `docs/render/piece.js` builds one model. Serve `docs/` with
`dev/serve.py` (port 5624 in the quest randomizer's launch.json).

## How it is put together

- **Every value is MHFU's own read, or left out.** What is not read (Hair Color, Clothing, Guild Info, bowgun
  parts, a colour board, the GE colour blend) is listed in game.js and on the task board, never filled with
  another game's.
- **Pieces** load through render/piece.js on the base's render modules: glb, materials from materials.json by
  glTF material name, skeleton clone; every mesh keeps its "<PMO mesh>/<PMO material>" key (`fuKey`).
- **One rig per gender**, 21 bones (nodes "<i>:<i>", "_s" leaves): 0-2 root/travel/hips, 3-5 / 6-8 legs, 9-10
  spine, 11-14 the +x arm, 15-18 the -x arm, 19-20 neck/head. A piece's SKIN holds only the joints its bones
  ride, and armor.json `joints` lists them in skin order (build_viewer.py `skin_joints`): the base pairs skin
  bone i with joints[i].
- **Motions** play through the base's PoseDriver (app.js `FuPoseDriver`): the proxy is the motion pack's own
  rig (no piece is skinned to all 21 joints), and the travel on bone 1 is held at its rest so the figure stays
  in frame. 60 fps (the game steps a motion 2 frames per 30 Hz update). The Pose list is Common; a class's pack
  is the Weapon panel's Stance. A clip's loop is the game's flag unless the Loop button says otherwise.
- **Head rule:** an empty head draws the hairstyle (`f_head` files); a helm replaces it; the face is always
  drawn. The game's "Nothing equipped" head model (`hair000`) is the hair drawn blended and is not used.
  An empty chest, arms, waist or legs draws record 0's model (the clothing).
- **Armor colour** (record +0x13, armor.json `col`): 2 S-Series and 3 X/Z-Series take the pigment row's
  colour or the game's Rainbow; 1 is drawn in the fixed grey 0x80 the game writes; 0 takes none. The colour
  goes into the one material the game colours (pieces[].dyeMat) as a multiply (render/piece.js `applyDye`).
- **Weapons** keep their own skeleton (one root per part) and are no figure of the pose driver. Carry:
  Sheathed (the weapon away, the Pose plays) or Drawn (the Stance plays). `updateWeapon` runs every frame after
  the pose: `stances/wNN.json` gives, per variant and clip frame, passes of {m: part root on hunter joint k as
  T R S, b: bone locals the game sets, s: meshes/materials shown}. Two passes (the Long Sword's blade and
  scabbard) get a second copy of the model (`extras`). The data is the game's own routines run under
  emulation, not hand-placed: don't tune offsets here; fix tools/weapon_emu.py or build_stances.py in the
  extract. The port reproduces the pre-base page's placement to 1e-4 (checked 2026-10-19, all 11 classes).

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
