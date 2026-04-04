/**
 * 网址请求分析前端逻辑
 */

// 全局变量
let currentTaskId = null;
let pollingInterval = null;
let allRequests = [];
let currentFilter = 'all';
let allHistoryData = []; // 存储所有历史记录用于搜索

// 开始分析
async function startAnalysis() {
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    
    if (!url) {
        alert('请输入网址');
        return;
    }
    
    // 显示加载状态
    showLoading();
    
    // 立即显示步骤进度，让用户看到过渡
    const initialSteps = [
        '正在启动浏览器...',
        '[1/10] 正在初始化...',
        '[2/10] 正在启动浏览器...',
        '[3/10] 正在创建浏览器上下文...'
    ];
    let stepIndex = 0;
    updateLoadingStatus(initialSteps[0]);
    
    // 快速切换前几个步骤，制造过渡效果
    const quickStepInterval = setInterval(() => {
        stepIndex++;
        if (stepIndex < initialSteps.length) {
            updateLoadingStatus(initialSteps[stepIndex]);
        } else {
            clearInterval(quickStepInterval);
        }
    }, 200);
    
    try {
        // 启动分析任务
        const response = await fetch('/api/performance/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url })
        });
        
        const data = await response.json();
        
        clearInterval(quickStepInterval);  // 清除快速步骤定时器
        
        if (data.error) {
            showError(data.error);
            return;
        }
        
        currentTaskId = data.task_id;
        
        // 开始轮询结果
        pollingInterval = setInterval(async () => {
            try {
                const url = `/api/performance/result/${currentTaskId}`;
                const response = await fetch(url);
                const result = await response.json();
                
                if (result.status === 'completed') {
                    clearInterval(pollingInterval);
                    updateLoadingStatus('分析完成！');
                    const data = result.data || result;
                    displayResults(data);
                } else if (result.status === 'error') {
                    clearInterval(pollingInterval);
                    showError(result.error || '分析失败');
                } else if (result.status === 'running') {
                    // 更新步骤状态
                    updateLoadingStatus(result.message);
                }
                
            } catch (error) {
                clearInterval(pollingInterval);
                showError('获取结果失败: ' + error.message);
            }
        }, 800);
    } catch (error) {
        showError('请求失败: ' + error.message);
    }
}

// 显示加载状态
function showLoading() {
    document.getElementById('loadingState').style.display = 'block';
    document.getElementById('errorState').style.display = 'none';
    document.getElementById('resultsContainer').style.display = 'none';
}

// 更新加载状态文本
function updateLoadingStatus(message) {
    document.getElementById('loadingStatus').textContent = message;
}

// 显示错误
function showError(message) {
    clearInterval(pollingInterval);
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
}

// 显示结果
function displayResults(data) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'none';
    document.getElementById('resultsContainer').style.display = 'block';
    
    // 保存所有请求数据
    allRequests = data.requests || [];
    
    // 确保每个请求都有 category 字段
    allRequests.forEach(req => {
        if (!req.category) {
            req.category = 'main';
        }
    });
    
    // 渲染 Timing 甘特图
    renderTimingGantt(data.timing);
    
    // 渲染域名耗时对比图表（含统计标签）
    renderDomainDurationChart(data.domain_duration_stats, data.domain_stats);
    
    // 渲染网络请求表格（默认显示全部）
    renderRequestsTable();
    
    // 更新分析次数统计
    loadAnalysisCount();
}

