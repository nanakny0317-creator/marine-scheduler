import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import StudentsPage from './pages/StudentsPage'
import MembersPage from './pages/MembersPage'
import VenueSettingsPage from './pages/VenueSettingsPage'
import ExamSessionsPage from './pages/ExamSessionsPage'
import FormCalibrationPage from './pages/FormCalibrationPage'

export default function App() {
  return (
    <Routes>
      {/* トップページ（サイドバーなし） */}
      <Route path="/" element={<HomePage />} />

      {/* 会場マスター管理（サイドバーなし） */}
      <Route path="/venues" element={<VenueSettingsPage />} />

      {/* 試験日程管理（サイドバーなし） */}
      <Route path="/exam-sessions" element={<ExamSessionsPage />} />

      {/* 印字位置キャリブレーション（開発ツール） */}
      <Route path="/calibration" element={<FormCalibrationPage />} />

      {/* 会員管理（スケジュール画面とは別レイアウト） */}
      <Route path="/members" element={<MembersPage />} />

      {/* スケジュール確認（サイドバーあり） */}
      <Route element={<Layout />}>
        <Route path="/students" element={<StudentsPage />} />
      </Route>
    </Routes>
  )
}
