import { useCallback, useEffect, useState, type ReactNode } from 'react'
import './App.css'

type Metric = { value: number; unit: string; source: string }
type EndpointStatus = 'loading' | 'online' | 'error'
type ViewState = { payload: unknown; status: EndpointStatus; error?: string }

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '')
const endpoints = [
  { key: 'saved', path: '/impact/metrics/co2_saved', label: 'CO₂ saved' },
  { key: 'averageSaved', path: '/impact/metrics/co2_saved_baseline_b', label: 'Daily-average baseline' },
  { key: 'shifted', path: '/impact/metrics/kwh_shifted', label: 'Energy shifted' },
  { key: 'optimized', path: '/impact/metrics/loads_optimized', label: 'Loads optimized' },
  { key: 'forecast', path: '/forecast', label: 'Forecast' },
  { key: 'schedule', path: '/schedule', label: 'Schedule' },
  { key: 'loads', path: '/loads', label: 'Virtual fleet' },
  { key: 'insights', path: '/insights', label: 'Insights' },
  { key: 'latestReport', path: '/reports/latest', label: 'Latest report' },
  { key: 'reports', path: '/reports', label: 'Reports' },
  { key: 'health', path: '/health', label: 'Health' },
] as const

type EndpointKey = (typeof endpoints)[number]['key']
type DashboardState = Record<EndpointKey, ViewState>

const initialState = Object.fromEntries(endpoints.map(({ key }) => [key, { payload: null, status: 'loading' }])) as DashboardState

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null
    throw new Error(typeof error?.message === 'string' ? error.message : `Request failed (${response.status})`)
  }
  return body
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asText(value: unknown, fallback = '—'): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function metricValue(payload: unknown): Metric | null {
  if (!isRecord(payload) || typeof payload.value !== 'number') return null
  return { value: payload.value, unit: asText(payload.unit, ''), source: asText(payload.source, 'UNKNOWN') }
}

function formatMetric(value: Metric | null, digits = 1): string {
  if (!value) return '—'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value.value)
}

function formatTime(value: unknown, options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }): string {
  if (typeof value !== 'string') return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, options).format(date)
}

