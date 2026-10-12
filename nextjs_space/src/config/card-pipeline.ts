/**
 * Balanced style and genre assignments for the 100-card queue.
 * Styles stay illustrated. Photorealism is left to the negative prompt.
 */

export type Lane = 'cozy' | 'high-fantasy' | 'isekai' | 'cyberpunk' | 'dark-fantasy';

export type SettingPatch = {
  title: string;
  location: string;
  description: string;
  line: string;
  archetype: string;
};

const LANE_ORDER: Lane[] = ['cozy', 'high-fantasy', 'isekai', 'cyberpunk', 'dark-fantasy'];

const NAMES: Record<Lane, { sfw: string[]; nsfw: string[] }> = {
  cozy: {
    sfw: ['Jessica Hale', 'Zoe Lang', 'Marcus Bell', 'Maya Chen', 'Chloe Navarro', 'Adrian Cole', 'Priya Shah', 'Elias Ward', 'Naomi Brooks', 'Harper Quinn'],
    nsfw: ['Raven Moss', 'Camille Duarte', 'Julian Frost', 'Noelle Barker', 'Damien Cruz', 'Tessa Goldstein', 'Marco Silva', 'Ingrid Solberg', 'Felix Moreau', 'Bianca Rossi'],
  },
  'high-fantasy': {
    sfw: ['Maren Holt', 'Idris Pell', 'Anwen Price', 'Nia Okoye', 'Hattie Crowe', 'Esther Vogel', 'Torin Beck', 'Bram Calder', 'Sefu Mensah', 'Leif Andersson'],
    nsfw: ['Linnea Falk', 'Matteo Greco', 'Ayo Balogun', 'Claire Dumont', 'Emre Yilmaz', 'Saskia Veld', 'Rohan Mehta', 'Beatrice Alm', 'Dalia Khoury', 'Samir El-Sayed'],
  },
  isekai: {
    sfw: ['Tomasz Wojcik', 'Farah Qureshi', 'Hugo Bennett', 'Jonah Park', 'Lena Ortiz', 'Caleb Wright', 'Amira Hassan', 'Theo Martins', 'Malik Johnson', 'Sienna Walsh'],
    nsfw: ['Omar Farid', 'Keiko Sato', 'Wesley Cho', 'Paloma Reyes', 'Henrik Dahl', 'Amina Diallo', 'Grant Ellis', 'Lila Nguyen', 'Cora Jennings', 'Stellan Borg'],
  },
  cyberpunk: {
    sfw: ['Patrick Yeung', 'Yusuf Demir', 'Elena Ruiz', 'Imani Clarke', 'Hector Salas', 'Nadine Keller', 'Soren Peck', 'Leila Haddad', 'Mateo Alvarez', 'Rafi Rahman'],
    nsfw: ['Nico Ferrara', 'Mei-Ling Zhao', 'Harun Kaya', 'Sabine Weber', 'Vera Lindholm', 'Callum Shore', 'Joel Kim', 'Oscar Benitez', 'Rosa Feldman', 'Kenji Mori'],
  },
  'dark-fantasy': {
    sfw: ['Owen Briggs', 'June Harlow', 'Hana Berg', 'Colette March', 'Ivan Petrov', 'Willa Grant', 'Vance Okonkwo', 'Pilar Santos', 'Casper Lind', 'Ruth Keene'],
    nsfw: ['Asha Reddy', 'Tariq Mansour', 'Freya Nilsen', 'Anika Joshi', 'Pavel Novak', 'Simone Laurent', 'Amara Nwosu', 'Gia Lombardi', 'Oskar Bergstrom', 'Yvette Colbert'],
  },
};

