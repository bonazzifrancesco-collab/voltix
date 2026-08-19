import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { formatEuro, formatKWh } from '../lib/utils'
import { Plus, Trash2, Edit3, Save, X, ChevronDown, ChevronUp, Calculator, BarChart3 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
} from 'recharts'

// ── Tariffe ARERA 2024/2025 (aggiornabili manualmente) ──
const ARERA_DEFAULT = {
  quota_fissa_trasporto: 25.32,       // €/anno
  quota_potenza_trasporto: 11.556,    // €/kW/anno
  quota_fissa_oneri: 5.676,           // €/anno
  accise_kwh: 0.0227,                 // €/kWh
  canone_rai_annuo: 90.00,            // €/anno
  iva_percentuale: 10,                // %
}

const COLORI_OFFERTE = ['#f5a623', '#00d4ff', '#00e5a0', '#8b5cf6', '#ff4757', '#3b8beb']

const EMPTY_OFFERTA = {
  fornitore: '', nome_offerta: '', tipo_mercato: 'fisso', colore: '#f5a623',
  prezzo_f1: '', prezzo_f2: '', prezzo_f3: '', prezzo_monorario: '', spread_pun: '',
  perdite_rete_perc: 10,
  corrispettivo_commercializzazione: '', corrispettivo_misura: '', altri_corrispettivi_fissi: '',
  note: ''
}

// ── Calcolo costo annuale completo ──
function calcolaCosto(offerta, sim, pun_medio = 0) {
  const kwh_f1 = parseFloat(sim.kwh_f1) || 0
  const kwh_f2 = parseFloat(sim.kwh_f2) || 0
  const kwh_f3 = parseFloat(sim.kwh_f3) || 0
  const kwh_tot = kwh_f1 + kwh_f2 + kwh_f3
  const potenza = parseFloat(sim.potenza_kw) || 6
  const perdite = 1 + (parseFloat(offerta.perdite_rete_perc) || 10) / 100

  // Prezzi energia con perdite di rete incluse
  let p_f1, p_f2, p_f3
  if (offerta.tipo_mercato === 'monorario') {
    const pm = parseFloat(offerta.prezzo_monorario) || 0
    p_f1 = p_f2 = p_f3 = pm * perdite
  } else if (offerta.tipo_mercato === 'indicizzato_pun') {
    const spread = parseFloat(offerta.spread_pun) || 0
    const pun_kwh = pun_medio / 1000 // €/MWh → €/kWh
    p_f1 = (pun_kwh + spread) * perdite
    p_f2 = (pun_kwh + spread) * perdite
    p_f3 = (pun_kwh + spread) * perdite
  } else {
    p_f1 = (parseFloat(offerta.prezzo_f1) || 0) * perdite
    p_f2 = (parseFloat(offerta.prezzo_f2) || 0) * perdite
    p_f3 = (parseFloat(offerta.prezzo_f3) || 0) * perdite
  }

  // Costi energia
  const costo_f1 = kwh_f1 * p_f1
  const costo_f2 = kwh_f2 * p_f2
  const costo_f3 = kwh_f3 * p_f3
  const costo_energia = costo_f1 + costo_f2 + costo_f3

  // Trasporto e gestione rete (ARERA)
  const qt = parseFloat(sim.quota_fissa_trasporto) || ARERA_DEFAULT.quota_fissa_trasporto
  const qp = parseFloat(sim.quota_potenza_trasporto) || ARERA_DEFAULT.quota_potenza_trasporto
  const costo_trasporto = qt + (qp * potenza)

  // Oneri di sistema (ARERA)
  const costo_oneri = parseFloat(sim.quota_fissa_oneri) || ARERA_DEFAULT.quota_fissa_oneri

  // Accise
  const accise = parseFloat(sim.accise_kwh) || ARERA_DEFAULT.accise_kwh
  const costo_accise = kwh_tot * accise

  // Canone RAI
  const costo_canone = parseFloat(sim.canone_rai_annuo) ?? ARERA_DEFAULT.canone_rai_annuo

  // Corrispettivi fornitore
  const corr_comm = parseFloat(offerta.corrispettivo_commercializzazione) || 0
  const corr_mis = parseFloat(offerta.corrispettivo_misura) || 0
  const corr_altri = parseFloat(offerta.altri_corrispettivi_fissi) || 0
  const costo_corrispettivi = corr_comm + corr_mis + corr_altri

  // Imponibile
  const imponibile = costo_energia + costo_trasporto + costo_oneri +
    costo_accise + costo_canone + costo_corrispettivi

  // IVA
  const iva_perc = parseFloat(sim.iva_percentuale) ?? ARERA_DEFAULT.iva_percentuale
  const costo_iva = imponibile * (iva_perc / 100)

  const totale = imponibile + costo_iva
  const prezzo_medio_effettivo = kwh_tot > 0 ? totale / kwh_tot : 0

  return {
    costo_f1, costo_f2, costo_f3,
    costo_energia,
    costo_trasporto,
    costo_oneri,
    costo_accise,
    costo_canone,
    costo_corrispettivi,
    imponibile,
    costo_iva,
    totale,
    prezzo_medio_effettivo,
    kwh_tot
  }
}


