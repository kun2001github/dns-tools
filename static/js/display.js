/**
 * 结果展示模块 - 处理DNS查询结果的展示和渲染
 */

/**
 * 构建A记录一致性检查
 */
function buildAConsistency(domainResults, dnsServers) {
    const serversByIp = new Map();
    const orderedIps = [];

    dnsServers.forEach(server => {
        const records = domainResults[server];
        if (!records || !records.A) return;
        const ips = Array.isArray(records.A) ? records.A : [records.A];

        ips.forEach(raw => {
            const rawStr = String(raw || '');
            if (window.DNSUtils.isARecordNonCopyable(rawStr)) return;

            const ip = window.DNSUtils.cleanARecordValue(rawStr);
            if (!window.DNSUtils.isLikelyIPv4(ip)) return;

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
            colorByIp.set(ip, window.DNSUtils.colorFromIp(ip));
        }
    });

    return { colorByIp, serverCountByIp };
}

/**
 * 格式化A记录的显示
 */
function formatARecordDisplay(rawValue, consistency) {
    const rawStr = String(rawValue || '');

    // 错误/状态文案：不提供复制
    if (window.DNSUtils.isARecordNonCopyable(rawStr)) {
        return { text: window.DNSUtils.cleanARecordValue(rawStr), style: 'color: var(--error-color);', copyable: false, copy: '' };
    }

    const cleaned = window.DNSUtils.cleanARecordValue(rawStr);

    // 非 IP：当作普通文案显示（不复制）
    if (!window.DNSUtils.isLikelyIPv4(cleaned)) {
        return { text: cleaned, style: 'color: var(--text-dim);', copyable: false, copy: '' };
    }

    const count = consistency && consistency.serverCountByIp ? (consistency.serverCountByIp.get(cleaned) || 1) : 1;
    const color = (count >= 2 && consistency && consistency.colorByIp) ? consistency.colorByIp.get(cleaned) : null;

    if (color) {
        return { text: cleaned, style: `color: ${color}; font-weight: 800;`, copyable: true, copy: cleaned };
    }

    // 没有"多 DNS 一致出现"时，默认白色
    return { text: cleaned, style: '', copyable: true, copy: cleaned };
}

/**
 * 绑定A记录悬停高亮
 */
function bindARecordHoverHighlight(root) {
    const scope = root || document;
    const items = scope.querySelectorAll('[data-a-ip]');
    if (!items.length) return;

    const listByIp = new Map();
    items.forEach(el => {
        const ip = el.getAttribute('data-a-ip');
        if (!ip) {
            return;
        }
        if (!listByIp.has(ip)) listByIp.set(ip, []);
        listByIp.get(ip).push(el);
    });

    const clearAll = () => {
        listByIp.forEach(group => {
            group.forEach(node => {
                node.classList.remove('a-record-highlight');
            });
        });
    };

    items.forEach(el => {
        const ip = el.getAttribute('data-a-ip');
        if (!ip) {
            return;
        }
        el.addEventListener('mouseenter', () => {
            clearAll();
            const group = listByIp.get(ip);
            if (group) {
                group.forEach(node => {
                    node.classList.add('a-record-highlight');
                });
            }
        });
        el.addEventListener('mouseleave', clearAll);
    });
}

/**
 * 渲染查询统计信息条
 * 使用唯一ID防止重复创建，确保切换视图时保持稳定
 */
function renderStatsBar(container, queryStats) {
    let statsBar = container.querySelector('#stats-bar');
    
    // 统计内容HTML结构 - 使用SVG美化
    const statsContentHtml = `
        <div class="stats-info-group">
            <div class="stats-item">
                <svg class="stats-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <div class="stats-text">
                    <span class="stats-label">查询域名数量</span>
                    <span class="stats-value">${queryStats.domainCount}个</span>
                </div>
            </div>
            <div class="stats-divider"></div>
            <div class="stats-item">
                <svg class="stats-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                    <path d="M2 17l10 5 10-5"></path>
                    <path d="M2 12l10 5 10-5"></path>
                </svg>
                <div class="stats-text">
                    <span class="stats-label">DNS服务器数量</span>
                    <span class="stats-value">${queryStats.dnsServerCount || 0}个</span>
                </div>
            </div>
            <div class="stats-divider"></div>
            <div class="stats-item">
                <svg class="stats-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <div class="stats-text">
                    <span class="stats-label">本次查询耗时</span>
                    <span class="stats-value">${queryStats.duration}秒</span>
                </div>
            </div>
            <div class="stats-divider"></div>
            <div class="stats-item">
                <svg class="stats-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <div class="stats-text">
                    <span class="stats-label">查询时间</span>
                    <span class="stats-value">${queryStats.timestamp || '-'}</span>
                </div>
            </div>
        </div>
        <button class="btn btn-outline stats-action-btn" id="clearCacheBtn">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"></path>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                <path d="M10 11v6"></path>
                <path d="M14 11v6"></path>
            </svg>
            <span>清理DNS缓存</span>
        </button>
    `;

    if (!statsBar) {
        statsBar = document.createElement('div');
        statsBar.id = 'stats-bar';
        statsBar.className = 'stats-bar glass-card';
        
        // 插入到容器最前面
        container.insertBefore(statsBar, container.firstChild);
    }

    // 更新内容（即使已存在也更新，修复旧数据残留bug）
    statsBar.innerHTML = statsContentHtml;

    // 重新绑定事件（因为innerHTML重置了DOM）
    const btn = statsBar.querySelector('#clearCacheBtn');
    if (btn) {
        btn.onclick = window.QueryManager ? window.QueryManager.clearDNSCache : window.clearDNSCache;
    }
}

/**
 * 渲染结果（根据视图模式）
 * @param {Object} data - 查询结果数据
 * @param {Array} domainOrder - 域名顺序（可选）
 * @param {boolean} forceRecreateStats - 强制重新创建统计栏（默认false）
 */
function renderResults(data, domainOrder, forceRecreateStats = false) {
    const container = document.getElementById('result');

    // 获取当前DNS配置的顺序
    const dnsServers = document.getElementById('dns_servers').value.trim().split('\n').map(s => s.trim()).filter(s => s);

    // 渲染查询结果
    const resultsData = data.results || data;

    // 按照原始域名顺序渲染
    const domainsToRender = domainOrder || Object.keys(resultsData);

    // 获取查询统计信息
    const statsData = container.getAttribute('data-query-stats');
    let queryStats = null;
    if (statsData) {
        try {
            queryStats = JSON.parse(statsData);
        } catch (e) {
            console.error('解析统计信息失败:', e);
        }
    }

    // 创建/获取内容容器（包裹结果内容，不包含统计栏）
    let contentContainer = container.querySelector('#result-content');
    if (!contentContainer) {
        contentContainer = document.createElement('div');
        contentContainer.id = 'result-content';
        container.appendChild(contentContainer);
    } else {
        // 只清空内容容器，保留统计栏
        contentContainer.innerHTML = '';
    }

    // 强制重新创建时，先移除现有统计栏
    if (forceRecreateStats) {
        const existingStatsBar = container.querySelector('#stats-bar');
        if (existingStatsBar) {
            existingStatsBar.remove();
        }
    }

    // 渲染统计栏（仅在首次或强制重新创建时）
    if (queryStats && domainsToRender.length > 0) {
        renderStatsBar(container, queryStats);
    }

    if (window.AppState.isHorizontalView) {
        // 横排视图模式
        container.classList.add('horizontal-view');
        renderHorizontalView(contentContainer, resultsData, domainsToRender, dnsServers);
    } else {
        // 原始的卡片视图模式
        container.classList.remove('horizontal-view');
        renderCardView(contentContainer, resultsData, domainsToRender, dnsServers);
    }

    bindARecordHoverHighlight(container);
}

/**
 * 渲染横排视图
 */
function renderHorizontalView(container, resultsData, domainsToRender, dnsServers) {
    domainsToRender.forEach(domain => {
        const results = resultsData[domain];
        if (!results) return;

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
                        const onClickAttr = display.copyable ? `onclick="window.DNSUtils.copyToClipboard('${display.copy}', event)" title="点击复制IP地址"` : '';
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
    });
}

/**
 * 渲染卡片视图
 */
function renderCardView(container, resultsData, domainsToRender, dnsServers) {
    domainsToRender.forEach(domain => {
        const results = resultsData[domain];
        if (!results) return;

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

                        const onClickAttr = display.copyable ? `onclick="window.DNSUtils.copyToClipboard('${display.copy}', event)" title="点击复制IP地址"` : '';
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
    });
}

/**
 * 切换视图模式
 */
function toggleViewMode() {
    const resultContainer = document.getElementById('result');

    const currentResult = resultContainer.getAttribute('data-last-result');
    const currentDomainOrder = resultContainer.getAttribute('data-domain-order');

    // 如果没有任何结果数据，提示用户
    if (!currentResult && resultContainer.children.length === 0) {
        window.UIManager.showNotification('请先进行DNS查询，然后再切换视图模式');
        return;
    }

    // 切换视图状态
    window.AppState.isHorizontalView = !window.AppState.isHorizontalView;
    window.UIManager.syncViewToggleUI();
    window.UIManager.showNotification(window.AppState.isHorizontalView ? '已切换到横排视图模式' : '已切换到竖排视图模式');

    // 重新渲染当前结果
    if (currentResult) {
        const domainOrder = currentDomainOrder ? JSON.parse(currentDomainOrder) : null;
        renderResults(JSON.parse(currentResult), domainOrder);
    }
}

// 导出函数到全局作用域
window.DisplayManager = {
    buildAConsistency,
    formatARecordDisplay,
    bindARecordHoverHighlight,
    renderResults,
    toggleViewMode
};
