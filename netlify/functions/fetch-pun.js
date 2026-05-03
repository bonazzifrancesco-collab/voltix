// netlify/functions/fetch-pun.js
// Fetch automatico dati PUN dal GME (Gestore Mercati Energetici)
// Il GME pubblica i dati su mercatoelettrico.org

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // usa service role per scrivere senza auth
)

export const handler = async (event) => {
  try {
    // Il GME non ha un'API pubblica JSON diretta, ma pubblica file XML/CSV
    // Proviamo a prendere i dati recenti dal loro endpoint
    const now = new Date()
    const anno = now.getFullYear()
    const mese = now.getMonth() + 1

    // Costruiamo la URL per i dati MGP del mese corrente
    // GME pubblica dati su: https://www.mercatoelettrico.org/It/Tools/Accessodati.aspx
    // Endpoint alternativo via API non ufficiale o scraping
    
    // Prima prova: endpoint dati storici GME (CSV)
    const mesePadded = String(mese).padStart(2, '0')
    const urlGME = `https://www.mercatoelettrico.org/It/WebServerDataStore/MGP_Prezzi/${anno}${mesePadded}MGP_Prezzi.xml`

    let punData = null
    
    try {
      const gmeRes = await fetch(urlGME, { 
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'VoltixApp/1.0 (energy-monitoring)' }
      })
      
      if (gmeRes.ok) {
        const xmlText = await gmeRes.text()
        punData = parseGMEXml(xmlText, anno, mese)
      }
    } catch (fetchErr) {
      console.log('GME fetch fallito:', fetchErr.message)
    }

    // Se GME non risponde, usa l'API di TERNA come fallback
    if (!punData) {
      try {
        const ternaUrl = `https://www.terna.it/it/sistema-elettrico/dati-statistici-di-esercizio`
        // TERNA non ha API JSON pubblica facile, usiamo dati stimati basati su trend
        // In produzione si potrebbe usare un servizio terzo come ENTSO-E Transparency Platform
        punData = await fetchENTSOE(anno, mese)
      } catch (e) {
        console.log('ENTSO-E fetch fallito:', e.message)
      }
    }

    if (!punData) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: false,
          message: 'Dati GME non disponibili automaticamente. Il GME pubblica i dati con un mese di ritardo. Inserisci il PUN manualmente da mercatoelettrico.org',
          manuale: true
        })
      }
    }

    // Salva su Supabase
    const { error } = await supabase
      .from('pun_storico')
      .upsert(punData, { onConflict: 'anno,mese' })

    if (error) throw new Error('Errore salvataggio Supabase: ' + error.message)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Dati PUN aggiornati: ${punData.length || 1} mese/i`,
        data: punData
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

// Parser XML GME
function parseGMEXml(xmlText, anno, mese) {
  try {
    // Il file GME ha struttura <Prezzi><Giorno Data="..." Ora="..." Zona="CNOR" Prezzo="..."/>
    const prezziNord = []
    const prezziF1 = []
    const prezziF2 = []
    const prezziF3 = []
    
    const righe = xmlText.match(/<Prezzi[^/]*\/>/g) || []
    
    righe.forEach(riga => {
      const zona = riga.match(/Zona="([^"]+)"/)?.[1]
      const ora = parseInt(riga.match(/Ora="(\d+)"/)?.[1] || '0')
      const giorno = riga.match(/Data="(\d+)"/)?.[1]
      const prezzo = parseFloat(riga.match(/Prezzo="([^"]+)"/)?.[1] || '0')
      
      if (!zona || zona !== 'NORD' || !prezzo || prezzo <= 0) return
      
      prezziNord.push(prezzo)
      
      // Classificazione fasce orarie italiane
      const dataObj = giorno ? new Date(giorno.slice(0,4) + '-' + giorno.slice(4,6) + '-' + giorno.slice(6,8)) : new Date()
      const dayOfWeek = dataObj.getDay() // 0=Dom, 6=Sab
      
      if (dayOfWeek === 0) {
        // Domenica = tutto F3
        prezziF3.push(prezzo)
      } else if (dayOfWeek === 6) {
        // Sabato: 8-19 = F2, resto F3
        if (ora >= 8 && ora < 19) prezziF2.push(prezzo)
        else prezziF3.push(prezzo)
      } else {
        // Lun-Ven: 8-19 = F1, 19-23 = F2, resto F3
        if (ora >= 8 && ora < 19) prezziF1.push(prezzo)
        else if (ora >= 19 && ora < 23) prezziF2.push(prezzo)
        else prezziF3.push(prezzo)
      }
    })
    
    if (prezziNord.length === 0) return null
    
    const avg = arr => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null
    
    return {
      anno,
      mese,
      pun_medio: avg(prezziNord)?.toFixed(4),
      pun_f1: avg(prezziF1)?.toFixed(4),
      pun_f2: avg(prezziF2)?.toFixed(4),
      pun_f3: avg(prezziF3)?.toFixed(4),
      fonte: 'GME'
    }
  } catch (e) {
    console.log('Errore parse XML:', e.message)
    return null
  }
}

// Fetch ENTSO-E Transparency Platform (fallback)
async function fetchENTSOE(anno, mese) {
  // ENTSO-E ha un'API pubblica ma richiede registrazione
  // Documentazione: https://transparency.entsoe.eu/content/static_content/Static%20content/web%20api/Guide.html
  // Per ora restituiamo null e gestiamo il fallback nel frontend
  return null
}