// 渲染 Timing 甘特图
function renderTimingGantt(timing) {
    const ganttChart = document.getElementById('ganttChart');
    const ganttLegend = document.getElementById('ganttLegend');
    
    if (!timing) {
        ganttChart.innerHTML = '<p style="color: var(--text-dim); text-align: center;">暂无 Timing 数据</p>';
        return;
    }
    
    const totalTime = timing.total || timing.load || 0;
    document.getElementById('totalTime').textContent = totalTime + ' ms';
    
    // 定义各阶段的颜色和标签
    const phases = [
        { key: 'unload', label: 'Unload', color: '#ef4444' },
        { key: 'redirect', label: 'Redirect', color: '#f97316' },
        { key: 'appCache', label: 'AppCache', color: '#f59e0b' },
        { key: 'dns', label: 'DNS', color: '#84cc16' },
        { key: 'tcp', label: 'TCP', color: '#22c55e' },
        { key: 'ssl', label: 'SSL', color: '#14b8a6' },
        { key: 'ttfb', label: 'TTFB', color: '#06b6d4' },
        { key: 'transfer', label: 'Transfer', color: '#3b82f6' },
        { key: 'domInteractive', label: 'DOM Interactive', color: '#8b5cf6' },
        { key: 'domComplete', label: 'DOM Complete', color: '#a855f7' },
        { key: 'dcl', label: 'DCL', color: '#d946ef' },
        { key: 'load', label: 'Load', color: '#ec4899' }
    ];
    
    // 生成甘特图
    let chartHtml = '';
    let legendHtml = '';
    
    phases.forEach(phase => {
        const value = timing[phase.key] || 0;
        if (value > 0) {
            const percentage = totalTime > 0 ? ((value / totalTime) * 100).toFixed(1) : 0;
            
            chartHtml += `
                <div class="gantt-row">
                    <div class="gantt-label">${phase.label}</div>
                    <div class="gantt-bar-container">
                        <div class="gantt-bar" style="width: ${percentage}%; background-color: ${phase.color};"></div>
                        <span class="gantt-value">${value} ms (${percentage}%)</span>
                    </div>
                </div>
            `;
            
            legendHtml += `
                <div class="legend-item">
                    <span class="legend-color" style="background-color: ${phase.color};"></span>
                    <span class="legend-label">${phase.label}</span>
                </div>
            `;
        }
    });
    
    ganttChart.innerHTML = chartHtml || '<p style="color: var(--text-dim); text-align: center;">暂无数据</p>';
    ganttLegend.innerHTML = legendHtml;
}


