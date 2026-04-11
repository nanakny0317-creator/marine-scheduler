import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import StudentsPage from './pages/StudentsPage'
import VenueSettingsPage from './pages/VenueSettingsPage'

export default function App() {
  return (
    <Routes>
      {/* トップページ（サイドバーなし） */}
      <Route path="/" element={<HomePage />} />

      {/* 会場マスター管理（サイドバーなし） */}
      <Route path="/venues" element={<VenueSettingsPage />} />

      {/* 管理画面（サイドバーあり） */}
      <Route element={<Layout />}>
        <Route path="/students" element={<StudentsPage />} />
      </Route>
    </Routes>
  )
}