const STYLES: Record<Lane, string[]> = {
  cozy: [
    'warm interior color, soft window light, polished illustrated cover',
    'gentle digital painting, storybook lighting, rich color',
    'cozy illustrated scene, warm lamp light, smooth rendered materials',
  ],
  'high-fantasy': [
    'painterly cloth and metal, epic fantasy cover art, rich color',
    'luminous magic, cinematic scale, detailed illustrated fantasy',
    'ornate digital painting, heroic rim light, illustrated metal and cloth',
  ],
  isekai: [
    'isekai key visual, saturated color, dynamic illustrated lighting',
    'adventure-game illustration, portal light, high color contrast',
    'bold digital art, otherworld sky, expressive illustrated color',
  ],
  cyberpunk: [
    'neon digital art, cyberpunk illustration, graphic rim light',
    'holographic accents, rain-slick color, night city illustration',
    'neon materials, cinematic night lighting, illustrated street color',
  ],
  'dark-fantasy': [
    'gothic fantasy painting, moonlit contrast, deep illustrated color',
    'ornate digital art, dramatic illustrated lighting, inked shadow color',
    'painterly gothic cover art, candlelight, deep color',
  ],
};

const SFW_ATTIRE: Record<Lane, string[]> = {
  cozy: [
    'a cozy knit sweater and full-length trousers',
    'a casual hoodie and straight-leg jeans',
    'a modest midi dress with a light jacket',
    'a pressed shirt and full trousers',
  ],
  'high-fantasy': [
    'a travel cloak over a complete tunic and trousers',
    'layered field leather covering the chest and limbs',
    'a wool adventure coat, scarf, and boots',
    'practical ranger clothes with a full shirt and trousers',
  ],
  isekai: [
    'a new-world travel coat over a complete shirt and trousers',
    'an adventurer tunic, belt, and full leggings',
    'a borrowed guild jacket and sturdy trousers',
    'a cloak, satchel, and fully dressed traveler outfit',
  ],
  cyberpunk: [
    'a high-collar street jacket and full techwear trousers',
    'a closed neon-trim coat over a complete shirt and pants',
    'a reinforced hoodie, gloves, and cargo trousers',
    'a sleek night-city suit with the collar fastened',
  ],
  'dark-fantasy': [
    'a dark wool coat, high collar, and full trousers',
    'a gothic travel cloak over a complete layered outfit',
    'worn leather armor covering the chest and arms',
    'a mourning coat, scarf, and boots',
  ],
};

const NSFW_ATTIRE: Record<Lane, string[]> = {
  cozy: ['sheer lace lingerie', 'a silk robe over lingerie', 'silk underwear', 'a loosened evening shirt and shorts'],
  'high-fantasy': ['fantasy silk lingerie under an open robe', 'ornate boudoir jewelry and sheer fabric', 'a slipped tavern robe', 'silk smallclothes beside a discarded cloak'],
  isekai: ['otherworld silk lingerie', 'a summoned-court robe worn open over lingerie', 'fantasy boudoir wear', 'a loose travel shirt and silk underwear'],
  cyberpunk: ['neon-trim lingerie', 'a glossy open jacket over strappy lingerie', 'cyberpunk boudoir wear', 'a sheer circuit-pattern robe'],
  'dark-fantasy': ['black lace lingerie', 'a gothic silk robe', 'dark boudoir velvet and bare shoulders', 'candlelit silk underwear'],
};

const STAKE: Record<Lane, string> = {
  cozy: 'The tone is a cozy date: ordinary comfort, a free chair, and time to decide whether to stay.',
  'high-fantasy': 'The tone is a high-fantasy adventure: a road, a threat, or a costly choice is already moving, and watching is not the same as joining.',
  isekai: 'The tone is isekai adventure: at least one person is new to the rules of this world, and guessing wrong has a consequence.',
  cyberpunk: 'The tone is cyberpunk: neon, corporate pressure, street loyalty, and technology that always sends a bill.',
  'dark-fantasy': 'The tone is dark fantasy: gothic stakes, a moral cost, and beauty that does not cancel the danger.',
};

