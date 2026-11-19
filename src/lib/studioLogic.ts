import type {
  BgmMood,
  DailyAutomationConfig,
  IncomeEntry,
  StoryPacingMode,
  StoryProject,
  StoryScene,
  StoryTopic,
  TransitionEffect,
  VideoFormat,
  VoiceTone,
} from './types';

export interface TopicConfig {
  id: StoryTopic;
  label: string;
  labelHindi: string;
  defaultImage: string;
  defaultTone: VoiceTone;
  defaultBgm: BgmMood;
  accentHex: string;
  overlayTint: string;
  particleType: 'embers' | 'fog' | 'fireflies' | 'starlight';
}

export const TOPIC_ANIME_GALLERY: Record<StoryTopic, string[]> = {
  krishna: [
    '/src/assets/images/anime_krishna_hook_1794827342983.jpg',
    '/src/assets/images/anime_krishna_setup_1794827675831.jpg',
    '/src/assets/images/anime_krishna_climax_1794827343532.jpg',
    '/src/assets/images/anime_krishna_ending_1794827344681.jpg',
    '/src/assets/images/anime_krishna_kaliya_naag_1795002635476.jpg',
    '/src/assets/images/anime_krishna_govardhan_mountain_1794831871035.jpg',
    '/src/assets/images/anime_krishna_sudama_embrace_1794831872267.jpg',
    '/src/assets/images/anime_krishna_kansa_sabha_1795002636085.jpg',
  ],
  ramayana: [
    '/src/assets/images/anime_ramayana_hook_1794827344931.jpg',
    '/src/assets/images/anime_ramayana_setup_1794827677132.jpg',
    '/src/assets/images/anime_ramayana_climax_1794827345453.jpg',
    '/src/assets/images/anime_ramayana_ending_1794827359586.jpg',
    '/src/assets/images/anime_ramayana_golden_deer_1795002628507.jpg',
    '/src/assets/images/anime_ramayana_shiva_bow_1795002629511.jpg',
    '/src/assets/images/anime_ramayana_jatayu_sky_1795002656902.jpg',
    '/src/assets/images/anime_ramayana_setu_bridge_1795002629873.jpg',
    '/src/assets/images/anime_ramayana_hanuman_flight_1794831873071.jpg',
    '/src/assets/images/anime_ramayana_ravana_battle_1795002630164.jpg',
  ],
  mahabharata: [
    '/src/assets/images/anime_mahabharata_hook_1794827359988.jpg',
    '/src/assets/images/anime_mahabharata_setup_1794827676653.jpg',
    '/src/assets/images/anime_mahabharata_climax_1794827360382.jpg',
    '/src/assets/images/anime_mahabharata_ending_1794827361263.jpg',
    '/src/assets/images/anime_mahabharata_dice_hall_1795002672096.jpg',
    '/src/assets/images/anime_mahabharata_draupadi_1795002631065.jpg',
    '/src/assets/images/anime_mahabharata_abhimanyu_1795002630579.jpg',
    '/src/assets/images/anime_mahabharata_karna_wheel_1795002630112.jpg',
    '/src/assets/images/anime_mahabharata_vishwaroop_1795002655870.jpg',
    '/src/assets/images/anime_mahabharata_bhishma_arrows_1795002654205.jpg',
  ],
  horror: [
    '/src/assets/images/anime_horror_hook_1794827377407.jpg',
    '/src/assets/images/anime_horror_setup_1794827677336.jpg',
    '/src/assets/images/anime_horror_climax_1794827376398.jpg',
    '/src/assets/images/anime_horror_ending_1794827377287.jpg',
    '/src/assets/images/anime_horror_banyan_tree_1794831843395.jpg',
    '/src/assets/images/anime_horror_haunted_well_1795002633417.jpg',
    '/src/assets/images/anime_horror_midnight_station_1795002634040.jpg',
    '/src/assets/images/anime_horror_whispering_mirror_1795002634628.jpg',
    '/src/assets/images/anime_horror_temple_midnight_1795002673130.jpg',
    '/src/assets/images/anime_horror_ritual_circle_1795002672771.jpg',
  ],
  hindu_gods: [
    '/src/assets/images/anime_shiva_hook_1794827361806.jpg',
    '/src/assets/images/anime_gods_setup_1794827677665.jpg',
    '/src/assets/images/anime_gods_climax_1794827376070.jpg',
    '/src/assets/images/anime_gods_ending_1794827376902.jpg',
    '/src/assets/images/anime_shiva_tandav_1795002632373.jpg',
    '/src/assets/images/anime_maa_durga_shakti_1795002633055.jpg',
    '/src/assets/images/anime_narasimha_pillar_1795002632952.jpg',
    '/src/assets/images/anime_gods_ganesha_wisdom_1795002656414.jpg',
    '/src/assets/images/anime_gods_samudra_manthan_1795002656810.jpg',
  ],
};

export function getTopicAnimeGallery(topic: StoryTopic): string[] {
  return TOPIC_ANIME_GALLERY[topic] ?? TOPIC_ANIME_GALLERY.krishna;
}

export function resolveTopicAnimeSceneImage(
  topic: StoryTopic,
  sceneIndex: number,
  totalScenes: number,
  shuffleOffset = 0
): string {
  const gallery = getTopicAnimeGallery(topic);
  if (shuffleOffset > 0) {
    return gallery[(sceneIndex + shuffleOffset) % gallery.length];
  }
  if (sceneIndex === 0) return gallery[0];
  if (sceneIndex >= totalScenes - 1) return gallery[3 % gallery.length];
  if (totalScenes <= 3) return gallery[2 % gallery.length];
  const midPool = gallery.length > 4 ? [gallery[1], ...gallery.slice(4), gallery[2]] : [gallery[1], gallery[2]];
  return midPool[(sceneIndex - 1) % midPool.length];
}

export interface SceneArtAsset {
  id: string;
  url: string;
  topic: StoryTopic;
  label: string;
  description: string;
  keywords: string[];
  shotTypes: Array<'character_hook' | 'wide_establishing' | 'climax_closeup' | 'resolution_vista'>;
}

