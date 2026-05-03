import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Save, Plus, Trash2, Edit3, X, Check } from 'lucide-react'

const EMPTY_CONTRATTO = {
  fornitore: '', nome_offerta: '', tipo_mercato: 'fisso',
  prezzo_f1: '', prezzo_f2: '', prezzo_f3: '', prezzo_monorario: '', spread_pun: '',
  potenza_impegnata: '3.00', data_inizio: '', data_fine: '', note: ''
}

export default function ImpostazioniPage() {
  const { user } = useAuth()
  const [impostazioni, setImpostazioni] = useState({ nome_utente: '', indirizzo_fornitura: '', regione: '', zona_mercato: 'NORD' })
  const [contratti, setContratti] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [formContratto, setFormContratto] = useState(EMPTY_CONTRATTO)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savingImp, setSavingImp] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { loadData() }, [user])

  async function loadData() {
    if (!user) return
    const [{ data: imp }, { data: cont }] = await Promise.all([
      supabase.from('impostazioni').select('*').eq('user_id', user.id).single(),
      supabase.from('contratti').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    ])
    if (imp) setImpostazioni(imp)
    setContratti(cont || [])
  }

  async function saveImpostazioni() {
    setSavingImp(true)
    await supabase.from('impostazioni').upsert({ ...impostazioni, user_id: user.id }, { onConflict: 'user_id' })
    setSavingImp(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function openNewContratto() {
    setFormContratto(EMPTY_CONTRATTO)
    setEditId(null)
    setShowModal(true)
  }

  function openEditContratto(c) {
    setFormContratto({
      fornitore: c.fornitore || '', nome_offerta: c.nome_offerta || '',
      tipo_mercato: c.tipo_mercato || 'fisso',
      prezzo_f1: c.prezzo_f1 ?? '', prezzo_f2: c.prezzo_f2 ?? '',
      prezzo_f3: c.prezzo_f3 ?? '', prezzo_monorario: c.prezzo_monorario ?? '',
      spread_pun: c.spread_pun ?? '', potenza_impegnata: c.potenza_impegnata ?? '3.00',
      data_inizio: c.data_inizio || '', data_fine: c.data_fine || '', note: c.note || ''
    })
    setEditId(c.id)
    setShowModal(true)
  }

  async function saveContratto() {
    if (!formContratto.fornitore || !formContratto.nome_offerta) { alert('Inserisci fornitore e nome offerta'); return }
    setSaving(true)
    const payload = {
      user_id: user.id,
      fornitore: formContratto.fornitore,
      nome_offerta: formContratto.nome_offerta,
      tipo_mercato: formContratto.tipo_mercato,
      prezzo_f1: parseFloat(formContratto.prezzo_f1) || null,
      prezzo_f2: parseFloat(formContratto.prezzo_f2) || null,
      prezzo_f3: parseFloat(formContratto.prezzo_f3) || null,
      prezzo_monorario: parseFloat(formContratto.prezzo_monorario) || null,
      spread_pun: parseFloat(formContratto.spread_pun) || null,
      potenza_impegnata: parseFloat(formContratto.potenza_impegnata) || 3.0,
      data_inizio: formContratto.data_inizio || null,
      data_fine: formContratto.data_fine || null,
      note: formContratto.note || null,
      attivo: true,
    }
    if (editId) {
      await supabase.from('contratti').update(payload).eq('id', editId)
    } else {
      // Disattiva gli altri contratti prima
      await supabase.from('contratti').update({ attivo: false }).eq('user_id', user.id)
      await supabase.from('contratti').insert(payload)
    }
    setSaving(false)
    setShowModal(false)
    loadData()
  }

  async function deleteContratto(id) {
    if (!confirm('Eliminare questo contratto?')) return
    await supabase.from('contratti').delete().eq('id', id)
    loadData()
  }

  async function setAttivo(id) {
    await supabase.from('contratti').update({ attivo: false }).eq('user_id', user.id)
    await supabase.from('contratti').update({ attivo: true }).eq('id', id)
    loadData()
  }

  const FC = ({ label, name, type = 'text', step, placeholder, hint }) => (
    <div className="form-group">
      <label className="form-label">{label}{hint && <span className="text-muted" style={{ fontWeight: 400 }}> ({hint})</span>}</label>
      <input
        className="form-input" type={type} step={step} placeholder={placeholder}
        value={formContratto[name] ?? ''}
        onChange={e => setFormContratto(p => ({ ...p, [name]: e.target.value }))}
      />
    </div>
  )

  return (
    <div className="flex-col gap-24">
      {/* Impostazioni utente */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><span className="card-title-icon" />Profilo Utenza</div>
        </div>
        <div className="form-grid" style={{ marginBottom: 20 }}>
          <div className="form-group">
            <label className="form-label">Nome Utente</label>
            <input className="form-input" value={impostazioni.nome_utente || ''} onChange={e => setImpostazioni(p => ({ ...p, nome_utente: e.target.value }))} placeholder="es. Mario Rossi" />
          </div>
          <div className="form-group">
            <label className="form-label">Indirizzo Fornitura</label>
            <input className="form-input" value={impostazioni.indirizzo_fornitura || ''} onChange={e => setImpostazioni(p => ({ ...p, indirizzo_fornitura: e.target.value }))} placeholder="Via Roma 1, Milano" />
          </div>
          <div className="form-group">
            <label className="form-label">Regione</label>
            <select className="form-select" value={impostazioni.regione || ''} onChange={e => setImpostazioni(p => ({ ...p, regione: e.target.value }))}>
              <option value="">Seleziona...</option>
              {['Lombardia','Piemonte','Veneto','Emilia-Romagna','Toscana','Lazio','Campania','Sicilia','Sardegna','Puglia','Calabria','Liguria','Marche','Abruzzo','Umbria','Basilicata','Molise','Trentino-AA','Friuli-VG','Valle d\'Aosta'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Zona Mercato GME</label>
            <select className="form-select" value={impostazioni.zona_mercato || 'NORD'} onChange={e => setImpostazioni(p => ({ ...p, zona_mercato: e.target.value }))}>
              {['NORD','CNORD','CSUD','SUD','SICI','SARD'].map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-primary" onClick={saveImpostazioni} disabled={savingImp}>
          {savingImp ? <span className="spinner" style={{ width: 14, height: 14 }} /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? 'Salvato!' : 'Salva Impostazioni'}
        </button>
      </div>

      {/* Contratti */}
      <div>
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Contratti Elettrici</h2>
            <p className="font-mono text-muted" style={{ fontSize: '0.65rem', marginTop: 4 }}>Il contratto attivo viene usato per l'analisi AI e il confronto offerte</p>
          </div>
          <button className="btn btn-primary" onClick={openNewContratto}><Plus size={14} />Nuovo Contratto</button>
        </div>

        {contratti.length === 0 ? (
          <div className="card"><div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">Nessun contratto</div>
            <div className="empty-state-desc">Aggiungi i dati del tuo contratto attuale per abilitare il confronto offerte</div>
            <button className="btn btn-primary mt-16" onClick={openNewContratto}><Plus size={14} />Aggiungi Contratto</button>
          </div></div>
        ) : (
          <div className="flex-col gap-12">
            {contratti.map(c => (
              <div key={c.id} style={{
                background: c.attivo ? 'linear-gradient(135deg, rgba(245,166,35,0.06), var(--bg-card))' : 'var(--bg-card)',
                border: `1px solid ${c.attivo ? 'rgba(245,166,35,0.3)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)', padding: '16px 20px'
              }}>
                <div className="flex-between">
                  <div className="flex gap-12" style={{ alignItems: 'center' }}>
                    {c.attivo && <span className="badge badge-warning">✓ Attivo</span>}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>{c.fornitore}</div>
                      <div className="text-secondary" style={{ fontSize: '0.82rem' }}>{c.nome_offerta}</div>
                    </div>
                    <span className="badge badge-neutral">{c.tipo_mercato === 'fisso' ? 'Prezzo Fisso' : c.tipo_mercato === 'indicizzato_pun' ? 'Indicizzato PUN' : 'Tutela'}</span>
                  </div>
                  <div className="flex gap-8">
                    {!c.attivo && (
                      <button className="btn btn-secondary btn-sm" onClick={() => setAttivo(c.id)}>
                        <Check size={12} />Imposta Attivo
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => openEditContratto(c)}><Edit3 size={13} /></button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteContratto(c.id)}><Trash2 size={13} /></button>
                  </div>
                </div>

                {(c.prezzo_f1 || c.prezzo_monorario) && (
                  <div className="flex gap-16 mt-8" style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    {c.prezzo_f1 && <>
                      <div className="flex gap-6" style={{ alignItems: 'center' }}>
                        <span className="fascia-badge fascia-f1">F1</span>
                        <span className="font-mono" style={{ fontSize: '0.75rem' }}>{(c.prezzo_f1 * 100).toFixed(3)} c€/kWh</span>
                      </div>
                      <div className="flex gap-6" style={{ alignItems: 'center' }}>
                        <span className="fascia-badge fascia-f2">F2</span>
                        <span className="font-mono" style={{ fontSize: '0.75rem' }}>{(c.prezzo_f2 * 100).toFixed(3)} c€/kWh</span>
                      </div>
                      <div className="flex gap-6" style={{ alignItems: 'center' }}>
                        <span className="fascia-badge fascia-f3">F3</span>
                        <span className="font-mono" style={{ fontSize: '0.75rem' }}>{(c.prezzo_f3 * 100).toFixed(3)} c€/kWh</span>
                      </div>
                    </>}
                    {c.prezzo_monorario && (
                      <div className="font-mono text-secondary" style={{ fontSize: '0.75rem' }}>
                        Monorario: {(c.prezzo_monorario * 100).toFixed(3)} c€/kWh
                      </div>
                    )}
                    {c.spread_pun && (
                      <div className="font-mono text-secondary" style={{ fontSize: '0.75rem' }}>
                        Spread PUN: +{(c.spread_pun * 100).toFixed(3)} c€/kWh
                      </div>
                    )}
                    <div className="font-mono text-muted" style={{ fontSize: '0.72rem' }}>
                      Potenza: {c.potenza_impegnata} kW
                    </div>
                    {c.data_inizio && (
                      <div className="font-mono text-muted" style={{ fontSize: '0.72rem' }}>
                        Dal: {new Date(c.data_inizio).toLocaleDateString('it-IT')}
                        {c.data_fine ? ` al ${new Date(c.data_fine).toLocaleDateString('it-IT')}` : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal contratto */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div className="modal-title">{editId ? 'Modifica Contratto' : 'Nuovo Contratto'}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div>
                <div className="form-section-title">Fornitore</div>
                <div className="form-grid mt-16">
                  <FC label="Fornitore *" name="fornitore" placeholder="es. Enel Energia" />
                  <FC label="Nome Offerta *" name="nome_offerta" placeholder="es. Semplice Luce" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Tipo Mercato</label>
                <select className="form-select" value={formContratto.tipo_mercato} onChange={e => setFormContratto(p => ({ ...p, tipo_mercato: e.target.value }))}>
                  <option value="fisso">Mercato Libero — Prezzo Fisso</option>
                  <option value="indicizzato_pun">Mercato Libero — Indicizzato PUN</option>
                  <option value="tutela">Tutela / Servizio a Tutele Graduali</option>
                </select>
              </div>

              <div>
                <div className="form-section-title">Prezzi (€/kWh)</div>
                <div className="form-grid mt-16">
                  <FC label="Fascia F1" name="prezzo_f1" type="number" step="0.000001" placeholder="0.000000" hint="€/kWh" />
                  <FC label="Fascia F2" name="prezzo_f2" type="number" step="0.000001" placeholder="0.000000" hint="€/kWh" />
                  <FC label="Fascia F3" name="prezzo_f3" type="number" step="0.000001" placeholder="0.000000" hint="€/kWh" />
                  <FC label="Monorario" name="prezzo_monorario" type="number" step="0.000001" placeholder="0.000000" hint="se monorario" />
                  {formContratto.tipo_mercato === 'indicizzato_pun' && (
                    <FC label="Spread PUN" name="spread_pun" type="number" step="0.000001" placeholder="0.010000" hint="€/kWh da aggiungere al PUN" />
                  )}
                  <FC label="Potenza Impegnata (kW)" name="potenza_impegnata" type="number" step="0.01" placeholder="3.00" />
                </div>
              </div>

              <div>
                <div className="form-section-title">Validità</div>
                <div className="form-grid-2 mt-16">
                  <FC label="Data Inizio" name="data_inizio" type="date" />
                  <FC label="Data Fine" name="data_fine" type="date" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Note</label>
                <textarea className="form-textarea" value={formContratto.note} onChange={e => setFormContratto(p => ({ ...p, note: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={saveContratto} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
                {editId ? 'Salva Modifiche' : 'Aggiungi Contratto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
