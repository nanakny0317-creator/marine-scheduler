/**
 * 受講者一覧テーブル
 * - キーボード（矢印キー）で行選択
 * - Enter で編集、Del で削除確認
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApplicationType, Student, StudentSearchParams } from '../../types'
import { studentsApi } from '../../lib/api'
import StudentForm from './StudentForm'
import CsvImportModal from './CsvImportModal'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

export default function StudentList() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<ApplicationType | 'all'>('all')
  const [sortBy, setSortBy] = useState<StudentSearchParams['sortBy']>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editStudent, setEditStudent] = useState<Student | null | undefined>(undefined)
  // undefined = 非表示, null = 新規, Student = 編集
  const [showCsvImport, setShowCsvImport] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const tableRef = useRef<HTMLTableSectionElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const list = await studentsApi.list({ query: search, sortBy, sortDir, applicationType: activeTab })
    setStudents(list)
    setLoading(false)
  }, [search, sortBy, sortDir, activeTab])

  useEffect(() => { load() }, [load])

  // 検索デバウンス
  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [search, load])

  // ソート切り替え
  const toggleSort = (col: StudentSearchParams['sortBy']) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(col); setSortDir('asc') }
  }

  const SortIcon = ({ col }: { col: StudentSearchParams['sortBy'] }) => {
    if (sortBy !== col) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-lavender-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  // 削除
  const handleDelete = async (s: Student) => {
    if (!window.confirm(`「${s.last_name} ${s.first_name}」を削除しますか？\nこの操作は元に戻せません。`)) return
    await studentsApi.delete(s.id)
    setSelectedId(null)
    load()
  }

  // テーブルキーボード操作
  const handleTableKeyDown = (e: React.KeyboardEvent, s: Student) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const idx = students.findIndex((x) => x.id === s.id)
      const next = students[idx + 1]
      if (next) {
        setSelectedId(next.id)
        tableRef.current?.children[idx + 1]?.scrollIntoView({ block: 'nearest' })
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = students.findIndex((x) => x.id === s.id)
      const prev = students[idx - 1]
      if (prev) {
        setSelectedId(prev.id)
        tableRef.current?.children[idx - 1]?.scrollIntoView({ block: 'nearest' })
      }
    } else if (e.key === 'Enter') {
      setEditStudent(s)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      handleDelete(s)
    }
  }

  // 行クリック
  const handleRowClick = (s: Student) => {
    setSelectedId(s.id)
  }

  const genderLabel = (g: string | null) =>
    g === 'male' ? '男' : g === 'female' ? '女' : g === 'other' ? '他' : '-'

  const formatDate = (d: string | null) =>
    d ? format(new Date(d), 'yyyy/MM/dd', { locale: ja }) : '-'

  const tabs: { key: ApplicationType | 'all'; label: string }[] = [
    { key: 'all',     label: '全件' },
    { key: 'new',     label: '受講申請' },
    { key: 'renewal', label: '更新講習' },
    { key: 'lapsed',  label: '失効再交付' },
  ]

  return (
    <div className="flex flex-col h-full gap-4">
      {/* タブ */}
      <div className="flex gap-1 border-b border-lavender-100">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); setSelectedId(null) }}
            className={`px-4 py-2 text-sm rounded-t-lg border-b-2 transition ${
              activeTab === key
                ? 'border-lavender-400 text-lavender-600 font-semibold bg-lavender-50'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ツールバー */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm">🔍</span>
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearch('')
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                const firstRow = tableRef.current?.children[0] as HTMLElement
                firstRow?.focus()
              }
            }}
            placeholder="氏名・電話・メールで検索 (/ でフォーカス)"
            className="field-input pl-8 py-2"
          />
        </div>

        <button
          onClick={() => setShowCsvImport(true)}
          className="btn-secondary text-sm"
        >
          CSVインポート
        </button>
        <button
          onClick={() => setEditStudent(null)}
          className="btn-primary text-sm"
        >
          ＋ 追加 (N)
        </button>
      </div>

      {/* ショートカットヒント */}
      <p className="text-xs text-gray-400 -mt-2">
        ↑↓ で行選択　Enter で編集　Delete で削除　/ で検索　N で新規追加
      </p>

      {/* テーブル */}
      <div className="card p-0 overflow-auto flex-1">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr>
              <th
                className="table-head-cell cursor-pointer"
                onClick={() => toggleSort('last_name')}
              >
                氏名 <SortIcon col="last_name" />
              </th>
              <th
                className="table-head-cell cursor-pointer"
                onClick={() => toggleSort('last_kana')}
              >
                ふりがな <SortIcon col="last_kana" />
              </th>
              <th className="table-head-cell">生年月日</th>
              <th className="table-head-cell">性別</th>
              <th className="table-head-cell">住所</th>
              <th className="table-head-cell">電話</th>
              <th
                className="table-head-cell cursor-pointer"
                onClick={() => toggleSort('updated_at')}
              >
                更新日 <SortIcon col="updated_at" />
              </th>
              <th className="table-head-cell w-20">操作</th>
            </tr>
          </thead>
          <tbody ref={tableRef}>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                  読み込み中…
                </td>
              </tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                  {search ? '検索結果がありません' : '受講者が登録されていません'}
                </td>
              </tr>
            ) : (
              students.map((s) => (
                <tr
                  key={s.id}
                  tabIndex={0}
                  onClick={() => handleRowClick(s)}
                  onDoubleClick={() => setEditStudent(s)}
                  onKeyDown={(e) => handleTableKeyDown(e, s)}
                  className={`table-row outline-none focus:ring-2 focus:ring-lavender-300 focus:ring-inset
                    ${selectedId === s.id ? 'table-row-selected' : ''}`}
                >
                  <td className="table-cell font-medium">
                    {s.last_name} {s.first_name}
                  </td>
                  <td className="table-cell text-gray-400">
                    {s.last_kana || s.first_kana
                      ? `${s.last_kana ?? ''} ${s.first_kana ?? ''}`
                      : '-'}
                  </td>
                  <td className="table-cell text-gray-500">{formatDate(s.birth_date)}</td>
                  <td className="table-cell text-center">{genderLabel(s.gender)}</td>
                  <td className="table-cell text-gray-500 max-w-[200px] truncate">
                    {[s.prefecture, s.city, s.address1].filter(Boolean).join('') || '-'}
                  </td>
                  <td className="table-cell text-gray-500">
                    {s.mobile || s.phone || '-'}
                  </td>
                  <td className="table-cell text-gray-400 text-xs">
                    {formatDate(s.updated_at)}
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditStudent(s) }}
                        className="btn-secondary btn-sm"
                        tabIndex={-1}
                      >
                        編集
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(s) }}
                        className="btn-danger btn-sm"
                        tabIndex={-1}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 件数 */}
      <p className="text-xs text-gray-400 text-right -mt-2">
        {loading ? '' : `${students.length} 件`}
      </p>

      {/* 受講者フォームモーダル */}
      {editStudent !== undefined && (
        <StudentForm
          student={editStudent}
          onSaved={(saved) => {
            setEditStudent(undefined)
            setSelectedId(saved.id)
            load()
          }}
          onCancel={() => setEditStudent(undefined)}
        />
      )}

      {/* CSVインポートモーダル */}
      {showCsvImport && (
        <CsvImportModal
          onClose={() => setShowCsvImport(false)}
          onImported={() => { setShowCsvImport(false); load() }}
        />
      )}
    </div>
  )
}

// グローバルキーバインド
export function useStudentListShortcuts(
  openNew: () => void,
  focusSearch: () => void
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'n' || e.key === 'N') openNew()
      if (e.key === '/') { e.preventDefault(); focusSearch() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openNew, focusSearch])
}