export const SCENE_ART_CATALOG: SceneArtAsset[] = [
  // Krishna & Bal Leela
  {
    id: 'krishna_fruit_seller',
    url: '/src/assets/images/anime_krishna_fruit_seller_1794831817425.jpg',
    topic: 'krishna',
    label: 'Fruit Seller & Mango Basket',
    description: 'Elderly humble village fruit seller woman sitting beside a woven basket of fresh mangoes and berries in Vrindavan lane',
    keywords: [
      'fruit seller', 'fruit-selling', 'fruits', 'mango', 'mangoes', 'berries', 'elderly woman',
      'poor woman', 'weeping', 'falwali', 'फलवाली', 'फल', 'बेर', 'आम', 'टोकरी', 'मैया', 'गरीब',
    ],
    shotTypes: ['character_hook', 'wide_establishing'],
  },
  {
    id: 'krishna_toddler_rice',
    url: '/src/assets/images/anime_bal_krishna_rice_1794831820043.jpg',
    topic: 'krishna',
    label: 'Bal Krishna Running With Rice',
    description: 'Cute toddler blue-skinned Bal Krishna running barefoot holding white rice grains cupped in tiny palms',
    keywords: [
      'rice', 'grains', 'rice grains', 'cupped', 'tiny hands', 'tiny palms', 'running joyfully',
      'चावल', 'अनाज', 'मुट्ठी', 'दौड़े', 'chawal',
    ],
    shotTypes: ['character_hook', 'wide_establishing'],
  },
  {
    id: 'krishna_diamonds_basket',
    url: '/src/assets/images/anime_basket_diamonds_miracle_1794831819765.jpg',
    topic: 'krishna',
    label: 'Basket Overflowing With Diamonds',
    description: 'Woven bamboo basket magically overflowing with sparkling diamonds, rubies, gold and golden aura light',
    keywords: [
      'diamond', 'diamonds', 'jewel', 'jewels', 'rubies', 'gold coins', 'treasure', 'overflowing',
      'transform', 'glowing', 'miracle', 'हीरे', 'हीरों', 'रत्न', 'सोना', 'मोती', 'चमक उठी', 'खज़ाना', 'टोकरी',
    ],
    shotTypes: ['climax_closeup', 'resolution_vista'],
  },
  {
    id: 'krishna_fruit_blessing',
    url: '/src/assets/images/anime_fruit_seller_blessing_1794831844479.jpg',
    topic: 'krishna',
    label: 'Fruit Seller Bowing to Bal Krishna',
    description: 'Elderly fruit seller woman bowing with folded hands and joyful tears while little Krishna holds golden mangoes',
    keywords: [
      'bowing', 'folded hands', 'tears of joy', 'devotion', 'fruit seller', 'blessings', 'namaste',
      'smiling warmly', 'भक्ति', 'झुक', 'प्रेम', 'प्रभु', 'जय श्री कृष्ण', 'आशीर्वाद', 'मैया', 'फल',
    ],
    shotTypes: ['resolution_vista', 'climax_closeup'],
  },
  {
    id: 'krishna_yashoda_churning',
    url: '/src/assets/images/anime_yashoda_makhan_court_1794831821189.jpg',
    topic: 'krishna',
    label: 'Mother Yashoda Churning Butter',
    description: 'Mother Yashoda churning curd in earthen pot in sunlit Gokul courtyard while toddler Krishna tugs her saree',
    keywords: [
      'yashoda', 'mother', 'churning', 'curd', 'butter', 'gokul', 'courtyard', 'tugging', 'saree',
      'यशोदा', 'माँ', 'दही', 'मथ', 'माखन', 'गोद', 'आँगन', 'गोकुल',
    ],
    shotTypes: ['wide_establishing', 'character_hook'],
  },
  {
    id: 'krishna_broken_pot',
    url: '/src/assets/images/anime_broken_butter_pot_1794831821651.jpg',
    topic: 'krishna',
    label: 'Shattered Clay Pot & Weeping Kanha',
    description: 'Broken earthen terracotta pot splashing white curd/makhan beside pouting tearful toddler Bal Krishna',
    keywords: [
      'broken pot', 'clay pot', 'shattering', 'shattered', 'splashing', 'makhan', 'curd', 'butter',
      'pouting', 'puffed cheeks', 'angry', 'matka', 'ghada', 'मटका', 'घड़ा', 'फोड़', 'फूट', 'टूटा', 'क्रोध', 'गुस्सा', 'रूठे',
    ],
    shotTypes: ['climax_closeup', 'character_hook'],
  },
  {
    id: 'krishna_yashoda_hug',
    url: '/src/assets/images/anime_yashoda_hug_krishna_1794831846149.jpg',
    topic: 'krishna',
    label: 'Mother Yashoda Hugging Bal Krishna',
    description: 'Mother Yashoda kneeling and lovingly hugging weeping toddler Bal Krishna and wiping tears with golden glow',
    keywords: [
      'hugging', 'hug', 'wiping', 'tears', 'mother', 'yashoda', 'comforting', 'gokul', 'love',
      'गले', 'लगाया', 'आँसू', 'पोंछे', 'माँ', 'यशोदा', 'प्रेम',
    ],
    shotTypes: ['resolution_vista', 'climax_closeup'],
  },
  {
    id: 'krishna_crying_flute',
    url: '/src/assets/images/anime_krishna_tears_flute_1794831846206.jpg',
    topic: 'krishna',
    label: 'Tearful Krishna Holding Flute',
    description: 'Emotional close-up of Lord Krishna with glistening tears gripping his golden bamboo flute in misty forest',
    keywords: [
      'tears glistening', 'crying', 'sorrow', 'gripping', 'holding tightly', 'dimly lit', 'emotional',
      'sad', 'आँसू', 'दुख', 'आंखें', 'भावुक', 'तोड़ दिया', 'बांसुरी',
    ],
    shotTypes: ['character_hook', 'climax_closeup'],
  },
  {
    id: 'krishna_broken_flute',
    url: '/src/assets/images/anime_krishna_broken_flute_1794831819868.jpg',
    topic: 'krishna',
    label: 'Broken Flute on Mossy Stone',
    description: 'Snapped broken bamboo flute resting on mossy dark stone with white kadamba blossoms under starry twilight',
    keywords: [
      'broken flute', 'snapped', 'splinters', 'striking', 'mossy stone', 'rock', 'kadamba',
      'fallen blossoms', 'तोड़ दी', 'टूट गई', 'तोड़ी', 'चट्टान', 'कदम', 'बांसुरी', 'पटक',
    ],
    shotTypes: ['climax_closeup', 'resolution_vista'],
  },
  {
    id: 'krishna_radha_farewell',
    url: '/src/assets/images/anime_radha_farewell_yamuna_1794831870783.jpg',
    topic: 'krishna',
    label: 'Radha Looking Back at Yamuna Sunset',
    description: 'Graceful Radha in silk saree standing by twilight Yamuna riverbank looking back in tearful sorrow',
    keywords: [
      'radha', 'farewell', 'departing', 'looking back', 'riverbank', 'sunset', 'saree', 'sorrow',
      'राधा', 'राधा रानी', 'विदा', 'यमुना', 'तट', 'विरह',
    ],
    shotTypes: ['wide_establishing', 'climax_closeup'],
  },
  {
    id: 'krishna_sudama_embrace',
    url: '/src/assets/images/anime_krishna_sudama_embrace_1794831872267.jpg',
    topic: 'krishna',
    label: 'Krishna Embracing Poor Friend Sudama',
    description: 'Royal Lord Krishna inside golden Dwarka palace embracing humble barefoot Sudama carrying a rice cloth bundle',
    keywords: [
      'sudama', 'dwarka', 'palace', 'friend', 'friendship', 'potli', 'brahmin', 'embrace', 'tandul',
      'सुदामा', 'द्वारका', 'मित्र', 'दोस्त', 'पोटली', 'महल', 'चावल',
    ],
    shotTypes: ['climax_closeup', 'resolution_vista'],
  },
  {
    id: 'krishna_govardhan',
    url: '/src/assets/images/anime_krishna_govardhan_mountain_1794831871035.jpg',
    topic: 'krishna',
    label: 'Krishna Lifting Govardhan Mountain',
    description: 'Lord Krishna lifting giant Govardhan mountain on one little finger above villagers and cows in storm rain',
    keywords: [
      'govardhan', 'mountain', 'hill', 'lifting', 'little finger', 'indra', 'storm', 'rain', 'lightning',
      'गोवर्धन', 'पर्वत', 'पहाड़', 'उंगली', 'इंद्र', 'बारिश', 'तूफान',
    ],
    shotTypes: ['climax_closeup', 'wide_establishing'],
  },
  {
    id: 'krishna_flute_yamuna',
    url: '/src/assets/images/anime_krishna_hook_1794827342983.jpg',
    topic: 'krishna',
    label: 'Krishna Playing Flute by Yamuna',
    description: 'Young Lord Krishna with peacock feather playing glowing golden flute beside moonlit Yamuna river',
    keywords: [
      'playing flute', 'bansuri', 'melody', 'music', 'yamuna', 'moonlit', 'ripples', 'music magic',
      'बांसुरी', 'मधुर', 'धुन', 'तान', 'यमुना', 'शाम', 'कन्हैया',
    ],
    shotTypes: ['character_hook'],
  },
  {
    id: 'krishna_vrindavan_path',
    url: '/src/assets/images/anime_krishna_setup_1794827675831.jpg',
    topic: 'krishna',
    label: 'Vrindavan Twilight Path & Gopis',
    description: 'Calm twilight Vrindavan garden path with cows, gopis, lanterns and blossoming trees',
    keywords: [
      'gopis', 'cows', 'vrindavan', 'twilight', 'garden', 'village', 'devotees', 'lanterns',
      'गोपियां', 'गाय', 'वृंदावन', 'ग्वाल', 'शाम', 'गलियों',
    ],
    shotTypes: ['wide_establishing'],
  },
  {
    id: 'krishna_offering_flute',
    url: '/src/assets/images/anime_krishna_climax_1794827343532.jpg',
    topic: 'krishna',
    label: 'Krishna Offering Glowing Flute',
    description: 'Lord Krishna gently offering or relinquishing his radiant golden flute beneath sacred kadamba tree',
    keywords: [
      'offering flute', 'relinquish', 'mathura', 'duty', 'sacrifice', 'kadamba', 'handing over',
      'सौंप', 'त्याग', 'कर्तव्य', 'मथुरा', 'धरोहर', 'बांसुरी',
    ],
    shotTypes: ['climax_closeup'],
  },
  {
    id: 'krishna_radha_lotus_finale',
    url: '/src/assets/images/anime_krishna_ending_1794827344681.jpg',
    topic: 'krishna',
    label: 'Radha-Krishna Radiant Lotus Dusk',
    description: 'Serene glowing silhouettes of Radha and Krishna amidst floating lotus diyas and golden fireflies',
    keywords: [
      'radha krishna', 'eternal love', 'lotus', 'fireflies', 'starry sky', 'bliss', 'peaceful',
      'राधा', 'अमर प्रेम', 'अंतिम', 'भक्ति', 'दिव्य', 'त्याग',
    ],
    shotTypes: ['resolution_vista'],
  },
  {
    id: 'krishna_kaliya_naag',
    url: '/src/assets/images/anime_krishna_kaliya_naag_1795002635476.jpg',
    topic: 'krishna',
    label: 'Bal Krishna Dancing on Kaliya Naag',
    description: 'Fearless young Krishna dancing atop giant multi-headed serpent Kaliya in swirling glowing Yamuna river',
    keywords: [
      'kaliya', 'serpent', 'snake', 'cobra', 'naag', 'hood', 'poison', 'dancing on snake', 'yamuna water',
      'कालिया', 'नाग', 'फन', 'सर्प', 'सांप', 'नाच', 'नृत्य', 'यमुना', 'ज़हर',
    ],
    shotTypes: ['climax_closeup', 'character_hook'],
  },
  {
    id: 'krishna_kansa_sabha',
    url: '/src/assets/images/anime_krishna_kansa_sabha_1795002636085.jpg',
    topic: 'krishna',
    label: 'Krishna Confronting King Kansa in Arena',
    description: 'Heroic young Krishna leaping toward tyrannical King Kansa on elevated throne amidst lightning in Mathura arena',
    keywords: [
      'kansa', 'kans', 'mathura', 'arena', 'throne', 'demon king', 'leaping', 'lightning', 'dhanush', 'justice',
      'कंस', 'मथुरा', 'सिंहासन', 'अखाड़ा', 'सभा', 'वध', 'अत्याचार', 'न्याय',
    ],
    shotTypes: ['climax_closeup', 'wide_establishing'],
  },

  // Horror & Indian Folklore
  {
    id: 'horror_banyan_tree',
    url: '/src/assets/images/anime_horror_banyan_tree_1794831843395.jpg',
    topic: 'horror',
    label: 'Haunted Ancient Banyan Tree',
    description: 'Colossal 100-year-old cursed Indian banyan tree (bargad) with hanging aerial roots on deserted foggy village road',
    keywords: [
      'banyan', 'bargad', 'old tree', 'hanging roots', 'aerial roots', 'village road', 'sunset',
      'बरगद', 'पेड़', 'जड़ों', 'जटाओं', 'गाँव', 'खूनी बरगद', 'खौफनाक',
    ],
    shotTypes: ['character_hook', 'wide_establishing'],
  },
  {
    id: 'horror_banyan_shadow',
    url: '/src/assets/images/anime_horror_banyan_shadow_1794831845140.jpg',
    topic: 'horror',
    label: 'Red-Eyed Shadow Hanging in Banyan',
    description: 'Low-angle horror shot of terrified traveler looking up at upside-down shadowy figure with glowing red eyes in banyan branches',
    keywords: [
      'upside down', 'red eyes', 'glowing eyes', 'banyan', 'branches', 'shadowy figure', 'traveler',
      'staring', 'horrified', 'उल्टी लटकी', 'लाल आँखों', 'काली परछाईं', 'घूर', 'जटाओं', 'मुसाफिर',
    ],
    shotTypes: ['climax_closeup'],
  },
  {
    id: 'horror_banyan_sandals',
    url: '/src/assets/images/anime_horror_banyan_sandals_1794831844981.jpg',
    topic: 'horror',
    label: 'Abandoned Sandals Under Banyan Roots',
    description: 'Chilling foggy dawn under cursed banyan tree roots with abandoned sandals left behind beside dark stains',
    keywords: [
      'sandals', 'slippers', 'chappal', 'abandoned', 'early morning', 'foggy dawn', 'blood', 'vanished',
      'चप्पल', 'चप्पलें', 'खून', 'गायब', 'सुबह', 'जड़ों', 'लापता',
    ],
    shotTypes: ['resolution_vista'],
  },
  {
    id: 'horror_haveli_lantern',
    url: '/src/assets/images/anime_horror_hook_1794827377407.jpg',
    topic: 'horror',
    label: 'Haunted Haveli & Brass Lantern',
    description: 'Explorer holding flickering brass lantern outside misty stone Rajasthani haveli gate at midnight',
    keywords: [
      'haveli', 'mansion', 'fort', 'bhangarh', 'gate', 'archway', 'brass lantern', 'amavasya',
      'हवेली', 'लालटेन', 'अमावस्या', 'दरवाज़ा', 'किला', 'रात 12',
    ],
    shotTypes: ['character_hook'],
  },
  {
    id: 'horror_mist_forest',
    url: '/src/assets/images/anime_horror_setup_1794827677336.jpg',
    topic: 'horror',
    label: 'Foggy Midnight Forest & Ruins',
    description: 'Cold midnight mist drifting across lonely trees and crumbling dark Indian ruins under moonlight',
    keywords: [
      'sleeping under', 'midnight forest', 'mist', 'fog', 'whispering', 'traveler', 'creeping',
      'moonlight', 'deserted road', 'अंधेरा', 'कोहरा', 'फुसफुसाहट', 'आवाजें', 'सुनसान', 'जंगल', 'मुसाफिर',
    ],
    shotTypes: ['wide_establishing'],
  },
  {
    id: 'horror_haveli_corridor',
    url: '/src/assets/images/anime_horror_climax_1794827376398.jpg',
    topic: 'horror',
    label: 'Ghostly Corridor Door Slamming',
    description: 'Haunted dark wooden corridor door slamming shut amidst spectral blue mist and footsteps',
    keywords: [
      'corridor', 'wooden door', 'slamming', 'staircase', 'footsteps', 'hallway', 'ghost', 'locked',
      'कमरा', 'दरवाज़ा बंद', 'सीढ़ियां', 'कदमों', 'हवेली', 'परछाईं', 'भूत',
    ],
    shotTypes: ['climax_closeup'],
  },
  {
    id: 'horror_camera_window',
    url: '/src/assets/images/anime_horror_ending_1794827377287.jpg',
    topic: 'horror',
    label: 'Abandoned Camera Below Ghost Window',
    description: 'Abandoned vintage camera and lantern glowing below haunted upstairs haveli window at dawn',
    keywords: [
      'camera', 'photo', 'photograph', 'reflection', 'window', 'dawn', 'कैमरा', 'तस्वीर', 'फोटो', 'खिड़की',
    ],
    shotTypes: ['resolution_vista'],
  },
  {
    id: 'horror_haunted_well',
    url: '/src/assets/images/anime_horror_haunted_well_1795002633417.jpg',
    topic: 'horror',
    label: 'Haunted Village Well Under Full Moon',
    description: 'Ancient moss-covered village stone well with eerie ghostly silhouette rising out of dark mist under moon',
    keywords: [
      'well', 'kuan', 'water', 'drowned', 'village well', 'full moon', 'ghost rising', 'कुआं', 'कुएं', 'कुआँ', 'पानी', 'चीख', 'गाँव',
    ],
    shotTypes: ['character_hook', 'climax_closeup'],
  },
  {
    id: 'horror_midnight_station',
    url: '/src/assets/images/anime_horror_midnight_station_1795002634040.jpg',
    topic: 'horror',
    label: 'Deserted Midnight Railway Station',
    description: 'Foggy empty rural railway platform under flickering amber lamp with dark silhouette down wet train tracks',
    keywords: [
      'railway', 'station', 'train', 'platform', 'tracks', 'last train', 'foggy lamp', 'स्टेशन', 'रेलवे', 'ट्रेन', 'पटरी', 'प्लेटफॉर्म', 'अंतिम गाड़ी',
    ],
    shotTypes: ['character_hook', 'wide_establishing'],
  },
  {
    id: 'horror_whispering_mirror',
    url: '/src/assets/images/anime_horror_whispering_mirror_1795002634628.jpg',
    topic: 'horror',
    label: 'Possessed Mirror Reflection Shock',
    description: 'Antique candlelit mirror revealing sinister smiling ghost behind terrified young man inside reflection',
    keywords: [
      'mirror', 'reflection', 'glass', 'bedroom', 'candle', 'smiling behind', 'aaina', 'sheesha', 'आईना', 'शीशा', 'दर्पण', 'प्रतिबिंब', 'पीछे', 'मुस्कान',
    ],
    shotTypes: ['climax_closeup', 'character_hook'],
  },
  {
    id: 'horror_temple_midnight',
    url: '/src/assets/images/anime_horror_temple_midnight_1795002673130.jpg',
    topic: 'horror',
    label: 'Cursed Ruined Forest Temple at Night',
    description: 'Abandoned ancient stone temple deep in misty dark forest with solitary flickering diya on mossy steps',
    keywords: [
      'ruined temple', 'abandoned temple', 'forest temple', 'curse', 'diya', 'steps', 'खंडहर', 'शरापित', 'पुराना मंदिर', 'जंगल', 'दीया',
    ],
    shotTypes: ['wide_establishing', 'character_hook'],
  },
  {
    id: 'horror_ritual_circle',
    url: '/src/assets/images/anime_horror_ritual_circle_1795002672771.jpg',
    topic: 'horror',
    label: 'Midnight Crimson Ritual Circle & Diyas',
    description: 'Dark courtyard with glowing red ash ritual mandala surrounded by flickering diyas and dark shadow wisps',
    keywords: [
      'ritual', 'tantrik', 'circle', 'spell', 'black magic', 'diyas', 'shadow', 'curse', 'तांत्रिक', 'काला जादू', 'मंत्र', 'घेरा', 'साया', 'अमावस्या',
    ],
    shotTypes: ['climax_closeup', 'resolution_vista'],
  },

  // Ramayana
  {
    id: 'ramayana_rama_portrait',
    url: '/src/assets/images/anime_ramayana_hook_1794827344931.jpg',
    topic: 'ramayana',
    label: 'Prince Rama Along Sacred River',
    description: 'Noble Prince Rama with golden bow along sunlit forest river ghat',
    keywords: [
      'rama', 'ram', 'prince', 'bow', 'exile', 'vanvas', 'ayodhya', 'sita', 'lakshmana',
      'राम', 'श्री राम', 'सीता', 'लक्ष्मण', 'वनवास', 'धनुष', 'अयोध्या',
    ],
    shotTypes: ['character_hook'],
  },
  {
    id: 'ramayana_exile_forest',
    url: '/src/assets/images/anime_ramayana_setup_1794827677132.jpg',
    topic: 'ramayana',
    label: 'Rama, Sita & Lakshmana Forest Walk',
    description: 'Rama, Sita and Lakshmana walking tranquil saffron forest trail toward river',
    keywords: [
      'forest path', 'forest trail', 'forest', 'exile', 'walking', 'chitrakoot', 'panchavati', 'dandakaranya',
      'वन', 'जंगल', 'राह', 'दंडकारण्य', 'वनवास',
    ],
    shotTypes: ['wide_establishing'],
  },
  {
    id: 'ramayana_kevat_boat',
    url: '/src/assets/images/anime_ramayana_climax_1794827345453.jpg',
    topic: 'ramayana',
    label: 'Boatman Kevat Washing Rama Feet',
    description: 'Devoted boatman Kevat bowing beside wooden river boat along sparkling Ganga waves',
    keywords: [
      'kevat', 'boat', 'boatman', 'wash feet', 'river', 'ganga', 'ferry', 'केवट', 'नाव', 'चरण', 'नदी', 'गंगा',
    ],
    shotTypes: ['climax_closeup'],
  },
  {
    id: 'ramayana_hanuman_sanjeevani',
    url: '/src/assets/images/anime_ramayana_hanuman_flight_1794831873071.jpg',
    topic: 'ramayana',
    label: 'Hanuman Carrying Sanjeevani Mountain',
    description: 'Mighty Lord Hanuman soaring through golden sunset clouds holding glowing Sanjeevani mountain',
    keywords: [
      'hanuman', 'sanjeevani', 'flying', 'lanka', 'mountain', 'ocean', 'wind', 'हनुमान', 'संजीवनी', 'लंका', 'पर्वत', 'बजरंगबली',
    ],
    shotTypes: ['climax_closeup', 'character_hook'],
  },
  {
    id: 'ramayana_sarayu_diyas',
    url: '/src/assets/images/anime_ramayana_ending_1794827359586.jpg',
    topic: 'ramayana',
    label: 'Sarayu Ghat Glowing Diyas',
    description: 'Thousands of golden earthen diyas floating down Sarayu river before Ayodhya temples',
    keywords: [
      'diyas', 'lamps', 'sarayu', 'ayodhya', 'diwali', 'celebration', 'peaceful', 'दीप', 'दीये', 'सरयू', 'अयोध्या', 'भवसागर',
    ],
    shotTypes: ['resolution_vista'],
  },
  {
    id: 'ramayana_golden_deer',
    url: '/src/assets/images/anime_ramayana_golden_deer_1795002628507.jpg',
    topic: 'ramayana',
    label: 'Enchanted Golden Deer & Mata Sita',
    description: 'Glowing golden deer Maricha in lush Dandakaranya forest with Princess Sita reaching out in wonder',
    keywords: [
      'golden deer', 'maricha', 'deer', 'sita', 'panchavati', 'illusion', 'forest', 'स्वर्ण मृग', 'हिरण', 'मारीच', 'सोने का हिरण', 'माता सीता', 'पंचवटी',
    ],
    shotTypes: ['character_hook', 'wide_establishing'],
  },
  {
    id: 'ramayana_shiva_bow',
    url: '/src/assets/images/anime_ramayana_shiva_bow_1795002629511.jpg',
    topic: 'ramayana',
    label: 'Prince Rama Breaking Shiva Pinaka Bow',
    description: 'Prince Rama lifting and snapping the mighty divine Shiva bow Pinaka in Mithila royal swayamvar hall',
    keywords: [
      'pinaka', 'shiva bow', 'broken bow', 'swayamvar', 'mithila', 'janak', 'lifting bow', 'पिनाक', 'शिव धनुष', 'स्वयंवर', 'जनक', 'धनुष तोड़ा', 'प्रत्यंचा',
    ],
    shotTypes: ['climax_closeup', 'character_hook'],
  },
  {
    id: 'ramayana_setu_bridge',
    url: '/src/assets/images/anime_ramayana_setu_bridge_1795002629873.jpg',
    topic: 'ramayana',
    label: 'Floating Ram Setu Ocean Bridge',
    description: 'Sacred floating stones inscribed with Ram name forming Ram Setu across sapphire ocean toward golden Lanka',
    keywords: [
      'setu', 'ram setu', 'floating stones', 'bridge', 'ocean', 'sea', 'nal neel', 'राम सेतु', 'पत्थर', 'समुद्र', 'तैरते पत्थर', 'पुल', 'वानर सेना',
    ],
    shotTypes: ['wide_establishing', 'resolution_vista'],
  },
  {
    id: 'ramayana_ravana_battle',
    url: '/src/assets/images/anime_ramayana_ravana_battle_1795002630164.jpg',
    topic: 'ramayana',
    label: 'Shri Ram vs Ten-Headed Ravana Battle',
    description: 'Prince Rama aiming blazing golden celestial arrow at towering ten-headed King Ravana in Lanka storm',
    keywords: [
      'ravana', 'ten headed', 'ten-headed', 'ram-ravana', 'lanka war', 'brahmastra', 'final battle', 'battle', 'arrow', 'evil',
      'रावण', 'दशानन', 'राम-रावण', 'महासंग्राम', 'युद्ध', 'ब्रह्मास्त्र', 'लंका', 'तीर', 'अधर्म', 'वध',
    ],
    shotTypes: ['climax_closeup'],
  },
  {
    id: 'ramayana_jatayu_sky',
    url: '/src/assets/images/anime_ramayana_jatayu_sky_1795002656902.jpg',
    topic: 'ramayana',
    label: 'Brave Jatayu Fighting Ravana in Sky',
    description: 'Mighty golden eagle Jatayu spreading blazing wings in storm clouds to stop Ravana aerial chariot',
    keywords: [
      'jatayu', 'eagle', 'bird', 'sky', 'pushpak', 'chariot', 'wings', 'abduction', 'जटायु', 'पक्षी', 'रथ', 'आकाश', 'पंख', 'बलिदान', 'सीता हरण',
    ],
    shotTypes: ['climax_closeup', 'wide_establishing'],
  },

  // Mahabharata
  {
    id: 'mahabharata_arjuna_chariot',
    url: '/src/assets/images/anime_mahabharata_hook_1794827359988.jpg',
    topic: 'mahabharata',
    label: 'Arjuna & Krishna on Kurukshetra Chariot',
    description: 'Warrior Arjuna holding Gandiva bow beside charioteer Krishna blowing conch on war chariot',
    keywords: [
      'arjuna', 'chariot', 'gandiva', 'conch', 'kurukshetra', 'shankh', 'अर्जुन', 'रथ', 'गांडीव', 'शंख', 'कुरुक्षेत्र',
    ],
    shotTypes: ['character_hook'],
  },
  {
    id: 'mahabharata_battlefield',
    url: '/src/assets/images/anime_mahabharata_setup_1794827676653.jpg',
    topic: 'mahabharata',
    label: 'Kurukshetra Armies Facing Off',
    description: 'Eighteen armies arrayed with war flags across misty Kurukshetra horizon at dawn',
    keywords: [
      'army', 'armies', 'soldiers', 'banners', 'battlefield', 'kaurava', 'pandava', 'सेना', 'युद्ध', 'रणभूमि', 'कौरव', 'पांडव',
    ],
    shotTypes: ['wide_establishing'],
  },
  {
    id: 'mahabharata_gita_cosmic',
    url: '/src/assets/images/anime_mahabharata_climax_1794827360382.jpg',
    topic: 'mahabharata',
    label: 'Krishna Cosmic Gita Revelation',
    description: 'Radiant Lord Krishna surrounded by golden cosmic rings imparting eternal Bhagavad Gita wisdom',
    keywords: [
      'gita', 'cosmic', 'vishwaroop', 'dharma', 'karma', 'sermon', 'wisdom', 'गीता', 'धर्म', 'कर्म', 'उपदेश', 'विराट',
    ],
    shotTypes: ['climax_closeup'],
  },
  {
    id: 'mahabharata_victory_dawn',
    url: '/src/assets/images/anime_mahabharata_ending_1794827361263.jpg',
    topic: 'mahabharata',
    label: 'Victory Chariot Banner at Dawn',
    description: 'Golden war chariot banner fluttering proudly beneath parting storm clouds',
    keywords: [
      'banner', 'victory', 'dawn', 'storm parting', 'trumpets', 'ध्वज', 'विजय', 'प्रभात', 'गांडीव', 'संदेश',
    ],
    shotTypes: ['resolution_vista'],
  },
  {
    id: 'mahabharata_karna_wheel',
    url: '/src/assets/images/anime_mahabharata_karna_wheel_1795002630112.jpg',
    topic: 'mahabharata',
    label: 'Warrior Karna Lifting Sunken Chariot Wheel',
    description: 'Tragic solar hero Karna in golden armor kneeling in battlefield mud struggling to lift sunken chariot wheel',
    keywords: [
      'karna', 'surya putra', 'wheel', 'chariot wheel', 'curse', 'kavach', 'tragic', 'कर्ण', 'सूर्यपुत्र', 'पहिया', 'रथ का पहिया', 'कीचड़', 'शाप', 'कवच',
    ],
    shotTypes: ['climax_closeup', 'character_hook'],
  },
  {
    id: 'mahabharata_abhimanyu',
    url: '/src/assets/images/anime_mahabharata_abhimanyu_1795002630579.jpg',
    topic: 'mahabharata',
    label: 'Fearless Abhimanyu Inside Chakravyuh',
    description: 'Brave teenage warrior Abhimanyu defending himself with spinning golden chariot wheel against seven warriors',
    keywords: [
      'abhimanyu', 'chakravyuh', 'wheel shield', 'surrounded', 'teenage warrior', 'brave', 'अभिमन्यु', 'चक्रव्यूह', 'घेरा', 'महारथी', 'वीर', 'रथ का पहिया',
    ],
    shotTypes: ['climax_closeup', 'character_hook'],
  },
  {
    id: 'mahabharata_draupadi',
    url: '/src/assets/images/anime_mahabharata_draupadi_1795002631065.jpg',
    topic: 'mahabharata',
    label: 'Draupadi Prayer & Divine Endless Silk',
    description: 'Queen Draupadi praying with folded hands as radiant golden cosmic silk protects her inside Hastinapur hall',
    keywords: [
      'draupadi', 'prayer', 'sabha', 'hastinapur', 'saree', 'silk', 'dignity', 'helpless', 'द्रौपदी', 'चीरहरण', 'प्रार्थना', 'साड़ी', 'हस्तिनापुर', 'लाज',
    ],
    shotTypes: ['climax_closeup', 'character_hook'],
  },
  {
    id: 'mahabharata_bhishma_arrows',
    url: '/src/assets/images/anime_mahabharata_bhishma_arrows_1795002654205.jpg',
    topic: 'mahabharata',
    label: 'Bhishma Pitamah on Bed of Arrows',
    description: 'Elder Bhishma Pitamah lying serenely on bed of arrows at sunset while Arjuna kneels beside with folded hands',
    keywords: [
      'bhishma', 'pitamah', 'bed of arrows', 'arrows', 'elder', 'sunset', 'icchamrityu', 'भीष्म', 'पितामह', 'बाणों की शय्या', 'तीर', 'वचन', 'अंतिम',
    ],
    shotTypes: ['resolution_vista', 'wide_establishing'],
  },
  {
    id: 'mahabharata_vishwaroop',
    url: '/src/assets/images/anime_mahabharata_vishwaroop_1795002655870.jpg',
    topic: 'mahabharata',
    label: 'Colossal Cosmic Vishwaroop Revelation',
    description: 'Luminous multi-headed cosmic Vishwaroop form filled with galaxies and chakras towering over kneeling Arjuna',
    keywords: [
      'vishwaroop', 'virat', 'universal form', 'galaxies', 'cosmic', 'awe', 'divine vision', 'विश्वरूप', 'विराट रूप', 'ब्रह्मांड', 'दिव्य दृष्टि', 'अर्जुन',
    ],
    shotTypes: ['climax_closeup'],
  },
  {
    id: 'mahabharata_dice_hall',
    url: '/src/assets/images/anime_mahabharata_dice_hall_1795002672096.jpg',
    topic: 'mahabharata',
    label: 'Hastinapur Sabhagar Fateful Dice Game',
    description: 'Carved ivory dice tumbling over crimson velvet cloth inside torchlit Hastinapur royal dice hall',
    keywords: [
      'dice', 'shakuni', 'dyut', 'gamble', 'hastinapur', 'duryodhana', 'yudhishthira', 'पासा', 'चौसर', 'शकुनि', 'जुआ', 'दुर्योधन', 'युधिष्ठिर', 'सभा',
    ],
    shotTypes: ['character_hook', 'wide_establishing'],
  },

  // Hindu Gods & Puranas
  {
    id: 'gods_shiva_kailash',
    url: '/src/assets/images/anime_shiva_hook_1794827361806.jpg',
    topic: 'hindu_gods',
    label: 'Meditating Lord Shiva on Kailash',
    description: 'Divine Lord Shiva meditating atop snowy Mount Kailash beneath glowing crescent moon',
    keywords: [
      'shiva', 'mahadev', 'kailash', 'meditating', 'crescent moon', 'ganga', 'शिव', 'महादेव', 'कैलाश', 'भोलेनाथ', 'तपस्या',
    ],
    shotTypes: ['character_hook'],
  },
  {
    id: 'gods_temple_path',
    url: '/src/assets/images/anime_gods_setup_1794827677665.jpg',
    topic: 'hindu_gods',
    label: 'Sacred Himalayan Temple Sanctuary',
    description: 'Ancient carved stone temple in misty Himalayan mountains at serene twilight',
    keywords: [
      'temple', 'sanctuary', 'himalaya', 'stone steps', 'devotee', 'parvati', 'ganesha', 'मंदिर', 'हिमालय', 'पार्वती', 'गणेश', 'पूजा',
    ],
    shotTypes: ['wide_establishing'],
  },
  {
    id: 'gods_cosmic_trident',
    url: '/src/assets/images/anime_gods_climax_1794827376070.jpg',
    topic: 'hindu_gods',
    label: 'Cosmic Trishul & Damaru Power',
    description: 'Luminous sacred Trishul trident and Damaru radiating violet-gold celestial cosmic energy',
    keywords: [
      'trishul', 'trident', 'damaru', 'cosmic', 'third eye', 'tandav', 'shakti', 'durga', 'त्रिशूल', 'डमरू', 'तांडव', 'शक्ति', 'चमत्कार',
    ],
    shotTypes: ['climax_closeup'],
  },
  {
    id: 'gods_sunrise_blessing',
    url: '/src/assets/images/anime_gods_ending_1794827376902.jpg',
    topic: 'hindu_gods',
    label: 'Himalayan Sunrise Temple Blessing',
    description: 'Warm golden Himalayan sunrise rays shining over peaceful sacred mountain temple',
    keywords: [
      'sunrise', 'blessing', 'peace', 'aarti', 'prayer', 'om', 'सूर्योदय', 'आशीर्वाद', 'शांति', 'आरती', 'कल्याण',
    ],
    shotTypes: ['resolution_vista'],
  },
  {
    id: 'gods_shiva_tandav',
    url: '/src/assets/images/anime_shiva_tandav_1795002632373.jpg',
    topic: 'hindu_gods',
    label: 'Lord Shiva Cosmic Fire Tandav',
    description: 'Fierce cosmic Lord Shiva performing Tandav dance atop snowy mountain amidst cosmic fire and lightning',
    keywords: [
      'tandav', 'rudra', 'cosmic dance', 'angry shiva', 'fire ring', 'destroyer', 'third eye', 'तांडव', 'रुद्र', 'नृत्य', 'क्रोध', 'महाकाल', 'प्रलय',
    ],
    shotTypes: ['climax_closeup', 'character_hook'],
  },
  {
    id: 'gods_maa_durga',
    url: '/src/assets/images/anime_maa_durga_shakti_1795002633055.jpg',
    topic: 'hindu_gods',
    label: 'Maa Durga Riding Roaring Lion',
    description: 'Radiant ten-armed Goddess Maa Durga on roaring lion wielding luminous trident against dark evil forces',
    keywords: [
      'durga', 'kali', 'shakti', 'lion', 'mahishasura', 'navratri', 'goddess', 'devi', 'दुर्गा', 'माँ दुर्गा', 'शक्ति', 'शेर', 'सिंह', 'महिषासुर', 'देवी',
    ],
    shotTypes: ['character_hook', 'climax_closeup'],
  },
  {
    id: 'gods_narasimha_pillar',
    url: '/src/assets/images/anime_narasimha_pillar_1795002632952.jpg',
    topic: 'hindu_gods',
    label: 'Lord Narasimha Emerging From Pillar',
    description: 'Fierce divine half-lion Lord Narasimha bursting from shattered marble palace pillar in golden fire',
    keywords: [
      'narasimha', 'prahlad', 'pillar', 'hiranyakashipu', 'vishnu avatar', 'lion god', 'नरसिंह', 'प्रह्लाद', 'खंभा', 'हिरण्यकश्यप', 'स्तंभ', 'प्रकट',
    ],
    shotTypes: ['climax_closeup'],
  },
  {
    id: 'gods_ganesha_wisdom',
    url: '/src/assets/images/anime_gods_ganesha_wisdom_1795002656414.jpg',
    topic: 'hindu_gods',
    label: 'Lord Ganesha Writing Sacred Wisdom',
    description: 'Gentle Lord Ganesha seated on blooming pink lotus beside glowing diyas writing with golden quill on scroll',
    keywords: [
      'ganesha', 'ganpati', 'vinayak', 'modak', 'wisdom', 'quill', 'mahabharata scribe', 'गणेश', 'गणपति', 'बप्पा', 'बुद्धि', 'लेखनी', 'प्रथम पूज्य',
    ],
    shotTypes: ['character_hook', 'resolution_vista'],
  },
  {
    id: 'gods_samudra_manthan',
    url: '/src/assets/images/anime_gods_samudra_manthan_1795002656810.jpg',
    topic: 'hindu_gods',
    label: 'Samudra Manthan Cosmic Ocean Churning',
    description: 'Devas and Asuras churning cosmic ocean around golden Mount Mandara with serpent Vasuki as Amrit pot rises',
    keywords: [
      'samudra manthan', 'neelkanth', 'amrit', 'vasuki', 'poison', 'ocean churn', 'devas', 'asuras', 'समुद्र मंथन', 'अमृत', 'हलाहल', 'नीलकंठ', 'वासुकी', 'देवता',
    ],
    shotTypes: ['wide_establishing', 'climax_closeup'],
  },
];

