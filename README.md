# ⚡ VOLTIX — Gestione Professionale Bollette Elettriche

App web per il monitoraggio energetico professionale: analisi consumi per fascia, andamento PUN, confronto offerte mercato con AI.

---

## 🗂 Struttura Progetto

```
voltix/
├── src/
│   ├── components/shared/   # Layout, Sidebar
│   ├── pages/               # Dashboard, Bollette, Consumi, PUN, Analisi AI, Impostazioni
│   ├── lib/                 # Supabase client, AuthContext, utils
│   └── styles/              # CSS design system
├── netlify/functions/       # Backend serverless
│   ├── analyze-bill.js      # Analisi PDF bolletta con Claude AI
│   ├── fetch-pun.js         # Fetch automatico PUN da GME
│   └── analisi-mercato.js   # Analisi mercato offerte con Claude AI
├── supabase_schema.sql      # Schema DB completo (eseguire su Supabase)
├── netlify.toml             # Config Netlify
└── .env.example             # Template variabili d'ambiente
```

---

## 🚀 Deploy — Passo per Passo

### 1. Supabase — Setup Database

1. Vai su [supabase.com](https://supabase.com) e apri il tuo progetto esistente
2. Vai su **SQL Editor** → **New Query**
3. Copia e incolla tutto il contenuto di `supabase_schema.sql`
4. Clicca **Run** — verranno create tutte le tabelle, indici, policy RLS e i dati PUN storici 2022-2025

> ⚠️ Se hai già tabelle con lo stesso nome, lo script usa `CREATE TABLE IF NOT EXISTS` quindi non sovrascrive nulla.

**Prendi nota di:**
- Project URL → `https://xxxx.supabase.co`
- Anon Key → dalla sezione **Settings → API**
- Service Role Key → dalla sezione **Settings → API** (usata solo nelle Netlify Functions)

---

### 2. Configurazione Variabili d'Ambiente

Crea un file `.env` nella root del progetto (copia da `.env.example`):

```env
VITE_SUPABASE_URL=https://tuoprogetto.supabase.co
VITE_SUPABASE_ANON_KEY=la_tua_anon_key
ANTHROPIC_API_KEY=sk-ant-...
```

> ⚠️ **Sicurezza:** `ANTHROPIC_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY` vengono usate SOLO nelle Netlify Functions (backend). Non vengono mai esposte al browser.

---

### 3. Netlify — Deploy

#### Opzione A: Deploy da GitHub (consigliato)

1. Carica il progetto su un repository GitHub
2. Vai su [netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
3. Seleziona il repository
4. Le impostazioni di build vengono lette automaticamente da `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Prima di fare deploy, vai su **Site settings → Environment variables** e aggiungi:

| Variabile | Valore |
|-----------|--------|
| `VITE_SUPABASE_URL` | `https://tuoprogetto.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | la tua anon key |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `SUPABASE_SERVICE_ROLE_KEY` | la tua service role key |

6. Clicca **Deploy site**

#### Opzione B: Deploy manuale con Netlify CLI

```bash
npm install
npm run build
npx netlify deploy --prod --dir=dist
```

---

### 4. Test Post-Deploy

1. Apri l'URL del sito Netlify
2. Registra un account → controlla email per conferma
3. Accedi
4. Vai su **Impostazioni** → aggiungi il tuo contratto attuale
5. Vai su **Bollette** → carica un PDF o inserisci manualmente
6. Verifica che **Analisi AI** funzioni (richiede almeno 1 bolletta)

---

## 📊 Funzionalità

### Dashboard
- KPI istantanei: consumi anno, spesa, prezzo effettivo, PUN ultimo mese
- Grafico consumi mensili per fascia F1/F2/F3
- Andamento PUN storico
- Ripartizione costi ultima bolletta (torta)
- Mix fasce storico con progress bar
- Tabella ultime 5 bollette

### Bollette
- **Analisi PDF con AI**: carica il PDF → Claude estrae automaticamente tutti i dati
- **Inserimento manuale**: form completo con tutti i campi
- Tabella storico con tutte le voci di costo
- Modifica e cancellazione

### Consumi & Costi
- **Vista Mensile**: KPI anno, grafici per fascia, importo mensile, ripartizione componenti costo, tabella dettaglio
- **Confronto Annuale**: grafici e tabella comparativa anno per anno con delta %
- **Analisi Prezzi**: prezzo pagato vs PUN mercato, prezzi per fascia nel tempo

### Andamento PUN
- Storico completo dal 2022 (pre-caricato)
- **Fetch automatico** dal GME (Gestore Mercati Energetici)
- **Inserimento manuale** con link diretto a mercatoelettrico.org
- Grafici: storico totale, ultimi 12 mesi, media annuale, per fascia
- Tabella con delta mensile e fonte dati

### Analisi AI Mercato
Tre tipi di analisi basate sui tuoi dati reali:
1. **Confronto Offerte**: cerca offerte su tutto il mercato (non solo big player), stima risparmio, pro/contro per ogni offerta
2. **Ottimizza Consumi**: analizza il mix di fasce, suggerisce spostamento carichi, valuta mono vs biorario
3. **Scenario PUN**: analizza trend PUN, fattori di mercato, consiglia fisso vs indicizzato

### Impostazioni
- Profilo utenza (nome, indirizzo, regione, zona GME)
- Gestione contratti con tutti i dettagli tariffari
- Switch contratto attivo (usato per il confronto AI)

---

## 🗄 Database — Tabelle

| Tabella | Descrizione |
|---------|-------------|
| `bollette` | Dati bollette inserite (consumi, prezzi, costi) |
| `contratti` | Contratti elettrici dell'utente |
| `pun_storico` | Prezzi PUN mensili GME (2022→oggi) |
| `analisi_ai` | Storico analisi AI effettuate |
| `impostazioni` | Preferenze utente |

Tutte le tabelle hanno **Row Level Security** abilitata: ogni utente vede solo i propri dati.

---

## 🔧 Sviluppo Locale

```bash
# Installa dipendenze
npm install

# Installa Netlify CLI (per testare le functions in locale)
npm install -g netlify-cli

# Avvia in sviluppo con Netlify Dev (include le functions)
netlify dev

# Solo frontend
npm run dev
```

> Con `netlify dev` le API functions sono disponibili su `http://localhost:8888/.netlify/functions/`

---

## 📝 Note Tecniche

### Fasce Orarie (delibera ARERA)
- **F1** (Punta): Lunedì-Venerdì ore 8:00-19:00
- **F2** (Intermedia): Lunedì-Venerdì ore 7:00-8:00 e 19:00-23:00 + Sabato 7:00-23:00
- **F3** (Valle): Lunedì-Sabato ore 23:00-7:00 + Domeniche e festivi tutto il giorno

### PUN (Prezzo Unico Nazionale)
- Pubblicato dal **GME** su [mercatoelettrico.org](https://www.mercatoelettrico.org)
- Unità: **€/MWh** (dividi per 10 per c€/kWh, per 1000 per €/kWh)
- Il GME pubblica i dati definitivi con circa 1 mese di ritardo
- Per dati recenti → inserimento manuale dalla sezione PUN

### Analisi PDF Bollette
- Supporta PDF di qualsiasi fornitore italiano
- Usa Claude Opus per la massima precisione nell'estrazione
- I campi non trovati vengono lasciati vuoti per inserimento manuale

---

## 🛠 Stack Tecnologico

- **Frontend**: React 18 + Vite + React Router
- **Styling**: CSS custom (no Tailwind) con design system dark/amber
- **Grafici**: Recharts
- **Backend**: Netlify Functions (serverless Node.js)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **AI**: Claude API (Anthropic) — analisi PDF + market intelligence
- **Deploy**: Netlify

---

## ⚠️ Troubleshooting

**L'analisi PDF non funziona**
→ Verifica che `ANTHROPIC_API_KEY` sia impostata nelle env vars di Netlify

**Errore "Variabili Supabase mancanti"**
→ Verifica `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nelle env vars

**Il fetch GME non aggiorna i dati**
→ Il GME pubblica i dati con ritardo. Inserisci manualmente da mercatoelettrico.org → Esiti di mercato → MGP → Prezzi medi mensili

**Errore RLS su Supabase**
→ Assicurati di aver eseguito tutto lo script SQL incluse le policy `CREATE POLICY`

**Le Netlify Functions danno 502**
→ Controlla i log su Netlify → Functions → seleziona la function → View logs
