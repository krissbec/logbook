# Klatredagbok

Mobile-first PWA climbing logbook. Log climbs from your phone, review and import from Excel, and explore your stats.

## Setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Copy your **Project URL** and **anon public** key from **Project Settings → API**

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo
3. Add environment variables in **Project Settings → Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy — every push to `main` auto-deploys

## PWA icons

Placeholder green icons are included. Replace `public/icons/icon-192.png` and `public/icons/icon-512.png` with your own artwork.

## Grade conversion

Norwegian ↔ French grade mappings are in `lib/grades.ts`. The table covers NO 3–10+ and FR 3–9b+. These are standard approximations — adjust the `GRADE_TABLE` array if your logbook uses different equivalences.

## Importing an existing Excel logbook

1. Go to **Gjennomgå** → **Last opp Excel / CSV**
2. Drop your `.xlsx` file — the app maps the original Norwegian headers automatically
3. Step through each entry in the wizard, fix any flagged issues, then **Lagre N klatringer**

Original headers expected: `Dato`, `Navn på rute`, `Klatrefelt/Fjell`, `Rutegrad`, `Lengde på ruten`, `Type sikringer`, `Værforhold`, `Klatrepartner`, `Bestigningsstil`, `Merknader`
