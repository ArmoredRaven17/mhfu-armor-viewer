# MHFU Armor Viewer

A fan-made 3D viewer for the armor and weapons of Monster Hunter Freedom Unite (PSP). Pick a gender and
a piece for each slot, mix and match, and see the game's own models and textures.

**Basic version.** The page shell is the MH4U Armor Viewer's; the logic is new and much smaller.

## What it does

- Every armor piece in the game's five armor tables, by the game's own names, for both genders, with
  the Blademaster / Gunner filter. An empty slot shows the clothing the game draws there.
- 32 faces and 27 hairstyles per gender. A helm replaces the hairstyle; the face is always drawn.
- Every weapon in the game's weapon tables, by class, on the hunter where the game puts it: sheathed
  (on the back, folded where the game folds it, shields on the arm, the quiver at the hip) or drawn,
  playing the class's own motions with the weapon in hand -- a draw takes it off the back on the game's
  frame, the bow unfolds, the Long Sword leaves its scabbard on the back. Or beside the hunter, to look at.
- The hunter's own motions (the Common pack, 131 clips) or a relaxed pose; the game's 60 frames a second.

## Not done yet

- Clip names: the game stores motions by number only, so they are listed as set:slot.
- Weapon effects (glows, gunlance fire) and the Hunting Horn's performance colours.
- Colors, pigments, and the dangling chains some helms and hairstyles swing (ponytails, plumes), which
  are held still.

## Data pipeline

    python C:\MHFU-Extract\tools\convert_player.py   # player pieces + weapons -> C:\MHFU-Extract\conv
    python C:\MHFU-Extract\tools\convert_player_anim.py   # the hunter's motions
    python C:\MHFU-Extract\tools\build_stances.py         # where each weapon sits, per class and motion
    python scripts/build_viewer.py                   # conv -> docs/ (about 6 minutes)

The script headers are the long reference; `C:\MHFU-Extract\CLAUDE.md` maps the game files.

- **Files.** Each piece is a PAC of [model, skeleton, textures]. The ranges per slot and gender are
  FUComplete's file map (JP) plus 20 for the US release. Capcom's folder names are swapped: `hair` holds
  the head armor, `head` the hairstyles, `reg` the legs.
- **One rig.** A legs file carries the whole 21-bone player skeleton; every other piece carries the
  bones it is skinned to. Which hunter joint each piece bone follows is the game's own table (BOOT.BIN
  0x089B79C0, by piece slot), checked against the bone matrices the game's draw sends the GPU; the
  converter ships every piece on the whole rig, so all of them pose as one.
- **Weapons on the hunter.** Not a table copied by hand: the game's own carry rule (which hand, or away,
  by class, motion and frame) and weapon placement pass are run in an emulator over a quest save state,
  for every class, motion and frame, and what they leave is shipped as `docs/stances/wNN.json`.
- **Tables.** The armor tables (five arrays of 40-byte records; which model each gender draws, who may
  wear it) and the weapon tables (model id per weapon) are read from the game's BOOT.BIN; the names from
  its English text.

## Credits

See [NOTICE.md](NOTICE.md). File formats after **MHFU-ModKit**, **mhff** and **PMO-Importer**; the
table layout after Exceen's **mhfu_transmog**; the file map after **FUComplete**. The PSP vector unit after **PPSSPP**'s source.
