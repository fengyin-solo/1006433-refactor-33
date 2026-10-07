import { listLedger, listRows, saveLedger, saveRows } from '@/data/local-store'
import type { ActionResult, ComplianceResult, EntryRow, LedgerRow } from '@/data/types'

// 达标判定共用实现：监控清单、环保口月报上报表、运营大屏都只能从这里取结论。
// 限值比较一律用折算后的实测值；已经判过并留档的历史记录按当时结论返回，不再重算。

const MODULE_KEY = 'emission'

export type ComplianceDraft = {
  code: string
  indicator: string
  limitText: string
  rawValue: string
  factor: string
  monitorDate: string
  operator: string
}

export function monthOf(dateText: string): string {
  const value = String(dateText ?? '').trim()
  return value.length >= 7 ? value.slice(0, 7) : value
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const matched = String(value ?? '').trim().match(/-?\d+(\.\d+)?/)
  return matched ? Number(matched[0]) : null
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

// 限值要求形如「≤80 mg/m³」「≥6」；只认数值，单位由记录自带，比较时不做跨单位换算。
function parseLimit(limitText: string): { value: number | null; pass(raw: number): boolean } {
  const text = String(limitText ?? '').trim()
  const value = toNumber(text)
  if (value === null) {
    return { value: null, pass: () => false }
  }
  if (text.includes('≥') || text.includes('>=') || text.includes('>＝')) {
    return { value, pass: (raw: number) => raw >= value }
  }
  // 默认按上限要求处理，环保排放浓度绝大多数是「不得超过」。
  return { value, pass: (raw: number) => raw <= value }
}

function factorOf(row: EntryRow): number {
  const factor = toNumber(row['折算系数'])
  return factor === null || factor <= 0 ? 1 : factor
}

function rowToResult(row: EntryRow): ComplianceResult {
  const code = String(row['监控编号'] ?? '')
  const rawValue = toNumber(row['实测值'])
  const factor = factorOf(row)
  const converted = rawValue === null ? null : round1(rawValue * factor)
  const limit = parseLimit(String(row['限值要求'] ?? ''))
  const month = monthOf(String(row['监控日期'] ?? ''))
  const archived = row['判定留档'] === true

  // 已经判过的历史记录：结论以留档为准，折算值、限值都不再重算。
  if (archived) {
    const stored = String(row['达标判定'] ?? '')
    return {
      code,
      indicator: String(row['监控指标'] ?? ''),
      rawValue,
      factor,
      convertedValue: toNumber(row['折算值']),
      limitValue: limit.value,
      conclusion: stored === '已达标' || stored === '未达标' ? stored : '待判定',
      basis: String(row['判定依据'] ?? stored),
      month,
      archived: true,
    }
  }

  if (rawValue === null || limit.value === null || converted === null) {
    return {
      code,
      indicator: String(row['监控指标'] ?? ''),
      rawValue,
      factor,
      convertedValue: converted,
      limitValue: limit.value,
      conclusion: '待判定',
      basis: '实测值或限值要求缺失，无法判定',
      month,
      archived: false,
    }
  }

  const passed = limit.pass(converted)
  const operator = String(row['限值要求'] ?? '').includes('≥') ? '≥' : '≤'
  return {
    code,
    indicator: String(row['监控指标'] ?? ''),
    rawValue,
    factor,
    convertedValue: converted,
    limitValue: limit.value,
    conclusion: passed ? '已达标' : '未达标',
    basis: `折算值 ${converted} ${operator} 限值 ${limit.value}：${passed ? '满足' : '不满足'}限值要求`,
    month,
    archived: false,
  }
}

export function findEmissionRow(code: string): EntryRow | undefined {
  const target = String(code ?? '').trim()
  return listRows(MODULE_KEY).find((row) => String(row['监控编号'] ?? '').trim() === target)
}

// 按监控编号取数：三处口径唯一入口。
export function complianceByCode(code: string): ComplianceResult | null {
  const row = findEmissionRow(code)
  return row ? rowToResult(row) : null
}

export function listCompliance(filters: { code?: string; indicator?: string } = {}): {
  row: EntryRow
  result: ComplianceResult
}[] {
  const code = filters.code?.trim() ?? ''
  const indicator = filters.indicator?.trim() ?? ''
  return listRows(MODULE_KEY)
    .filter((row) => (code ? String(row['监控编号'] ?? '').includes(code) : true))
    .filter((row) => (indicator ? String(row['监控指标'] ?? '').includes(indicator) : true))
    .map((row) => ({ row, result: rowToResult(row) }))
}

function nowText(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 回写环保口月报台账：同一监控编号只保留一条，重复判定以最新结论覆盖旧行。
function upsertLedger(row: EntryRow, result: ComplianceResult): void {
  if (result.conclusion !== '已达标') {
    return
  }
  const ledger = listLedger()
  const index = ledger.findIndex((item) => item.监控编号 === result.code)
  const entry: LedgerRow = {
    id: index >= 0 ? ledger[index].id : (ledger.reduce((max, item) => Math.max(max, item.id), 0) + 1),
    监控编号: result.code,
    监控指标: result.indicator,
    限值要求: String(row['限值要求'] ?? ''),
    实测值: String(row['实测值'] ?? ''),
    折算系数: result.factor,
    折算值: String(result.convertedValue ?? ''),
    达标判定: '已达标',
    判定依据: result.basis,
    监控日期: String(row['监控日期'] ?? ''),
    月份: result.month,
    监控人员: String(row['监控人员'] ?? ''),
    回写时间: nowText(),
  }
  if (index >= 0) {
    ledger[index] = entry
  } else {
    ledger.push(entry)
  }
  saveLedger(ledger)
}

// 执行达标判定并留档；已留档记录直接返回当时结论，绝不重算。
export function judgeAndArchive(code: string): ActionResult & { result?: ComplianceResult } {
  const rows = listRows(MODULE_KEY)
  const index = rows.findIndex((row) => String(row['监控编号'] ?? '').trim() === String(code ?? '').trim())
  if (index < 0) {
    return { ok: false, message: `没有找到监控编号为 ${code} 的环保监控记录` }
  }
  const current = rows[index]
  if (current['判定留档'] === true) {
    return {
      ok: true,
      message: `监控编号 ${code} 已按 ${current['判定时间'] || '当时'} 的结论留档，不重算`,
      result: rowToResult(current),
    }
  }
  const result = rowToResult(current)
  if (result.conclusion === '待判定') {
    return { ok: false, message: `监控编号 ${code}：${result.basis}` }
  }
  const judgedAt = nowText()
  const updated: EntryRow = {
    ...current,
    status: result.conclusion,
    pending: false,
    abnormal: result.conclusion === '未达标',
    折算值: String(result.convertedValue ?? ''),
    达标判定: result.conclusion,
    判定依据: result.basis,
    判定留档: true,
    判定时间: judgedAt,
    监控状态: result.conclusion,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(MODULE_KEY, next)
  const archived = rowToResult(updated)
  upsertLedger(updated, archived)
  return {
    ok: true,
    message: `监控编号 ${code} 判定为「${result.conclusion}」，结论已留档${result.conclusion === '已达标' ? '并回写月报台账' : ''}`,
    result: archived,
  }
}

// 同一监控编号重复提交只留一条：已存在则覆盖更新；已判过达标的历史记录冻结，拒绝改动。
export function submitMonitoring(draft: ComplianceDraft): ActionResult & { code?: string } {
  const code = draft.code.trim()
  if (!code) {
    return { ok: false, message: '监控编号不能为空' }
  }
  if (!draft.indicator.trim()) {
    return { ok: false, message: `监控编号 ${code}：监控指标不能为空` }
  }
  if (toNumber(draft.rawValue) === null) {
    return { ok: false, message: `监控编号 ${code}：实测值必须是数字` }
  }
  const factor = toNumber(draft.factor)
  if (factor === null || factor <= 0) {
    return { ok: false, message: `监控编号 ${code}：折算系数必须是大于 0 的数字` }
  }
  if (parseLimit(draft.limitText).value === null) {
    return { ok: false, message: `监控编号 ${code}：限值要求需写明数值，例如「≤80 mg/m³」` }
  }
  if (!draft.monitorDate.trim()) {
    return { ok: false, message: `监控编号 ${code}：监控日期不能为空` }
  }

  const rows = listRows(MODULE_KEY)
  const index = rows.findIndex((row) => String(row['监控编号'] ?? '').trim() === code)
  if (index >= 0 && rows[index]['判定留档'] === true) {
    return { ok: false, message: `监控编号 ${code} 已判定留档（${rows[index]['达标判定']}），按历史结论存档不可修改` }
  }

  const payload: EntryRow = {
    id: index >= 0 ? rows[index].id : (rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1),
    status: '监控中',
    pending: true,
    abnormal: false,
    监控编号: code,
    监控指标: draft.indicator.trim(),
    限值要求: draft.limitText.trim(),
    实测值: String(toNumber(draft.rawValue)),
    折算系数: String(factor),
    折算值: '',
    达标判定: '',
    判定依据: '',
    判定留档: false,
    判定时间: '',
    监控日期: draft.monitorDate,
    监控人员: draft.operator.trim(),
    监控状态: '监控中',
  }
  const next = index >= 0 ? rows.map((row, i) => (i === index ? payload : row)) : [...rows, payload]
  saveRows(MODULE_KEY, next)
  return {
    ok: true,
    code,
    message: index >= 0 ? `监控编号 ${code} 已按最新提交内容覆盖，只保留一条记录` : `监控编号 ${code} 已提交，等待达标判定`,
  }
}

// 月报台账：只从已留档的达标记录来，按监控编号去重；可按月份筛选。
export function listMonthlyLedger(month = ''): LedgerRow[] {
  const target = month.trim()
  const archivedPassed = listRows(MODULE_KEY)
    .filter((row) => row['判定留档'] === true && rowToResult(row).conclusion === '已达标')
    .map((row) => rowToResult(row))
  const ledger = listLedger()
  // 以监控编号为准对账：台账多出的或已被改判的行不动（留档可追溯），缺的达标结论补写进来。
  for (const result of archivedPassed) {
    if (!ledger.some((item) => item.监控编号 === result.code)) {
      const row = findEmissionRow(result.code)
      if (row) {
        upsertLedger(row, result)
      }
    }
  }
  const rows = listLedger()
  return target ? rows.filter((row) => row.月份 === target) : rows
}

// 运营大屏统计：读的也是同一份判定结论。
export function complianceOverview(): {
  total: number
  passed: number
  failed: number
  pending: number
  archived: number
  ledgerCount: number
} {
  const items = listRows(MODULE_KEY).map((row) => rowToResult(row))
  return {
    total: items.length,
    passed: items.filter((item) => item.conclusion === '已达标').length,
    failed: items.filter((item) => item.conclusion === '未达标').length,
    pending: items.filter((item) => item.conclusion === '待判定').length,
    archived: items.filter((item) => item.archived).length,
    ledgerCount: listLedger().length,
  }
}

export function exportComplianceCsv(): { filename: string; content: string } {
  const header = ['监控编号', '监控指标', '限值要求', '实测值', '折算系数', '折算值', '达标判定', '判定依据', '监控日期', '监控人员', '结论来源']
  const lines = [header.join(',')]
  for (const { row, result } of listCompliance()) {
    lines.push(
      [
        result.code,
        result.indicator,
        row['限值要求'] ?? '',
        result.rawValue ?? '',
        result.factor,
        result.convertedValue ?? '',
        result.conclusion,
        result.basis,
        row['监控日期'] ?? '',
        row['监控人员'] ?? '',
        result.archived ? '历史留档' : '按共用口径现算',
      ].join(','),
    )
  }
  return { filename: '环保指标监控-达标判定清单.csv', content: `﻿${lines.join('\n')}` }
}
