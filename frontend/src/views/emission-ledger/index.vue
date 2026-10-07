<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>环保口月报台账</h2>
        <p class="page-desc">
          判定达标的监控记录按监控编号回写到本月台账，同一编号同一月份只留一条；历史达标结论留档记录也已按当时结论补录。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="reload">刷新台账</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">台账条目</span>
        <strong class="stat-value">{{ rows.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">达标回写</span>
        <strong class="stat-value verdict-pass">{{ rows.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">覆盖月份</span>
        <strong class="stat-value">{{ monthCount }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent>
      <label class="filter-item">
        <span>台账月份</span>
        <select v-model="month">
          <option value="">全部月份</option>
          <option v-for="item in months" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>按监控编号/指标检索</span>
        <input v-model="keyword" placeholder="输入编号或指标关键字" />
      </label>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>台账编号</th>
          <th>台账月份</th>
          <th>监控编号</th>
          <th>监控指标</th>
          <th>实测值</th>
          <th>折算值</th>
          <th>限值要求</th>
          <th>判定结论</th>
          <th>判定依据</th>
          <th>回写时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in filteredRows" :key="String(row.id)">
          <td>{{ row['台账编号'] }}</td>
          <td>{{ row['台账月份'] }}</td>
          <td>{{ row['监控编号'] }}</td>
          <td>{{ row['监控指标'] }}</td>
          <td>{{ row['实测值'] }}</td>
          <td>{{ row['折算值'] }}</td>
          <td>{{ row['限值要求'] }}</td>
          <td class="verdict-pass">{{ row['判定结论'] }}</td>
          <td class="basis-cell">{{ row['判定依据'] }}</td>
          <td>{{ row['回写时间'] }}</td>
        </tr>
        <tr v-if="!filteredRows.length">
          <td colspan="10" class="empty-state">该月暂无达标回写记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>只有判定达标的记录才回写台账；未达标与待判定记录不进台账</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { getMonthlyLedger } from '@/api/compliance-service'
import type { LedgerRow } from '@/data/types'

const rows = ref<LedgerRow[]>([])
const month = ref('')
const keyword = ref('')

const months = computed(() => [...new Set(rows.value.map((row) => String(row['台账月份'] ?? '')))].sort().reverse())
const monthCount = computed(() => months.value.length)

const filteredRows = computed(() => {
  const word = keyword.value.trim()
  return rows.value.filter((row) => {
    const monthMatch = !month.value || String(row['台账月份'] ?? '') === month.value
    const keywordMatch =
      !word ||
      String(row['监控编号'] ?? '').includes(word) ||
      String(row['监控指标'] ?? '').includes(word)
    return monthMatch && keywordMatch
  })
})

function reload() {
  rows.value = getMonthlyLedger()
}

onMounted(reload)
</script>

<style scoped>
.verdict-pass { color: #067647; font-weight: 600; }
.basis-cell { color: var(--muted); max-width: 320px; }
</style>
