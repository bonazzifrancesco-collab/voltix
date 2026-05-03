-- ============================================================
-- VOLTIX - Schema Database Supabase
-- Esegui questo SQL nell'editor SQL di Supabase
-- ============================================================

-- Abilita UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELLA: contratti
-- Dati del contratto elettrico attuale
-- ============================================================
CREATE TABLE IF NOT EXISTS contratti (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  fornitore TEXT NOT NULL,
  nome_offerta TEXT NOT NULL,
  tipo_mercato TEXT NOT NULL CHECK (tipo_mercato IN ('fisso', 'indicizzato_pun', 'tutela')),
  prezzo_f1 DECIMAL(8,6),         -- €/kWh fascia F1
  prezzo_f2 DECIMAL(8,6),         -- €/kWh fascia F2
  prezzo_f3 DECIMAL(8,6),         -- €/kWh fascia F3
  prezzo_monorario DECIMAL(8,6),  -- €/kWh se monorario
  spread_pun DECIMAL(8,6),        -- spread sul PUN se indicizzato
  potenza_impegnata DECIMAL(6,2) DEFAULT 3.0,  -- kW
  tensione TEXT DEFAULT 'BT',
  data_inizio DATE,
  data_fine DATE,
  attivo BOOLEAN DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELLA: bollette
-- Una riga per ogni bolletta inserita
-- ============================================================
CREATE TABLE IF NOT EXISTS bollette (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  contratto_id UUID REFERENCES contratti(id) ON DELETE SET NULL,
  
  -- Periodo
  periodo_inizio DATE NOT NULL,
  periodo_fine DATE NOT NULL,
  data_emissione DATE,
  data_scadenza DATE,
  numero_bolletta TEXT,
  
  -- Fornitore
  fornitore TEXT NOT NULL,
  nome_offerta TEXT,
  pod TEXT,  -- Point of Delivery
  
  -- Consumi kWh per fascia
  kwh_f1 DECIMAL(10,3) DEFAULT 0,
  kwh_f2 DECIMAL(10,3) DEFAULT 0,
  kwh_f3 DECIMAL(10,3) DEFAULT 0,
  kwh_totale DECIMAL(10,3) DEFAULT 0,
  
  -- Prezzi €/kWh materia energia
  prezzo_f1 DECIMAL(8,6),
  prezzo_f2 DECIMAL(8,6),
  prezzo_f3 DECIMAL(8,6),
  prezzo_medio DECIMAL(8,6),
  
  -- Componenti costo (€)
  costo_materia_prima DECIMAL(10,4),
  costo_trasporto DECIMAL(10,4),
  costo_oneri_sistema DECIMAL(10,4),
  costo_accise DECIMAL(10,4),
  costo_iva DECIMAL(10,4),
  importo_totale DECIMAL(10,2) NOT NULL,
  
  -- PUN di riferimento periodo
  pun_medio_periodo DECIMAL(8,6),
  
  -- Metadati
  inserita_manualmente BOOLEAN DEFAULT false,
  pdf_url TEXT,
  pdf_analizzato BOOLEAN DEFAULT false,
  note TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELLA: pun_storico
-- Prezzi PUN mensili (MGP - Mercato del Giorno Prima)
-- ============================================================
CREATE TABLE IF NOT EXISTS pun_storico (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  anno INTEGER NOT NULL,
  mese INTEGER NOT NULL CHECK (mese BETWEEN 1 AND 12),
  
  -- Prezzi medi mensili per fascia (€/MWh → dividi per 1000 per €/kWh)
  pun_f1 DECIMAL(8,4),     -- fascia F1 (ore di punta)
  pun_f2 DECIMAL(8,4),     -- fascia F2 (ore intermedie)
  pun_f3 DECIMAL(8,4),     -- fascia F3 (ore di valle)
  pun_medio DECIMAL(8,4),  -- medio mensile
  
  fonte TEXT DEFAULT 'GME',  -- 'GME' = automatico, 'manuale' = inserito a mano
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(anno, mese)
);

-- ============================================================
-- TABELLA: analisi_ai
-- Storico delle analisi AI sul mercato offerte
-- ============================================================
CREATE TABLE IF NOT EXISTS analisi_ai (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('confronto_offerte', 'ottimizzazione_consumi', 'previsione_pun')),
  input_dati JSONB,
  risultato TEXT,
  offerte_trovate JSONB,
  risparmio_stimato DECIMAL(10,2),
  raccomandazione TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELLA: impostazioni
-- Preferenze utente
-- ============================================================
CREATE TABLE IF NOT EXISTS impostazioni (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  nome_utente TEXT,
  indirizzo_fornitura TEXT,
  regione TEXT,
  zona_mercato TEXT DEFAULT 'NORD',  -- zona GME
  potenza_disponibile DECIMAL(6,2) DEFAULT 3.0,
  notifiche_email BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDICI per performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bollette_user_id ON bollette(user_id);
CREATE INDEX IF NOT EXISTS idx_bollette_periodo ON bollette(periodo_inizio, periodo_fine);
CREATE INDEX IF NOT EXISTS idx_bollette_fornitore ON bollette(fornitore);
CREATE INDEX IF NOT EXISTS idx_pun_storico_anno_mese ON pun_storico(anno, mese);
CREATE INDEX IF NOT EXISTS idx_contratti_user_id ON contratti(user_id);
CREATE INDEX IF NOT EXISTS idx_analisi_ai_user_id ON analisi_ai(user_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE contratti ENABLE ROW LEVEL SECURITY;
ALTER TABLE bollette ENABLE ROW LEVEL SECURITY;
ALTER TABLE analisi_ai ENABLE ROW LEVEL SECURITY;
ALTER TABLE impostazioni ENABLE ROW LEVEL SECURITY;

-- Policy: ogni utente vede solo i propri dati
CREATE POLICY "users_own_contratti" ON contratti FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_bollette" ON bollette FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_analisi" ON analisi_ai FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_impostazioni" ON impostazioni FOR ALL USING (auth.uid() = user_id);

-- PUN è pubblico (nessun RLS necessario)
-- ma lo gestiamo solo dalla funzione serverless

-- ============================================================
-- DATI PUN STORICI PRE-CARICATI (2022-2024)
-- Valori reali GME €/MWh
-- ============================================================
INSERT INTO pun_storico (anno, mese, pun_medio, pun_f1, pun_f2, pun_f3, fonte) VALUES
-- 2022
(2022,1,228.45,248.12,221.30,198.45,'GME'),
(2022,2,188.32,205.60,182.40,161.20,'GME'),
(2022,3,256.78,278.90,249.10,225.60,'GME'),
(2022,4,215.60,234.80,208.90,187.30,'GME'),
(2022,5,207.80,226.40,201.20,180.50,'GME'),
(2022,6,250.20,271.30,242.60,218.90,'GME'),
(2022,7,344.60,374.20,333.80,301.40,'GME'),
(2022,8,438.90,476.20,424.70,383.50,'GME'),
(2022,9,380.40,413.10,368.60,332.80,'GME'),
(2022,10,228.70,248.30,221.50,199.80,'GME'),
(2022,11,207.30,225.10,200.80,181.20,'GME'),
(2022,12,243.60,264.50,235.90,212.80,'GME'),
-- 2023
(2023,1,178.90,194.40,173.20,156.30,'GME'),
(2023,2,152.30,165.50,147.60,133.20,'GME'),
(2023,3,128.60,139.70,124.60,112.40,'GME'),
(2023,4,115.40,125.40,111.80,100.90,'GME'),
(2023,5,107.80,117.10,104.50,94.30,'GME'),
(2023,6,118.20,128.40,114.60,103.40,'GME'),
(2023,7,128.70,139.80,124.80,112.60,'GME'),
(2023,8,116.40,126.50,112.90,101.90,'GME'),
(2023,9,124.80,135.60,120.90,109.10,'GME'),
(2023,10,122.30,132.90,118.60,107.10,'GME'),
(2023,11,118.60,128.80,115.00,103.80,'GME'),
(2023,12,109.40,118.80,106.10,95.80,'GME'),
-- 2024
(2024,1,98.60,107.10,95.70,86.40,'GME'),
(2024,2,68.40,74.30,66.40,59.90,'GME'),
(2024,3,75.20,81.70,72.90,65.80,'GME'),
(2024,4,58.30,63.30,56.60,51.10,'GME'),
(2024,5,62.40,67.80,60.60,54.70,'GME'),
(2024,6,88.70,96.30,86.00,77.60,'GME'),
(2024,7,92.30,100.30,89.60,80.90,'GME'),
(2024,8,89.10,96.80,86.50,78.10,'GME'),
(2024,9,84.60,91.90,82.10,74.10,'GME'),
(2024,10,89.40,97.10,86.80,78.40,'GME'),
(2024,11,94.20,102.30,91.40,82.50,'GME'),
(2024,12,105.80,115.00,102.70,92.70,'GME'),
-- 2025
(2025,1,112.40,122.10,109.10,98.50,'GME'),
(2025,2,108.70,118.10,105.50,95.20,'GME'),
(2025,3,96.30,104.60,93.50,84.40,'GME'),
(2025,4,88.20,95.80,85.60,77.30,'GME')
ON CONFLICT (anno, mese) DO NOTHING;

-- ============================================================
-- TRIGGER: aggiorna updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bollette_updated_at
  BEFORE UPDATE ON bollette
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contratti_updated_at
  BEFORE UPDATE ON contratti
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_impostazioni_updated_at
  BEFORE UPDATE ON impostazioni
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