export function findSceneArtById(artId?: string): SceneArtAsset | undefined {
  if (!artId) return undefined;
  return SCENE_ART_CATALOG.find((a) => a.id === artId);
}

export function getSceneArtCatalog(topic?: StoryTopic): SceneArtAsset[] {
  if (!topic) return SCENE_ART_CATALOG;
  const same = SCENE_ART_CATALOG.filter((a) => a.topic === topic);
  const rest = SCENE_ART_CATALOG.filter((a) => a.topic !== topic);
  return [...same, ...rest];
}

const VERSATILE_FALLBACK_IDS: Partial<Record<StoryTopic, string[]>> = {
  krishna: [
    'krishna_vrindavan_path',
    'krishna_flute_yamuna',
    'krishna_radha_lotus_finale',
    'krishna_offering_flute',
    'gods_temple_path',
    'gods_sunrise_blessing',
  ],
  ramayana: [
    'ramayana_exile_forest',
    'ramayana_rama_portrait',
    'ramayana_sarayu_diyas',
    'gods_temple_path',
    'gods_sunrise_blessing',
  ],
  mahabharata: [
    'mahabharata_battlefield',
    'mahabharata_arjuna_chariot',
    'mahabharata_gita_cosmic',
    'mahabharata_victory_dawn',
  ],
  horror: [
    'horror_mist_forest',
    'horror_haveli_lantern',
    'horror_temple_midnight',
    'horror_haveli_corridor',
    'horror_camera_window',
  ],
  hindu_gods: [
    'gods_temple_path',
    'gods_shiva_kailash',
    'gods_cosmic_trident',
    'gods_sunrise_blessing',
  ],
};