function renderDomainDurationChart(domainStats, domainStatsSummary) {
    const chartContainer = document.getElementById('domainDurationChart');
    const summaryContainer = document.getElementById('domainStatsSummary');
    
    if (!domainStats || domainStats.length === 0) {
        chartContainer.innerHTML = '<p style="color: var(--text-dim); text-align: center;">暂无域名耗时数据</p>';
        summaryContainer.innerHTML = '';
        return;
    }
    
    // 保存当前筛选状态
    window._currentDomainFilter = window._currentDomainFilter || 'all';
    
    // 计算分类统计
    const mainCount = domainStatsSummary?.main?.count || 0;
    const relatedCount = domainStatsSummary?.related?.count || 0;
    const thirdPartyCount = domainStatsSummary?.third_party?.count || 0;
    const totalCount = mainCount + relatedCount + thirdPartyCount;
    const totalDomains = domainStats.length;  // 总共请求了多少个独立域名
    
    // 统计摘要 HTML - 标题同一行，添加点击事件
    summaryContainer.innerHTML = `
        <span class="total-domains-count" style="margin-left: 12px; color: #fbbf24; font-weight: 600; font-size: 0.85rem;">
            共 ${totalDomains} 个域名
        </span>
        <span class="domain-stats-inline" style="margin-left: 16px; display: inline-flex; align-items: center; gap: 8px; font-size: 0.85rem;">
            <span style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px 10px; border-radius: 8px; border: 1px solid transparent; transition: all 0.2s ease;" 
                  onclick="filterDomainStats('all', this)" 
                  class="domain-filter-btn ${window._currentDomainFilter === 'all' ? 'active' : ''}"
                  onmouseover="this.style.background='rgba(34,197,94,0.15)'" 
                  onmouseout="this.style.background=this.classList.contains('active')?'rgba(34,197,94,0.2)':'transparent'">
                <span class="domain-category-tag" style="background: linear-gradient(135deg, #22c55e, #16a34a); font-size: 0.75rem; padding: 4px 10px; box-shadow: 0 2px 4px rgba(34,197,94,0.3);">全部</span>
                <span style="color: #22c55e; font-weight: 700;">${totalCount}</span>
            </span>
            <span style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px 10px; border-radius: 8px; border: 1px solid transparent; transition: all 0.2s ease;" 
                  onclick="filterDomainStats('main', this)" 
                  class="domain-filter-btn ${window._currentDomainFilter === 'main' ? 'active' : ''}"
                  onmouseover="this.style.background='rgba(56,189,248,0.15)'" 
                  onmouseout="this.style.background=this.classList.contains('active')?'rgba(56,189,248,0.2)':'transparent'">
                <span class="domain-category-tag" style="background: linear-gradient(135deg, #38bdf8, #0ea5e9); font-size: 0.75rem; padding: 4px 10px; box-shadow: 0 2px 4px rgba(56,189,248,0.3);">请求域名</span>
                <span style="color: #38bdf8; font-weight: 700;">${mainCount}</span>
            </span>
            <span style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px 10px; border-radius: 8px; border: 1px solid transparent; transition: all 0.2s ease;" 
                  onclick="filterDomainStats('related', this)" 
                  class="domain-filter-btn ${window._currentDomainFilter === 'related' ? 'active' : ''}"
                  onmouseover="this.style.background='rgba(139,92,246,0.15)'" 
                  onmouseout="this.style.background=this.classList.contains('active')?'rgba(139,92,246,0.2)':'transparent'">
                <span class="domain-category-tag" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); font-size: 0.75rem; padding: 4px 10px; box-shadow: 0 2px 4px rgba(139,92,246,0.3);">同域域名</span>
                <span style="color: #8b5cf6; font-weight: 700;">${relatedCount}</span>
            </span>
            <span style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px 10px; border-radius: 8px; border: 1px solid transparent; transition: all 0.2s ease;" 
                  onclick="filterDomainStats('third_party', this)" 
                  class="domain-filter-btn ${window._currentDomainFilter === 'third_party' ? 'active' : ''}"
                  onmouseover="this.style.background='rgba(236,72,153,0.15)'" 
                  onmouseout="this.style.background=this.classList.contains('active')?'rgba(236,72,153,0.2)':'transparent'">
                <span class="domain-category-tag" style="background: linear-gradient(135deg, #ec4899, #db2777); font-size: 0.75rem; padding: 4px 10px; box-shadow: 0 2px 4px rgba(236,72,153,0.3);">三方域名</span>
                <span style="color: #ec4899; font-weight: 700;">${thirdPartyCount}</span>
            </span>
        </span>
    `;
    
    // 渲染图表（根据筛选过滤）
    renderDomainStatsFiltered(domainStats, domainStatsSummary);
}

