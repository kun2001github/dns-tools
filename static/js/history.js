/**
 * 历史记录模块 - 处理查询历史的展示和管理
 */

/**
 * 加载历史记录
 */
async function loadHistory() {
    try {
        const res = await fetch('/get_dns_history');
        const data = await res.json();
        displayHistory(data.history || []);
    } catch (e) {
        console.error('加载历史记录失败:', e);
    }
}

/**
 * 去重历史记录 - 只保留每个域名组合的最新记录
 */
function deduplicateHistory(history) {
    const seen = new Map();
    
    history.forEach(record => {
        const domainsKey = record.domains.sort().join(',');
        
        // 如果这个域名组合还没有记录，或者当前记录的ID更大（更新），则保存
        if (!seen.has(domainsKey) || record.id > seen.get(domainsKey).id) {
            seen.set(domainsKey, record);
        }
    });
    
    // 返回去重后的记录数组，按时间倒序排列
    return Array.from(seen.values()).sort((a, b) => b.id.localeCompare(a.id));
}

/**
 * 生成单个时间节点的详细内容
 */
function generateNodeDetailContent(node) {
    let html = `<div style="font-size:0.75rem; margin-bottom:8px;">
        <span style="color:var(--text-dim)">📍 ${node.timestamp}</span>
    </div>`;
    
    if (node.results) {
        // 主大框容器
        html += `<div style="background: rgba(15, 23, 42, 0.3); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom:8px; width: 100%; box-sizing: border-box; max-width: 100%;">`;
        
        for (const [domain, domainResults] of Object.entries(node.results)) {
            const shownIpInfo = new Set();
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
                        const display = window.DisplayManager.formatARecordDisplay(ip, null);
                        const showInfo = display.copyable && !shownIpInfo.has(display.copy);
                        if (showInfo) {
                            shownIpInfo.add(display.copy);
                        }
                        const interactionAttr = display.copyable ? 'title="单击查看详情，双击复制IP"' : '';
                        const containerClass = display.copyable ? 'a-record-container' : '';
                        const dataAttr = display.copyable ? `data-a-ip="${display.copy}"` : '';
                        const colorAttr = display.color ? `data-ip-color="${display.color}"` : '';
                        const tagHtml = showInfo ? `<span class="ip-info-tags" data-ip-tags="${display.copy}" ${colorAttr}></span>` : '';
                        const detailHtml = display.copyable ? `<div class="ip-info-detail" data-ip-detail="${display.copy}"></div>` : '';
                        html += `<div class="${containerClass}" ${interactionAttr} ${dataAttr} style="margin-bottom:2px; width: 100%; box-sizing: border-box;">
                            <span class="record-tag" style="font-size:0.65rem; padding:2px 8px; white-space: nowrap;">A</span>
                            ${tagHtml}
                            <span class="record-value" style="font-size:0.8rem; word-break: break-all; max-width: 100%; ${display.style}">${display.text}</span>
                            ${detailHtml}
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

/**
 * 生成历史记录详细内容（时间轴视图）
 */
function generateHistoryDetailContent(record, uniqueId) {
    // 检查是否有时间节点（去重后的记录）
    if (record.time_nodes && record.time_nodes.length > 0) {
        // 按时间倒序排列
        const sortedNodes = [...record.time_nodes].sort((a, b) => b.id.localeCompare(a.id));
        
        let html = ``;
        
        // 时间轴容器 - 只显示时间轴，不显示解析结果
        html += `
            <div class="timeline-container">
                <div class="timeline-header">
                    <span class="timeline-title">📊 查询时间轴</span>
                    <span class="timeline-count">${sortedNodes.length} 次</span>
                </div>
                <div class="timeline-list">
        `;
        
        sortedNodes.forEach((node) => {
            const duration = node.duration_seconds ? `${Number(node.duration_seconds).toFixed(2)}秒` : 'N/A';
            html += `
                    <div class="timeline-item" id="timeline-${uniqueId}-${node.id}" 
                        onclick="loadTimelineDetail('${uniqueId}', '${node.id}')">
                        <span class="timeline-time">${node.date} ${node.time}</span>
                        <span class="timeline-duration">${duration}</span>
                    </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
        
        // 详情占位区域 - 点击后显示
        html += `<div class="timeline-details" id="timeline-details-${uniqueId}">
            <div style="text-align:center; color:var(--text-dim); padding: 20px; font-size:0.8rem;">
                👆 点击上方时间轴查看解析结果
            </div>
        </div>`;
        
        return html;
    } else {
        // 旧格式的记录（兼容性）- 直接显示结果
        let html = `<div style="font-size:0.75rem; margin-bottom:8px;">
            <span style="color:var(--text-dim)">📍 ${record.timestamp}</span>
        </div>`;
        
        if (record.results) {
            html += `<div style="background: rgba(15, 23, 42, 0.3); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom:8px;">`;
            
            for (const [domain, domainResults] of Object.entries(record.results)) {
                const shownIpInfo = new Set();
                html += `<div style="margin-bottom:12px;">
                    <div style="color:var(--accent-color); font-size:0.85rem; font-weight:600; margin-bottom:6px; padding-left:8px; border-left: 3px solid var(--accent-color); background: rgba(56, 189, 248, 0.05); padding: 4px 8px; border-radius: 4px;">🌐 ${domain}</div>`;
                
                for (const [dnsServer, serverResults] of Object.entries(domainResults)) {
                    html += `<div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(56, 189, 248, 0.1); border-radius: 6px; padding: 8px; margin-left: 8px; margin-bottom:6px;">
                        <div class="server-name" style="font-size:0.75rem; margin-bottom:4px; color: var(--text-dim);">🔍 ${dnsServer}</div>`;
                    
                    if (serverResults.A) {
                        html += `<div style="margin-bottom:4px;">`;
                        const ips = Array.isArray(serverResults.A) ? serverResults.A : [serverResults.A];
                        ips.forEach(ip => { 
                            const display = window.DisplayManager.formatARecordDisplay(ip, null);
                            const showInfo = display.copyable && !shownIpInfo.has(display.copy);
                            if (showInfo) {
                                shownIpInfo.add(display.copy);
                            }
                            const interactionAttr = display.copyable ? 'title="单击查看详情，双击复制IP"' : '';
                            const containerClass = display.copyable ? 'a-record-container' : '';
                            const dataAttr = display.copyable ? `data-a-ip="${display.copy}"` : '';
                            const colorAttr = display.color ? `data-ip-color="${display.color}"` : '';
                            const tagHtml = showInfo ? `<span class="ip-info-tags" data-ip-tags="${display.copy}" ${colorAttr}></span>` : '';
                            const detailHtml = display.copyable ? `<div class="ip-info-detail" data-ip-detail="${display.copy}"></div>` : '';
                            html += `<div class="${containerClass}" ${interactionAttr} ${dataAttr} style="margin-bottom:2px;">
                                <span class="record-tag" style="font-size:0.65rem; padding:2px 8px;">A</span>
                                ${tagHtml}
                                <span class="record-value" style="font-size:0.8rem; ${display.style}">${display.text}</span>
                                ${detailHtml}
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

/**
 * 全局存储历史记录数据
 */
let gHistoryRecords = [];

/**
 * 加载时间轴节点的详细解析结果
 */
function loadTimelineDetail(uniqueId, nodeId) {
    // 更新时间轴选中状态
    const timelineList = document.querySelector(`#timeline-${uniqueId}-${nodeId}`)?.closest('.timeline-list');
    if (timelineList) {
        timelineList.querySelectorAll('.timeline-item').forEach(el => {
            el.classList.remove('active');
        });
    }
    
    const selectedNode = document.getElementById(`timeline-${uniqueId}-${nodeId}`);
    if (selectedNode) {
        selectedNode.classList.add('active');
    }
    
    // 从全局数据中查找对应的节点
    let targetNode = null;
    let targetRecord = null;
    
    for (const record of gHistoryRecords) {
        if (record.time_nodes) {
            for (const node of record.time_nodes) {
                if (node.id === nodeId) {
                    targetNode = node;
                    targetRecord = record;
                    break;
                }
            }
        }
        if (targetNode) break;
    }
    
    const detailsContainer = document.getElementById(`timeline-details-${uniqueId}`);
    if (detailsContainer && targetNode && targetNode.results) {
        const results = targetNode.results;
        const domains = targetRecord.domains || [];
        
        detailsContainer.innerHTML = `
            <div class="timeline-result-wrapper" id="timeline-result-${uniqueId}"></div>
        `;
        
        const mainResult = document.getElementById('result');
        const timelineResultWrapper = document.getElementById(`timeline-result-${uniqueId}`);
        
        if (mainResult && timelineResultWrapper) {
            const originalLastResult = mainResult.getAttribute('data-last-result');
            const originalDomainOrder = mainResult.getAttribute('data-domain-order');
            
            mainResult.setAttribute('data-last-result', JSON.stringify(results));
            mainResult.setAttribute('data-domain-order', JSON.stringify(domains));
            
            const stats = {
                domainCount: domains.length,
                dnsServerCount: targetRecord.dns_servers ? targetRecord.dns_servers.length : 0,
                duration: targetNode.duration_seconds || 0,
                timestamp: `${targetNode.date} ${targetNode.time}`
            };
            
            mainResult.setAttribute('data-query-stats', JSON.stringify(stats));
            
            window.DisplayManager.renderResults(results, domains, true);
            
            const resultContent = mainResult.querySelector('#result-content');
            if (resultContent) {
                timelineResultWrapper.innerHTML = resultContent.innerHTML;
                window.DisplayManager.refreshIpInfoTags(timelineResultWrapper);
            }
            requestAnimationFrame(() => {
                detailsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            
            if (originalLastResult) {
                mainResult.setAttribute('data-last-result', originalLastResult);
            } else {
                mainResult.removeAttribute('data-last-result');
            }
            
            if (originalDomainOrder) {
                mainResult.setAttribute('data-domain-order', originalDomainOrder);
            } else {
                mainResult.removeAttribute('data-domain-order');
            }
        }
    }
}

/**
 * 显示历史记录
 */
function displayHistory(history) {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';

    if (history.length === 0) {
        historyList.innerHTML = '<div style="text-align:center; color:var(--text-dim); margin-top:40px; font-size:0.9rem;">暂无查询记录</div>';
        return;
    }

    // 后端已经按域名组合分组并去重，直接使用
    // 保存到全局变量（用于时间轴点击时获取详情）
    gHistoryRecords = history;

    history.forEach((record, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        const hasTimeNodes = record.time_nodes && record.time_nodes.length > 0;
        const uniqueId = `h${index}`; // 唯一的ID用于时间轴
        const recordId = hasTimeNodes ? (record.time_nodes[0]?.id || record.id) : record.id;
        
        // 生成统计信息HTML
        let statsHtml = '';
        if (record.stats) {
            const duration = record.stats.duration_seconds ? `${Number(record.stats.duration_seconds).toFixed(2)}秒` : 'N/A';
            statsHtml = `
                <div style="font-size:0.7rem; color:var(--text-dim); margin-top:4px; display:flex; gap:8px; flex-wrap:wrap;">
                    <span>📊 域名: ${record.stats.domain_count}</span>
                    <span>🔍 DNS: ${record.stats.dns_server_count}</span>
                    <span>⏱️ 耗时: ${duration}</span>
                </div>
            `;
        }
        
        historyItem.innerHTML = `
            <div class="delete-btn" onclick="deleteHistoryItem('${recordId}')" title="删除记录">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px; transition: all 0.3s ease;">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </div>
            <div class="history-header">
                <span class="history-time">${record.date} ${record.time}</span>
                <div class="history-domains" title="${record.domains.join(', ')}">${record.domains.join(', ')}</div>
                ${hasTimeNodes ? `<div style="font-size:0.7rem; color:var(--text-dim); margin-top:2px;">📊 共 ${record.time_nodes.length} 次查询记录</div>` : ''}
                ${statsHtml}
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-outline" style="flex:1; font-size:0.75rem; padding: 6px; display: flex; align-items: center; justify-content: center; gap: 4px;" onclick="copyToDomains('${record.domains.join('\\n')}')">
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; transition: all 0.3s ease;">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                    </svg>
                    <span>填入</span>
                </button>
                <button class="btn btn-outline" style="flex:1; font-size:0.75rem; padding: 6px; display: flex; align-items: center; justify-content: center; gap: 4px;" onclick="toggleHistoryDetail('${uniqueId}')">
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; transition: all 0.3s ease;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 10l4 4 4-4"></path>
                    </svg>
                    <span>详情</span>
                </button>
            </div>
            <div class="history-details" id="detail-${uniqueId}">
                ${generateHistoryDetailContent(record, uniqueId)}
            </div>
        `;
        historyList.appendChild(historyItem);
    });

    window.DisplayManager.bindARecordHoverHighlight(historyList);
    window.DisplayManager.refreshIpInfoTags(historyList);
}

/**
 * 切换历史记录详情显示
 */
function toggleHistoryDetail(id) {
    const el = document.getElementById(`detail-${id}`);
    el.classList.toggle('show');
}

/**
 * 复制域名到输入框
 */
function copyToDomains(text) {
    document.getElementById('domains').value = text.replace(/\\n/g, '\n');
    document.getElementById('domains').focus();
    window.DomainFormatter.updatePreview();

    setTimeout(() => {
        if (window.AppState.isHorizontalView && document.getElementById('result').children.length === 0) {
            window.UIManager.showNotification('请点击RUN QUERY进行查询，以查看横排视图效果');
        }
    }, 1000);
}



/**
 * 删除历史记录
 */
async function deleteHistoryItem(recordId) {
    showDeleteConfirm(recordId);
}

/**
 * 显示删除确认
 */
function showDeleteConfirm(recordId) {
    const confirmBtn = document.getElementById(`confirm-${recordId}`);
    if (confirmBtn) {
        confirmBtn.remove();
    } else {
        const historyItem = document.querySelector(`[onclick*="${recordId}"]`)?.closest('.history-item');
        if (historyItem) {
            const confirmButton = document.createElement('button');
            confirmButton.className = 'delete-confirm';
            confirmButton.id = `confirm-${recordId}`;
            confirmButton.textContent = '确认删除';
            confirmButton.onclick = () => confirmDelete(recordId);
            historyItem.appendChild(confirmButton);
            
            setTimeout(() => {
                if (document.getElementById(`confirm-${recordId}`)) {
                    confirmButton.remove();
                }
            }, 3000);
        }
    }
}

/**
 * 确认删除
 */
async function confirmDelete(recordId) {
    try {
        const response = await fetch('/delete_dns_history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ record_id: recordId })
        });
        if (response.ok) loadHistory();
    } catch (error) { 
        alert('删除失败'); 
    }
}

/**
 * 清空所有历史记录
 */
async function clearHistory() {
    showClearConfirm();
}

/**
 * 显示清空确认
 */
function showClearConfirm() {
    const confirmBtn = document.getElementById('clear-confirm-btn');
    if (confirmBtn) {
        confirmBtn.remove();
    } else {
        const clearBtn = document.getElementById('clearHistoryBtn');
        const confirmButton = document.createElement('button');
        confirmButton.className = 'clear-confirm';
        confirmButton.id = 'clear-confirm-btn';
        confirmButton.textContent = '确认清空全部';
        confirmButton.onclick = () => confirmClearAll();
        clearBtn.parentElement.appendChild(confirmButton);
        
        setTimeout(() => {
            if (document.getElementById('clear-confirm-btn')) {
                confirmButton.remove();
            }
        }, 3000);
    }
}

/**
 * 确认清空所有历史记录
 */
async function confirmClearAll() {
    try {
        await fetch('/clear_dns_history', { method: 'POST' });
        loadHistory();
    } catch (error) {
        alert('清空失败');
    }
}

// 导出函数到全局作用域
window.HistoryManager = {
    loadHistory,
    displayHistory,
    deduplicateHistory,
    toggleHistoryDetail,
    loadTimelineDetail,
    copyToDomains,
    deleteHistoryItem,
    clearHistory
};
