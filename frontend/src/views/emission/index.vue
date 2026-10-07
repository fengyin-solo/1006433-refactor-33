<template>
  <section class="page" data-module="emission">
    <header class="page-head">
      <div>
        <h2>环保指标监控管理</h2>
        <p class="page-desc">达标判定只有一份共用实现：按监控编号取数，限值要求与实测值折算后统一判定，清单、上报表与大屏读到的是同一个结论。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">{{ editingCode ? '重新提交该编号' : '登记环保监控记录' }}</button>
        <button class="btn" type="button" @click="exportRows">导出达标判定清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
      <span class="legend-item">历史留档（不重算）：{{ archivedCount }}</span>
    </p>

    <form v-if="showForm" class="filter-bar" @submit.prevent="submitDraft">
      <label class="filter-item">
        <span>监控编号</span>
        <input v-model="draft.code" placeholder="如 EMIS-0005" :disabled="Boolean(editingCode)" />
      </label>
      <label class="filter-item">
        <span>监控指标</span>
        <input v-model="draft.indicator" placeholder="如 二氧化硫" />
      </label>
      <label class="filter-item">
        <span>限值要求</span>
        <input v-model="draft.limitText" placeholder="如 ≤80 mg/m³" />
      </label>
      <label class="filter-item">
        <span>实测值</span>
        <input v-model="draft.rawValue" placeholder="折算前实测值" />
      </label>
      <label class="filter-item">
        <span>折算系数</span>
        <input v-model="draft.factor" placeholder="默认 1" />
      </label>
      <label class="filter-item">
        <span>监控日期</span>
        <input v-model="draft.monitorDate" type="date" />
      </label>
      <label class="filter-item">
        <span>监控人员</span>
        <input v-model="draft.operator" />
      </label>
      <button class="btn primary" type="submit">提交（同编号只留一条）</button>
      <button class="btn ghost" type="button" @click="closeCreate">取消</button>
    </form>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>监控编号</span>
        <input v-model="filters.code" placeholder="按监控编号检索" />
      </label>
      <label class="filter-item">
        <span>监控指标</span>
        <input v-model="filters.indicator" placeholder="按监控指标检索" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in rows" :key="item.row.id">
          <td>{{ item.row['监控编号'] }}</td>
          <td>{{ item.row['监控指标'] }}</td>
          <td>{{ item.row['限值要求'] }}</td>
          <td>{{ item.result.rawValue ?? '—' }}</td>
          <td>{{ item.result.factor }}</td>
          <td>{{ item.result.convertedValue ?? '—' }}</td>
          <td :class="conclusionClass(item.result.conclusion)">{{ item.result.conclusion }}</td>
          <td>{{ item.result.basis }}</td>
          <td>{{ item.row['监控日期'] }}</td>
          <td>{{ item.row['监控人员'] }}</td>
          <td>{{ item.row.status }}</td>
          <td class="row-actions">
            <template v-if="!item.result.archived">
              <button
                v-if="item.row.status === '待监控'"
                class="link"
                type="button"
                @click="submitRow(item.row)"
              >
                提交监控
              </button>
              <button class="link" type="button" @click="judge(item.result.code)">执行判定</button>
              <button class="link" type="button" @click="editDraft(item.row)">改这条</button>
            </template>
            <span v-else class="archived-text">已按 {{ item.row['判定时间'] }} 结论留档</span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无环保指标监控数据，可先登记环保监控记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ rows.length }} 条环保监控记录；达标的结论判定后自动回写环保口月报台账</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  complianceByCode,
  exportComplianceCsv,
  judgeAndArchive,
  listCompliance,
  submitMonitoring,
} from '@/api/compliance'
import type { ComplianceResult, EntryRow } from '@/data/types'

const meta = moduleMeta('emission')
const columns = ['监控编号', '监控指标', '限值要求', '实测值', '折算系数', '折算值', '达标判定', '判定依据', '监控日期', '监控人员']

const rows = ref<{ row: EntryRow; result: ComplianceResult }[]>([])
const errorMessage = ref('')
const filters = ref<Record<string, string>>({ code: '', indicator: '' })
const showForm = ref(false)
const editingCode = ref('')
const draft = ref({
  code: '',
  indicator: '',
  limitText: '',
  rawValue: '',
  factor: '1',
  monitorDate: '',
  operator: '',
})

const stats = computed(() => [
  { label: '待判定指标', value: rows.value.filter((item) => item.result.conclusion === '待判定').length },
  { label: '已达标指标', value: rows.value.filter((item) => item.result.conclusion === '已达标').length },
  { label: '未达标指标', value: rows.value.filter((item) => item.result.conclusion === '未达标').length },
])

const archivedCount = computed(() => rows.value.filter((item) => item.result.archived).length)

const statusSummary = computed(() =>
  meta.statuses.map((status: string) => ({
    status,
    count: rows.value.filter((item) => String(item.row.status) === status).length,
  })),
)

function conclusionClass(conclusion: ComplianceResult['conclusion']): string {
  if (conclusion === '已达标') {
    return 'conclusion-pass'
  }
  if (conclusion === '未达标') {
    return 'conclusion-fail'
  }
  return ''
}

function resetFilters() {
  filters.value = { code: '', indicator: '' }
  reload()
}

function exportRows() {
  const { filename, content } = exportComplianceCsv()
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function emptyDraft() {
  draft.value = {
    code: '',
    indicator: '',
    limitText: '',
    rawValue: '',
    factor: '1',
    monitorDate: '',
    operator: '',
  }
}

function openCreate() {
  editingCode.value = ''
  emptyDraft()
  showForm.value = true
}

function closeCreate() {
  showForm.value = false
  editingCode.value = ''
  emptyDraft()
}

function editDraft(row: EntryRow) {
  editingCode.value = String(row['监控编号'] ?? '')
  draft.value = {
    code: String(row['监控编号'] ?? ''),
    indicator: String(row['监控指标'] ?? ''),
    limitText: String(row['限值要求'] ?? ''),
    rawValue: String(row['实测值'] ?? ''),
    factor: String(row['折算系数'] ?? '1'),
    monitorDate: String(row['监控日期'] ?? ''),
    operator: String(row['监控人员'] ?? ''),
  }
  showForm.value = true
}

function submitDraft() {
  errorMessage.value = ''
  const result = submitMonitoring(draft.value)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  errorMessage.value = result.message
  closeCreate()
  reload()
}

function submitRow(row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), '提交监控')
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function judge(code: string) {
  errorMessage.value = ''
  const result = judgeAndArchive(code)
  errorMessage.value = result.message
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    rows.value = listCompliance(filters.value)
    // 触发一次按编号取数，确保页面与上报表、大屏走的是同一个入口。
    if (rows.value.length > 0 && !complianceByCode(rows.value[0].result.code)) {
      throw new Error('按监控编号取数失败，三处口径不一致')
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '环保指标监控列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.conclusion-pass {
  color: #067647;
  font-weight: 600;
}
.conclusion-fail {
  color: #b42318;
  font-weight: 600;
}
.archived-text {
  color: var(--muted);
  font-size: 12px;
}
.page-actions {
  display: flex;
  gap: 8px;
}
</style>
