import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { formatEuro, formatKWh, MESI, MESI_FULL, calcolaStatistiche } from '../lib/utils'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts'

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(p.value > 100 ? 2 : 4) : p.value}</div>)}
    </div>
  )
}

export default function ConsumiPage() {
  const { user } = useAuth()
  const [bollette, setBollette] = useState([])
  const [pun, setPun] = useState([])
  const [loading, setLoading] = useState(true)
  const [annoSel, setAnnoSel] = useState(new Date().getFullYear())
  const [vistaTab, setVistaTab] = useState('mensile')

  useEffect(() => { loadData() }, [user])

  async function loadData() {
    if (!user) return
    setLoading(true)
    const [{ data: boll }, { data: punData }] = await Promise.all([
      supabase.from('bollette').select('*').eq('user_id', user.id).order('periodo_inizio'),
      supabase.from('pun_storico').select('*').order('anno').order('mese')
    ])
    setBollette(boll || [])
    setPun(punData || [])
    setLoading(false)
  }

  const anni = [...new Set(bollette.map(b => new Date(b.periodo_inizio).getFullYear()))].sort((a, b) => b - a)

  const bolletteAnno = bollette.filter(b => new Date(b.periodo_inizio).getFullYear() === annoSel)
  const statsAnno = calcolaStatistiche(bolletteAnno)

  // Dati mensili anno selezionato
  const datiMensili = bolletteAnno.map(b => {
    const mese = new Date(b.periodo_inizio).getMonth()
    const kwh = b.kwh_totale || 0
    const importo = b.importo_totale || 0
    return {
      name: MESI[mese],
      meseNum: mese + 1,
      kwhF1: b.kwh_f1 || 0,
      kwhF2: b.kwh_f2 || 0,
      kwhF3: b.kwh_f3 || 0,
      kwhTot: kwh,
      importo,
      matPrima: b.costo_materia_prima || 0,
      trasporto: b.costo_trasporto || 0,
      oneri: b.costo_oneri_sistema || 0,
      iva: b.costo_iva || 0,
      prezzoMedio: kwh > 0 ? (importo / kwh) * 100 : 0, // c€/kWh
      prezzoF1: b.prezzo_f1 ? b.prezzo_f1 * 100 : null,
      prezzoF2: b.prezzo_f2 ? b.prezzo_f2 * 100 : null,
      prezzoF3: b.prezzo_f3 ? b.prezzo_f3 * 100 : null,
    }
  })

  // Confronto annuale
  const datiAnnuali = anni.map(anno => {
    const bAnn = bollette.filter(b => new Date(b.periodo_inizio).getFullYear() === anno)
    const s = calcolaStatistiche(bAnn)
    return {
      name: anno.toString(),
      kwhTot: s?.totKwh || 0,
      importo: s?.totImporto || 0,
      prezzoMedio: s?.totKwh > 0 ? (s.totImporto / s.totKwh) * 100 : 0,
      kwhF1: s?.totF1 || 0,
      kwhF2: s?.totF2 || 0,
      kwhF3: s?.totF3 || 0,
    }
  })

  // Incidenza componenti costi (anno selezionato)
  const componentiCosto = statsAnno ? [
    { name: 'Materia Prima', value: statsAnno.costoMedioMateria, color: 'var(--amber)', perc: statsAnno.totImporto > 0 ? (statsAnno.costoMedioMateria / statsAnno.totImporto) * 100 : 0 },
    { name: 'Trasporto & Rete', value: statsAnno.costoMedioTrasporto, color: 'var(--cyan)', perc: statsAnno.totImporto > 0 ? (statsAnno.costoMedioTrasporto / statsAnno.totImporto) * 100 : 0 },
    { name: 'Oneri di Sistema', value: statsAnno.costoMedioOneri, color: 'var(--f2-color)', perc: statsAnno.totImporto > 0 ? (statsAnno.costoMedioOneri / statsAnno.totImporto) * 100 : 0 },
    { name: 'IVA', value: statsAnno.costoMedioIva, color: 'var(--text-muted)', perc: statsAnno.totImporto > 0 ? (statsAnno.costoMedioIva / statsAnno.totImporto) * 100 : 0 },
  ].filter(x => x.value > 0) : []

  // Correlazione PUN vs prezzo pagato
  const correlazione = datiMensili.map(d => {
    const punMese = pun.find(p => p.anno === annoSel && p.mese === d.meseNum)
    return {
      name: d.name,
      prezzoMedio: d.prezzoMedio,
      punCent: punMese ? (punMese.pun_medio / 10) : null, // converto €/MWh → c€/kWh
    }
  }).filter(d => d.punCent !== null)

  if (loading) return <div className="loading-overlay"><div className="spinner" style={{ width: 28, height: 28 }} /></div>

  if (bollette.length === 0) return (
    <div className="card"><div className="empty-state">
      <div className="empty-state-icon">📊</div>
      <div className="empty-state-title">Nessun dato disponibile</div>
      <div className="empty-state-desc">Inserisci le bollette per visualizzare l'analisi dei consumi</div>
    </div></div>
  )

  return (
    <div className="flex-col gap-20">
      {/* Filtro anno + tabs */}
      <div className="flex-between">
        <div className="tabs">
          <button className={`tab ${vistaTab === 'mensile' ? 'active' : ''}`} onClick={() => setVistaTab('mensile')}>Vista Mensile</button>
          <button className={`tab ${vistaTab === 'annuale' ? 'active' : ''}`} onClick={() => setVistaTab('annuale')}>Confronto Annuale</button>
          <button className={`tab ${vistaTab === 'prezzi' ? 'active' : ''}`} onClick={() => setVistaTab('prezzi')}>Analisi Prezzi</button>
        </div>
        {vistaTab !== 'annuale' && (
          <select className="form-select" style={{ width: 100 }} value={annoSel} onChange={e => setAnnoSel(Number(e.target.value))}>
            {anni.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>

      {/* ═══ VISTA MENSILE ═══ */}
      {vistaTab === 'mensile' && (
        <>
          {/* KPI anno */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Consumo Totale {annoSel}</div>
              <div className="kpi-value amber">{statsAnno ? statsAnno.totKwh.toFixed(0) : '—'}</div>
              <div className="kpi-sub">kWh annui</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Spesa Totale {annoSel}</div>
              <div className="kpi-value">{statsAnno ? formatEuro(statsAnno.totImporto) : '—'}</div>
              <div className="kpi-sub">€ bollette</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Prezzo Effettivo Medio</div>
              <div className="kpi-value cyan">{statsAnno && statsAnno.totKwh > 0 ? ((statsAnno.totImporto / statsAnno.totKwh) * 100).toFixed(3) : '—'}</div>
              <div className="kpi-sub">c€/kWh</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Consumi Medi Mensili</div>
              <div className="kpi-value">{bolletteAnno.length > 0 && statsAnno ? (statsAnno.totKwh / bolletteAnno.length).toFixed(0) : '—'}</div>
              <div className="kpi-sub">kWh/mese</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Spesa Media Mensile</div>
              <div className="kpi-value">{bolletteAnno.length > 0 && statsAnno ? formatEuro(statsAnno.totImporto / bolletteAnno.length) : '—'}</div>
              <div className="kpi-sub">€/mese</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Solo Materia Prima</div>
              <div className="kpi-value green">{statsAnno && statsAnno.totKwh > 0 && statsAnno.costoMedioMateria > 0
                ? ((statsAnno.costoMedioMateria / statsAnno.totKwh) * 100).toFixed(3) : '—'}</div>
              <div className="kpi-sub">c€/kWh materia energia</div>
            </div>
          </div>

          {/* Consumi mensili per fascia */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><span className="card-title-icon" />Consumi Mensili per Fascia (kWh)</div>
              <div className="flex gap-8">
                <span className="fascia-badge fascia-f1">F1 Punta</span>
                <span className="fascia-badge fascia-f2">F2 Intermedia</span>
                <span className="fascia-badge fascia-f3">F3 Valle</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={datiMensili} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} unit=" kWh" />
                <Tooltip content={<TT />} />
                <Bar dataKey="kwhF1" name="F1 Punta" stackId="a" fill="var(--f1-color)" />
                <Bar dataKey="kwhF2" name="F2 Intermedia" stackId="a" fill="var(--f2-color)" />
                <Bar dataKey="kwhF3" name="F3 Valle" stackId="a" fill="var(--f3-color)" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid-2">
            {/* Andamento costo totale mensile */}
            <div className="card">
              <div className="card-header">
                <div className="card-title"><span className="card-title-icon" style={{ background: 'var(--amber)' }} />Importo Mensile (€)</div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={datiMensili}>
                  <defs>
                    <linearGradient id="impGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--amber)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      <div style={{ color: 'var(--text-secondary)' }}>{label}</div>
                      <div style={{ color: 'var(--amber)' }}>Importo: {formatEuro(payload[0]?.value)}</div>
                    </div>
                  ) : null} />
                  <Area type="monotone" dataKey="importo" name="Importo" stroke="var(--amber)" fill="url(#impGrad)" strokeWidth={2} dot={{ fill: 'var(--amber)', r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Ripartizione componenti costo */}
            <div className="card">
              <div className="card-header">
                <div className="card-title"><span className="card-title-icon" style={{ background: 'var(--cyan)' }} />Incidenza Componenti Costo</div>
              </div>
              {componentiCosto.length > 0 ? (
                <div className="flex gap-16" style={{ alignItems: 'center' }}>
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={componentiCosto} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={2}>
                        {componentiCosto.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-col gap-8" style={{ flex: 1 }}>
                    {componentiCosto.map((item, i) => (
                      <div key={i} className="flex-between">
                        <div className="flex gap-8" style={{ alignItems: 'center' }}>
                          <div style={{ width: 7, height: 7, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                          <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{item.name}</span>
                        </div>
                        <div className="flex gap-8" style={{ alignItems: 'center' }}>
                          <span className="font-mono" style={{ fontSize: '0.72rem' }}>{item.perc.toFixed(0)}%</span>
                          <span className="font-mono text-muted" style={{ fontSize: '0.65rem' }}>{formatEuro(item.value)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="empty-state" style={{ padding: 24 }}>
                  <div className="empty-state-desc">Aggiungi le voci di costo nelle bollette per vedere l'incidenza</div>
                </div>
              )}
            </div>
          </div>

          {/* Tabella dettaglio mensile */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><span className="card-title-icon" />Dettaglio Mensile {annoSel}</div>
            </div>
            <div className="table-wrapper" style={{ border: 'none', margin: '0 -20px -20px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Mese</th>
                    <th>F1 kWh</th>
                    <th>F2 kWh</th>
                    <th>F3 kWh</th>
                    <th>Tot kWh</th>
                    <th>Mat. Prima</th>
                    <th>Trasporto</th>
                    <th>Oneri</th>
                    <th>IVA</th>
                    <th>Importo</th>
                    <th>c€/kWh</th>
                  </tr>
                </thead>
                <tbody>
                  {datiMensili.map((d, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{MESI_FULL[d.meseNum - 1]}</td>
                      <td className="td-mono text-amber">{d.kwhF1.toFixed(0)}</td>
                      <td className="td-mono" style={{ color: 'var(--f2-color)' }}>{d.kwhF2.toFixed(0)}</td>
                      <td className="td-mono" style={{ color: 'var(--f3-color)' }}>{d.kwhF3.toFixed(0)}</td>
                      <td className="td-mono" style={{ fontWeight: 700 }}>{d.kwhTot.toFixed(0)}</td>
                      <td className="td-mono">{d.matPrima > 0 ? formatEuro(d.matPrima) : '—'}</td>
                      <td className="td-mono">{d.trasporto > 0 ? formatEuro(d.trasporto) : '—'}</td>
                      <td className="td-mono">{d.oneri > 0 ? formatEuro(d.oneri) : '—'}</td>
                      <td className="td-mono">{d.iva > 0 ? formatEuro(d.iva) : '—'}</td>
                      <td className="td-mono" style={{ color: 'var(--amber)', fontWeight: 700 }}>{formatEuro(d.importo)}</td>
                      <td className="td-mono text-cyan">{d.prezzoMedio.toFixed(3)}</td>
                    </tr>
                  ))}
                  {statsAnno && (
                    <tr style={{ background: 'var(--bg-elevated)' }}>
                      <td style={{ fontWeight: 700, color: 'var(--amber)' }}>TOTALE</td>
                      <td className="td-mono text-amber" style={{ fontWeight: 700 }}>{statsAnno.totF1.toFixed(0)}</td>
                      <td className="td-mono" style={{ color: 'var(--f2-color)', fontWeight: 700 }}>{statsAnno.totF2.toFixed(0)}</td>
                      <td className="td-mono" style={{ color: 'var(--f3-color)', fontWeight: 700 }}>{statsAnno.totF3.toFixed(0)}</td>
                      <td className="td-mono" style={{ fontWeight: 700 }}>{statsAnno.totKwh.toFixed(0)}</td>
                      <td className="td-mono" style={{ fontWeight: 700 }}>{statsAnno.costoMedioMateria > 0 ? formatEuro(statsAnno.costoMedioMateria) : '—'}</td>
                      <td className="td-mono" style={{ fontWeight: 700 }}>{statsAnno.costoMedioTrasporto > 0 ? formatEuro(statsAnno.costoMedioTrasporto) : '—'}</td>
                      <td className="td-mono" style={{ fontWeight: 700 }}>{statsAnno.costoMedioOneri > 0 ? formatEuro(statsAnno.costoMedioOneri) : '—'}</td>
                      <td className="td-mono" style={{ fontWeight: 700 }}>{statsAnno.costoMedioIva > 0 ? formatEuro(statsAnno.costoMedioIva) : '—'}</td>
                      <td className="td-mono" style={{ color: 'var(--amber)', fontWeight: 700 }}>{formatEuro(statsAnno.totImporto)}</td>
                      <td className="td-mono text-cyan" style={{ fontWeight: 700 }}>
                        {statsAnno.totKwh > 0 ? ((statsAnno.totImporto / statsAnno.totKwh) * 100).toFixed(3) : '—'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══ CONFRONTO ANNUALE ═══ */}
      {vistaTab === 'annuale' && (
        <>
          <div className="grid-2">
            <div className="card">
              <div className="card-header"><div className="card-title"><span className="card-title-icon" />Consumi Annuali (kWh)</div></div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={datiAnnuali} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TT />} />
                  <Bar dataKey="kwhF1" name="F1" stackId="a" fill="var(--f1-color)" />
                  <Bar dataKey="kwhF2" name="F2" stackId="a" fill="var(--f2-color)" />
                  <Bar dataKey="kwhF3" name="F3" stackId="a" fill="var(--f3-color)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="card-header"><div className="card-title"><span className="card-title-icon" style={{ background: 'var(--amber)' }} />Spesa Annuale (€)</div></div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={datiAnnuali} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      <div style={{ color: 'var(--text-secondary)' }}>{label}</div>
                      <div style={{ color: 'var(--amber)' }}>Spesa: {formatEuro(payload[0]?.value)}</div>
                    </div>
                  ) : null} />
                  <Bar dataKey="importo" name="Spesa" fill="var(--amber)" radius={[4,4,0,0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title"><span className="card-title-icon" style={{ background: 'var(--cyan)' }} />Riepilogo Annuale Comparativo</div></div>
            <div className="table-wrapper" style={{ border: 'none', margin: '0 -20px -20px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Anno</th>
                    <th>kWh F1</th>
                    <th>kWh F2</th>
                    <th>kWh F3</th>
                    <th>Totale kWh</th>
                    <th>Spesa Totale</th>
                    <th>Prezzo Medio</th>
                    <th>Δ Consumi</th>
                    <th>Δ Spesa</th>
                  </tr>
                </thead>
                <tbody>
                  {datiAnnuali.map((d, i) => {
                    const prev = datiAnnuali[i - 1]
                    const deltaKwh = prev && prev.kwhTot > 0 ? ((d.kwhTot - prev.kwhTot) / prev.kwhTot) * 100 : null
                    const deltaSpesa = prev && prev.importo > 0 ? ((d.importo - prev.importo) / prev.importo) * 100 : null
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 700, fontSize: '1rem' }}>{d.name}</td>
                        <td className="td-mono text-amber">{d.kwhF1.toFixed(0)}</td>
                        <td className="td-mono" style={{ color: 'var(--f2-color)' }}>{d.kwhF2.toFixed(0)}</td>
                        <td className="td-mono" style={{ color: 'var(--f3-color)' }}>{d.kwhF3.toFixed(0)}</td>
                        <td className="td-mono" style={{ fontWeight: 700 }}>{d.kwhTot.toFixed(0)}</td>
                        <td className="td-mono" style={{ color: 'var(--amber)', fontWeight: 700 }}>{formatEuro(d.importo)}</td>
                        <td className="td-mono text-cyan">{d.prezzoMedio.toFixed(3)} c€/kWh</td>
                        <td>
                          {deltaKwh !== null ? (
                            <span className={`kpi-delta ${deltaKwh > 0 ? 'up' : 'down'}`} style={{ color: deltaKwh > 0 ? 'var(--red)' : 'var(--green)' }}>
                              {deltaKwh > 0 ? '▲' : '▼'} {Math.abs(deltaKwh).toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          {deltaSpesa !== null ? (
                            <span className={`kpi-delta`} style={{ color: deltaSpesa > 0 ? 'var(--red)' : 'var(--green)', background: deltaSpesa > 0 ? 'rgba(255,71,87,0.1)' : 'rgba(0,229,160,0.1)' }}>
                              {deltaSpesa > 0 ? '▲' : '▼'} {Math.abs(deltaSpesa).toFixed(1)}%
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
        </>
      )}

      {/* ═══ ANALISI PREZZI ═══ */}
      {vistaTab === 'prezzi' && (
        <>
          <div className="card">
            <div className="card-header">
              <div className="card-title"><span className="card-title-icon" style={{ background: 'var(--cyan)' }} />Prezzo Effettivo vs PUN (c€/kWh)</div>
            </div>
            {correlazione.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={correlazione}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} unit=" c€" />
                  <Tooltip content={<TT />} />
                  <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', paddingTop: 12 }} />
                  <Line type="monotone" dataKey="prezzoMedio" name="Prezzo Pagato" stroke="var(--amber)" strokeWidth={2.5} dot={{ fill: 'var(--amber)', r: 4 }} />
                  <Line type="monotone" dataKey="punCent" name="PUN Mercato" stroke="var(--green)" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: 40 }}>
                <div className="empty-state-desc">Dati PUN non disponibili per l'anno selezionato</div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title"><span className="card-title-icon" style={{ background: 'var(--f2-color)' }} />Prezzi per Fascia (c€/kWh)</div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={datiMensili.filter(d => d.prezzoF1 || d.prezzoF2 || d.prezzoF3)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} unit=" c€" />
                <Tooltip content={<TT />} />
                <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', paddingTop: 12 }} />
                <Line type="monotone" dataKey="prezzoF1" name="F1 Punta" stroke="var(--f1-color)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="prezzoF2" name="F2 Intermedia" stroke="var(--f2-color)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="prezzoF3" name="F3 Valle" stroke="var(--f3-color)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
