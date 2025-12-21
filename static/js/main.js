// 前端逻辑：预览、查询、历史、视图切换与交互反馈
let previewVisible = true;
let isHorizontalView = true;


window.onload = function() {
    // 初始化配置与历史
    loadDNSConfig();
    loadHistory();

    // 初始化预览
    updatePreview();

    // 默认横排：同步按钮状态
    syncViewToggleUI();

    // 返回顶部按钮：仅滚动后可见
    window.addEventListener('scroll', handleScroll);
    handleScroll();
};

function colorFromIp(ip) {
    const s = String(ip || '');
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = ((hash * 31) + s.charCodeAt(i)) >>> 0;
    }
    const hue = hash % 360;
    // 深色背景上更清晰的高饱和颜色
    return `hsl(${hue}, 85%, 62%)`;
}

function syncViewToggleUI() {
    const viewToggleBtn = document.getElementById('viewToggleBtn');
    const viewToggleText = document.getElementById('viewToggleText');
    const viewToggleIcon = document.getElementById('viewToggleIcon');
    if (!viewToggleBtn || !viewToggleText || !viewToggleIcon) return;

    viewToggleText.textContent = '视图切换';
    viewToggleIcon.textContent = isHorizontalView ? '📇' : '📇';
    // 不再切换 active 纯色样式，保持按钮原样
}

function handleScroll() {
    const backToTopBtn = document.getElementById('backToTopBtn');
    if (!backToTopBtn) return;

    // 当顶部“定义区域”（三栏配置区）看不到时才显示
    const topSection = document.querySelector('.three-column-container');
    let shouldShow = window.pageYOffset > 120;
    if (topSection) {
        const rect = topSection.getBoundingClientRect();
        shouldShow = rect.bottom < 0;
    }

    if (shouldShow) {
        backToTopBtn.classList.add('show');
    } else {
        backToTopBtn.classList.remove('show');
    }
}

function cleanARecordValue(value) {
    return String(value || '').replace(/\s*\(一致\)\s*/g, '').trim();
}

