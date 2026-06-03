import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { MESI, MESI_FULL } from '../lib/utils'
import { RefreshCw, Plus, X, TrendingUp, TrendingDown, Info } from 'lucide-react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'

export default function PunPage() {
  const [pun, setPun] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [fetchLog, setFetchLog] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ anno: new Date().getFullYear(), mese: new Date().getMonth() + 1, pun_medio: '', pun_f1: '', pun_f2: '', pun_f3: '' })
  const [saving, setSaving] = useState(false)
  const [vistaTab, setVistaTab] = useState('storico')

  useEffect(() => { loadPun() }, [])

  async function loadPun() {
    setLoading(true)
    const { data } = await supabase.from('pun_storico').select('*').order('anno').order('mese')
    setPun(data || [])
    setLoading(false)
  }

  async function fetchGME() {
    setFetching(true)
    setFetchLog('Contatto Netlify Function per fetch GME...')
    try {
      const res = await fetch('/api/fetch-pun')
      if (!res.ok) throw new Error(`Errore server: ${res.status}`)
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      setFetchLog(`✓ ${result.message || 'Aggiornamento completato'}`)
      await loadPun()
    } catch (e) {
      setFetchLog(`✗ Errore: ${e.message}. Inserisci manualmente.`)
    } finally {
      setFetching(false)
    }
  }

  async function saveManuale() {
    if (!form.pun_medio) { alert('Inserisci almeno il PUN medio'); return }
    setSaving(true)
    const payload = {
      anno: parseInt(form.anno),
      mese: parseInt(form.mese),
      pun_medio: parseFloat(form.pun_medio),
      pun_f1: parseFloat(form.pun_f1) || null,
      pun_f2: parseFloat(form.pun_f2) || null,
      pun_f3: parseFloat(form.pun_f3) || null,
      fonte: 'manuale'
    }
    await supabase.from('pun_storico').upsert(payload, { onConflict: 'anno,mese' })
    setSaving(false)
    setShowModal(false)
    loadPun()
  }

  // Dati per grafici
  const punChart = pun.map(p => ({
    name: `${MESI[p.mese - 1]}'${String(p.anno).slice(2)}`,
    nameCompleto: `${MESI_FULL[p.mese - 1]} ${p.anno}`,
    medio: parseFloat(p.pun_medio) || 0,
    f1: parseFloat(p.pun_f1) || null,
    f2: parseFloat(p.pun_f2) || null,
    f3: parseFloat(p.pun_f3) || null,
    fonte: p.fonte,
    anno: p.anno,
    mese: p.mese
  }))

  // Dati ultimi 12 mesi
  const ultimi12 = punChart.slice(-12)

  // Statistiche
  const ultimoMese = punChart[punChart.length - 1]
  const mesePrec = punChart[punChart.length - 2]
  const deltaMese = ultimoMese && mesePrec ? ((ultimoMese.medio - mesePrec.medio) / mesePrec.medio) * 100 : null
  const mediaAnno = pun.filter(p => p.anno === new Date().getFullYear())
  const mediaAnnoVal = mediaAnno.length > 0 ? mediaAnno.reduce((s, p) => s + parseFloat(p.pun_medio), 0) / mediaAnno.length : null
  const minPun = punChart.length > 0 ? Math.min(...punChart.map(p => p.medio)) : null
  const maxPun = punChart.length > 0 ? Math.max(...punChart.map(p => p.medio)) : null

  // Dati per anno (media annuale)
  const perAnno = {}
  pun.forEach(p => {
    if (!perAnno[p.anno]) perAnno[p.anno] = []
    perAnno[p.anno].push(parseFloat(p.pun_medio) || 0)
  })
  const mediaAnnuale = Object.entries(perAnno).map(([anno, vals]) => ({
    name: anno,
    media: (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)
  }))

  const TT = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    return (
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
        <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{d?.nameCompleto || label}</div>
        {payload.map((p, i) => <div key={i} style={{ color: p.color }}>{p.name}: {parseFloat(p.value).toFixed(2)} €/MWh ({(parseFloat(p.value) / 10).toFixed(4)} c€/kWh)</div>)}
        {d?.fonte && <div style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: '0.65rem' }}>Fonte: {d.fonte.toUpperCase()}</div>}
      </div>
    )
  }

  if (loading) return <div className="loading-overlay"><div className="spinner" style={{ width: 28, height: 28 }} /></div>

  return (
    <div className="flex-col gap-20">
      {/* Header */}
      <div className="flex-between">
        <div className="flex gap-12" style={{ alignItems: 'center' }}>
          <div className="tabs">
            <button className={`tab ${vistaTab === 'storico' ? 'active' : ''}`} onClick={() => setVistaTab('storico')}>Storico</button>
            <button className={`tab ${vistaTab === 'fasce' ? 'active' : ''}`} onClick={() => setVistaTab('fasce')}>Per Fascia</button>
            <button className={`tab ${vistaTab === 'tabella' ? 'active' : ''}`} onClick={() => setVistaTab('tabella')}>Tabella</button>
          </div>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-secondary" onClick={fetchGME} disabled={fetching}>
            {fetching ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <RefreshCw size={13} />}
            Aggiorna da GME
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={13} />
            Inserisci Manuale
          </button>
        </div>
      </div>

      {/* Fetch log */}
      {fetchLog && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: fetchLog.startsWith('✓') ? 'var(--green)' : fetchLog.startsWith('✗') ? 'var(--red)' : 'var(--text-secondary)' }}>
          {fetchLog}
        </div>
      )}

      {/* Info box */}
      <div style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 'var(--radius)', padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Info size={14} style={{ color: 'var(--cyan)', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Il <strong style={{ color: 'var(--cyan)' }}>PUN (Prezzo Unico Nazionale)</strong> è il prezzo di riferimento dell'energia elettrica sul mercato MGP (Mercato del Giorno Prima) gestito dal GME. Valori in <strong>€/MWh</strong>. Per convertire in c€/kWh dividi per 10. <strong>F1</strong> = ore di punta (lun-ven 8-19) · <strong>F2</strong> = intermedie · <strong>F3</strong> = valle (notti e domeniche).
        </p>
      </div>

      {/* KPI */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">PUN Ultimo Mese</div>
          <div className="kpi-value green">{ultimoMese ? ultimoMese.medio.toFixed(2) : '—'}</div>
          <div className="kpi-sub">€/MWh · {ultimoMese ? `${MESI_FULL[ultimoMese.mese - 1]} ${ultimoMese.anno}` : '—'}</div>
          {deltaMese !== null && (
            <div className={`kpi-delta ${deltaMese > 0 ? 'up' : 'down'}`} style={{ color: deltaMese > 0 ? 'var(--red)' : 'var(--green)', background: deltaMese > 0 ? 'rgba(255,71,87,0.1)' : 'rgba(0,229,160,0.1)' }}>
              {deltaMese > 0 ? '▲' : '▼'} {Math.abs(deltaMese).toFixed(1)}% vs mese prec.
            </div>
          )}
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Equivalente c€/kWh</div>
          <div className="kpi-value cyan">{ultimoMese ? (ultimoMese.medio / 10).toFixed(4) : '—'}</div>
          <div className="kpi-sub">c€/kWh solo materia prima PUN</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Media Anno in Corso</div>
          <div className="kpi-value">{mediaAnnoVal ? mediaAnnoVal.toFixed(2) : '—'}</div>
          <div className="kpi-sub">€/MWh · {new Date().getFullYear()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Minimo Storico</div>
          <div className="kpi-value" style={{ color: 'var(--green)' }}>{minPun ? minPun.toFixed(2) : '—'}</div>
          <div className="kpi-sub">€/MWh</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Massimo Storico</div>
          <div className="kpi-value" style={{ color: 'var(--red)' }}>{maxPun ? maxPun.toFixed(2) : '—'}</div>
          <div className="kpi-sub">€/MWh</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Mesi Registrati</div>
          <div className="kpi-value">{pun.length}</div>
          <div className="kpi-sub">storico totale</div>
        </div>
      </div>

      {/* ═══ STORICO ═══ */}
      {vistaTab === 'storico' && (
        <>
          <div className="card">
            <div className="card-header">
              <div className="card-title"><span className="card-title-icon" style={{ background: 'var(--green)' }} />PUN Mensile Storico (€/MWh)</div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={punChart}>
                <defs>
                  <linearGradient id="punGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--green)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--green)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval={3} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} unit=" €/MWh" />
                <Tooltip content={<TT />} />
                <ReferenceLine y={mediaAnnoVal || 0} stroke="var(--amber)" strokeDasharray="4 2" strokeOpacity={0.6} label={{ value: 'Media anno', fill: 'var(--amber)', fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                <Area type="monotone" dataKey="medio" name="PUN Medio" stroke="var(--green)" fill="url(#punGrad2)" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-header"><div className="card-title"><span className="card-title-icon" style={{ background: 'var(--amber)' }} />Ultimi 12 Mesi</div></div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={ultimi12}>
                  <defs>
                    <linearGradient id="punGrad3" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--amber)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TT />} />
                  <Area type="monotone" dataKey="medio" name="PUN" stroke="var(--amber)" fill="url(#punGrad3)" strokeWidth={2} dot={{ fill: 'var(--amber)', r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="card-header"><div className="card-title"><span className="card-title-icon" style={{ background: 'var(--cyan)' }} />Media Annuale PUN</div></div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={mediaAnnuale}>
                  <defs>
                    <linearGradient id="annGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--cyan)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--cyan)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      <div style={{ color: 'var(--text-secondary)' }}>{label}</div>
                      <div style={{ color: 'var(--cyan)' }}>Media: {parseFloat(payload[0]?.value).toFixed(2)} €/MWh</div>
                    </div>
                  ) : null} />
                  <Area type="monotone" dataKey="media" name="Media PUN" stroke="var(--cyan)" fill="url(#annGrad)" strokeWidth={2} dot={{ fill: 'var(--cyan)', r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* ═══ FASCE ═══ */}
      {vistaTab === 'fasce' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title"><span className="card-title-icon" />PUN per Fascia (€/MWh)</div>
            <div className="flex gap-8">
              <span className="fascia-badge fascia-f1">F1</span>
              <span className="fascia-badge fascia-f2">F2</span>
              <span className="fascia-badge fascia-f3">F3</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={punChart.filter(p => p.f1)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval={3} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} unit=" €/MWh" />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', paddingTop: 12 }} />
              <Line type="monotone" dataKey="f1" name="F1 Punta" stroke="var(--f1-color)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="f2" name="F2 Intermedia" stroke="var(--f2-color)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="f3" name="F3 Valle" stroke="var(--f3-color)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="medio" name="Medio" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ═══ TABELLA ═══ */}
      {vistaTab === 'tabella' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Mese / Anno</th>
                  <th>PUN Medio</th>
                  <th>PUN F1 (Punta)</th>
                  <th>PUN F2 (Intermedia)</th>
                  <th>PUN F3 (Valle)</th>
                  <th>In c€/kWh</th>
                  <th>Fonte</th>
                  <th>Δ Mese</th>
                </tr>
              </thead>
              <tbody>
                {[...punChart].reverse().map((p, i, arr) => {
                  const prev = arr[i + 1]
                  const delta = prev ? ((p.medio - prev.medio) / prev.medio) * 100 : null
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{MESI_FULL[p.mese - 1]} {p.anno}</td>
                      <td className="td-mono" style={{ color: 'var(--green)', fontWeight: 700 }}>{p.medio.toFixed(2)}</td>
                      <td className="td-mono text-amber">{p.f1 ? p.f1.toFixed(2) : '—'}</td>
                      <td className="td-mono" style={{ color: 'var(--f2-color)' }}>{p.f2 ? p.f2.toFixed(2) : '—'}</td>
                      <td className="td-mono" style={{ color: 'var(--f3-color)' }}>{p.f3 ? p.f3.toFixed(2) : '—'}</td>
                      <td className="td-mono text-cyan">{(p.medio / 10).toFixed(4)}</td>
                      <td><span className={`badge ${p.fonte === 'manuale' ? 'badge-warning' : 'badge-info'}`}>{p.fonte?.toUpperCase()}</span></td>
                      <td>
                        {delta !== null ? (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: delta > 0 ? 'var(--red)' : 'var(--green)' }}>
                            {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal inserimento manuale */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title">Inserimento PUN Manuale</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 'var(--radius)', padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Fonte dati ufficiale: <a href="https://www.mercatoelettrico.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan)' }}>mercatoelettrico.org</a> → Esiti di mercato → MGP → Prezzi
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Anno</label>
                  <input className="form-input" type="number" value={form.anno} onChange={e => setForm(p => ({ ...p, anno: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Mese</label>
                  <select className="form-select" value={form.mese} onChange={e => setForm(p => ({ ...p, mese: e.target.value }))}>
                    {MESI_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-section-title">Prezzi (€/MWh)</div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">PUN Medio *</label>
                  <input className="form-input" type="number" step="0.01" placeholder="es. 95.40" value={form.pun_medio} onChange={e => setForm(p => ({ ...p, pun_medio: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">F1 Punta</label>
                  <input className="form-input" type="number" step="0.01" value={form.pun_f1} onChange={e => setForm(p => ({ ...p, pun_f1: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">F2 Intermedia</label>
                  <input className="form-input" type="number" step="0.01" value={form.pun_f2} onChange={e => setForm(p => ({ ...p, pun_f2: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">F3 Valle</label>
                  <input className="form-input" type="number" step="0.01" value={form.pun_f3} onChange={e => setForm(p => ({ ...p, pun_f3: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={saveManuale} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