export function scoreSceneArtAsset(
  asset: SceneArtAsset,
  storyTopic: StoryTopic,
  scene: Pick<StoryScene, 'sceneArtId' | 'visualPrompt' | 'narrationHindi' | 'subtitleHindi' | 'hookCaption' | 'shotType'>,
  storyTitle = ''
): number {
  let score = 0;

  // Topic affinity keeps devotional scenes inside the right universe unless keywords strongly match elsewhere
  if (asset.topic === storyTopic) {
    score += 3;
  }

  // Respect explicit AI-chosen catalog sceneArtId when it exists in this universe
  const explicitHintMatch =
    Boolean(scene.sceneArtId) &&
    scene.sceneArtId !== 'custom' &&
    scene.sceneArtId !== 'custom_ai_svg' &&
    scene.sceneArtId === asset.id;
  if (explicitHintMatch) {
    score += 18;
  }

  // Shot framing compatibility bonus
  if (scene.shotType && asset.shotTypes.includes(scene.shotType)) {
    score += 2;
  }

  const promptText = (scene.visualPrompt || '').toLowerCase();
  const narrationText = `${scene.narrationHindi || ''} ${scene.subtitleHindi || ''} ${scene.hookCaption || ''}`.toLowerCase();
  const combinedText = `${promptText} ${narrationText}`;
  const titleText = storyTitle.toLowerCase();

  let keywordHits = 0;
  for (const rawKw of asset.keywords) {
    const kw = rawKw.toLowerCase();
    const weightBoost = kw.includes(' ') ? 1.45 : 1;
    let matched = false;
    if (promptText.includes(kw)) {
      score += Math.round(10 * weightBoost);
      matched = true;
    }
    if (narrationText.includes(kw)) {
      score += Math.round(8 * weightBoost);
      matched = true;
    }
    if (titleText.includes(kw)) {
      score += 2;
    }
    if (matched) keywordHits++;
  }

  // Guards against overly specific character/event scenes hijacking unrelated narration beats
  const guards: Array<[string, RegExp, number]> = [
    ['krishna_crying_flute', /(tear|cry|sorrow|sad|weep|आँसू|दुख|रो|भावुक|आंखें)/i, 12],
    ['krishna_broken_flute', /(broken flute|snapped|splinter|mossy stone|तोड़|टूट|चट्टान)/i, 12],
    ['krishna_broken_pot', /(broken pot|clay pot|matka|curd|butter|makhan|मटका|घड़ा|माखन|फोड़|फूट)/i, 10],
    ['krishna_radha_farewell', /(radha|farewell|depart|leaving vrindavan|राधा|विदा|विरह)/i, 14],
    ['krishna_kaliya_naag', /(kaliya|serpent|snake|cobra|naag|कालिया|नाग|सर्प|सांप|फन)/i, 14],
    ['krishna_kansa_sabha', /(kansa|kans|arena|throne|mathura|कंस|अखाड़ा|सिंहासन|सभा)/i, 14],
    ['krishna_govardhan', /(govardhan|mountain|hill|indra|गोवर्धन|पर्वत|पहाड़|इंद्र)/i, 12],
    ['krishna_sudama_embrace', /(sudama|dwarka|potli|सुदामा|द्वारका|पोटली)/i, 12],
    ['ramayana_jatayu_sky', /(jatayu|eagle|bird|wings|abduction|pushpak|जटायु|पक्षी|पंख|हरण)/i, 12],
    ['ramayana_kevat_boat', /(kevat|boat|boatman|ferry|wash feet|ganga|केवट|नाव|चरण|गंगा)/i, 14],
    ['ramayana_shiva_bow', /(pinaka|shiva bow|swayamvar|mithila|janak|पिनाक|शिव धनुष|स्वयंवर|जनक)/i, 14],
    ['ramayana_setu_bridge', /(setu|floating stone|bridge|nal neel|राम सेतु|तैरते पत्थर|पुल|समुद्र)/i, 12],
    ['mahabharata_karna_wheel', /(karna|wheel|mud|curse|कर्ण|सूर्यपुत्र|पहिया|कीचड़|शाप)/i, 12],
    ['mahabharata_abhimanyu', /(abhimanyu|chakravyuh|अभिमन्यु|चक्रव्यूह)/i, 14],
    ['mahabharata_draupadi', /(draupadi|saree|sabha|cheerharan|द्रौपदी|चीरहरण|साड़ी|लाज)/i, 14],
    ['mahabharata_dice_hall', /(dice|shakuni|dyut|gamble|पासा|चौसर|शकुनि|जुआ)/i, 14],
    ['mahabharata_bhishma_arrows', /(bhishma|pitamah|bed of arrows|भीष्म|पितामह|बाणों की शय्या)/i, 14],
  ];

  for (const [guardedId, rx, penalty] of guards) {
    if (asset.id === guardedId && !rx.test(combinedText)) {
      score -= penalty;
    }
  }

  // Require at least 1 real keyword match or explicit AI hint for strong alignment
  if (keywordHits === 0 && !explicitHintMatch) {
    score = Math.min(score, 5);
  }

  return score;
}