// 渲染筛选后的域名统计
function renderDomainStatsFiltered(domainStats, domainStatsSummary) {
    const chartContainer = document.getElementById('domainDurationChart');
    const currentFilter = window._currentDomainFilter || 'all';
    
    let filteredStats = currentFilter === 'all' 
        ? domainStats 
        : domainStats.filter(item => item.category === currentFilter);
    
    // 应用排序
    filteredStats = getSortedDomainStats(filteredStats);
    
    const maxAvgDuration = Math.max(...(filteredStats.map(d => d.avg_duration || 0)));
    const maxAvgConcurrentDuration = Math.max(...(filteredStats.map(d => d.avg_concurrent_duration || 0)));
    const 实际最大耗时 = Math.max(maxAvgDuration, maxAvgConcurrentDuration);
    const 总刻度毫秒 = 实际最大耗时 + 100; // 最大值 + 100ms 缓冲
    
    // 固定刻度: 10个刻度，每个10%
    const 刻度百分比 = 100 / 10; // 固定10%
    
    let chartHtml = '';
    
    filteredStats.forEach(item => {
        const count = item.count || 0;
        const avgDuration = item.avg_duration || 0;
        const avgConcurrentDuration = item.avg_concurrent_duration || 0;
        
        // 计算条形宽度 - 基于动态最大值 + 500ms
        const durationWidth = Math.min((avgDuration / 总刻度毫秒) * 100, 100);
        const concurrentWidth = Math.min((avgConcurrentDuration / 总刻度毫秒) * 100, 100);
        
        // 获取分类标签和颜色
        let categoryLabel = '三方域名';
        let categoryColor = '#ec4899';
        if (item.category === 'main') {
            categoryLabel = '请求域名';
            categoryColor = '#38bdf8';
        } else if (item.category === 'related') {
            categoryLabel = '同域域名';
            categoryColor = '#8b5cf6';
        }
        
        // 计算耗时显示（美化毫秒值）- 先定义颜色
        const durationLevel = avgDuration > 500 ? 'high' : avgDuration > 100 ? 'medium' : 'low';
        const concurrentLevel = avgConcurrentDuration > 500 ? 'high' : avgConcurrentDuration > 100 ? 'medium' : 'low';
        
        const durationColor = durationLevel === 'high' ? '#f97316' : durationLevel === 'medium' ? '#38bdf8' : '#0ea5e9';
        const concurrentColor = concurrentLevel === 'high' ? '#f97316' : concurrentLevel === 'medium' ? '#22c55e' : '#16a34a';
        
        // 固定4位数的显示格式，用&nbsp;填充空格
        const formatDuration = (ms) => {
            const msStr = ms.toFixed(0);
            const paddedMs = msStr.padStart(4, '\u00A0'); // \u00A0 是 non-breaking space
            if (ms >= 1000) {
                return (ms / 1000).toFixed(1) + 's';
            }
            return `<span style="font-family: 'JetBrains Mono', monospace; color: ${durationColor}; font-weight: 600;">${paddedMs}<span style="font-size: 0.65rem; opacity: 0.7;">ms</span></span>`;
        };
        
        const formatDurationRight = (ms) => {
            const msStr = ms.toFixed(0);
            const paddedMs = msStr.padStart(4, '\u00A0');
            if (ms >= 1000) {
                return (ms / 1000).toFixed(1) + 's';
            }
            return `<span style="font-family: 'JetBrains Mono', monospace; color: ${concurrentColor}; font-weight: 600;">${paddedMs}<span style="font-size: 0.65rem; opacity: 0.7;">ms</span></span>`;
        };
        
        const avgDurationDisplay = avgDuration >= 1000 
            ? (avgDuration / 1000).toFixed(1) + 's' 
            : `<span style="font-family: 'JetBrains Mono', monospace; color: ${durationColor}; font-weight: 600;">${String(avgDuration.toFixed(0)).padStart(4, '\u00A0')}<span style="font-size: 0.65rem; opacity: 0.7;">ms</span></span>`;
        const avgConcurrentDisplay = avgConcurrentDuration >= 1000 
            ? (avgConcurrentDuration / 1000).toFixed(1) + 's' 
            : `<span style="font-family: 'JetBrains Mono', monospace; color: ${concurrentColor}; font-weight: 600;">${String(avgConcurrentDuration.toFixed(0)).padStart(4, '\u00A0')}<span style="font-size: 0.65rem; opacity: 0.7;">ms</span></span>`;
        
        // 判断耗时级别用于颜色深浅 (保留用于后续逻辑)
        
        chartHtml += `
            <div class="duration-chart-row" onmouseenter="this.style.background='rgba(56, 189, 248, 0.05)'" onmouseleave="this.style.background='transparent'" style="padding: 8px 12px; margin-bottom: 0; border-bottom: 1px solid rgba(51, 65, 85, 0.3); transition: all 0.15s ease; display: flex; align-items: center;">
                <span class="domain-count-tag" style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; color: #94a3b8; font-weight: 600; min-width: 24px; text-align: center;">${count}</span>
                <span class="domain-category-tag" style="background: ${categoryColor}; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; color: white; font-weight: 600;">${categoryLabel}</span>
                <div class="duration-domain" title="${item.domain}" onclick="copySingleDomain(event, '${item.domain}')" style="cursor: pointer; flex: 1; min-width: 120px; font-size: 0.75rem; color: #e2e8f0; overflow: visible; white-space: normal; word-break: break-all;">${item.domain}</div>
                <div class="duration-bars-container" style="flex: 2; display: flex; align-items: center; position: relative; margin-left: 12px;">
                    <div style="position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.15); z-index: 1;"></div>
                    <!-- 左侧: 进度条(从右往左) + 数值(在中间) -->
                    <div style="flex: 1; display: flex; align-items: center; position: relative; z-index: 1;">
                        <div style="flex: 1; height: 22px; background: transparent; border-radius: 6px; overflow: hidden; position: relative;">
                            <!-- 进度条: 从右往左 -->
                            <div style="width: ${durationWidth}%; height: 100%; background: linear-gradient(135deg, ${durationColor}dd, ${durationColor}); border-radius: 5px; position: relative; margin-left: auto;"></div>
                        </div>
                        <!-- 数值显示在中间 -->
                        <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: ${durationColor}; font-weight: 600; white-space: nowrap; min-width: 50px; text-align: center;">${avgDurationDisplay}</span>
                    </div>
                    <!-- 右侧: 数值(在中间) + 进度条(从左往右) -->
                    <div style="flex: 1; display: flex; align-items: center; position: relative; z-index: 1;">
                        <!-- 数值显示在中间 -->
                        <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: ${concurrentColor}; font-weight: 600; white-space: nowrap; min-width: 50px; text-align: center;">${avgConcurrentDisplay}</span>
                        <div style="flex: 1; height: 22px; background: transparent; border-radius: 6px; overflow: hidden; position: relative;">
                            <!-- 进度条: 从左往右 -->
                            <div style="width: ${concurrentWidth}%; height: 100%; background: linear-gradient(135deg, ${concurrentColor}dd, ${concurrentColor}); border-radius: 5px; position: relative;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    // 保存到全局变量供复制按钮使用
    window._domainDurationStats = domainStats;
    
    chartContainer.innerHTML = chartHtml;
}

// 筛选域名统计
function filterDomainStats(category, element) {
    window._currentDomainFilter = category;
    
    // 更新按钮激活状态
    document.querySelectorAll('.domain-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (element) {
        element.classList.add('active');
    }
    
    // 获取筛选后的域名数量并更新显示
    const domainStats = window._domainDurationStats || [];
    let filteredCount = domainStats.length;
    let labelText = '个域名';
    
    if (category === 'main') {
        filteredCount = domainStats.filter(item => item.category === 'main').length;
        labelText = '个请求域名';
    } else if (category === 'related') {
        filteredCount = domainStats.filter(item => item.category === 'related').length;
        labelText = '个同域域名';
    } else if (category === 'third_party') {
        filteredCount = domainStats.filter(item => item.category === 'third_party').length;
        labelText = '个三方域名';
    }
    
    // 更新域名数量显示
    const summaryContainer = document.getElementById('domainStatsSummary');
    if (summaryContainer) {
        const countSpan = summaryContainer.querySelector('.total-domains-count');
        if (countSpan) {
            countSpan.textContent = `${filteredCount} ${labelText}`;
        }
    }
    
    // 重新渲染图表
    renderDomainStatsFiltered(window._domainDurationStats, null);
}

// 筛选请求
function filterRequests(filter) {
    currentFilter = filter;
    
    // 更新标签状态
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.filter === filter) {
            tab.classList.add('active');
        }
    });
    
    // 重新渲染表格
    renderRequestsTable();
}

// 渲染请求表格
function renderRequestsTable() {
    const tbody = document.getElementById('requestsTableBody');
    const statsEl = document.getElementById('requestsStats');
    
    // 过滤请求
    let filteredRequests = allRequests;
    if (currentFilter !== 'all') {
        filteredRequests = allRequests.filter(req => {
            return req.category === currentFilter;
        });
    }
    
    // 更新统计信息
    document.getElementById('totalRequestsCount').textContent = filteredRequests.length;
    
    if (filteredRequests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-dim);">暂无数据</td></tr>';
        return;
    }
    
    // 渲染请求行
    const rows = filteredRequests.map(req => {
        const statusClass = getStatusClass(req.status);
        const duration = req.duration ? req.duration.toFixed(2) : '-';
        
        return `
            <tr>
                <td class="url-cell" title="${escapeHtml(req.url)}">${escapeHtml(truncateUrl(req.url))}</td>
                <td><span class="method-badge">${req.method || '-'}</span></td>
                <td><span class="status-badge ${statusClass}">${req.status || '-'}</span></td>
                <td>${req.resource_type || '-'}</td>
                <td>${duration} ms</td>
                <td class="domain-cell">${escapeHtml(req.domain || '-')}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = rows.join('');
}

// 获取状态样式类
function getStatusClass(status) {
    if (!status) return '';
    if (status >= 200 && status < 300) return 'status-success';
    if (status >= 300 && status < 400) return 'status-redirect';
    if (status >= 400 && status < 500) return 'status-client-error';
    if (status >= 500) return 'status-server-error';
    return '';
}

// 转义 HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 截断 URL
function truncateUrl(url, maxLength = 60) {
    if (!url) return '';
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
}

// 页面加载完成后
document.addEventListener('DOMContentLoaded', function() {
    // 绑定回车键事件
    document.getElementById('urlInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            startAnalysis();
        }
    });
    
    // 加载历史记录和统计
    loadPerformanceHistory();
    loadAnalysisCount();
});

