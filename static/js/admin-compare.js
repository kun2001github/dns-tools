/**
 * DNS Tools 管理后台 - 历史对比模块
 * 负责跨时间对比
 */

document.addEventListener('DOMContentLoaded', function() {
    // 加载历史记录列表
    loadHistoryList();
    
    // 监听Tab切换事件
    document.addEventListener('tabChanged', function(e) {
        if (e.detail.tab === 'history') {
            loadHistoryList();
        }
    });
    
    // 绑定对比按钮事件
    document.getElementById('compare-time-btn').addEventListener('click', compareByTime);
});

async function loadHistoryList() {
    try {
        const response = await fetch('/api/admin/history/list?limit=100');
        const data = await response.json();
        
        const selects = [
            document.getElementById('history-select-a'),
            document.getElementById('history-select-b')
        ];
        
        selects.forEach(select => {
            const firstOption = select.options[0];
            select.innerHTML = '';
            select.appendChild(firstOption);
            
            if (data.history && Array.isArray(data.history)) {
                data.history.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = `${item.id} - ${item.timestamp} (${item.domains?.length || 0}个域名)`;
                    select.appendChild(option);
                });
            }
        });
    } catch (error) {
        console.error('加载历史记录失败:', error);
        showMessage('加载历史记录失败', 'error');
    }
}

async function compareByTime() {
    const fromId = document.getElementById('history-select-a').value;
    const toId = document.getElementById('history-select-b').value;
    const container = document.getElementById('compare-time-result');
    
    if (!fromId || !toId) {
        showMessage('请选择两次查询记录', 'error');
        return;
    }
    
    container.innerHTML = '<div class="loading">对比中...</div>';
    
    try {
        const response = await fetch(`/api/admin/history/compare?from_id=${fromId}&to_id=${toId}`);
        const data = await response.json();
        
        if (data.comparison) {
            renderTimeComparison(data, container);
        } else {
            container.innerHTML = '<p>对比失败或无数据</p>';
        }
    } catch (error) {
        console.error('对比失败:', error);
        container.innerHTML = '<p class="error">对比失败</p>';
    }
}

function renderTimeComparison(data, container) {
    const { comparison, from, to } = data;
    
    let html = `
        <h3>对比结果</h3>
        <p>查询 A: ${from.id} (${from.timestamp})</p>
        <p>查询 B: ${to.id} (${to.timestamp})</p>
        
        <table class="result-table">
            <thead>
                <tr>
                    <th>域名</th>
                    <th>变更类型</th>
                    <th>旧结果</th>
                    <th>新结果</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // 新增的域名
    comparison.added.forEach(item => {
        html += `
            <tr>
                <td>${item.domain}</td>
                <td><span class="status-indicator ok"></span>新增</td>
                <td>-</td>
                <td>${formatResult(item.result)}</td>
            </tr>
        `;
    });
    
    // 删除的域名
    comparison.removed.forEach(item => {
        html += `
            <tr>
                <td>${item.domain}</td>
                <td><span class="status-indicator error"></span>删除</td>
                <td>${formatResult(item.result)}</td>
                <td>-</td>
            </tr>
        `;
    });
    
    // 变更的域名
    comparison.changed.forEach(item => {
        html += `
            <tr>
                <td>${item.domain}</td>
                <td><span class="status-indicator" style="background: var(--warning-color)"></span>变更</td>
                <td>${formatResult(item.from)}</td>
                <td>${formatResult(item.to)}</td>
            </tr>
        `;
    });
    
    if (comparison.added.length === 0 && comparison.removed.length === 0 && comparison.changed.length === 0) {
        html += '<tr><td colspan="4">无差异</td></tr>';
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function formatResult(result) {
    if (!result) return '-';
    if (typeof result === 'string') return result;
    if (Array.isArray(result)) return result.join(', ');
    if (typeof result === 'object') {
        return JSON.stringify(result);
    }
    return String(result);
}