function isLikelyIPv4(value) {
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

function isARecordNonCopyable(value) {
    const s = String(value || '');
    return (
        s.includes('错误') ||
        s.includes('Error') ||
        s.includes('不存在') ||
        s.includes('超时') ||
        s.includes('没有 A 记录') ||
        s.includes('没有A记录') ||
        s.includes('NoAnswer') ||
        s.includes('NXDOMAIN')
    );
}

// 仅当同一 IP 在多个 DNS 里出现时才上色；否则默认白色
function buildAConsistency(domainResults, dnsServers) {
    const serversByIp = new Map();
    const orderedIps = [];

    dnsServers.forEach(server => {
        const records = domainResults[server];
        if (!records || !records.A) return;
        const ips = Array.isArray(records.A) ? records.A : [records.A];

        ips.forEach(raw => {
            const rawStr = String(raw || '');
            if (isARecordNonCopyable(rawStr)) return;

            const ip = cleanARecordValue(rawStr);
            if (!isLikelyIPv4(ip)) return;

            if (!serversByIp.has(ip)) {
                serversByIp.set(ip, new Set());
                orderedIps.push(ip);
            }
            serversByIp.get(ip).add(server);
        });
    });

    const colorByIp = new Map();
    const serverCountByIp = new Map();

    orderedIps.forEach(ip => {
        const set = serversByIp.get(ip);
        const count = set ? set.size : 1;
        serverCountByIp.set(ip, count);
        if (count >= 2) {
            colorByIp.set(ip, colorFromIp(ip));
        }
    });

    return { colorByIp, serverCountByIp };
}

function formatARecordDisplay(rawValue, consistency) {
    const rawStr = String(rawValue || '');

    // 错误/状态文案：不提供复制
    if (isARecordNonCopyable(rawStr)) {
        return { text: cleanARecordValue(rawStr), style: 'color: var(--error-color);', copyable: false, copy: '' };
    }

    const cleaned = cleanARecordValue(rawStr);

    // 非 IP：当作普通文案显示（不复制）
    if (!isLikelyIPv4(cleaned)) {
        return { text: cleaned, style: 'color: var(--text-dim);', copyable: false, copy: '' };
    }

    const count = consistency && consistency.serverCountByIp ? (consistency.serverCountByIp.get(cleaned) || 1) : 1;
    const color = (count >= 2 && consistency && consistency.colorByIp) ? consistency.colorByIp.get(cleaned) : null;

    if (color) {
        return { text: cleaned, style: `color: ${color}; font-weight: 800;`, copyable: true, copy: cleaned };
    }

    // 没有“多 DNS 一致出现”时，默认白色
    return { text: cleaned, style: '', copyable: true, copy: cleaned };
}

function bindARecordHoverHighlight(root) {
    const scope = root || document;
    const items = scope.querySelectorAll('[data-a-ip]');
    if (!items.length) return;

    const listByIp = new Map();
    items.forEach(el => {
        const ip = el.getAttribute('data-a-ip');
        if (!ip) return;
        if (!listByIp.has(ip)) listByIp.set(ip, []);
        listByIp.get(ip).push(el);
    });

    const clearAll = () => {
        listByIp.forEach(group => group.forEach(node => node.classList.remove('a-record-highlight')));
    };

    items.forEach(el => {
        const ip = el.getAttribute('data-a-ip');
        if (!ip) return;
        el.addEventListener('mouseenter', () => {
            clearAll();
            const group = listByIp.get(ip);
            if (group) group.forEach(node => node.classList.add('a-record-highlight'));
        });
        el.addEventListener('mouseleave', clearAll);
    });
}

// 核心展示逻辑：渲染历史记录
function displayHistory(history) {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';

    if (history.length === 0) {
        historyList.innerHTML = '<div style="text-align:center; color:var(--text-dim); margin-top:40px; font-size:0.9rem;">暂无查询记录</div>';
        return;
    }

    history.forEach(record => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        // 检查是否有时间节点（去重后的记录）
        const hasTimeNodes = record.time_nodes && record.time_nodes.length > 0;
        const recordId = hasTimeNodes ? record.time_nodes[0].id : record.id;
        
        // 使用 SVG 作为删除按钮图标
        historyItem.innerHTML = `
            <div class="delete-btn" onclick="deleteHistoryItem('${recordId}')" title="删除记录">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
            </div>
            <div class="history-header">
                <span class="history-time">${record.date} ${record.time}</span>
                <div class="history-domains" title="${record.domains.join(', ')}">${record.domains.join(', ')}</div>
                ${hasTimeNodes ? `<div style="font-size:0.7rem; color:var(--text-dim); margin-top:2px;">共 ${record.time_nodes.length} 次查询记录</div>` : ''}
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-outline" style="flex:1; font-size:0.75rem; padding: 6px;" onclick="copyToDomains('${record.domains.join('\\n')}')">
                    <svg class="btn-icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    <span>填入</span>
                </button>
                <button class="btn btn-outline" style="flex:1; font-size:0.75rem; padding: 6px;" onclick="toggleHistoryDetail('${recordId}')">
                    <svg class="btn-icon" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    <span>详情</span>
                </button>
            </div>
            <div class="history-details" id="detail-${recordId}">
                ${generateHistoryDetailContent(record)}
            </div>
        `;
        historyList.appendChild(historyItem);
    });

    bindARecordHoverHighlight(historyList);
}

