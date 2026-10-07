import {
  ARCHIVED_BASIS_FIELD,
  ARCHIVED_CONVERTED_FIELD,
  ARCHIVED_FLAG,
  ARCHIVED_LIMIT_FIELD,
  ARCHIVED_VERDICT_FIELD,
  ARCHIVED_AT_FIELD,
  EMISSION_LEDGER_KEY,
  evaluateRow,
  isArchived,
  ledgerMonth,
} from '@/domain/compliance'
import { SEED_ROWS } from './seed'
import type { EntryRow, LedgerRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
// 版本号随判定口径升级而 +1：旧缓存读到后先迁移，保证「历史达标记录留档、月报台账补齐」。
const STORAGE_KEY = 'waste-to-energy-plant:entries'
const STORAGE_VERSION_KEY = 'waste-to-energy-plant:entries:version'
const STORAGE_VERSION = 2

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 旧版本缓存迁移：
// 1) 状态已是「已达标」但没盖留档戳的历史记录，按当时结论补戳，之后不重算；
// 2) 留档记录在月报台账里缺条目时补齐回写（与重新判定达标走同一个出口）。
function migrate(data: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  const next = clone(data)
  const emissions = next.emission
  if (!Array.isArray(emissions)) {
    return next
  }

  const ledger: EntryRow[] = Array.isArray(next[EMISSION_LEDGER_KEY])
    ? [...next[EMISSION_LEDGER_KEY]]
    : []
  let ledgerChanged = false

  for (const row of emissions) {
    if (row[ARCHIVED_FLAG] !== true && String(row.status) === '已达标') {
      // 按当时的结论补留档：拿当前限值/实测重算只用于回填判定快照文字，结论固定为达标，不参与之后重算。
      const snapshotRow: EntryRow = { ...row }
      delete snapshotRow[ARCHIVED_FLAG]
      const result = evaluateRow(snapshotRow)
      const month = ledgerMonth(row)
      row[ARCHIVED_FLAG] = true
      row[ARCHIVED_VERDICT_FIELD] = '达标'
      row[ARCHIVED_CONVERTED_FIELD] = result.converted === null ? '' : String(result.converted)
      row[ARCHIVED_LIMIT_FIELD] = result.limit === null ? '' : String(result.limit)
      row[ARCHIVED_BASIS_FIELD] = result.basis
      row[ARCHIVED_AT_FIELD] = String(row['监控日期'] ?? '')
      row['达标判定'] = '达标'
      row['监控状态'] = '已达标'
      ledgerPush(ledger, row, month, (changed) => {
        ledgerChanged = ledgerChanged || changed
      })
    } else if (isArchived(row)) {
      const month = ledgerMonth(row)
      ledgerPush(ledger, row, month, (changed) => {
        ledgerChanged = ledgerChanged || changed
      })
    }
  }

  if (ledgerChanged || !Array.isArray(next[EMISSION_LEDGER_KEY])) {
    next[EMISSION_LEDGER_KEY] = ledger
  }
  return next
}

function ledgerPush(ledger: EntryRow[], row: EntryRow, month: string, mark: (changed: boolean) => void): void {
  const code = String(row['监控编号'] ?? '')
  const exists = ledger.some(
    (item) => String(item['监控编号'] ?? '') === code && String(item['台账月份'] ?? '') === month,
  )
  if (exists) {
    mark(false)
    return
  }
  const id = ledger.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1
  const basis = `历史达标结论留档（${String(row[ARCHIVED_AT_FIELD] ?? '')}）：${String(row[ARCHIVED_BASIS_FIELD] ?? '')}`
  ledger.push({
    id,
    status: '已回写',
    pending: false,
    abnormal: false,
    台账编号: `HBYZ-${month}-${code}`,
    监控编号: code,
    台账月份: month,
    监控指标: String(row['监控指标'] ?? ''),
    实测值: row['实测值'] ?? '',
    含氧量: row['含氧量'] ?? '',
    折算值: row[ARCHIVED_CONVERTED_FIELD] ?? '',
    限值要求: row['限值要求'] ?? '',
    判定结论: '达标',
    判定依据: basis,
    监控日期: row['监控日期'] ?? '',
    回写时间: String(row[ARCHIVED_AT_FIELD] ?? ''),
  } as unknown as EntryRow)
  mark(true)
}

function persist(data: Record<string, EntryRow[]>): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    window.localStorage.setItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION))
  }
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    persist(fallback)
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    const merged = { ...fallback, ...parsed }
    const version = Number(window.localStorage.getItem(STORAGE_VERSION_KEY) ?? '1')
    if (version < STORAGE_VERSION) {
      const migrated = migrate(merged)
      persist(migrated)
      return migrated
    }
    return merged
  } catch {
    persist(fallback)
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function listLedger(key: string = EMISSION_LEDGER_KEY): LedgerRow[] {
  return (allRows()[key] ?? []) as LedgerRow[]
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  persist(next)
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