// 加载分析次数统计
async function loadAnalysisCount() {
    try {
        const response = await fetch('/api/performance/count');
        const data = await response.json();
        
        if (data.error) {
            console.error('加载分析统计失败:', data.error);
            return;
        }
        
        const countEl = document.getElementById('analysisCount');
        if (countEl) {
            countEl.textContent = `📊 累计已分析 ${data.count || 0} 次`;
        }
    } catch (error) {
        console.error('加载分析统计失败:', error);
    }
}

// 加载性能分析历史记录
async function loadPerformanceHistory() {
    try {
        const response = await fetch('/api/performance/history?limit=50');
        const data = await response.json();
        
        if (data.error) {
            console.error('加载历史记录失败:', data.error);
            return;
        }
        
        // 保存到全局变量用于搜索
        allHistoryData = data.history || [];
        renderHistoryList(allHistoryData);
    } catch (error) {
        console.error('加载历史记录失败:', error);
    }
}

// 搜索/过滤历史记录
function filterHistory(searchText) {
    if (!searchText || !searchText.trim()) {
        renderHistoryList(allHistoryData);
        return;
    }
    
    const keyword = searchText.toLowerCase().trim();
    const filtered = allHistoryData.filter(item => {
        const url = (item.url || '').toLowerCase();
        const date = (item.date || '').toLowerCase();
        const time = (item.time || '').toLowerCase();
        return url.includes(keyword) || date.includes(keyword) || time.includes(keyword);
    });
    
    renderHistoryList(filtered);
}