// 生成详细内容
function generateHistoryDetailContent(record) {
    // 检查是否有时间节点（去重后的记录）
    if (record.time_nodes && record.time_nodes.length > 0) {
        // 按时间倒序排列，确保最新查询在第一个
        const sortedNodes = [...record.time_nodes].sort((a, b) => b.id.localeCompare(a.id));
        
        let html = ``;
        
        // 显示时间节点选择（垂直排列在左侧）
        html += `<div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;">`;
        sortedNodes.forEach((node, index) => {
            const isActive = index === 0 ? 'background: var(--accent-color); color: white; border-color: var(--accent-color);' : '';
            html += `<button 
                id="node-btn-${node.id}" 
                class="btn btn-outline" 
                style="padding: 6px 10px; font-size:0.7rem; width: fit-content; white-space: nowrap; border-radius: 6px; transition: all 0.2s ease; ${isActive}" 
                onclick="showTimeNodeDetail('${node.id}')">
                ${node.date} ${node.time}
            </button>`;
        });
        html += `</div>`;
        
        // 显示详情内容区域（在时间节点下方）
        html += `<div style="background: rgba(15, 23, 42, 0.4); border-radius: 8px; border: 1px solid var(--border-color); padding: 12px; width: 100%; box-sizing: border-box; overflow: hidden;">`;
        sortedNodes.forEach((node, index) => {
            const displayStyle = index === 0 ? 'block' : 'none';
            html += `<div id="node-detail-${node.id}" style="display: ${displayStyle}; width: 100%; max-width: 100%; box-sizing: border-box;">`;
            html += generateNodeDetailContent(node);
            html += `</div>`;
        });
        html += `</div>`;
        
        return html;
    } else {
        // 旧格式的记录（兼容性）
        let html = `<div style="margin-bottom:6px; margin-left:4px;">
            <span style="color:var(--text-dim); font-size:0.75rem;">查询详情:</span>
        </div>`;
        
        if (record.results) {
            // 主大框容器
            html += `<div style="background: rgba(15, 23, 42, 0.3); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom:8px;">`;
            
            for (const [domain, domainResults] of Object.entries(record.results)) {
                // 域名容器
                html += `<div style="margin-bottom:12px;">
                    <div style="color:var(--accent-color); font-size:0.85rem; font-weight:600; margin-bottom:6px; padding-left:8px; border-left: 3px solid var(--accent-color); background: rgba(56, 189, 248, 0.05); padding: 4px 8px; border-radius: 4px;">🌐 ${domain}</div>`;
                
                // DNS服务器容器
                for (const [dnsServer, serverResults] of Object.entries(domainResults)) {
                    html += `<div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(56, 189, 248, 0.1); border-radius: 6px; padding: 8px; margin-left: 8px; margin-bottom:6px;">
                        <div class="server-name" style="font-size:0.75rem; margin-bottom:4px; color: var(--text-dim);">🔍 ${dnsServer}</div>`;
                    
                    // 记录容器
                    if (serverResults.A) {
                        html += `<div style="margin-bottom:4px;">`;
                        const ips = Array.isArray(serverResults.A) ? serverResults.A : [serverResults.A];
                        ips.forEach(ip => { 
                            const displayIp = cleanARecordValue(ip);
                            html += `<div class="a-record-container" data-a-ip="${displayIp}" onclick="copyToClipboard('${displayIp}', event)" title="点击复制IP地址" style="margin-bottom:2px;">
                                <span class="record-tag" style="font-size:0.65rem; padding:2px 8px;">A</span>
                                <span class="record-value" style="font-size:0.8rem;">${displayIp}</span>
                            </div>`; 
                        });

                        html += `</div>`;
                    }
                    
                    if (serverResults.CNAME) {
                        html += `<div style="margin-bottom:4px;">`;
                        const cnames = Array.isArray(serverResults.CNAME) ? serverResults.CNAME : [serverResults.CNAME];
                        cnames.forEach(cn => { 
                            html += `<div style="margin-bottom:2px;">
                                <span class="record-tag" style="color:#818cf8; background:rgba(129,140,248,0.1); font-size:0.65rem; padding:2px 8px;">CNAME</span>
                                <span class="record-value" style="font-size:0.8rem;">${cn}</span>
                            </div>`; 
                        });
                        html += `</div>`;
                    }
                    
                    html += `</div>`;
                }
                html += `</div>`;
            }
            html += `</div>`;
        }
        return html;
    }
}

