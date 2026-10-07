<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>环保口达标上报与月报台账</h2>
        <p class="page-desc">
          上报表里的实测值折算与达标判定直接调用共用实现，与监控清单、运营大屏同源；判定为「已达标」的结论自动回写月报台账，同一监控编号只留一条。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="syncLedger">按留档结论重新对账</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">上报范围记录</span>
        <strong class="stat-value">{{ conclusions.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">达标（已回写台账）</span>
        <strong class="stat-value conclusion-pass">{{ ledgerRows.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">未达标（不进台账）</span>
        <strong class="stat-value conclusion-fail">{{ failedCount }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">历史留档（不重算）</span>
        <strong class="stat-value">{{ archivedCount }}</strong>
      </article>
    </div>

    <h3 class="section-title">一、月报上报表（折算后按限值判定）</h3>
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
          <th>监控编号</th>
          <th>监控指标</th>
          <th>限值要求</th>
          <th>实测值</th>
          <th>折算系数</th>
          <th>折算值</th>
          <th>达标结论</th>
          <th>判定依据</th>
          <th>监控日期</th>
          <th>结论来源</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in conclusions" :key="item.code">
          <td>{{ item.code }}</td>
          <td>{{ item.indicator }}</td>
          <td>{{ item.limitValue ?? '—' }}</td>
          <td>{{ item.rawValue ?? '—' }}</td>
          <td>{{ item.factor }}</td>
          <td>{{ item.convertedValue ?? '—' }}</td>
          <td :class="conclusionClass(item.conclusion)">{{ item.conclusion }}</td>
          <td>{{ item.basis }}</td>
          <td>{{ item.month }}</td>
          <td>{{ item.archived ? '历史留档' : '共用口径现算' }}</td>
        </tr>
        <tr v-if="!conclusions.length">
          <td colspan="10" class="empty-state">暂无可上报的监控记录</td>
        </tr>
      </tbody>
    </table>

    <h3 class="section-title">二、环保口月报台账（仅留档达标结论）</h3>
    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>台账月份</span>
        <input v-model="monthFilter" placeholder="如 2026-10" />
      </label>
      <button class="btn" type="submit">筛选</button>
      <button class="btn ghost" type="button" @click="monthFilter = ''; reload()">全部月份</button>
    </form>
    <table class="data-table">
      <thead>
        <tr>
          <th>月份</th>
          <th>监控编号</th>
          <th>监控指标</th>
          <th>限值要求</th>
          <th>实测值</th>
          <th>折算值</th>
          <th>达标判定</th>
          <th>判定依据</th>
          <th>监控日期</th>
          <th>监控人员</th>
          <th>回写时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in ledgerRows" :key="row.监控编号">
          <td>{{ row.月份 }}</td>
          <td>{{ row.监控编号 }}</td>
          <td>{{ row.监控指标 }}</td>
          <td>{{ row.限值要求 }}</td>
          <td>{{ row.实测值 }}</td>
          <td>{{ row.折算值 }}</td>
          <td class="conclusion-pass">{{ row.达标判定 }}</td>
          <td>{{ row.判定依据 }}</td>
          <td>{{ row.监控日期 }}</td>
          <td>{{ row.监控人员 }}</td>
          <td>{{ row.回写时间 }}</td>
        </tr>
        <tr v-if="!ledgerRows.length">
          <td colspan="11" class="empty-state">该月份暂无达标结论回写</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>台账行只增改不删除；同一监控编号重复回写以最新达标结论覆盖，历史留档记录不重算。</span>
      <span v-if="message" class="error-text">{{ message }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { listCompliance, listMonthlyLedger } from '@/api/compliance'
import type { ComplianceResult, LedgerRow } from '@/data/types'

const filters = ref<Record<string, string>>({ code: '', indicator: '' })
const monthFilter = ref('')
const message = ref('')
const conclusions = ref<ComplianceResult[]>([])
const ledgerRows = ref<LedgerRow[]>([])

const failedCount = computed(() => conclusions.value.filter((item) => item.conclusion === '未达标').length)
const archivedCount = computed(() => conclusions.value.filter((item) => item.archived).length)

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

function syncLedger() {
  message.value = ''
  ledgerRows.value = listMonthlyLedger(monthFilter.value.trim())
  reload()
  message.value = '已按历史留档的达标结论完成对账'
}

function reload() {
  message.value = ''
  conclusions.value = listCompliance(filters.value).map((item) => item.result)
  ledgerRows.value = listMonthlyLedger(monthFilter.value.trim())
}

onMounted(reload)
</script>

<style scoped>
.section-title {
  font-size: 15px;
  margin: 18px 0 8px;
}
.conclusion-pass {
  color: #067647;
  font-weight: 600;
}
.conclusion-fail {
  color: #b42318;
  font-weight: 600;
}
.page-actions {
  display: flex;
  gap: 8px;
}
</style>