// 渲染历史记录列表
function renderHistoryList(history) {
    const historyList = document.getElementById('historyList');
    
    if (!history || history.length === 0) {
        historyList.innerHTML = '<p style="color: var(--text-dim); font-size: 0.85rem; text-align: center; padding: 20px 0;">暂无历史记录</p>';
        return;
    }
    
    let html = '';
    
    history.forEach(item => {
        const url = item.url || '-';
        const totalRequests = item.total_requests || 0;
        const totalDurationMs = item.total_duration_ms || 0;
        const timestamp = item.timestamp || '';
        const date = item.date || '';
        const time = item.time || '';
        const analysisId = item.analysis_id || '';
        
        // 格式化URL显示（截断）
        const displayUrl = url.length > 35 ? url.substring(0, 35) + '...' : url;
        
        html += `
            <div class="history-item" onclick="loadHistoryDetail('${analysisId}')" style="padding: 12px; margin-bottom: 8px; background: rgba(15, 23, 42, 0.4); border-radius: 8px; cursor: pointer; transition: all 0.2s ease;" 
                 onmouseover="this.style.background='rgba(56, 189, 248, 0.15)'" 
                 onmouseout="this.style.background='rgba(15, 23, 42, 0.4)'">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 0.8rem; color: var(--text-color); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;" title="${escapeHtml(url)}">${escapeHtml(displayUrl)}</span>
                    <button type="button" onclick="deleteHistoryItem(event, '${analysisId}')" style="background: transparent; border: none; color: var(--text-dim); cursor: pointer; padding: 4px; border-radius: 4px; margin-left: 8px;" title="删除">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-dim);">
                    <span style="display: flex; align-items: center; gap: 8px;">
                        <span style="display: flex; align-items: center; gap: 4px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <path d="M12 6v6l4 2"></path>
                            </svg>
                            <span>${totalDurationMs} ms</span>
                        </span>
                        <span style="display: flex; align-items: center; gap: 4px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                            </svg>
                            <span>${totalRequests} 请求</span>
                        </span>
                    </span>
                    <span>${date} ${time}</span>
                </div>
            </div>
        `;
    });
    
    historyList.innerHTML = html;
}

