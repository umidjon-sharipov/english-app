# ▲ English Studio — AI-Driven English Learning Ecosystem

**English Studio** is a full-stack web ecosystem built for structured, interactive English language learning across **CEFR levels A1–C2**. Powered by **Google Gemini AI**, the **Web Speech API**, and **Next.js 16**, the platform delivers a personalized study, practice, and assessment environment for every learner.

🌐 **Live Demo:** [english-use.vercel.app](https://english-use.vercel.app)

---

## ✨ Core Learning Modules

1. **Tests Studio (`5–100 Qs`)**
   - AI-powered generation of 5 to 100 grammar and vocabulary questions tailored to any topic and CEFR level.
   - Real-time room management (Founder moderation: `Open/Close`, `Kick`, `Block/Unblock`), AI hints, detailed answer explanations, and custom-styled **PDF worksheet** exports.

2. **Reading Studio (`Academic & IELTS`)**
   - Generation of Cambridge and IELTS-style academic reading passages.
   - Multiple-choice and open-ended comprehension questions with automated AI grading and downloadable PDF study sheets.

3. **Speaking Studio (`Microphone AI`)**
   - Live browser voice recording via the Web Speech API.
   - AI-driven evaluation of pronunciation, fluency, grammar accuracy, lexical resource, and estimated CEFR proficiency.

4. **Listening Studio**
   - Level-adapted listening comprehension exercises with audio playback, targeted questions, and instant feedback.

5. **Vocabulary Builder**
   - Curated CEFR A1–C2 word bank with search, filtering, and AI-assisted vocabulary set generation.

6. **AI Interactive Games**
   - **Sentence Scramble:** Reconstruct sentences from shuffled word cards with audio pronunciation on click.
   - **Card & Phrasal Match:** Pair phrasal verbs and idioms with their definitions.
   - **Combo Streak** scoring system with post-game AI pedagogical performance analysis.

7. **Global AI Diagnostics & 14-Day Roadmap**
   - Unified CEFR proficiency assessment aggregating performance across Tests, Reading, Speaking, and Games, complete with a personalized 14-day study roadmap.

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Framework** | Next.js 16.4 (App Router, Turbopack, Cache Components) |
| **Language & UI** | TypeScript, React, Tailwind CSS (Vercel Minimalist Dark/Light UI) |
| **Database & ORM** | Neon PostgreSQL, Prisma ORM 6 |
| **AI & Speech** | Google Gemini API, Browser Web Speech API |
| **Auth & Security** | Custom JWT / Cookie Authentication, Role-based Room Moderation |
| **Deployment** | Vercel Production |

---

## 📁 Project Structure

```text
english-app/
├── app/
│   ├── api/                # REST API routes (tests, reading, speaking, listening, vocabulary, games, analytics, auth)
│   ├── auth/               # Sign-in and registration pages
│   ├── games/              # Interactive AI games module
│   ├── listening/          # Listening comprehension module
│   ├── profile/            # User profile and account settings
│   ├── reading/            # Reading Studio and passage sessions
│   ├── speaking/           # Speaking Studio and voice analysis
│   ├── tests/              # Tests Studio and live test rooms
│   ├── vocabulary/         # Vocabulary builder module
│   ├── icon.tsx            # Dynamic Favicon generator
│   ├── opengraph-image.tsx # Dynamic Open Graph preview image
│   └── page.tsx            # Landing page & Global AI Diagnostics
├── components/             # Reusable UI components (ThemeProvider, NotificationProvider, etc.)
├── lib/                    # Prisma client, AI helpers, and shared utilities
└── prisma/                 # Database schema (schema.prisma)