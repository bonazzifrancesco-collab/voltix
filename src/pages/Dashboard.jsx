import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { formatEuro, formatKWh, formatCentKWh, MESI, calcolaStatistiche } from '../lib/utils'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import { Zap, Euro, TrendingUp, TrendingDown, FileText, ArrowRight } from 'lucide-react'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-active)',
      borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem'
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--text-primary)' }}>
          {p.name}: {typeof p.value === 'number' && p.value > 100 ? formatEuro(p.value) : formatKWh(p.value)}
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [bollette, setBollette] = useState([])
  const [pun, setPun] = useState([])
  const [contratto, setContratto] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [user])

  async function loadData() {
    if (!user) return
    setLoading(true)
    const [{ data: boll }, { data: punData }, { data: cont }] = await Promise.all([
      supabase.from('bollette').select('*').eq('user_id', user.id).order('periodo_inizio', { ascending: false }),
      supabase.from('pun_storico').select('*').order('anno', { ascending: false }).order('mese', { ascending: false }).limit(13),
      supabase.from('contratti').select('*').eq('user_id', user.id).eq('attivo', true).limit(1)
    ])
    setBollette(boll || [])
    setPun((punData || []).reverse())
    setContratto(cont?.[0] || null)
    setLoading(false)
  }

  const stats = calcolaStatistiche(bollette)
  const ultimoAnno = bollette.filter(b => {
    const anno = new Date(b.periodo_inizio).getFullYear()
    return anno === new Date().getFullYear()
  })
  const statsAnno = calcolaStatistiche(ultimoAnno)

  // Dati grafico consumi mensili
  const consumiMensili = bollette.slice(0, 12).reverse().map(b => ({
    name: MESI[new Date(b.periodo_inizio).getMonth()],
    F1: b.kwh_f1 || 0,
    F2: b.kwh_f2 || 0,
    F3: b.kwh_f3 || 0,
    totale: b.kwh_totale || 0,
    importo: b.importo_totale || 0,
  }))

  // Dati PUN chart
  const punChart = pun.map(p => ({
    name: `${MESI[p.mese - 1]} ${p.anno}`,
    PUN: p.pun_medio ? parseFloat(p.pun_medio) : 0,
  }))

  // Ripartizione costi (ultima bolletta)
  const ultimaBolletta = bollette[0]
  const ripartizioneCosti = ultimaBolletta ? [
    { name: 'Materia Prima', value: ultimaBolletta.costo_materia_prima || 0, color: 'var(--amber)' },
    { name: 'Trasporto', value: ultimaBolletta.costo_trasporto || 0, color: 'var(--cyan)' },
    { name: 'Oneri Sistema', value: ultimaBolletta.costo_oneri_sistema || 0, color: 'var(--f2-color)' },
    { name: 'IVA', value: ultimaBolletta.costo_iva || 0, color: 'var(--text-muted)' },
  ].filter(x => x.value > 0) : []

  const totRipartizione = ripartizioneCosti.reduce((s, x) => s + x.value, 0)

  if (loading) return (
    <div className="loading-overlay">
      <div className="spinner" style={{ width: 32, height: 32 }} />
      <span>Caricamento dashboard...</span>
    </div>
  )

  if (bollette.length === 0) return (
    <div>
      <div className="empty-state" style={{ minHeight: 300 }}>
        <div className="empty-state-icon">⚡</div>
        <div className="empty-state-title">Nessuna bolletta inserita</div>
        <div className="empty-state-desc">Aggiungi la tua prima bolletta per iniziare a monitorare i consumi energetici</div>
        <button className="btn btn-primary mt-16" onClick={() => navigate('/bollette')}>
          <FileText size={15} />
          Aggiungi Bolletta
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex-col gap-20">
      {/* Contratto attivo */}
      {contratto && (
        <div style={{
          background: 'linear-gradient(135deg, var(--amber-glow), rgba(0,0,0,0))',
          border: '1px solid rgba(245,166,35,0.2)',
          borderRadius: 'var(--radius-lg)',
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div className="flex gap-12" style={{ alignItems: 'center' }}>
            <Zap size={16} color="var(--amber)" />
            <span className="font-mono text-secondary" style={{ fontSize: '0.7rem', letterSpacing: '0.08em' }}>CONTRATTO ATTIVO</span>
            <span style={{ fontWeight: 700 }}>{contratto.fornitore}</span>
            <span className="text-secondary">—</span>
            <span className="text-secondary">{contratto.nome_offerta}</span>
          </div>
          <span className="badge badge-success">{contratto.tipo_mercato === 'fisso' ? 'Prezzo Fisso' : contratto.tipo_mercato === 'indicizzato_pun' ? 'Indicizzato PUN' : 'Tutela'}</span>
        </div>
      )}

      {/* KPI principali */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Totale Consumi Anno</div>
          <div className="kpi-value amber">{statsAnno ? (statsAnno.totKwh).toFixed(0) : '—'}</div>
          <div className="kpi-sub">kWh · {new Date().getFullYear()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Spesa Anno in Corso</div>
          <div className="kpi-value">{statsAnno ? formatEuro(statsAnno.totImporto) : '—'}</div>
          <div className="kpi-sub">€ totali bollette</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Prezzo Medio Effettivo</div>
          <div className="kpi-value cyan">{stats ? (stats.prezzoMedioKwh * 100).toFixed(3) : '—'}</div>
          <div className="kpi-sub">c€/kWh · media storica</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">PUN Ultimo Mese</div>
          <div className="kpi-value green">
            {pun.length > 0 ? parseFloat(pun[pun.length - 1].pun_medio).toFixed(2) : '—'}
          </div>
          <div className="kpi-sub">€/MWh · mercato nazionale</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Consumo Mensile Medio</div>
          <div className="kpi-value">{bollette.length ? (stats.totKwh / bollette.length).toFixed(0) : '—'}</div>
          <div className="kpi-sub">kWh/mese</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Bollette Registrate</div>
          <div className="kpi-value">{bollette.length}</div>
          <div className="kpi-sub">totale storico</div>
        </div>
      </div>

      {/* Grafici riga 1 */}
      <div className="grid-2">
        {/* Consumi mensili per fascia */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span className="card-title-icon" />
              Consumi per Fascia (ultimi 12 mesi)
            </div>
            <div className="flex gap-8">
              <span className="fascia-badge fascia-f1">F1</span>
              <span className="fascia-badge fascia-f2">F2</span>
              <span className="fascia-badge fascia-f3">F3</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={consumiMensili} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="F1" stackId="a" fill="var(--f1-color)" opacity={0.9} />
              <Bar dataKey="F2" stackId="a" fill="var(--f2-color)" opacity={0.9} />
              <Bar dataKey="F3" stackId="a" fill="var(--f3-color)" opacity={0.9} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Andamento PUN */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span className="card-title-icon" style={{ background: 'var(--green)' }} />
              PUN Mensile (€/MWh)
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/pun')}>
              Dettaglio <ArrowRight size={13} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={punChart}>
              <defs>
                <linearGradient id="punGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--green)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--green)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                  <div style={{ color: 'var(--text-secondary)' }}>{label}</div>
                  <div style={{ color: 'var(--green)' }}>PUN: {payload[0].value?.toFixed(2)} €/MWh</div>
                </div>
              ) : null} />
              <Area type="monotone" dataKey="PUN" stroke="var(--green)" fill="url(#punGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Riga 2 */}
      <div className="grid-2">
        {/* Ripartizione costi ultima bolletta */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span className="card-title-icon" style={{ background: 'var(--cyan)' }} />
              Ripartizione Costi — Ultima Bolletta
            </div>
          </div>
          {ripartizioneCosti.length > 0 ? (
            <div className="flex gap-20" style={{ alignItems: 'center' }}>
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={ripartizioneCosti} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3}>
                    {ripartizioneCosti.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-col gap-8" style={{ flex: 1 }}>
                {ripartizioneCosti.map((item, i) => (
                  <div key={i} className="flex-between">
                    <div className="flex gap-8" style={{ alignItems: 'center' }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                      <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{item.name}</span>
                    </div>
                    <div className="flex gap-8" style={{ alignItems: 'center' }}>
                      <span className="font-mono" style={{ fontSize: '0.75rem' }}>{formatEuro(item.value)}</span>
                      <span className="font-mono text-muted" style={{ fontSize: '0.65rem' }}>
                        {totRipartizione > 0 ? ((item.value / totRipartizione) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
                <div className="divider" />
                <div className="flex-between">
                  <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--amber)' }}>TOTALE</span>
                  <span className="font-mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--amber)' }}>
                    {formatEuro(ultimaBolletta?.importo_totale)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '30px' }}>
              <div className="empty-state-desc">Dati di ripartizione non disponibili nell'ultima bolletta</div>
            </div>
          )}
        </div>

        {/* Mix fasce totale */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <span className="card-title-icon" style={{ background: 'var(--f2-color)' }} />
              Mix Fasce — Storico Totale
            </div>
          </div>
          {stats && (
            <div className="flex-col gap-16">
              {[
                { label: 'F1 — Punta (Lun-Ven 8-19)', perc: stats.percF1, kwh: stats.totF1, color: 'var(--f1-color)', sub: 'ore di punta' },
                { label: 'F2 — Intermedia (Sab 8-19 + Lun-Ven 19-23)', perc: stats.percF2, kwh: stats.totF2, color: 'var(--f2-color)', sub: 'ore intermedie' },
                { label: 'F3 — Valle (Notte + Domenica)', perc: stats.percF3, kwh: stats.totF3, color: 'var(--f3-color)', sub: 'ore di valle' },
              ].map(({ label, perc, kwh, color, sub }) => (
                <div key={label}>
                  <div className="flex-between" style={{ marginBottom: 6 }}>
                    <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{label}</span>
                    <div className="flex gap-8" style={{ alignItems: 'center' }}>
                      <span className="font-mono" style={{ fontSize: '0.7rem', color }}>{perc.toFixed(1)}%</span>
                      <span className="font-mono text-muted" style={{ fontSize: '0.65rem' }}>{formatKWh(kwh)}</span>
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${perc}%`, background: color }} />
                  </div>
                </div>
              ))}
              <div className="divider" />
              <div className="flex-between">
                <span className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>TOTALE STORICO</span>
                <span className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatKWh(stats.totKwh)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ultime bollette */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-icon" />
            Ultime Bollette
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/bollette')}>
            Tutte le bollette <ArrowRight size={13} />
          </button>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Fornitore</th>
                <th>F1 (kWh)</th>
                <th>F2 (kWh)</th>
                <th>F3 (kWh)</th>
                <th>Totale kWh</th>
                <th>Importo</th>
                <th>€/kWh</th>
              </tr>
            </thead>
            <tbody>
              {bollette.slice(0, 5).map(b => (
                <tr key={b.id}>
                  <td className="td-mono">
                    {new Date(b.periodo_inizio).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}
                    {' — '}
                    {new Date(b.periodo_fine).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ fontWeight: 600 }}>{b.fornitore}</td>
                  <td className="td-mono text-amber">{(b.kwh_f1 || 0).toFixed(0)}</td>
                  <td className="td-mono" style={{ color: 'var(--f2-color)' }}>{(b.kwh_f2 || 0).toFixed(0)}</td>
                  <td className="td-mono" style={{ color: 'var(--f3-color)' }}>{(b.kwh_f3 || 0).toFixed(0)}</td>
                  <td className="td-mono" style={{ fontWeight: 600 }}>{(b.kwh_totale || 0).toFixed(0)}</td>
                  <td className="td-mono" style={{ color: 'var(--amber)', fontWeight: 700 }}>{formatEuro(b.importo_totale)}</td>
                  <td className="td-mono text-muted">{b.kwh_totale > 0 ? ((b.importo_totale / b.kwh_totale) * 100).toFixed(3) + ' c€' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
