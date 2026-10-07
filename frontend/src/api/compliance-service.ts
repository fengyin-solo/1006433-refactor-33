import {
  ARCHIVED_FLAG,
  EMISSION_KEY,
  EMISSION_LEDGER_KEY,
  archivedSnapshot,
  evaluateAll,
  evaluateByCode,
  evaluateRow,
  isArchived,
  judgedMonth,
  ledgerMonth,
  todayText,
} from '@/domain/compliance'
import { listLedger, listRows, saveRows } from '@/data/local-store'
import type { ActionResult, ComplianceResult, EntryRow, LedgerRow } from '@/data/types'

// 环保监控记录提交入参：同一监控编号重复提交只留一条。
export type EmissionSubmission = {
  code: string
  indicator: string
  limit: string
  measured: string
  oxygen?: string
  date?: string
  operator?: string
}

export type EmissionReportRow = {
  code: string
  indicator: string
  limit: string
  measured: string
  oxygen: string
  converted: string
  verdict: string
  basis: string
  status: string
  archived: boolean
}

export type ComplianceOverview = {
  total: number
  passed: number
  failed: number
  pending: number
  archived: number
  passRate: number
  latest: EmissionReportRow[]
}

function emissionRows(): EntryRow[] {
  return listRows(EMISSION_KEY)
}

function toReportRow(row: EntryRow, result: ComplianceResult): EmissionReportRow {
  return {
    code: result.code,
    indicator: String(row['监控指标'] ?? ''),
    limit: String(row['限值要求'] ?? ''),
    measured: String(row['实测值'] ?? ''),
    oxygen: String(row['含氧量'] ?? ''),
    converted: result.converted === null ? '—' : String(result.converted),
    verdict: result.verdict,
    basis: result.basis,
    status: String(row.status ?? ''),
    archived: result.archived,
  }
}

// 清单 / 上报表 / 大屏共用：同一份记录、同一个结论。
export function getEmissionReportRows(): EmissionReportRow[] {
  const rows = emissionRows()
  return rows.map((row) => toReportRow(row, evaluateRow(row)))
}

export function getComplianceByCode(code: string): ComplianceResult | null {
  return evaluateByCode(emissionRows(), code)
}

// 环保口月报台账：达标结论回写到这里。
export function getMonthlyLedger(month?: string): LedgerRow[] {
  const ledger = listLedger(EMISSION_LEDGER_KEY)
  if (!month) {
    return [...ledger].sort((a, b) => String(b['台账月份']).localeCompare(String(a['台账月份'])))
  }
  return ledger.filter((row) => String(row['台账月份'] ?? '') === month)
}

function upsertLedger(row: EntryRow, result: ComplianceResult, judgedAt: string): void {
  const ledger = listLedger(EMISSION_LEDGER_KEY)
  const code = result.code
  const month = ledgerMonth(row)
  const index = ledger.findIndex(
    (item) => String(item['监控编号'] ?? '') === code && String(item['台账月份'] ?? '') === month,
  )
  const entry: LedgerRow = {
    id: index >= 0 ? ledger[index].id : ledger.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1,
    status: '已回写',
    pending: false,
    abnormal: false,
    台账编号: `HBYZ-${month}-${code}`,
    监控编号: code,
    台账月份: month,
    监控指标: row['监控指标'] ?? '',
    实测值: row['实测值'] ?? '',
    含氧量: row['含氧量'] ?? '',
    折算值: result.converted === null ? '' : String(result.converted),
    限值要求: row['限值要求'] ?? '',
    判定结论: '达标',
    判定依据: result.basis,
    监控日期: row['监控日期'] ?? '',
    回写时间: judgedAt,
  }
  if (index >= 0) {
    ledger[index] = entry
  } else {
    ledger.push(entry)
  }
  saveRows(EMISSION_LEDGER_KEY, ledger)
}

