/**
 * DNS Tools 管理后台 - 仪表盘模块
 * 负责图表渲染和数据加载
 */

let dailyChart = null;
let typesChart = null;
let hourlyChart = null;
let currentDays = 7;

document.addEventListener('DOMContentLoaded', function() {
    // 初始化日期选择器
    initDateSelector();
    
    // 加载仪表盘数据
    loadDashboard();
    
    // 监听Tab切换事件
    document.addEventListener('tabChanged', function(e) {
        if (e.detail.tab === 'dashboard') {
            loadDashboard();
        }
    });
});

function initDateSelector() {
    const dateBtns = document.querySelectorAll('.date-btn');
    const dateStart = document.getElementById('date-start');
    const dateEnd = document.getElementById('date-end');
    const applyBtn = document.getElementById('apply-date-range');
    
    // 设置默认日期
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - currentDays);
    
    dateEnd.value = today.toISOString().split('T')[0];
    dateStart.value = startDate.toISOString().split('T')[0];
    
    // 快捷按钮点击
    dateBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            currentDays = parseInt(this.dataset.days);
            
            // 更新按钮状态
            dateBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // 更新日期输入框
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - currentDays);
            
            dateEnd.value = end.toISOString().split('T')[0];
            dateStart.value = start.toISOString().split('T')[0];
            
            // 重新加载数据
            loadDashboard();
        });
    });
    
    // 应用自定义日期范围
    applyBtn.addEventListener('click', function() {
        loadDashboard();
    });
}

async function loadDashboard() {
    const dateStart = document.getElementById('date-start').value;
    const dateEnd = document.getElementById('date-end').value;
    
    // 并行加载所有数据
    await Promise.all([
        loadSummaryData(dateStart, dateEnd),
        loadDailyChart(dateStart, dateEnd),
        loadTypesChart(dateStart, dateEnd),
        loadHourlyChart(dateEnd) // 使用结束日期作为当天
    ]);
}

async function loadSummaryData(start, end) {
    try {
        const response = await fetch(`/api/admin/stats/summary?start=${start}&end=${end}`);
        const data = await response.json();
        
        if (data.data) {
            document.getElementById('kpi-total').textContent = formatNumber(data.data.total_requests);
            document.getElementById('kpi-avg-time').textContent = formatTime(data.data.avg_response_time);
            document.getElementById('kpi-error-rate').textContent = data.data.error_rate + '%';
            document.getElementById('kpi-slowest').textContent = data.data.slowest_endpoint || '-';
        }
    } catch (error) {
        console.error('加载汇总数据失败:', error);
    }
}

async function loadDailyChart(start, end) {
    try {
        const response = await fetch(`/api/admin/stats/daily?start=${start}&end=${end}`);
        const data = await response.json();
        
        const ctx = document.getElementById('chart-daily').getContext('2d');
        
        if (dailyChart) {
            dailyChart.destroy();
        }
        
        const labels = data.data.map(item => item.date);
        const values = data.data.map(item => item.count);
        
        dailyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '请求数',
                    data: values,
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: { color: '#e0e0e0' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#a0a0a0' },
                        grid: { color: '#2a2a4a' }
                    },
                    y: {
                        ticks: { color: '#a0a0a0' },
                        grid: { color: '#2a2a4a' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('加载每日趋势图失败:', error);
    }
}

async function loadTypesChart(start, end) {
    try {
        const response = await fetch(`/api/admin/stats/types?start=${start}&end=${end}`);
        const data = await response.json();
        
        const ctx = document.getElementById('chart-types').getContext('2d');
        
        if (typesChart) {
            typesChart.destroy();
        }
        
        const labels = Object.keys(data.data);
        const values = Object.values(data.data);
        
        // 生成颜色
        const colors = labels.map((_, i) => {
            const hue = (i * 360 / labels.length) % 360;
            return `hsl(${hue}, 70%, 60%)`;
        });
        
        typesChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderColor: '#16213e',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#e0e0e0' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('加载类型分布图失败:', error);
    }
}

async function loadHourlyChart(date) {
    try {
        const response = await fetch(`/api/admin/stats/hourly?date=${date}`);
        const data = await response.json();
        
        const ctx = document.getElementById('chart-hourly').getContext('2d');
        
        if (hourlyChart) {
            hourlyChart.destroy();
        }
        
        const labels = data.data.map(item => `${item.hour}:00`);
        const values = data.data.map(item => item.count);
        
        hourlyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '请求数',
                    data: values,
                    backgroundColor: '#00d4ff',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: { color: '#e0e0e0' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#a0a0a0' },
                        grid: { color: '#2a2a4a' }
                    },
                    y: {
                        ticks: { color: '#a0a0a0' },
                        grid: { color: '#2a2a4a' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('加载小时分布图失败:', error);
    }
}