export function pickBestUnusedCatalogAsset(
  topic: StoryTopic,
  scene: Pick<StoryScene, 'sceneArtId' | 'visualPrompt' | 'narrationHindi' | 'subtitleHindi' | 'hookCaption' | 'shotType'>,
  usedUrls: Set<string>,
  storyTitle = ''
): SceneArtAsset | null {
  const safeNeutralIds = new Set(['gods_temple_path', 'gods_sunrise_blessing']);
  const sameTopicUnused = SCENE_ART_CATALOG.filter(
    (a) => a.topic === topic && !usedUrls.has(a.url)
  );
  const pool =
    sameTopicUnused.length > 0
      ? sameTopicUnused
      : topic === 'horror'
        ? []
        : SCENE_ART_CATALOG.filter(
            (a) =>
              !usedUrls.has(a.url) &&
              (topic === 'hindu_gods' ? a.topic !== 'horror' : safeNeutralIds.has(a.id))
          );

  if (pool.length === 0) return null;

  const scored = pool
    .map((asset) => ({
      asset,
      score: scoreSceneArtAsset(asset, topic, scene, storyTitle),
    }))
    .sort((a, b) => b.score - a.score);

  if (scored[0] && scored[0].score >= 8) {
    return scored[0].asset;
  }

  const versatileIds = VERSATILE_FALLBACK_IDS[topic] ?? [];
  for (const preferredId of versatileIds) {
    const hit = pool.find((a) => a.id === preferredId);
    if (hit) return hit;
  }

  return scored[0].asset;
}

export function isCustomUploadedFrameUrl(url?: string): boolean {
  if (!url) return false;
  if (!url.startsWith('/api/frames/')) return false;
  // Legacy 3D mesh placeholder snapshots contain "-3d-sc" and should upgrade to matching anime art
  if (url.includes('-3d-sc')) return false;
  return true;
}

export interface MatchedStoryArtAnalysis {
  scenes: StoryScene[];
  confidences: number[];
  lowConfidenceIndices: number[];
}

export function analyzeAndMatchStoryArt(
  input: {
    topic: StoryTopic;
    title?: string;
    titleHindi?: string;
    scenes: StoryScene[];
  },
  options: { preserveCustomUploads?: boolean } = {}
): MatchedStoryArtAnalysis {
  const preserveCustom = options.preserveCustomUploads !== false;
  const storyTitle = `${input.title || ''} ${input.titleHindi || ''}`;
  const usedUrls = new Set<string>();

  if (preserveCustom) {
    for (const sc of input.scenes) {
      if (isCustomUploadedFrameUrl(sc.imageUrl) && sc.imageUrl) {
        usedUrls.add(sc.imageUrl);
      }
    }
  }

  const totalScenes = input.scenes.length;
  const confidences: number[] = new Array(totalScenes).fill(0);
  const lowConfidenceIndices: number[] = [];

  // Score every (scene, candidate) pair so stronger specific matches win priority slots cleanly
  const sceneRankings = input.scenes.map((scene, idx) => {
    const candidates = SCENE_ART_CATALOG.map((asset) => ({
      asset,
      score: scoreSceneArtAsset(asset, input.topic, scene, storyTitle),
    })).sort((a, b) => b.score - a.score);

    const bestScore = candidates[0]?.score ?? 0;
    return { idx, scene, candidates, bestScore };
  });

  // Assign scenes in descending order of specificity so exact climax shots (e.g. broken_flute, diamonds_basket)
  // don't get stolen by an earlier weak hook scene!
  const assignedUrls: string[] = new Array(totalScenes).fill('');
  const assignedArtIds: (string | undefined)[] = input.scenes.map((s) => s.sceneArtId);
  const orderBySpecificity = [...sceneRankings].sort((a, b) => b.bestScore - a.bestScore);

  for (const item of orderBySpecificity) {
    const { idx, scene, candidates, bestScore } = item;
    if (preserveCustom && isCustomUploadedFrameUrl(scene.imageUrl) && scene.imageUrl) {
      assignedUrls[idx] = scene.imageUrl;
      confidences[idx] = 100;
      continue;
    }

    const picked = candidates.find(
      (c) =>
        !usedUrls.has(c.asset.url) &&
        (c.asset.topic === input.topic || (input.topic === 'hindu_gods' && c.asset.topic !== 'horror'))
    );

    if (picked && picked.score >= 10) {
      assignedUrls[idx] = picked.asset.url;
      assignedArtIds[idx] = picked.asset.id;
      usedUrls.add(picked.asset.url);
      confidences[idx] = picked.score;
    } else {
      const versatile = pickBestUnusedCatalogAsset(input.topic, scene, usedUrls, storyTitle);
      const fallbackUrl = versatile?.url || resolveTopicAnimeSceneImage(input.topic, idx, totalScenes, 0);
      if (!usedUrls.has(fallbackUrl)) {
        assignedUrls[idx] = fallbackUrl;
        if (versatile) assignedArtIds[idx] = versatile.id;
        usedUrls.add(fallbackUrl);
        confidences[idx] = Math.min(bestScore, 10);
      } else {
        const nextUnusedTopic = candidates.find(
          (c) =>
            !usedUrls.has(c.asset.url) &&
            (c.asset.topic === input.topic || (input.topic === 'hindu_gods' && c.asset.topic !== 'horror'))
        );
        if (nextUnusedTopic) {
          assignedUrls[idx] = nextUnusedTopic.asset.url;
          assignedArtIds[idx] = nextUnusedTopic.asset.id;
          usedUrls.add(nextUnusedTopic.asset.url);
          confidences[idx] = nextUnusedTopic.score;
        } else {
          assignedUrls[idx] = picked?.asset.url ?? fallbackUrl;
          confidences[idx] = 0;
        }
      }
    }

    // Below 13 means weak/duplicate match -> eligible for bespoke AI art when catalog slots are exhausted
    if (confidences[idx] < 13) {
      lowConfidenceIndices.push(idx);
    }
  }

  const matchedScenes = input.scenes.map((sc, idx) => ({
    ...sc,
    sceneArtId: assignedArtIds[idx] || sc.sceneArtId,
    imageUrl: assignedUrls[idx] || sc.imageUrl || resolveTopicAnimeSceneImage(input.topic, idx, totalScenes, 0),
  }));

  return {
    scenes: matchedScenes,
    confidences,
    lowConfidenceIndices,
  };
}

