/**
 * DNS查询模块 - 处理DNS查询和配置相关功能
 */

/**
 * 加载DNS配置
 */
async function loadDNSConfig() {
    try {
        const res = await fetch('/get_dns_config');
        const data = await res.json();
        if (data.dns_servers) {
            document.getElementById('dns_servers').value = data.dns_servers.join('\n');
        }
    } catch (e) {
        console.error('加载DNS配置失败:', e);
    }
}

/**
 * 保存DNS配置
 */
async function saveDNSConfig() {
    const dns_servers = document.getElementById('dns_servers').value.trim().split('\n').map(s => s.trim()).filter(s => s);
    try {
        await fetch('/save_dns_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dns_servers })
        });
        alert('✅ 配置已保存');
    } catch (e) {
        alert('❌ 保存失败');
    }
}

/**
 * DNS查询
 */
async function queryDNS() {
    const domainInput = document.getElementById('domains').value.trim();

    const rawDomains = domainInput
        .split(/[\s,\n]+/)
        .map(d => d.trim())
        .filter(d => d);
    
    // 格式化域名
    const domains = window.DomainFormatter.normalizeDomains(rawDomains);
    
    if (!domains.length) {
        alert('没有有效的域名可以查询');
        return;
    }
    
    const dns_servers = document.getElementById('dns_servers').value.trim().split('\n').map(s => s.trim()).filter(s => s);
    if (!dns_servers.length) {
        alert('DNS服务器不能为空');
        return;
    }

    const prog = document.getElementById('progressContainer');
    const fill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    prog.style.display = 'block';
    fill.style.width = '0%';
    progressText.textContent = '准备查询...';

    // 记录查询开始时间
    const startTime = Date.now();

    try {
        // 启动查询
        const queryPromise = fetch('/query_dns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domains, dns_servers })
        });

        // 启动进度监控
        let queryCompleted = false;
        const progressInterval = setInterval(async () => {
            try {
                const progressResponse = await fetch('/get_query_progress');
                const progressData = await progressResponse.json();
                
                if (progressData.percentage) {
                    fill.style.width = progressData.percentage + '%';
                    progressText.textContent = `查询进度: ${progressData.percentage}% (${progressData.current}/${progressData.total})`;
                }
                
                if (progressData.status === 'completed' && !queryCompleted) {
                    queryCompleted = true;
                    clearInterval(progressInterval);
                    fill.style.width = '100%';
                    progressText.textContent = '查询完成！';

                    const resultResponse = await fetch('/get_last_query_result');
                    const data = await resultResponse.json();

                    if (data.error) {
                        alert('获取结果失败: ' + data.error);
                        prog.style.display = 'none';
                        return;
                    }

                    const orderedResults = {};
                    const results = data.results || data;
                    domains.forEach(domain => {
                        if (results[domain]) {
                            orderedResults[domain] = results[domain];
                        }
                    });

                    // 保存查询统计信息
                    const queryStats = data.stats || {};
                    const duration = queryStats.duration_seconds || ((Date.now() - startTime) / 1000).toFixed(2);
                    const now = new Date();
                    const timestamp = now.getFullYear() + '-' + 
                        String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(now.getDate()).padStart(2, '0') + ' ' + 
                        String(now.getHours()).padStart(2, '0') + ':' + 
                        String(now.getMinutes()).padStart(2, '0') + ':' + 
                        String(now.getSeconds()).padStart(2, '0');

                    document.getElementById('result').setAttribute('data-last-result', JSON.stringify(orderedResults));
                    document.getElementById('result').setAttribute('data-domain-order', JSON.stringify(domains));
                    document.getElementById('result').setAttribute('data-query-stats', JSON.stringify({
                        domainCount: queryStats.domain_count || domains.length,
                        dnsServerCount: queryStats.dns_server_count || dns_servers.length,
                        duration: duration,
                        timestamp: queryStats.query_time || timestamp
                    }));
                    
                    window.DisplayManager.renderResults(orderedResults, domains);
                    window.HistoryManager.loadHistory();
                    setTimeout(() => {
                        prog.style.display = 'none';
                    }, 2000);
                } else if (progressData.status === 'error') {
                    clearInterval(progressInterval);
                    progressText.textContent = '查询出错';
                    setTimeout(() => {
                        prog.style.display = 'none';
                    }, 2000);
                }
            } catch (e) {
                console.error('获取进度失败:', e);
            }
        }, 100);

        const response = await queryPromise;
        const startData = await response.json();

        if (startData.error) {
            clearInterval(progressInterval);
            alert('查询启动失败: ' + startData.error);
            prog.style.display = 'none';
            return;
        }
    } catch (error) {
        alert('查询中断');
        prog.style.display = 'none';
    }
}