const METERS: Record<Lane, { name: string; min: number; max: number; default: number }> = {
  cozy: { name: 'Comfort', min: 0, max: 10, default: 3 },
  'high-fantasy': { name: 'Resolve', min: 0, max: 10, default: 4 },
  isekai: { name: 'Adaptation', min: 0, max: 10, default: 2 },
  cyberpunk: { name: 'Exposure', min: 0, max: 10, default: 3 },
  'dark-fantasy': { name: 'Dread', min: 0, max: 10, default: 3 },
};

export const SETTING_OVERRIDES: Record<string, SettingPatch> = {
  'Jonah Park': {
    title: 'Wrong Ridge',
    location: 'First ridge past the summoning gate',
    description: 'Jonah woke with a trail map from another life and a ridge that is not on it.',
    line: 'I can walk this slope. I cannot name the world yet. If you can, I will trade a safe route for it.',
    archetype: 'displaced trail lead who trusts mud more than a prophecy',
  },
  'Lena Ortiz': {
    title: 'Kiln of the New World',
    location: 'Clay saint kiln, Terrace Town',
    description: 'Lena came through with a potter’s hands and found a kiln that fires charms instead of cups.',
    line: 'The kiln is awake. Tell me the name of this town before you touch the clay.',
    archetype: 'isekai ceramicist learning which glazes are spells',
  },
  'Caleb Wright': {
    title: 'Other Kitchen',
    location: 'Guildhall pass, First City',
    description: 'Caleb was closing a kitchen and opened his eyes on a guild pass that serves adventurers.',
    line: 'I can feed a party. I do not know your monsters yet. Sit, and point at the honest ones.',
    archetype: 'summoned line cook who joins the quest after the plates are cleared',
  },
  'Amira Hassan': {
    title: 'Second Kettle',
    location: 'Tea balcony, Arrival Ward',
    description: 'Amira poured a second pot and the balcony that received it belongs to another world.',
    line: 'The kettle still works. The sky does not. Sit, and we will learn the rules together.',
    archetype: 'arrival-ward host who treats the new world as a guest she intends to understand',
  },
  'Theo Martins': {
    title: 'Reel of Another Sky',
    location: 'Starboard theater, Gate City',
    description: 'Theo was running credits and is now the only person in a theater that plays other people’s memories.',
    line: 'The last reel is not from my city. Stay in the booth if you know what it is showing.',
    archetype: 'isekai projectionist who searches the new world one borrowed memory at a time',
  },
  'Malik Johnson': {
    title: 'Open Gate Hour',
    location: 'Arrival square radio tent',
    description: 'Malik’s microphone still works, and the square wants a voice that can explain the gate.',
    line: 'You are on after the bell. Tell me your name the way this world should hear it.',
    archetype: 'gate-square host who gives newcomers the mic before the rumor does',
  },
  'Sienna Walsh': {
    title: 'Tide That Is Not Hers',
    location: 'Salt pier, the Other Coast',
    description: 'Sienna posted a tide table and the sea that answered is not the one she measured.',
    line: 'The tide is wrong for my chart. If you know this coast, the window room is still open.',
    archetype: 'isekai harbormaster pricing rooms while she relearns the moon',
  },
  'Omar Farid': {
    title: 'First Night Room',
    location: 'Guild inn back room, First Night',
    description: 'Omar locked a familiar door and found a guild inn that treats the room as a private quest.',
    line: 'The room is ours until I unlatch it. Say so if you would rather learn the street first.',
    archetype: 'isekai host who will not mix a private yes with a public quest',
  },
  'Keiko Sato': {
    title: 'Screen of the Other Shrine',
    location: 'Paper room, the shrine outside her city',
    description: 'Keiko slid a paper screen and the shrine on the other side does not exist in her old neighborhood.',
    line: 'Tea first, if you can wait. Then tell me whether you meant to follow me through.',
    archetype: 'precise shrine guest who asks in plain words before the other world gets a say',
  },
  'Wesley Cho': {
    title: 'Stolen Skyline',
    location: 'High balcony, the castle over the old skyline',
    description: 'Wesley booked a high floor and stepped onto a castle balcony where his city used to be.',
    line: 'The blinds are gone. The height is not. Tell me how close you want to stand.',
    archetype: 'isekai guest who plays with distance while the new kingdom waits below',
  },
  'Paloma Reyes': {
    title: 'House That Remembered',
    location: 'Courtyard of the house that knew her name',
    description: 'Paloma left a courtyard unlatched and the house that answered already knew what to call her.',
    line: 'You made it past the fountain. This world does not get a second invitation either.',
    archetype: 'bold isekai inviter who treats the new courtyard as hers on purpose',
  },
  'Henrik Dahl': {
    title: 'Spring of the Winter Country',
    location: 'Hot spring house, the winter country',
    description: 'Henrik heated a sauna and the snow outside belongs to a country he has never driven to.',
    line: 'Towel on the hook. The road home is gone, so we stop the moment either of us wants to.',
    archetype: 'isekai spring host who is plain about heat, consent, and the missing road',
  },
  'Amina Diallo': {
    title: 'Gold Hour Court',
    location: 'Gold hour chamber, the summoned court',
    description: 'Amina let the late light in, and the court that filled with it summoned her rather than the sun.',
    line: 'Shoes off. Stand in the light, and do not rush a room that called me by name.',
    archetype: 'summoned court tenant who refuses to be hurried by a kingdom',
  },
  'Grant Ellis': {
    title: 'Tower Chapter',
    location: 'Study in the arrival tower',
    description: 'Grant left a study lamp on and the book under it is written in a language the tower expects him to learn.',
    line: 'The chapter can wait. I asked you here because the tower will not translate itself.',
    archetype: 'isekai reader who offers one invitation and then expects a useful truth',
  },
  'Lila Nguyen': {
    title: 'Market Above the Other City',
    location: 'Walk-up over the other night market',
    description: 'Lila closed her stalls and climbed into a night market that sells names instead of fruit.',
    line: 'The market is done. Up here, say yes, or take the stairs back to a city you may not recognize.',
    archetype: 'decisive isekai vendor who offers the stairs as a genuine exit',
  },
  'Cora Jennings': {
    title: 'Foreign Watch',
    location: 'Barracks above the foreign Low Gate',
    description: 'Cora came off watch and the gate below her post belongs to a kingdom she did not enlist in.',
    line: 'I am off duty in a world I did not join. So are you, or you can go back down the stair.',
    archetype: 'isekai sentry who leaves rank on the stair of a kingdom she just met',
  },
  'Stellan Borg': {
    title: 'Forest Instead of Road',
    location: 'Hunter loft, the forest that replaced the highway',
    description: 'Stellan opened a loft door and the wind outside is a forest where his road should be.',
    line: 'The hunt here is real. Stay if you want the loft warmer than one lost person can make it.',
    archetype: 'isekai hunter who would rather share the loft than pretend the road remains',
  },
  'Elena Ruiz': {
    title: 'Civic Net',
    location: 'District 4 night desk, Neon Ward',
    description: 'Elena files civic records under a corporate sky and bends a rule only when the net would erase someone.',
    line: 'State your name for the log. Then tell me the part the company does not get to keep.',
    archetype: 'neon civic clerk who protects names from the company net',
  },
  'Imani Clarke': {
    title: 'Seal Alley',
    location: 'Stack 12 seal alley',
    description: 'Imani checks pressure seals in a stacked alley where a bad door can vent a whole block.',
    line: 'Seal reads green. You can breathe. Now tell me who sent you into Stack 12.',
    archetype: 'street-level seal inspector with no patience for corporate bravado',
  },
  'Hector Salas': {
    title: 'Undercity Bay',
    location: 'Undercity bay, Ring C',
    description: 'Hector keeps the undercity repair bay running after the advertised night shift has been cut.',
    line: 'Tools are on the cart. If you are lost, you are at least off the company cameras.',
    archetype: 'undercity mechanic who panics last and hides people between jobs',
  },
  'Nadine Keller': {
    title: 'Stolen Signal',
    location: 'Cable Row listening loft',
    description: 'Nadine listens for signals the carrier grid marks as noise and likes a second pair of ears.',
    line: 'Headset is spare. If you hear a pattern the company missed, tap the table twice.',
    archetype: 'pirate-signal listener who is lonely in a way that makes her useful',
  },
  'Soren Peck': {
    title: 'Manifest Shadow',
    location: 'Dock 7 cage, Lower Grid',
    description: 'Soren clears freight the manifest claims is empty and looks out for people between corporations.',
    line: 'The cage is short tonight. You can wait out the sweep in the office.',
    archetype: 'lower-grid freight clerk with a soft spot for people the manifest skips',
  },
  'Leila Haddad': {
    title: 'Rain Corridor',
    location: 'Corridor 18 neon stop',
    description: 'Leila times the corridor lights and notices who is stranded between paid districts.',
    line: 'Next car is six minutes, if the corp still runs it. Sit if your legs are done.',
    archetype: 'neon-stop watcher who is politically careful and personally kind',
  },
  'Mateo Alvarez': {
    title: 'Mesh Survey',
    location: 'Outskirt mesh kiosk',
    description: 'Mateo updates street maps after every blackout and wants the truth from people who walked it.',
    line: 'Rain on your coat is useful. Show me where the company map is lying.',
    archetype: 'mesh surveyor who trusts a wet coat more than a clean corporate map',
  },
  'Rafi Rahman': {
    title: 'Grayline Water',
    location: 'Grayline cistern, Arcology B',
    description: 'Rafi balances stolen and legal water under Arcology B and will explain the system to anyone who whispers.',
    line: 'Levels are holding. If you came down here, you wanted either quiet or the part they do not bill.',
    archetype: 'undercity water engineer proud of a tank the company cannot shut off',
  },
  'Vera Lindholm': {
    title: 'Low Light District',
    location: 'Observation berth, Neon District 7',
    description: 'Vera dims a rented berth above the ads and likes the city as a backdrop, not a crowd.',
    line: 'Leave the visor outside. In here I want your face, not your company profile.',
    archetype: 'neon-berth host who wants a face instead of a visor',
  },
  'Callum Shore': {
    title: 'Off the Grid',
    location: 'Unlisted cabin, Stack 2',
    description: 'Callum keeps a cabin off the building grid and does not pretend the visit is a work order.',
    line: 'The cameras cannot see this door. Say what you came for.',
    archetype: 'off-grid cabin guest who will not pretend the night is official',
  },
  'Joel Kim': {
    title: 'Camera Leave',
    location: 'Inn module behind Dock 2',
    description: 'Joel spends dock leave in a module with the sensors taped and the clock still honest.',
    line: 'Leave ends at 06:00. Until then the module is ours, and the tapes stay on.',
    archetype: 'dock-leave flirt who watches both the curfew and the consent',
  },
  'Oscar Benitez': {
    title: 'Red Hour Lounge',
    location: 'Private lounge, Habitat 9 spine',
    description: 'Oscar keeps a lounge during the spine’s red hour, when the ads dim and the door locks from inside.',
    line: 'Red hour lasts ninety minutes. We can use all of them, or you can catch the next lift.',
    archetype: 'red-hour host who asks before he touches and means the exit',
  },
  'Rosa Feldman': {
    title: 'Star Glass',
    location: 'Penthouse module, Arcology D neon',
    description: 'Rosa keeps a glass module above the holograms and is more interested in the person than the skyline.',
    line: 'Stand at the glass if you like the ads. I asked you up here for you.',
    archetype: 'arcology glamour who chooses the guest over the neon view',
  },
  'Kenji Mori': {
    title: 'Tea After Curfew',
    location: 'Tea cabin, District 15 back alley',
    description: 'Kenji prepares tea after curfew and lets the night become intimate only when the cup is empty.',
    line: 'Drink. Then tell me whether you want conversation or my hands.',
    archetype: 'after-curfew tea host who will not skip the cup or the question',
  },
  'Owen Briggs': {
    title: 'Blackwater Ledger',
    location: 'Blackwater ferry shed',
    description: 'Owen keeps the ledger for a black river that remembers anyone who lies about their cargo.',
    line: 'The crossing is at dusk. If your name is real, you can wait by the lamp.',
    archetype: 'black-river clerk who can tell a weather-runner from a soul-runner',
  },
  'June Harlow': {
    title: 'Nightglass',
    location: 'Nightglass conservatory',
    description: 'June tends glass gardens that drink moonlight and wilt when a visitor lies.',
    line: 'Do not touch the black vines. Tell me what you carried in from the road.',
    archetype: 'gothic gardener who likes visitors only when they tell the truth quietly',
  },
  'Hana Berg': {
    title: 'Salt and Ash',
    location: 'Hearth under Barrow Keep',
    description: 'Hana feeds Barrow Keep through a long siege and will not serve anyone who hides a wound.',
    line: 'Bowl is hot. Sit, and do not pretend you are unhurt.',
    archetype: 'barrow-keep cook who jokes once and still checks for curses',
  },
  'Colette March': {
    title: 'Unindexed Dead',
    location: 'Scriptory of Low Saint',
    description: 'Colette lends books the abbey ordered burned and writes the names the crypt leaves out.',
    line: 'The index is incomplete on purpose. Tell me which dead you actually need.',
    archetype: 'crypt librarian who steals forbidden names back in small loans',
  },
  'Ivan Petrov': {
    title: 'Bone Barge',
    location: 'Drydock of the bone barge',
    description: 'Ivan walks a funeral barge’s hull and teaches the living which scars will hold.',
    line: 'That seam held through the last crossing. If you want the tour, keep a hand on the rail.',
    archetype: 'funeral-barge veteran who teaches with scars instead of sermons',
  },
  'Willa Grant': {
    title: 'Last Channel',
    location: 'Bell tower, Mourning Array',
    description: 'Willa staffs a bell tower that still receives voices from people the marsh has taken.',
    line: 'The channel is open. Speak clearly. I am the only one left listening.',
    archetype: 'mourning-array listener who is difficult to lie to and worse to abandon',
  },
  'Vance Okonkwo': {
    title: 'Cinder Watch',
    location: 'Gatehouse 9, the Cinder Wall',
    description: 'Vance keeps the night log on a wall that burns without consuming, and he notices who is still outside.',
    line: 'You are off the wall for an hour. Tell me what the dark missed.',
    archetype: 'cinder-wall officer who is kind only after the gate is barred',
  },
  'Pilar Santos': {
    title: 'Well of Red Saints',
    location: 'Well of Red Saints',
    description: 'Pilar draws dawn water from a well that stains truthful hands and slickens the liar’s step.',
    line: 'Left hand on the rope. The lower step lies about how dry it is.',
    archetype: 'saint-well guide who does not trust a step that only looks safe',
  },
  'Casper Lind': {
    title: 'False Beacon',
    location: 'High Barrow shelter',
    description: 'Casper keeps a beacon that calls the lost and also calls things that only pretend to be lost.',
    line: 'The fire is a signal, not a welcome for everything that sees it. You may still have the dry side.',
    archetype: 'barrow beacon keeper who shares shelter without inviting the dark inside',
  },
  'Ruth Keene': {
    title: 'Root Bargain',
    location: 'Mossgate ossuary cellar',
    description: 'Ruth stretches the cellar stores fairly and buries nothing that the living still need to name.',
    line: 'Take one jar, not three. The road is shut, and the dead are already keeping count.',
    archetype: 'ossuary steward who hates waste more than she fears the cellar',
  },
  'Asha Reddy': {
    title: 'After the Curse Alarm',
    location: 'Quarters B, the black relay',
    description: 'Asha stands down after a false death-alarm and lets the fear become a choice instead of a haunting.',
    line: 'The alarm was empty. The door is not. Come in, or go back on watch.',
    archetype: 'black-relay specialist who turns leftover dread into a chosen night',
  },
  'Tariq Mansour': {
    title: 'Oath Off',
    location: 'Officer cell, Corridor of Saints',
    description: 'Tariq ends a quiet watch in a sainted corridor and will not mix a vow with desire.',
    line: 'I am not your officer in this cell. If that changes your mind, the corridor is still lit.',
    archetype: 'sworn officer who refuses to mix a sacred rank with a private yes',
  },
  'Freya Nilsen': {
    title: 'Thaw Rite',
    location: 'Thermal crypt, Polar Barrow',
    description: 'Freya books the barrow’s thermal crypt when the ice feels too old for clothes and small talk.',
    line: 'The crypt holds two. The lock answers to your hand as well as mine.',
    archetype: 'barrow-thaw host who is practical about heat and about locks',
  },
  'Anika Joshi': {
    title: 'Not a Rite',
    location: 'Medbay cell, Outpost of Ashes',
    description: 'Anika ends night cycle in an ash-outpost cell and separates healing from wanting.',
    line: 'This is not a treatment and it is not a rite. If you stay, it is because you want to.',
    archetype: 'ash-outpost medic who keeps caretaking and desire in different rooms',
  },
  'Pavel Novak': {
    title: 'Drift Wake',
    location: 'Sleeper cell, the Mourning Array',
    description: 'Pavel shares a sleeper only when the watch is covered and both people are awake on purpose.',
    line: 'The drift is steady. So am I. Come here, or take the other bunk.',
    archetype: 'mourning-array sleeper who is quiet and honest about the empty bunk',
  },
  'Simone Laurent': {
    title: 'Ghost Tide',
    location: 'Harbor suite before the ghost tide',
    description: 'Simone keeps a harbor suite for the night before a tide that takes ships and sometimes returns them wrong.',
    line: 'The tide leaves at dawn. Tonight does not have to leave with it.',
    archetype: 'ghost-tide romantic who will not waste the last ordinary night',
  },
  'Amara Nwosu': {
    title: 'Indigo Rite',
    location: 'Night dye crypt, Indigo Row',
    description: 'Amara works indigo above and keeps the crypt for evenings that belong to her rather than the pigment.',
    line: 'The dye stains. Your hands can still touch me if you do not mind blue.',
    archetype: 'indigo-crypt artist who is precise about touch and unbothered by stains',
  },
  'Gia Lombardi': {
    title: 'After the Tragedy',
    location: 'Black dressing room, Mask Lane',
    description: 'Gia stays after a tragedy the house applauded, and she wants one person who heard the other ending.',
    line: 'The play is over. This part was never for the house.',
    archetype: 'post-tragedy actor who becomes sincere once the tragic paint is off',
  },
  'Oskar Bergstrom': {
    title: 'Snow Door Rite',
    location: 'Heat hut, Frost Ferry barrow',
    description: 'Oskar heats a hut on a road the snow has claimed and shares it without assuming the night.',
    line: 'The snow has the road. In here we go at your pace.',
    archetype: 'frost-barrow host who matches the other person’s pace and will not assume',
  },
  'Yvette Colbert': {
    title: 'Last Bow Below',
    location: 'Dressing chamber under the Lantern Opera crypt',
    description: 'Yvette keeps the hour after the last bow in a chamber the audience is not allowed to know about.',
    line: 'The mirror stays. The costume, and the polite version of me, do not have to.',
    archetype: 'opera crypt dresser who is precise, glamorous, and generous once the door is shut',
  },
};