export function matchStoryScenesToArt(
  input: {
    topic: StoryTopic;
    title?: string;
    titleHindi?: string;
    scenes: StoryScene[];
  },
  options: { preserveCustomUploads?: boolean } = {}
): StoryScene[] {
  return analyzeAndMatchStoryArt(input, options).scenes;
}

export const TOPIC_CONFIGS: Record<StoryTopic, TopicConfig> = {
  krishna: {
    id: 'krishna',
    label: 'Lord Krishna',
    labelHindi: 'श्री कृष्ण लीला',
    defaultImage: '/src/assets/images/anime_krishna_hook_1794827342983.jpg',
    defaultTone: 'devotional_warm',
    defaultBgm: 'serene_flute',
    accentHex: '#C2410C',
    overlayTint: 'rgba(15, 23, 42, 0.22)',
    particleType: 'fireflies',
  },
  ramayana: {
    id: 'ramayana',
    label: 'Ramayana',
    labelHindi: 'रामायण कथा',
    defaultImage: '/src/assets/images/anime_ramayana_hook_1794827344931.jpg',
    defaultTone: 'devotional_warm',
    defaultBgm: 'devotional_tanpura',
    accentHex: '#B45309',
    overlayTint: 'rgba(28, 25, 23, 0.22)',
    particleType: 'embers',
  },
  mahabharata: {
    id: 'mahabharata',
    label: 'Mahabharata',
    labelHindi: 'महाभारत गाथा',
    defaultImage: '/src/assets/images/anime_mahabharata_hook_1794827359988.jpg',
    defaultTone: 'epic_dramatic',
    defaultBgm: 'epic_drums',
    accentHex: '#991B1B',
    overlayTint: 'rgba(24, 24, 27, 0.24)',
    particleType: 'embers',
  },
  horror: {
    id: 'horror',
    label: 'Horror',
    labelHindi: 'डरावनी लोककथा',
    defaultImage: '/src/assets/images/anime_horror_hook_1794827377407.jpg',
    defaultTone: 'horror_suspense',
    defaultBgm: 'eerie_horror',
    accentHex: '#1E293B',
    overlayTint: 'rgba(2, 6, 23, 0.32)',
    particleType: 'fog',
  },
  hindu_gods: {
    id: 'hindu_gods',
    label: 'Hindu Gods & Puranas',
    labelHindi: 'शिव व पौराणिक कथा',
    defaultImage: '/src/assets/images/anime_shiva_hook_1794827361806.jpg',
    defaultTone: 'calm_storyteller',
    defaultBgm: 'devotional_tanpura',
    accentHex: '#0F766E',
    overlayTint: 'rgba(15, 23, 42, 0.24)',
    particleType: 'starlight',
  },
};

export interface FormatSpec {
  id: VideoFormat;
  label: string;
  aspect: '9:16' | '16:9';
  previewWidth: number;
  previewHeight: number;
  exportWidth: number;
  exportHeight: number;
  targetDurationSec: number;
  platform: 'YouTube' | 'Instagram';
}

export const FORMAT_SPECS: Record<VideoFormat, FormatSpec> = {
  youtube_short: {
    id: 'youtube_short',
    label: 'YouTube Shorts',
    aspect: '9:16',
    previewWidth: 360,
    previewHeight: 640,
    exportWidth: 1080,
    exportHeight: 1920,
    targetDurationSec: 30,
    platform: 'YouTube',
  },
  instagram_reel: {
    id: 'instagram_reel',
    label: 'Instagram Reels',
    aspect: '9:16',
    previewWidth: 360,
    previewHeight: 640,
    exportWidth: 1080,
    exportHeight: 1920,
    targetDurationSec: 30,
    platform: 'Instagram',
  },
  youtube_long: {
    id: 'youtube_long',
    label: 'YouTube Long-Form',
    aspect: '16:9',
    previewWidth: 640,
    previewHeight: 360,
    exportWidth: 1920,
    exportHeight: 1080,
    targetDurationSec: 120,
    platform: 'YouTube',
  },
};

export interface SceneGenerationPlan {
  sceneCount: number;
  targetDurationSec: number;
  targetPerSceneSec: number;
  pacingMode: StoryPacingMode;
}

export function getRecommendedScenePlan(
  format: VideoFormat,
  pacingMode: StoryPacingMode = 'fast_30s'
): SceneGenerationPlan {
  if (format === 'youtube_long') {
    if (pacingMode === 'fast_30s') {
      return {
        sceneCount: 12,
        targetDurationSec: 60,
        targetPerSceneSec: 5,
        pacingMode,
      };
    }
    return {
      sceneCount: 10,
      targetDurationSec: 100,
      targetPerSceneSec: 10,
      pacingMode,
    };
  }

  if (pacingMode === 'fast_30s') {
    return {
      sceneCount: 10,
      targetDurationSec: 32,
      targetPerSceneSec: 3,
      pacingMode,
    };
  }

  return {
    sceneCount: 8,
    targetDurationSec: 44,
    targetPerSceneSec: 5.5,
    pacingMode,
  };
}

export function getTopicConfig(topic: StoryTopic): TopicConfig {
  return TOPIC_CONFIGS[topic] ?? TOPIC_CONFIGS.krishna;
}

export function getFormatSpec(format: VideoFormat): FormatSpec {
  return FORMAT_SPECS[format] ?? FORMAT_SPECS.instagram_reel;
}

export function calculateTotalDuration(scenes: StoryScene[]): number {
  const total = scenes.reduce(
    (sum, scene) => sum + Math.max(1.5, Number(scene.durationSec) || 4),
    0
  );
  return Number(total.toFixed(2));
}

export function parseWavDurationSecondsFromBytes(bytes: Uint8Array): number {
  if (!bytes || bytes.length < 44) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riff =
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const wave =
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);

  if (riff !== 'RIFF' || wave !== 'WAVE') {
    // Fallback assume 24kHz mono 16-bit PCM (48000 bytes/sec)
    return Math.max(1, Math.ceil(Math.max(0, bytes.length - 44) / 48000));
  }

  let byteRate = view.getUint32(28, true) || 48000;
  let dataSize = 0;
  let pos = 12;

  while (pos + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const chunkSize = view.getUint32(pos + 4, true);
    if (chunkId === 'fmt ' && pos + 16 <= bytes.length) {
      const parsedRate = view.getUint32(pos + 16, true);
      if (parsedRate > 0) byteRate = parsedRate;
    } else if (chunkId === 'data') {
      dataSize = chunkSize > 0 ? Math.min(chunkSize, bytes.length - (pos + 8)) : bytes.length - (pos + 8);
      break;
    }
    pos += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataSize <= 0) {
    dataSize = Math.max(0, bytes.length - 44);
  }

  // Always return exact fractional seconds without under-rounding so tail speech never gets clipped
  return Number((dataSize / Math.max(1, byteRate)).toFixed(2));
}

export function getEffectivePlaybackDurationSec(
  scenes: StoryScene[],
  decodedVoiceDurationSec?: number | null
): number {
  const sceneSum = calculateTotalDuration(scenes);
  const voiceWithTail =
    decodedVoiceDurationSec && decodedVoiceDurationSec > 0
      ? decodedVoiceDurationSec + 0.35
      : 0;
  return Math.max(4, sceneSum, voiceWithTail);
}

export function estimateHindiNarrationWeight(text: string, baseDur = 3): number {
  const cleaned = (text || '').trim();
  if (!cleaned) return Math.max(1.5, baseDur);
  // Count Devanagari base letters/words + natural punctuation pauses (accurate speaking time proxy)
  const chars = cleaned.replace(/[\s\u093E-\u094F\u0901-\u0903\u0964।.,!?—-]/g, '').length;
  const pauses = (cleaned.match(/[।.,!?—]/g) || []).length;
  const spokenScore = chars * 0.14 + pauses * 0.45;
  return Math.max(1.5, spokenScore + baseDur * 0.35);
}

export function scaleScenesToAudioDuration(
  scenes: StoryScene[],
  audioDurationSec: number
): StoryScene[] {
  if (scenes.length === 0 || audioDurationSec <= 0) return scenes;
  const minPerScene = 1.5;
  // Use Math.ceil so total scene timeline is NEVER shorter than the spoken WAV audio
  const targetTotal = Math.max(
    Math.ceil(scenes.length * minPerScene),
    Math.ceil(audioDurationSec)
  );

  const weights = scenes.map((s) =>
    estimateHindiNarrationWeight(s.narrationHindi, Math.max(minPerScene, Number(s.durationSec) || 3))
  );
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (totalWeight <= 0) return scenes;

  const roundHalf = (val: number) => Math.round(val * 2) / 2;
  const durations = weights.map((w) =>
    Math.max(minPerScene, roundHalf((w / totalWeight) * targetTotal))
  );

  // Balance any rounding delta evenly across scenes rather than dumping onto the last scene
  let diff = Number((targetTotal - durations.reduce((a, b) => a + b, 0)).toFixed(2));
  let guard = 0;
  while (Math.abs(diff) >= 0.49 && guard < scenes.length * 6) {
    const step = diff > 0 ? 0.5 : -0.5;
    let pickIdx = guard % scenes.length;
    let bestScore = -Infinity;
    for (let i = 0; i < scenes.length; i++) {
      if (step < 0 && durations[i] <= minPerScene) continue;
      const score = step > 0 ? weights[i] - durations[i] : durations[i] - minPerScene;
      if (score > bestScore) {
        bestScore = score;
        pickIdx = i;
      }
    }
    if (step < 0 && durations[pickIdx] <= minPerScene) break;
    durations[pickIdx] = Number((durations[pickIdx] + step).toFixed(2));
    diff = Number((targetTotal - durations.reduce((a, b) => a + b, 0)).toFixed(2));
    guard++;
  }

  return scenes.map((scene, idx) => ({
    ...scene,
    durationSec: durations[idx],
  }));
}

export function extractWavAudioSpec(bytes: Uint8Array): {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  byteRate: number;
  pcmBytes: Uint8Array;
} {
  if (bytes.length < 44) {
    return { sampleRate: 24000, numChannels: 1, bitsPerSample: 16, byteRate: 48000, pcmBytes: new Uint8Array(0) };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const wave = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    return { sampleRate: 24000, numChannels: 1, bitsPerSample: 16, byteRate: 48000, pcmBytes: bytes.subarray(44) };
  }

  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let byteRate = 48000;
  let pcmBytes = bytes.subarray(44);
  let pos = 12;

  while (pos + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const chunkSize = view.getUint32(pos + 4, true);
    if (chunkId === 'fmt ' && pos + 24 <= bytes.length) {
      numChannels = view.getUint16(pos + 10, true) || 1;
      sampleRate = view.getUint32(pos + 12, true) || 24000;
      byteRate = view.getUint32(pos + 16, true) || sampleRate * numChannels * 2;
      bitsPerSample = view.getUint16(pos + 22, true) || 16;
    } else if (chunkId === 'data') {
      const end = chunkSize > 0 ? Math.min(bytes.length, pos + 8 + chunkSize) : bytes.length;
      pcmBytes = bytes.subarray(pos + 8, end);
      break;
    }
    pos += 8 + chunkSize + (chunkSize % 2);
  }

  return { sampleRate, numChannels, bitsPerSample, byteRate, pcmBytes };
}

