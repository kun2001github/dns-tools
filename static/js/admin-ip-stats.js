/**
 * DNS Tools 管理后台 - 请求来源统计模块
 * 负责IP请求统计、明细查看等功能
 */

document.addEventListener('DOMContentLoaded', function() {
    // 初始化日期范围
    initializeDateRange();
    
    // 绑定日期按钮事件
    document.querySelectorAll('#tab-ip-stats .date-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const days = parseInt(this.dataset.days);
            setDateRange(days);
            
            // 更新按钮状态
            document.querySelectorAll('#tab-ip-stats .date-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // 绑定应用日期范围按钮
    document.getElementById('apply-ip-stats-date-range').addEventListener('click', loadIpStats);
    
    // 绑定关闭详细记录按钮
    document.getElementById('close-ip-detail').addEventListener('click', function() {
        document.getElementById('ip-detail-section').style.display = 'none';
    });
    
    // 监听Tab切换事件
    document.addEventListener('tabChanged', function(e) {
        if (e.detail.tab === 'ip-stats') {
            loadIpStats();
        }
    });
});

function initializeDateRange() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    document.getElementById('ip-stats-date-start').value = formatDate(startDate);
    document.getElementById('ip-stats-date-end').value = formatDate(endDate);
}

function setDateRange(days) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    document.getElementById('ip-stats-date-start').value = formatDate(startDate);
    document.getElementById('ip-stats-date-end').value = formatDate(endDate);
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

async function loadIpStats() {
    const startDate = document.getElementById('ip-stats-date-start').value;
    const endDate = document.getElementById('ip-stats-date-end').value;
    
    try {
        const response = await fetch(`/api/admin/stats/by-ip?start=${startDate}&end=${endDate}`);
        const data = await response.json();
        
        if (response.ok) {
            renderIpStatsTable(data.data);
        } else {
            showMessage(data.error || '加载IP统计失败', 'error');
        }
    } catch (error) {
        console.error('加载IP统计失败:', error);
        showMessage('加载IP统计失败', 'error');
    }
}

function renderIpStatsTable(stats) {
    const tbody = document.getElementById('ip-stats-tbody');
    tbody.innerHTML = '';
    
    if (!stats || stats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-message">暂无数据</td></tr>';
        return;
    }
    
    stats.forEach(stat => {
        const tr = document.createElement('tr');
        
        // 域名列表显示（最多显示5个）
        const domains = stat.domains || [];
        const domainsText = domains.length > 5 
            ? domains.slice(0, 5).join(', ') + `... (共${domains.length}个)`
            : domains.join(', ') || '-';
        
        tr.innerHTML = `
            <td class="ip-cell">${stat.ip}</td>
            <td class="count-cell">${stat.request_count}</td>
            <td class="count-cell">${stat.domain_count}</td>
            <td class="domains-cell" title="${domains.join('\n')}">${domainsText}</td>
            <td class="action-cell">
                <button class="view-detail-btn" data-ip="${stat.ip}">查看详情</button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
    // 绑定查看详情按钮事件
    tbody.querySelectorAll('.view-detail-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const ip = this.dataset.ip;
            loadIpDetail(ip);
        });
    });
}

async function loadIpDetail(ip) {
    const startDate = document.getElementById('ip-stats-date-start').value;
    const endDate = document.getElementById('ip-stats-date-end').value;
    
    try {
        const response = await fetch(`/api/admin/stats/by-ip-detail?ip=${encodeURIComponent(ip)}&start=${startDate}&end=${endDate}`);
        const data = await response.json();
        
        if (response.ok) {
            renderIpDetailTable(ip, data.data);
            document.getElementById('ip-detail-section').style.display = 'block';
        } else {
            showMessage(data.error || '加载IP详情失败', 'error');
        }
    } catch (error) {
        console.error('加载IP详情失败:', error);
        showMessage('加载IP详情失败', 'error');
    }
}

function renderIpDetailTable(ip, details) {
    document.getElementById('detail-ip').textContent = ip;
    const tbody = document.getElementById('ip-detail-tbody');
    tbody.innerHTML = '';
    
    if (!details || details.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-message">暂无数据</td></tr>';
        return;
    }
    
    details.forEach(detail => {
        const tr = document.createElement('tr');
        
        // 格式化响应时间
        const responseTime = detail.response_time_ms 
            ? `${detail.response_time_ms}ms` 
            : '-';
        
        // 状态码样式
        const statusClass = detail.status_code >= 400 ? 'status-error' : 'status-success';
        
        // 域名列表
        const domains = detail.domains || [];
        const domainsText = domains.length > 3 
            ? domains.slice(0, 3).join(', ') + `... (共${domains.length}个)`
            : domains.join(', ') || '-';
        
        tr.innerHTML = `
            <td class="time-cell">${detail.timestamp}</td>
            <td class="endpoint-cell">${detail.endpoint}</td>
            <td class="domains-cell" title="${domains.join('\n')}">${domainsText}</td>
            <td class="time-cell">${responseTime}</td>
            <td class="${statusClass}">${detail.status_code}</td>
        `;
        
        tbody.appendChild(tr);
    });
}

// 显示消息函数（如果不存在则定义）
if (typeof showMessage === 'undefined') {
    function showMessage(message, type = 'success') {
        // 创建消息元素
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 4px;
            color: white;
            z-index: 1000;
            animation: fadeIn 0.3s ease;
        `;
        
        if (type === 'error') {
            messageDiv.style.backgroundColor = '#f44336';
        } else {
            messageDiv.style.backgroundColor = '#4caf50';
        }
        
        document.body.appendChild(messageDiv);
        
        // 3秒后自动消失
        setTimeout(() => {
            messageDiv.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => messageDiv.remove(), 300);
        }, 3000);
    }
}
