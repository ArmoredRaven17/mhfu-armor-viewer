# Notices and attribution

## Game content

Monster Hunter Freedom Unite, and all of its models, textures, animations and data tables, are
© CAPCOM CO., LTD. All rights reserved.

This is an unofficial, non-commercial fan project. It is not affiliated with, endorsed by, or
supported by Capcom. All game assets were extracted from a personally owned copy of the game (the
US release, ULUS10391) and are shown for reference only.

## File-format and table references

The converter that reads the game's files (`C:\MHFU-Extract\tools`, see README.md) is this project's
own code. These projects were the references it was written from; none of their code is included.

- **MHFU-ModKit** — sp00ktober. Format documentation for PAC containers, PMO models, TMH textures and
  skeletons. https://github.com/MHFU-ModKit/modkit (MIT; its format library is GPL-3.0)
- **mhff** — Seth VanHeulen. Earlier PSP Monster Hunter file-format code that ModKit's PMO and TMH
  readers derive from. https://github.com/svanheulen/mhff (GPL-3.0)
- **PMO-Importer** — AsteriskAmpersand. A second reference for the model format.
  https://github.com/AsteriskAmpersand/PMO-Importer (GPL-3.0)
- **mhfu_transmog** — Exceen. Its FINDINGS.md gave the layout of the armor tables (40-byte records,
  male / female model ids) and the weapon table (model id at +16), for the JP game; the US tables were
  located in BOOT.BIN from that layout. https://github.com/Exceen/mhfu_transmog (MIT)
- **FUComplete** — its file documentation (https://fucomplete.github.io/files_doc/) gave which file holds
  which armor, face and hair model (JP numbering; the US files are 20 higher).
- The DATA.BIN cipher and archive layout come from the same author's **MHFU LookUp** app's notes.
- **PPSSPP** — Henrik Rydgård and contributors. Its source (MIPSIntVFPU.cpp, MIPSVFPUUtils.cpp) was the
  reference for the PSP vector unit in the extract's own MIPS interpreter, which runs the game's weapon
  placement to find where each weapon sits; PPSSPP save states of a quest supplied the game's memory.
  https://www.ppsspp.org (GPL-2.0; none of its code is included)

## Data

- Armor and weapon **names** are the game's own (its English text).
- Weapon **classes** are the game's own: the class byte of each weapon model in BOOT.BIN.

## Tools used to build this

- **three.js** — rendering, `GLTFLoader`, `OrbitControls`, `SkeletonUtils`. https://threejs.org
- **Pillow**, **NumPy**, **pycdlib** — reading the disc image and the archive, texture conversion.

## Assets

The theme icons are the MHFU LookUp app's monster icons. The MHFU font and the UI textures are shared
with the sibling MHGU, MH3U and MH4U fan apps.

## Code

The page shell (markup, styles, modals, theme) is the **MH4U Armor Viewer**'s and the render modules are
the **MHFU Monster Viewer**'s, by the same author; the main script is this project's own.
