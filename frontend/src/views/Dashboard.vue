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
    <table class="data-table">
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
    <h3 class="section-title">环保达标监控（与监控清单、环保口上报表同一判定口径）</h3>
    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">监控记录</span>
        <strong class="stat-value">{{ compliance.total }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已达标</span>
        <strong class="stat-value conclusion-pass">{{ compliance.passed }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">未达标</span>
        <strong class="stat-value conclusion-fail">{{ compliance.failed }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待判定</span>
        <strong class="stat-value">{{ compliance.pending }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">历史留档（不重算）</span>
        <strong class="stat-value">{{ compliance.archived }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">月报台账已回写</span>
        <strong class="stat-value">{{ compliance.ledgerCount }}</strong>
      </article>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>监控编号</th><th>监控指标</th><th>限值</th><th>实测值</th><th>折算值</th><th>达标结论</th><th>判定依据</th><th>来源</th></tr>
      </thead>
      <tbody>
        <tr v-for="item in complianceRows" :key="item.code">
          <td>{{ item.code }}</td>
          <td>{{ item.indicator }}</td>
          <td>{{ item.limitValue ?? '—' }}</td>
          <td>{{ item.rawValue ?? '—' }}</td>
          <td>{{ item.convertedValue ?? '—' }}</td>
          <td :class="conclusionClass(item.conclusion)">{{ item.conclusion }}</td>
          <td>{{ item.basis }}</td>
          <td>{{ item.archived ? '历史留档' : '共用口径现算' }}</td>
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

import { complianceOverview, listCompliance } from '@/api/compliance'
import { loadOverview } from '@/api/local-service'
import type { ComplianceResult, OverviewResult } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const compliance = ref({ total: 0, passed: 0, failed: 0, pending: 0, archived: 0, ledgerCount: 0 })
const complianceRows = ref<ComplianceResult[]>([])

function conclusionClass(conclusion: ComplianceResult['conclusion']): string {
  if (conclusion === '已达标') {
    return 'conclusion-pass'
  }
  if (conclusion === '未达标') {
    return 'conclusion-fail'
  }
  return ''
}

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  compliance.value = complianceOverview()
  complianceRows.value = listCompliance().map((item) => item.result)
}

onMounted(refresh)
</script>

<style scoped>
.section-title {
  font-size: 15px;
  margin: 20px 0 8px;
}
.conclusion-pass {
  color: #067647;
  font-weight: 600;
}
.conclusion-fail {
  color: #b42318;
  font-weight: 600;
}
</style>