// 提交（或重复提交）监控记录：按监控编号去重，只留一条。
export function submitEmission(input: EmissionSubmission): ActionResult & { code?: string } {
  const code = input.code.trim()
  if (!code) {
    return { ok: false, message: '监控编号不能为空' }
  }
  const rows = emissionRows()
  const index = rows.findIndex((row) => String(row['监控编号'] ?? '') === code)
  const date = input.date?.trim() || todayText()
  const base: EntryRow = index >= 0 ? rows[index] : ({ id: 0 } as EntryRow)

  const updated: EntryRow = {
    ...base,
    id: index >= 0 ? base.id : rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1,
    status: index >= 0 && isArchived(base) ? '已达标' : '监控中',
    pending: !(index >= 0 && isArchived(base)),
    abnormal: false,
    监控编号: code,
    监控指标: input.indicator.trim(),
    限值要求: input.limit.trim(),
    实测值: input.measured.trim(),
    含氧量: input.oxygen?.trim() ?? '',
    监控日期: date,
    监控人员: input.operator?.trim() || (base['监控人员'] ?? ''),
    监控状态: index >= 0 && isArchived(base) ? '已达标' : '监控中',
  }

  let message: string
  if (index >= 0) {
    if (isArchived(base)) {
      // 历史达标记录：信息可更新，但判定结论沿用留档，不重算。
      updated[ARCHIVED_FLAG] = true
      updated['达标判定'] = '达标'
      message = `监控编号 ${code} 已存在，按历史达标结论留档，不重新判定`
    } else {
      updated['达标判定'] = ''
      message = `监控编号 ${code} 已存在，已更新本次提交内容（同一编号只保留一条）`
    }
    rows[index] = updated
  } else {
    updated['达标判定'] = ''
    rows.push(updated)
    message = `监控编号 ${code} 提交成功，待达标判定`
  }
  saveRows(EMISSION_KEY, rows)
  return { ok: true, message, code }
}

// 执行达标判定：结论由共用实现算出；达标则留档并回写月报台账。
export function judgeEmission(code: string): ActionResult & { result?: ComplianceResult } {
  const rows = emissionRows()
  const index = rows.findIndex((row) => String(row['监控编号'] ?? '') === code)
  if (index < 0) {
    return { ok: false, message: `没有找到监控编号为 ${code} 的记录` }
  }
  const current = rows[index]
  if (isArchived(current)) {
    return { ok: false, message: `监控编号 ${code} 已有历史达标结论留档，不再重新判定`, result: evaluateRow(current) }
  }

  const result = evaluateRow(current)
  if (result.verdict === '待判定') {
    return { ok: false, message: `监控编号 ${code} 暂不能判定：${result.basis}` }
  }

  const judgedAt = `${todayText()} ${new Date().toTimeString().slice(0, 5)}`
  if (result.verdict === '达标') {
    rows[index] = {
      ...current,
      ...archivedSnapshot(result, judgedAt),
      达标判定: '达标',
      监控状态: '已达标',
      status: '已达标',
      pending: false,
      abnormal: false,
    }
    saveRows(EMISSION_KEY, rows)
    // 达标结论回写环保口月报台账（同一编号同月只一条）。
    upsertLedger(rows[index], result, judgedAt)
    return { ok: true, message: `监控编号 ${code} 判定达标，结论已留档并回写 ${ledgerMonth(rows[index])} 月报台账`, result }
  }

  rows[index] = {
    ...current,
    达标判定: '未达标',
    折算值: result.converted === null ? '' : String(result.converted),
    监控状态: '未达标',
    status: '未达标',
    pending: false,
    abnormal: true,
  }
  saveRows(EMISSION_KEY, rows)
  return { ok: true, message: `监控编号 ${code} 判定未达标：${result.basis}`, result }
}

// 运营大屏：直接读共用判定结果，不再拿监控状态凑结论。
export function getComplianceOverview(): ComplianceOverview {
  const rows = getEmissionReportRows()
  const total = rows.length
  const passed = rows.filter((row) => row.verdict === '达标').length
  const failed = rows.filter((row) => row.verdict === '未达标').length
  const pending = rows.filter((row) => row.verdict === '待判定').length
  const archived = rows.filter((row) => row.archived).length
  return {
    total,
    passed,
    failed,
    pending,
    archived,
    passRate: total === 0 ? 0 : Math.round((passed / total) * 1000) / 10,
    latest: rows.slice(-5).reverse(),
  }
}

// 供测试与页面核对：一次拿到全部编号的结论。
export function allComplianceResults(): Map<string, ComplianceResult> {
  return evaluateAll(emissionRows())
}

export function currentMonth(): string {
  return judgedMonth()
}