export function concatenateWavClipsWithActDurations(
  clips: Uint8Array[],
  interClipPauseSec = 0.14
): { wavBytes: Uint8Array; actDurationsSec: number[]; totalDurationSec: number } {
  if (clips.length === 0) {
    return { wavBytes: new Uint8Array(0), actDurationsSec: [], totalDurationSec: 0 };
  }
  const firstSpec = extractWavAudioSpec(clips[0]);
  const bytesPerSample = Math.max(2, (firstSpec.bitsPerSample / 8) * firstSpec.numChannels);
  const pauseSampleCount = Math.max(0, Math.round(firstSpec.sampleRate * interClipPauseSec));
  const pauseByteLen = pauseSampleCount * bytesPerSample;

  const pcmSegments: Uint8Array[] = [];
  const actDurationsSec: number[] = [];
  let totalPcmLen = 0;

  clips.forEach((clip, idx) => {
    const spec = extractWavAudioSpec(clip);
    // Align to sample frame boundary
    const alignedLen = spec.pcmBytes.length - (spec.pcmBytes.length % bytesPerSample);
    const seg = spec.pcmBytes.subarray(0, alignedLen);
    pcmSegments.push(seg);
    totalPcmLen += seg.length;

    const pauseAdded = idx < clips.length - 1 ? pauseByteLen : 0;
    if (pauseAdded > 0) {
      pcmSegments.push(new Uint8Array(pauseAdded));
      totalPcmLen += pauseAdded;
    }
    actDurationsSec.push(Number(((seg.length + pauseAdded) / Math.max(1, firstSpec.byteRate)).toFixed(3)));
  });

  const wavBytes = new Uint8Array(44 + totalPcmLen);
  const view = new DataView(wavBytes.buffer);
  wavBytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  view.setUint32(4, 36 + totalPcmLen, true);
  wavBytes.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  wavBytes.set([0x66, 0x6d, 0x74, 0x20], 12); // fmt 
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, firstSpec.numChannels, true);
  view.setUint32(24, firstSpec.sampleRate, true);
  view.setUint32(28, firstSpec.byteRate, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, firstSpec.bitsPerSample, true);
  wavBytes.set([0x64, 0x61, 0x74, 0x61], 36); // data
  view.setUint32(40, totalPcmLen, true);

  let offset = 44;
  for (const seg of pcmSegments) {
    wavBytes.set(seg, offset);
    offset += seg.length;
  }

  const totalDurationSec = Number((totalPcmLen / Math.max(1, firstSpec.byteRate)).toFixed(2));
  return { wavBytes, actDurationsSec, totalDurationSec };
}

export function scaleScenesWithinActDurations(
  actSceneGroups: StoryScene[][],
  actDurationsSec: number[]
): StoryScene[] {
  if (actSceneGroups.length !== actDurationsSec.length) {
    const flat = actSceneGroups.flat();
    const total = actDurationsSec.reduce((a, b) => a + b, 0);
    return scaleScenesToAudioDuration(flat, total);
  }
  const result: StoryScene[] = [];
  actSceneGroups.forEach((group, gIdx) => {
    if (group.length === 0) return;
    const rawDur = Math.max(group.length * 1.5, actDurationsSec[gIdx]);
    // Allocate quarter-second precision within each act so act cuts hit exact millisecond boundaries
    const weights = group.map((s) => estimateHindiNarrationWeight(s.narrationHindi, 2.5));
    const totalW = weights.reduce((a, b) => a + b, 0) || 1;
    const durs = weights.map((w) =>
      Math.max(1.5, Number(((w / totalW) * rawDur).toFixed(2)))
    );
    // Snap group sum cleanly to act duration on final scene of the act
    const sumBeforeLast = durs.slice(0, -1).reduce((a, b) => a + b, 0);
    const lastDur = Number(Math.max(1.5, rawDur - sumBeforeLast).toFixed(2));
    durs[durs.length - 1] = lastDur;
    group.forEach((sc, sIdx) => {
      result.push({ ...sc, durationSec: durs[sIdx] });
    });
  });
  return result;
}

export function computeSplitSceneDurations(durationSec: number): [number, number] {
  const rawDur = Math.max(3, Number(durationSec) || 12);
  if (rawDur < 6) {
    const half1 = Math.max(1.5, Math.floor(rawDur) / 2);
    const first = Number((Math.round(half1 * 2) / 2).toFixed(2));
    const second = Number(Math.max(1.5, rawDur - first).toFixed(2));
    return [first, second];
  }
  const safeDur = Math.max(6, Math.round(rawDur));
  if (safeDur >= 20 && safeDur <= 30) {
    const first = Math.min(15, Math.max(10, Math.floor(safeDur / 2)));
    const second = Math.max(10, safeDur - first);
    return [first, second];
  }
  const first = Math.max(3, Math.floor(safeDur / 2));
  const second = Math.max(3, safeDur - first);
  return [first, second];
}

export function splitHindiNarrationFallback(text: string): [string, string] {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return ['कथा का पहला क्षण सामने आता है।', 'तभी कहानी में नया मोड़ आ जाता है।'];
  }

  // Prefer natural Hindi/English punctuation split near the middle
  const mid = Math.floor(cleaned.length / 2);
  let bestSplit = -1;
  let bestDist = Infinity;
  for (let i = 4; i < cleaned.length - 4; i++) {
    const ch = cleaned[i];
    if (ch === '।' || ch === '.' || ch === ',' || ch === '—' || ch === '!') {
      const dist = Math.abs(i - mid);
      if (dist < bestDist) {
        bestDist = dist;
        bestSplit = i + 1;
      }
    }
  }

  if (bestSplit > 0 && bestSplit < cleaned.length - 3) {
    const a = cleaned.slice(0, bestSplit).trim();
    const b = cleaned.slice(bestSplit).trim();
    if (a && b) return [a, b];
  }

  const words = cleaned.split(' ').filter(Boolean);
  if (words.length <= 1) return [cleaned, cleaned];
  const halfIdx = Math.ceil(words.length / 2);
  return [words.slice(0, halfIdx).join(' '), words.slice(halfIdx).join(' ')];
}

export interface SplitSceneSuggestion {
  firstHalf?: Partial<Pick<StoryScene, 'narrationHindi' | 'subtitleHindi' | 'visualPrompt' | 'shotType' | 'cameraMotion' | 'sceneArtId'>>;
  secondHalf?: Partial<Pick<StoryScene, 'narrationHindi' | 'subtitleHindi' | 'visualPrompt' | 'shotType' | 'cameraMotion' | 'sceneArtId'>>;
}

export function buildSplitSceneHalves(
  scene: StoryScene,
  suggestion?: SplitSceneSuggestion
): [StoryScene, StoryScene] {
  const [dur1, dur2] = computeSplitSceneDurations(scene.durationSec);
  const [fallbackNarr1, fallbackNarr2] = splitHindiNarrationFallback(scene.narrationHindi);
  const [fallbackSub1, fallbackSub2] = splitHindiNarrationFallback(
    scene.subtitleHindi || scene.narrationHindi
  );

  const basePrompt = (scene.visualPrompt || 'Cinematic Indian anime scene').trim();
  const prompt1 =
    suggestion?.firstHalf?.visualPrompt?.trim() ||
    `${basePrompt}, opening establishing beat with expressive character focus and atmospheric lighting`;
  const prompt2 =
    suggestion?.secondHalf?.visualPrompt?.trim() ||
    `${basePrompt}, dramatic close-up reaction beat with intensified lighting and dynamic anime speedlines`;

  const firstHalf: StoryScene = {
    ...scene,
    id: `${scene.id}-a`,
    shotType: suggestion?.firstHalf?.shotType ?? scene.shotType ?? 'wide_establishing',
    sceneArtId: suggestion?.firstHalf?.sceneArtId ?? scene.sceneArtId,
    narrationHindi: suggestion?.firstHalf?.narrationHindi?.trim() || fallbackNarr1,
    subtitleHindi: suggestion?.firstHalf?.subtitleHindi?.trim() || fallbackSub1,
    visualPrompt: prompt1,
    cameraMotion: suggestion?.firstHalf?.cameraMotion ?? scene.cameraMotion ?? 'zoom-in',
    durationSec: dur1,
  };

  const secondHalf: StoryScene = {
    ...scene,
    id: `${scene.id}-b`,
    hookCaption: undefined,
    shotType: suggestion?.secondHalf?.shotType ?? 'climax_closeup',
    sceneArtId: suggestion?.secondHalf?.sceneArtId,
    narrationHindi: suggestion?.secondHalf?.narrationHindi?.trim() || fallbackNarr2,
    subtitleHindi: suggestion?.secondHalf?.subtitleHindi?.trim() || fallbackSub2,
    visualPrompt: prompt2,
    cameraMotion:
      suggestion?.secondHalf?.cameraMotion ??
      (scene.cameraMotion === 'zoom-in' ? 'pan-right' : 'zoom-in'),
    durationSec: dur2,
    // Clear inherited imageUrl when no explicit second art was chosen so matcher assigns distinct art
    imageUrl: undefined,
  };

  return [firstHalf, secondHalf];
}

export function getOutroCtaCopy(
  topic: StoryTopic,
  partNumber?: number,
  totalParts?: number
): string {
  const part = partNumber ?? 1;
  const total = totalParts ?? 1;
  if (total > 1 && part < total) {
    return `आगे क्या हुआ? Part ${part + 1} जरूर देखें!`;
  }
  return topic === 'horror'
    ? 'अगली डरावनी कहानी के लिए Follow करें'
    : 'रोज़ ऐसी कथा सुनने के लिए Subscribe करें';
}

export interface TimelineEntry {
  scene: StoryScene;
  index: number;
  startSec: number;
  endSec: number;
}

export function buildSceneTimeline(scenes: StoryScene[]): TimelineEntry[] {
  let cursor = 0;
  return scenes.map((scene, index) => {
    const duration = Math.max(1.5, Number(scene.durationSec) || 6);
    const entry: TimelineEntry = {
      scene,
      index,
      startSec: Number(cursor.toFixed(2)),
      endSec: Number((cursor + duration).toFixed(2)),
    };
    cursor += duration;
    return entry;
  });
}

export function getActiveSceneAtTime(
  scenes: StoryScene[],
  currentTimeSec: number
): { entry: TimelineEntry; localProgress: number } | null {
  if (scenes.length === 0) return null;
  const timeline = buildSceneTimeline(scenes);
  const total = timeline[timeline.length - 1].endSec;
  const clamped = Math.max(0, Math.min(currentTimeSec, Math.max(0, total - 0.001)));

  for (const entry of timeline) {
    if (clamped >= entry.startSec && clamped < entry.endSec) {
      const span = entry.endSec - entry.startSec;
      const localProgress = span > 0 ? (clamped - entry.startSec) / span : 0;
      return { entry, localProgress: Math.max(0, Math.min(1, localProgress)) };
    }
  }

  const last = timeline[timeline.length - 1];
  return { entry: last, localProgress: 1 };
}

export interface SceneTransitionState {
  current: TimelineEntry;
  next: TimelineEntry | null;
  localProgress: number;
  crossfadeAlpha: number;
  showHookOverlay: boolean;
}

export function getSceneTransitionInfo(
  scenes: StoryScene[],
  currentTimeSec: number,
  transitionWindowSec = 0.6
): SceneTransitionState | null {
  if (scenes.length === 0) return null;
  const timeline = buildSceneTimeline(scenes);
  const total = timeline[timeline.length - 1].endSec;
  const clamped = Math.max(0, Math.min(currentTimeSec, Math.max(0, total - 0.001)));

  let currentIndex = timeline.length - 1;
  for (let i = 0; i < timeline.length; i++) {
    if (clamped >= timeline[i].startSec && clamped < timeline[i].endSec) {
      currentIndex = i;
      break;
    }
  }

  const current = timeline[currentIndex];
  const next = currentIndex < timeline.length - 1 ? timeline[currentIndex + 1] : null;
  const span = Math.max(0.1, current.endSec - current.startSec);
  const localProgress = Math.max(0, Math.min(1, (clamped - current.startSec) / span));

  let crossfadeAlpha = 0;
  if (next && transitionWindowSec > 0) {
    const remaining = current.endSec - clamped;
    const effectiveWindow = Math.min(transitionWindowSec, span * 0.35);
    if (remaining >= 0 && remaining < effectiveWindow) {
      crossfadeAlpha = Math.max(0, Math.min(1, 1 - remaining / effectiveWindow));
    }
  }

  const showHookOverlay =
    currentIndex === 0 &&
    clamped <= Math.min(3.8, span * 0.85) &&
    Boolean(current.scene.hookCaption || current.scene.shotType === 'character_hook');

  return {
    current,
    next,
    localProgress,
    crossfadeAlpha,
    showHookOverlay,
  };
}

