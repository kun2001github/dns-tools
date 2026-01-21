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
                        const displayIp = window.DNSUtils.cleanARecordValue(ip);
                        html += `<div class="a-record-container" data-a-ip="${displayIp}" onclick="window.DNSUtils.copyToClipboard('${displayIp}', event)" title="点击复制IP地址" style="margin-bottom:2px; width: 100%; box-sizing: border-box;">
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

/**
 * 生成历史记录详细内容
 */
function generateHistoryDetailContent(record) {
    // 检查是否有时间节点（去重后的记录）
    if (record.time_nodes && record.time_nodes.length > 0) {
        // 按时间倒序排列
        const sortedNodes = [...record.time_nodes].sort((a, b) => b.id.localeCompare(a.id));
        
        let html = ``;
        
        // 显示时间节点选择
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
        
        // 显示详情内容区域
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
            html += `<div style="background: rgba(15, 23, 42, 0.3); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom:8px;">`;
            
            for (const [domain, domainResults] of Object.entries(record.results)) {
                html += `<div style="margin-bottom:12px;">
                    <div style="color:var(--accent-color); font-size:0.85rem; font-weight:600; margin-bottom:6px; padding-left:8px; border-left: 3px solid var(--accent-color); background: rgba(56, 189, 248, 0.05); padding: 4px 8px; border-radius: 4px;">🌐 ${domain}</div>`;
                
                for (const [dnsServer, serverResults] of Object.entries(domainResults)) {
                    html += `<div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(56, 189, 248, 0.1); border-radius: 6px; padding: 8px; margin-left: 8px; margin-bottom:6px;">
                        <div class="server-name" style="font-size:0.75rem; margin-bottom:4px; color: var(--text-dim);">🔍 ${dnsServer}</div>`;
                    
                    if (serverResults.A) {
                        html += `<div style="margin-bottom:4px;">`;
                        const ips = Array.isArray(serverResults.A) ? serverResults.A : [serverResults.A];
                        ips.forEach(ip => { 
                            const displayIp = window.DNSUtils.cleanARecordValue(ip);
                            html += `<div class="a-record-container" data-a-ip="${displayIp}" onclick="window.DNSUtils.copyToClipboard('${displayIp}', event)" title="点击复制IP地址" style="margin-bottom:2px;">
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

    history.forEach(record => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        const hasTimeNodes = record.time_nodes && record.time_nodes.length > 0;
        const recordId = hasTimeNodes ? record.time_nodes[0].id : record.id;
        
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
                ${hasTimeNodes ? `<div style="font-size:0.7rem; color:var(--text-dim); margin-top:2px;">共 ${record.time_nodes.length} 次查询记录</div>` : ''}
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-outline" style="flex:1; font-size:0.75rem; padding: 6px; display: flex; align-items: center; justify-content: center; gap: 4px;" onclick="copyToDomains('${record.domains.join('\\n')}')">
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; transition: all 0.3s ease;">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                    </svg>
                    <span>填入</span>
                </button>
                <button class="btn btn-outline" style="flex:1; font-size:0.75rem; padding: 6px; display: flex; align-items: center; justify-content: center; gap: 4px;" onclick="loadHistoryResult('${recordId}')">
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; transition: all 0.3s ease;">
                        <path d="M3 15v4c0 1-1 2-2 2H7c-1 0-2-1-2-2v-4"></path>
                        <polyline points="17 21 17 13 7 13 7 21"></polyline>
                        <line x1="7" y1="3" x2="7" y2="8"></line>
                    </svg>
                    <span>加载结果</span>
                </button>
                <button class="btn btn-outline" style="flex:1; font-size:0.75rem; padding: 6px; display: flex; align-items: center; justify-content: center; gap: 4px;" onclick="toggleHistoryDetail('${recordId}')">
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; transition: all 0.3s ease;">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <span>详情</span>
                </button>
            </div>
            <div class="history-details" id="detail-${recordId}">
                ${generateHistoryDetailContent(record)}
            </div>
        `;
        historyList.appendChild(historyItem);
    });

    window.DisplayManager.bindARecordHoverHighlight(historyList);
}

/**
 * 切换历史记录详情显示
 */
function toggleHistoryDetail(id) {
    const el = document.getElementById(`detail-${id}`);
    el.classList.toggle('show');
}

/**
 * 显示时间节点详情
 */
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
 * 加载历史记录结果到主结果区域
 */
function loadHistoryResult(recordId) {
    fetch('/get_dns_history')
        .then(res => res.json())
        .then(data => {
            const history = data.history || [];
            let targetRecord = null;
            let targetNode = null;

            // 查找匹配的历史记录
            for (const record of history) {
                if (record.time_nodes && record.time_nodes.length > 0) {
                    const mainRecordId = record.time_nodes[0].id;
                    if (mainRecordId === recordId) {
                        targetRecord = record;
                        targetNode = record.time_nodes[0];
                        break;
                    }
                    for (const node of record.time_nodes) {
                        if (node.id === recordId) {
                            targetRecord = record;
                            targetNode = node;
                            break;
                        }
                    }
                    if (targetNode) break;
                } else if (record.id === recordId) {
                    targetRecord = record;
                    targetNode = record;
                    break;
                }
            }

            if (targetRecord && targetNode && targetNode.results) {
                const results = targetNode.results;
                const domains = targetRecord.domains || [];

                document.getElementById('result').setAttribute('data-last-result', JSON.stringify(results));
                document.getElementById('result').setAttribute('data-domain-order', JSON.stringify(domains));

                window.DisplayManager.renderResults(results, domains);
                window.UIManager.showNotification('已加载历史记录结果，保持原始域名顺序');

                setTimeout(() => {
                    document.getElementById('result').scrollIntoView({ behavior: 'smooth' });
                }, 100);
            } else {
                alert('未找到对应的历史记录');
            }
        })
        .catch(err => {
            console.error('加载历史记录失败:', err);
            alert('加载历史记录失败');
        });
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
        const historyItem = document.querySelector(`[onclick*="${recordId}"]`).closest('.history-item');
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
    toggleHistoryDetail,
    showTimeNodeDetail,
    copyToDomains,
    loadHistoryResult,
    deleteHistoryItem,
    clearHistory
};