// 加载历史记录详情
async function loadHistoryDetail(analysisId) {
    if (!analysisId) return;
    
    try {
        const response = await fetch(`/api/performance/history/${analysisId}`);
        const data = await response.json();
        
        if (data.error) {
            alert('加载历史记录失败: ' + data.error);
            return;
        }
        
        const record = data.data;
        if (!record) {
            alert('记录不存在');
            return;
        }
        
        // 填充输入框
        document.getElementById('urlInput').value = record.url;
        
        // 显示结果
        const resultData = {
            url: record.url,
            timing: record.timing_data || {},
            domain_duration_stats: record.domain_stats || [],
            domain_stats: calculateDomainStats(record.domain_stats || []),
            requests: record.requests_data || []
        };
        
        displayResults(resultData);
        
        // 滚动到结果区域
        document.getElementById('resultsContainer').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        alert('加载历史记录失败: ' + error.message);
    }
}

// 计算域名统计汇总
function calculateDomainStats(domainStats) {
    const stats = {
        main: { count: 0, total_time: 0 },
        related: { count: 0, total_time: 0 },
        third_party: { count: 0, total_time: 0 }
    };
    
    if (!domainStats) return stats;
    
    domainStats.forEach(item => {
        const category = item.category || 'third_party';
        if (stats[category]) {
            stats[category].count += item.count || 0;
            stats[category].total_time += item.total_duration || 0;
        }
    });
    
    return stats;
}