/**
 * 清理DNS缓存
 */
async function clearDNSCache() {
    const confirmClear = confirm('确定要清理DNS缓存吗？\n\n注意：\n- macOS/Linux需要sudo权限\n- Windows需要管理员权限\n- 如果权限不足，将提示手动清理命令');
    
    if (!confirmClear) return;

    const notification = window.UIManager.showNotification('正在清理DNS缓存...');
    
    try {
        const response = await fetch('/clear_dns_cache', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        notification.remove();
        
        if (result.success) {
            window.UIManager.showNotification(`✅ ${result.message}`);
        } else {
            window.UIManager.showNotification(`⚠️ ${result.message}`);
            
            if (result.message.includes('sudo') || result.message.includes('管理员')) {
                setTimeout(() => {
                    alert(`需要手动清理DNS缓存：\n\n${result.message}`);
                }, 500);
            }
        }
    } catch (error) {
        notification.remove();
        window.UIManager.showNotification('❌ 清理DNS缓存失败');
        console.error('清理DNS缓存错误:', error);
    }
}

/**
 * 切换归属地查询API下拉菜单
 */
function toggleIpApiDropdown() {
    const content = document.getElementById('ipApiDropdownContent');
    const arrow = document.getElementById('ipApiDropdownArrow');
    
    if (!content || !arrow) return;
    
    if (content.style.maxHeight === '0px' || content.style.maxHeight === '') {
        content.style.maxHeight = '600px';
        arrow.style.transform = 'rotate(180deg)';
    } else {
        content.style.maxHeight = '0px';
        arrow.style.transform = 'rotate(0deg)';
    }
}

/**
 * 显示添加API表单
 */
function showAddApiForm() {
    const modal = document.getElementById('addApiModal');
    if (modal) {
        modal.style.display = 'flex';
        // 清空表单
        document.getElementById('newApiName').value = '';
        document.getElementById('newApiUrl').value = '';
        document.getElementById('newApiParser').value = 'generic';
    }
}

/**
 * 隐藏添加API表单
 */
function hideAddApiForm() {
    const modal = document.getElementById('addApiModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * 添加新的API
 */
function addNewApi() {
    const name = document.getElementById('newApiName').value.trim();
    const url = document.getElementById('newApiUrl').value.trim();
    const parser = document.getElementById('newApiParser').value;
    
    if (!name) {
        window.UIManager.showNotification('❌ 请输入API名称');
        return;
    }
    
    if (!url) {
        window.UIManager.showNotification('❌ 请输入API URL');
        return;
    }
    
    if (!url.includes('{ip}')) {
        window.UIManager.showNotification('❌ URL必须包含{ip}占位符');
        return;
    }
    
    // 检查是否已存在同名API
    if (window._ipInfoApis && window._ipInfoApis.some(api => api.name === name)) {
        window.UIManager.showNotification('❌ 已存在同名API');
        return;
    }
    
    // 添加到列表
    if (!window._ipInfoApis) {
        window._ipInfoApis = [];
    }
    
    window._ipInfoApis.push({
        name: name,
        url: url,
        parser: parser
    });
    
    // 重新渲染列表
    renderIpInfoApiList(window._ipInfoApis);
    
    // 隐藏表单
    hideAddApiForm();
    
    window.UIManager.showNotification(`✅ 已添加API: ${name}`);
}

/**
 * 删除API
 */
function deleteIpApi(index) {
    if (!window._ipInfoApis || index < 0 || index >= window._ipInfoApis.length) return;
    
    const apiName = window._ipInfoApis[index].name;
    
    if (confirm(`确定要删除API: ${apiName}吗？`)) {
        window._ipInfoApis.splice(index, 1);
        renderIpInfoApiList(window._ipInfoApis);
        window.UIManager.showNotification(`🗑️ 已删除API: ${apiName}`);
    }
}

/**
 * 加载归属地查询API列表
 */
async function loadIpInfoApis() {
    try {
        const res = await fetch('/get_ip_info_apis');
        const data = await res.json();
        if (data.apis) {
            renderIpInfoApiList(data.apis);
        }
    } catch (e) {
        console.error('加载归属地查询API失败:', e);
        window.UIManager.showNotification('❌ 加载归属地查询API失败');
    }
}

/**
 * 渲染归属地查询API列表
 */
function renderIpInfoApiList(apis) {
    const container = document.getElementById('ipInfoApiList');
    if (!container) return;
    
    container.innerHTML = '';
    
    apis.forEach((api, index) => {
        const apiItem = document.createElement('div');
        apiItem.style.cssText = `
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 10px;
            transition: all 0.2s ease;
        `;
        
        apiItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span id="api-status-${index}" style="width: 8px; height: 8px; border-radius: 50%; background: var(--text-dim);"></span>
                    <span style="font-weight: 600; color: var(--accent-color); font-size: 0.85rem;">${api.name}</span>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button onclick="checkIpInfoApi('${api.name}', ${index})" class="btn btn-outline" style="padding: 2px 8px; font-size: 0.7rem;">
                        检查
                    </button>
                    <button onclick="deleteIpApi(${index})" class="btn" style="padding: 2px 6px; font-size: 0.7rem; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);">
                        ×
                    </button>
                </div>
            </div>
            <input type="text" 
                   id="api-url-${index}" 
                   value="${api.url}" 
                   style="width: 100%; background: rgba(15, 23, 42, 0.8); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); padding: 6px 8px; font-size: 0.75rem; font-family: 'JetBrains Mono', monospace; box-sizing: border-box;"
                   onchange="markApiAsModified(${index})">
            <div id="api-info-${index}" style="margin-top: 6px; font-size: 0.7rem; color: var(--text-dim); min-height: 16px;"></div>
        `;
        
        container.appendChild(apiItem);
    });
    
    // 保存原始API数据供后续使用
    window._ipInfoApis = apis;
}

/**
 * 检查单个API状态
 */
async function checkIpInfoApi(apiName, index) {
    const statusEl = document.getElementById(`api-status-${index}`);
    const infoEl = document.getElementById(`api-info-${index}`);
    
    if (statusEl) {
        statusEl.style.background = 'var(--accent-color)';
        statusEl.style.animation = 'pulse 1s infinite';
    }
    if (infoEl) {
        infoEl.textContent = '检查中...';
        infoEl.style.color = 'var(--text-dim)';
    }
    
    try {
        const res = await fetch('/check_ip_info_api_status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_name: apiName })
        });
        const data = await res.json();
        
        if (statusEl) {
            statusEl.style.animation = 'none';
            if (data.status === 'available') {
                statusEl.style.background = 'var(--success-color)';
                statusEl.style.boxShadow = '0 0 8px var(--success-color)';
            } else {
                statusEl.style.background = 'var(--error-color)';
                statusEl.style.boxShadow = '0 0 8px var(--error-color)';
            }
        }
        
        if (infoEl) {
            const responseTime = data.response_time ? ` (${data.response_time.toFixed(2)}s)` : '';
            infoEl.textContent = `${data.message}${responseTime}`;
            infoEl.style.color = data.status === 'available' ? 'var(--success-color)' : 'var(--error-color)';
        }
    } catch (e) {
        if (statusEl) {
            statusEl.style.animation = 'none';
            statusEl.style.background = 'var(--error-color)';
        }
        if (infoEl) {
            infoEl.textContent = '检查失败';
            infoEl.style.color = 'var(--error-color)';
        }
    }
}

/**
 * 检查所有API状态
 */
async function checkAllIpInfoApis() {
    const container = document.getElementById('ipInfoApiList');
    if (!container) return;
    
    const apiItems = container.children;
    for (let i = 0; i < apiItems.length; i++) {
        const statusEl = document.getElementById(`api-status-${i}`);
        const infoEl = document.getElementById(`api-info-${i}`);
        if (statusEl) {
            statusEl.style.background = 'var(--accent-color)';
            statusEl.style.animation = 'pulse 1s infinite';
        }
        if (infoEl) {
            infoEl.textContent = '检查中...';
            infoEl.style.color = 'var(--text-dim)';
        }
    }
    
    try {
        const res = await fetch('/check_all_ip_info_apis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await res.json();
        
        if (data.results) {
            data.results.forEach((result, index) => {
                const statusEl = document.getElementById(`api-status-${index}`);
                const infoEl = document.getElementById(`api-info-${index}`);
                
                if (statusEl) {
                    statusEl.style.animation = 'none';
                    if (result.status === 'available') {
                        statusEl.style.background = 'var(--success-color)';
                        statusEl.style.boxShadow = '0 0 8px var(--success-color)';
                    } else {
                        statusEl.style.background = 'var(--error-color)';
                        statusEl.style.boxShadow = '0 0 8px var(--error-color)';
                    }
                }
                
                if (infoEl) {
                    const responseTime = result.response_time ? ` (${result.response_time}s)` : '';
                    infoEl.textContent = `${result.message}${responseTime}`;
                    infoEl.style.color = result.status === 'available' ? 'var(--success-color)' : 'var(--error-color)';
                }
            });
        }
        
        window.UIManager.showNotification('✅ API状态检查完成');
    } catch (e) {
        console.error('检查所有API状态失败:', e);
        window.UIManager.showNotification('❌ 检查API状态失败');
    }
}

/**
 * 标记API为已修改
 */
function markApiAsModified(index) {
    const statusEl = document.getElementById(`api-status-${index}`);
    if (statusEl) {
        statusEl.style.background = 'var(--warning-color, #fbbf24)';
        statusEl.style.boxShadow = 'none';
    }
}

/**
 * 保存归属地查询API配置
 */
async function saveIpInfoApis() {
    const container = document.getElementById('ipInfoApiList');
    if (!container || !window._ipInfoApis) return;
    
    const apis = [];
    const apiItems = container.querySelectorAll('input[type="text"]');
    
    apiItems.forEach((input, index) => {
        if (window._ipInfoApis[index]) {
            apis.push({
                name: window._ipInfoApis[index].name,
                url: input.value,
                parser: window._ipInfoApis[index].parser || 'generic'
            });
        }
    });
    
    try {
        const res = await fetch('/save_ip_info_apis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apis })
        });
        const data = await res.json();
        
        if (data.message) {
            window.UIManager.showNotification('✅ ' + data.message);
            // 重新加载API列表
            loadIpInfoApis();
        } else if (data.error) {
            window.UIManager.showNotification('❌ ' + data.error);
        }
    } catch (e) {
        console.error('保存归属地查询API配置失败:', e);
        window.UIManager.showNotification('❌ 保存失败');
    }
}

// 导出函数到全局作用域
window.QueryManager = {
    loadDNSConfig,
    saveDNSConfig,
    queryDNS,
    clearDNSCache,
    loadIpInfoApis,
    checkIpInfoApi,
    checkAllIpInfoApis,
    saveIpInfoApis,
    toggleIpApiDropdown,
    showAddApiForm,
    hideAddApiForm,
    addNewApi,
    deleteIpApi
};
