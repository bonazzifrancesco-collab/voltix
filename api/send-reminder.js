// api/send-reminder.js
// Invia promemoria scadenza contratto via Resend
// Chiamato da Vercel Cron ogni giorno a mezzanotte

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = 'onboarding@resend.dev'

export default async function handler(req, res) {
  // Verifica autorizzazione cron (Vercel invia questo header)
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Permetti anche chiamate manuali dall'app
    if (req.method !== 'POST') {
      return res.status(401).json({ error: 'Non autorizzato' })
    }
  }

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY non configurata' })
  }

  try {
    const oggi = new Date()
    const oggiStr = oggi.toISOString().split('T')[0]

    // Trova tutti i promemoria da inviare oggi
    const { data: promemoria, error } = await supabase
      .from('promemoria_email')
      .select(`
        *,
        contratti (
          fornitore,
          nome_offerta,
          data_fine,
          tipo_mercato
        )
      `)
      .eq('inviato', false)
      .lte('data_invio_programmata', oggiStr)

    if (error) throw new Error('Errore DB: ' + error.message)
    if (!promemoria || promemoria.length === 0) {
      return res.status(200).json({ message: 'Nessun promemoria da inviare oggi' })
    }

    let inviati = 0
    const errori = []

    for (const p of promemoria) {
      try {
        const contratto = p.contratti
        if (!contratto) continue

        const dataFine = new Date(contratto.data_fine)
        const mesiRimasti = Math.round((dataFine - oggi) / (1000 * 60 * 60 * 24 * 30))

        const emailHtml = `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VOLTIX — Promemoria Scadenza Contratto</title>
</head>
<body style="margin:0;padding:0;background:#0a0b0e;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 20px;">
    
    <!-- Header -->
    <div style="background:#111318;border:1px solid #1e2128;border-radius:16px;overflow:hidden;margin-bottom:20px;">
      <div style="background:linear-gradient(135deg,rgba(245,166,35,0.15),rgba(0,0,0,0));padding:28px 32px;border-bottom:1px solid #1e2128;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;background:#f5a623;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">⚡</div>
          <div>
            <div style="color:#e8eaf0;font-size:1.3rem;font-weight:800;letter-spacing:-0.02em;">VOLTIX</div>
            <div style="color:#f5a623;font-size:0.65rem;letter-spacing:0.2em;text-transform:uppercase;">Gestione Energia</div>
          </div>
        </div>
      </div>
      
      <!-- Contenuto -->
      <div style="padding:28px 32px;">
        <div style="background:rgba(245,166,35,0.1);border:1px solid rgba(245,166,35,0.3);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
          <div style="color:#f5a623;font-size:0.65rem;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">⚠ PROMEMORIA SCADENZA</div>
          <div style="color:#e8eaf0;font-size:1rem;font-weight:600;line-height:1.5;">
            Il tuo contratto con <strong style="color:#f5a623;">${contratto.fornitore}</strong> scade tra circa <strong style="color:#f5a623;">${mesiRimasti} mesi</strong>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr style="border-bottom:1px solid #1e2128;">
            <td style="padding:10px 0;color:#8891a4;font-size:0.75rem;font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;">Fornitore</td>
            <td style="padding:10px 0;color:#e8eaf0;font-weight:600;text-align:right;">${contratto.fornitore}</td>
          </tr>
          <tr style="border-bottom:1px solid #1e2128;">
            <td style="padding:10px 0;color:#8891a4;font-size:0.75rem;font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;">Offerta</td>
            <td style="padding:10px 0;color:#e8eaf0;font-weight:600;text-align:right;">${contratto.nome_offerta}</td>
          </tr>
          <tr style="border-bottom:1px solid #1e2128;">
            <td style="padding:10px 0;color:#8891a4;font-size:0.75rem;font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;">Tipo</td>
            <td style="padding:10px 0;color:#e8eaf0;text-align:right;">${contratto.tipo_mercato === 'fisso' ? 'Prezzo Fisso' : contratto.tipo_mercato === 'indicizzato_pun' ? 'Indicizzato PUN' : 'Tutela'}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#8891a4;font-size:0.75rem;font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;">Scadenza</td>
            <td style="padding:10px 0;color:#ff4757;font-weight:700;text-align:right;">${new Date(contratto.data_fine).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
          </tr>
        </table>

        <div style="background:#111318;border:1px solid #1e2128;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
          <div style="color:#8891a4;font-size:0.72rem;line-height:1.7;">
            È il momento ideale per confrontare le offerte sul mercato. Apri Voltix per analizzare i tuoi consumi reali e trovare il contratto più conveniente.
          </div>
        </div>

        <a href="https://tiny-sherbet-649e63.netlify.app/analisi" 
           style="display:block;background:#f5a623;color:#0a0b0e;text-align:center;padding:14px 24px;border-radius:8px;font-weight:700;font-size:0.9rem;text-decoration:none;letter-spacing:0.02em;">
          ⚡ Apri Voltix — Analisi AI Mercato
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;color:#4a5166;font-size:0.65rem;font-family:monospace;letter-spacing:0.08em;text-transform:uppercase;">
      VOLTIX · Gestione Energia Professionale<br>
      Questo è un promemoria automatico
    </div>
  </div>
</body>
</html>`

        // Invia email via Resend
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [p.email_destinatario],
            subject: `⚡ VOLTIX — Il contratto ${contratto.fornitore} scade tra ${mesiRimasti} mesi`,
            html: emailHtml
          })
        })

        if (!emailRes.ok) {
          const err = await emailRes.text()
          throw new Error(`Resend error: ${err}`)
        }

        // Marca come inviato
        await supabase
          .from('promemoria_email')
          .update({ inviato: true, data_invio_effettivo: new Date().toISOString() })
          .eq('id', p.id)

        inviati++
      } catch (e) {
        errori.push({ id: p.id, error: e.message })
      }
    }

    return res.status(200).json({
      message: `Inviati ${inviati}/${promemoria.length} promemoria`,
      errori: errori.length > 0 ? errori : undefined
    })

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
