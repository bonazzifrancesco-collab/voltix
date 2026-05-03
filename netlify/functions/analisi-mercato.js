// netlify/functions/analisi-mercato.js
// Analisi AI del mercato energetico italiano con Claude

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Chiave API Anthropic non configurata' }) }
  }

  let inputDati
  try {
    inputDati = JSON.parse(event.body)
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body non valido' }) }
  }

  const { tipoAnalisi, contratto, statistiche, consumiUltimi12Mesi, pun } = inputDati

  const contestoUtente = `
DATI UTENTE REALI:
- kWh annui stimati: ${statistiche?.kwhAnnuiStimati || 'N/D'} kWh/anno
- Spesa annua stimata: €${statistiche?.spesaAnnuaStimata || 'N/D'}/anno
- Prezzo effettivo pagato: ${statistiche?.prezzoMedioEffettivo || 'N/D'} c€/kWh (TUTTO INCLUSO: materia + rete + oneri + IVA)
- Consumo mensile medio: ${statistiche?.kwhMedioMensile || 'N/D'} kWh/mese
- Mix fascia F1 (punta, lun-ven 8-19): ${statistiche?.percF1 || 'N/D'}%
- Mix fascia F2 (intermedia): ${statistiche?.percF2 || 'N/D'}%
- Mix fascia F3 (valle, notti e domeniche): ${statistiche?.percF3 || 'N/D'}%

CONTRATTO ATTUALE:
${contratto ? `- Fornitore: ${contratto.fornitore}
- Offerta: ${contratto.offerta}
- Tipo: ${contratto.tipo}
- Prezzo F1: ${contratto.prezzoF1 ? (contratto.prezzoF1 * 100).toFixed(4) + ' c€/kWh' : 'N/D'}
- Prezzo F2: ${contratto.prezzoF2 ? (contratto.prezzoF2 * 100).toFixed(4) + ' c€/kWh' : 'N/D'}
- Prezzo F3: ${contratto.prezzoF3 ? (contratto.prezzoF3 * 100).toFixed(4) + ' c€/kWh' : 'N/D'}` : '- Nessun contratto inserito (analizza senza dati di confronto specifici)'}

ANDAMENTO PUN RECENTE (€/MWh):
${pun.map(p => `- ${['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'][p.mese - 1]} ${p.anno}: ${parseFloat(p.medio).toFixed(2)} €/MWh = ${(parseFloat(p.medio) / 10).toFixed(4)} c€/kWh`).join('\n')}

ULTIMI CONSUMI MENSILI:
${consumiUltimi12Mesi.slice(0, 6).map(c => `- ${c.periodo}: ${c.kwhTot} kWh totali, €${c.importo}`).join('\n')}
`

  let systemPrompt, userPrompt, outputFormat

  if (tipoAnalisi === 'confronto_offerte') {
    systemPrompt = `Sei un esperto indipendente del mercato energetico italiano con profonda conoscenza di tutti i fornitori: grandi (Enel Energia, A2A, ENI Gas e Luce, Edison, Iren, Hera, Acea, E.ON, Alperia, Sorgenia, Illumia, Wekiwi, Plenitude) e ANCHE operatori più piccoli e nuovi entranti (Octopus Energy, EnerCom, DOLOMITI ENERGIA, BluEnergy, Sentra, Enercom, Audax, Axpo, FlowEnergy, ecc.). Conosci ARERA e le tutele. Ragaziona sempre in base ai dati reali forniti.`

    userPrompt = `${contestoUtente}

TASK: Analizza il mercato delle offerte elettriche italiane e trova le migliori opzioni per questo utente.

Rispondi SOLO con un oggetto JSON valido (nessun testo, nessun markdown):
{
  "raccomandazione": "frase breve e diretta: conviene cambiare contratto? sì/no e perché (max 2 righe)",
  "risparmioStimato": numero in € annui (o null se non stimabile),
  "testo": "analisi dettagliata in italiano (400-600 parole) che include: 1) valutazione del contratto attuale 2) analisi del profilo di consumo 3) momento attuale del mercato PUN 4) trend prezzi 5) se conviene fisso vs indicizzato con questo profilo di consumi 6) eventuale consiglio su fascia oraria (biorario vs monorario)",
  "offerte": [
    {
      "fornitore": "Nome Fornitore",
      "nomeOfferta": "Nome Offerta",
      "tipo": "fisso biorario / fisso monorario / indicizzato PUN",
      "prezzoStimato": "X.XXX",
      "risparmioAnnuo": "€XXX stimati",
      "descrizione": "descrizione breve offerta e perché è adatta a questo utente",
      "url": "https://www.sito-fornitore.it/offerte (URL reale se la conosci, altrimenti homepage)",
      "proCons": {
        "pro": ["punto 1", "punto 2"],
        "contro": ["punto 1"]
      }
    }
  ]
}

Includi almeno 3-4 offerte, preferibilmente 5-6. Dai priorità a: prezzo, stabilità, affidabilità fornitore, adeguatezza al profilo di consumo. Includi almeno un operatore non-mainstream.`

  } else if (tipoAnalisi === 'ottimizzazione_consumi') {
    systemPrompt = `Sei un consulente esperto di efficienza energetica e gestione dei consumi domestici italiani. Conosci le tariffe a fasce, la regolamentazione ARERA, e come ottimizzare i costi elettrici spostando i carichi nelle fasce più convenienti.`

    userPrompt = `${contestoUtente}

TASK: Analizza il profilo di consumo e fornisci suggerimenti concreti per ottimizzare la spesa elettrica.

Rispondi SOLO con JSON:
{
  "raccomandazione": "consiglio principale in 1-2 righe",
  "risparmioStimato": numero in € annui stimabili con ottimizzazione (o null),
  "testo": "analisi dettagliata (400-600 parole) con: 1) analisi del mix di fasce attuali e se è ottimale 2) quali carichi spostare e in quali fasce (lavatrice, lavastoviglie, forno, ricarica auto, etc.) 3) se conviene passare a monorario o biorario considerando il profilo 4) consigli su potenza impegnata 5) eventuali considerazioni su fotovoltaico o accumulo se rilevante",
  "offerte": []
}`

  } else if (tipoAnalisi === 'previsione_pun') {
    systemPrompt = `Sei un analista esperto del mercato energetico europeo e italiano. Conosci i fondamentali che muovono il PUN: prezzi gas TTF, capacità rinnovabili, stagionalità, domanda industriale, interconnessioni. Fornisci analisi equilibrate basate sui dati.`

    userPrompt = `${contestoUtente}

TASK: Analizza il trend del PUN e scenari futuri per aiutare l'utente a decidere se conviene restare a prezzo fisso o passare a indicizzato.

Rispondi SOLO con JSON:
{
  "raccomandazione": "consiglio diretto: fisso o indicizzato, e perché, in 1-2 righe",
  "risparmioStimato": stima risparmio annuo passando all'opzione consigliata (o null),
  "testo": "analisi (400-600 parole) con: 1) interpretazione del trend PUN negli ultimi mesi 2) fattori che influenzano il PUN attuale (gas, rinnovabili, stagionalità) 3) scenario ottimistico e pessimistico PUN nei prossimi 6-12 mesi 4) calcolo su questo profilo: con il prezzo fisso attuale vs indicizzato al PUN, chi conviene? 5) raccomandazione finale motivata",
  "offerte": []
}`
  }

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
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Claude API error ${response.status}: ${errText}`)
    }

    const data = await response.json()
    let rawText = data.content?.[0]?.text || ''

    // Pulizia risposta
    rawText = rawText.trim()
    rawText = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '')
    rawText = rawText.replace(/^```\s*/, '').replace(/\s*```$/, '')

    let parsed
    try {
      parsed = JSON.parse(rawText)
    } catch (e) {
      const match = rawText.match(/\{[\s\S]*\}/)
      if (match) {
        parsed = JSON.parse(match[0])
      } else {
        // Se non riesce a parsare, restituisce il testo grezzo
        parsed = {
          raccomandazione: 'Analisi completata',
          risparmioStimato: null,
          testo: rawText,
          offerte: []
        }
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
