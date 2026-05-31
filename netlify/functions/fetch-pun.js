// netlify/functions/fetch-pun.js
// Fetch automatico prezzi PUN da ENTSO-E Transparency Platform
// Documentazione: https://transparency.entsoe.eu/content/static_content/Static%20content/web%20api/Guide.html

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ENTSOE_TOKEN = process.env.ENTSOE_API_KEY
const ENTSOE_BASE = 'https://web-api.tp.entsoe.eu/api'

// Codice area Italia Nord (zona più rappresentativa per il PUN)
const ITALY_BIDDING_ZONE = '10Y1001A1001A73I' // IT-North
const ITALY_FULL = '10YIT-GRTN-----B' // Italia intera (MGP)

export const handler = async (event) => {
  try {
    if (!ENTSOE_TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'ENTSOE_API_KEY non configurata nelle variabili d\'ambiente' })
      }
    }

    // Determina i mesi da scaricare (mese corrente e precedente)
    const now = new Date()
    const mesiDaScaricare = []

    // Scarica gli ultimi 2 mesi per sicurezza
    for (let i = 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      mesiDaScaricare.push({ anno: d.getFullYear(), mese: d.getMonth() + 1 })
    }

    const risultati = []

    for (const { anno, mese } of mesiDaScaricare) {
      try {
        const punData = await fetchPunMese(anno, mese)
        if (punData) {
          risultati.push(punData)

          // Salva su Supabase
          const { error } = await supabase
            .from('pun_storico')
            .upsert(punData, { onConflict: 'anno,mese' })

          if (error) {
            console.error(`Errore salvataggio ${anno}-${mese}:`, error.message)
          }
        }
      } catch (e) {
        console.error(`Errore fetch ${anno}-${mese}:`, e.message)
      }
    }

    if (risultati.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: false,
          message: 'Nessun dato nuovo disponibile da ENTSO-E. I dati vengono pubblicati con qualche giorno di ritardo.',
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
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    }
  }
}

async function fetchPunMese(anno, mese) {
  // Date inizio e fine mese nel formato ENTSO-E: YYYYMMDD0000
  const inizio = new Date(anno, mese - 1, 1)
  const fine = new Date(anno, mese, 1) // primo giorno del mese successivo

  const periodStart = formatDataENTSOE(inizio)
  const periodEnd = formatDataENTSOE(fine)

  // Document type A44 = Day-ahead prices, processType A01
  const url = `${ENTSOE_BASE}?securityToken=${ENTSOE_TOKEN}` +
    `&documentType=A44` +
    `&in_Domain=${ITALY_FULL}` +
    `&out_Domain=${ITALY_FULL}` +
    `&periodStart=${periodStart}` +
    `&periodEnd=${periodEnd}`

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'Accept': 'application/xml' }
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`ENTSO-E API error ${response.status}: ${errText.slice(0, 200)}`)
  }

  const xmlText = await response.text()

  // Controlla se è un errore
  if (xmlText.includes('Acknowledgement_MarketDocument') && xmlText.includes('Error')) {
    const reason = xmlText.match(/<Reason>[\s\S]*?<text>(.*?)<\/text>/)?.[1] || 'Errore sconosciuto'
    throw new Error(`ENTSO-E: ${reason}`)
  }

  return parseENTSOEXml(xmlText, anno, mese)
}

function parseENTSOEXml(xmlText, anno, mese) {
  try {
    // Estrae tutti i valori di prezzo dal XML ENTSO-E
    // Struttura: <Point><position>N</position><price.amount>XX.XX</price.amount></Point>
    const prezzi = []
    const matches = xmlText.matchAll(/<Point>[\s\S]*?<position>(\d+)<\/position>[\s\S]*?<price\.amount>([\d.]+)<\/price\.amount>[\s\S]*?<\/Point>/g)

    for (const match of matches) {
      const ora = parseInt(match[1]) - 1 // ENTSO-E usa 1-based
      const prezzo = parseFloat(match[2])
      if (!isNaN(prezzo) && prezzo >= 0) {
        prezzi.push({ ora, prezzo })
      }
    }

    if (prezzi.length === 0) {
      // Prova parsing alternativo più semplice
      const simplePrices = [...xmlText.matchAll(/<price\.amount>([\d.]+)<\/price\.amount>/g)]
        .map(m => parseFloat(m[1]))
        .filter(p => !isNaN(p) && p >= 0)

      if (simplePrices.length === 0) return null

      const media = simplePrices.reduce((s, v) => s + v, 0) / simplePrices.length
      return {
        anno, mese,
        pun_medio: media.toFixed(4),
        pun_f1: null, pun_f2: null, pun_f3: null,
        fonte: 'ENTSOE'
      }
    }

    // Calcola medie per fascia oraria italiana
    // F1: Lun-Ven 8-19 | F2: Lun-Ven 7-8, 19-23 + Sab 7-23 | F3: Resto
    const giorniMese = new Date(anno, mese, 0).getDate()
    const prezziF1 = [], prezziF2 = [], prezziF3 = []

    // I prezzi ENTSO-E sono orari per tutto il mese
    // Ogni giorno ha 24 ore = 24 valori
    let indice = 0
    for (let giorno = 1; giorno <= giorniMese; giorno++) {
      const dataGiorno = new Date(anno, mese - 1, giorno)
      const dayOfWeek = dataGiorno.getDay() // 0=Dom, 6=Sab

      for (let ora = 0; ora < 24; ora++) {
        const p = prezzi[indice]?.prezzo ?? prezzi[Math.min(indice, prezzi.length - 1)]?.prezzo
        if (p === undefined) continue

        if (dayOfWeek === 0) {
          // Domenica → tutto F3
          prezziF3.push(p)
        } else if (dayOfWeek === 6) {
          // Sabato: 7-23 = F2, resto F3
          if (ora >= 7 && ora < 23) prezziF2.push(p)
          else prezziF3.push(p)
        } else {
          // Lun-Ven: 8-19 = F1, 7-8 e 19-23 = F2, resto F3
          if (ora >= 8 && ora < 19) prezziF1.push(p)
          else if ((ora >= 7 && ora < 8) || (ora >= 19 && ora < 23)) prezziF2.push(p)
          else prezziF3.push(p)
        }
        indice++
      }
    }

    const avg = arr => arr.length > 0
      ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(4)
      : null

    const tuttiPrezzi = prezziF1.concat(prezziF2, prezziF3)
    const media = tuttiPrezzi.length > 0
      ? (tuttiPrezzi.reduce((s, v) => s + v, 0) / tuttiPrezzi.length).toFixed(4)
      : null

    if (!media) return null

    return {
      anno,
      mese,
      pun_medio: media,
      pun_f1: avg(prezziF1),
      pun_f2: avg(prezziF2),
      pun_f3: avg(prezziF3),
      fonte: 'ENTSOE'
    }

  } catch (e) {
    console.error('Errore parse XML ENTSO-E:', e.message)
    return null
  }
}

function formatDataENTSOE(data) {
  // Formato richiesto: YYYYMMDDHHММ (es. 202501010000)
  const y = data.getFullYear()
  const m = String(data.getMonth() + 1).padStart(2, '0')
  const d = String(data.getDate()).padStart(2, '0')
  return `${y}${m}${d}0000`
}