// Componente FS estratto fuori per evitare re-render
function FS({ label, name, type = 'number', step = '0.000001', placeholder, hint, formOfferta, setFormOfferta }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}{hint && <span className="text-muted" style={{ fontWeight: 400 }}> ({hint})</span>}</label>
      <input className="form-input" type={type} step={step} placeholder={placeholder}
        value={formOfferta[name] ?? ''}
        onChange={e => setFormOfferta(p => ({ ...p, [name]: e.target.value }))} />
    </div>
  )
}

// ── Componente ARERA separato per evitare re-render sul main ──
function ARERAEditor({ simSel, onSave }) {
  const [localVals, setLocalVals] = useState({
    quota_fissa_trasporto: simSel.quota_fissa_trasporto ?? ARERA_DEFAULT.quota_fissa_trasporto,
    quota_potenza_trasporto: simSel.quota_potenza_trasporto ?? ARERA_DEFAULT.quota_potenza_trasporto,
    quota_fissa_oneri: simSel.quota_fissa_oneri ?? ARERA_DEFAULT.quota_fissa_oneri,
    accise_kwh: simSel.accise_kwh ?? ARERA_DEFAULT.accise_kwh,
    canone_rai_annuo: simSel.canone_rai_annuo ?? ARERA_DEFAULT.canone_rai_annuo,
    iva_percentuale: simSel.iva_percentuale ?? ARERA_DEFAULT.iva_percentuale,
  })

  const campi = [
    { label: 'Quota fissa trasporto (€/anno)', key: 'quota_fissa_trasporto' },
    { label: 'Quota potenza trasporto (€/kW/anno)', key: 'quota_potenza_trasporto' },
    { label: 'Quota fissa oneri sistema (€/anno)', key: 'quota_fissa_oneri' },
    { label: 'Accise (€/kWh)', key: 'accise_kwh' },
    { label: 'Canone RAI (€/anno)', key: 'canone_rai_annuo' },
    { label: 'IVA %', key: 'iva_percentuale' },
  ]

  return (
    <div style={{ marginTop: 16, padding: '16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <div className="form-section-title" style={{ marginBottom: 12 }}>Tariffe ARERA — modifica se necessario</div>
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {campi.map(({ label, key }) => (
          <div className="form-group" key={key}>
            <label className="form-label" style={{ fontSize: '0.58rem' }}>{label}</label>
            <input
              className="form-input"
              type="number"
              step="0.0001"
              value={localVals[key]}
              onChange={e => setLocalVals(prev => ({ ...prev, [key]: e.target.value }))}
              onBlur={e => onSave(key, parseFloat(e.target.value))}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SimulatorePage() {
  const { user } = useAuth()
  const [simulazioni, setSimulazioni] = useState([])
  const [simSel, setSimSel] = useState(null)
  const [offerte, setOfferte] = useState([])
  const [pun, setPun] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSimModal, setShowSimModal] = useState(false)
  const [showOffertaModal, setShowOffertaModal] = useState(false)
  const [formSim, setFormSim] = useState({ nome: '', kwh_f1: '', kwh_f2: '', kwh_f3: '', potenza_kw: 6, ...ARERA_DEFAULT })
  const [formOfferta, setFormOfferta] = useState({ ...EMPTY_OFFERTA })
  const [editOffertaId, setEditOffertaId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [risultati, setRisultati] = useState([])
  const [expandedRow, setExpandedRow] = useState(null)
  const [showARERA, setShowARERA] = useState(false)

  useEffect(() => { loadData() }, [user])

  useEffect(() => {
    if (simSel) loadOfferte(simSel.id)
  }, [simSel])

  useEffect(() => {
    if (simSel && offerte.length > 0) calcolaRisultati()
  }, [offerte, simSel])

  async function loadData() {
    if (!user) return
    setLoading(true)
    const [{ data: sims }, { data: punData }] = await Promise.all([
      supabase.from('simulazioni').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('pun_storico').select('*').order('anno', { ascending: false }).order('mese', { ascending: false }).limit(1)
    ])
    setSimulazioni(sims || [])
    setPun(punData || [])
    if (sims?.length > 0 && !simSel) setSimSel(sims[0])
    setLoading(false)
  }

  async function loadOfferte(simId) {
    const { data } = await supabase.from('simulazione_offerte').select('*').eq('simulazione_id', simId).order('created_at')
    setOfferte(data || [])
  }

  function calcolaRisultati() {
    if (!simSel) return
    const punMedio = pun[0] ? parseFloat(pun[0].pun_medio) : 100
    const res = offerte.map(o => ({
      ...o,
      calc: calcolaCosto(o, simSel, punMedio)
    })).sort((a, b) => a.calc.totale - b.calc.totale)
    setRisultati(res)
  }

  async function saveSim() {
    if (!formSim.nome) { alert('Inserisci un nome per la simulazione'); return }
    setSaving(true)
    const kwh_tot = (parseFloat(formSim.kwh_f1) || 0) + (parseFloat(formSim.kwh_f2) || 0) + (parseFloat(formSim.kwh_f3) || 0)
    const payload = { ...formSim, user_id: user.id, kwh_totale: kwh_tot }
    const { data, error } = await supabase.from('simulazioni').insert(payload).select().single()
    if (!error && data) { setSimSel(data); setOfferte([]) }
    setSaving(false)
    setShowSimModal(false)
    loadData()
  }

  async function deleteSim(id) {
    if (!confirm('Eliminare questa simulazione e tutte le sue offerte?')) return
    await supabase.from('simulazione_offerte').delete().eq('simulazione_id', id)
    await supabase.from('simulazioni').delete().eq('id', id)
    setSimSel(null)
    setOfferte([])
    setRisultati([])
    loadData()
  }

  async function saveOfferta() {
    if (!formOfferta.fornitore || !formOfferta.nome_offerta) {
      alert('Inserisci fornitore e nome offerta')
      return
    }
    setSaving(true)
    const payload = {
      ...formOfferta,
      simulazione_id: simSel.id,
      user_id: user.id,
      perdite_rete_perc: parseFloat(formOfferta.perdite_rete_perc) || 10,
      prezzo_f1: parseFloat(formOfferta.prezzo_f1) || null,
      prezzo_f2: parseFloat(formOfferta.prezzo_f2) || null,
      prezzo_f3: parseFloat(formOfferta.prezzo_f3) || null,
      prezzo_monorario: parseFloat(formOfferta.prezzo_monorario) || null,
      spread_pun: parseFloat(formOfferta.spread_pun) || null,
      corrispettivo_commercializzazione: parseFloat(formOfferta.corrispettivo_commercializzazione) || 0,
      corrispettivo_misura: parseFloat(formOfferta.corrispettivo_misura) || 0,
      altri_corrispettivi_fissi: parseFloat(formOfferta.altri_corrispettivi_fissi) || 0,
    }
    if (editOffertaId) {
      await supabase.from('simulazione_offerte').update(payload).eq('id', editOffertaId)
    } else {
      await supabase.from('simulazione_offerte').insert(payload)
    }
    setSaving(false)
    setShowOffertaModal(false)
    setEditOffertaId(null)
    loadOfferte(simSel.id)
  }

  async function deleteOfferta(id) {
    if (!confirm('Eliminare questa offerta?')) return
    await supabase.from('simulazione_offerte').delete().eq('id', id)
    loadOfferte(simSel.id)
  }

  function openEditOfferta(o) {
    setFormOfferta({
      fornitore: o.fornitore, nome_offerta: o.nome_offerta,
      tipo_mercato: o.tipo_mercato, colore: o.colore || '#f5a623',
      prezzo_f1: o.prezzo_f1 ?? '', prezzo_f2: o.prezzo_f2 ?? '',
      prezzo_f3: o.prezzo_f3 ?? '', prezzo_monorario: o.prezzo_monorario ?? '',
      spread_pun: o.spread_pun ?? '', perdite_rete_perc: o.perdite_rete_perc ?? 10,
      corrispettivo_commercializzazione: o.corrispettivo_commercializzazione ?? '',
      corrispettivo_misura: o.corrispettivo_misura ?? '',
      altri_corrispettivi_fissi: o.altri_corrispettivi_fissi ?? '',
      note: o.note || ''
    })
    setEditOffertaId(o.id)
    setShowOffertaModal(true)
  }

  // Dati per grafico
  const datiGrafico = risultati.map(r => ({
    name: `${r.fornitore}\n${r.nome_offerta}`,
    nameBreve: r.fornitore,
    energia: Math.round(r.calc.costo_energia * 100) / 100,
    trasporto: Math.round(r.calc.costo_trasporto * 100) / 100,
    oneri: Math.round(r.calc.costo_oneri * 100) / 100,
    accise: Math.round(r.calc.costo_accise * 100) / 100,
    corrispettivi: Math.round(r.calc.costo_corrispettivi * 100) / 100,
    canone: Math.round(r.calc.costo_canone * 100) / 100,
    iva: Math.round(r.calc.costo_iva * 100) / 100,
    totale: Math.round(r.calc.totale * 100) / 100,
    colore: r.colore || '#f5a623'
  }))

  const migliore = risultati[0]
  const peggiore = risultati[risultati.length - 1]
  const risparmioMax = migliore && peggiore ? peggiore.calc.totale - migliore.calc.totale : 0



  if (loading) return <div className="loading-overlay"><div className="spinner" style={{ width: 28, height: 28 }} /></div>

  return (
    <div className="flex-col gap-20">
      {/* Header */}
      <div className="flex-between">
        <div className="flex gap-12" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {simulazioni.map(s => (
            <div key={s.id} className="flex gap-4" style={{ alignItems: 'center' }}>
              <button
                onClick={() => setSimSel(s)}
                className={`tab ${simSel?.id === s.id ? 'active' : ''}`}
                style={{ margin: 0 }}
              >
                {s.nome}
              </button>
              {simSel?.id === s.id && (
                <button className="btn btn-danger btn-sm" onClick={() => deleteSim(s.id)}
                  style={{ padding: '4px 6px' }}>
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={() => {
            setFormSim({ nome: '', kwh_f1: '', kwh_f2: '', kwh_f3: '', potenza_kw: 6, ...ARERA_DEFAULT })
            setShowSimModal(true)
          }}>
            <Plus size={13} /> Nuova Simulazione
          </button>
        </div>
      </div>

      {!simSel ? (
        <div className="card"><div className="empty-state">
          <div className="empty-state-icon"><Calculator size={40} opacity={0.3} /></div>
          <div className="empty-state-title">Nessuna simulazione</div>
          <div className="empty-state-desc">Crea una simulazione inserendo i tuoi consumi annuali per confrontare le offerte</div>
          <button className="btn btn-primary mt-16" onClick={() => setShowSimModal(true)}>
            <Plus size={14} /> Crea Simulazione
          </button>
        </div></div>
      ) : (
        <>
          {/* Dati simulazione attiva */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><span className="card-title-icon" />Consumi Annuali — {simSel.nome}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowARERA(!showARERA)}>
                {showARERA ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Spese Fisse ARERA
              </button>
            </div>
            <div className="form-grid">
              <div style={{ textAlign: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: '12px' }}>
                <div className="font-mono text-muted" style={{ fontSize: '0.65rem', marginBottom: 4 }}>F1 PUNTA</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--f1-color)' }}>{(parseFloat(simSel.kwh_f1) || 0).toFixed(0)}</div>
                <div className="font-mono text-muted" style={{ fontSize: '0.65rem' }}>kWh/anno</div>
              </div>
              <div style={{ textAlign: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: '12px' }}>
                <div className="font-mono text-muted" style={{ fontSize: '0.65rem', marginBottom: 4 }}>F2 INTERMEDIA</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--f2-color)' }}>{(parseFloat(simSel.kwh_f2) || 0).toFixed(0)}</div>
                <div className="font-mono text-muted" style={{ fontSize: '0.65rem' }}>kWh/anno</div>
              </div>
              <div style={{ textAlign: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: '12px' }}>
                <div className="font-mono text-muted" style={{ fontSize: '0.65rem', marginBottom: 4 }}>F3 VALLE</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--f3-color)' }}>{(parseFloat(simSel.kwh_f3) || 0).toFixed(0)}</div>
                <div className="font-mono text-muted" style={{ fontSize: '0.65rem' }}>kWh/anno</div>
              </div>
              <div style={{ textAlign: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: '12px' }}>
                <div className="font-mono text-muted" style={{ fontSize: '0.65rem', marginBottom: 4 }}>TOTALE</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                  {((parseFloat(simSel.kwh_f1) || 0) + (parseFloat(simSel.kwh_f2) || 0) + (parseFloat(simSel.kwh_f3) || 0)).toFixed(0)}
                </div>
                <div className="font-mono text-muted" style={{ fontSize: '0.65rem' }}>kWh/anno</div>
              </div>
            </div>

            {/* Tariffe ARERA espandibili */}
            {showARERA && (
              <ARERAEditor simSel={simSel} onSave={async (key, val) => {
                setSimSel(prev => ({ ...prev, [key]: val }))
                await supabase.from('simulazioni').update({ [key]: val }).eq('id', simSel.id)
              }} />
            )}
          </div>

          {/* KPI risparmio */}
          {risultati.length >= 2 && (
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-label">Offerta Migliore</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--green)', marginTop: 4 }}>
                  {migliore.fornitore} — {migliore.nome_offerta}
                </div>
                <div className="kpi-sub">{formatEuro(migliore.calc.totale)}/anno</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Risparmio Max vs Peggiore</div>
                <div className="kpi-value green">{formatEuro(risparmioMax)}</div>
                <div className="kpi-sub">€/anno · {(risparmioMax / 12).toFixed(0)} €/mese</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Prezzo Effettivo Migliore</div>
                <div className="kpi-value cyan">{(migliore.calc.prezzo_medio_effettivo * 100).toFixed(3)}</div>
                <div className="kpi-sub">c€/kWh tutto incluso</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">PUN di Riferimento</div>
                <div className="kpi-value">{pun[0] ? parseFloat(pun[0].pun_medio).toFixed(2) : '—'}</div>
                <div className="kpi-sub">€/MWh ultimo disponibile</div>
              </div>
            </div>
          )}

          {/* Grafico comparativo */}
          {datiGrafico.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div className="card-title"><span className="card-title-icon" style={{ background: 'var(--cyan)' }} />Confronto Costo Annuale (€)</div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={datiGrafico} barSize={36}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="nameBreve" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `€${v}`} />
                  <Tooltip
                    content={({ active, payload, label }) => active && payload?.length ? (
                      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                        <div style={{ color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 700 }}>{label}</div>
                        {payload.map((p, i) => <div key={i} style={{ color: p.fill || 'var(--text-primary)', marginBottom: 2 }}>{p.name}: {formatEuro(p.value)}</div>)}
                        <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, color: 'var(--amber)', fontWeight: 700 }}>
                          Totale: {formatEuro(payload.reduce((s, p) => s + (p.value || 0), 0))}
                        </div>
                      </div>
                    ) : null}
                  />
                  <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }} />
                  <Bar dataKey="energia" name="Energia" stackId="a" fill="var(--amber)" />
                  <Bar dataKey="trasporto" name="Trasporto" stackId="a" fill="var(--cyan)" />
                  <Bar dataKey="oneri" name="Oneri Sistema" stackId="a" fill="var(--f2-color)" />
                  <Bar dataKey="accise" name="Accise" stackId="a" fill="#8b5cf6" />
                  <Bar dataKey="corrispettivi" name="Corrispettivi" stackId="a" fill="#ff4757" />
                  <Bar dataKey="canone" name="Canone RAI" stackId="a" fill="var(--text-muted)" />
                  <Bar dataKey="iva" name="IVA" stackId="a" fill="var(--bg-elevated)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabella dettaglio offerte */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title"><span className="card-title-icon" />Dettaglio Offerte</div>
              <button className="btn btn-primary btn-sm" onClick={() => {
                setFormOfferta({ ...EMPTY_OFFERTA, colore: COLORI_OFFERTE[offerte.length % COLORI_OFFERTE.length] })
                setEditOffertaId(null)
                setShowOffertaModal(true)
              }}>
                <Plus size={13} /> Aggiungi Offerta
              </button>
            </div>

            {risultati.length === 0 ? (
              <div className="empty-state" style={{ padding: 40 }}>
                <div className="empty-state-icon">📋</div>
                <div className="empty-state-title">Nessuna offerta</div>
                <div className="empty-state-desc">Aggiungi le offerte da confrontare</div>
              </div>
            ) : (
              <div className="table-wrapper" style={{ border: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Fornitore / Offerta</th>
                      <th>Tipo</th>
                      <th>Energia</th>
                      <th>Trasporto</th>
                      <th>Oneri</th>
                      <th>Accise</th>
                      <th>Corrisp.</th>
                      <th>Canone</th>
                      <th>IVA</th>
                      <th>TOTALE/anno</th>
                      <th>c€/kWh eff.</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {risultati.map((r, i) => (
                      <>
                        <tr key={r.id} style={{ background: i === 0 ? 'rgba(0,229,160,0.04)' : 'transparent' }}>
                          <td>
                            <div style={{ width: 24, height: 24, borderRadius: 6, background: r.colore || 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#000' }}>
                              {i + 1}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700 }}>{r.fornitore}</div>
                            <div className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>{r.nome_offerta}</div>
                            {i === 0 && <span className="badge badge-success" style={{ marginTop: 4 }}>✓ Migliore</span>}
                          </td>
                          <td><span className="badge badge-neutral">{r.tipo_mercato === 'fisso' ? 'Fisso' : r.tipo_mercato === 'monorario' ? 'Monorario' : 'PUN'}</span></td>
                          <td className="td-mono text-amber">{formatEuro(r.calc.costo_energia)}</td>
                          <td className="td-mono">{formatEuro(r.calc.costo_trasporto)}</td>
                          <td className="td-mono">{formatEuro(r.calc.costo_oneri)}</td>
                          <td className="td-mono">{formatEuro(r.calc.costo_accise)}</td>
                          <td className="td-mono">{r.calc.costo_corrispettivi > 0 ? formatEuro(r.calc.costo_corrispettivi) : '—'}</td>
                          <td className="td-mono">{formatEuro(r.calc.costo_canone)}</td>
                          <td className="td-mono">{formatEuro(r.calc.costo_iva)}</td>
                          <td className="td-mono" style={{ color: i === 0 ? 'var(--green)' : 'var(--amber)', fontWeight: 700, fontSize: '0.95rem' }}>
                            {formatEuro(r.calc.totale)}
                            {i > 0 && migliore && (
                              <div style={{ fontSize: '0.65rem', color: 'var(--red)' }}>
                                +{formatEuro(r.calc.totale - migliore.calc.totale)}
                              </div>
                            )}
                          </td>
                          <td className="td-mono text-cyan">{(r.calc.prezzo_medio_effettivo * 100).toFixed(3)}</td>
                          <td>
                            <div className="flex gap-4">
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}>
                                {expandedRow === r.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => openEditOfferta(r)}><Edit3 size={13} /></button>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteOfferta(r.id)}><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                        {expandedRow === r.id && (
                          <tr key={`${r.id}-detail`}>
                            <td colSpan={13} style={{ background: 'var(--bg-elevated)', padding: '16px 20px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                                <div>
                                  <div className="font-mono text-muted" style={{ fontSize: '0.65rem', marginBottom: 6 }}>DETTAGLIO ENERGIA</div>
                                  {r.tipo_mercato !== 'monorario' ? <>
                                    <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.72rem' }}>F1 ({(parseFloat(simSel.kwh_f1)||0).toFixed(0)} kWh)</span><span className="font-mono text-amber">{formatEuro(r.calc.costo_f1)}</span></div>
                                    <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.72rem' }}>F2 ({(parseFloat(simSel.kwh_f2)||0).toFixed(0)} kWh)</span><span className="font-mono" style={{ color: 'var(--f2-color)' }}>{formatEuro(r.calc.costo_f2)}</span></div>
                                    <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.72rem' }}>F3 ({(parseFloat(simSel.kwh_f3)||0).toFixed(0)} kWh)</span><span className="font-mono" style={{ color: 'var(--f3-color)' }}>{formatEuro(r.calc.costo_f3)}</span></div>
                                  </> : (
                                    <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.72rem' }}>Monorario ({r.calc.kwh_tot.toFixed(0)} kWh)</span><span className="font-mono text-amber">{formatEuro(r.calc.costo_energia)}</span></div>
                                  )}
                                  <div className="font-mono text-muted" style={{ fontSize: '0.65rem', marginTop: 4 }}>Perdite rete incluse: {r.perdite_rete_perc}%</div>
                                </div>
                                <div>
                                  <div className="font-mono text-muted" style={{ fontSize: '0.65rem', marginBottom: 6 }}>SPESE FISSE</div>
                                  <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.72rem' }}>Trasporto rete</span><span className="font-mono">{formatEuro(r.calc.costo_trasporto)}</span></div>
                                  <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.72rem' }}>Oneri sistema</span><span className="font-mono">{formatEuro(r.calc.costo_oneri)}</span></div>
                                  <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.72rem' }}>Accise</span><span className="font-mono">{formatEuro(r.calc.costo_accise)}</span></div>
                                  <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.72rem' }}>Canone RAI</span><span className="font-mono">{formatEuro(r.calc.costo_canone)}</span></div>
                                </div>
                                <div>
                                  <div className="font-mono text-muted" style={{ fontSize: '0.65rem', marginBottom: 6 }}>CORRISPETTIVI FORNITORE</div>
                                  <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.72rem' }}>Commercializzazione</span><span className="font-mono">{formatEuro(r.corrispettivo_commercializzazione || 0)}</span></div>
                                  <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.72rem' }}>Misura contatore</span><span className="font-mono">{formatEuro(r.corrispettivo_misura || 0)}</span></div>
                                  <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.72rem' }}>Altri fissi</span><span className="font-mono">{formatEuro(r.altri_corrispettivi_fissi || 0)}</span></div>
                                </div>
                                <div>
                                  <div className="font-mono text-muted" style={{ fontSize: '0.65rem', marginBottom: 6 }}>RIEPILOGO</div>
                                  <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.72rem' }}>Imponibile</span><span className="font-mono">{formatEuro(r.calc.imponibile)}</span></div>
                                  <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.72rem' }}>IVA {simSel.iva_percentuale || 10}%</span><span className="font-mono">{formatEuro(r.calc.costo_iva)}</span></div>
                                  <div className="divider" />
                                  <div className="flex-between"><span className="font-mono" style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--amber)' }}>TOTALE ANNO</span><span className="font-mono" style={{ fontWeight: 700, color: 'var(--amber)' }}>{formatEuro(r.calc.totale)}</span></div>
                                  <div className="flex-between" style={{ marginTop: 4 }}><span className="font-mono" style={{ fontSize: '0.72rem' }}>Prezzo eff. tutto incl.</span><span className="font-mono text-cyan">{(r.calc.prezzo_medio_effettivo * 100).toFixed(4)} c€/kWh</span></div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal nuova simulazione */}
      {showSimModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSimModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div className="modal-title">Nuova Simulazione</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSimModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nome Simulazione *</label>
                <input className="form-input" placeholder="es. Confronto 2025" value={formSim.nome}
                  onChange={e => setFormSim(p => ({ ...p, nome: e.target.value }))} />
              </div>
              <div className="form-section-title">Consumi Annuali (kWh)</div>
              <div className="form-grid">
                {[['kwh_f1', 'F1 Punta (Lun-Ven 8-19)', 'var(--f1-color)'],
                  ['kwh_f2', 'F2 Intermedia', 'var(--f2-color)'],
                  ['kwh_f3', 'F3 Valle (Notti + Dom)', 'var(--f3-color)']].map(([key, label, color]) => (
                  <div className="form-group" key={key}>
                    <label className="form-label" style={{ color }}>{label}</label>
                    <input className="form-input" type="number" step="1" placeholder="0"
                      value={formSim[key]} onChange={e => setFormSim(p => ({ ...p, [key]: e.target.value }))} />
                  </div>
                ))}
                <div className="form-group">
                  <label className="form-label">Potenza Impegnata (kW)</label>
                  <input className="form-input" type="number" step="0.5" value={formSim.potenza_kw}
                    onChange={e => setFormSim(p => ({ ...p, potenza_kw: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSimModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={saveSim} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />}
                Crea Simulazione
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuova/modifica offerta */}
      {showOffertaModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowOffertaModal(false)}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <div className="modal-title">{editOffertaId ? 'Modifica Offerta' : 'Nuova Offerta'}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowOffertaModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {/* Fornitore */}
              <div className="form-section-title">Fornitore</div>
              <div className="form-grid">
                <FS label="Fornitore *" name="fornitore" type="text" placeholder="es. Enel Energia"  formOfferta={formOfferta} setFormOfferta={setFormOfferta} />
                <FS label="Nome Offerta *" name="nome_offerta" type="text" placeholder="es. Semplice Luce"  formOfferta={formOfferta} setFormOfferta={setFormOfferta} />
                <div className="form-group">
                  <label className="form-label">Tipo Mercato</label>
                  <select className="form-select" value={formOfferta.tipo_mercato}
                    onChange={e => setFormOfferta(p => ({ ...p, tipo_mercato: e.target.value }))}>
                    <option value="fisso">Prezzo Fisso Biorario/Triorario</option>
                    <option value="monorario">Prezzo Fisso Monorario</option>
                    <option value="indicizzato_pun">Indicizzato PUN</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Colore Grafico</label>
                  <input type="color" value={formOfferta.colore}
                    onChange={e => setFormOfferta(p => ({ ...p, colore: e.target.value }))}
                    style={{ width: '100%', height: 40, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-input)', cursor: 'pointer' }} />
                </div>
              </div>

              {/* Prezzi energia */}
              <div className="form-section-title">Prezzi Energia (€/kWh — solo materia energia)</div>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                Inserisci il prezzo della <strong style={{ color: 'var(--amber)' }}>sola materia energia</strong> come indicato nell'offerta (al netto di oneri). Le perdite di rete vengono calcolate automaticamente.
              </div>
              <div className="form-grid">
                {formOfferta.tipo_mercato === 'monorario' ? (
                  <FS label="Prezzo Monorario (€/kWh)" name="prezzo_monorario" placeholder="0.000000" formOfferta={formOfferta} setFormOfferta={setFormOfferta} />
                ) : formOfferta.tipo_mercato === 'indicizzato_pun' ? (
                  <FS label="Spread sul PUN (€/kWh)" name="spread_pun" placeholder="0.010000" hint="aggiunto al PUN" formOfferta={formOfferta} setFormOfferta={setFormOfferta} />
                ) : (<>
                  <FS label="Prezzo F1 — Punta (€/kWh)" name="prezzo_f1" placeholder="0.000000" formOfferta={formOfferta} setFormOfferta={setFormOfferta} />
                  <FS label="Prezzo F2 — Intermedia (€/kWh)" name="prezzo_f2" placeholder="0.000000" formOfferta={formOfferta} setFormOfferta={setFormOfferta} />
                  <FS label="Prezzo F3 — Valle (€/kWh)" name="prezzo_f3" placeholder="0.000000" formOfferta={formOfferta} setFormOfferta={setFormOfferta} />
                </>)}
                <FS label="Perdite di Rete (%)" name="perdite_rete_perc" step="0.1" placeholder="10.0" hint="standard ~10%"  formOfferta={formOfferta} setFormOfferta={setFormOfferta} />
              </div>

              {/* Corrispettivi fornitore */}
              <div className="form-section-title">Corrispettivi Fissi Fornitore (€/anno)</div>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                Costi fissi annui del fornitore separati dalle tariffe ARERA (già incluse sopra).
              </div>
              <div className="form-grid">
                <FS label="Commercializzazione (€/anno)" name="corrispettivo_commercializzazione" step="0.01" placeholder="0.00" formOfferta={formOfferta} setFormOfferta={setFormOfferta} />
                <FS label="Misura Contatore (€/anno)" name="corrispettivo_misura" step="0.01" placeholder="0.00" formOfferta={formOfferta} setFormOfferta={setFormOfferta} />
                <FS label="Altri Corrispettivi Fissi (€/anno)" name="altri_corrispettivi_fissi" step="0.01" placeholder="0.00" formOfferta={formOfferta} setFormOfferta={setFormOfferta} />
              </div>

              <div className="form-group">
                <label className="form-label">Note</label>
                <textarea className="form-textarea" value={formOfferta.note}
                  onChange={e => setFormOfferta(p => ({ ...p, note: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowOffertaModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={saveOfferta} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />}
                {editOffertaId ? 'Salva Modifiche' : 'Aggiungi Offerta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