// 生成单个时间节点的详细内容
function generateNodeDetailContent(node) {
    let html = `<div style="font-size:0.75rem; margin-bottom:8px;">
        <span style="color:var(--text-dim)">📍 ${node.timestamp}</span>
    </div>`;
    
    if (node.results) {
        // 主大框容器
        html += `<div style="background: rgba(15, 23, 42, 0.3); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom:8px; width: 100%; box-sizing: border-box; max-width: 100%;">`;
        
        for (const [domain, domainResults] of Object.entries(node.results)) {
            // 域名容器
            html += `<div style="margin-bottom:12px; width: 100%; box-sizing: border-box;">
                <div style="color:var(--accent-color); font-size:0.85rem; font-weight:600; margin-bottom:6px; padding-left:8px; border-left: 3px solid var(--accent-color); background: rgba(56, 189, 248, 0.05); padding: 4px 8px; border-radius: 4px; width: 100%; box-sizing: border-box; word-break: break-all;">🌐 ${domain}</div>`;
            
            // DNS服务器容器
            for (const [dnsServer, serverResults] of Object.entries(domainResults)) {
                html += `<div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(56, 189, 248, 0.1); border-radius: 6px; padding: 8px; margin-left: 8px; margin-bottom:6px; width: 100%; box-sizing: border-box; max-width: 100%;">
                    <div class="server-name" style="font-size:0.75rem; margin-bottom:4px; color: var(--text-dim); width: 100%; word-break: break-all;">🔍 ${dnsServer}</div>`;
                
                // 记录容器
                if (serverResults.A) {
                    html += `<div style="margin-bottom:4px; width: 100%;">`;
                    const ips = Array.isArray(serverResults.A) ? serverResults.A : [serverResults.A];
                    ips.forEach(ip => { 
                        const displayIp = cleanARecordValue(ip);
                        html += `<div class="a-record-container" data-a-ip="${displayIp}" onclick="copyToClipboard('${displayIp}', event)" title="点击复制IP地址" style="margin-bottom:2px; width: 100%; box-sizing: border-box;">
                            <span class="record-tag" style="font-size:0.65rem; padding:2px 8px; white-space: nowrap;">A</span>
                            <span class="record-value" style="font-size:0.8rem; word-break: break-all; max-width: 100%;">${displayIp}</span>
                        </div>`; 
                    });

                    html += `</div>`;
                }
                
                if (serverResults.CNAME) {
                    html += `<div style="margin-bottom:4px; width: 100%;">`;
                    const cnames = Array.isArray(serverResults.CNAME) ? serverResults.CNAME : [serverResults.CNAME];
                    cnames.forEach(cn => { 
                        html += `<div style="margin-bottom:2px; width: 100%; box-sizing: border-box;">
                            <span class="record-tag" style="color:#818cf8; background:rgba(129,140,248,0.1); font-size:0.65rem; padding:2px 8px; white-space: nowrap;">CNAME</span>
                            <span class="record-value" style="font-size:0.8rem; word-break: break-all; max-width: 100%;">${cn}</span>
                        </div>`; 
                    });
                    html += `</div>`;
                }
                
                html += `</div>`;
            }
            html += `</div>`;
        }
        html += `</div>`;
    }
    return html;
}

// 显示指定时间节点的详情
function showTimeNodeDetail(nodeId) {
    // 隐藏所有节点详情
    document.querySelectorAll('[id^="node-detail-"]').forEach(el => {
        el.style.display = 'none';
    });
    
    // 重置所有按钮样式
    document.querySelectorAll('[id^="node-btn-"]').forEach(el => {
        el.style.background = 'transparent';
        el.style.color = 'var(--text-main)';
        el.style.border = '1px solid var(--border-color)';
    });
    
    // 显示选中的节点详情
    const targetDetail = document.getElementById(`node-detail-${nodeId}`);
    if (targetDetail) {
        targetDetail.style.display = 'block';
    }
    
    // 高亮选中的按钮
    const targetBtn = document.getElementById(`node-btn-${nodeId}`);
    if (targetBtn) {
        targetBtn.style.background = 'var(--accent-color)';
        targetBtn.style.color = 'white';
        targetBtn.style.border = '1px solid var(--accent-color)';
    }
}

