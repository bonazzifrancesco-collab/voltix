// api/fetch-pun.js
// Fetch automatico PUN da ENTSO-E - Vercel API Route

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ENTSOE_TOKEN = process.env.ENTSOE_API_KEY
const ENTSOE_BASE = 'https://web-api.tp.entsoe.eu/api'

const ITALY_ZONES = [
  { code: '10Y1001A1001A73I', name: 'IT-North' },
  { code: '10Y1001A1001A70O', name: 'IT-Centre-North' },
  { code: '10Y1001A1001A71M', name: 'IT-Centre-South' },
  { code: '10Y1001A1001A72K', name: 'IT-South' },
  { code: '10Y1001A1001A75E', name: 'IT-Sicily' },
  { code: '10Y1001A1001A74G', name: 'IT-Sardinia' },
]

export default async function handler(req, res) {
  try {
    if (!ENTSOE_TOKEN) {
      return res.status(500).json({ error: 'ENTSOE_API_KEY non configurata' })
    }

    const now = new Date()
    const mesiDaScaricare = []
    for (let i = 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      mesiDaScaricare.push({ anno: d.getFullYear(), mese: d.getMonth() + 1 })
    }

    const risultati = []

    for (const { anno, mese } of mesiDaScaricare) {
      try {
        const punData = await fetchPunMese(anno, mese)
        if (punData) {
          const { error } = await supabase
            .from('pun_storico')
            .upsert(punData, { onConflict: 'anno,mese' })
          if (!error) risultati.push(punData)
        }
      } catch (e) {
        console.error(`Errore ${anno}-${mese}:`, e.message)
      }
    }

    if (risultati.length === 0) {
      return res.status(200).json({
        error: false,
        message: 'Dati non ancora disponibili su ENTSO-E. Inserisci manualmente da mercatoelettrico.org',
        manuale: true
      })
    }

    return res.status(200).json({
      message: `✓ Aggiornati ${risultati.length} mesi da ENTSO-E`,
      data: risultati
    })

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

async function fetchPunMese(anno, mese) {
  const inizio = new Date(anno, mese - 1, 1)
  const fine = new Date(anno, mese, 1)
  const periodStart = formatData(inizio)
  const periodEnd = formatData(fine)

  const promises = ITALY_ZONES.map(zona =>
    fetchZona(zona.code, periodStart, periodEnd)
      .catch(() => [])
  )

  const zoneRisultati = await Promise.all(promises)
  const tuttiPrezzi = zoneRisultati.flat().filter(v => !isNaN(v) && v >= 0)

  if (tuttiPrezzi.length === 0) return null

  const giorniMese = new Date(anno, mese, 0).getDate()
  const prezziF1 = [], prezziF2 = [], prezziF3 = []

  tuttiPrezzi.forEach((prezzo, i) => {
    const orePerGiorno = 24
    const giornoIndex = Math.floor(i / orePerGiorno)
    const ora = i % orePerGiorno
    const data = new Date(anno, mese - 1, giornoIndex + 1)
    const dow = data.getDay()

    if (dow === 0) prezziF3.push(prezzo)
    else if (dow === 6) {
      if (ora >= 7 && ora < 23) prezziF2.push(prezzo)
      else prezziF3.push(prezzo)
    } else {
      if (ora >= 8 && ora < 19) prezziF1.push(prezzo)
      else if ((ora >= 7 && ora < 8) || (ora >= 19 && ora < 23)) prezziF2.push(prezzo)
      else prezziF3.push(prezzo)
    }
  })

  const avg = arr => arr.length > 0
    ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(4)
    : null

  return {
    anno, mese,
    pun_medio: avg(tuttiPrezzi),
    pun_f1: avg(prezziF1),
    pun_f2: avg(prezziF2),
    pun_f3: avg(prezziF3),
    fonte: 'ENTSOE'
  }
}

async function fetchZona(domainCode, periodStart, periodEnd) {
  const url = `${ENTSOE_BASE}?securityToken=${ENTSOE_TOKEN}` +
    `&documentType=A44&in_Domain=${domainCode}&out_Domain=${domainCode}` +
    `&periodStart=${periodStart}&periodEnd=${periodEnd}`

  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const xml = await response.text()
  if (xml.includes('No matching data found')) return []

  return [...xml.matchAll(/<price\.amount>([\d.]+)<\/price\.amount>/g)]
    .map(m => parseFloat(m[1]))
    .filter(v => !isNaN(v))
}

function formatData(data) {
  const y = data.getFullYear()
  const m = String(data.getMonth() + 1).padStart(2, '0')
  const d = String(data.getDate()).padStart(2, '0')
  return `${y}${m}${d}0000`
}
