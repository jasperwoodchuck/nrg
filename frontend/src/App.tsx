import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Crosshair from './component/Crosshair.jsx'
import LocationPicker, { type LocationPoint } from './component/LocationPicker'
import Topography from './component/Topography.jsx'
import './App.css'

type Metric = { value: number; unit: string; source: string }
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
  { key: 'wastePlan', path: '/environment/waste/collection-plan', label: 'Waste collection plan' },
] as const

type EndpointKey = (typeof endpoints)[number]['key']
type DashboardState = Record<EndpointKey, ViewState>

const initialState = Object.fromEntries(endpoints.map(({ key }) => [key, { payload: null, status: 'loading' }])) as DashboardState

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

function formatCo2Grams(grams: number): string {
  return Math.abs(grams) >= 1000 ? `${(grams / 1000).toFixed(2)} kgCO₂` : `${grams.toFixed(0)} gCO₂`
}

function formatTime(value: unknown, options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }): string {
  if (typeof value !== 'string') return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, options).format(date)
}

function App() {
  const [showDashboard, setShowDashboard] = useState(false)
  const [activeDashboardTab, setActiveDashboardTab] = useState<'overview' | 'power' | 'weather' | 'environment' | 'reports'>('overview')
  const [data, setData] = useState<DashboardState>(initialState)
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null)
  const [scenarioHouseholds, setScenarioHouseholds] = useState(30)
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<Record<string, unknown> | null>(null)
  const reportDialogRef = useRef<HTMLDialogElement>(null)
  const [weatherMode, setWeatherMode] = useState<'realtime' | 'hourly' | 'daily'>('hourly')
  const [weatherView, setWeatherView] = useState<ViewState>({ payload: null, status: 'loading' })
  const [airQualityView, setAirQualityView] = useState<ViewState>({ payload: null, status: 'loading' })
  const [waterQualityView, setWaterQualityView] = useState<ViewState>({ payload: null, status: 'loading' })
  const [waterRegions, setWaterRegions] = useState<string[]>([])
  const [waterRegion, setWaterRegion] = useState('West Bengal')
  const [environmentRefreshing, setEnvironmentRefreshing] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState<string>('kolkata')
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
    try {
      setWeatherView({ payload: await getJson(`/weather?mode=${weatherMode}`), status: 'online' })
    } catch (error) {
      setWeatherView({ payload: null, status: 'error', error: error instanceof Error ? error.message : 'Request failed' })
    }
    setLastUpdated(new Date())
    setRefreshing(false)
  }, [weatherMode])

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
              setSelectedLocationId(savedLocation?.id ?? 'custom')
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
      setSelectedLocationId(location.id)
      setLocationPoint({ latitude: location.latitude, longitude: location.longitude })
      setMapPoint({ latitude: location.latitude, longitude: location.longitude })
      setScenarioResult(null)
      if (isRecord(response) && isRecord(response.location) && typeof response.location.timezone === 'string') setLocationTimezone(response.location.timezone)
      if (isRecord(response) && typeof response.timezone_source === 'string') setTimezoneSource(response.timezone_source)
      await refresh()
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
      setLocationPoint(mapPoint)
      setSelectedLocationId('custom')
      setScenarioResult(null)
      if (isRecord(response) && isRecord(response.location) && typeof response.location.timezone === 'string') setLocationTimezone(response.location.timezone)
      if (isRecord(response) && typeof response.timezone_source === 'string') setTimezoneSource(response.timezone_source)
      if (openDashboard) setShowDashboard(true)
      else {
        setMapOpen(false)
        await refresh()
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
  const sourceLabel = metricValue(payload('saved'))?.source ?? asText(isRecord(forecastPayload) ? forecastPayload.source : null, 'ESTIMATED')
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
            <div className="hero-status-row">
              <div className="live-pill"><span className="live-pulse" /> SYSTEM {healthPayload && healthPayload.status === 'ok' ? 'ACTIVE' : 'CONNECTING'}</div>
              <button className="theme-toggle" type="button" aria-pressed={isDarkMode} aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setIsDarkMode((current) => !current)}>
                <ThemeIcon dark={isDarkMode} /> <span>{isDarkMode ? 'LIGHT' : 'DARK'}</span>
              </button>
            </div>
            <label className="location-control">
              <span className="location-label"><LocationIcon /> GRID LOCATION</span>
              <select aria-label="Dashboard location" value={selectedLocationId} disabled={locationLoading} onChange={(event) => void changeLocation(event.target.value)}>
                {selectedLocationId === 'custom' && <option value="custom" disabled>Current custom location</option>}
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
              <span className="location-timezone">Timezone: {locationTimezone} <SourceBadge source={timezoneSource} /></span>
              <button className="map-open-button" type="button" disabled={locationLoading} onClick={() => { setMapPoint(locationPoint); setMapOpen(true) }}>Choose on map</button>
              {locationError && <span className="location-error" role="alert">{locationError}</span>}
            </label>
          </div>
        </section>

        <nav className="dashboard-tabs" role="tablist" aria-label="Dashboard sections">
          {([
            ['overview', 'Overview'],
            ['power', 'Power'],
            ['weather', 'Weather'],
            ['environment', 'Environment'],
            ['reports', 'Reports'],
          ] as const).map(([tab, label]) => <button key={tab} id={`dashboard-tab-${tab}`} className="dashboard-tab" type="button" role="tab" aria-selected={activeDashboardTab === tab} aria-controls={`dashboard-panel-${tab}`} tabIndex={activeDashboardTab === tab ? 0 : -1} onClick={() => setActiveDashboardTab(tab)} onKeyDown={(event) => {
            const tabs = ['overview', 'power', 'weather', 'environment', 'reports'] as const
            const currentIndex = tabs.indexOf(tab)
            const nextIndex = event.key === 'ArrowRight' ? (currentIndex + 1) % tabs.length : event.key === 'ArrowLeft' ? (currentIndex - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
            if (nextIndex >= 0) {
              event.preventDefault()
              const nextTab = tabs[nextIndex]
              setActiveDashboardTab(nextTab)
              document.getElementById(`dashboard-tab-${nextTab}`)?.focus()
            }
          }}>{label}</button>)}
        </nav>

        <div id="dashboard-panel-overview" className="dashboard-tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-overview" hidden={activeDashboardTab !== 'overview'}>
        <section className="metric-grid" aria-label="Impact metrics">
          <MetricCard label="CO₂ AVOIDED" value={formatMetric(metricValue(payload('saved'))) } unit="gCO₂" note="vs typical-time baseline" tone="green" icon={<LeafIcon />} badge={sourceLabel} />
          <MetricCard label="LOADS OPTIMIZED" value={formatMetric(metricValue(payload('optimized')), 0)} unit="loads" note="flexible demand scheduled" tone="cream" icon={<GridIcon />} badge="SIMULATED" />
          <MetricCard label="ENERGY SHIFTED" value={formatMetric(metricValue(payload('shifted')))} unit="kWh" note="consumption unchanged" tone="lavender" icon={<BoltIcon />} badge="SIMULATED" />
          <MetricCard label="DAILY AVG. SAVING" value={formatMetric(metricValue(payload('averageSaved')))} unit="gCO₂" note="conservative baseline" tone="blue" icon={<SunIcon />} badge="ESTIMATED" />
        </section>

        <section className="panel scenario-panel" aria-labelledby="scenario-heading">
          <div className="scenario-intro">
            <div>
              <div className="section-kicker">GRID OPTIMIZATION SIMULATOR</div>
              <h2 id="scenario-heading">Turn the forecast into a plan</h2>
              <p>Compare typical appliance timing with lower-carbon windows for a virtual household fleet in {selectedLocationId === 'custom' ? 'your selected location' : locations.find((item) => item.id === selectedLocationId)?.name ?? 'your selected location'}.</p>
            </div>
            <div className="scenario-controls">
              <label htmlFor="scenario-households">Virtual households</label>
              <select id="scenario-households" value={scenarioHouseholds} disabled={scenarioLoading} onChange={(event) => setScenarioHouseholds(Number(event.target.value))}>
                {[10, 30, 60, 100].map((count) => <option key={count} value={count}>{count} homes</option>)}
              </select>
              <button className="scenario-run-button" type="button" onClick={() => void runOptimizationScenario()} disabled={scenarioLoading || locationLoading}>
                {scenarioLoading ? 'Optimizing…' : scenarioResult ? 'Run again' : 'Run optimization'}
              </button>
            </div>
          </div>
          {scenarioError && <div className="scenario-error" role="alert">{scenarioError}</div>}
          {scenarioResult && <div className="scenario-result" aria-live="polite">
            <div className="scenario-summary">
              <div className="scenario-impact"><span>ESTIMATED CO₂ AVOIDED</span><strong>{formatCo2Grams(scenarioResult.summary.co2_avoided_g)}</strong><small>Typical timing → optimized timing</small></div>
              <div><span>LOADS OPTIMIZED</span><strong>{scenarioResult.summary.loads_optimized} <small>/ {scenarioResult.summary.total_loads}</small></strong></div>
              <div><span>ENERGY SHIFTED</span><strong>{scenarioResult.summary.energy_shifted_kwh.toFixed(1)} <small>kWh</small></strong></div>
              <div><span>ENERGY CONSUMED</span><strong>{scenarioResult.summary.energy_consumed_kwh.toFixed(1)} <small>kWh</small></strong><small>Unchanged by scheduling</small></div>
            </div>
            <div className="scenario-emissions"><span>Baseline emissions <strong>{formatCo2Grams(scenarioResult.summary.baseline_co2_g)}</strong></span><span>Optimized emissions <strong>{formatCo2Grams(scenarioResult.summary.optimized_co2_g)}</strong></span><SourceBadge source={scenarioResult.source} /><SourceBadge source={scenarioResult.forecast_source} /></div>
            <div className="scenario-decisions-heading"><strong>Sample schedule changes</strong><span>{scenarioResult.summary.households} virtual homes · grid cap {scenarioResult.summary.max_concurrent_loads} simultaneous · {scenarioResult.summary.loads_limited_by_capacity} limited by capacity · peak {scenarioResult.summary.peak_concurrent_loads}</span></div>
            <div className="table-wrap scenario-table-wrap"><table className="scenario-table"><thead><tr><th>VIRTUAL LOAD</th><th>BASELINE TIME</th><th>OPTIMIZED TIME</th><th>CO₂ AVOIDED</th></tr></thead><tbody>
              {scenarioResult.decisions.slice(0, 8).map((item, index) => <tr key={`${item.household}-${item.load}-${index}`}><td><span className="device-name">{formatKind(item.load)}</span><span className="scenario-house">Home {item.household}</span></td><td>{formatTime(item.baseline_time)}</td><td>{item.chosen_start ? formatTime(item.chosen_start) : 'No feasible window'}</td><td className="saving-cell">{formatCo2Grams(item.saving_g)}</td></tr>)}
            </tbody></table></div>
            <p className="scenario-methodology">{scenarioResult.methodology} Forecast source: {scenarioResult.forecast_source}. Simulation only; no physical devices are controlled.</p>
          </div>}
        </section>
        </div>

        <div id="dashboard-panel-power" className="dashboard-tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-power" hidden={activeDashboardTab !== 'power'}>
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
        </div>

        <div id="dashboard-panel-weather" className="dashboard-tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-weather" hidden={activeDashboardTab !== 'weather'}>
        <section className="weather-panel panel" aria-labelledby="weather-heading">
          <div className="panel-heading">
            <div><div className="section-kicker">OPEN-METEO WEATHER</div><h2 id="weather-heading">Conditions by time scale</h2></div>
            <div className="panel-heading-right"><SourceBadge source={asText(weatherPayload?.source, 'ESTIMATED')} /><span className="tiny-label">{asText(weatherPayload?.resolution, weatherMode)}</span></div>
          </div>
          <div className="weather-controls" role="tablist" aria-label="Weather data resolution">
            {(['realtime', 'hourly', 'daily'] as const).map((mode) => <button key={mode} type="button" role="tab" aria-selected={weatherMode === mode} className={weatherMode === mode ? 'weather-tab weather-tab-active' : 'weather-tab'} onClick={() => setWeatherMode(mode)}>{mode === 'realtime' ? '15-minute' : mode}</button>)}
          </div>
          {typeof weatherPayload?.note === 'string' && <p className="weather-note">{asText(weatherPayload.note)}</p>}
          {weatherRows.length ? <div className="weather-table-wrap"><table className="weather-table"><thead><tr><th>TIME ({asText(weatherPayload?.timezone, 'local')})</th>{Object.keys(isRecord(weatherRows[0].values) ? weatherRows[0].values : {}).map((key) => <th key={key}>{formatKind(key)}</th>)}</tr></thead><tbody>
            {weatherRows.slice(0, weatherMode === 'daily' ? 7 : weatherMode === 'realtime' ? 16 : 24).map((row, index) => {
              const values = isRecord(row.values) ? row.values : {}
              return <tr key={`${String(row.timestamp)}-${index}`}><td>{formatTime(row.timestamp, weatherMode === 'daily' ? { month: 'short', day: 'numeric' } : { hour: 'numeric', minute: '2-digit' })}</td>{Object.entries(values).map(([key, value]) => <td key={key}>{typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : asText(value == null ? null : String(value))}{typeof weatherPayload?.units === 'object' && weatherPayload.units !== null && key in weatherPayload.units ? ` ${String((weatherPayload.units as Record<string, unknown>)[key])}` : ''}</td>)}</tr>
            })}
          </tbody></table></div> : <EmptyState state={weatherView} label="Open-Meteo weather" />}
          <div className="weather-meta">{weatherPayload?.fetched_at ? `Fetched ${formatTime(weatherPayload.fetched_at, { hour: 'numeric', minute: '2-digit' })}` : 'Waiting for weather data'} · powered by Open-Meteo</div>
          <div className="load-series-heading"><div><div className="section-kicker">SIMULATED ENERGY</div><h3>Load against baseline</h3><p>Illustrative household demand · {loadSeriesStep} samples across {loadSeriesWindow}</p></div><SourceBadge source="SIMULATED" /></div>
          <div className="load-series-chart" role="img" aria-label={`Simulated actual household load and baseline with ${loadSeriesStep} samples across ${loadSeriesWindow}, in kilowatts`}>
            <div className="load-series-axis"><span>120</span><span>80</span><span>40</span><span>0</span></div>
            <svg viewBox="0 0 960 180" preserveAspectRatio="none" aria-hidden="true">
              <defs><linearGradient id="load-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#4b9d73" stopOpacity=".28"/><stop offset="100%" stopColor="#4b9d73" stopOpacity=".02"/></linearGradient></defs>
              <path className="load-baseline-line" d={profilePath(loadSeries, 'baseline', 960, 180)} />
              <path className="load-actual-area" d={`${profilePath(loadSeries, 'actual', 960, 180)} L 960 180 L 0 180 Z`} />
              <path className="load-actual-line" d={profilePath(loadSeries, 'actual', 960, 180)} />
            </svg>
          </div>
          <div className="load-series-footer"><div className="load-series-legend"><span><i className="load-legend-actual"/>Actual kW</span><span><i className="load-legend-baseline"/>Baseline kW</span></div><div className="load-series-ticks">{(weatherMode === 'daily' ? ['7 days ago', '5 days', '3 days', 'Yesterday', 'Today'] : ['48h ago', '36h', '24h', '12h', 'Now']).map((tick) => <span key={tick}>{tick}</span>)}</div></div>
        </section>
        </div>

        <div id="dashboard-panel-environment" className="dashboard-tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-environment" hidden={activeDashboardTab !== 'environment'}>
        <section className="environment-grid" aria-label="Environmental monitoring">
          <article className="panel environment-panel air-quality-panel">
            <div className="panel-heading"><div><div className="section-kicker">MODELED AIR QUALITY</div><h2>Air quality outlook</h2></div><button className="monitor-refresh" type="button" onClick={() => void refreshEnvironmentalData()} disabled={environmentRefreshing}>{environmentRefreshing ? 'Updating…' : 'Refresh'}</button></div>
            {airQualityPayload && airCurrent ? <>
              <div className="air-current-grid">
                {[['PM2.5', 'pm2_5'], ['PM10', 'pm10'], ['NO₂', 'nitrogen_dioxide'], ['O₃', 'ozone']].map(([label, key]) => <div key={key}><span>{label}</span><strong>{typeof airCurrent[key] === 'number' ? asNumber(airCurrent[key]).toFixed(1) : '—'}<small> {asText(airUnits?.[key], 'μg/m³')}</small></strong></div>)}
              </div>
              <div className="environment-subheading"><strong>Next 12 hours</strong><span>Model forecast · not sensor readings</span></div>
              <div className="table-wrap environment-table-wrap"><table className="environment-table"><thead><tr><th>TIME</th><th>PM2.5</th><th>PM10</th><th>NO₂</th><th>O₃</th></tr></thead><tbody>
                {airRows.slice(0, 12).map((row, index) => <tr key={`${String(row.timestamp)}-${index}`}><td>{formatTime(row.timestamp)}</td>{['pm2_5', 'pm10', 'nitrogen_dioxide', 'ozone'].map((key) => <td key={key}>{typeof row[key] === 'number' ? asNumber(row[key]).toFixed(1) : '—'}</td>)}</tr>)}
              </tbody></table></div>
              <p className="environment-note">{asText(airQualityPayload.note)} · <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noreferrer">Open-Meteo / Copernicus CAMS</a></p>
            </> : <EmptyState state={airQualityView} label="Air-quality forecast" />}
          </article>

          <article className="panel environment-panel water-quality-panel">
            <div className="panel-heading"><div><div className="section-kicker">CPCB SURFACE WATER</div><h2>Nearby sampling stations</h2></div><select aria-label="Water quality region" value={waterRegion} onChange={(event) => setWaterRegion(event.target.value)} disabled={!waterRegions.length || environmentRefreshing}>{(waterRegions.length ? waterRegions : ['West Bengal']).map((region) => <option key={region} value={region}>{region}</option>)}</select></div>
            <p className="water-data-note">Historical manual samples in {asText(waterQualityPayload?.region, waterRegion)} · within {asNumber(waterQualityPayload?.radius_km, 100)} km</p>
            {waterStations.length ? <div className="water-station-list">{waterStations.slice(0, 5).map((station, index) => {
              const parameters = asList(station.parameters).filter(isRecord)
              return <article className="water-station" key={`${String(station.station)}-${index}`}>
                <div className="water-station-heading"><div><strong>{asText(station.station, 'CPCB station')}</strong><span>{asText(station.waterbody, asText(station.district, 'Surface water'))} · {asNumber(station.distance_km).toFixed(1)} km</span></div><time>{formatTime(station.sampled_at, { year: 'numeric', month: 'short', day: 'numeric' })}</time></div>
                <div className="water-parameter-list">{parameters.map((parameter) => <span key={String(parameter.name)}>{asText(parameter.name)} <strong>{asNumber(parameter.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> {asText(parameter.unit)}</span>)}</div>
              </article>
            })}</div> : waterQualityPayload ? <div className="water-empty-note">{asText(waterQualityPayload.note, 'No nearby water samples are available.')}</div> : <EmptyState state={waterQualityView} label="CPCB water-quality data" />}
            {waterQualityPayload && <p className="environment-note">{asText(waterQualityPayload.note)} · <a href="https://nwdp.nwic.gov.in/en/dataset/surface-water-quality-manual-chemical-parameters-cpcb" target="_blank" rel="noreferrer">National Water Data Portal · CPCB</a></p>}
          </article>
        </section>

        <section className="content-grid waste-grid" aria-label="Simulated waste collection automation">
          <article className="panel waste-panel">
            <div className="panel-heading"><div><div className="section-kicker">SIMULATED WASTE MANAGEMENT</div><h2>Priority collection plan</h2></div><SourceBadge source={asText(wastePlan?.source, 'SIMULATED')} /></div>
            {wasteSummary ? <>
              <p className="waste-plan-note">{asText(wastePlan?.methodology)} This is a demonstration model; readings are not connected to physical bins.</p>
              <div className="waste-summary">
                <div><span>PLANNED PICKUPS</span><strong>{asNumber(wasteSummary.pickups_planned)} <small>/ {asNumber(wasteSummary.pickups_recommended)} recommended</small></strong></div>
                <div><span>WASTE ON ROUTE</span><strong>{asNumber(wasteSummary.planned_waste_kg).toFixed(1)} <small>kg</small></strong></div>
                <div><span>OVERFLOW RISK</span><strong>{asNumber(wasteSummary.projected_overflow_risk_after)} <small>bins after · {asNumber(wasteSummary.projected_overflow_risk_before)} before</small></strong></div>
              </div>
              <div className="table-wrap waste-table-wrap"><table className="waste-table"><thead><tr><th>BIN / ZONE</th><th>FILL NOW</th><th>PROJECTED 12H</th><th>EST. WASTE</th><th>ROUTE</th></tr></thead><tbody>
                {wasteBins.map((bin) => <tr key={asText(bin.id)}><td><strong>{asText(bin.id)}</strong><span className="waste-zone">{asText(bin.zone)}</span></td><td>{asNumber(bin.fill_percent)}%</td><td>{asNumber(bin.projected_fill_12h)}%</td><td>{asNumber(bin.estimated_waste_kg).toFixed(1)} kg</td><td><span className={bin.selected === true ? 'waste-status waste-selected' : bin.pickup_recommended === true ? 'waste-status waste-deferred' : 'waste-status'}>{bin.selected === true ? 'PICKUP' : bin.pickup_recommended === true ? 'CAPACITY LIMITED' : 'MONITOR'}</span></td></tr>)}
              </tbody></table></div>
              <p className="environment-note">{asNumber(wasteSummary.bins_monitored)} simulated bins · {asNumber(wastePlan?.truck_capacity_kg)} kg vehicle capacity · priority threshold projected at 80%</p>
            </> : <EmptyState state={data.wastePlan} label="Waste collection plan" />}
          </article>
        </section>
        </div>

        <div id="dashboard-panel-reports" className="dashboard-tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-reports" hidden={activeDashboardTab !== 'reports'}>
        <section className="content-grid report-grid">
          <article className="panel report-panel">
              <div className="panel-heading"><div><div className="section-kicker">DAILY AUTOGENERATED BRIEF</div><h2>Latest report</h2></div><span className="report-mark"><ReportIcon /></span></div>
            {latestReport ? <><p className="report-copy">{asText(latestReport.body, 'Report is empty.')}</p><div className="report-meta"><span>{formatTime(latestReport.created_at, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><SourceBadge source={asText(latestReport.source, 'SIMULATED')} /></div></> : <EmptyState state={data.latestReport} label="Latest report" />}
          </article>
          <article className="panel report-history-panel">
              <div className="panel-heading"><div><div className="section-kicker">REPORT ARCHIVE</div><h2>Recent reports</h2></div><span className="count-chip">{reportsRows.length} reports</span></div>
            {reportsRows.length ? <div className="report-history">{reportsRows.slice(0, 4).map((item, index) => <button className="history-row" type="button" key={`${String(item.created_at)}-${index}`} aria-label={`Open report from ${formatTime(item.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`} onClick={() => setSelectedReport(item)}><span className="history-icon"><ReportIcon /></span><div><strong>{formatTime(item.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong><span>{asText(item.body, 'Daily grid summary')}</span></div><span className="history-arrow" aria-hidden="true">↗</span></button>)}</div> : <EmptyState state={data.reports} label="Reports" />}
          </article>
        </section>
        </div>

        <footer className="page-footer"><span>NRG <b>·</b> Autonomous Grid Carbon Optimizer</span><span>{lastUpdated ? `Updated ${formatTime(lastUpdated.toISOString())}` : 'Connecting to API'} <b>·</b> <a href={`${API_BASE.replace('/api/v1', '')}/docs`} target="_blank" rel="noreferrer">API docs ↗</a></span></footer>
      </div>
      <dialog className="report-dialog" ref={reportDialogRef} aria-labelledby="report-dialog-title" onClose={() => setSelectedReport(null)}>
        {selectedReport && <div className="report-dialog-content">
          <div className="location-dialog-heading"><div><div className="section-kicker">REPORT ARCHIVE</div><h2 id="report-dialog-title">Report details</h2></div><button className="report-dialog-close" type="button" aria-label="Close report" onClick={() => setSelectedReport(null)}>×</button></div>
          <div className="report-dialog-meta"><span>{formatTime(selectedReport.created_at, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><SourceBadge source={asText(selectedReport.source, 'SIMULATED')} /></div>
          <p className="report-dialog-body">{asText(selectedReport.body, 'Report is empty.')}</p>
        </div>}
      </dialog>
      <dialog className="location-dialog" ref={locationDialogRef} aria-labelledby="location-dialog-title" onClose={() => setMapOpen(false)}>
        <div className="location-dialog-content">
          <div className="location-dialog-heading"><div><div className="section-kicker">GRID LOCATION</div><h2 id="location-dialog-title">Choose a point on the map</h2></div><button className="report-dialog-close" type="button" aria-label="Close map" onClick={() => setMapOpen(false)}>×</button></div>
          <p className="location-map-help">Click the map, or paste a Zoom Earth map URL to import its map center. Open-Meteo resolves the IANA timezone when you apply the point.</p>
          <div className="zoom-earth-import"><label htmlFor="zoom-earth-url">ZOOM EARTH MAP URL</label><div><input id="zoom-earth-url" type="url" value={zoomEarthUrl} onChange={(event) => setZoomEarthUrl(event.target.value)} placeholder="https://zoom.earth/maps/satellite/#view=..." /><button type="button" onClick={importZoomEarthLocation}>Import</button></div>{zoomEarthError && <span role="alert">{zoomEarthError}</span>}</div>
          {mapOpen && <LocationPicker point={mapPoint} onSelect={setMapPoint} />}
          <div className="location-map-footer"><span>{mapPoint.latitude.toFixed(4)}, {mapPoint.longitude.toFixed(4)}</span><a href={`https://zoom.earth/maps/satellite/#view=${mapPoint.latitude.toFixed(4)},${mapPoint.longitude.toFixed(4)},6z`} target="_blank" rel="noreferrer">View this point in Zoom Earth ↗</a></div>
          {locationError && <span className="location-error" role="alert">{locationError}</span>}
          <button className="map-apply-button" type="button" disabled={locationLoading} onClick={() => void applyMapLocation()}>{locationLoading ? 'Resolving timezone…' : 'Use this location'}</button>
        </div>
      </dialog>
    </main>
  ) : (
    <main className="location-start-shell">
      <header className="location-start-header"><a className="brand" href="#location-start" aria-label="NRG home"><span className="brand-mark"><PulseIcon /></span><span>NRG</span></a><span>GRID LOCATION SETUP</span></header>
      <section className="location-start-content" id="location-start">
        <div className="eyebrow"><span className="eyebrow-line" /> FIRST · SET YOUR LOCATION</div>
        <h1>Choose where<br /><span>your grid lives.</span></h1>
        <p className="location-start-copy">Select a point on the map or import its position from Zoom Earth. We’ll resolve the timezone, save your location, and then load the dashboard.</p>
        <div className="location-start-map-card">
          <div className="zoom-earth-import"><label htmlFor="startup-zoom-earth-url">ZOOM EARTH MAP URL</label><div><input id="startup-zoom-earth-url" type="url" value={zoomEarthUrl} onChange={(event) => setZoomEarthUrl(event.target.value)} placeholder="https://zoom.earth/maps/satellite/#view=..." /><button type="button" onClick={importZoomEarthLocation}>Import</button></div>{zoomEarthError && <span role="alert">{zoomEarthError}</span>}</div>
          <LocationPicker point={mapPoint} onSelect={setMapPoint} />
          <div className="location-start-map-footer"><span>{mapPoint.latitude.toFixed(4)}, {mapPoint.longitude.toFixed(4)} · saved zone: {locationTimezone}</span><a href={`https://zoom.earth/maps/satellite/#view=${mapPoint.latitude.toFixed(4)},${mapPoint.longitude.toFixed(4)},6z`} target="_blank" rel="noreferrer">Open selected point in Zoom Earth ↗</a></div>
          {locationError && <p className="location-start-error" role="alert">{locationError}</p>}
          <button className="location-start-submit" type="button" disabled={locationLoading} onClick={() => void applyMapLocation(true)}>{locationLoading ? 'Loading saved location…' : 'Resolve timezone & open dashboard'}</button>
        </div>
      </section>
      <footer className="location-start-footer">NRG · Automated forecasts begin after location setup</footer>
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
function LocationIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.6" /></svg> }
function ThemeIcon({ dark }: { dark: boolean }) { return dark ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg> : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg> }

export default App
