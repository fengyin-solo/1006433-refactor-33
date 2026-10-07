/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

// 达标判定结论：清单、环保口上报表、运营大屏共用这一份结构，谁都不允许自己另写判定。
export type ComplianceResult = {
  code: string
  indicator: string
  rawValue: number | null
  factor: number
  convertedValue: number | null
  limitValue: number | null
  conclusion: '已达标' | '未达标' | '待判定'
  basis: string
  month: string
  archived: boolean
}

// 环保口月报台账行：只有判定为「已达标」并留档的记录才会回写进来。
export type LedgerRow = {
  id: number
  监控编号: string
  监控指标: string
  限值要求: string
  实测值: string
  折算系数: number
  折算值: string
  达标判定: string
  判定依据: string
  监控日期: string
  月份: string
  监控人员: string
  回写时间: string
}
