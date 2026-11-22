export interface GameCatalogItem {
  id: string;
  name: string;
  uzLabel: string;
  mechanic: "builder" | "cards" | "arcade";
  description: string;
}

export const GAME_TYPES: GameCatalogItem[] = [
  {
    id: "sentence-scramble",
    name: "Sentence Scramble",
    uzLabel: "2D So'z kartalaridan gap yig'ish",
    mechanic: "builder",
    description: "2D so'z kartochkalarini tartib bilan bosib to'g'ri inglizcha gap tuzing.",
  },
  {
    id: "phrasal-match",
    name: "Phrasal Match",
    uzLabel: "2D Kartochka moslashtirish",
    mechanic: "cards",
    description: "Phrasal verb kartasini uning aniq ma'nosi kartasiga moslang.",
  },
  {
    id: "synonym-duel",
    name: "Synonym Duel",
    uzLabel: "2D Sinonim kartalari",
    mechanic: "cards",
    description: "So'z kartasiga eng mos sinonim kartani tez topib combo yig'ing.",
  },
  {
    id: "antonym-clash",
    name: "Antonym Clash",
    uzLabel: "2D Antonim to'qnashuvi",
    mechanic: "cards",
    description: "Qarama-qarshi ma'noli kartani topib vaqt bosimini yengib o'ting.",
  },
  {
    id: "collocation-chain",
    name: "Collocation Chain",
    uzLabel: "2D Birikma zanjiri",
    mechanic: "cards",
    description: "Tabiiy birikadigan inglizcha so'z kartalarini ulab zanjir hosil qiling.",
  },
  {
    id: "word-blitz",
    name: "Word Blitz",
    uzLabel: "2D Tezkor so'z arenasi",
    mechanic: "arcade",
    description: "Ta'rif va ishoralarga qarab to'g'ri so'z kartasini chaqqon tanlang.",
  },
  {
    id: "cloze-sprint",
    name: "Cloze Sprint",
    uzLabel: "2D Bo'shliqni to'ldirish",
    mechanic: "arcade",
    description: "Gapdagi bo'sh joyga mos 2D so'z kartasini joylashtiring.",
  },
  {
    id: "odd-one-out",
    name: "Odd One Out",
    uzLabel: "2D Ortiqcha kartani topish",
    mechanic: "arcade",
    description: "4 ta 2D kartadan qoida yoki ma'no bo'yicha boshqasini ajrating.",
  },
  {
    id: "error-hunter",
    name: "Error Hunter",
    uzLabel: "2D Xato kartani ovlash",
    mechanic: "arcade",
    description: "Grammatik yoki imloviy xato bor kartani topib zararsizlantiring.",
  },
  {
    id: "context-detective",
    name: "Context Detective",
    uzLabel: "2D Kontekst dalillari",
    mechanic: "arcade",
    description: "Kontekst dalillaridan kelib chiqib yashirin ma'noni aniqlang.",
  },
  {
    id: "tense-shift",
    name: "Tense Shift",
    uzLabel: "2D Zamon o'zgartirish",
    mechanic: "arcade",
    description: "Zamon ko'rsatkichiga qarab fe'lning to'g'ri shaklini tanlang.",
  },
  {
    id: "idiom-decoder",
    name: "Idiom Decoder",
    uzLabel: "2D Idiom dekoderi",
    mechanic: "arcade",
    description: "Inglizcha iboraning ko'chma ma'nosini 2D kartalar orasidan toping.",
  },
];

export interface GameRoundQuestion {
  id: number;
  prompt: string;
  targetSentence?: string;
  chunks?: string[];
  options: string[];
  correctIndex: number;
  explanation: string;
}
