// THIS VIEWER'S GAME, for the shared viewer base (docs/base; the plan: C:\\Coding Repos\\VIEWER-BASE-PLAN.md). Every value
// the base needs that differs between viewers lives here or in docs/adapter.js, never in a base file. A CLASSIC script,
// loaded before docs/base/ui/shell.js, so the theme and the saved view preferences apply before the first paint; the
// page's modules read the same object (window.VIEWER_GAME). The fields follow the MH4U Armor Viewer's game.js; a field
// MHFU has not got is left out or null, and every value below is MHFU's own read or says where it is not.
//
// (Phase 1.6, 2026-10-19.) The reads behind it are in C:\MHFU-Extract\CLAUDE.md and the comments here; what is not read
// is on the board ("## Shared viewer base", MHFU unread values).
window.VIEWER_GAME = {
  id: 'mhfu',
  // every localStorage key the base writes is this prefix + '-' + a name: -theme, -stage, -ui, -tab, ... (the page's own
  // keys today are mhfu-armor-viewer-theme / -ui / -stage, so the saved preferences carry over)
  storagePrefix: 'mhfu-armor-viewer',
  // every side panel starts shut and locked until the hunter is drawn (app.js dispatches viewer-ready), as GU's
  panelsUntilReady: true,
  // THE THEMES: the MH apps family's palette, the hexes unchanged, named for MHFU monsters -- the page's own list today,
  // which is kept identical to the MHFU Hunting Log's COLORS. A name too long for a swatch is shortened, its full name in
  // `icon`, which names the icon file (the MHFU LookUp app's set, copied by build_viewer.py).
  themes: [
    { name: "Teostra", hex: "#570B0B" },
    { name: "Rathalos", hex: "#b51717" },
    { name: "Cephadrome", hex: "#783E0F" },
    { name: "D. Hermitaur", hex: "#C7620E", icon: "Daimyo Hermitaur" },
    { name: "Tigrex", hex: "#74631D" },
    { name: "Rajang", hex: "#9C8328" },
    { name: "E. Congalala", hex: "#436713", icon: "Emerald Congalala" },
    { name: "Gendrome", hex: "#67922E" },
    { name: "G. Plesioth", hex: "#0B570F", icon: "Green Plesioth" },
    { name: "Rathian", hex: "#39993E" },
    { name: "Basarios", hex: "#14503d" },
    { name: "B. Yian Kut-Ku", hex: "#279773", icon: "Blue Yian Kut-Ku" },
    { name: "A. Rathalos", hex: "#0C5D68", icon: "Azure Rathalos" },
    { name: "Kirin", hex: "#118898" },
    { name: "S. Ceanataur", hex: "#005984", icon: "Shogun Ceanataur" },
    { name: "Plesioth", hex: "#0080c1" },
    { name: "Lunastra", hex: "#0B2757" },
    { name: "Velocidrome", hex: "#0b3f97" },
    { name: "P. Gypceros", hex: "#1F0B57", icon: "Purple Gypceros" },
    { name: "Plum D. Hermitaur", hex: "#4e2fa2", icon: "Plum Daimyo Hermitaur" },
    { name: "Yian Garuga", hex: "#62008f" },
    { name: "Chameleos", hex: "#8e50ab" },
    { name: "P. Rathian", hex: "#D4358C", icon: "Pink Rathian" },
    { name: "Congalala", hex: "#C8679D" },
    { name: "Akantor", hex: "#5a411f" },
    { name: "Diablos", hex: "#997c54" },
    { name: "Gravios", hex: "#835A32" },
    { name: "Bulldrome", hex: "#B17A47" },
    { name: "K. Daora", hex: "#505358", icon: "Kushala Daora" },
    { name: "S. Rathalos", hex: "#7C879B", icon: "Silver Rathalos" },
    { name: "Forbidden", hex: "#1E2025", icon: "Question Mark" },
  ],
  themeDefault: '#1E2025',             // Forbidden, the family default
  // assets/MonsterIcons/<slug>.png, the page's own slug rule (the LookUp app's file stems: lowercase, words joined by "_",
  // Yian Kut-Ku's hyphen dropped); Forbidden's "Question Mark" is the unknown icon
  themeIcon: function (name) {
    if (name === 'Question Mark') return 'assets/MonsterIcons/_unknown.png';
    return 'assets/MonsterIcons/' + name.toLowerCase().replace(/[^a-z0-9-]+/g, '_').replace(/^_|_$/g, '')
      .replace('yian_kut-ku', 'yian_kut_ku') + '.png';
  },
  themeIconFallback: 'assets/MonsterIcons/_unknown.png',
  // no pane tabs: the hunter alone (MHFU's Felyne Comrade is not in this viewer)
  paneTabs: [],
  // the joints the camera's aim takes, by rig joint: 20 the head (every face is skinned to it alone: the skin table's
  // slot 1, BOOT 0x089B79C0), 10 the chest (the joint the chest pieces' vertices follow most: 25.7k of 47k sampled male
  // vertices, 27.2k female, through the same table's slot 3). Measured from the game's own skin data, not a ROM field.
  aimJoints: { head: 20, chest: 10 },
  // the head aim sits this far above the head joint: the default female face's box centre, head-local (f_face000:
  // y -0.057 .. 0.144 m, centre 0.044; male 0.042), measured, not a ROM field
  aimHeadLift: 0.044,
  // the aim's cast recomputes the skinned meshes' bounds first (three keeps a skinned mesh's bounds from its first pose)
  aimRefreshSkinBounds: true,
  // Save / Save As / Open: the default file name and the file type the picker shows
  setFileName: 'mhfu-armor-set.json',
  setFileLabel: 'MHFU armor set',
  // THE CHARACTER COLOUR ROWS (docs/base/ui/colour-rows.js). MHFU's character creation (f0019 section 1, 579-603) has the
  // pages NAME, GENDER, CLOTHING, FACE, HAIRSTYLE, HAIR COLOR, VOICE, its options labelled TYPE%02d; it has no skin, eye,
  // face paint or clothing colour. HAIR COLOR is its one colour (READ 2026-10-19): RGB in the player data (+0x4BC), written
  // by 0x088CEAB8 into the head slot's model (docs/app.js); character creation picks one of sixteen (adapter.js
  // HAIR_COLOURS), a new save holds the first -- the row's Default (default: true, app.js defaultColour). RGB... for any
  // other colour a save can hold; no board (none read).
  colourNames: [],
  colourParts: [['hairColor', 'hair']],
  colourPartsPalico: [],
  colourRows: { hair: { rgb: true, default: true } },
  // no bare clothing choice: an empty slot always draws the clothing (armour model 0, "Nothing equipped")
  clothingNone: false,
  // no colour is carried in a material colour CHANNEL: the game writes the colour into one material's own colour bytes
  colourChannel: null,
  // THE WEAPON PANEL'S CLASS ROWS: the bowgun parts (READ 2026-10-19). The weapon draw (0x088D5918) shows a Light (w05) or
  // Heavy (w01) Bowgun's mesh-0 material entry 1 only with the equipped gun's flag 0x20, entry 2 only with 0x10 (Light) /
  // 0x80 (Heavy) -- the flags are the box entry's +4 (player +0x4C4, hunter +0x4EC). The game's own status display
  // (0x0881F7EC, text table 0x089ACA74) names them: Heavy 0x20 Power Barrel (f0019 s1 435), 0x80 Shield (436); Light
  // 0x20 Long Barrel (420), 0x10 Silencer (421) -- and 0x40 Zoom Scope (418, else Fixed Scope 419), which draws no part
  // (it narrows the aiming camera), so it has no row. Which guns may take which part is NOT read: every bowgun model
  // carries both.
  // The parts go in the panel's own Attachment / Form row (GU's bowgun Attachment: None, then the parts; Raven, 2026-10-19:
  // "make the attachments a drop down since only one can be attached at a time"), labelled with the game's words; app.js
  // fills it per class. No class rows of MHFU's own.
  weaponRows: [],
  // THE HUNTER PANEL'S ROWS (base/ui/hunter-tab.js builds them; base/ui/hunter-panel.js wires them), in panel order: GU's
  // where MHFU has the row, labelled with MHFU's character creation words (f0019 section 1 594-598: GENDER, CLOTHING,
  // FACE, HAIRSTYLE, HAIR COLOR, in the menu's own case changed to the panel's). Clothing is CLOTHING's eight choices (READ 2026-10-19,
  // docs/app.js modelFor).
  hunterRows: [
    { kind: 'select', input: 'genderSel', label: 'Gender', options: [['f', 'Female'], ['m', 'Male']] },
    { kind: 'select', input: 'clothing', label: 'Clothing', title: 'What an empty chest, arms or legs slot shows' },
    { kind: 'select', input: 'faceStyle', label: 'Face' },
    { kind: 'select', input: 'hairStyle', label: 'Hairstyle' },
    { kind: 'colour', input: 'hairColor', label: 'Hair Color', title: 'The hair colour: any RGB colour, as the game saves it' },
    { kind: 'select', input: 'pose', label: 'Pose', options: [['', 'Bind Pose']] },
  ],
  // what Hunter Slots' New makes (its tooltip)
  hunterNewTitle: 'A new hunter: no armor, the first face and hairstyle, every Hunter option on its default',
  // GUILD INFO: THE NAME TAG over the hunter (READ 2026-10-19; the draw is 0x08835470, seen in a save state's village
  // frame). The name in the text palette's colour for the hunter's rank band -- the case byte is player +0x44BC, which
  // 0x0884FCB0 sets from the key quests cleared (0-8, shown as 1-9: Hunter Rank), and the cases pick text palette entries
  // 5, 6, 7, 2, 24, 23 (the palette 0x08931C5C, stored B G R) -- with a black copy 1 px down-right as its shadow, and the
  // weapon class's glyph 14 px to its left (docs/ui/plate-icons.png, scripts/build_viewer.py plate_icons). MHFU's Guild
  // Card has no title words, so no title rows.
  //   The glyph is drawn UNTINTED in game (white vertex colour): iconTint false; the name's edge is the black copy at
  // (+1, +1): shadow 'offset' (the base's options, 2026-10-19).
  guildInfo: {
    hrBands: [
      { hr: 1, max: 1, color: '#ffff50', label: 'HR 1' },
      { hr: 2, max: 2, color: '#ffa461', label: 'HR 2' },
      { hr: 3, max: 4, color: '#ff84ff', label: 'HR 3–4' },
      { hr: 5, max: 6, color: '#ff435d', label: 'HR 5–6' },
      { hr: 7, max: 8, color: '#ffc600', label: 'HR 7–8' },
      { hr: 9, max: 9, color: '#be84ff', label: 'HR 9' },
    ],
    titles: null,
    icons: 'ui/plate-icons.png?v=1',
    iconTint: false,
    shadow: 'offset',
    iconCell: 16,
    iconCells: { 'Great Sword': 0, 'Heavy Bowgun': 1, 'Hammer': 2, 'Lance': 3, 'Sword & Shield': 4, 'Light Bowgun': 5,
                 'Dual Blades': 6, 'Long Sword': 7, 'Hunting Horn': 8, 'Gunlance': 9, 'Bow': 10 },
    font: "'MHFU', 'Segoe UI', system-ui, sans-serif",
  },
  // PIGMENT (docs/base/ui/pigment.js): the five armour slots. MHFU colours an armour piece by its record's colour mode
  // (+0x13, READ 2026-10-19: 0x08851DBC -> the draw's 0x088CF094 per slot): 0 none, 1 a fixed grey 0x808080, 2 an
  // S-Series colour, 3 an X/Z-Series colour (the text's "Color: S-Series" / "X/Z-Series", f0019 section 1 414-416).
  // Which pieces take a colour is docs/adapter.js dyeable. The labels are this viewer's own: MHFU's text has no slot
  // words (none of Head / Chest / Arms / Waist / Legs in f0019).
  pigmentSlotLabels: { helm: 'Head', body: 'Chest', arm: 'Arms', wst: 'Waist', leg: 'Legs' },
  pigmentCloth: false,
  pigmentPalico: false,
  // no colour board: MHFU's own picker for an X/Z-Series piece's RGB is NOT read (the base still offers RGB...)
  pigmentBoard: null,
  // THE ARMOUR RAINBOW, read from the game's code: colour record index 11 (S-Series) or flag nibble 1 (X/Z-Series) takes
  // 0x088DCB00, which blends colour (t >> 4) & 7 of the eight at 0x089B669C into the next by (t & 15) / 16, rounding down,
  // capped at 255 -- the same eight colours as MH4U's and GU's. t is the u16 at [0x089CC558] +0x1C, which gains 1 per
  // game frame (0x08850FB8, which also rolls the play-time seconds every 30 of them): 30 units a second. The game gives
  // it no name (no colour words in f0019), so the tile carries none; a save holds the base's fixed key for it
  // (base/ui/pigment.js RB_KEY, 'rainbow').
  pigmentRainbow: { name: null, unitsPerColour: 16, unitsPerSecond: 30,
    table: [[227, 126, 237], [193, 159, 255], [154, 204, 241], [121, 229, 133], [189, 243, 102], [245, 236, 99],
            [240, 141, 92], [232, 120, 161]] },
  // no Deviant pigments in MHFU: the modal has one tab
  pigmentDeviants: false,
};
