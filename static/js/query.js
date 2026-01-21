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
        const progressInterval = setInterval(async () => {
            try {
                const progressResponse = await fetch('/get_query_progress');
                const progressData = await progressResponse.json();
                
                if (progressData.percentage) {
                    fill.style.width = progressData.percentage + '%';
                    progressText.textContent = `查询进度: ${progressData.percentage}% (${progressData.current}/${progressData.total})`;
                }
                
                if (progressData.status === 'completed') {
                    clearInterval(progressInterval);
                    fill.style.width = '100%';
                    progressText.textContent = '查询完成！';
                } else if (progressData.status === 'error') {
                    clearInterval(progressInterval);
                    progressText.textContent = '查询出错';
                }
            } catch (e) {
                console.error('获取进度失败:', e);
            }
        }, 100);

        const response = await queryPromise;
        const data = await response.json();

        // 停止进度监控
        clearInterval(progressInterval);
        fill.style.width = '100%';
        
        // 计算耗时
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        progressText.textContent = '查询完成！';

        // 保存查询结果数据
        const orderedResults = {};
        domains.forEach(domain => {
            if (data[domain]) {
                orderedResults[domain] = data[domain];
            }
        });

        // 保存查询统计信息
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
            domainCount: domains.length,
            dnsServerCount: dns_servers.length,
            duration: duration,
            timestamp: timestamp
        }));
        
        window.DisplayManager.renderResults(orderedResults, domains);
        window.HistoryManager.loadHistory();
        setTimeout(() => {
            prog.style.display = 'none';
        }, 2000);
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

// 导出函数到全局作用域
window.QueryManager = {
    loadDNSConfig,
    saveDNSConfig,
    queryDNS,
    clearDNSCache
};
