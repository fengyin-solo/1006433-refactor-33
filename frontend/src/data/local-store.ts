import { SEED_LEDGER, SEED_ROWS } from './seed'
import type { EntryRow, LedgerRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'waste-to-energy-plant:entries'
const LEDGER_KEY = 'waste-to-energy-plant:emission-ledger'
// 判定口径收敛为单一实现后，历史缓存里的旧结论不再可信，整体换版重新播种。
const STORAGE_VERSION = 2
const VERSION_KEY = 'waste-to-energy-plant:version'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function storageVersionMismatch(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false
  }
  return window.localStorage.getItem(VERSION_KEY) !== String(STORAGE_VERSION)
}

function stampStorageVersion(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION))
  }
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  if (storageVersionMismatch()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(clone(SEED_LEDGER)))
    stampStorageVersion()
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
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

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

// 环保口月报台账单独存放：它是留档数据，重置监控清单也不会动它。
let ledgerCache: LedgerRow[] | null = null

export function listLedger(): LedgerRow[] {
  if (ledgerCache !== null) {
    return ledgerCache
  }
  if (typeof window === 'undefined' || !window.localStorage) {
    ledgerCache = clone(SEED_LEDGER)
    return ledgerCache
  }
  if (storageVersionMismatch()) {
    // 版本迁移时 readStorage 已重写台账，这里只需读到新值。
    stampStorageVersion()
  }
  const raw = window.localStorage.getItem(LEDGER_KEY)
  if (!raw) {
    ledgerCache = clone(SEED_LEDGER)
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledgerCache))
    return ledgerCache
  }
  try {
    ledgerCache = JSON.parse(raw) as LedgerRow[]
  } catch {
    ledgerCache = clone(SEED_LEDGER)
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledgerCache))
  }
  return ledgerCache
}

export function saveLedger(rows: LedgerRow[]): void {
  ledgerCache = rows
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(rows))
  }
}
