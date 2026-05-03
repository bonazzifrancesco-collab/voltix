import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { formatEuro, calcolaStatistiche, MESI } from '../lib/utils'
import { Sparkles, TrendingUp, Zap, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Info } from 'lucide-react'

export default function AnalisiAIPage() {
  const { user } = useAuth()
  const [bollette, setBollette] = useState([])
  const [contratto, setContratto] = useState(null)
  const [pun, setPun] = useState([])
  const [analisi, setAnalisi] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [tipoAnalisi, setTipoAnalisi] = useState('confronto_offerte')
  const [risultatoCorrente, setRisultatoCorrente] = useState(null)
  const [expandedOffer, setExpandedOffer] = useState(null)

  useEffect(() => { loadData() }, [user])

  async function loadData() {
    if (!user) return
    setLoading(true)
    const [{ data: boll }, { data: cont }, { data: punData }, { data: storico }] = await Promise.all([
      supabase.from('bollette').select('*').eq('user_id', user.id).order('periodo_inizio', { ascending: false }).limit(12),
      supabase.from('contratti').select('*').eq('user_id', user.id).eq('attivo', true).limit(1),
      supabase.from('pun_storico').select('*').order('anno', { ascending: false }).order('mese', { ascending: false }).limit(6),
      supabase.from('analisi_ai').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5)
    ])
    setBollette(boll || [])
    setContratto(cont?.[0] || null)
    setPun((punData || []).reverse())
    setAnalisi(storico || [])
    setLoading(false)
  }

  async function avviaAnalisi() {
    if (bollette.length === 0) { alert('Inserisci almeno una bolletta prima di avviare l\'analisi'); return }
    setAnalyzing(true)
    setRisultatoCorrente(null)

    const stats = calcolaStatistiche(bollette)
    const ultimiPun = pun.map(p => ({ anno: p.anno, mese: p.mese, medio: p.pun_medio }))

    const inputDati = {
      contratto: contratto ? {
        fornitore: contratto.fornitore,
        offerta: contratto.nome_offerta,
        tipo: contratto.tipo_mercato,
        prezzoF1: contratto.prezzo_f1,
        prezzoF2: contratto.prezzo_f2,
        prezzoF3: contratto.prezzo_f3,
        potenza: contratto.potenza_impegnata,
      } : null,
      consumiUltimi12Mesi: bollette.slice(0, 12).map(b => ({
        periodo: `${new Date(b.periodo_inizio).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}`,
        kwhTot: b.kwh_totale, kwhF1: b.kwh_f1, kwhF2: b.kwh_f2, kwhF3: b.kwh_f3,
        importo: b.importo_totale, prezzo_f1: b.prezzo_f1, prezzo_f2: b.prezzo_f2, prezzo_f3: b.prezzo_f3
      })),
      statistiche: {
        kwhAnnuiStimati: stats?.totKwh ? (stats.totKwh / bollette.length * 12).toFixed(0) : null,
        spesaAnnuaStimata: stats?.totImporto ? (stats.totImporto / bollette.length * 12).toFixed(2) : null,
        prezzoMedioEffettivo: stats?.prezzoMedioKwh ? (stats.prezzoMedioKwh * 100).toFixed(4) : null,
        percF1: stats?.percF1?.toFixed(1), percF2: stats?.percF2?.toFixed(1), percF3: stats?.percF3?.toFixed(1),
        kwhMedioMensile: stats ? (stats.totKwh / bollette.length).toFixed(0) : null,
      },
      pun: ultimiPun,
      tipoAnalisi,
    }

    try {
      const res = await fetch('/.netlify/functions/analisi-mercato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputDati)
      })
      if (!res.ok) throw new Error(`Errore server: ${res.status}`)
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      setRisultatoCorrente(result)

      // Salva in DB
      await supabase.from('analisi_ai').insert({
        user_id: user.id,
        tipo: tipoAnalisi,
        input_dati: inputDati,
        risultato: result.testo,
        offerte_trovate: result.offerte || null,
        risparmio_stimato: result.risparmioStimato || null,
        raccomandazione: result.raccomandazione || null,
      })

      await loadData()
    } catch (e) {
      setRisultatoCorrente({ errore: e.message })
    } finally {
      setAnalyzing(false)
    }
  }

  const stats = calcolaStatistiche(bollette)
  const kwhMensile = stats && bollette.length > 0 ? (stats.totKwh / bollette.length).toFixed(0) : null
  const spesaMensile = stats && bollette.length > 0 ? (stats.totImporto / bollette.length).toFixed(2) : null
  const ultimoPun = pun[pun.length - 1]

  if (loading) return <div className="loading-overlay"><div className="spinner" style={{ width: 28, height: 28 }} /></div>

  return (
    <div className="flex-col gap-20">
      {/* Header informativo */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(245,166,35,0.08), rgba(0,212,255,0.04))',
        border: '1px solid rgba(245,166,35,0.2)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px 24px',
      }}>
        <div className="flex gap-12" style={{ alignItems: 'center', marginBottom: 10 }}>
          <Sparkles size={18} color="var(--amber)" />
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>Analisi AI del Mercato Energetico</span>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          L'AI analizza i tuoi consumi reali, il contratto attuale, l'andamento del PUN e ricerca offerte competitive
          su tutto il mercato libero italiano (non solo i grandi operatori). Ottieni raccomandazioni personalizzate
          su quando e come cambiare contratto, e suggerimenti per ottimizzare i consumi.
        </p>
      </div>

      {/* Situazione attuale */}
      <div className="grid-3">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            <span className="card-title-icon" />Contratto Attuale
          </div>
          {contratto ? (
            <div className="flex-col gap-8">
              <div style={{ fontSize: '1rem', fontWeight: 700 }}>{contratto.fornitore}</div>
              <div className="text-secondary" style={{ fontSize: '0.85rem' }}>{contratto.nome_offerta}</div>
              <span className="badge badge-info" style={{ alignSelf: 'flex-start' }}>
                {contratto.tipo_mercato === 'fisso' ? 'Prezzo Fisso' : contratto.tipo_mercato === 'indicizzato_pun' ? 'Indicizzato PUN' : 'Tutela'}
              </span>
              {contratto.prezzo_f1 && (
                <div className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>
                  F1: {(contratto.prezzo_f1 * 100).toFixed(3)} c€ · F2: {(contratto.prezzo_f2 * 100).toFixed(3)} c€ · F3: {(contratto.prezzo_f3 * 100).toFixed(3)} c€
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>
              Nessun contratto inserito. Aggiungilo nelle Impostazioni per analisi più precise.
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            <span className="card-title-icon" style={{ background: 'var(--amber)' }} />Consumi Profilo
          </div>
          <div className="flex-col gap-6">
            <div className="flex-between">
              <span className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>kWh/mese medio</span>
              <span className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--amber)' }}>{kwhMensile || '—'}</span>
            </div>
            <div className="flex-between">
              <span className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>€/mese medio</span>
              <span className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 700 }}>{spesaMensile ? formatEuro(spesaMensile) : '—'}</span>
            </div>
            <div className="flex-between">
              <span className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>Prezzo effettivo</span>
              <span className="font-mono" style={{ fontSize: '0.85rem', color: 'var(--cyan)' }}>
                {stats?.prezzoMedioKwh ? (stats.prezzoMedioKwh * 100).toFixed(3) + ' c€/kWh' : '—'}
              </span>
            </div>
            {stats && (
              <div className="flex gap-4" style={{ marginTop: 4 }}>
                <span className="fascia-badge fascia-f1">F1 {stats.percF1.toFixed(0)}%</span>
                <span className="fascia-badge fascia-f2">F2 {stats.percF2.toFixed(0)}%</span>
                <span className="fascia-badge fascia-f3">F3 {stats.percF3.toFixed(0)}%</span>
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            <span className="card-title-icon" style={{ background: 'var(--green)' }} />PUN di Riferimento
          </div>
          {ultimoPun ? (
            <div className="flex-col gap-6">
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--green)' }}>{parseFloat(ultimoPun.pun_medio).toFixed(2)}</div>
              <div className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>€/MWh · {MESI[ultimoPun.mese - 1]} {ultimoPun.anno}</div>
              <div className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--cyan)' }}>
                = {(parseFloat(ultimoPun.pun_medio) / 10).toFixed(4)} c€/kWh
              </div>
            </div>
          ) : (
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>Aggiorna i dati PUN nella sezione dedicata</div>
          )}
        </div>
      </div>

      {/* Selezione tipo analisi + avvio */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><span className="card-title-icon" style={{ background: 'var(--amber)' }} />Avvia Nuova Analisi</div>
        </div>
        <div className="flex-col gap-16">
          <div className="tabs">
            <button className={`tab ${tipoAnalisi === 'confronto_offerte' ? 'active' : ''}`} onClick={() => setTipoAnalisi('confronto_offerte')} style={{ flex: 1 }}>
              🔍 Confronto Offerte
            </button>
            <button className={`tab ${tipoAnalisi === 'ottimizzazione_consumi' ? 'active' : ''}`} onClick={() => setTipoAnalisi('ottimizzazione_consumi')} style={{ flex: 1 }}>
              ⚡ Ottimizza Consumi
            </button>
            <button className={`tab ${tipoAnalisi === 'previsione_pun' ? 'active' : ''}`} onClick={() => setTipoAnalisi('previsione_pun')} style={{ flex: 1 }}>
              📈 Scenario PUN
            </button>
          </div>

          {tipoAnalisi === 'confronto_offerte' && (
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.7, background: 'var(--bg-elevated)', padding: '12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              L'AI analizzerà: profilo di consumo reale · contratto attuale · offerte mercato libero (fisso, indicizzato, monorario) · stima risparmio annuale · confronto non solo con Enel/A2A/ENI ma anche operatori minori e nuovi entranti.
            </div>
          )}
          {tipoAnalisi === 'ottimizzazione_consumi' && (
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.7, background: 'var(--bg-elevated)', padding: '12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              L'AI analizzerà: distribuzione consumi per fascia oraria · suggerimenti spostamento carichi · potenziale risparmio passando a tariffa monoraria vs bioraria · consigli su efficienza energetica basati sui tuoi dati reali.
            </div>
          )}
          {tipoAnalisi === 'previsione_pun' && (
            <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.7, background: 'var(--bg-elevated)', padding: '12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              L'AI analizzerà: trend storico PUN · fattori di mercato attuali · scenario se rimani a prezzo fisso vs passaggio a indicizzato PUN · convenienza in base al tuo profilo di consumo.
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={avviaAnalisi}
            disabled={analyzing || bollette.length === 0}
            style={{ alignSelf: 'flex-start' }}
          >
            {analyzing
              ? <><span className="spinner" style={{ width: 15, height: 15 }} />Analisi in corso...</>
              : <><Sparkles size={15} />Avvia Analisi AI</>
            }
          </button>

          {bollette.length === 0 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--red)' }}>
              ⚠ Inserisci almeno una bolletta per avviare l'analisi
            </div>
          )}
        </div>
      </div>

      {/* Risultato corrente */}
      {risultatoCorrente && (
        <div className="card fade-in">
          <div className="card-header">
            <div className="flex-col gap-4">
              <div className="ai-badge"><Sparkles size={10} />ANALISI AI</div>
              <div className="card-title">
                <span className="card-title-icon" style={{ background: 'var(--amber)' }} />
                {tipoAnalisi === 'confronto_offerte' ? 'Risultati Confronto Offerte' :
                 tipoAnalisi === 'ottimizzazione_consumi' ? 'Suggerimenti Ottimizzazione' : 'Scenario PUN'}
              </div>
            </div>
            {risultatoCorrente.risparmioStimato && (
              <div style={{ textAlign: 'right' }}>
                <div className="font-mono text-muted" style={{ fontSize: '0.65rem' }}>RISPARMIO STIMATO</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--green)' }}>
                  {formatEuro(risultatoCorrente.risparmioStimato)}
                </div>
                <div className="font-mono text-muted" style={{ fontSize: '0.65rem' }}>annui</div>
              </div>
            )}
          </div>

          {risultatoCorrente.errore ? (
            <div style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', padding: '12px', background: 'rgba(255,71,87,0.05)', borderRadius: 'var(--radius)', border: '1px solid rgba(255,71,87,0.2)' }}>
              ✗ {risultatoCorrente.errore}
            </div>
          ) : (
            <div className="flex-col gap-16">
              {/* Raccomandazione principale */}
              {risultatoCorrente.raccomandazione && (
                <div style={{ background: 'linear-gradient(135deg, rgba(0,229,160,0.08), rgba(0,229,160,0.02))', border: '1px solid rgba(0,229,160,0.2)', borderRadius: 'var(--radius)', padding: '14px 18px' }}>
                  <div className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--green)', letterSpacing: '0.1em', marginBottom: 8 }}>RACCOMANDAZIONE</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.6 }}>{risultatoCorrente.raccomandazione}</div>
                </div>
              )}

              {/* Testo analisi */}
              <div className="ai-response">{risultatoCorrente.testo}</div>

              {/* Offerte trovate */}
              {risultatoCorrente.offerte && risultatoCorrente.offerte.length > 0 && (
                <div className="flex-col gap-12">
                  <div className="form-section-title">Offerte Identificate</div>
                  {risultatoCorrente.offerte.map((offerta, i) => (
                    <div
                      key={i}
                      style={{
                        background: i === 0 ? 'linear-gradient(135deg, rgba(245,166,35,0.08), rgba(0,0,0,0))' : 'var(--bg-elevated)',
                        border: `1px solid ${i === 0 ? 'rgba(245,166,35,0.3)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)',
                        padding: '16px',
                        cursor: 'pointer'
                      }}
                      onClick={() => setExpandedOffer(expandedOffer === i ? null : i)}
                    >
                      <div className="flex-between">
                        <div className="flex gap-12" style={{ alignItems: 'center' }}>
                          {i === 0 && <span className="badge badge-warning">⭐ Top Scelta</span>}
                          <div>
                            <div style={{ fontWeight: 700 }}>{offerta.fornitore}</div>
                            <div className="text-secondary" style={{ fontSize: '0.8rem' }}>{offerta.nomeOfferta}</div>
                          </div>
                        </div>
                        <div className="flex gap-16" style={{ alignItems: 'center' }}>
                          {offerta.prezzoStimato && (
                            <div style={{ textAlign: 'right' }}>
                              <div className="font-mono" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--green)' }}>{offerta.prezzoStimato}</div>
                              <div className="font-mono text-muted" style={{ fontSize: '0.65rem' }}>c€/kWh stimato</div>
                            </div>
                          )}
                          {offerta.risparmioAnnuo && (
                            <div style={{ textAlign: 'right' }}>
                              <div className="font-mono" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--amber)' }}>{offerta.risparmioAnnuo}</div>
                              <div className="font-mono text-muted" style={{ fontSize: '0.65rem' }}>risparmio/anno</div>
                            </div>
                          )}
                          {expandedOffer === i ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </div>
                      </div>

                      {expandedOffer === i && (
                        <div className="flex-col gap-8" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          {offerta.tipo && <div className="font-mono text-secondary" style={{ fontSize: '0.75rem' }}>Tipo: {offerta.tipo}</div>}
                          {offerta.descrizione && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{offerta.descrizione}</div>}
                          {offerta.proCons && (
                            <div className="flex gap-12">
                              {offerta.proCons.pro && (
                                <div style={{ flex: 1 }}>
                                  <div className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--green)', marginBottom: 4 }}>PRO</div>
                                  {offerta.proCons.pro.map((p, j) => <div key={j} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>✓ {p}</div>)}
                                </div>
                              )}
                              {offerta.proCons.contro && (
                                <div style={{ flex: 1 }}>
                                  <div className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--red)', marginBottom: 4 }}>CONTRO</div>
                                  {offerta.proCons.contro.map((c, j) => <div key={j} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>✗ {c}</div>)}
                                </div>
                              )}
                            </div>
                          )}
                          {offerta.url && (
                            <a href={offerta.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
                              <ExternalLink size={12} />Visita sito fornitore
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Storico analisi precedenti */}
      {analisi.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title"><span className="card-title-icon" />Analisi Precedenti</div>
          </div>
          <div className="flex-col gap-8">
            {analisi.map((a, i) => (
              <div key={a.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
                <div className="flex-between">
                  <div className="flex gap-12" style={{ alignItems: 'center' }}>
                    <span className="badge badge-neutral">
                      {a.tipo === 'confronto_offerte' ? 'Confronto Offerte' : a.tipo === 'ottimizzazione_consumi' ? 'Ottimizzazione' : 'Scenario PUN'}
                    </span>
                    <span className="font-mono text-muted" style={{ fontSize: '0.68rem' }}>
                      {new Date(a.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {a.risparmio_stimato && (
                    <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--green)', fontWeight: 700 }}>
                      Risparmio: {formatEuro(a.risparmio_stimato)}/anno
                    </span>
                  )}
                </div>
                {a.raccomandazione && (
                  <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {a.raccomandazione}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', display: 'flex', gap: 10 }}>
        <Info size={13} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }} />
        <p className="font-mono text-muted" style={{ fontSize: '0.65rem', lineHeight: 1.7 }}>
          Le analisi AI sono generate sulla base dei tuoi dati reali e delle informazioni disponibili sul mercato energetico italiano. I prezzi delle offerte sono stime orientative; verifica sempre le condizioni aggiornate direttamente sul sito del fornitore. Non costituisce consulenza finanziaria o contrattuale.
        </p>
      </div>
    </div>
  )
}
