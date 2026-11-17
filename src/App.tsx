import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import StudentsPage from './pages/StudentsPage'
import MembersPage from './pages/MembersPage'
import VenueSettingsPage from './pages/VenueSettingsPage'
import ExamSessionsPage from './pages/ExamSessionsPage'
import RenewalSessionsPage from './pages/RenewalSessionsPage'
import ClassroomsPage from './pages/ClassroomsPage'
import SettingsHubPage from './pages/SettingsHubPage'
import FormCalibrationPage from './pages/FormCalibrationPage'
import FeesPage from './pages/FeesPage'
import ExamApplicationsPage from './pages/ExamApplicationsPage'
import LicenseApplicationsPage from './pages/LicenseApplicationsPage'
import RenewalApplicationsPage from './pages/RenewalApplicationsPage'

export default function App() {
  return (
    <Routes>
      {/* トップページ（サイドバーなし） */}
      <Route path="/" element={<HomePage />} />

      {/* 会場・日程の設定（入口） */}
      <Route path="/settings" element={<SettingsHubPage />} />

      {/* 会場マスター管理（サイドバーなし） */}
      <Route path="/venues" element={<VenueSettingsPage />} />

      {/* 試験日程管理（サイドバーなし） */}
      <Route path="/exam-sessions" element={<ExamSessionsPage />} />

      {/* 更新講習日程管理（サイドバーなし） */}
      <Route path="/renewal-sessions" element={<RenewalSessionsPage />} />

      {/* 試験申請の作業画面 */}
      <Route path="/exam-applications" element={<ExamApplicationsPage />} />
      <Route path="/license-applications" element={<LicenseApplicationsPage />} />
      <Route path="/renewal-applications" element={<RenewalApplicationsPage />} />

      {/* 受験料・登録免許税（サイドバーなし） */}
      <Route path="/fees" element={<FeesPage />} />

      {/* 授業会場管理（サイドバーなし） */}
      <Route path="/classrooms" element={<ClassroomsPage />} />

      {/* 印字位置キャリブレーション（開発ツール） */}
      <Route path="/calibration" element={<FormCalibrationPage />} />

      {/* 会員管理（スケジュール画面とは別レイアウト） */}
      <Route path="/members" element={<MembersPage />} />

      {/* 講習スケジュールの確認（試験コースの講習日だけ・サイドバーあり） */}
      <Route element={<Layout />}>
        <Route path="/students" element={<StudentsPage />} />
      </Route>
    </Routes>
  )
}