function App() {
  const [data, setData] = useState<DashboardState>(initialState)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const results = await Promise.all(endpoints.map(async ({ key, path }) => {
      try {
        return [key, { payload: await getJson(path), status: 'online' as const }] as const
      } catch (error) {
        return [key, { payload: null, status: 'error' as const, error: error instanceof Error ? error.message : 'Request failed' }] as const
      }
    }))
    setData(Object.fromEntries(results) as DashboardState)
    setLastUpdated(new Date())
    setRefreshing(false)
  }, [])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0)
    const timer = window.setInterval(() => void refresh(), 60_000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
    }
  }, [refresh])

  const payload = (key: EndpointKey) => data[key]?.payload
  const forecastPayload = payload('forecast')
  const forecastRows = isRecord(forecastPayload) ? asList(forecastPayload.forecast).filter(isRecord) : []
  const nextDay = forecastRows.slice(0, 24)
  const maxIntensity = Math.max(1, ...nextDay.map((row) => asNumber(row.intensity_gco2_kwh)))
  const schedulePayload = payload('schedule')
  const loadsPayload = payload('loads')
  const insightsPayload = payload('insights')
  const reportsPayload = payload('reports')
  const latestPayload = payload('latestReport')
  const scheduleRows = isRecord(schedulePayload) ? asList(schedulePayload.decisions).filter(isRecord) : []
  const loadRows = isRecord(loadsPayload) ? asList(loadsPayload.loads).filter(isRecord) : []
  const insightRows = isRecord(insightsPayload) ? asList(insightsPayload.insights).filter(isRecord) : []
  const reportsRows = isRecord(reportsPayload) ? asList(reportsPayload.reports).filter(isRecord) : []
  const latestReport = isRecord(latestPayload) && isRecord(latestPayload.report) ? latestPayload.report : null
  const healthRaw = payload('health')
  const healthPayload = isRecord(healthRaw) ? healthRaw : null
  const sourceLabel = metricValue(payload('saved'))?.source ?? asText(isRecord(forecastPayload) ? forecastPayload.source : null, 'ESTIMATED')
  const connected = Object.values(data).filter((item) => item.status === 'online').length
  const allConnected = connected === endpoints.length

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="NRG home">
          <span className="brand-mark"><PulseIcon /></span>
          <span>NRG</span>
        </a>
        <div className="topbar-right">
          <div className={`connection ${allConnected ? 'connection-good' : connected ? 'connection-partial' : 'connection-off'}`}>
            <span className="connection-dot" />
            {connected}/{endpoints.length} endpoints connected
          </div>
          <button className="refresh-button" type="button" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshIcon /> {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
          <span className="avatar">TP</span>
        </div>
      </header>

      <div className="page-content" id="top">
        <section className="hero-row">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> AUTONOMOUS GRID OPTIMIZATION</div>
            <h1>Carbon, on a<br /><span>cleaner clock.</span></h1>
            <p className="hero-copy">Flexible demand, shifted into cleaner hours.<br className="desktop-break" /> A live view of your simulated grid fleet.</p>
          </div>
          <div className="hero-side">
            <div className="live-pill"><span className="live-pulse" /> SYSTEM {healthPayload && healthPayload.status === 'ok' ? 'ACTIVE' : 'CONNECTING'}</div>
            <span className="hero-stamp">KOLKATA, IN <span>·</span> 22.57° N</span>
          </div>
        </section>

        <section className="metric-grid" aria-label="Impact metrics">
          <MetricCard label="CO₂ AVOIDED" value={formatMetric(metricValue(payload('saved'))) } unit="gCO₂" note="vs typical-time baseline" tone="green" icon={<LeafIcon />} badge={sourceLabel} />
          <MetricCard label="LOADS OPTIMIZED" value={formatMetric(metricValue(payload('optimized')), 0)} unit="loads" note="flexible demand scheduled" tone="cream" icon={<GridIcon />} badge="SIMULATED" />
          <MetricCard label="ENERGY SHIFTED" value={formatMetric(metricValue(payload('shifted')))} unit="kWh" note="consumption unchanged" tone="lavender" icon={<BoltIcon />} badge="SIMULATED" />
          <MetricCard label="DAILY AVG. SAVING" value={formatMetric(metricValue(payload('averageSaved')))} unit="gCO₂" note="conservative baseline" tone="blue" icon={<SunIcon />} badge="ESTIMATED" />
        </section>

        <section className="content-grid">
          <article className="panel forecast-panel">
            <div className="panel-heading">
              <div><div className="section-kicker">GRID CARBON FORECAST</div><h2>Cleaner hours ahead</h2></div>
              <div className="panel-heading-right"><SourceBadge source={sourceLabel} /><span className="tiny-label">NEXT 24 HOURS</span></div>
            </div>
            <div className="chart-area">
              {nextDay.length ? <div className="bar-chart" role="img" aria-label="Hourly forecast carbon intensity bars">
                {nextDay.map((row, index) => {
                  const intensity = asNumber(row.intensity_gco2_kwh)
                  const height = Math.max(8, (intensity / maxIntensity) * 100)
                  const low = row.low_carbon_window === true
                  return <div className="bar-column" key={`${String(row.timestamp)}-${index}`} title={`${formatTime(row.timestamp)} · ${Math.round(intensity)} gCO₂/kWh`}>
                    <div className={`bar ${low ? 'bar-low' : ''}`} style={{ height: `${height}%` }} />
                    {index % 3 === 0 && <span className="bar-label">{formatTime(row.timestamp, { hour: 'numeric' })}</span>}
                  </div>
                })}
              </div> : <EmptyState state={data.forecast} label="Forecast data" />}
              <div className="chart-legend"><span><i className="legend-dot legend-standard" /> Grid intensity</span><span><i className="legend-dot legend-low" /> Cleaner window</span><span className="chart-unit">gCO₂ / kWh</span></div>
            </div>
            <div className="forecast-stats">
              <div><span className="stat-label">CLEANEST HOUR</span><strong>{nextDay.length ? `${Math.round(Math.min(...nextDay.map((row) => asNumber(row.intensity_gco2_kwh))))} <small>gCO₂/kWh</small>` : '—'}</strong></div>
              <div><span className="stat-label">FORECAST SOURCE</span><strong>{asText(isRecord(forecastPayload) ? forecastPayload.source : null, '—')}</strong></div>
              <div><span className="stat-label">HORIZON</span><strong>{forecastRows.length || '—'} <small>hours</small></strong></div>
            </div>
          </article>

          <article className="panel insights-panel">
            <div className="panel-heading"><div><div className="section-kicker">PULSE CHECK</div><h2>Grid insights</h2></div><span className="sparkle">✳</span></div>
            {insightRows.length ? <div className="insight-list">
              {insightRows.map((item, index) => <InsightItem key={`${String(item.type)}-${index}`} item={item} />)}
            </div> : <EmptyState state={data.insights} label="Insights" />}
            <div className="health-strip">
              <span className="health-icon"><PulseIcon /></span>
              <div><strong>Pipeline health</strong><span>{healthPayload?.scheduler === 'running' ? 'Scheduler running' : asText(healthPayload?.status, 'Waiting for API')}</span></div>
              <span className={`health-state ${healthPayload?.status === 'ok' ? 'state-ok' : 'state-wait'}`}>{healthPayload?.status === 'ok' ? 'HEALTHY' : 'CHECKING'}</span>
            </div>
          </article>
        </section>

        <section className="content-grid lower-grid">
          <article className="panel schedule-panel">
            <div className="panel-heading"><div><div className="section-kicker">AUTOMATED LOAD SHIFTING</div><h2>Schedule decisions</h2></div><span className="count-chip">{scheduleRows.length} decisions</span></div>
            {scheduleRows.length ? <div className="table-wrap"><table><thead><tr><th>VIRTUAL LOAD</th><th>BASELINE TIME</th><th>CHOSEN WINDOW</th><th>CARBON SAVED</th></tr></thead><tbody>
              {scheduleRows.slice(0, 6).map((item, index) => {
                const window = isRecord(item.chosen_window) ? item.chosen_window : null
                return <tr key={`${String(item.load_id)}-${index}`}><td><span className="device-icon"><DeviceIcon kind={asText(item.load)} /></span><span className="device-name">{formatKind(item.load)}</span><span className="status-dot" title={asText(item.status)} /></td><td>{formatTime(item.baseline_time)}</td><td><strong>{formatTime(window?.start)}</strong><span className="duration"> · {asNumber(window?.duration_hours)}h</span></td><td className="saving-cell">{asNumber(item.saving_g).toFixed(0)} g</td></tr>
              })}
            </tbody></table></div> : <EmptyState state={data.schedule} label="Schedule decisions" />}
            <div className="panel-footnote"><span>↗</span> Energy use stays constant. Only the timing changes.</div>
          </article>

          <article className="panel fleet-panel">
            <div className="panel-heading"><div><div className="section-kicker">SIMULATED HOUSEHOLDS</div><h2>Flexible fleet</h2></div><span className="count-chip">{loadRows.length} devices</span></div>
            {loadRows.length ? <div className="fleet-list">{loadRows.slice(0, 7).map((item, index) => <div className="fleet-row" key={`${String(item.id)}-${index}`}>
              <span className="device-icon fleet-device"><DeviceIcon kind={asText(item.kind)} /></span><div className="fleet-main"><strong>{formatKind(item.kind)}</strong><span>Home {asNumber(item.household)}</span></div><div className="fleet-meta"><strong>{asNumber(item.energy_kwh).toFixed(1)} <small>kWh</small></strong><span className={`tag tag-${asText(item.status, 'pending').toLowerCase()}`}>{asText(item.status, 'pending')}</span></div>
            </div>)}</div> : <EmptyState state={data.loads} label="Virtual fleet" />}
            <div className="fleet-foot"><span className="fleet-dot" /> All devices are virtual · no hardware connected</div>
          </article>
        </section>

        <section className="content-grid report-grid">
          <article className="panel report-panel">
            <div className="panel-heading"><div><div className="section-kicker">DAILY AUTOGENERATED BRIEF</div><h2>Latest report</h2></div><span className="report-mark"><ReportIcon /></span></div>
            {latestReport ? <><p className="report-copy">{asText(latestReport.body, 'Report is empty.')}</p><div className="report-meta"><span>{formatTime(latestReport.created_at, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><SourceBadge source={asText(latestReport.source, 'SIMULATED')} /></div></> : <EmptyState state={data.latestReport} label="Latest report" />}
          </article>
          <article className="panel report-history-panel">
            <div className="panel-heading"><div><div className="section-kicker">REPORT ARCHIVE</div><h2>Recent reports</h2></div><span className="count-chip">{reportsRows.length} reports</span></div>
            {reportsRows.length ? <div className="report-history">{reportsRows.slice(0, 4).map((item, index) => <div className="history-row" key={`${String(item.created_at)}-${index}`}><span className="history-icon"><ReportIcon /></span><div><strong>{formatTime(item.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong><span>{asText(item.body, 'Daily grid summary')}</span></div><span className="history-arrow">↗</span></div>)}</div> : <EmptyState state={data.reports} label="Reports" />}
          </article>
        </section>

        <footer className="page-footer"><span>NRG <b>·</b> Autonomous Grid Carbon Optimizer</span><span>{lastUpdated ? `Updated ${formatTime(lastUpdated.toISOString())}` : 'Connecting to API'} <b>·</b> <a href={`${API_BASE.replace('/api/v1', '')}/docs`} target="_blank" rel="noreferrer">API docs ↗</a></span></footer>
      </div>
    </main>
  )
}

function MetricCard({ label, value, unit, note, tone, icon, badge }: { label: string; value: string; unit: string; note: string; tone: string; icon: ReactNode; badge: string }) {
  return <article className={`metric-card metric-${tone}`}><div className="metric-card-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-bottom"><span>{note}</span><SourceBadge source={badge} /></div></article>
}

function InsightItem({ item }: { item: Record<string, unknown> }) {
  const type = asText(item.type)
  if (type === 'biggest_saving') return <div className="insight-item"><span className="insight-icon insight-green"><LeafIcon /></span><div><span>BIGGEST SAVING</span><strong>{asNumber(item.saving_g).toFixed(0)} gCO₂ <small>· load #{asText(item.load_id, '—')}</small></strong></div></div>
  if (type === 'cleanest_window_tomorrow') return <div className="insight-item"><span className="insight-icon insight-yellow"><SunIcon /></span><div><span>CLEANEST WINDOW · TOMORROW</span><strong>{formatTime(item.timestamp)} <small>· {item.intensity_gco2_kwh == null ? '—' : `${Math.round(asNumber(item.intensity_gco2_kwh))} gCO₂/kWh`}</small></strong></div></div>
  return <div className="insight-item"><span className="insight-icon insight-orange"><BoltIcon /></span><div><span>HIGHEST INTENSITY FORECAST</span><strong>{formatTime(item.timestamp)} <small>· {item.intensity_gco2_kwh == null ? '—' : `${Math.round(asNumber(item.intensity_gco2_kwh))} gCO₂/kWh`}</small></strong></div></div>
}

function EmptyState({ state, label }: { state: ViewState; label: string }) {
  if (state.status === 'loading') return <div className="empty-state"><span className="loading-spinner" /> Loading {label.toLowerCase()}…</div>
  if (state.status === 'error') return <div className="empty-state empty-error"><strong>{label} unavailable</strong><span>{state.error}. Check the API and CORS settings.</span></div>
  return <div className="empty-state">No {label.toLowerCase()} available yet.</div>
}

function SourceBadge({ source }: { source: string }) {
  const normalized = source.toLowerCase()
  return <span className={`source-badge source-${normalized}`}>{source}</span>
}

function formatKind(value: unknown): string {
  return asText(value, 'Virtual load').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function DeviceIcon({ kind }: { kind: string }) {
  const lower = kind.toLowerCase()
  if (lower.includes('ev')) return <BoltIcon />
  if (lower.includes('water')) return <DropIcon />
  if (lower.includes('ac')) return <SnowIcon />
  return <GridIcon />
}

function PulseIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function LeafIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 4c-8 0-14 2.5-14 9a6 6 0 0 0 6 6c6.5 0 8-8 8-15Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M4 21c3-5 7-8 12-11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg> }
function GridIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" /><rect x="4" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" /></svg> }
function BoltIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg> }
function SunIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg> }
function RefreshIcon() { return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16.5 8A6.7 6.7 0 0 0 4.9 5.4L3.5 7m0 0V3.8M3.5 7h3.2M3.5 12a6.7 6.7 0 0 0 11.6 2.6l1.4-1.6m0 0v3.2m0-3.2h-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function ReportIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M14 3v5h5M9 13h6M9 17h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg> }
function DropIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3s6 7 6 11a6 6 0 1 1-12 0c0-4 6-11 6-11Z" stroke="currentColor" strokeWidth="1.6" /></svg> }
function SnowIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9 5l3 2 3-2M9 19l3-2 3 2M5 11l3-1 1-3M15 17l1-3 3-1M5 13l3 1 1 3m6-10 1 3 3 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg> }

export default App
