import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import StudentsPage from './pages/StudentsPage'
import MembersPage from './pages/MembersPage'
import VenueSettingsPage from './pages/VenueSettingsPage'

export default function App() {
  return (
    <Routes>
      {/* トップページ（サイドバーなし） */}
      <Route path="/" element={<HomePage />} />

      {/* 会場マスター管理（サイドバーなし） */}
      <Route path="/venues" element={<VenueSettingsPage />} />

      {/* 会員管理（スケジュール画面とは別レイアウト） */}
      <Route path="/members" element={<MembersPage />} />

      {/* スケジュール確認（サイドバーあり） */}
      <Route element={<Layout />}>
        <Route path="/students" element={<StudentsPage />} />
      </Route>
    </Routes>
  )
}
