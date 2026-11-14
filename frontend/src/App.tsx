import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import Crosshair from './component/Crosshair.jsx'
import LocationPicker, { type LocationPoint } from './component/LocationPicker'
import Topography from './component/Topography.jsx'
import { languages, translate, translateText, type LanguageCode } from './i18n'
import './App.css'

type EndpointStatus = 'loading' | 'online' | 'error'
type ViewState = { payload: unknown; status: EndpointStatus; error?: string }
type ScenarioDecision = {
  household: number
  load: string
  energy_kwh: number
  duration_hours: number
  baseline_time: string
  chosen_start: string | null
  saving_g: number
  status: string
}
type ScenarioResult = {
  source: string
  forecast_source: string
  methodology: string
  summary: {
    households: number
    max_concurrent_loads: number
    total_loads: number
    loads_optimized: number
    loads_not_optimized: number
    loads_limited_by_capacity: number
    peak_concurrent_loads: number
    energy_shifted_kwh: number
    energy_consumed_kwh: number
    baseline_co2_g: number
    optimized_co2_g: number
    co2_avoided_g: number
  }
  decisions: ScenarioDecision[]
}
type MobilityEstimate = {
  factor_source: string
  factor_source_url: string
  methodology: string
  baseline: { mode_name: string; factor_basis: string; emissions_kgco2e_per_week: number }
  selected: { mode_name: string; factor_basis: string; emissions_kgco2e_per_week: number }
  net_reduction_kgco2e_per_week: number
}
type UsageAppliance = { id: number; name: string; ratedWatts: string; quantity: string; hoursPerDay: string }
type EnergyUsageAnalysis = {
  analysis: string
  statistics: {
    consumed_kwh: number
    period_days: number
    daily_average_kwh: number
    estimated_appliance_kwh: number
    estimated_appliance_percent_of_meter: number
    unaccounted_kwh: number
    appliance_overage_kwh: number
    estimated_co2_kg: number
    emission_factor_gco2_per_kwh: number
    estimated_cost_inr: number | null
    appliances: Array<{ name: string; rated_watts: number; quantity: number; hours_per_day: number; estimated_kwh: number }>
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '')
const indiaTimezone = 'Asia/Kolkata'
const locations = [
  { id: 'kolkata', name: 'Kolkata, West Bengal', latitude: 22.57, longitude: 88.36 },
  { id: 'mumbai', name: 'Mumbai, Maharashtra', latitude: 19.076, longitude: 72.8777 },
  { id: 'new-delhi', name: 'New Delhi, Delhi', latitude: 28.6139, longitude: 77.209 },
  { id: 'bengaluru', name: 'Bengaluru, Karnataka', latitude: 12.9716, longitude: 77.5946 },
  { id: 'chennai', name: 'Chennai, Tamil Nadu', latitude: 13.0827, longitude: 80.2707 },
  { id: 'agartala', name: 'Agartala, Tripura', latitude: 23.83605, longitude: 91.27939 },
  { id: 'aizawl', name: 'Aizawl, Mizoram', latitude: 23.72894, longitude: 92.71791 },
  { id: 'amaravati', name: 'Amaravati, Andhra Pradesh', latitude: 16.514, longitude: 80.516 },
  { id: 'amritsar', name: 'Amritsar, Punjab', latitude: 31.62234, longitude: 74.87534 },
  { id: 'bhopal', name: 'Bhopal, Madhya Pradesh', latitude: 23.25469, longitude: 77.40289 },
  { id: 'bhubaneswar', name: 'Bhubaneswar, Odisha', latitude: 20.27241, longitude: 85.83385 },
  { id: 'chandigarh', name: 'Chandigarh', latitude: 30.73629, longitude: 76.7884 },
  { id: 'daman', name: 'Daman, Dadra and Nagar Haveli and Daman and Diu', latitude: 20.41431, longitude: 72.83236 },
  { id: 'dehradun', name: 'Dehradun, Uttarakhand', latitude: 30.32443, longitude: 78.03392 },
  { id: 'dispur', name: 'Dispur, Assam', latitude: 26.13564, longitude: 91.80069 },
  { id: 'gangtok', name: 'Gangtok, Sikkim', latitude: 27.32574, longitude: 88.61216 },
  { id: 'gandhinagar', name: 'Gandhinagar, Gujarat', latitude: 23.21667, longitude: 72.68333 },
  { id: 'hyderabad', name: 'Hyderabad, Telangana', latitude: 17.38405, longitude: 78.45636 },
  { id: 'imphal', name: 'Imphal, Manipur', latitude: 24.80805, longitude: 93.9442 },
  { id: 'itanagar', name: 'Itanagar, Arunachal Pradesh', latitude: 27.08694, longitude: 93.60987 },
  { id: 'jaipur', name: 'Jaipur, Rajasthan', latitude: 26.91962, longitude: 75.78781 },
  { id: 'kavaratti', name: 'Kavaratti, Lakshadweep', latitude: 10.56688, longitude: 72.64203 },
  { id: 'kohima', name: 'Kohima, Nagaland', latitude: 25.67467, longitude: 94.11099 },
  { id: 'leh', name: 'Leh, Ladakh', latitude: 34.16504, longitude: 77.58402 },
  { id: 'lucknow', name: 'Lucknow, Uttar Pradesh', latitude: 26.83928, longitude: 80.92313 },
  { id: 'panaji', name: 'Panaji, Goa', latitude: 15.49574, longitude: 73.82624 },
  { id: 'patna', name: 'Patna, Bihar', latitude: 25.59408, longitude: 85.13563 },
  { id: 'port-blair', name: 'Port Blair, Andaman and Nicobar Islands', latitude: 11.66613, longitude: 92.74635 },
  { id: 'puducherry', name: 'Puducherry', latitude: 11.93381, longitude: 79.82979 },
  { id: 'raipur', name: 'Raipur, Chhattisgarh', latitude: 21.23333, longitude: 81.63333 },
  { id: 'ranchi', name: 'Ranchi, Jharkhand', latitude: 23.34316, longitude: 85.3094 },
  { id: 'shimla', name: 'Shimla, Himachal Pradesh', latitude: 31.10442, longitude: 77.16662 },
  { id: 'shillong', name: 'Shillong, Meghalaya', latitude: 25.56892, longitude: 91.88313 },
  { id: 'srinagar', name: 'Srinagar, Jammu and Kashmir', latitude: 34.08565, longitude: 74.80555 },
  { id: 'thiruvananthapuram', name: 'Thiruvananthapuram, Kerala', latitude: 8.4855, longitude: 76.94924 },
].map((location) => ({ ...location, timezone: indiaTimezone }))
const endpoints = [
  { key: 'publicGrid', path: '/public/grid-snapshot', label: 'Public grid data' },
  { key: 'forecast', path: '/forecast', label: 'Forecast' },
  { key: 'schedule', path: '/schedule', label: 'Schedule' },
  { key: 'loads', path: '/loads', label: 'Virtual fleet' },
  { key: 'insights', path: '/insights', label: 'Insights' },
  { key: 'latestReport', path: '/reports/latest', label: 'Latest report' },
  { key: 'reports', path: '/reports', label: 'Reports' },
  { key: 'health', path: '/health', label: 'Health' },
  { key: 'wastePlan', path: '/environment/waste/collection-plan', label: 'Waste collection plan' },
] as const

type EndpointKey = (typeof endpoints)[number]['key']
type DashboardState = Record<EndpointKey, ViewState>

const initialState = Object.fromEntries(endpoints.map(({ key }) => [key, { payload: null, status: 'loading' }])) as DashboardState
const loadProfileEndTime = Date.now()
const dashboardTabs = [
  ['overview', 'Overview'],
  ['power', 'Power'],
  ['usage', 'Power use'],
  ['weather', 'Weather'],
  ['environment', 'Environment'],
  ['mobility', 'Mobility'],
  ['reports', 'Reports'],
] as const
const commonAppliances = [
  { name: 'Air conditioner', watts: '1500' }, { name: 'Refrigerator', watts: '150' },
  { name: 'Ceiling fan', watts: '75' }, { name: 'LED bulb', watts: '9' },
  { name: 'Television', watts: '100' }, { name: 'Washing machine', watts: '500' },
  { name: 'Water heater', watts: '2000' }, { name: 'Laptop', watts: '65' },
  { name: 'Microwave', watts: '1200' }, { name: 'Water pump', watts: '750' },
  { name: 'Induction cooktop', watts: '1800' }, { name: 'Other appliance', watts: '100' },
] as const

const hourlyLoadProfile = Array.from({ length: 168 }, (_, index) => {
  const hour = index % 24
  const day = Math.floor(index / 24)
  const dailyPeak = hour >= 7 && hour <= 21
  const morningPeak = hour >= 7 && hour <= 10
  const eveningPeak = hour >= 16 && hour <= 20
  const dayFactor = 0.94 + (day % 5) * 0.03
  const actual = (24 + (dailyPeak ? 12 : 0) + (morningPeak ? 34 : 0) + (eveningPeak ? 52 : 0) + (hour === 12 ? 28 : 0)) * dayFactor
  return { actual, baseline: actual * 1.16 + (dailyPeak ? 2 : 0) }
})

function sampleLoadProfile(mode: 'realtime' | 'hourly' | 'daily') {
  const recentHours = hourlyLoadProfile.slice(-48)
  if (mode === 'hourly') return recentHours
  if (mode === 'daily') {
    return Array.from({ length: 7 }, (_, day) => {
      const values = hourlyLoadProfile.slice(day * 24, (day + 1) * 24)
      return {
        actual: values.reduce((sum, point) => sum + point.actual, 0) / values.length,
        baseline: values.reduce((sum, point) => sum + point.baseline, 0) / values.length,
      }
    })
  }
  return Array.from({ length: 193 }, (_, index) => {
    const hourIndex = Math.min(index / 4, recentHours.length - 1)
    const lowerIndex = Math.floor(hourIndex)
    const upperIndex = Math.min(lowerIndex + 1, recentHours.length - 1)
    const fraction = hourIndex - lowerIndex
    const lower = recentHours[lowerIndex]
    const upper = recentHours[upperIndex]
    return {
      actual: lower.actual + (upper.actual - lower.actual) * fraction,
      baseline: lower.baseline + (upper.baseline - lower.baseline) * fraction,
    }
  })
}

function profilePath(profile: ReturnType<typeof sampleLoadProfile>, key: 'actual' | 'baseline', width: number, height: number): string {
  const max = 120
  return profile.map((point, index) => {
    const x = (index / (profile.length - 1)) * width
    const y = height - (point[key] / max) * height
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null
    throw new Error(typeof error?.message === 'string' ? error.message : `Request failed (${response.status})`)
  }
  return body
}

async function postJson(path: string, payload: unknown): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
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

function parseScenarioResult(value: unknown): ScenarioResult | null {
  if (!isRecord(value) || !isRecord(value.summary) || !Array.isArray(value.decisions)) return null
  const summary = value.summary
  const households = summary.households
  const maxConcurrentLoads = summary.max_concurrent_loads
  const totalLoads = summary.total_loads
  const loadsOptimized = summary.loads_optimized
  const loadsNotOptimized = summary.loads_not_optimized
  const loadsLimitedByCapacity = summary.loads_limited_by_capacity
  const peakConcurrentLoads = summary.peak_concurrent_loads
  const energyShifted = summary.energy_shifted_kwh
  const energyConsumed = summary.energy_consumed_kwh
  const baselineCo2 = summary.baseline_co2_g
  const optimizedCo2 = summary.optimized_co2_g
  const co2Avoided = summary.co2_avoided_g
  if ([households, maxConcurrentLoads, totalLoads, loadsOptimized, loadsNotOptimized, loadsLimitedByCapacity, peakConcurrentLoads, energyShifted, energyConsumed, baselineCo2, optimizedCo2, co2Avoided].some((number) => typeof number !== 'number' || !Number.isFinite(number))) return null
  if (typeof value.source !== 'string' || typeof value.forecast_source !== 'string' || typeof value.methodology !== 'string') return null
  const decisions: ScenarioDecision[] = []
  for (const item of value.decisions) {
    if (!isRecord(item) || typeof item.household !== 'number' || !Number.isFinite(item.household) || typeof item.load !== 'string' || typeof item.energy_kwh !== 'number' || !Number.isFinite(item.energy_kwh) || typeof item.duration_hours !== 'number' || !Number.isFinite(item.duration_hours) || typeof item.baseline_time !== 'string' || (item.chosen_start !== null && typeof item.chosen_start !== 'string') || typeof item.saving_g !== 'number' || !Number.isFinite(item.saving_g) || typeof item.status !== 'string') return null
    decisions.push({ household: item.household, load: item.load, energy_kwh: item.energy_kwh, duration_hours: item.duration_hours, baseline_time: item.baseline_time, chosen_start: item.chosen_start, saving_g: item.saving_g, status: item.status })
  }
  return {
    source: value.source,
    forecast_source: value.forecast_source,
    methodology: value.methodology,
    summary: {
      households: Number(households),
      max_concurrent_loads: Number(maxConcurrentLoads),
      total_loads: Number(totalLoads),
      loads_optimized: Number(loadsOptimized),
      loads_not_optimized: Number(loadsNotOptimized),
      loads_limited_by_capacity: Number(loadsLimitedByCapacity),
      peak_concurrent_loads: Number(peakConcurrentLoads),
      energy_shifted_kwh: Number(energyShifted),
      energy_consumed_kwh: Number(energyConsumed),
      baseline_co2_g: Number(baselineCo2),
      optimized_co2_g: Number(optimizedCo2),
      co2_avoided_g: Number(co2Avoided),
    },
    decisions,
  }
}

function parseMobilityEstimate(value: unknown): MobilityEstimate | null {
  if (!isRecord(value) || !isRecord(value.baseline) || !isRecord(value.selected)) return null
  const baselineKg = value.baseline.emissions_kgco2e_per_week
  const selectedKg = value.selected.emissions_kgco2e_per_week
  const netReduction = value.net_reduction_kgco2e_per_week
  if (typeof value.factor_source !== 'string' || typeof value.factor_source_url !== 'string' || typeof value.methodology !== 'string') return null
  if (typeof value.baseline.mode_name !== 'string' || typeof value.baseline.factor_basis !== 'string' || typeof baselineKg !== 'number' || !Number.isFinite(baselineKg)) return null
  if (typeof value.selected.mode_name !== 'string' || typeof value.selected.factor_basis !== 'string' || typeof selectedKg !== 'number' || !Number.isFinite(selectedKg)) return null
  if (typeof netReduction !== 'number' || !Number.isFinite(netReduction)) return null
  return {
    factor_source: value.factor_source,
    factor_source_url: value.factor_source_url,
    methodology: value.methodology,
    baseline: { mode_name: value.baseline.mode_name, factor_basis: value.baseline.factor_basis, emissions_kgco2e_per_week: baselineKg },
    selected: { mode_name: value.selected.mode_name, factor_basis: value.selected.factor_basis, emissions_kgco2e_per_week: selectedKg },
    net_reduction_kgco2e_per_week: netReduction,
  }
}

function parseEnergyUsageAnalysis(value: unknown): EnergyUsageAnalysis | null {
  if (!isRecord(value) || typeof value.analysis !== 'string' || !isRecord(value.statistics)) return null
  const stats = value.statistics
  const applianceValues = stats.appliances
  if (!Array.isArray(applianceValues)) return null
  const numericKeys = ['consumed_kwh', 'period_days', 'daily_average_kwh', 'estimated_appliance_kwh', 'estimated_appliance_percent_of_meter', 'unaccounted_kwh', 'appliance_overage_kwh', 'estimated_co2_kg', 'emission_factor_gco2_per_kwh'] as const
  if (numericKeys.some((key) => typeof stats[key] !== 'number' || !Number.isFinite(stats[key]))) return null
  if (stats.estimated_cost_inr !== null && (typeof stats.estimated_cost_inr !== 'number' || !Number.isFinite(stats.estimated_cost_inr))) return null
  const appliances: EnergyUsageAnalysis['statistics']['appliances'] = []
  for (const item of applianceValues) {
    if (!isRecord(item) || typeof item.name !== 'string' || ['rated_watts', 'quantity', 'hours_per_day', 'estimated_kwh'].some((key) => typeof item[key] !== 'number' || !Number.isFinite(item[key]))) return null
    appliances.push({ name: item.name, rated_watts: Number(item.rated_watts), quantity: Number(item.quantity), hours_per_day: Number(item.hours_per_day), estimated_kwh: Number(item.estimated_kwh) })
  }
  return {
    analysis: value.analysis,
    statistics: {
      consumed_kwh: Number(stats.consumed_kwh), period_days: Number(stats.period_days), daily_average_kwh: Number(stats.daily_average_kwh),
      estimated_appliance_kwh: Number(stats.estimated_appliance_kwh), estimated_appliance_percent_of_meter: Number(stats.estimated_appliance_percent_of_meter),
      unaccounted_kwh: Number(stats.unaccounted_kwh), appliance_overage_kwh: Number(stats.appliance_overage_kwh), estimated_co2_kg: Number(stats.estimated_co2_kg),
      emission_factor_gco2_per_kwh: Number(stats.emission_factor_gco2_per_kwh),
      estimated_cost_inr: stats.estimated_cost_inr === null ? null : Number(stats.estimated_cost_inr), appliances,
    },
  }
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

function formatCo2Grams(grams: number): string {
  return Math.abs(grams) >= 1000 ? `${(grams / 1000).toFixed(2)} kgCO₂` : `${grams.toFixed(0)} gCO₂`
}

function isLanguageCode(value: string | null): value is LanguageCode {
  return value !== null && Object.hasOwn(languages, value)
}

function formatTime(value: unknown, options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }, locale?: string, timeZone?: string): string {
  if (typeof value !== 'string') return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(locale, { ...options, ...(timeZone ? { timeZone } : {}) }).format(date)
}

function App() {
  const [language, setLanguage] = useState<LanguageCode>(() => {
    const saved = window.localStorage.getItem('nrg-language')
    return isLanguageCode(saved) ? saved : 'en'
  })
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key)
  const tx = (text: string) => translateText(language, text)
  const formatDate = (value: unknown, options?: Intl.DateTimeFormatOptions) => formatTime(value, options, languages[language].locale, locationTimezone)
  const [showDashboard, setShowDashboard] = useState(false)
  const [activeDashboardTab, setActiveDashboardTab] = useState<'overview' | 'power' | 'usage' | 'weather' | 'environment' | 'mobility' | 'reports'>('overview')
  const [mobilityDistance, setMobilityDistance] = useState('8')
  const [mobilityDays, setMobilityDays] = useState(5)
  const [mobilityMode, setMobilityMode] = useState('local_bus')
  const [mobilityEstimate, setMobilityEstimate] = useState<MobilityEstimate | null>(null)
  const [mobilityLoading, setMobilityLoading] = useState(false)
  const [mobilityError, setMobilityError] = useState<string | null>(null)
  const [usageKwh, setUsageKwh] = useState('')
  const [usagePeriodDays, setUsagePeriodDays] = useState('30')
  const [usageTariff, setUsageTariff] = useState('')
  const [usageAppliances, setUsageAppliances] = useState<UsageAppliance[]>([])
  const nextApplianceId = useRef(0)
  const [usageAnalysis, setUsageAnalysis] = useState<EnergyUsageAnalysis | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState<string | null>(null)
  const dashboardTabsRef = useRef<HTMLElement>(null)
  const dashboardTabButtonsRef = useRef<Array<HTMLButtonElement | null>>([])
  const [tabIndicator, setTabIndicator] = useState({ left: 5, width: 0 })
  const [data, setData] = useState<DashboardState>(initialState)
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null)
  const [scenarioHouseholds, setScenarioHouseholds] = useState(30)
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<Record<string, unknown> | null>(null)
  const reportDialogRef = useRef<HTMLDialogElement>(null)
  const [weatherMode, setWeatherMode] = useState<'realtime' | 'hourly' | 'daily'>('hourly')
  const [hoveredLoadPoint, setHoveredLoadPoint] = useState<{ index: number; x: number; y: number; below: boolean } | null>(null)
  const [hoveredForecastIndex, setHoveredForecastIndex] = useState<number | null>(null)
  const [weatherView, setWeatherView] = useState<ViewState>({ payload: null, status: 'loading' })
  const [airQualityView, setAirQualityView] = useState<ViewState>({ payload: null, status: 'loading' })
  const [waterQualityView, setWaterQualityView] = useState<ViewState>({ payload: null, status: 'loading' })
  const [waterRegions, setWaterRegions] = useState<string[]>([])
  const [waterRegion, setWaterRegion] = useState('West Bengal')
  const [environmentRefreshing, setEnvironmentRefreshing] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState<string>('kolkata')
  const [customGridState, setCustomGridState] = useState<string | null>(null)
  const [locationPoint, setLocationPoint] = useState<LocationPoint>({ latitude: 22.57, longitude: 88.36 })
  const [mapPoint, setMapPoint] = useState<LocationPoint>({ latitude: 22.57, longitude: 88.36 })
  const [locationTimezone, setLocationTimezone] = useState('Asia/Kolkata')
  const [timezoneSource, setTimezoneSource] = useState('ESTIMATED')
  const [mapOpen, setMapOpen] = useState(false)
  const [zoomEarthUrl, setZoomEarthUrl] = useState('')
  const [zoomEarthError, setZoomEarthError] = useState<string | null>(null)
  const locationDialogRef = useRef<HTMLDialogElement>(null)
  const [locationLoading, setLocationLoading] = useState(true)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(() => window.localStorage.getItem('nrg-theme') === 'dark')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiInsightLoading, setAiInsightLoading] = useState(false)
  const [aiInsightError, setAiInsightError] = useState<string | null>(null)

  useEffect(() => {
    window.localStorage.setItem('nrg-language', language)
    document.documentElement.lang = languages[language].locale
  }, [language])

  useLayoutEffect(() => {
    const nav = dashboardTabsRef.current
    if (!nav) return
    const updateIndicator = () => {
      const index = dashboardTabs.findIndex(([tab]) => tab === activeDashboardTab)
      const button = dashboardTabButtonsRef.current[index]
      if (!button) return
      const navBounds = nav.getBoundingClientRect()
      const buttonBounds = button.getBoundingClientRect()
      setTabIndicator({ left: buttonBounds.left - navBounds.left, width: buttonBounds.width })
    }
    updateIndicator()
    const observer = new ResizeObserver(updateIndicator)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [activeDashboardTab])

  useEffect(() => {
    const dialog = reportDialogRef.current
    if (!dialog) return
    if (selectedReport && !dialog.open) dialog.showModal()
    if (!selectedReport && dialog.open) dialog.close()
  }, [selectedReport])

  useEffect(() => {
    const dialog = locationDialogRef.current
    if (!dialog) return
    if (mapOpen && !dialog.open) dialog.showModal()
    if (!mapOpen && dialog.open) dialog.close()
  }, [mapOpen])

  const refresh = useCallback(async (locationId = selectedLocationId, stateOverride?: string | null) => {
    setRefreshing(true)
    const selectedName = locations.find((location) => location.id === locationId)?.name
    const gridState = locationId === 'custom' ? stateOverride === undefined ? customGridState : stateOverride : selectedName?.split(',').at(-1)?.trim()
    const results = await Promise.all(endpoints.map(async ({ key, path }) => {
      try {
        const endpoint = key === 'publicGrid' && gridState ? `${path}?state=${encodeURIComponent(gridState)}` : path
        return [key, { payload: await getJson(endpoint), status: 'online' as const }] as const
      } catch (error) {
        return [key, { payload: null, status: 'error' as const, error: error instanceof Error ? error.message : 'Request failed' }] as const
      }
    }))
    setData(Object.fromEntries(results) as DashboardState)
    try {
      setWeatherView({ payload: await getJson(`/weather?mode=${weatherMode}`), status: 'online' })
    } catch (error) {
      setWeatherView({ payload: null, status: 'error', error: error instanceof Error ? error.message : 'Request failed' })
    }
    setLastUpdated(new Date())
    setRefreshing(false)
  }, [customGridState, selectedLocationId, weatherMode])

  const runOptimizationScenario = async () => {
    setScenarioLoading(true)
    setScenarioError(null)
    try {
      const result = parseScenarioResult(await postJson('/scenario/run', { households: scenarioHouseholds }))
      if (!result) throw new Error('The server returned an unexpected optimization result.')
      setScenarioResult(result)
    } catch (error) {
      setScenarioError(error instanceof Error ? error.message : 'Could not run the optimization scenario')
    } finally {
      setScenarioLoading(false)
    }
  }

  const generateAiInsight = async () => {
    setAiInsightLoading(true)
    setAiInsightError(null)
    try {
      const result = await postJson('/insights/ai', {})
      if (!isRecord(result) || typeof result.insight !== 'string' || !result.insight.trim()) {
        throw new Error('The AI service returned an invalid insight.')
      }
      setAiInsight(result.insight)
    } catch (error) {
      setAiInsightError(error instanceof Error ? error.message : 'Could not generate an AI insight.')
    } finally {
      setAiInsightLoading(false)
    }
  }

  const runMobilityEstimate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMobilityLoading(true)
    setMobilityError(null)
    try {
      const result = parseMobilityEstimate(await postJson('/mobility/estimate', {
        one_way_distance_km: Number(mobilityDistance),
        commute_days_per_week: mobilityDays,
        mode: mobilityMode,
      }))
      if (!result) throw new Error('The server returned an unexpected mobility estimate.')
      setMobilityEstimate(result)
    } catch (error) {
      setMobilityError(error instanceof Error ? error.message : 'Could not calculate the commute estimate')
    } finally {
      setMobilityLoading(false)
    }
  }

  const addUsageAppliance = () => {
    setUsageAppliances((current) => [...current, { id: nextApplianceId.current++, name: '', ratedWatts: '', quantity: '1', hoursPerDay: '' }])
    setUsageAnalysis(null)
  }

  const analyzeUsage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setUsageLoading(true)
    setUsageError(null)
    setUsageAnalysis(null)
    try {
      const result = parseEnergyUsageAnalysis(await postJson('/energy/usage/analyze', {
        consumed_kwh: Number(usageKwh),
        period_days: Number(usagePeriodDays),
        tariff_inr_per_kwh: usageTariff.trim() ? Number(usageTariff) : null,
        language,
        appliances: usageAppliances.map(({ name, ratedWatts, quantity, hoursPerDay }) => ({ name, rated_watts: Number(ratedWatts), quantity: Number(quantity), hours_per_day: Number(hoursPerDay) })),
      }))
      if (!result) throw new Error('The server returned an unexpected energy analysis.')
      setUsageAnalysis(result)
    } catch (error) {
      setUsageError(error instanceof Error ? error.message : 'Could not analyze household energy use.')
    } finally {
      setUsageLoading(false)
    }
  }

  const updateUsageAppliance = (id: number, field: keyof Omit<UsageAppliance, 'id'>, value: string) => {
    setUsageAnalysis(null)
    setUsageAppliances((current) => current.map((item) => {
      if (item.id !== id) return item
      if (field === 'name') {
        const preset = commonAppliances.find((appliance) => appliance.name === value)
        return { ...item, name: value, ratedWatts: preset?.watts ?? item.ratedWatts }
      }
      return { ...item, [field]: value }
    }))
  }

  useEffect(() => {
    document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light'
    window.localStorage.setItem('nrg-theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await getJson('/location')
          if (isRecord(response) && isRecord(response.location)) {
            const { latitude, longitude } = response.location
            if (typeof latitude === 'number' && typeof longitude === 'number') {
              const point = { latitude, longitude }
              setLocationPoint(point)
              setMapPoint(point)
              const savedLocation = locations.find((location) =>
                Math.abs(location.latitude - latitude) < 0.0001 && Math.abs(location.longitude - longitude) < 0.0001,
              )
              if (savedLocation) {
                setCustomGridState(null)
                setSelectedLocationId(savedLocation.id)
              } else {
                const region = await getJson(`/location/region?latitude=${latitude}&longitude=${longitude}`)
                setCustomGridState(isRecord(region) && typeof region.state === 'string' ? region.state : null)
                setSelectedLocationId('custom')
              }
            }
            if (typeof response.location.timezone === 'string') setLocationTimezone(response.location.timezone)
            if (typeof response.timezone_source === 'string') setTimezoneSource(response.timezone_source)
          }
        } catch (error) {
          setLocationError(error instanceof Error ? error.message : 'Could not load the saved location')
        } finally {
          setLocationLoading(false)
        }
      })()
    }, 0)
    return () => window.clearTimeout(initialTimer)
  }, [])

  useEffect(() => {
    if (!showDashboard) return
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(timer)
  }, [refresh, showDashboard])

  const refreshEnvironmentalData = useCallback(async () => {
    setEnvironmentRefreshing(true)
    const [airResult, waterResult] = await Promise.allSettled([
      getJson('/environment/air-quality'),
      getJson(`/environment/water-quality?region=${encodeURIComponent(waterRegion)}&radius_km=100`),
    ])
    if (airResult.status === 'fulfilled') setAirQualityView({ payload: airResult.value, status: 'online' })
    else setAirQualityView({ payload: null, status: 'error', error: airResult.reason instanceof Error ? airResult.reason.message : 'Air-quality data unavailable' })
    if (waterResult.status === 'fulfilled') setWaterQualityView({ payload: waterResult.value, status: 'online' })
    else setWaterQualityView({ payload: null, status: 'error', error: waterResult.reason instanceof Error ? waterResult.reason.message : 'Water-quality data unavailable' })
    setEnvironmentRefreshing(false)
  }, [waterRegion])

  useEffect(() => {
    let active = true
    void getJson('/environment/water-quality/regions').then((response) => {
      if (!active || !isRecord(response)) return
      const regions = asList(response.regions).filter((region): region is string => typeof region === 'string')
      setWaterRegions(regions)
      const selectedName = locations.find((location) => location.id === selectedLocationId)?.name
      const stateName = selectedName?.split(',').at(-1)?.trim()
      if (stateName) {
        const match = regions.find((region) => region.toLowerCase() === stateName.toLowerCase())
        if (match) setWaterRegion(match)
      }
    }).catch(() => {
      // The water card shows its own data request error if the portal is unavailable.
    })
    return () => { active = false }
  }, [selectedLocationId])

  useEffect(() => {
    if (showDashboard) void refreshEnvironmentalData()
  }, [refreshEnvironmentalData, showDashboard, locationPoint.latitude, locationPoint.longitude])

  const changeLocation = async (locationId: string) => {
    const location = locations.find((option) => option.id === locationId)
    if (!location) return
    setLocationLoading(true)
    setLocationError(null)
    try {
      const response = await postJson('/location', {
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: location.timezone,
      })
      setCustomGridState(null)
      setSelectedLocationId(location.id)
      setLocationPoint({ latitude: location.latitude, longitude: location.longitude })
      setMapPoint({ latitude: location.latitude, longitude: location.longitude })
      setScenarioResult(null)
      if (isRecord(response) && isRecord(response.location) && typeof response.location.timezone === 'string') setLocationTimezone(response.location.timezone)
      if (isRecord(response) && typeof response.timezone_source === 'string') setTimezoneSource(response.timezone_source)
      await refresh(location.id, null)
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : 'Could not update the location')
    } finally {
      setLocationLoading(false)
    }
  }

  const applyMapLocation = async (openDashboard = false) => {
    setLocationLoading(true)
    setLocationError(null)
    try {
      const response = await postJson('/location', mapPoint)
      const region = await getJson(`/location/region?latitude=${mapPoint.latitude}&longitude=${mapPoint.longitude}`)
      const resolvedGridState = isRecord(region) && typeof region.state === 'string' ? region.state : null
      setLocationPoint(mapPoint)
      setSelectedLocationId('custom')
      setCustomGridState(resolvedGridState)
      setScenarioResult(null)
      if (isRecord(response) && isRecord(response.location) && typeof response.location.timezone === 'string') setLocationTimezone(response.location.timezone)
      if (isRecord(response) && typeof response.timezone_source === 'string') setTimezoneSource(response.timezone_source)
      if (openDashboard) setShowDashboard(true)
      else {
        setMapOpen(false)
        await refresh('custom', resolvedGridState)
      }
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : 'Could not update the location')
    } finally {
      setLocationLoading(false)
    }
  }

  const importZoomEarthLocation = () => {
    try {
      const url = new URL(zoomEarthUrl)
      if (url.hostname !== 'zoom.earth' && !url.hostname.endsWith('.zoom.earth')) throw new Error('Use a Zoom Earth map URL')
      const view = url.hash.match(/(?:^#|&)view=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,[\d.]+z)?/i)
      if (!view) throw new Error('The URL does not include map coordinates')
      const latitude = Number(view[1])
      const longitude = Number(view[2])
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new Error('The Zoom Earth coordinates are outside valid ranges')
      }
      setMapPoint({ latitude, longitude })
      setZoomEarthError(null)
    } catch (error) {
      setZoomEarthError(error instanceof Error ? error.message : 'Could not read that Zoom Earth link')
    }
  }

  const payload = (key: EndpointKey) => data[key]?.payload
  const forecastPayload = payload('forecast')
  const weatherPayload = isRecord(weatherView.payload) ? weatherView.payload : null
  const weatherRows = weatherPayload ? asList(weatherPayload.data).filter(isRecord) : []
  const loadSeries = sampleLoadProfile(weatherMode)
  const loadSeriesWindow = weatherMode === 'daily' ? '7 days' : '48 hours'
  const loadSeriesStep = weatherMode === 'realtime' ? '15-minute' : weatherMode === 'hourly' ? 'hourly' : 'daily'
  const loadTooltipTime = (index: number) => {
    if (weatherMode === 'daily') {
      const date = new Date(loadProfileEndTime - (loadSeries.length - 1 - index) * 24 * 60 * 60 * 1000)
      return new Intl.DateTimeFormat(languages[language].locale, { weekday: 'short', timeZone: locationTimezone }).format(date)
    }
    const intervalHours = weatherMode === 'realtime' ? 0.25 : 1
    const date = new Date(loadProfileEndTime - (loadSeries.length - 1 - index) * intervalHours * 60 * 60 * 1000)
    return new Intl.DateTimeFormat(languages[language].locale, { weekday: 'short', hour: 'numeric', timeZone: locationTimezone }).format(date)
  }
  const handleLoadPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svgBounds = event.currentTarget.getBoundingClientRect()
    const chartBounds = event.currentTarget.closest('.load-series-chart')?.getBoundingClientRect()
    if (!svgBounds.width || !svgBounds.height || !chartBounds) return
    const ratio = Math.max(0, Math.min(1, (event.clientX - svgBounds.left) / svgBounds.width))
    const index = Math.round(ratio * (loadSeries.length - 1))
    const point = loadSeries[index]
    const pointY = svgBounds.top - chartBounds.top + (180 - (point.actual / 120) * 180) * (svgBounds.height / 180)
    setHoveredLoadPoint({
      index,
      x: Math.max(140, Math.min(chartBounds.width - 140, svgBounds.left - chartBounds.left + ratio * svgBounds.width)),
      y: pointY < 90 ? pointY + 8 : pointY - 8,
      below: pointY < 90,
    })
  }
  const airQualityPayload = isRecord(airQualityView.payload) ? airQualityView.payload : null
  const airCurrent = airQualityPayload && isRecord(airQualityPayload.current) ? airQualityPayload.current : null
  const airUnits = airQualityPayload && isRecord(airQualityPayload.current_units) ? airQualityPayload.current_units : null
  const airRows = airQualityPayload ? asList(airQualityPayload.hourly).filter(isRecord) : []
  const waterQualityPayload = isRecord(waterQualityView.payload) ? waterQualityView.payload : null
  const waterStations = waterQualityPayload ? asList(waterQualityPayload.stations).filter(isRecord) : []
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
  const wastePlanPayload = payload('wastePlan')
  const wastePlan = isRecord(wastePlanPayload) ? wastePlanPayload : null
  const wasteSummary = wastePlan && isRecord(wastePlan.summary) ? wastePlan.summary : null
  const wasteBins = wastePlan ? asList(wastePlan.bins).filter(isRecord) : []
  const latestReport = isRecord(latestPayload) && isRecord(latestPayload.report) ? latestPayload.report : null
  const healthRaw = payload('health')
  const healthPayload = isRecord(healthRaw) ? healthRaw : null
  const forecastSource = asText(isRecord(forecastPayload) ? forecastPayload.source : null, 'ESTIMATED')
  const publicGridRaw = payload('publicGrid')
  const publicGridPayload: Record<string, unknown> | null = isRecord(publicGridRaw) ? publicGridRaw : null
  const publicGridSnapshot: Record<string, unknown> | null = publicGridPayload && isRecord(publicGridPayload.snapshot) ? publicGridPayload.snapshot : null
  const publicGridDaily: Record<string, unknown> | null = publicGridPayload && isRecord(publicGridPayload.daily) ? publicGridPayload.daily : null
  const formatGridValue = (value: unknown, digits = 1) => typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value)
    : '—'
  const demandSource = publicGridSnapshot?.has_data === false ? 'NO READING' : publicGridSnapshot?.source_type === 'official' ? 'OFFICIAL' : 'PUBLIC'
  const demandNote = publicGridSnapshot?.has_data === false
    ? tx('No current demand reading')
    : publicGridSnapshot && typeof publicGridSnapshot.age_minutes === 'number'
      ? `Grid reading · ${Math.round(publicGridSnapshot.age_minutes)} min old`
      : 'Latest public grid reading'
  const connected = Object.values(data).filter((item) => item.status === 'online').length
  const allConnected = connected === endpoints.length

  return showDashboard ? (
    <main className="app-shell">
      <Crosshair className="crosshair-overlay" color="#72c98a" opacity={0.58} thickness={1} smoothing={0.25} showCoordinates={false} targetSelector=".metric-card, .panel, button, a" targetEffect="lock" clickPulse />
      <div className="topography-backdrop" aria-hidden="true">
        <Topography
          color="#ffffff"
          lineCount={18}
          lineWidth={0.5}
          elevation={0.2}
          foreground={0.2}
          tilt={90}
          speed={0.09}
          direction="forward"
          glow={0.55}
          depthOfField={0}
          fog={0.63}
          hoverEffect="light"
          clickEffect="pulse"
          scale={1.25}
          detail={0.34}
          morph={0.28}
          brightness={0.55}
          markers="plus"
          mouseRadius={2.5}
          mouseStrength={0}
          parallax={1}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <header className="topbar">
        <a className="brand" href="#top" aria-label={tx('NRG home')}>
          <span className="brand-mark"><PulseIcon /></span>
          <span>NRG</span>
        </a>
        <div className="topbar-right">
          <label className="language-control"><span className="sr-only">{t('language')}</span><select aria-label={t('language')} value={language} onChange={(event) => { if (isLanguageCode(event.target.value)) setLanguage(event.target.value) }}>{Object.entries(languages).map(([code, item]) => <option key={code} value={code}>{item.label}</option>)}</select></label>
            <div className={`connection ${allConnected ? 'connection-good' : connected ? 'connection-partial' : 'connection-off'}`}>
            <span className="connection-dot" />
            {connected}/{endpoints.length} {tx('endpoints connected')}
          </div>
          <button className="refresh-button" type="button" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshIcon /> {refreshing ? t('refreshing') : t('refresh')}
          </button>
          <span className="avatar">TP</span>
        </div>
      </header>

      <div className="page-content" id="top">
        <section className="hero-row">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> {tx('AUTONOMOUS GRID OPTIMIZATION')}</div>
            <h1>{tx('Carbon, on a')}<br /><span>{tx('cleaner clock.')}</span></h1>
            <p className="hero-copy">{tx('Flexible demand, shifted into cleaner hours.')}<br className="desktop-break" /> {tx('A live view of your simulated grid fleet.')}</p>
          </div>
          <div className="hero-side">
            <div className="hero-status-row">
              <div className="live-pill"><span className="live-pulse" /> SYSTEM {healthPayload && healthPayload.status === 'ok' ? t('active') : t('connecting')}</div>
              <button className="theme-toggle" type="button" aria-pressed={isDarkMode} aria-label={isDarkMode ? tx('Switch to light mode') : tx('Switch to dark mode')} onClick={() => setIsDarkMode((current) => !current)}>
                <ThemeIcon dark={isDarkMode} /> <span>{isDarkMode ? t('light') : t('dark')}</span>
              </button>
              <a className="github-link" href="https://github.com/jasperwoodchuck/nrg" target="_blank" rel="noreferrer" aria-label="NRG on GitHub" title="NRG on GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.08c-3.1.68-3.76-1.32-3.76-1.32-.51-1.3-1.24-1.65-1.24-1.65-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15 1 .1.75 2.57 3.94 1.82.1-.72.39-1.21.7-1.49-2.47-.28-5.07-1.24-5.07-5.5 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.95 0 0 .94-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.11-1.45 3.05-1.15 3.05-1.15.61 1.53.23 2.67.11 2.95.72.78 1.15 1.78 1.15 3 0 4.27-2.6 5.21-5.08 5.49.4.34.76 1.02.76 2.06v3.05c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z"/></svg></a>
            </div>
            <label className="location-control">
              <span className="location-label"><LocationIcon /> {t('gridLocation')}</span>
              <select aria-label={tx('Dashboard location')} value={selectedLocationId} disabled={locationLoading} onChange={(event) => void changeLocation(event.target.value)}>
                {selectedLocationId === 'custom' && <option value="custom" disabled>{tx('Current custom location')}</option>}
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
              <span className="location-timezone">{tx('Timezone:')} {locationTimezone} <SourceBadge source={timezoneSource} /></span>
              <button className="map-open-button" type="button" disabled={locationLoading} onClick={() => { setMapPoint(locationPoint); setMapOpen(true) }}>{t('chooseMap')}</button>
              {locationError && <span className="location-error" role="alert">{locationError}</span>}
            </label>
          </div>
        </section>

        <nav ref={dashboardTabsRef} className="dashboard-tabs" role="tablist" aria-label={t('sections')}>
          <span className="dashboard-tab-indicator" aria-hidden="true" style={{ width: tabIndicator.width, transform: `translateX(${tabIndicator.left - 5}px)` }}><span key={activeDashboardTab} /></span>
          {dashboardTabs.map(([tab], index) => <button ref={(element) => { dashboardTabButtonsRef.current[index] = element }} key={tab} id={`dashboard-tab-${tab}`} className="dashboard-tab" type="button" role="tab" aria-selected={activeDashboardTab === tab} aria-controls={`dashboard-panel-${tab}`} tabIndex={activeDashboardTab === tab ? 0 : -1} onClick={() => setActiveDashboardTab(tab)} onKeyDown={(event) => {
            const currentIndex = dashboardTabs.findIndex(([item]) => item === tab)
            const nextIndex = event.key === 'ArrowRight' ? (currentIndex + 1) % dashboardTabs.length : event.key === 'ArrowLeft' ? (currentIndex - 1 + dashboardTabs.length) % dashboardTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? dashboardTabs.length - 1 : -1
            if (nextIndex >= 0) {
              event.preventDefault()
              const nextTab = dashboardTabs[nextIndex][0]
              setActiveDashboardTab(nextTab)
              document.getElementById(`dashboard-tab-${nextTab}`)?.focus()
            }
          }}>{t(tab)}</button>)}
        </nav>

        <div id="dashboard-panel-overview" className="dashboard-tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-overview" hidden={activeDashboardTab !== 'overview'}>
        <section className="metric-grid" aria-label={tx('Regional public power grid data')}>
          {publicGridPayload ? <>
            <MetricCard label={`${asText(publicGridSnapshot?.name, 'India').toUpperCase()} DEMAND`} value={formatGridValue(publicGridSnapshot?.demand_mw, 0)} unit="MW" note={demandNote} tone="green" icon={<BoltIcon />} badge={demandSource} />
            <MetricCard label={tx('ENERGY MET · DAILY')} value={formatGridValue(publicGridDaily?.energy_met_mu)} unit="MU" note={`${tx('Grid-India report')} · ${asText(publicGridDaily?.date)}`} tone="cream" icon={<GridIcon />} badge="GRID-INDIA" />
            <MetricCard label={tx('PEAK DEMAND MET')} value={formatGridValue(publicGridDaily?.peak_demand_met_mw, 0)} unit="MW" note={`${tx('Official daily report')} · ${asText(publicGridDaily?.date)}`} tone="lavender" icon={<SunIcon />} badge="GRID-INDIA" />
            <MetricCard label={tx('ENERGY SHORTAGE')} value={formatGridValue(publicGridDaily?.energy_shortage_mu)} unit="MU" note={`${tx('Reported daily shortage')} · ${asText(publicGridDaily?.date)}`} tone="blue" icon={<DropIcon />} badge="GRID-INDIA" />
          </> : <EmptyState language={language} state={data.publicGrid} label={tx('Public grid data')} />}
        </section>
        {publicGridPayload && <p className="public-grid-attribution">{tx('Demand:')} <a href="https://npp.gov.in/" target="_blank" rel="noreferrer">National Power Portal · MERIT</a> · {tx('Daily supply:')} <a href="https://grid-india.in/" target="_blank" rel="noreferrer">Grid-India</a> · {tx('data via')} <a href="https://www.energymap.in/developer/mcp/public" target="_blank" rel="noreferrer">India Energy Atlas</a>{selectedLocationId === 'custom' && customGridState ? <> · Region resolved with <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></> : selectedLocationId === 'custom' ? ` · ${tx('state not resolved for this map point; showing All India data')}` : ''}{publicGridPayload.stale === true ? ` · ${tx('showing cached data')}` : ''}</p>}

        <section className="panel scenario-panel" aria-labelledby="scenario-heading">
          <div className="scenario-intro">
            <div>
              <div className="section-kicker">{tx('GRID OPTIMIZATION SIMULATOR')}</div>
              <h2 id="scenario-heading">{tx('Turn the forecast into a plan')}</h2>
              <p>{tx('Estimate flexible appliance scheduling against lower-carbon hours in')} {selectedLocationId === 'custom' ? tx('your selected location') : locations.find((item) => item.id === selectedLocationId)?.name ?? tx('your selected location')}, {tx('using')} <a href="https://beeindia.gov.in/WriteReadData/L45218/2878513814676762.pdf" target="_blank" rel="noreferrer">{tx('BEE average Indian household electricity use')}</a>.</p>
            </div>
            <div className="scenario-controls">
              <label htmlFor="scenario-households">{t('virtualHomes')}</label>
              <select id="scenario-households" value={scenarioHouseholds} disabled={scenarioLoading} onChange={(event) => setScenarioHouseholds(Number(event.target.value))}>
                {[10, 30, 60, 100].map((count) => <option key={count} value={count}>{count} {tx('homes')}</option>)}
              </select>
              <button className="scenario-run-button" type="button" onClick={() => void runOptimizationScenario()} disabled={scenarioLoading || locationLoading}>
                {scenarioLoading ? t('optimizing') : scenarioResult ? t('runAgain') : t('runOptimization')}
              </button>
            </div>
          </div>
          {scenarioError && <div className="scenario-error" role="alert">{scenarioError}</div>}
          {scenarioResult && <div className="scenario-result" aria-live="polite">
            <div className="scenario-summary">
              <div className="scenario-impact"><span>{tx('ESTIMATED CO₂ AVOIDED')}</span><strong>{formatCo2Grams(scenarioResult.summary.co2_avoided_g)}</strong><small>{tx('Typical timing → optimized timing')}</small></div>
              <div><span>{tx('LOADS OPTIMIZED')}</span><strong>{scenarioResult.summary.loads_optimized} <small>/ {scenarioResult.summary.total_loads}</small></strong></div>
              <div><span>{tx('ENERGY SHIFTED')}</span><strong>{scenarioResult.summary.energy_shifted_kwh.toFixed(1)} <small>kWh</small></strong></div>
              <div><span>{tx('ENERGY CONSUMED')}</span><strong>{scenarioResult.summary.energy_consumed_kwh.toFixed(1)} <small>kWh</small></strong><small>{tx('Unchanged by scheduling')}</small></div>
            </div>
            <div className="scenario-emissions"><span>{tx('Baseline emissions')} <strong>{formatCo2Grams(scenarioResult.summary.baseline_co2_g)}</strong></span><span>{tx('Optimized emissions')} <strong>{formatCo2Grams(scenarioResult.summary.optimized_co2_g)}</strong></span></div>
            <div className="scenario-decisions-heading"><strong>{tx('Sample schedule changes')}</strong><span>{scenarioResult.summary.households} {tx('estimated homes')} · {tx('grid cap')} {scenarioResult.summary.max_concurrent_loads} {tx('simultaneous')} · {scenarioResult.summary.loads_limited_by_capacity} {tx('limited by capacity')} · {tx('peak')} {scenarioResult.summary.peak_concurrent_loads}</span></div>
            <div className="table-wrap scenario-table-wrap"><table className="scenario-table"><thead><tr><th>{tx('ESTIMATED LOAD')}</th><th>{tx('BASELINE TIME')}</th><th>{tx('OPTIMIZED TIME')}</th><th>{tx('CO₂ AVOIDED')}</th></tr></thead><tbody>
              {scenarioResult.decisions.slice(0, 8).map((item, index) => <tr key={`${item.household}-${item.load}-${index}`}><td><span className="device-name">{tx(formatKind(item.load))}</span><span className="scenario-house">{tx('Home')} {item.household}</span></td><td>{formatDate(item.baseline_time)}</td><td>{item.chosen_start ? formatDate(item.chosen_start) : tx('No feasible window')}</td><td className="saving-cell">{formatCo2Grams(item.saving_g)}</td></tr>)}
            </tbody></table></div>
            <p className="scenario-methodology">{scenarioResult.methodology} {tx('Forecast source:')} {scenarioResult.forecast_source}. {tx('Simulation only; no physical devices are controlled.')}</p>
          </div>}
        </section>
        </div>

        <div id="dashboard-panel-power" className="dashboard-tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-power" hidden={activeDashboardTab !== 'power'}>
        <section className="content-grid">
          <article className="panel forecast-panel">
              <div className="panel-heading">
              <div><div className="section-kicker">{tx('GRID CARBON FORECAST')}</div><h2>{tx('Cleaner hours ahead')}</h2></div>
              <div className="panel-heading-right"><SourceBadge source={forecastSource} /><span className="tiny-label">{tx('NEXT 24 HOURS')}</span></div>
            </div>
            <div className="chart-area">
              {nextDay.length ? <div className="bar-chart" role="group" aria-label="Hourly forecast carbon intensity bars" onMouseLeave={() => setHoveredForecastIndex(null)}>
                {nextDay.map((row, index) => {
                  const intensity = asNumber(row.intensity_gco2_kwh)
                  const height = Math.max(8, (intensity / maxIntensity) * 100)
                  const low = row.low_carbon_window === true
                  const isHovered = hoveredForecastIndex === index
                  const tooltipId = `forecast-tooltip-${index}`
                  return <div className="bar-column" key={`${String(row.timestamp)}-${index}`} tabIndex={0} aria-label={`${formatDate(row.timestamp)} · ${intensity.toFixed(1)} gCO₂/kWh${low ? ' · cleaner window' : ''}`} aria-describedby={isHovered ? tooltipId : undefined} onMouseEnter={() => setHoveredForecastIndex(index)} onFocus={() => setHoveredForecastIndex(index)} onBlur={() => setHoveredForecastIndex(null)}>
                    <div className={`bar ${low ? 'bar-low' : ''}`} style={{ height: `${height}%` }} />
                    {isHovered && <div className="forecast-bar-tooltip" id={tooltipId} role="tooltip"><strong>{formatDate(row.timestamp, { weekday: 'short', hour: 'numeric' })}</strong><span><i className="legend-standard"/>Grid intensity<b>{intensity.toFixed(1)} gCO₂/kWh</b></span>{low && <span><i className="legend-low"/>Cleaner window</span>}</div>}
                    {index % 3 === 0 && <span className="bar-label">{formatDate(row.timestamp, { hour: 'numeric' })}</span>}
                  </div>
                })}
              </div> : <EmptyState language={language} state={data.forecast} label={tx('Forecast data')} />}
              <div className="chart-legend"><span><i className="legend-dot legend-standard" /> {tx('Grid intensity')}</span><span><i className="legend-dot legend-low" /> {tx('Cleaner window')}</span><span className="chart-unit">{tx('gCO₂ / kWh')}</span></div>
            </div>
            <div className="forecast-stats">
              <div><span className="stat-label">{tx('CLEANEST HOUR')}</span><strong>{nextDay.length ? <>{Math.round(Math.min(...nextDay.map((row) => asNumber(row.intensity_gco2_kwh))))} <small>gCO₂/kWh</small></> : '—'}</strong></div>
              <div><span className="stat-label">{tx('FORECAST SOURCE')}</span><strong>{asText(isRecord(forecastPayload) ? forecastPayload.source : null, '—')}</strong></div>
              <div><span className="stat-label">{tx('HORIZON')}</span><strong>{forecastRows.length || '—'} <small>{tx('hours')}</small></strong></div>
            </div>
          </article>

          <article className="panel insights-panel">
              <div className="panel-heading"><div><div className="section-kicker">{tx('PULSE CHECK')}</div><h2>{tx('Grid insights')}</h2></div><span className="sparkle">✳</span></div>
            {insightRows.length ? <div className="insight-list">
              {insightRows.map((item, index) => <InsightItem key={`${String(item.type)}-${index}`} item={item} language={language} timeZone={locationTimezone} />)}
            </div> : <EmptyState language={language} state={data.insights} label={tx('Insights')} />}
            <div className="ai-insight">
              <div className="ai-insight-heading">
                <div className="ai-insight-title"><GeminiBrand /><span>{tx('AI GRID INSIGHT')}</span></div>
                <button className="refresh-button" type="button" onClick={() => void generateAiInsight()} disabled={aiInsightLoading}>
                  {aiInsightLoading ? tx('Generating…') : aiInsight ? tx('Regenerate') : tx('Generate insight')}
                </button>
              </div>
              {aiInsightError && <p className="ai-insight-error" role="alert">{aiInsightError}</p>}
              {aiInsight && <p className="ai-insight-copy" aria-live="polite">{aiInsight}</p>}
              <span className="ai-insight-note">{tx('AI-generated from simulated loads and forecast data.')}</span>
            </div>
            <div className="health-strip">
              <span className="health-icon"><PulseIcon /></span>
              <div><strong>{tx('Pipeline health')}</strong><span>{healthPayload?.scheduler === 'running' ? 'Scheduler running' : asText(healthPayload?.status, 'Waiting for API')}</span></div>
              <span className={`health-state ${healthPayload?.status === 'ok' ? 'state-ok' : 'state-wait'}`}>{healthPayload?.status === 'ok' ? 'HEALTHY' : 'CHECKING'}</span>
            </div>
          </article>
        </section>

        <section className="content-grid lower-grid">
          <article className="panel schedule-panel">
              <div className="panel-heading"><div><div className="section-kicker">{tx('AUTOMATED LOAD SHIFTING')}</div><h2>{tx('Schedule decisions')}</h2></div><span className="count-chip">{scheduleRows.length} decisions</span></div>
            {scheduleRows.length ? <div className="table-wrap"><table><thead><tr><th>{tx('VIRTUAL LOAD')}</th><th>{tx('BASELINE TIME')}</th><th>{tx('CHOSEN WINDOW')}</th><th>{tx('CARBON SAVED')}</th></tr></thead><tbody>
              {scheduleRows.slice(0, 6).map((item, index) => {
                const window = isRecord(item.chosen_window) ? item.chosen_window : null
                return <tr key={`${String(item.load_id)}-${index}`}><td><span className="device-icon"><DeviceIcon kind={asText(item.load)} /></span><span className="device-name">{tx(formatKind(item.load))}</span><span className="status-dot" title={asText(item.status)} /></td><td>{formatDate(item.baseline_time)}</td><td><strong>{formatDate(window?.start)}</strong><span className="duration"> · {asNumber(window?.duration_hours)}h</span></td><td className="saving-cell">{asNumber(item.saving_g).toFixed(0)} g</td></tr>
              })}
            </tbody></table></div> : <EmptyState language={language} state={data.schedule} label={tx('Schedule decisions')} />}
            <div className="panel-footnote"><span>↗</span> {tx('Energy use stays constant. Only the timing changes.')}</div>
          </article>

          <article className="panel fleet-panel">
              <div className="panel-heading"><div><div className="section-kicker">{tx('SIMULATED HOUSEHOLDS')}</div><h2>{tx('Flexible fleet')}</h2></div><span className="count-chip">{loadRows.length} {tx('devices')}</span></div>
            {loadRows.length ? <div className="fleet-list">{loadRows.slice(0, 7).map((item, index) => <div className="fleet-row" key={`${String(item.id)}-${index}`}>
              <span className="device-icon fleet-device"><DeviceIcon kind={asText(item.kind)} /></span><div className="fleet-main"><strong>{tx(formatKind(item.kind))}</strong><span>{tx('Home')} {asNumber(item.household)}</span></div><div className="fleet-meta"><strong>{asNumber(item.energy_kwh).toFixed(1)} <small>kWh</small></strong><span className={`tag tag-${asText(item.status, 'pending').toLowerCase()}`}>{asText(item.status, 'pending')}</span></div>
            </div>)}</div> : <EmptyState language={language} state={data.loads} label={tx('Virtual fleet')} />}
            <div className="fleet-foot"><span className="fleet-dot" /> {tx('All devices are virtual · no hardware connected')}</div>
          </article>
        </section>
        </div>

        <div id="dashboard-panel-usage" className="dashboard-tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-usage" hidden={activeDashboardTab !== 'usage'}>
          <section className="panel usage-panel" aria-labelledby="usage-heading">
            <div className="panel-heading"><div><div className="section-kicker">{tx('HOUSEHOLD POWER')}</div><h2 id="usage-heading">{tx('Analyze your electricity use')}</h2></div><span className="sparkle">✳</span></div>
            <p className="usage-intro">{tx('Enter the electricity use from your bill and the appliances you use. Gemini will analyze patterns; device energy is estimated from ratings and daily hours.')}</p>
            <form className="usage-form" onSubmit={(event) => void analyzeUsage(event)}>
              <div className="usage-inputs">
                <label>{tx('Electricity used')} (kWh)<input type="number" min="0.1" max="50000" step="0.1" required value={usageKwh} onChange={(event) => { setUsageKwh(event.target.value); setUsageAnalysis(null) }} /></label>
                <label>{tx('Billing period')} ({tx('days')})<input type="number" min="1" max="366" step="1" required value={usagePeriodDays} onChange={(event) => { setUsagePeriodDays(event.target.value); setUsageAnalysis(null) }} /></label>
                <label>{tx('Optional electricity tariff')}<span><input type="number" min="0.01" max="100" step="0.01" value={usageTariff} onChange={(event) => { setUsageTariff(event.target.value); setUsageAnalysis(null) }} placeholder={tx('INR per kWh')} /><small>₹/kWh</small></span></label>
              </div>
              <div className="usage-appliances-heading"><strong>{tx('Appliances you use')}</strong><button className="usage-add-button" type="button" onClick={addUsageAppliance}>＋ {tx('Add an appliance')}</button></div>
              <datalist id="usage-appliance-types">{commonAppliances.map((item) => <option key={item.name} value={item.name} label={tx(item.name)} />)}</datalist>
              <div className="usage-appliance-list">
                {usageAppliances.map((appliance) => <div className="usage-appliance-row" key={appliance.id}>
                  <label>{tx('Appliance')}<input list="usage-appliance-types" required placeholder={tx('Choose an appliance or enter a custom name')} value={appliance.name} onChange={(event) => updateUsageAppliance(appliance.id, 'name', event.target.value)} /></label>
                  <label>{tx('Rated power')} (W)<input type="number" min="1" max="20000" step="1" required value={appliance.ratedWatts} onChange={(event) => updateUsageAppliance(appliance.id, 'ratedWatts', event.target.value)} /></label>
                  <label>{tx('Quantity')}<input type="number" min="1" max="100" step="1" required value={appliance.quantity} onChange={(event) => updateUsageAppliance(appliance.id, 'quantity', event.target.value)} /></label>
                  <label>{tx('Hours per day')}<input type="number" min="0" max="24" step="0.1" required value={appliance.hoursPerDay} onChange={(event) => updateUsageAppliance(appliance.id, 'hoursPerDay', event.target.value)} /></label>
                  <button className="usage-remove-button" type="button" aria-label={`${tx('Remove')} ${tx(appliance.name)}`} onClick={() => { setUsageAppliances((current) => current.filter((item) => item.id !== appliance.id)); setUsageAnalysis(null) }}>×</button>
                </div>)}
                {!usageAppliances.length && <p className="usage-no-appliances">{tx('Add the appliances you use to get an estimated breakdown.')}</p>}
              </div>
              <button className="mobility-submit usage-submit" type="submit" disabled={usageLoading || !usageAppliances.length}><GeminiMark />{usageLoading ? tx('Analyzing…') : tx('Analyze with Gemini')}</button>
            </form>
            {usageError && <p className="mobility-error" role="alert">{usageError}</p>}
            {usageAnalysis && <div className="usage-result" aria-live="polite">
              <div className="usage-stat-grid">
                <div><span>{tx('Average per day')}</span><strong>{usageAnalysis.statistics.daily_average_kwh.toLocaleString(languages[language].locale, { maximumFractionDigits: 2 })} <small>kWh</small></strong></div>
                <div><span>{tx('Appliance estimate')}</span><strong>{usageAnalysis.statistics.estimated_appliance_kwh.toLocaleString(languages[language].locale, { maximumFractionDigits: 2 })} <small>kWh</small></strong><small>{usageAnalysis.statistics.estimated_appliance_percent_of_meter.toLocaleString(languages[language].locale, { maximumFractionDigits: 1 })}% {tx('share of meter use')}</small></div>
                <div><span>{tx('Estimated emissions')}</span><strong>{usageAnalysis.statistics.estimated_co2_kg.toLocaleString(languages[language].locale, { maximumFractionDigits: 2 })} <small>kgCO₂</small></strong><small>{tx('Grid-average factor')}: {usageAnalysis.statistics.emission_factor_gco2_per_kwh} gCO₂/kWh</small></div>
                {usageAnalysis.statistics.estimated_cost_inr !== null && <div><span>{tx('Estimated bill')}</span><strong>₹{usageAnalysis.statistics.estimated_cost_inr.toLocaleString(languages[language].locale, { maximumFractionDigits: 2 })}</strong></div>}
              </div>
              <div className="usage-analysis-copy"><div className="usage-analysis-title"><GeminiBrand /><span className="section-kicker">{tx('ENERGY ANALYSIS')}</span></div><p>{usageAnalysis.analysis}</p></div>
              <div className="usage-breakdown"><h3>{tx('Appliance energy estimates')}</h3><div>{usageAnalysis.statistics.appliances.map((item, index) => <div key={`${item.name}-${index}`}><span>{tx(item.name)} · {item.quantity} × {item.rated_watts}W</span><strong>{item.estimated_kwh.toLocaleString(languages[language].locale, { maximumFractionDigits: 2 })} kWh</strong></div>)}</div></div>
              <p className="usage-footnote">{tx('Appliance energy is estimated from rated power and daily hours, and may not match meter readings.')} {usageAnalysis.statistics.appliance_overage_kwh > 0 ? `${tx('Appliance estimates exceed meter by')} ${usageAnalysis.statistics.appliance_overage_kwh.toLocaleString(languages[language].locale, { maximumFractionDigits: 2 })} kWh.` : `${tx('Unallocated consumption')}: ${usageAnalysis.statistics.unaccounted_kwh.toLocaleString(languages[language].locale, { maximumFractionDigits: 2 })} kWh.`}</p>
            </div>}
          </section>
        </div>

        <div id="dashboard-panel-weather" className="dashboard-tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-weather" hidden={activeDashboardTab !== 'weather'}>
        <section className="weather-panel panel" aria-labelledby="weather-heading">
          <div className="panel-heading">
            <div><div className="section-kicker">{tx('OPEN-METEO WEATHER')}</div><h2 id="weather-heading">{tx('Conditions by time scale')}</h2></div>
            <div className="panel-heading-right"><SourceBadge source={asText(weatherPayload?.source, 'ESTIMATED')} /><span className="tiny-label">{asText(weatherPayload?.resolution, weatherMode)}</span></div>
          </div>
          <div className="weather-controls" role="tablist" aria-label={tx('Weather data resolution')}>
            {(['realtime', 'hourly', 'daily'] as const).map((mode) => <button key={mode} type="button" role="tab" aria-selected={weatherMode === mode} className={weatherMode === mode ? 'weather-tab weather-tab-active' : 'weather-tab'} onClick={() => setWeatherMode(mode)}>{mode === 'realtime' ? tx('15-minute') : tx(mode)}</button>)}
          </div>
          {typeof weatherPayload?.note === 'string' && <p className="weather-note">{asText(weatherPayload.note)}</p>}
          {weatherRows.length ? <div className="weather-table-wrap"><table className="weather-table"><thead><tr><th>TIME ({asText(weatherPayload?.timezone, 'local')})</th>{Object.keys(isRecord(weatherRows[0].values) ? weatherRows[0].values : {}).map((key) => <th key={key}>{formatKind(key)}</th>)}</tr></thead><tbody>
            {weatherRows.slice(0, weatherMode === 'daily' ? 7 : weatherMode === 'realtime' ? 16 : 24).map((row, index) => {
              const values = isRecord(row.values) ? row.values : {}
              return <tr key={`${String(row.timestamp)}-${index}`}><td>{formatDate(row.timestamp, weatherMode === 'daily' ? { month: 'short', day: 'numeric' } : { hour: 'numeric', minute: '2-digit' })}</td>{Object.entries(values).map(([key, value]) => <td key={key}>{typeof value === 'number' ? value.toLocaleString(languages[language].locale, { maximumFractionDigits: 1 }) : asText(value == null ? null : String(value))}{typeof weatherPayload?.units === 'object' && weatherPayload.units !== null && key in weatherPayload.units ? ` ${String((weatherPayload.units as Record<string, unknown>)[key])}` : ''}</td>)}</tr>
            })}
          </tbody></table></div> : <EmptyState language={language} state={weatherView} label={tx('Open-Meteo weather')} />}
          <div className="weather-meta">{weatherPayload?.fetched_at ? `Fetched ${formatDate(weatherPayload.fetched_at, { hour: 'numeric', minute: '2-digit' })}` : tx('Waiting for weather data')} · {tx('Powered by')} Open-Meteo</div>
          <div className="load-series-heading"><div><div className="section-kicker">{tx('SIMULATED ENERGY')}</div><h3>{tx('Load against baseline')}</h3><p>Illustrative household demand · {tx(loadSeriesStep)} {tx('samples across')} {tx(loadSeriesWindow)}</p></div><SourceBadge source="SIMULATED" /></div>
          <div className="load-series-chart" role="img" aria-label={`Simulated actual household load and baseline with ${loadSeriesStep} samples across ${loadSeriesWindow}, in kilowatts`}>
            <div className="load-series-axis"><span>120</span><span>80</span><span>40</span><span>0</span></div>
            <svg viewBox="0 0 960 180" preserveAspectRatio="none" aria-hidden="true" onPointerMove={handleLoadPointerMove} onPointerLeave={() => setHoveredLoadPoint(null)}>
              <defs><linearGradient id="load-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#4b9d73" stopOpacity=".28"/><stop offset="100%" stopColor="#4b9d73" stopOpacity=".02"/></linearGradient></defs>
              <path className="load-baseline-line" d={profilePath(loadSeries, 'baseline', 960, 180)} />
              <path className="load-actual-area" d={`${profilePath(loadSeries, 'actual', 960, 180)} L 960 180 L 0 180 Z`} />
              <path className="load-actual-line" d={profilePath(loadSeries, 'actual', 960, 180)} />
              {hoveredLoadPoint && <><line className="load-hover-guide" x1={(hoveredLoadPoint.index / (loadSeries.length - 1)) * 960} x2={(hoveredLoadPoint.index / (loadSeries.length - 1)) * 960} y1="0" y2="180"/><circle className="load-hover-dot" cx={(hoveredLoadPoint.index / (loadSeries.length - 1)) * 960} cy={180 - (loadSeries[hoveredLoadPoint.index].actual / 120) * 180} r="5"/></>}
            </svg>
            {hoveredLoadPoint && <div className={`load-series-tooltip${hoveredLoadPoint.below ? ' load-series-tooltip-below' : ''}`} style={{ left: `${hoveredLoadPoint.x}px`, top: `${hoveredLoadPoint.y}px` }}><strong>{loadTooltipTime(hoveredLoadPoint.index)}</strong><span><i className="load-legend-actual"/>{tx('Actual kW')}<b>{loadSeries[hoveredLoadPoint.index].actual.toFixed(2)}</b></span><span><i className="load-legend-baseline"/>{tx('Baseline kW')}<b>{loadSeries[hoveredLoadPoint.index].baseline.toFixed(2)}</b></span></div>}
          </div>
          <div className="load-series-footer"><div className="load-series-legend"><span><i className="load-legend-actual"/>{tx('Actual kW')}</span><span><i className="load-legend-baseline"/>{tx('Baseline kW')}</span></div><div className="load-series-ticks">{(weatherMode === 'daily' ? ['7 days ago', '5 days', '3 days', 'Yesterday', 'Today'] : ['48h ago', '36h', '24h', '12h', 'Now']).map((tick) => <span key={tick}>{tx(tick)}</span>)}</div></div>
        </section>
        </div>

        <div id="dashboard-panel-environment" className="dashboard-tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-environment" hidden={activeDashboardTab !== 'environment'}>
        <section className="environment-grid" aria-label={tx('Environmental monitoring')}>
          <article className="panel environment-panel air-quality-panel">
            <div className="panel-heading"><div><div className="section-kicker">{tx('MODELED AIR QUALITY')}</div><h2>{tx('Air quality outlook')}</h2></div><button className="monitor-refresh" type="button" onClick={() => void refreshEnvironmentalData()} disabled={environmentRefreshing}>{environmentRefreshing ? 'Updating…' : 'Refresh'}</button></div>
            {airQualityPayload && airCurrent ? <>
              <div className="air-current-grid">
                {[['PM2.5', 'pm2_5'], ['PM10', 'pm10'], ['NO₂', 'nitrogen_dioxide'], ['O₃', 'ozone']].map(([label, key]) => <div key={key}><span>{label}</span><strong>{typeof airCurrent[key] === 'number' ? asNumber(airCurrent[key]).toFixed(1) : '—'}<small> {asText(airUnits?.[key], 'μg/m³')}</small></strong></div>)}
              </div>
              <div className="environment-subheading"><strong>{tx('Next 12 hours')}</strong><span>{tx('Model forecast · not sensor readings')}</span></div>
              <div className="table-wrap environment-table-wrap"><table className="environment-table"><thead><tr><th>{tx('TIME')}</th><th>PM2.5</th><th>PM10</th><th>NO₂</th><th>O₃</th></tr></thead><tbody>
                {airRows.slice(0, 12).map((row, index) => <tr key={`${String(row.timestamp)}-${index}`}><td>{formatDate(row.timestamp)}</td>{['pm2_5', 'pm10', 'nitrogen_dioxide', 'ozone'].map((key) => <td key={key}>{typeof row[key] === 'number' ? asNumber(row[key]).toFixed(1) : '—'}</td>)}</tr>)}
              </tbody></table></div>
              <p className="environment-note">{asText(airQualityPayload.note)} · <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noreferrer">Open-Meteo / Copernicus CAMS</a></p>
            </> : <EmptyState language={language} state={airQualityView} label={tx('Air-quality forecast')} />}
          </article>

          <article className="panel environment-panel water-quality-panel">
              <div className="panel-heading"><div><div className="section-kicker">{tx('CPCB SURFACE WATER')}</div><h2>{tx('Nearby sampling stations')}</h2></div><select aria-label={tx('Water quality region')} value={waterRegion} onChange={(event) => setWaterRegion(event.target.value)} disabled={!waterRegions.length || environmentRefreshing}>{(waterRegions.length ? waterRegions : ['West Bengal']).map((region) => <option key={region} value={region}>{region}</option>)}</select></div>
            <p className="water-data-note">{tx('Historical manual samples in')} {asText(waterQualityPayload?.region, waterRegion)} · {tx('within')} {asNumber(waterQualityPayload?.radius_km, 100)} km</p>
            {waterStations.length ? <div className="water-station-list">{waterStations.slice(0, 5).map((station, index) => {
              const parameters = asList(station.parameters).filter(isRecord)
              return <article className="water-station" key={`${String(station.station)}-${index}`}>
                <div className="water-station-heading"><div><strong>{asText(station.station, 'CPCB station')}</strong><span>{asText(station.waterbody, asText(station.district, 'Surface water'))} · {asNumber(station.distance_km).toFixed(1)} km</span></div><time>{formatDate(station.sampled_at, { year: 'numeric', month: 'short', day: 'numeric' })}</time></div>
                <div className="water-parameter-list">{parameters.map((parameter) => <span key={String(parameter.name)}>{asText(parameter.name)} <strong>{asNumber(parameter.value).toLocaleString(languages[language].locale, { maximumFractionDigits: 2 })}</strong> {asText(parameter.unit)}</span>)}</div>
              </article>
            })}</div> : waterQualityPayload ? <div className="water-empty-note">{asText(waterQualityPayload.note, 'No nearby water samples are available.')}</div> : <EmptyState language={language} state={waterQualityView} label={tx('CPCB water-quality data')} />}
            {waterQualityPayload && <p className="environment-note">{asText(waterQualityPayload.note)} · <a href="https://nwdp.nwic.gov.in/en/dataset/surface-water-quality-manual-chemical-parameters-cpcb" target="_blank" rel="noreferrer">National Water Data Portal · CPCB</a></p>}
          </article>
        </section>

        <section className="content-grid waste-grid" aria-label="Simulated waste collection automation">
          <article className="panel waste-panel">
            <div className="panel-heading"><div><div className="section-kicker">{tx('SIMULATED WASTE MANAGEMENT')}</div><h2>{tx('Priority collection plan')}</h2></div><SourceBadge source={asText(wastePlan?.source, 'SIMULATED')} /></div>
            {wasteSummary ? <>
              <p className="waste-plan-note">{asText(wastePlan?.methodology)} {tx('This is a demonstration model; readings are not connected to physical bins.')}</p>
              <div className="waste-summary">
                <div><span>{tx('PLANNED PICKUPS')}</span><strong>{asNumber(wasteSummary.pickups_planned)} <small>/ {asNumber(wasteSummary.pickups_recommended)} {tx('recommended')}</small></strong></div>
                <div><span>{tx('WASTE ON ROUTE')}</span><strong>{asNumber(wasteSummary.planned_waste_kg).toFixed(1)} <small>kg</small></strong></div>
                <div><span>{tx('OVERFLOW RISK')}</span><strong>{asNumber(wasteSummary.projected_overflow_risk_after)} <small>{tx('bins after')} · {asNumber(wasteSummary.projected_overflow_risk_before)} {tx('before')}</small></strong></div>
              </div>
              <div className="table-wrap waste-table-wrap"><table className="waste-table"><thead><tr><th>{tx('BIN / ZONE')}</th><th>{tx('FILL NOW')}</th><th>{tx('PROJECTED 12H')}</th><th>{tx('EST. WASTE')}</th><th>{tx('ROUTE')}</th></tr></thead><tbody>
                {wasteBins.map((bin) => <tr key={asText(bin.id)}><td><strong>{asText(bin.id)}</strong><span className="waste-zone">{asText(bin.zone)}</span></td><td>{asNumber(bin.fill_percent)}%</td><td>{asNumber(bin.projected_fill_12h)}%</td><td>{asNumber(bin.estimated_waste_kg).toFixed(1)} kg</td><td><span className={bin.selected === true ? 'waste-status waste-selected' : bin.pickup_recommended === true ? 'waste-status waste-deferred' : 'waste-status'}>{bin.selected === true ? tx('PICKUP') : bin.pickup_recommended === true ? tx('CAPACITY LIMITED') : tx('MONITOR')}</span></td></tr>)}
              </tbody></table></div>
              <p className="environment-note">{asNumber(wasteSummary.bins_monitored)} {tx('simulated bins')} · {asNumber(wastePlan?.truck_capacity_kg)} kg {tx('vehicle capacity')} · {tx('priority threshold projected at')} 80%</p>
            </> : <EmptyState language={language} state={data.wastePlan} label={tx('Waste collection plan')} />}
          </article>
        </section>
        </div>

        <div id="dashboard-panel-mobility" className="dashboard-tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-mobility" hidden={activeDashboardTab !== 'mobility'}>
          <section className="content-grid mobility-grid">
            <article className="panel mobility-panel" aria-labelledby="mobility-heading">
              <div className="panel-heading"><div><div className="section-kicker">{tx('SUSTAINABLE MOBILITY')}</div><h2 id="mobility-heading">{tx('Compare your weekly commute')}</h2></div><SourceBadge source="ESTIMATED" /></div>
              <p className="mobility-intro">{tx('Estimate commute emissions for one-way distance and days travelled, then compare a travel mode with a solo petrol-car baseline.')}</p>
              <form className="mobility-form" onSubmit={(event) => void runMobilityEstimate(event)}>
                <label>{tx('One-way distance')} <span><input type="number" min="0.1" max="500" step="0.1" required value={mobilityDistance} onChange={(event) => setMobilityDistance(event.target.value)} /> {tx('km')}</span></label>
                <label>{tx('Commute days each week')} <select value={mobilityDays} onChange={(event) => setMobilityDays(Number(event.target.value))}>{Array.from({ length: 7 }, (_, index) => index + 1).map((days) => <option key={days} value={days}>{days} {tx('days')}</option>)}</select></label>
                <label>{tx('Travel mode')} <select value={mobilityMode} onChange={(event) => setMobilityMode(event.target.value)}><option value="local_bus">{tx('Local bus')}</option><option value="national_rail">{tx('National rail')}</option><option value="motorbike">{tx('Motorbike')}</option><option value="electric_car">{tx('Battery electric car')}</option><option value="petrol_car">{tx('Petrol car')}</option></select></label>
                <button className="mobility-submit" type="submit" disabled={mobilityLoading}>{mobilityLoading ? tx('Calculating…') : tx('Calculate weekly impact')}</button>
              </form>
              {mobilityError && <p className="mobility-error" role="alert">{mobilityError}</p>}
              {mobilityEstimate && <div className="mobility-result" aria-live="polite">
                <div className="mobility-result-highlight"><span>{mobilityEstimate.net_reduction_kgco2e_per_week >= 0 ? tx('ESTIMATED REDUCTION') : tx('ESTIMATED INCREASE')}</span><strong>{Math.abs(mobilityEstimate.net_reduction_kgco2e_per_week).toFixed(2)} <small>kgCO₂e / {tx('week')}</small></strong><p>{tx('Compared with')} {tx(mobilityEstimate.baseline.mode_name.toLowerCase())} {tx('for the same commute.')}</p></div>
                <div className="mobility-result-grid"><div><span>{tx('SOLO PETROL-CAR BASELINE')}</span><strong>{mobilityEstimate.baseline.emissions_kgco2e_per_week.toFixed(2)} <small>kgCO₂e / {tx('week')}</small></strong></div><div><span>{mobilityEstimate.selected.mode_name.toUpperCase()}</span><strong>{mobilityEstimate.selected.emissions_kgco2e_per_week.toFixed(2)} <small>kgCO₂e / {tx('week')}</small></strong><small>{tx('Factor basis:')} {mobilityEstimate.selected.factor_basis}</small></div></div>
                <p className="mobility-methodology">{mobilityEstimate.methodology}</p>
                <p className="environment-note">{tx('Factors:')} <a href={mobilityEstimate.factor_source_url} target="_blank" rel="noreferrer">{mobilityEstimate.factor_source}</a>. {tx('These are indicative estimates, not measured trip emissions.')}</p>
              </div>}
            </article>
          </section>
        </div>

        <div id="dashboard-panel-reports" className="dashboard-tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-reports" hidden={activeDashboardTab !== 'reports'}>
        <section className="content-grid report-grid">
          <article className="panel report-panel">
              <div className="panel-heading"><div><div className="section-kicker">{tx('DAILY AUTOGENERATED BRIEF')}</div><h2>{tx('Latest report')}</h2></div><span className="report-mark"><ReportIcon /></span></div>
            {latestReport ? <><p className="report-copy">{asText(latestReport.body, 'Report is empty.')}</p><div className="report-meta"><span>{formatDate(latestReport.created_at, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><SourceBadge source={asText(latestReport.source, 'SIMULATED')} /></div></> : <EmptyState language={language} state={data.latestReport} label={tx('Latest report')} />}
          </article>
          <article className="panel report-history-panel">
              <div className="panel-heading"><div><div className="section-kicker">{tx('REPORT ARCHIVE')}</div><h2>{tx('Recent reports')}</h2></div><span className="count-chip">{reportsRows.length} reports</span></div>
            {reportsRows.length ? <div className="report-history">{reportsRows.slice(0, 4).map((item, index) => <button className="history-row" type="button" key={`${String(item.created_at)}-${index}`} aria-label={`${tx('Open report from')} ${formatDate(item.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`} onClick={() => setSelectedReport(item)}><span className="history-icon"><ReportIcon /></span><div><strong>{formatDate(item.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong><span>{asText(item.body, 'Daily grid summary')}</span></div><span className="history-arrow" aria-hidden="true">↗</span></button>)}</div> : <EmptyState language={language} state={data.reports} label={tx('Reports')} />}
          </article>
        </section>
        </div>

        <footer className="page-footer"><span>NRG <b>·</b> {tx('Autonomous Grid Carbon Optimizer')}</span><span>{lastUpdated ? `${tx('Updated')} ${formatDate(lastUpdated.toISOString())}` : tx('Connecting to API')} <b>·</b> <a href={`${API_BASE.replace('/api/v1', '')}/docs`} target="_blank" rel="noreferrer">{tx('API docs ↗')}</a></span></footer>
      </div>
      <dialog className="report-dialog" ref={reportDialogRef} aria-labelledby="report-dialog-title" onClose={() => setSelectedReport(null)}>
        {selectedReport && <div className="report-dialog-content">
          <div className="location-dialog-heading"><div><div className="section-kicker">{tx('REPORT ARCHIVE')}</div><h2 id="report-dialog-title">{tx('Report details')}</h2></div><button className="report-dialog-close" type="button" aria-label={tx('Close report')} onClick={() => setSelectedReport(null)}>×</button></div>
          <div className="report-dialog-meta"><span>{formatDate(selectedReport.created_at, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><SourceBadge source={asText(selectedReport.source, 'SIMULATED')} /></div>
          <p className="report-dialog-body">{asText(selectedReport.body, 'Report is empty.')}</p>
        </div>}
      </dialog>
      <dialog className="location-dialog" ref={locationDialogRef} aria-labelledby="location-dialog-title" onClose={() => setMapOpen(false)}>
        <div className="location-dialog-content">
          <div className="location-dialog-heading"><div><div className="section-kicker">{tx('GRID LOCATION')}</div><h2 id="location-dialog-title">{tx('Choose a point on the map')}</h2></div><button className="report-dialog-close" type="button" aria-label={tx('Close map')} onClick={() => setMapOpen(false)}>×</button></div>
          <p className="location-map-help">{tx('Click the map, or paste a Zoom Earth map URL to import its map center. Open-Meteo resolves the IANA timezone when you apply the point.')}</p>
          <div className="zoom-earth-import"><label htmlFor="zoom-earth-url">{tx('ZOOM EARTH MAP URL')}</label><div><input id="zoom-earth-url" type="url" value={zoomEarthUrl} onChange={(event) => setZoomEarthUrl(event.target.value)} placeholder="https://zoom.earth/maps/satellite/#view=..." /><button type="button" onClick={importZoomEarthLocation}>{tx('Import')}</button></div>{zoomEarthError && <span role="alert">{zoomEarthError}</span>}</div>
          {mapOpen && <LocationPicker point={mapPoint} onSelect={setMapPoint} />}
          <div className="location-map-footer"><span>{mapPoint.latitude.toFixed(4)}, {mapPoint.longitude.toFixed(4)}</span><a href={`https://zoom.earth/maps/satellite/#view=${mapPoint.latitude.toFixed(4)},${mapPoint.longitude.toFixed(4)},6z`} target="_blank" rel="noreferrer">{tx('View this point in Zoom Earth ↗')}</a></div>
          {locationError && <span className="location-error" role="alert">{locationError}</span>}
          <button className="map-apply-button" type="button" disabled={locationLoading} onClick={() => void applyMapLocation()}>{locationLoading ? t('resolving') : t('applyLocation')}</button>
        </div>
      </dialog>
    </main>
  ) : (
    <main className="location-start-shell">
      <div className="topography-backdrop" aria-hidden="true">
        <Topography
          color="#ffffff"
          lineCount={18}
          lineWidth={0.5}
          elevation={0.2}
          foreground={0.2}
          tilt={90}
          speed={0.09}
          direction="forward"
          glow={0.55}
          depthOfField={0}
          fog={0.63}
          hoverEffect="light"
          clickEffect="pulse"
          scale={1.25}
          detail={0.34}
          morph={0.28}
          brightness={0.55}
          markers="plus"
          mouseRadius={2.5}
          mouseStrength={0}
          parallax={1}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <header className="location-start-header"><a className="brand" href="#location-start" aria-label={tx('NRG home')}><span className="brand-mark"><PulseIcon /></span><span>NRG</span></a><label className="language-control"><span className="sr-only">{t('language')}</span><select aria-label={t('language')} value={language} onChange={(event) => { if (isLanguageCode(event.target.value)) setLanguage(event.target.value) }}>{Object.entries(languages).map(([code, item]) => <option key={code} value={code}>{item.label}</option>)}</select></label><span>{t('setup')}</span></header>
      <section className="location-start-content" id="location-start">
        <div className="eyebrow"><span className="eyebrow-line" /> {t('firstLocation')}</div>
        <h1>{t('chooseWhere')}<br /><span>{t('gridLives')}</span></h1>
        <p className="location-start-copy">{tx('Select a point on the map or import its position from Zoom Earth. We’ll resolve the timezone, save your location, and then load the dashboard.')}</p>
        <div className="location-start-map-card">
          <div className="zoom-earth-import"><label htmlFor="startup-zoom-earth-url">{tx('ZOOM EARTH MAP URL')}</label><div><input id="startup-zoom-earth-url" type="url" value={zoomEarthUrl} onChange={(event) => setZoomEarthUrl(event.target.value)} placeholder="https://zoom.earth/maps/satellite/#view=..." /><button type="button" onClick={importZoomEarthLocation}>{tx('Import')}</button></div>{zoomEarthError && <span role="alert">{zoomEarthError}</span>}</div>
          <LocationPicker point={mapPoint} onSelect={setMapPoint} />
          <div className="location-start-map-footer"><span>{mapPoint.latitude.toFixed(4)}, {mapPoint.longitude.toFixed(4)} · saved zone: {locationTimezone}</span><a href={`https://zoom.earth/maps/satellite/#view=${mapPoint.latitude.toFixed(4)},${mapPoint.longitude.toFixed(4)},6z`} target="_blank" rel="noreferrer">{tx('Open selected point in Zoom Earth ↗')}</a></div>
          {locationError && <p className="location-start-error" role="alert">{locationError}</p>}
          <button className="location-start-submit" type="button" disabled={locationLoading} onClick={() => void applyMapLocation(true)}>{locationLoading ? 'Loading saved location…' : 'Resolve timezone & open dashboard'}</button>
        </div>
      </section>
      <footer className="location-start-footer">NRG · {tx('Automated forecasts begin after location setup')}</footer>
    </main>
  )
}

function MetricCard({ label, value, unit, note, tone, icon, badge }: { label: string; value: string; unit: string; note: string; tone: string; icon: ReactNode; badge: string }) {
  return <article className={`metric-card metric-${tone}`}><div className="metric-card-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-bottom"><span>{note}</span><SourceBadge source={badge} /></div></article>
}

function InsightItem({ item, language, timeZone }: { item: Record<string, unknown>; language: LanguageCode; timeZone: string }) {
  const tx = (text: string) => translateText(language, text)
  const type = asText(item.type)
  if (type === 'biggest_saving') return <div className="insight-item"><span className="insight-icon insight-green"><LeafIcon /></span><div><span>{tx('BIGGEST SAVING')}</span><strong>{asNumber(item.saving_g).toFixed(0)} gCO₂ <small>· load #{asText(item.load_id, '—')}</small></strong></div></div>
  if (type === 'cleanest_window_tomorrow') return <div className="insight-item"><span className="insight-icon insight-yellow"><SunIcon /></span><div><span>{tx('CLEANEST WINDOW · TOMORROW')}</span><strong>{formatTime(item.timestamp, undefined, languages[language].locale, timeZone)} <small>· {item.intensity_gco2_kwh == null ? '—' : `${Math.round(asNumber(item.intensity_gco2_kwh))} gCO₂/kWh`}</small></strong></div></div>
  return <div className="insight-item"><span className="insight-icon insight-orange"><BoltIcon /></span><div><span>{tx('HIGHEST INTENSITY FORECAST')}</span><strong>{formatTime(item.timestamp, undefined, languages[language].locale, timeZone)} <small>· {item.intensity_gco2_kwh == null ? '—' : `${Math.round(asNumber(item.intensity_gco2_kwh))} gCO₂/kWh`}</small></strong></div></div>
}

function EmptyState({ state, label, language }: { state: ViewState; label: string; language: LanguageCode }) {
  const tx = (text: string) => translateText(language, text)
  if (state.status === 'loading') return <div className="empty-state"><span className="loading-spinner" /> {tx('Loading')} {label.toLowerCase()}…</div>
  if (state.status === 'error') return <div className="empty-state empty-error"><strong>{label} {tx('unavailable')}</strong><span>{state.error}. {tx('Check the API and CORS settings.')}</span></div>
  return <div className="empty-state">{tx('No')} {label.toLowerCase()} {tx('available yet')}.</div>
}

function SourceBadge({ source }: { source: string }) {
  const normalized = source.toLowerCase()
  if (normalized === 'simulated') return null
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

function GeminiBrand() {
  return <span className="gemini-brand"><GeminiMark /><span>Gemini</span></span>
}

function GeminiMark() {
  const gradientId = useId().replaceAll(':', '')
  return <svg className="gemini-mark" viewBox="0 0 24 24" aria-hidden="true">
    <defs><linearGradient id={gradientId} x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse"><stop stopColor="#4285F4" /><stop offset=".52" stopColor="#9B72CB" /><stop offset="1" stopColor="#D96570" /></linearGradient></defs>
    <path d="M12 1C14.4 7.6 16.4 9.6 23 12 16.4 14.4 14.4 16.4 12 23 9.6 16.4 7.6 14.4 1 12 7.6 9.6 9.6 7.6 12 1Z" fill={`url(#${gradientId})`} />
  </svg>
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
function LocationIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.6" /></svg> }
function ThemeIcon({ dark }: { dark: boolean }) { return dark ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg> : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg> }

export default App
