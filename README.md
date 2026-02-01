# What Still Open Sydney

**What Still Open Sydney** is a fast, mobile-first web app that answers one deceptively hard question:

> **“What’s actually open right now?”**

Instead of static opening hours or unreliable “Open Now” badges, the app uses **live Google Places data**, **client-side time reasoning**, and a **lightweight ranking algorithm** to surface venues that are genuinely useful *at a specific time*.  

It also includes **Plan My Night ✨**, an itinerary generator that builds a **Food → Activity → Bar** plan and makes it instantly shareable.

---

## 🚀 Live Demo Features

### 🔎 Time-aware venue search
- Select any **date & time**
- Search by:
  - **Suburb**
  - **Near Me** (browser geolocation + adjustable radius)
- Optional **category filter**:
  - Restaurant, Cafe, Dessert, Activity, Bar
- Each result shows:
  - Photo (Google Places)
  - Suburb
  - **“Closes in …”** (computed client-side)
  - Website & Directions
  - EatClub availability badge (if detected)

---

### ✨ Plan My Night (Algorithmic Itinerary Builder)

Generates a 3-step night plan:
1. **Food**
2. **Activity**
3. **Bar**

How it works:
- Runs **three category-specific searches** using the same time + location context
- Enriches venues with EatClub detection
- Scores venues using a **weighted model**
- Samples **randomly from the top 25%** to avoid repetitive results
- Ensures **no duplicate venues** across the itinerary

The result is a plan that’s:
- High quality
- Non-deterministic (variety)
- Explainable (see below)

---

### 🧠 Explainability Panel (Recruiter Gold)

Each suggested venue can expose a **“Why was this picked?”** breakdown:

- Minutes until close (normalized)
- EatClub bonus
- Actionability score (website / booking link)
- Final weighted score

This makes the ranking logic:
- Transparent
- Debuggable
- Easy to discuss in interviews

> Not a black box — every decision is explainable.

---

### 🔗 Shareable Plans
Generated plans can be shared via a URL that serializes:
- Selected datetime
- Venue IDs
- Fallback display fields (name, suburb, links)

Anyone opening the link sees the **same itinerary**, instantly.

---

## ⚙️ Scoring & Ranking Model

Each venue is scored using **only data the app already has**.

### Inputs
- **Open-time score**  
  Minutes until close, normalized and capped at 4 hours
- **EatClub bonus**  
  Binary signal (on EatClub or not)
- **Actionability score**
  - Has website
  - Has booking link

### Weights
| Factor | Weight |
|------|--------|
| Open time | 0.60 |
| EatClub | 0.25 |
| Actionability | 0.15 |

### Selection Strategy
Instead of always picking the top-ranked venue:
- Venues are sorted by score
- A random pick is made from the **top 25%**
- This balances **quality + variety**

---

## 🧱 Tech Stack

- **Next.js (App Router)**
- **TypeScript**
- **Google Places API**
  - Text Search
  - Nearby Search
  - Photos
- Client-side time parsing & cross-midnight handling
- REST API routes for data fetching and enrichment

---

## 🗂️ Project Structure (Key Files)

```text
app/
├── page.tsx                # Main UI, state, scoring & Plan My Night logic
├── plan/page.tsx           # Shared plan view
├── api/
│   ├── search-google/      # Suburb-based Places search
│   ├── search-nearby/      # Nearby (lat/lng/radius) search
│   ├── photo/              # Google Places photo proxy
│   └── eatclub-check/      # EatClub enrichment
lib/
└── types.ts                # Shared TypeScript types