// 复制到剪贴板
function copyToClipboard(text, event) {
    navigator.clipboard.writeText(text).then(() => {
        // 显示复制成功提示，在鼠标位置显示
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            background: var(--success-color);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            z-index: 1000;
            font-size: 0.85rem;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            animation: fadeIn 0.3s ease-out;
            white-space: nowrap;
            pointer-events: none;
        `;
        notification.textContent = `✅ 已复制: ${text}`;
        document.body.appendChild(notification);
        
        // 获取鼠标位置
        const mouseX = event ? event.clientX : window.innerWidth / 2;
        const mouseY = event ? event.clientY : window.innerHeight / 2;
        
        // 设置提示框位置，确保不超出屏幕边界
        const rect = notification.getBoundingClientRect();
        let left = mouseX + 15;
        let top = mouseY - rect.height - 10;
        
        // 防止超出右边界
        if (left + rect.width > window.innerWidth - 10) {
            left = mouseX - rect.width - 15;
        }
        
        // 防止超出顶部边界
        if (top < 10) {
            top = mouseY + 15;
        }
        
        notification.style.left = left + 'px';
        notification.style.top = top + 'px';
        
        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 1500);
    }).catch(err => {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制');
    });
}

function toggleHistoryDetail(id) {
    const el = document.getElementById(`detail-${id}`);
    el.classList.toggle('show');
}

// 显示删除确认提示
function showDeleteConfirm(recordId) {
    const confirmBtn = document.getElementById(`confirm-${recordId}`);
    if (confirmBtn) {
        // 隐藏确认按钮
        confirmBtn.remove();
    } else {
        // 创建确认按钮
        const historyItem = document.querySelector(`[onclick*="${recordId}"]`).closest('.history-item');
        const confirmButton = document.createElement('button');
        confirmButton.className = 'delete-confirm';
        confirmButton.id = `confirm-${recordId}`;
        confirmButton.textContent = '确认删除';
        confirmButton.onclick = () => confirmDelete(recordId);
        historyItem.appendChild(confirmButton);
        
        // 3秒后自动隐藏
        setTimeout(() => {
            if (document.getElementById(`confirm-${recordId}`)) {
                confirmButton.remove();
            }
        }, 3000);
    }
}

// 确认删除
async function confirmDelete(recordId) {
    try {
        const response = await fetch('/delete_dns_history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ record_id: recordId })
        });
        if (response.ok) loadHistory();
    } catch (error) { alert('删除失败'); }
}

// 删除单个历史记录
async function deleteHistoryItem(recordId) {
    showDeleteConfirm(recordId);
}

function copyToDomains(text) {
    document.getElementById('domains').value = text.replace(/\\n/g, '\n');
    document.getElementById('domains').focus();
    // 填入后自动更新格式化预览
    updatePreview();
    
    // 如果用户复制了历史记录的域名，可以提示他们进行查询以查看横排视图
    setTimeout(() => {
        if (isHorizontalView && document.getElementById('result').children.length === 0) {
            showNotification('请点击RUN QUERY进行查询，以查看横排视图效果');
        }
    }, 1000);
}

async function saveDNSConfig() {
    const dns_servers = document.getElementById('dns_servers').value.trim().split('\n').filter(s => s);
    try {
        await fetch('/save_dns_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dns_servers })
        });
        alert('✅ 配置已保存');
    } catch (e) { alert('❌ 保存失败'); }
}

async function loadDNSConfig() {
    try {
        const res = await fetch('/get_dns_config');
        const data = await res.json();
        if (data.dns_servers) document.getElementById('dns_servers').value = data.dns_servers.join('\n');
    } catch (e) {}
}

async function loadHistory() {
    try {
        const res = await fetch('/get_dns_history');
        const data = await res.json();
        displayHistory(data.history || []);
    } catch (e) {}
}

// 显示清空确认提示
function showClearConfirm() {
    const confirmBtn = document.getElementById('clear-confirm-btn');
    if (confirmBtn) {
        // 隐藏确认按钮
        confirmBtn.remove();
    } else {
        // 创建确认按钮
        const clearBtn = document.getElementById('clearHistoryBtn');
        const confirmButton = document.createElement('button');
        confirmButton.className = 'clear-confirm';
        confirmButton.id = 'clear-confirm-btn';
        confirmButton.textContent = '确认清空全部';
        confirmButton.onclick = () => confirmClearAll();
        clearBtn.parentElement.appendChild(confirmButton);
        
        // 3秒后自动隐藏
        setTimeout(() => {
            if (document.getElementById('clear-confirm-btn')) {
                confirmButton.remove();
            }
        }, 3000);
    }
}

// 确认清空所有历史记录
async function confirmClearAll() {
    try {
        await fetch('/clear_dns_history', { method: 'POST' });
        loadHistory();
    } catch (error) {
        alert('清空失败');
    }
}

// 清空历史记录（入口函数）
async function clearHistory() {
    showClearConfirm();
}

// 域名格式化函数
function normalizeDomain(domain) {
    if (!domain || !domain.trim()) return '';
    
    domain = domain.trim();
    
    // 移除协议头
    domain = domain.replace(/^[a-zA-Z]+:\/\//, '');
    
    // 移除端口号
    domain = domain.replace(/:\d+/, '');
    
    // 移除路径部分
    domain = domain.replace(/\/.*/, '');
    
    // 移除查询参数
    domain = domain.replace(/\?.*/, '');
    
    // 移除锚点
    domain = domain.replace(/#.*/, '');
    
    // 移除末尾的斜杠
    domain = domain.replace(/\/$/, '');
    
    // 基本的域名格式验证
    if (!/^[a-zA-Z0-9.-]+$/.test(domain)) return '';
    
    // 移除开头和结尾的无效字符
    domain = domain.replace(/^[\.-]+|[\.-]+$/g, '');
    
    return domain.toLowerCase();
}

// 批量格式化域名
function normalizeDomains(domains) {
    const normalizedDomains = [];
    const seen = new Set();
    
    domains.forEach(domain => {
        const normalized = normalizeDomain(domain);
        if (normalized && !seen.has(normalized)) {
            seen.add(normalized);
            normalizedDomains.push(normalized);
        }
    });
    
    return normalizedDomains;
}

// 添加DNS服务器
function addDNS(dnsServer) {
    const textarea = document.getElementById('dns_servers');
    const currentValue = textarea.value.trim();
    const lines = currentValue ? currentValue.split('\n') : [];
    
    // 检查是否已存在
    if (!lines.some(line => line.trim() === dnsServer)) {
        lines.push(dnsServer);
        textarea.value = lines.join('\n');
        
        // 显示添加成功的提示
        showNotification(`✅ 已添加: ${dnsServer.split(' # ')[1] || 'DNS服务器'}`);
    } else {
        showNotification(`⚠️ 已存在: ${dnsServer.split(' # ')[1] || 'DNS服务器'}`);
    }
}

// 显示通知
function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(56, 189, 248, 0.9);
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        z-index: 1000;
        font-size: 0.9rem;
        animation: slideInRight 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in forwards';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

// 切换预览显示/隐藏
function togglePreview() {
    previewVisible = !previewVisible;
    const previewDiv = document.getElementById('formatPreview');
    const previewIcon = document.getElementById('previewIcon');
    const previewText = document.getElementById('previewText');
    
    if (previewVisible) {
        previewDiv.style.display = 'block';
        previewIcon.textContent = '👁️';
        previewText.textContent = '隐藏格式化预览';
    } else {
        previewDiv.style.display = 'none';
        previewIcon.textContent = '🔍';
        previewText.textContent = '显示格式化预览';
    }
}

// 实时更新预览
function updatePreview() {
    if (!previewVisible) return;
    
    const domainInput = document.getElementById('domains').value.trim();
    const rawDomains = domainInput
        .split(/[\s,\n]+/) // 支持空格、逗号、换行分隔
        .map(d => d.trim())
        .filter(d => d);
    
    if (!rawDomains.length) {
        document.getElementById('previewContent').innerHTML = '<div style="color: var(--text-dim); font-style: italic;">请输入域名...</div>';
        document.getElementById('previewStats').innerHTML = '<div>等待输入...</div>';
        return;
    }
    
    const formattedDomains = normalizeDomains(rawDomains);
    const previewContent = document.getElementById('previewContent');
    const previewStats = document.getElementById('previewStats');
    
    // 显示格式化结果
    previewContent.innerHTML = formattedDomains.length > 0 
        ? formattedDomains.map(d => `<div style="padding: 2px 0;">• ${d}</div>`).join('')
        : '<div style="color: var(--error-color);">没有有效的域名</div>';
    
    // 显示统计信息
    previewStats.innerHTML = `
        <div>输入域名: ${rawDomains.length} 个</div>
        <div>有效域名: ${formattedDomains.length} 个</div>
        ${rawDomains.length > formattedDomains.length ? 
            `<div style="color: var(--error-color);">过滤无效域名: ${rawDomains.length - formattedDomains.length} 个</div>` : 
            '<div style="color: var(--success-color);">✓ 所有域名格式正确</div>'
        }
    `;
}

async function queryDNS() {
    // 读取并校验输入，开始查询
    const domainInput = document.getElementById('domains').value.trim();

    const rawDomains = domainInput
        .split(/[\s,\n]+/) // 支持空格、逗号、换行分隔
        .map(d => d.trim())
        .filter(d => d);
    
    // 格式化域名
    const domains = normalizeDomains(rawDomains);
    
    if (!domains.length) {
        alert('没有有效的域名可以查询');
        return;
    }
    
    const dns_servers = document.getElementById('dns_servers').value.trim().split('\n').filter(s => s);
    if (!dns_servers.length) return alert('DNS服务器不能为空');

    const prog = document.getElementById('progressContainer');
    const fill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    prog.style.display = 'block';
    fill.style.width = '0%';
    progressText.textContent = '准备查询...';

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
        }, 100); // 每100ms更新一次进度

        const response = await queryPromise;
        const data = await response.json();
        
        // 停止进度监控
        clearInterval(progressInterval);
        fill.style.width = '100%';
        progressText.textContent = '查询完成！';
        
        // 保存查询结果数据以便视图切换使用
        document.getElementById('result').setAttribute('data-last-result', JSON.stringify(data));
        renderResults(data);
        loadHistory();
        setTimeout(() => prog.style.display = 'none', 2000);
    } catch (error) {
        alert('查询中断');
        prog.style.display = 'none';
    }
}

function renderResults(data) {
    // 根据当前视图模式渲染结果
    const container = document.getElementById('result');

    container.innerHTML = '';
    
    // 获取当前DNS配置的顺序
    const dnsServers = document.getElementById('dns_servers').value.trim().split('\n').filter(s => s);
    
    // 渲染查询结果
    const resultsData = data.results || data;
    
    if (isHorizontalView) {
        // 横排视图模式
        container.classList.add('horizontal-view');
        
        for (const [domain, results] of Object.entries(resultsData)) {
            const row = document.createElement('div');
            row.className = 'horizontal-domain-row';
            
            // 第一行：域名
            const domainCell = document.createElement('div');
            domainCell.className = 'horizontal-domain-cell domain';
            domainCell.textContent = domain;
            row.appendChild(domainCell);

            // 第二行：各DNS解析内容横排
            const dnsGrid = document.createElement('div');
            dnsGrid.className = 'horizontal-dns-grid';

            const consistency = buildAConsistency(results, dnsServers);

            dnsServers.forEach(dnsServerConfig => {

                const dnsCell = document.createElement('div');
                dnsCell.className = 'horizontal-domain-cell dns-result';

                let contentHtml = '';

                if (results[dnsServerConfig]) {
                    const records = results[dnsServerConfig];
                    contentHtml += `<div class="horizontal-dns-label">${dnsServerConfig}</div>`;
                    let dnsContent = '<div class="horizontal-dns-content">';

                    if (records.A) {
                        const ips = Array.isArray(records.A) ? records.A : [records.A];
                        ips.forEach(ip => {
                            const display = formatARecordDisplay(ip, consistency);
                            const onClickAttr = display.copyable ? `onclick="copyToClipboard('${display.copy}', event)" title="点击复制IP地址"` : '';
                            const containerClass = display.copyable ? 'a-record-container' : '';
                            const dataAttr = display.copyable ? `data-a-ip="${display.copy}"` : '';

                            dnsContent += `<div class="${containerClass}" ${onClickAttr} ${dataAttr} style="margin-bottom: 4px;">
                                <span class="record-tag" style="font-size:0.6rem; padding:1px 6px;">A</span>
                                <span style="${display.style}">${display.text}</span>
                            </div>`;
                        });
                    }

                    if (records.CNAME) {
                        const cnames = Array.isArray(records.CNAME) ? records.CNAME : [records.CNAME];
                        cnames.forEach(cn => {
                            const isErr = cn.includes('错误') || cn.includes('Error') || cn.includes('不存在') || cn.includes('超时');
                            const cnameStyle = isErr ? 'color: var(--error-color);' : '';
                            dnsContent += `<div style="margin-bottom: 4px;">
                                <span class="record-tag" style="background:rgba(129,140,248,0.1); color:#818cf8; font-size:0.6rem; padding:1px 6px;">CNAME</span>
                                <span style="${cnameStyle}">${cn}</span>
                            </div>`;
                        });
                    }

                    dnsContent += '</div>';
                    contentHtml += dnsContent;
                } else {
                    contentHtml += `<div class="horizontal-dns-label">${dnsServerConfig}</div>
                    <div class="horizontal-dns-content" style="color: var(--text-dim);">未查询</div>`;
                }

                dnsCell.innerHTML = contentHtml;
                dnsGrid.appendChild(dnsCell);
            });

            row.appendChild(dnsGrid);
            container.appendChild(row);
        }

    } else {
        // 原始的卡片视图模式
        container.classList.remove('horizontal-view');
        
        for (const [domain, results] of Object.entries(resultsData)) {
            const card = document.createElement('div');
            card.className = 'result-card glass-card';
            let html = `<div class="domain-title">${domain}</div>`;

            const consistency = buildAConsistency(results, dnsServers);
            
            // 按照DNS配置的顺序显示结果
            dnsServers.forEach(dnsServerConfig => {

                if (results[dnsServerConfig]) {
                    const records = results[dnsServerConfig];
                    html += `<div class="detail-server-block"><div class="server-name">${dnsServerConfig}</div>`;
                    
                    if(records.A) {
                        const ips = Array.isArray(records.A) ? records.A : [records.A];
                        ips.forEach(ip => {
                            const display = formatARecordDisplay(ip, consistency);

                            const onClickAttr = display.copyable ? `onclick="copyToClipboard('${display.copy}', event)" title="点击复制IP地址"` : '';
                            const containerClass = display.copyable ? 'a-record-container' : '';
                            const dataAttr = display.copyable ? `data-a-ip="${display.copy}"` : '';

                            html += `<div class="${containerClass}" ${onClickAttr} ${dataAttr} style="display: flex; align-items: center; gap: 8px; padding: 4px; border-radius: 4px;">
                                <span class="record-tag">A</span>
                                <span class="record-value" style="${display.style}">${display.text}</span>
                            </div>`;
                        });
                    }
                    
                    if(records.CNAME) {
                        const cnames = Array.isArray(records.CNAME) ? records.CNAME : [records.CNAME];
                        cnames.forEach(cn => { 
                            const isErr = cn.includes('错误') || cn.includes('Error') || cn.includes('不存在') || cn.includes('超时');
                            const cnameStyle = isErr ? 'color: var(--error-color);' : '';
                            html += `<div><span class="record-tag" style="background:rgba(129,140,248,0.1); color:#818cf8">CNAME</span><span class="record-value" style="${cnameStyle}">${cn}</span></div>`; 
                        });
                    }
                    html += `</div>`;
                }
            });
            
            card.innerHTML = html;
            container.appendChild(card);
        }
    }

    bindARecordHoverHighlight(container);
}

// 切换视图模式
function toggleViewMode() {
    // 横排/竖排切换
    const resultContainer = document.getElementById('result');

    const currentResult = resultContainer.getAttribute('data-last-result');
    
    // 如果没有任何结果数据，提示用户
    if (!currentResult && resultContainer.children.length === 0) {
        showNotification('请先进行DNS查询，然后再切换视图模式');
        return;
    }
    
    // 切换视图状态（默认横排；点击进入竖排）
    isHorizontalView = !isHorizontalView;
    syncViewToggleUI();
    showNotification(isHorizontalView ? '已切换到横排视图模式' : '已切换到竖排视图模式');
    
    // 重新渲染当前结果
    if (currentResult) {
        renderResults(JSON.parse(currentResult));
    }
}

// 滚动到顶部
function scrollToTop() {
    // 平滑回到顶部
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

