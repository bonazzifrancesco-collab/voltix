import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { formatEuro, formatDate } from '../lib/utils'
import { Plus, Upload, Trash2, Edit3, FileText, X, Sparkles, AlertCircle } from 'lucide-react'

const EMPTY_FORM = {
  fornitore: '', nome_offerta: '', pod: '', numero_bolletta: '',
  periodo_inizio: '', periodo_fine: '', data_emissione: '', data_scadenza: '',
  kwh_f1: '', kwh_f2: '', kwh_f3: '', kwh_totale: '',
  prezzo_f1: '', prezzo_f2: '', prezzo_f3: '', prezzo_medio: '',
  costo_materia_prima: '', costo_trasporto: '', costo_oneri_sistema: '', costo_accise: '', costo_iva: '',
  importo_totale: '', pun_medio_periodo: '', note: '',
  inserita_manualmente: true
}

export default function BollettePage() {
  const { user } = useAuth()
  const [bollette, setBollette] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiLog, setAiLog] = useState('')
  const [tab, setTab] = useState('manuale')
  const [pdfFile, setPdfFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  useEffect(() => { loadBollette() }, [user])

  async function loadBollette() {
    if (!user) return
    setLoading(true)
    const { data } = await supabase.from('bollette').select('*').eq('user_id', user.id).order('periodo_inizio', { ascending: false })
    setBollette(data || [])
    setLoading(false)
  }

  function openNew() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setPdfFile(null)
    setAiLog('')
    setTab('manuale')
    setShowModal(true)
  }

  function openEdit(b) {
    setForm({
      fornitore: b.fornitore || '', nome_offerta: b.nome_offerta || '', pod: b.pod || '',
      numero_bolletta: b.numero_bolletta || '',
      periodo_inizio: b.periodo_inizio || '', periodo_fine: b.periodo_fine || '',
      data_emissione: b.data_emissione || '', data_scadenza: b.data_scadenza || '',
      kwh_f1: b.kwh_f1 ?? '', kwh_f2: b.kwh_f2 ?? '', kwh_f3: b.kwh_f3 ?? '', kwh_totale: b.kwh_totale ?? '',
      prezzo_f1: b.prezzo_f1 ?? '', prezzo_f2: b.prezzo_f2 ?? '', prezzo_f3: b.prezzo_f3 ?? '', prezzo_medio: b.prezzo_medio ?? '',
      costo_materia_prima: b.costo_materia_prima ?? '', costo_trasporto: b.costo_trasporto ?? '',
      costo_oneri_sistema: b.costo_oneri_sistema ?? '', costo_accise: b.costo_accise ?? '',
      costo_iva: b.costo_iva ?? '', importo_totale: b.importo_totale ?? '',
      pun_medio_periodo: b.pun_medio_periodo ?? '', note: b.note || '',
      inserita_manualmente: b.inserita_manualmente
    })
    setEditId(b.id)
    setTab('manuale')
    setAiLog('')
    setPdfFile(null)
    setShowModal(true)
  }

  async function analyzePdf() {
    if (!pdfFile) return
    setAnalyzing(true)
    setAiLog('Conversione PDF in base64...')
    try {
      const base64 = await fileToBase64(pdfFile)
      setAiLog('Invio a Claude AI per analisi...')
      const res = await fetch('/.netlify/functions/analyze-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64 })
      })
      if (!res.ok) throw new Error(`Errore server: ${res.status}`)
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      setAiLog('Analisi completata! Campi precompilati.')
      setForm(prev => ({ ...prev, ...result, inserita_manualmente: false }))
      setTab('manuale')
    } catch (e) {
      setAiLog(`Errore: ${e.message}`)
    } finally {
      setAnalyzing(false)
    }
  }

  function fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result.split(',')[1])
      r.onerror = rej
      r.readAsDataURL(file)
    })
  }

  function autoCalcTotale() {
    const f1 = parseFloat(form.kwh_f1) || 0
    const f2 = parseFloat(form.kwh_f2) || 0
    const f3 = parseFloat(form.kwh_f3) || 0
    if (f1 + f2 + f3 > 0) {
      setForm(prev => ({ ...prev, kwh_totale: (f1 + f2 + f3).toFixed(3) }))
    }
  }

  async function save() {
    if (!form.fornitore || !form.periodo_inizio || !form.periodo_fine || !form.importo_totale) {
      alert('Compila almeno: Fornitore, Periodo, Importo Totale')
      return
    }
    setSaving(true)
    const payload = {
      user_id: user.id,
      fornitore: form.fornitore,
      nome_offerta: form.nome_offerta || null,
      pod: form.pod || null,
      numero_bolletta: form.numero_bolletta || null,
      periodo_inizio: form.periodo_inizio,
      periodo_fine: form.periodo_fine,
      data_emissione: form.data_emissione || null,
      data_scadenza: form.data_scadenza || null,
      kwh_f1: parseFloat(form.kwh_f1) || 0,
      kwh_f2: parseFloat(form.kwh_f2) || 0,
      kwh_f3: parseFloat(form.kwh_f3) || 0,
      kwh_totale: parseFloat(form.kwh_totale) || 0,
      prezzo_f1: parseFloat(form.prezzo_f1) || null,
      prezzo_f2: parseFloat(form.prezzo_f2) || null,
      prezzo_f3: parseFloat(form.prezzo_f3) || null,
      prezzo_medio: parseFloat(form.prezzo_medio) || null,
      costo_materia_prima: parseFloat(form.costo_materia_prima) || null,
      costo_trasporto: parseFloat(form.costo_trasporto) || null,
      costo_oneri_sistema: parseFloat(form.costo_oneri_sistema) || null,
      costo_accise: parseFloat(form.costo_accise) || null,
      costo_iva: parseFloat(form.costo_iva) || null,
      importo_totale: parseFloat(form.importo_totale),
      pun_medio_periodo: parseFloat(form.pun_medio_periodo) || null,
      note: form.note || null,
      inserita_manualmente: form.inserita_manualmente,
      pdf_analizzato: !form.inserita_manualmente,
    }
    if (editId) {
      await supabase.from('bollette').update(payload).eq('id', editId)
    } else {
      await supabase.from('bollette').insert(payload)
    }
    setSaving(false)
    setShowModal(false)
    loadBollette()
  }

  async function deleteBolletta(id) {
    if (!confirm('Eliminare questa bolletta?')) return
    await supabase.from('bollette').delete().eq('id', id)
    loadBollette()
  }

  const Field = ({ label, name, type = 'text', step, placeholder, hint }) => (
    <div className="form-group">
      <label className="form-label">{label}{hint && <span className="text-muted" style={{ fontWeight: 400 }}> ({hint})</span>}</label>
      <input
        className="form-input"
        type={type}
        step={step}
        placeholder={placeholder}
        value={form[name] ?? ''}
        onChange={e => setForm(prev => ({ ...prev, [name]: e.target.value }))}
        onBlur={['kwh_f1', 'kwh_f2', 'kwh_f3'].includes(name) ? autoCalcTotale : undefined}
      />
    </div>
  )

  return (
    <div className="flex-col gap-20">
      {/* Header actions */}
      <div className="flex-between">
        <div className="flex-col gap-4">
          <span className="font-mono text-muted" style={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>
            STORICO — {bollette.length} BOLLETTE REGISTRATE
          </span>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={15} />
          Nuova Bolletta
        </button>
      </div>

      {/* Tabella bollette */}
      {loading ? (
        <div className="loading-overlay"><div className="spinner" style={{ width: 28, height: 28 }} /></div>
      ) : bollette.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><FileText size={40} opacity={0.3} /></div>
            <div className="empty-state-title">Nessuna bolletta</div>
            <div className="empty-state-desc">Inserisci la prima bolletta manualmente o carica un PDF da analizzare con AI</div>
            <button className="btn btn-primary mt-16" onClick={openNew}><Plus size={15} />Aggiungi Bolletta</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Fornitore / Offerta</th>
                  <th>kWh F1</th>
                  <th>kWh F2</th>
                  <th>kWh F3</th>
                  <th>Totale kWh</th>
                  <th>Mat. Prima</th>
                  <th>Trasporto</th>
                  <th>Oneri</th>
                  <th>IVA</th>
                  <th>Importo</th>
                  <th>Fonte</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bollette.map(b => (
                  <tr key={b.id}>
                    <td className="td-mono" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(b.periodo_inizio).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}
                      {' – '}
                      {new Date(b.periodo_fine).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{b.fornitore}</div>
                      {b.nome_offerta && <div className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>{b.nome_offerta}</div>}
                    </td>
                    <td className="td-mono text-amber">{(b.kwh_f1 || 0).toFixed(0)}</td>
                    <td className="td-mono" style={{ color: 'var(--f2-color)' }}>{(b.kwh_f2 || 0).toFixed(0)}</td>
                    <td className="td-mono" style={{ color: 'var(--f3-color)' }}>{(b.kwh_f3 || 0).toFixed(0)}</td>
                    <td className="td-mono" style={{ fontWeight: 700 }}>{(b.kwh_totale || 0).toFixed(0)}</td>
                    <td className="td-mono">{b.costo_materia_prima ? formatEuro(b.costo_materia_prima) : '—'}</td>
                    <td className="td-mono">{b.costo_trasporto ? formatEuro(b.costo_trasporto) : '—'}</td>
                    <td className="td-mono">{b.costo_oneri_sistema ? formatEuro(b.costo_oneri_sistema) : '—'}</td>
                    <td className="td-mono">{b.costo_iva ? formatEuro(b.costo_iva) : '—'}</td>
                    <td className="td-mono" style={{ color: 'var(--amber)', fontWeight: 700 }}>{formatEuro(b.importo_totale)}</td>
                    <td>
                      {b.pdf_analizzato
                        ? <span className="badge badge-info">AI</span>
                        : <span className="badge badge-neutral">Manuale</span>
                      }
                    </td>
                    <td>
                      <div className="flex gap-4">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(b)}><Edit3 size={13} /></button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteBolletta(b.id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal inserimento */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 780 }}>
            <div className="modal-header">
              <div className="modal-title">{editId ? 'Modifica Bolletta' : 'Nuova Bolletta'}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {/* Tabs PDF / Manuale */}
              {!editId && (
                <div className="tabs">
                  <button className={`tab ${tab === 'pdf' ? 'active' : ''}`} onClick={() => setTab('pdf')} style={{ flex: 1 }}>
                    <Upload size={13} style={{ marginRight: 6 }} />Analisi PDF (AI)
                  </button>
                  <button className={`tab ${tab === 'manuale' ? 'active' : ''}`} onClick={() => setTab('manuale')} style={{ flex: 1 }}>
                    <Edit3 size={13} style={{ marginRight: 6 }} />Inserimento Manuale
                  </button>
                </div>
              )}

              {/* PDF Tab */}
              {tab === 'pdf' && (
                <div className="flex-col gap-16">
                  <div
                    className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') setPdfFile(f) }}
                  >
                    <span className="upload-icon">📄</span>
                    {pdfFile ? (
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{pdfFile.name}</div>
                        <div className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>{(pdfFile.size / 1024).toFixed(0)} KB</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Trascina il PDF della bolletta qui</div>
                        <div className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>oppure clicca per selezionare</div>
                      </div>
                    )}
                    <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => setPdfFile(e.target.files[0])} />
                  </div>

                  {aiLog && (
                    <div className="flex gap-8" style={{ alignItems: 'flex-start', background: 'var(--bg-elevated)', padding: '12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                      {analyzing ? <div className="spinner" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} /> : <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--amber)' }} />}
                      <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{aiLog}</span>
                    </div>
                  )}

                  <div className="flex gap-12">
                    <button className="btn btn-primary" onClick={analyzePdf} disabled={!pdfFile || analyzing} style={{ flex: 1, justifyContent: 'center' }}>
                      {analyzing ? <><span className="spinner" style={{ width: 14, height: 14 }} />Analisi in corso...</> : <><Sparkles size={14} />Analizza con AI</>}
                    </button>
                    <button className="btn btn-secondary" onClick={() => setTab('manuale')}>
                      Inserimento Manuale
                    </button>
                  </div>
                </div>
              )}

              {/* Form manuale */}
              {tab === 'manuale' && (
                <div className="flex-col gap-20">
                  {/* Sezione fornitore */}
                  <div>
                    <div className="form-section-title">Fornitore & Identificativi</div>
                    <div className="form-grid mt-16">
                      <Field label="Fornitore *" name="fornitore" placeholder="es. Enel Energia" />
                      <Field label="Nome Offerta" name="nome_offerta" placeholder="es. Semplice Luce" />
                      <Field label="POD" name="pod" placeholder="IT001E..." />
                      <Field label="N° Bolletta" name="numero_bolletta" />
                    </div>
                  </div>

                  {/* Periodo */}
                  <div>
                    <div className="form-section-title">Periodo di Competenza</div>
                    <div className="form-grid mt-16">
                      <Field label="Data Inizio *" name="periodo_inizio" type="date" />
                      <Field label="Data Fine *" name="periodo_fine" type="date" />
                      <Field label="Data Emissione" name="data_emissione" type="date" />
                      <Field label="Data Scadenza" name="data_scadenza" type="date" />
                    </div>
                  </div>

                  {/* Consumi */}
                  <div>
                    <div className="form-section-title">Consumi (kWh)</div>
                    <div className="form-grid mt-16">
                      <Field label="Fascia F1 (Punta)" name="kwh_f1" type="number" step="0.001" placeholder="0.000" hint="Lun-Ven 8-19" />
                      <Field label="Fascia F2 (Intermedia)" name="kwh_f2" type="number" step="0.001" placeholder="0.000" hint="Sab + 19-23" />
                      <Field label="Fascia F3 (Valle)" name="kwh_f3" type="number" step="0.001" placeholder="0.000" hint="Notti + Dom" />
                      <Field label="Totale kWh" name="kwh_totale" type="number" step="0.001" placeholder="Auto-calcolato" />
                    </div>
                  </div>

                  {/* Prezzi */}
                  <div>
                    <div className="form-section-title">Prezzi Materia Energia (€/kWh)</div>
                    <div className="form-grid mt-16">
                      <Field label="Prezzo F1" name="prezzo_f1" type="number" step="0.000001" placeholder="0.000000" />
                      <Field label="Prezzo F2" name="prezzo_f2" type="number" step="0.000001" placeholder="0.000000" />
                      <Field label="Prezzo F3" name="prezzo_f3" type="number" step="0.000001" placeholder="0.000000" />
                      <Field label="Prezzo Medio" name="prezzo_medio" type="number" step="0.000001" placeholder="0.000000" />
                    </div>
                  </div>

                  {/* Costi */}
                  <div>
                    <div className="form-section-title">Voci di Costo (€)</div>
                    <div className="form-grid mt-16">
                      <Field label="Materia Prima" name="costo_materia_prima" type="number" step="0.01" />
                      <Field label="Trasporto e Gestione Rete" name="costo_trasporto" type="number" step="0.01" />
                      <Field label="Oneri di Sistema" name="costo_oneri_sistema" type="number" step="0.01" />
                      <Field label="Accise" name="costo_accise" type="number" step="0.01" />
                      <Field label="IVA" name="costo_iva" type="number" step="0.01" />
                      <Field label="Importo Totale *" name="importo_totale" type="number" step="0.01" />
                    </div>
                  </div>

                  {/* Extra */}
                  <div>
                    <div className="form-section-title">Extra</div>
                    <div className="form-grid mt-16">
                      <Field label="PUN Medio Periodo (€/MWh)" name="pun_medio_periodo" type="number" step="0.0001" />
                      <div className="form-group" style={{ gridColumn: 'span 2' }}>
                        <label className="form-label">Note</label>
                        <textarea className="form-textarea" value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {tab === 'manuale' && (
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Annulla</button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
                  {editId ? 'Salva Modifiche' : 'Aggiungi Bolletta'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
