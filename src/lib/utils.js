// Formattazione valuta
export const formatEuro = (val, decimals = 2) => {
  if (val == null || isNaN(val)) return '—'
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(val)
}

// Formattazione kWh
export const formatKWh = (val, decimals = 0) => {
  if (val == null || isNaN(val)) return '—'
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(val) + ' kWh'
}

// Formattazione €/kWh
export const formatEuroKWh = (val) => {
  if (val == null || isNaN(val)) return '—'
  return (val * 1000).toFixed(3) + ' €/MWh' // mostra in MWh per leggibilità
}

export const formatCentKWh = (val) => {
  if (val == null || isNaN(val)) return '—'
  return (val * 100).toFixed(4) + ' c€/kWh'
}

// Formattazione data italiana
export const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const formatMonthYear = (anno, mese) => {
  const d = new Date(anno, mese - 1, 1)
  return d.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })
}

// Nome mese
export const MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
export const MESI_FULL = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                          'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

// Colori fasce
export const FASCIA_COLORS = {
  F1: '#f59e0b',
  F2: '#3b82f6',
  F3: '#10b981',
  totale: '#8b5cf6'
}

// Calcolo statistiche bollette
export const calcolaStatistiche = (bollette) => {
  if (!bollette || bollette.length === 0) return null

  const totKwh = bollette.reduce((s, b) => s + (b.kwh_totale || 0), 0)
  const totImporto = bollette.reduce((s, b) => s + (b.importo_totale || 0), 0)
  const totF1 = bollette.reduce((s, b) => s + (b.kwh_f1 || 0), 0)
  const totF2 = bollette.reduce((s, b) => s + (b.kwh_f2 || 0), 0)
  const totF3 = bollette.reduce((s, b) => s + (b.kwh_f3 || 0), 0)

  return {
    totKwh,
    totImporto,
    totF1,
    totF2,
    totF3,
    prezzoMedioKwh: totKwh > 0 ? totImporto / totKwh : 0,
    percF1: totKwh > 0 ? (totF1 / totKwh) * 100 : 0,
    percF2: totKwh > 0 ? (totF2 / totKwh) * 100 : 0,
    percF3: totKwh > 0 ? (totF3 / totKwh) * 100 : 0,
    costoMedioMateria: bollette.reduce((s, b) => s + (b.costo_materia_prima || 0), 0),
    costoMedioTrasporto: bollette.reduce((s, b) => s + (b.costo_trasporto || 0), 0),
    costoMedioOneri: bollette.reduce((s, b) => s + (b.costo_oneri_sistema || 0), 0),
    costoMedioIva: bollette.reduce((s, b) => s + (b.costo_iva || 0), 0),
  }
}

// Raggruppa bollette per mese
export const raggruppaPerMese = (bollette) => {
  const mappa = {}
  bollette.forEach(b => {
    const key = `${new Date(b.periodo_inizio).getFullYear()}-${String(new Date(b.periodo_inizio).getMonth() + 1).padStart(2,'0')}`
    if (!mappa[key]) mappa[key] = []
    mappa[key].push(b)
  })
  return mappa
}

// Tipo mercato label
export const tipoMercatoLabel = {
  fisso: 'Prezzo Fisso',
  indicizzato_pun: 'Indicizzato PUN',
  tutela: 'Tutela / STG'
}