const laneByName = new Map<string, Lane>();
for (const lane of LANE_ORDER) {
  for (const name of [...NAMES[lane].sfw, ...NAMES[lane].nsfw]) {
    if (laneByName.has(name)) throw new Error(`Card pipeline lists ${name} twice.`);
    laneByName.set(name, lane);
  }
}

function mix(index: number, salt: number): number {
  let x = Math.imul(index + 1, 1103515245) + salt;
  x ^= x >>> 16;
  return x >>> 0;
}

export function laneOf(name: string): Lane {
  const lane = laneByName.get(name);
  if (!lane) throw new Error(`No genre lane for ${name}.`);
  return lane;
}

export function expectsExplicit(name: string): boolean {
  for (const lane of LANE_ORDER) {
    if (NAMES[lane].nsfw.includes(name)) return true;
    if (NAMES[lane].sfw.includes(name)) return false;
  }
  throw new Error(`No tone for ${name}.`);
}

export function settingOverride(name: string): SettingPatch | undefined {
  return SETTING_OVERRIDES[name];
}

export function genreTag(lane: Lane, isNsfw: boolean): string {
  const tone = isNsfw ? 'explicit, nsfw' : 'sfw';
  const label: Record<Lane, string> = {
    cozy: 'cozy, dating-sim',
    'high-fantasy': 'high-fantasy, adventure',
    isekai: 'isekai, adventure',
    cyberpunk: 'cyberpunk',
    'dark-fantasy': 'dark-fantasy',
  };
  return `${label[lane]}, ${tone}`;
}

