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

// 达标结论：清单、上报表、运营大屏三处只读这一份结果，谁也不再自己算。
export type ComplianceVerdict = '达标' | '未达标' | '待判定'

export type ComplianceResult = {
  /** 监控编号，取数与回写都以它为准 */
  code: string
  verdict: ComplianceVerdict
  /** 参与判定的折算值（实测值按基准氧含量折算后），待判定时为 null */
  converted: number | null
  /** 参与比较的限值数值，待判定时为 null */
  limit: number | null
  /** 限值比较方向：上限类指标实测不超过限值，下限类不低于限值 */
  direction: '上限' | '下限'
  /** 判定依据的文字说明，三处页面展示同一套口径 */
  basis: string
  /** true 表示沿用判定时的历史结论留档，本次不重算 */
  archived: boolean
}

// 环保口月报台账：达标的结论回写到这里，编号一个月一条。
export type LedgerRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}
