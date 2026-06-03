// api/analisi-mercato.js
// Analisi AI mercato energetico - Vercel API Route (60s timeout)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Chiave API Anthropic non configurata' })
  }

  const { tipoAnalisi, contratto, statistiche, consumiUltimi12Mesi, pun } = req.body

  const contestoUtente = `
DATI UTENTE REALI:
- kWh annui stimati: ${statistiche?.kwhAnnuiStimati || 'N/D'} kWh/anno
- Spesa annua stimata: €${statistiche?.spesaAnnuaStimata || 'N/D'}/anno
- Prezzo effettivo pagato: ${statistiche?.prezzoMedioEffettivo || 'N/D'} c€/kWh (tutto incluso)
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
- Prezzo F3: ${contratto.prezzoF3 ? (contratto.prezzoF3 * 100).toFixed(4) + ' c€/kWh' : 'N/D'}` : '- Nessun contratto inserito'}

ANDAMENTO PUN RECENTE (€/MWh):
${pun.map(p => `- ${['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'][p.mese - 1]} ${p.anno}: ${parseFloat(p.medio).toFixed(2)} €/MWh`).join('\n')}

ULTIMI CONSUMI MENSILI:
${consumiUltimi12Mesi.slice(0, 6).map(c => `- ${c.periodo}: ${c.kwhTot} kWh, €${c.importo}`).join('\n')}
`

  let systemPrompt, userPrompt

  if (tipoAnalisi === 'confronto_offerte') {
    systemPrompt = `Sei un esperto indipendente del mercato energetico italiano con profonda conoscenza di tutti i fornitori: grandi (Enel Energia, A2A, ENI Gas e Luce, Edison, Iren, Hera, Acea, E.ON, Sorgenia, Illumia, Wekiwi, Plenitude) e operatori minori (Octopus Energy, EnerCom, Dolomiti Energia, BluEnergy, Audax, Axpo, ecc.). Conosci ARERA e le tutele. Ragiona sempre in base ai dati reali forniti.`

    userPrompt = `${contestoUtente}

TASK: Analizza il mercato delle offerte elettriche italiane e trova le migliori opzioni per questo utente.

Rispondi SOLO con JSON valido (nessun testo, nessun markdown):
{
  "raccomandazione": "frase breve e diretta: conviene cambiare contratto? sì/no e perché (max 2 righe)",
  "risparmioStimato": numero in € annui (o null),
  "testo": "analisi dettagliata in italiano (400-600 parole): 1) valutazione contratto attuale 2) analisi profilo consumo 3) momento attuale mercato PUN 4) trend prezzi 5) fisso vs indicizzato 6) fascia oraria ottimale",
  "offerte": [
    {
      "fornitore": "Nome",
      "nomeOfferta": "Nome Offerta",
      "tipo": "fisso biorario / fisso monorario / indicizzato PUN",
      "prezzoStimato": "X.XXX",
      "risparmioAnnuo": "€XXX stimati",
      "descrizione": "perché è adatta a questo utente",
      "url": "https://sito-fornitore.it",
      "proCons": { "pro": ["punto 1"], "contro": ["punto 1"] }
    }
  ]
}
Includi 4-6 offerte, almeno un operatore non-mainstream.`

  } else if (tipoAnalisi === 'ottimizzazione_consumi') {
    systemPrompt = `Sei un consulente esperto di efficienza energetica e gestione dei consumi domestici italiani. Conosci le tariffe a fasce, la regolamentazione ARERA e come ottimizzare i costi elettrici.`

    userPrompt = `${contestoUtente}

TASK: Analizza il profilo di consumo e fornisci suggerimenti concreti per ottimizzare la spesa.

Rispondi SOLO con JSON:
{
  "raccomandazione": "consiglio principale in 1-2 righe",
  "risparmioStimato": numero in € annui (o null),
  "testo": "analisi dettagliata (400-600 parole): 1) mix fasce attuale 2) carichi da spostare 3) mono vs biorario 4) consigli su potenza 5) fotovoltaico/accumulo se rilevante",
  "offerte": []
}`

  } else {
    systemPrompt = `Sei un analista esperto del mercato energetico europeo e italiano. Conosci i fondamentali che muovono il PUN: gas TTF, rinnovabili, stagionalità, domanda industriale.`

    userPrompt = `${contestoUtente}

TASK: Analizza il trend del PUN e scenari futuri per decidere fisso vs indicizzato.

Rispondi SOLO con JSON:
{
  "raccomandazione": "fisso o indicizzato e perché, in 1-2 righe",
  "risparmioStimato": numero in € annui (o null),
  "testo": "analisi (400-600 parole): 1) trend PUN ultimi mesi 2) fattori mercato attuali 3) scenario ottimistico/pessimistico 6-12 mesi 4) calcolo fisso vs indicizzato su questo profilo 5) raccomandazione finale",
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

    rawText = rawText.trim()
      .replace(/^```json\s*/i, '').replace(/\s*```$/, '')
      .replace(/^```\s*/, '').replace(/\s*```$/, '')

    let parsed
    try {
      parsed = JSON.parse(rawText)
    } catch (e) {
      const match = rawText.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
      else parsed = { raccomandazione: 'Analisi completata', risparmioStimato: null, testo: rawText, offerte: [] }
    }

    return res.status(200).json(parsed)

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
