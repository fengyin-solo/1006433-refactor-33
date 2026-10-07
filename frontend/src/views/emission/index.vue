<template>
  <section class="page" data-module="emission">
    <header class="page-head">
      <div>
        <h2>环保指标监控管理</h2>
        <p class="page-desc">维护环保监控记录，限值要求与实测值的达标判定统一走共用实现；同一监控编号重复提交只保留一条。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记环保监控记录</button>
        <button class="btn" type="button" @click="exportRows">导出环保指标监控清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.verdict" class="legend-item">
        {{ item.verdict }}：{{ item.count }}
      </span>
      <span class="legend-item">其中历史结论留档：{{ overview.archived }}</span>
    </p>

    <form v-if="creating" class="filter-bar create-panel" @submit.prevent="submitRow">
      <label class="filter-item">
        <span>监控编号</span>
        <input v-model="form.code" placeholder="如 EMIS-0004" />
      </label>
      <label class="filter-item">
        <span>监控指标</span>
        <input v-model="form.indicator" placeholder="如 烟尘排放浓度" />
      </label>
      <label class="filter-item">
        <span>限值要求</span>
        <input v-model="form.limit" placeholder="如 ≤30 mg/m³" />
      </label>
      <label class="filter-item">
        <span>实测值</span>
        <input v-model="form.measured" placeholder="折算前实测浓度" />
      </label>
      <label class="filter-item">
        <span>含氧量（%）</span>
        <input v-model="form.oxygen" placeholder="留空则不折算" />
      </label>
      <label class="filter-item">
        <span>监控日期</span>
        <input v-model="form.date" type="date" />
      </label>
      <label class="filter-item">
        <span>监控人员</span>
        <input v-model="form.operator" />
      </label>
      <button class="btn primary" type="submit">提交</button>
      <button class="btn ghost" type="button" @click="creating = false">取消</button>
    </form>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>判定依据</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.code">
          <td>{{ row.code }}</td>
          <td>{{ row.indicator }}</td>
          <td>{{ row.limit }}</td>
          <td>{{ row.measured }}</td>
          <td>{{ row.oxygen || '—' }}</td>
          <td>{{ row.converted }}</td>
          <td :class="verdictClass(row.verdict)">{{ row.verdict }}<span v-if="row.archived" class="archived-tag">留档</span></td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-if="!row.archived && row.verdict !== '待判定'"
              class="link"
              type="button"
              @click="judge(row.code)"
            >
              执行达标判定
            </button>
            <button
              v-if="!row.archived && row.verdict === '待判定'"
              class="link"
              type="button"
              disabled
              title="实测值或限值不完整，补齐后重新提交"
            >
              待补齐数据
            </button>
            <span v-if="row.archived" class="archived-text">历史结论留档，不重算</span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无环保指标监控数据，可先登记环保监控记录</td>
        </tr>
      </tbody>
    </table>

    <p class="status-legend basis-list">
      <span v-for="row in rows" :key="`basis-${row.code}`" class="legend-item">
        {{ row.code }}：{{ row.basis }}
      </span>
    </p>

    <footer class="page-foot">
      <span>共 {{ total }} 条环保监控记录，结论由达标判定共用实现统一计算</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { downloadEntries } from '@/api/local-service'
import {
  getComplianceOverview,
  getEmissionReportRows,
  judgeEmission,
  submitEmission,
  type EmissionReportRow,
} from '@/api/compliance-service'

const columns = ["监控编号", "监控指标", "限值要求", "实测值", "含氧量", "折算值", "达标判定", "监控状态"]
const filterFieldNames = ["监控编号", "监控指标", "限值要求"]
const verdictOrder = ['达标', '未达标', '待判定']

const rows = ref<EmissionReportRow[]>([])
const allRows = ref<EmissionReportRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const creating = ref(false)
const filters = reactive<Record<string, string>>({ 监控编号: '', 监控指标: '', 限值要求: '' })
const form = reactive({ code: '', indicator: '', limit: '', measured: '', oxygen: '', date: '', operator: '' })

const overview = computed(() => getComplianceOverview())
const stats = computed(() => [
  { label: '待判定指标', value: overview.value.pending },
  { label: '已达标指标', value: overview.value.passed },
  { label: '未达标指标', value: overview.value.failed },
])
const filterFields = filterFieldNames
const statusSummary = computed(() =>
  verdictOrder.map((verdict) => ({
    verdict,
    count: allRows.value.filter((row) => row.verdict === verdict).length,
  })),
)

function verdictClass(verdict: string): string {
  if (verdict === '达标') return 'verdict-pass'
  if (verdict === '未达标') return 'verdict-fail'
  return 'verdict-pending'
}

function resetFilters() {
  filters.监控编号 = ''
  filters.监控指标 = ''
  filters.限值要求 = ''
  reload()
}

function exportRows() {
  downloadEntries('emission')
}

function openCreate() {
  errorMessage.value = ''
  creating.value = true
}

function submitRow() {
  errorMessage.value = ''
  const result = submitEmission({ ...form })
  errorMessage.value = result.ok ? '' : result.message
  if (!result.ok) {
    return
  }
  creating.value = false
  Object.assign(form, { code: '', indicator: '', limit: '', measured: '', oxygen: '', date: '', operator: '' })
  reload()
}

function judge(code: string) {
  errorMessage.value = ''
  const result = judgeEmission(code)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function matchesFilters(row: EmissionReportRow): boolean {
  return (
    row.code.includes(filters.监控编号.trim()) &&
    row.indicator.includes(filters.监控指标.trim()) &&
    row.limit.includes(filters.限值要求.trim())
  )
}

function reload() {
  errorMessage.value = ''
  allRows.value = getEmissionReportRows()
  rows.value = allRows.value.filter(matchesFilters)
  total.value = rows.value.length
}

onMounted(reload)
</script>

<style scoped>
.create-panel {
  align-items: flex-end;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
}
.verdict-pass { color: #067647; font-weight: 600; }
.verdict-fail { color: #b42318; font-weight: 600; }
.verdict-pending { color: var(--muted); }
.archived-tag {
  margin-left: 6px;
  background: #eef2f7;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 400;
}
.archived-text { color: var(--muted); font-size: 12px; }
.basis-list { margin-top: 10px; }
</style>
