<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
      </div>
    </header>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>

    <section class="compliance-board">
      <header class="board-head">
        <h3>环保达标监控</h3>
        <span class="board-note">结论按监控编号取自达标判定共用实现，与监控清单、环保口上报表一致，不再由监控状态凑</span>
      </header>
      <div class="stat-row">
        <article class="stat-card">
          <span class="stat-label">监控记录</span>
          <strong class="stat-value">{{ compliance.total }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">达标</span>
          <strong class="stat-value verdict-pass">{{ compliance.passed }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">未达标</span>
          <strong class="stat-value verdict-fail">{{ compliance.failed }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">待判定</span>
          <strong class="stat-value verdict-pending">{{ compliance.pending }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">达标率</span>
          <strong class="stat-value">{{ compliance.passRate }}%</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">历史结论留档</span>
          <strong class="stat-value">{{ compliance.archived }}</strong>
        </article>
      </div>
      <table class="data-table">
        <thead>
          <tr><th>监控编号</th><th>监控指标</th><th>折算值</th><th>限值要求</th><th>达标结论</th><th>判定依据</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in compliance.latest" :key="row.code">
            <td>{{ row.code }}</td>
            <td>{{ row.indicator }}</td>
            <td>{{ row.converted }}</td>
            <td>{{ row.limit }}</td>
            <td :class="verdictClass(row.verdict)">
              {{ row.verdict }}<span v-if="row.archived" class="archived-tag">留档</span>
            </td>
            <td class="basis-cell">{{ row.basis }}</td>
          </tr>
          <tr v-if="!compliance.latest.length">
            <td colspan="6" class="empty-state">暂无环保监控记录</td>
          </tr>
        </tbody>
      </table>
    </section>

    <table class="data-table module-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>
    <footer class="page-foot">
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { loadOverview } from '@/api/local-service'
import { getComplianceOverview, type ComplianceOverview } from '@/api/compliance-service'
import type { OverviewResult } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const compliance = ref<ComplianceOverview>({
  total: 0,
  passed: 0,
  failed: 0,
  pending: 0,
  archived: 0,
  passRate: 0,
  latest: [],
})

function verdictClass(verdict: string): string {
  if (verdict === '达标') return 'verdict-pass'
  if (verdict === '未达标') return 'verdict-fail'
  return 'verdict-pending'
}

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  compliance.value = getComplianceOverview()
}

onMounted(refresh)
</script>

<style scoped>
.compliance-board {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}
.board-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 8px;
}
.board-head h3 { margin: 0; font-size: 15px; }
.board-note { color: var(--muted); font-size: 12px; }
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
.module-table { margin-top: 4px; }
</style>
