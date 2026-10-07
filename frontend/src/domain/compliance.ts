import type { ComplianceResult, ComplianceVerdict, EntryRow } from '@/data/types'

// 达标判定共用实现：清单、上报表、运营大屏三处的结论都从这里取，
// 限值要求怎么解析、实测值怎么折算、怎么比，全仓库只有这一份。

export const EMISSION_KEY = 'emission'
export const EMISSION_LEDGER_KEY = 'emission-ledger'

const CODE_FIELD = '监控编号'
const LIMIT_FIELD = '限值要求'
const MEASURED_FIELD = '实测值'
const OXYGEN_FIELD = '含氧量'
const DATE_FIELD = '监控日期'

// 留档字段：判过达标的记录盖上这个戳，之后按当时的结论留档，不重算。
export const ARCHIVED_FLAG = '__verdictArchived'
export const ARCHIVED_VERDICT_FIELD = '判定结论'
export const ARCHIVED_CONVERTED_FIELD = '折算值'
export const ARCHIVED_BASIS_FIELD = '判定依据'
export const ARCHIVED_AT_FIELD = '判定时间'
export const ARCHIVED_LIMIT_FIELD = '判定限值'

// 烟气基准氧含量 9%：实测值统一折算到基准氧含量后再与限值比。
export const BASE_OXYGEN = 9

// 下限类指标：值越大越差的反例（去除率、效率等），实测值不低于限值才算达标。
const LOWER_IS_BETTER_HINTS = ['去除率', '效率', '脱除率']

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string') {
    return null
  }
  const matched = value.match(/-?\d+(?:\.\d+)?/)
  if (!matched) {
    return null
  }
  const parsed = Number(matched[0])
  return Number.isFinite(parsed) ? parsed : null
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

type LimitSpec = { value: number; direction: '上限' | '下限' }

// 限值要求支持「≤80」「<=80」「不大于80」「不低于90」这类写法，也允许纯数字。
export function parseLimit(raw: unknown, indicator: string): LimitSpec | null {
  const text = String(raw ?? '').trim()
  const value = toNumber(text)
  if (value === null) {
    return null
  }
  let direction: '上限' | '下限' = LOWER_IS_BETTER_HINTS.some((hint) => indicator.includes(hint))
    ? '下限'
    : '上限'
  if (/[≥>]|不低于|不得低于|至少/.test(text)) {
    direction = '下限'
  } else if (/[≤<]|不大于|不得高于|不超过|小于/.test(text)) {
    direction = '上限'
  }
  return { value, direction }
}

// 基准氧含量折算：折算值 = 实测值 × (21 - 基准氧) / (21 - 实测氧)。
// 没有录含氧量时按实测值直接判定；含氧量不合理则不给结论，等数据补齐。
export function convertMeasured(measured: number, oxygen: unknown): { converted: number; basis: string } {
  const oxygenValue = toNumber(oxygen)
  if (oxygenValue === null) {
    return { converted: measured, basis: '实测值直接与限值比较（未录含氧量，不折算）' }
  }
  if (oxygenValue < 0 || oxygenValue >= 21) {
    return { converted: Number.NaN, basis: `含氧量 ${formatNumber(oxygenValue)}% 不在 0~21% 范围内，无法折算` }
  }
  const factor = (21 - BASE_OXYGEN) / (21 - oxygenValue)
  return {
    converted: measured * factor,
    basis: `实测 ${formatNumber(measured)} 按基准氧 ${BASE_OXYGEN}% 折算（实测氧 ${formatNumber(oxygenValue)}%，系数 ${factor.toFixed(3)}）`,
  }
}

// 已经判过达标的历史记录：沿用当时的结论留档，不重算。
export function isArchived(row: EntryRow): boolean {
  return row[ARCHIVED_FLAG] === true && String(row[ARCHIVED_VERDICT_FIELD] ?? '') === '达标'
}

function withinLimit(converted: number, spec: LimitSpec): boolean {
  return spec.direction === '上限' ? converted <= spec.value : converted >= spec.value
}

