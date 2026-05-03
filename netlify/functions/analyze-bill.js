// netlify/functions/analyze-bill.js
// Analizza PDF bolletta elettrica con Claude AI

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Chiave API Anthropic non configurata' }) }
  }

  let pdfBase64
  try {
    const body = JSON.parse(event.body)
    pdfBase64 = body.pdfBase64
    if (!pdfBase64) throw new Error('pdfBase64 mancante')
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body non valido: ' + e.message }) }
  }

  const prompt = `Sei un esperto di bollette elettriche italiane. Analizza attentamente questa bolletta e estrai TUTTI i dati che riesci a trovare.

Restituisci SOLO un oggetto JSON valido (senza markdown, senza backtick, senza testo aggiuntivo) con questa struttura esatta:

{
  "fornitore": "nome del fornitore",
  "nome_offerta": "nome dell'offerta o prodotto",
  "pod": "codice POD (IT001E...)",
  "numero_bolletta": "numero bolletta",
  "periodo_inizio": "YYYY-MM-DD",
  "periodo_fine": "YYYY-MM-DD",
  "data_emissione": "YYYY-MM-DD",
  "data_scadenza": "YYYY-MM-DD",
  "kwh_f1": numero (kWh fascia F1/punta, 0 se non trovato),
  "kwh_f2": numero (kWh fascia F2/intermedia, 0 se non trovato),
  "kwh_f3": numero (kWh fascia F3/valle, 0 se non trovato),
  "kwh_totale": numero (kWh totali),
  "prezzo_f1": numero (€/kWh fascia F1, null se non trovato),
  "prezzo_f2": numero (€/kWh fascia F2, null se non trovato),
  "prezzo_f3": numero (€/kWh fascia F3, null se non trovato),
  "prezzo_medio": numero (€/kWh medio, null se non trovato),
  "costo_materia_prima": numero (€ materia prima/energia, null se non trovato),
  "costo_trasporto": numero (€ trasporto e gestione rete, null se non trovato),
  "costo_oneri_sistema": numero (€ oneri di sistema, null se non trovato),
  "costo_accise": numero (€ accise, null se non trovato),
  "costo_iva": numero (€ IVA, null se non trovato),
  "importo_totale": numero (€ totale da pagare),
  "pun_medio_periodo": numero (€/MWh PUN se indicato in bolletta, null se non trovato),
  "note": "eventuali note importanti dalla bolletta"
}

Note importanti:
- Per i prezzi in €/kWh usa il formato decimale (es: 0.098765)
- Per PUN usa €/MWh (es: 98.50)
- Se la bolletta è monoraria, metti tutto in kwh_f1 e prezzo_f1
- Se non trovi un campo, usa null per stringhe e 0 per kwh
- Le date devono essere nel formato YYYY-MM-DD
- L'importo_totale è OBBLIGATORIO

Rispondi SOLO con il JSON, nessun altro testo.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Claude API error ${response.status}: ${errText}`)
    }

    const data = await response.json()
    const rawText = data.content?.[0]?.text || ''

    // Pulisce la risposta e fa il parse JSON
    let cleanText = rawText.trim()
    cleanText = cleanText.replace(/^```json\s*/i, '').replace(/\s*```$/, '')
    cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '')

    let parsed
    try {
      parsed = JSON.parse(cleanText)
    } catch (e) {
      // Prova a estrarre il JSON dal testo
      const match = cleanText.match(/\{[\s\S]*\}/)
      if (match) {
        parsed = JSON.parse(match[0])
      } else {
        throw new Error('Impossibile parsare la risposta JSON: ' + cleanText.slice(0, 200))
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    }
  }
}
