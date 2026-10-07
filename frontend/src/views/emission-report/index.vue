<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>环保口上报表</h2>
        <p class="page-desc">
          上报给环保口的报表：实测值按基准氧 9% 折算后判达标，判定结论与监控清单、运营大屏共用同一份实现，不再各算一遍。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="reload">重新取数</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">上报记录数</span>
        <strong class="stat-value">{{ rows.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">达标</span>
        <strong class="stat-value verdict-pass">{{ countOf('达标') }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">未达标</span>
        <strong class="stat-value verdict-fail">{{ countOf('未达标') }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待判定</span>
        <strong class="stat-value verdict-pending">{{ countOf('待判定') }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent>
      <label class="filter-item">
        <span>按监控编号/指标检索</span>
        <input v-model="keyword" placeholder="输入编号或指标关键字" />
      </label>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>监控编号</th>
          <th>监控指标</th>
          <th>实测值</th>
          <th>含氧量</th>
          <th>折算值</th>
          <th>限值要求</th>
          <th>达标结论</th>
          <th>判定依据</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in filteredRows" :key="row.code">
          <td>{{ row.code }}</td>
          <td>{{ row.indicator }}</td>
          <td>{{ row.measured }}</td>
          <td>{{ row.oxygen || '—' }}</td>
          <td>{{ row.converted }}</td>
          <td>{{ row.limit }}</td>
          <td :class="verdictClass(row.verdict)">
            {{ row.verdict }}<span v-if="row.archived" class="archived-tag">留档</span>
          </td>
          <td class="basis-cell">{{ row.basis }}</td>
        </tr>
        <tr v-if="!filteredRows.length">
          <td colspan="8" class="empty-state">暂无可上报的环保监控记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>结论按监控编号取自达标判定共用实现，与监控清单、运营大屏完全一致</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { getEmissionReportRows, type EmissionReportRow } from '@/api/compliance-service'

const rows = ref<EmissionReportRow[]>([])
const keyword = ref('')

const filteredRows = computed(() => {
  const word = keyword.value.trim()
  if (!word) {
    return rows.value
  }
  return rows.value.filter((row) => row.code.includes(word) || row.indicator.includes(word))
})

function countOf(verdict: string): number {
  return rows.value.filter((row) => row.verdict === verdict).length
}

function verdictClass(verdict: string): string {
  if (verdict === '达标') return 'verdict-pass'
  if (verdict === '未达标') return 'verdict-fail'
  return 'verdict-pending'
}

function reload() {
  rows.value = getEmissionReportRows()
}

onMounted(reload)
</script>

<style scoped>
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
.basis-cell { color: var(--muted); max-width: 360px; }
</style>
