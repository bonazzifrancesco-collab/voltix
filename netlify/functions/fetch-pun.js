// netlify/functions/fetch-pun.js
// Fetch automatico prezzi PUN da ENTSO-E Transparency Platform
// Italy = media ponderata di 6 zone (come fa il GME per il PUN)

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ENTSOE_TOKEN = process.env.ENTSOE_API_KEY
const ENTSOE_BASE = 'https://web-api.tp.entsoe.eu/api'

// Tutte le zone italiane (come fa GME per calcolare il PUN)
const ITALY_ZONES = [
  { code: '10Y1001A1001A73I', name: 'IT-North' },
  { code: '10Y1001A1001A70O', name: 'IT-Centre-North' },
  { code: '10Y1001A1001A71M', name: 'IT-Centre-South' },
  { code: '10Y1001A1001A72K', name: 'IT-South' },
  { code: '10Y1001A1001A75E', name: 'IT-Sicily' },
  { code: '10Y1001A1001A74G', name: 'IT-Sardinia' },
]

export const handler = async (event) => {
  try {
    if (!ENTSOE_TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'ENTSOE_API_KEY non configurata' })
      }
    }

    const now = new Date()
    const mesiDaScaricare = []

    // Scarica mese corrente e precedente
    for (let i = 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      mesiDaScaricare.push({ anno: d.getFullYear(), mese: d.getMonth() + 1 })
    }

    const risultati = []

    for (const { anno, mese } of mesiDaScaricare) {
      try {
        console.log(`Fetching PUN ${anno}-${mese}...`)
        const punData = await fetchPunMese(anno, mese)

        if (punData) {
          const { error } = await supabase
            .from('pun_storico')
            .upsert(punData, { onConflict: 'anno,mese' })

          if (error) {
            console.error(`Errore salvataggio:`, error.message)
          } else {
            risultati.push(punData)
            console.log(`✓ Salvato PUN ${anno}-${mese}: ${punData.pun_medio} €/MWh`)
          }
        }
      } catch (e) {
        console.error(`Errore ${anno}-${mese}:`, e.message)
      }
    }

    if (risultati.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: false,
          message: 'Dati non ancora disponibili su ENTSO-E per il periodo richiesto. I dati vengono pubblicati con alcuni giorni di ritardo. Inserisci manualmente da mercatoelettrico.org',
          manuale: true
        })
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `✓ Aggiornati ${risultati.length} mesi da ENTSO-E`,
        data: risultati
      })
    }

  } catch (e) {
    console.error('Errore generale:', e.message)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    }
  }
}

async function fetchPunMese(anno, mese) {
  const inizio = new Date(anno, mese - 1, 1)
  const fine = new Date(anno, mese, 1)

  const periodStart = formatDataENTSOE(inizio)
  const periodEnd = formatDataENTSOE(fine)

  // Fetcha tutte le zone italiane in parallelo
  const promises = ITALY_ZONES.map(zona =>
    fetchZona(zona.code, periodStart, periodEnd)
      .then(prezzi => ({ zona: zona.name, prezzi }))
      .catch(e => {
        console.error(`Errore zona ${zona.name}:`, e.message)
        return { zona: zona.name, prezzi: [] }
      })
  )

  const zoneRisultati = await Promise.all(promises)
  const zoneConDati = zoneRisultati.filter(z => z.prezzi.length > 0)

  if (zoneConDati.length === 0) {
    console.log('Nessuna zona ha restituito dati')
    return null
  }

  console.log(`Zone con dati: ${zoneConDati.map(z => z.zona).join(', ')}`)

  // Calcola media su tutte le ore di tutte le zone (approssimazione PUN)
  const giorniMese = new Date(anno, mese, 0).getDate()
  const oreAttese = giorniMese * 24

  const prezziF1 = [], prezziF2 = [], prezziF3 = []
  const tuttiPrezziPerOra = []

  // Media oraria tra le zone disponibili
  const maxOre = Math.max(...zoneConDati.map(z => z.prezzi.length))
  for (let i = 0; i < maxOre; i++) {
    const valoriOra = zoneConDati
      .map(z => z.prezzi[i])
      .filter(v => v !== undefined && !isNaN(v))
    if (valoriOra.length > 0) {
      const mediaOra = valoriOra.reduce((s, v) => s + v, 0) / valoriOra.length
      tuttiPrezziPerOra.push(mediaOra)
    }
  }

  if (tuttiPrezziPerOra.length === 0) return null

  // Classifica per fasce orarie italiane
  const giorniMeseArr = []
  for (let g = 1; g <= giorniMese; g++) {
    const data = new Date(anno, mese - 1, g)
    const dow = data.getDay() // 0=Dom, 6=Sab
    for (let h = 0; h < 24; h++) {
      giorniMeseArr.push({ giorno: g, dow, ora: h })
    }
  }

  tuttiPrezziPerOra.forEach((prezzo, i) => {
    if (i >= giorniMeseArr.length) return
    const { dow, ora } = giorniMeseArr[i]

    if (dow === 0) {
      prezziF3.push(prezzo)
    } else if (dow === 6) {
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

  const mediaGlobale = avg(tuttiPrezziPerOra)
  if (!mediaGlobale) return null

  return {
    anno, mese,
    pun_medio: mediaGlobale,
    pun_f1: avg(prezziF1),
    pun_f2: avg(prezziF2),
    pun_f3: avg(prezziF3),
    fonte: 'ENTSOE'
  }
}

async function fetchZona(domainCode, periodStart, periodEnd) {
  const url = `${ENTSOE_BASE}?securityToken=${ENTSOE_TOKEN}` +
    `&documentType=A44` +
    `&in_Domain=${domainCode}` +
    `&out_Domain=${domainCode}` +
    `&periodStart=${periodStart}` +
    `&periodEnd=${periodEnd}`

  const response = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { 'Accept': 'application/xml' }
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const xml = await response.text()

  if (xml.includes('No matching data found')) {
    return []
  }

  // Estrae i prezzi dal XML
  const prezzi = []
  const matches = [...xml.matchAll(/<price\.amount>([\d.]+)<\/price\.amount>/g)]
  matches.forEach(m => {
    const v = parseFloat(m[1])
    if (!isNaN(v)) prezzi.push(v)
  })

  return prezzi
}

function formatDataENTSOE(data) {
  const y = data.getFullYear()
  const m = String(data.getMonth() + 1).padStart(2, '0')
  const d = String(data.getDate()).padStart(2, '0')
  return `${y}${m}${d}0000`
}
