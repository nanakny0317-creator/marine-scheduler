import { contextBridge, ipcRenderer } from 'electron'

const api = {
  students: {
    list: (params?: unknown) => ipcRenderer.invoke('students:list', params),
    get: (id: number) => ipcRenderer.invoke('students:get', id),
    create: (input: unknown) => ipcRenderer.invoke('students:create', input),
    update: (id: number, input: unknown) => ipcRenderer.invoke('students:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('students:delete', id),
    checkDuplicate: (input: unknown, excludeId?: number) =>
      ipcRenderer.invoke('students:checkDuplicate', input, excludeId),
    import: (rows: unknown[]) => ipcRenderer.invoke('students:import', rows),
    nextCode: () => ipcRenderer.invoke('students:nextCode'),
    migrateKana: () => ipcRenderer.invoke('students:migrateKana'),
  },
  venues: {
    list:    (activeOnly?: boolean, region?: string) => ipcRenderer.invoke('venues:list', activeOnly, region),
    regions: () => ipcRenderer.invoke('venues:regions'),
    create:  (input: unknown)       => ipcRenderer.invoke('venues:create', input),
    update:  (id: number, input: unknown) => ipcRenderer.invoke('venues:update', id, input),
    delete:  (id: number)           => ipcRenderer.invoke('venues:delete', id),
  },
  enrollments: {
    create: (input: unknown) => ipcRenderer.invoke('enrollments:create', input),
    list: (studentId: number) => ipcRenderer.invoke('enrollments:list', studentId),
    importBatch: (rows: unknown[]) => ipcRenderer.invoke('enrollments:importBatch', rows),
    importWithDup: (rows: unknown[]) => ipcRenderer.invoke('enrollments:importWithDup', rows),
    listAll: (applicationType?: string) => ipcRenderer.invoke('enrollments:listAll', applicationType),
    update: (id: number, input: unknown) => ipcRenderer.invoke('enrollments:update', id, input),
    delete: (id: number) => ipcRenderer.invoke('enrollments:delete', id),
  },
  pendingReviews: {
    list: () => ipcRenderer.invoke('pendingReviews:list'),
    create: (input: unknown) => ipcRenderer.invoke('pendingReviews:create', input),
    resolve: (id: number, resolution: string) => ipcRenderer.invoke('pendingReviews:resolve', id, resolution),
    merge: (id: number, keepStudentId: number) => ipcRenderer.invoke('pendingReviews:merge', id, keepStudentId),
  },
  print: {
    html: (html: string) => ipcRenderer.invoke('print:html', html),
  },
  dev: {
    counts: () => ipcRenderer.invoke('dev:counts'),
    resetAll: () => ipcRenderer.invoke('dev:resetAll'),
    seed: () => ipcRenderer.invoke('dev:seed'),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