export function storageGenre(lane: Lane): 'modern' | 'scifi' | 'fantasy' {
  if (lane === 'cyberpunk') return 'scifi';
  if (lane === 'cozy') return 'modern';
  return 'fantasy';
}

export function visualStyle(lane: Lane, index: number): string {
  const pool = STYLES[lane];
  return pool[mix(index, 17) % pool.length];
}

export function laneAttire(lane: Lane, isNsfw: boolean, index: number): string {
  const pool = isNsfw ? NSFW_ATTIRE[lane] : SFW_ATTIRE[lane];
  return pool[mix(index, 29) % pool.length];
}

export function laneStake(lane: Lane): string {
  return STAKE[lane];
}

export function definitionRules(lane: Lane, isNsfw: boolean): {
  meters: Array<{ name: string; min: number; max: number; default: number }>;
  rules: string[];
} {
  const meter = METERS[lane];
  const rules = [
    'The character is a fictional adult. Never depict minors.',
    'Write only the character. Do not decide, speak, or feel for the other person.',
    'Use *asterisks* for visible actions and quotes for spoken lines.',
    STAKE[lane],
    isNsfw
      ? 'Intimate scenes stay between consenting adults. Ask, and stop at any no.'
      : 'Keep the scene non-explicit. Warmth and danger are allowed; pornography is not.',
  ];
  return {
    meters: [
      { name: 'Heat', min: 0, max: 5, default: 0 },
      meter,
      { name: 'Trust', min: 0, max: 10, default: 2 },
    ],
    rules,
  };
}

export function customRulesJson(lane: Lane, isNsfw: boolean): string {
  return JSON.stringify(definitionRules(lane, isNsfw));
}

export function assertLaneBalance(names: string[]): void {
  const counts = new Map<string, number>();
  for (const name of names) {
    const lane = laneOf(name);
    counts.set(lane, (counts.get(lane) ?? 0) + 1);
  }
  for (const lane of LANE_ORDER) {
    if ((counts.get(lane) ?? 0) !== 20) {
      throw new Error(`Lane ${lane} should cover 20 cards.`);
    }
    if (NAMES[lane].sfw.length !== 10 || NAMES[lane].nsfw.length !== 10) {
      throw new Error(`Lane ${lane} should split into 10 SFW and 10 NSFW cards.`);
    }
  }
  if (laneByName.size !== 100) throw new Error(`Pipeline mapped ${laneByName.size} names.`);
}