// 删除历史记录
async function deleteHistoryItem(event, analysisId) {
    event.stopPropagation();
    
    if (!analysisId) return;
    
    if (!confirm('确定要删除这条历史记录吗？')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/performance/history/${analysisId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.error) {
            alert('删除失败: ' + data.error);
            return;
        }
        
        // 重新加载历史记录
        loadPerformanceHistory();
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// 清空所有历史记录
async function clearPerformanceHistory() {
    if (!confirm('确定要清空所有历史记录吗？此操作不可恢复。')) {
        return;
    }
    
    try {
        const response = await fetch('/api/performance/history', {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.error) {
            alert('清空失败: ' + data.error);
            return;
        }
        
        // 重新加载历史记录
        loadPerformanceHistory();
    } catch (error) {
        alert('清空失败: ' + error.message);
    }
}

// 复制域名（根据当前筛选状态）
function copyAllDomains(event) {
    const allDomainStats = window._domainDurationStats || [];
    const currentFilter = window._currentDomainFilter || 'all';
    
    if (!allDomainStats || allDomainStats.length === 0) {
        showCopyTip('暂无域名数据', 'error', event);
        return;
    }
    
    // 根据筛选状态过滤域名
    let domainStats;
    let filterLabel;
    if (currentFilter === 'all') {
        domainStats = allDomainStats;
        filterLabel = '全部';
    } else {
        domainStats = allDomainStats.filter(item => item.category === currentFilter);
        filterLabel = currentFilter === 'main' ? '请求域名' : currentFilter === 'related' ? '同域域名' : '三方域名';
    }
    
    // 提取域名列表
    const domains = domainStats.map(item => item.domain).filter(d => d);
    
    if (domains.length === 0) {
        showCopyTip('暂无域名可复制', 'error', event);
        return;
    }
    
    const domainText = domains.join('\n');
    
    navigator.clipboard.writeText(domainText).then(() => {
        showCopyTip(`✅ 已复制 ${domains.length} 个域名（${filterLabel}）`, 'success', event);
    }).catch(() => {
        showCopyTip('复制失败', 'error', event);
    });
}

// 显示复制提示（跟随鼠标位置）
function showCopyTip(message, type, event) {
    const tipEl = document.getElementById('copySuccessTip');
    if (!tipEl) return;
    
    tipEl.textContent = message;
    tipEl.style.color = type === 'success' ? '#fff' : '#ef4444';
    tipEl.style.background = type === 'success' ? 'rgba(34, 197, 94, 0.95)' : 'rgba(239, 68, 68, 0.95)';
    tipEl.style.opacity = '1';
    
    // 跟随鼠标位置
    if (event && event.clientX && event.clientY) {
        tipEl.style.left = (event.clientX + 10) + 'px';
        tipEl.style.top = (event.clientY + 10) + 'px';
        tipEl.style.position = 'fixed';
        tipEl.style.marginLeft = '0';
    }
    
    setTimeout(() => {
        tipEl.style.opacity = '0';
    }, 2000);
}

// 复制单个域名
function copySingleDomain(event, domain) {
    if (!domain) return;
    
    event.stopPropagation();
    
    navigator.clipboard.writeText(domain).then(() => {
        showCopyTip(`✅ 已复制：${domain}`, 'success', event);
    }).catch(() => {
        showCopyTip('复制失败', 'error', event);
    });
}

// 排序域名统计
function sortDomainStats(sortType, btnElement) {
    // 更新按钮状态
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.borderColor = 'var(--border-color)';
        btn.style.color = 'var(--text-dim)';
    });
    btnElement.classList.add('active');
    btnElement.style.background = 'rgba(56, 189, 248, 0.15)';
    btnElement.style.borderColor = 'rgba(56, 189, 248, 0.3)';
    btnElement.style.color = '#38bdf8';
    
    // 保存排序类型
    window._domainSortType = sortType;
    
    // 重新渲染
    renderDomainStatsFiltered(window._domainDurationStats, null);
}

// 获取排序后的数据
function getSortedDomainStats(domainStats) {
    const sortType = window._domainSortType || 'count';
    const stats = [...domainStats];
    
    if (sortType === 'count') {
        // 按次数降序排序
        stats.sort((a, b) => (b.count || 0) - (a.count || 0));
    } else if (sortType === 'category') {
        // 按类型排序: 请求域名 > 同域域名 > 三方域名
        const categoryOrder = { 'main': 0, 'related': 1, 'third_party': 2 };
        stats.sort((a, b) => {
            const orderA = categoryOrder[a.category] ?? 3;
            const orderB = categoryOrder[b.category] ?? 3;
            return orderA - orderB;
        });
    } else if (sortType === 'avg_duration') {
        // 按平均耗时降序排序
        stats.sort((a, b) => (b.avg_duration || 0) - (a.avg_duration || 0));
    } else if (sortType === 'avg_concurrent_duration') {
        // 按平均并发耗时降序排序
        stats.sort((a, b) => (b.avg_concurrent_duration || 0) - (a.avg_concurrent_duration || 0));
    }
    
    return stats;
}

// 切换到 DNS ANALYST PRO
function switchToDnsAnalystPro() {
    const dnsUrl = window.location.origin + '/';
    
    // 使用 window.open 的窗口名特性：同名窗口会复用已有标签页
    // 尝试打开首页，如果有同名窗口则自动复用
    const newWindow = window.open(dnsUrl, 'dns_tools_main');
    
    if (newWindow) {
        // 成功打开/复用窗口，聚焦它
        newWindow.focus();
    } else {
        // 如果被弹出窗口拦截，则在当前标签页跳转
        window.location.href = dnsUrl;
    }
}

// 监听 BroadcastChannel 消息（让其他标签页知道自己被选中）
document.addEventListener('DOMContentLoaded', function() {
    // 只在首页添加监听
    if (window.location.pathname === '/' || window.location.pathname === '/index') {
        const channel = new BroadcastChannel('dns_tools_channel');
        
        channel.onmessage = function(event) {
            if (event.data.type === 'activate_tab') {
                // 收到激活请求，聚焦当前窗口并通知其他标签页
                window.focus();
                channel.postMessage({ type: 'tab_activated', tabId: window.name });
            }
        };
    }
});