export type ConcreteTransitionEffect = Exclude<TransitionEffect, 'auto'>;

export interface TransitionOptionMeta {
  id: TransitionEffect;
  label: string;
  description: string;
}

export const TRANSITION_EFFECT_OPTIONS: TransitionOptionMeta[] = [
  {
    id: 'auto',
    label: 'Automated (Story-Coherent)',
    description: 'Selects smooth dissolve, slide, or atmospheric fade per act & camera beat.',
  },
  {
    id: 'cross_dissolve',
    label: 'Cross-Dissolve',
    description: 'Layered blend across consecutive scenes without dark dips.',
  },
  {
    id: 'fade',
    label: 'Smooth Fade',
    description: 'Atmospheric shadow dip between act changes and dramatic pauses.',
  },
  {
    id: 'slide',
    label: 'Cinema Slide',
    description: 'Fluid horizontal pan wipe matching action momentum.',
  },
];

export function resolveSceneTransitionMode(
  storyTransition: TransitionEffect | undefined,
  outgoingScene: StoryScene,
  incomingScene: StoryScene | undefined,
  cutIndex: number,
  topic: StoryTopic
): ConcreteTransitionEffect {
  if (incomingScene?.transitionIn && incomingScene.transitionIn !== 'auto') {
    return incomingScene.transitionIn;
  }
  if (storyTransition && storyTransition !== 'auto') {
    return storyTransition;
  }

  // Automated Story-Coherent Transition Manager heuristics:
  // 1. Entering final resolution/ending: smooth cross-dissolve (or moody fade for horror)
  if (incomingScene?.part === 'ending' || incomingScene?.shotType === 'resolution_vista') {
    return topic === 'horror' && incomingScene.sfxCue === 'night_wind' ? 'fade' : 'cross_dissolve';
  }
  // 2. Act shift or thunder/suspense beat: dramatic fade
  if (
    (incomingScene && outgoingScene.part !== incomingScene.part && topic === 'horror') ||
    incomingScene?.sfxCue === 'thunder_rumble'
  ) {
    return 'fade';
  }
  // 3. Panning/dynamic action beats: cinema slide (never slide twice consecutively at act climax)
  if (
    outgoingScene.cameraMotion === 'pan-left' ||
    outgoingScene.cameraMotion === 'pan-right' ||
    incomingScene?.cameraMotion === 'pan-left' ||
    incomingScene?.cameraMotion === 'pan-right' ||
    (outgoingScene.part === 'middle' && cutIndex % 2 === 1)
  ) {
    return 'slide';
  }
  // 4. Default balanced flow between dissolve and slide
  return cutIndex % 3 === 1 ? 'slide' : 'cross_dissolve';
}

export function buildAutoTransitionSequence(
  scenes: StoryScene[],
  topic: StoryTopic
): StoryScene[] {
  return scenes.map((sc, idx) => {
    if (idx === 0) {
      return { ...sc, transitionIn: 'auto' };
    }
    const prev = scenes[idx - 1];
    const mode = resolveSceneTransitionMode('auto', prev, sc, idx - 1, topic);
    return { ...sc, transitionIn: mode };
  });
}

export function splitSubtitleIntoLines(text: string, maxCharsPerLine = 38): string[] {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return [];
  const words = cleaned.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

export interface KaraokeCaptionDisplay {
  words: string[];
  activeWordIndex: number;
  chunkIndex: number;
  totalChunks: number;
}

export function getActiveCaptionDisplay(
  text: string,
  localProgress: number,
  maxWordsPerChunk = 4
): KaraokeCaptionDisplay | null {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  const allWords = cleaned.split(' ').filter(Boolean);
  if (allWords.length === 0) return null;

  const chunkSize = Math.max(2, maxWordsPerChunk);
  const chunks: string[][] = [];
  for (let i = 0; i < allWords.length; i += chunkSize) {
    chunks.push(allWords.slice(i, i + chunkSize));
  }

  const clamped = Math.max(0, Math.min(0.9999, localProgress));
  const globalWordIdx = Math.min(allWords.length - 1, Math.floor(clamped * allWords.length));
  const chunkIndex = Math.min(chunks.length - 1, Math.floor(globalWordIdx / chunkSize));
  const activeWordIndex = globalWordIdx - chunkIndex * chunkSize;

  return {
    words: chunks[chunkIndex],
    activeWordIndex,
    chunkIndex,
    totalChunks: chunks.length,
  };
}

export interface AnimeMotionState {
  easedProgress: number;
  cutImpact: number;
  hookPop: number;
  outroAlpha: number;
}

export function getAnimeMotionState(
  scenes: StoryScene[],
  currentTimeSec: number
): AnimeMotionState {
  const transition = getSceneTransitionInfo(scenes, currentTimeSec, 0.55);
  const totalSec = Math.max(1, calculateTotalDuration(scenes));
  const clamped = Math.max(0, Math.min(currentTimeSec, totalSec));

  if (!transition) {
    return { easedProgress: 0, cutImpact: 0, hookPop: 0, outroAlpha: 0 };
  }

  const p = transition.localProgress;
  // Smooth ease-in-out sine curve for fluid anime camera movement
  const easedProgress = 0.5 - 0.5 * Math.cos(Math.PI * p);

  // Beat-punch over first 0.45s of each scene entry
  const sceneElapsed = Math.max(0, clamped - transition.current.startSec);
  const cutImpact = sceneElapsed < 0.45 ? Math.pow(1 - sceneElapsed / 0.45, 2) : 0;

  // Hook entrance spring curve in opening 3.6s
  let hookPop = 0;
  if (transition.showHookOverlay) {
    const enter = Math.min(1, clamped / 0.35);
    const remainingHook = Math.max(0, 3.6 - clamped);
    const exit = remainingHook < 0.35 ? remainingHook / 0.35 : 1;
    hookPop = Math.min(enter, exit);
  }

  // Outro CTA fade-in during final 2.3s of story
  const remainingTotal = Math.max(0, totalSec - clamped);
  const outroAlpha =
    totalSec >= 8 && remainingTotal <= 2.3 ? Math.min(1, (2.3 - remainingTotal) / 0.55) : 0;

  return { easedProgress, cutImpact, hookPop, outroAlpha };
}

export function validateStoryStructure(input: {
  title: string;
  beginning: string;
  middle: string;
  ending: string;
  scenes: StoryScene[];
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input.title.trim()) errors.push('Story title is required.');
  if (!input.beginning.trim()) errors.push('Beginning section is required.');
  if (!input.middle.trim()) errors.push('Middle section is required.');
  if (!input.ending.trim()) errors.push('Ending section is required.');
  if (!input.scenes || input.scenes.length < 3) {
    errors.push('At least 3 scenes (Beginning, Middle, Ending) are required.');
  } else {
    const hasBeginning = input.scenes.some((s) => s.part === 'beginning');
    const hasMiddle = input.scenes.some((s) => s.part === 'middle');
    const hasEnding = input.scenes.some((s) => s.part === 'ending');
    if (!hasBeginning || !hasMiddle || !hasEnding) {
      errors.push('Scenes must cover beginning, middle, and ending.');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function sanitizeYouTubeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  let totalChars = 0;

  for (const raw of tags) {
    const tag = raw.replace(/^#/, '').trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    if (totalChars + tag.length + 1 > 450) break;
    seen.add(key);
    clean.push(tag);
    totalChars += tag.length + 1;
  }
  return clean;
}

export function formatInstagramHashtags(hashtags: string[]): string[] {
  const seen = new Set<string>();
  const formatted: string[] = [];
  for (const raw of hashtags) {
    const stripped = raw.replace(/^#+/, '').replace(/\s+/g, '');
    if (!stripped) continue;
    const tag = `#${stripped}`;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    formatted.push(tag);
    if (formatted.length >= 25) break;
  }
  return formatted;
}

export interface DailyProgressSummary {
  youtubeShortsDone: number;
  youtubeShortsTarget: number;
  instagramReelsDone: number;
  instagramReelsTarget: number;
  youtubeLongDone: number;
  youtubeLongTarget: number;
  overallCompletionPct: number;
}

export function computeDailyProgress(
  stories: StoryProject[],
  automation: DailyAutomationConfig,
  isoDatePrefix: string
): DailyProgressSummary {
  const todaysStories = stories.filter((s) => s.createdAt.startsWith(isoDatePrefix));
  const youtubeShortsDone = todaysStories.filter((s) => s.format === 'youtube_short').length;
  const instagramReelsDone = todaysStories.filter((s) => s.format === 'instagram_reel').length;
  const youtubeLongDone = todaysStories.filter((s) => s.format === 'youtube_long').length;

  const tShorts = Math.max(0, automation.dailyTargets.youtubeShorts);
  const tReels = Math.max(0, automation.dailyTargets.instagramReels);
  const tLong = Math.max(0, automation.dailyTargets.youtubeLong);
  const totalTarget = tShorts + tReels + tLong;

  const cappedDone =
    Math.min(youtubeShortsDone, tShorts) +
    Math.min(instagramReelsDone, tReels) +
    Math.min(youtubeLongDone, tLong);

  const overallCompletionPct =
    totalTarget > 0 ? Math.round((cappedDone / totalTarget) * 100) : 100;

  return {
    youtubeShortsDone,
    youtubeShortsTarget: tShorts,
    instagramReelsDone,
    instagramReelsTarget: tReels,
    youtubeLongDone,
    youtubeLongTarget: tLong,
    overallCompletionPct,
  };
}

export interface CreatorDashboardMetrics {
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  engagementRatePct: number;
  totalIncomeInr: number;
  publishedCount: number;
  scheduledCount: number;
}

export function computeCreatorMetrics(
  stories: StoryProject[],
  incomeEntries: IncomeEntry[]
): CreatorDashboardMetrics {
  const liveStories = stories.filter(
    (s) => s.status === 'published' || Boolean(s.youtubeVideoId)
  );
  const totalViews = liveStories.reduce((acc, s) => acc + (s.metrics?.views ?? 0), 0);
  const totalLikes = liveStories.reduce((acc, s) => acc + (s.metrics?.likes ?? 0), 0);
  const totalShares = liveStories.reduce((acc, s) => acc + (s.metrics?.shares ?? 0), 0);
  const totalComments = liveStories.reduce((acc, s) => acc + (s.metrics?.comments ?? 0), 0);

  const engagementRatePct =
    totalViews > 0
      ? Number((((totalLikes + totalShares + totalComments) / totalViews) * 100).toFixed(1))
      : 0;

  const ledgerSum = incomeEntries.reduce((acc, item) => acc + (item.amountInr ?? 0), 0);
  const storyIncome = liveStories.reduce((acc, s) => acc + (s.metrics?.estimatedIncomeInr ?? 0), 0);

  return {
    totalViews,
    totalLikes,
    totalShares,
    engagementRatePct,
    totalIncomeInr: Math.max(ledgerSum, storyIncome),
    publishedCount: liveStories.length,
    scheduledCount: stories.filter((s) => s.status === 'scheduled').length,
  };
}

export function formatIndianCurrency(amountInr: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amountInr);
}

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function formatDurationMMSS(totalSeconds: number): string {
  const sec = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}