// 单条监控记录的达标判定：限值要求、实测值、折算口径都由这一个函数说了算。
export function evaluateRow(row: EntryRow): ComplianceResult {
  const code = String(row[CODE_FIELD] ?? '')
  const indicator = String(row['监控指标'] ?? '')

  if (isArchived(row)) {
    const archivedConverted = toNumber(row[ARCHIVED_CONVERTED_FIELD])
    const archivedLimit = toNumber(row[ARCHIVED_LIMIT_FIELD])
    return {
      code,
      verdict: '达标',
      converted: archivedConverted,
      limit: archivedLimit,
      direction: archivedLimit === null ? '上限' : parseLimit(row[LIMIT_FIELD], indicator)?.direction ?? '上限',
      basis: `历史达标结论留档（${String(row[ARCHIVED_AT_FIELD] ?? '')}）：${String(row[ARCHIVED_BASIS_FIELD] ?? '')}`,
      archived: true,
    }
  }

  const measured = toNumber(row[MEASURED_FIELD])
  const spec = parseLimit(row[LIMIT_FIELD], indicator)
  if (measured === null || spec === null) {
    return {
      code,
      verdict: '待判定',
      converted: null,
      limit: spec?.value ?? null,
      direction: spec?.direction ?? (LOWER_IS_BETTER_HINTS.some((hint) => indicator.includes(hint)) ? '下限' : '上限'),
      basis: '实测值或限值要求缺失/不是数值，暂不能判定',
      archived: false,
    }
  }

  const { converted, basis: convertBasis } = convertMeasured(measured, row[OXYGEN_FIELD])
  if (!Number.isFinite(converted)) {
    return {
      code,
      verdict: '待判定',
      converted: null,
      limit: spec.value,
      direction: spec.direction,
      basis: convertBasis,
      archived: false,
    }
  }

  const verdict: ComplianceVerdict = withinLimit(converted, spec) ? '达标' : '未达标'
  const operator = spec.direction === '上限' ? '≤' : '≥'
  return {
    code,
    verdict,
    converted,
    limit: spec.value,
    direction: spec.direction,
    basis: `${convertBasis}；折算值 ${formatNumber(converted)} ${operator} 限值 ${formatNumber(spec.value)}，判定${verdict}`,
    archived: false,
  }
}

// 按监控编号取数，返回这份编号唯一的判定结论。
export function evaluateByCode(rows: EntryRow[], code: string): ComplianceResult | null {
  const row = rows.find((item) => String(item[CODE_FIELD] ?? '') === code)
  return row ? evaluateRow(row) : null
}

export function evaluateAll(rows: EntryRow[]): Map<string, ComplianceResult> {
  const result = new Map<string, ComplianceResult>()
  for (const row of rows) {
    result.set(String(row[CODE_FIELD] ?? ''), evaluateRow(row))
  }
  return result
}

// 判定达当时的留档快照：以后实测值、限值再怎么改，结论都不动。
export function archivedSnapshot(result: ComplianceResult, judgedAt: string): Record<string, string | number | boolean> {
  return {
    [ARCHIVED_FLAG]: true,
    [ARCHIVED_VERDICT_FIELD]: result.verdict,
    [ARCHIVED_CONVERTED_FIELD]: result.converted === null ? '' : formatNumber(result.converted),
    [ARCHIVED_LIMIT_FIELD]: result.limit === null ? '' : formatNumber(result.limit),
    [ARCHIVED_BASIS_FIELD]: result.basis,
    [ARCHIVED_AT_FIELD]: judgedAt,
  }
}

// 台账归属月份取监控日期（YYYY-MM），没有就落到当前月。
export function ledgerMonth(row: EntryRow): string {
  const date = String(row[DATE_FIELD] ?? '')
  const matched = date.match(/^(\d{4})-(\d{2})/)
  if (matched) {
    return `${matched[1]}-${matched[2]}`
  }
  return judgedMonth()
}

export function judgedMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function todayText(now: Date = new Date()): string {
  return `${judgedMonth(now)}-${String(now.getDate()).padStart(2, '0')}`
}
