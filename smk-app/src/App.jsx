import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { useLanguage } from './LanguageContext'
import './App.css'

const emptyForm = {
  location: '',
  energy: '',
  mood: '',
  headache_intensity: '',
  headache_type: '',
  diet_main: '',
  hydration_l: '',
  movement_minutes: '',
  sleep_hours: '',
  notes: '',
}

const getWeatherLabel = (code) => {
  const map = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    80: 'Rain showers',
    81: 'Rain showers',
    82: 'Heavy rain showers',
    95: 'Thunderstorm',
  }

  return map[code] || 'Unknown'
}

function App() {
  const { t, lang, setLang } = useLanguage()

  const [session, setSession] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const [formData, setFormData] = useState(emptyForm)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authMessage, setAuthMessage] = useState('')

  const [weatherData, setWeatherData] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session?.user?.id) {
      fetchEntries()
    }
  }, [session])

  const fetchEntries = async () => {
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching entries:', error)
      setMessage(t('loadError'))
    } else {
      setEntries(data || [])
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setAuthMessage(error.message)
    }

    setAuthLoading(false)
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthMessage('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setAuthMessage(error.message)
    } else {
      setAuthMessage(t('signupSuccess'))
    }

    setAuthLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const fetchWeather = async () => {
    const location = formData.location.trim()

    if (location.length < 3 || !/[a-zA-Z]/.test(location)) {
      setMessage(t('weatherLocationHint'))
      return
    }

    setWeatherLoading(true)
    setMessage('')
    setWeatherData(null)

    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
      )
      const geoData = await geoRes.json()

      if (!geoData.results || geoData.results.length === 0) {
        throw new Error('Location not found')
      }

      const place = geoData.results[0]

      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,surface_pressure,weather_code&timezone=auto`
      )
      const weatherJson = await weatherRes.json()

      if (!weatherJson.current) {
        throw new Error('Weather not available')
      }

      setWeatherData({
        location: {
          name: place.name,
          country: place.country,
        },
        current: {
          temp_c: weatherJson.current.temperature_2m,
          pressure_hpa: Math.round(weatherJson.current.surface_pressure),
          weather_text: getWeatherLabel(weatherJson.current.weather_code),
        },
      })
    } catch (error) {
      console.error('Weather lookup failed:', error.message)
      setMessage(t('weatherError'))
    }

    setWeatherLoading(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (!session?.user?.id) {
      setMessage(t('authRequired'))
      setLoading(false)
      return
    }

    const entry = {
      location: formData.location,
      weather_status: weatherData?.current?.weather_text || '',
      pressure_hpa: weatherData?.current?.pressure_hpa || null,
      temp_c: weatherData?.current?.temp_c || null,
      energy: parseInt(formData.energy) || 0,
      mood: parseInt(formData.mood) || 0,
      headache_intensity: parseInt(formData.headache_intensity) || 0,
      headache_type: formData.headache_type,
      diet_main: formData.diet_main,
      hydration_l: parseFloat(formData.hydration_l) || 0,
      movement_minutes: parseInt(formData.movement_minutes) || 0,
      sleep_hours: parseFloat(formData.sleep_hours) || 0,
      notes: formData.notes,
      user_id: session.user.id,
    }

    const { error } = await supabase.from('entries').insert([entry])

    if (error) {
      console.error('Insert error:', error)
      setMessage(`${t('saveError')}: ${error.message}`)
    } else {
      setMessage(t('saveSuccess'))
      setFormData(emptyForm)
      setWeatherData(null)
      await fetchEntries()
    }

    setLoading(false)
  }

  if (!session) {
    return (
      <div className="app-shell">
        <div className="card auth-card">
          <div className="logo">
            <div className="logo-mark">●</div>
            <h1>{t('loginTitle')}</h1>
            <p className="subtle">{t('loginSubtitle')}</p>
          </div>

          <form className="form" onSubmit={handleLogin}>
            <input
              type="email"
              placeholder={t('email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder={t('password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength="6"
            />

            <div className="button-row">
              <button type="submit" disabled={authLoading}>
                {authLoading ? t('saving') : t('login')}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={handleSignup}
                disabled={authLoading}
              >
                {t('signup')}
              </button>
            </div>
          </form>

          {authMessage && <p className="message">{authMessage}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="card app-card">
        <div className="header">
          <div>
            <h1>{t('title')}</h1>
            <p className="subtle">{session.user.email}</p>
          </div>

          <div className="header-right">
            <button
              type="button"
              className="lang-toggle"
              onClick={() => setLang(lang === 'en' ? 'pl' : 'en')}
            >
              {lang === 'en' ? 'PL' : 'EN'}
            </button>

            <button type="button" className="secondary-button" onClick={handleLogout}>
              {t('logout')}
            </button>
          </div>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="location-row">
            <input
              placeholder={t('location')}
              value={formData.location}
              onChange={(e) =>
                setFormData({ ...formData, location: e.target.value })
              }
            />

            <button
              type="button"
              className="weather-button"
              onClick={fetchWeather}
              disabled={weatherLoading}
            >
              {weatherLoading ? t('weatherLoading') : t('fetchWeather')}
            </button>
          </div>

          {weatherData && (
            <div className="weather-preview">
              <span className="weather-label">{t('weatherNow')}</span>
              <p>
                {weatherData.location.name}, {weatherData.location.country} ·{' '}
                {weatherData.current.temp_c}°C ·{' '}
                {weatherData.current.pressure_hpa} hPa ·{' '}
                {weatherData.current.weather_text}
              </p>
            </div>
          )}

          <div className="grid-3">
            <input
              type="number"
              min="1"
              max="10"
              placeholder={t('energy')}
              value={formData.energy}
              onChange={(e) =>
                setFormData({ ...formData, energy: e.target.value })
              }
            />

            <input
              type="number"
              min="1"
              max="10"
              placeholder={t('mood')}
              value={formData.mood}
              onChange={(e) =>
                setFormData({ ...formData, mood: e.target.value })
              }
            />

            <input
              type="number"
              min="0"
              max="10"
              placeholder={t('headache')}
              value={formData.headache_intensity}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  headache_intensity: e.target.value,
                })
              }
            />
          </div>

          <input
            placeholder={t('headacheType')}
            value={formData.headache_type}
            onChange={(e) =>
              setFormData({ ...formData, headache_type: e.target.value })
            }
          />

          <div className="grid-2">
            <input
              placeholder={t('diet')}
              value={formData.diet_main}
              onChange={(e) =>
                setFormData({ ...formData, diet_main: e.target.value })
              }
            />

            <input
              type="number"
              step="0.1"
              placeholder={t('water')}
              value={formData.hydration_l}
              onChange={(e) =>
                setFormData({ ...formData, hydration_l: e.target.value })
              }
            />
          </div>

          <div className="grid-2">
            <input
              type="number"
              placeholder={t('movement')}
              value={formData.movement_minutes}
              onChange={(e) =>
                setFormData({ ...formData, movement_minutes: e.target.value })
              }
            />

            <input
              type="number"
              step="0.1"
              placeholder={t('sleep')}
              value={formData.sleep_hours}
              onChange={(e) =>
                setFormData({ ...formData, sleep_hours: e.target.value })
              }
            />
          </div>

          <textarea
            rows="4"
            placeholder={t('notes')}
            value={formData.notes}
            onChange={(e) =>
              setFormData({ ...formData, notes: e.target.value })
            }
          />

          <button type="submit" disabled={loading}>
            {loading ? t('saving') : t('save')}
          </button>
        </form>

        {message && <p className="message">{message}</p>}

        <div className="entries-list">
          <h2>{t('entriesTitle').replace('{count}', entries.length)}</h2>

          {entries.length === 0 ? (
            <p className="empty-state">{t('noEntries')}</p>
          ) : (
            <div className="list">
              {entries.map((entry) => (
                <div key={entry.id} className="entry">
                  <div className="entry-meta">
                    {new Date(entry.created_at).toLocaleString()}
                  </div>

                  <div className="entry-grid">
                    <span>{t('energyLabel')}: {entry.energy}</span>
                    <span>{t('moodLabel')}: {entry.mood}</span>
                    <span>{t('headacheLabel')}: {entry.headache_intensity}</span>
                  </div>

                  <p>
                    {entry.location || '—'}
                    {entry.weather_status ? ` · ${entry.weather_status}` : ''}
                  </p>

                  {entry.notes && <p>{entry.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App