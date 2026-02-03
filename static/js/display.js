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
        return { text: window.DNSUtils.cleanARecordValue(rawStr), style: 'color: var(--error-color);', copyable: false, copy: '', color: null };
    }

    const cleaned = window.DNSUtils.cleanARecordValue(rawStr);

    // 非 IP：当作普通文案显示（不复制）
    if (!window.DNSUtils.isLikelyIPv4(cleaned)) {
        return { text: cleaned, style: 'color: var(--text-dim);', copyable: false, copy: '', color: null };
    }

    const count = consistency && consistency.serverCountByIp ? (consistency.serverCountByIp.get(cleaned) || 1) : 1;
    const color = (count >= 2 && consistency && consistency.colorByIp) ? consistency.colorByIp.get(cleaned) : null;

    if (color) {
        return { text: cleaned, style: `color: ${color}; font-weight: 800;`, copyable: true, copy: cleaned, color };
    }

    // 没有"多 DNS 一致出现"时，默认白色
    return { text: cleaned, style: '', copyable: true, copy: cleaned, color: null };
}

const ipInfoCache = new Map();
let ipInfoRequestId = 0;
let ipInfoRequeryBound = false;

function toAlphaColor(color, alpha) {
    if (!color) return '';
    const hslMatch = color.match(/^hsl\((.+)\)$/i);
    if (hslMatch) {
        return `hsla(${hslMatch[1]}, ${alpha})`;
    }
    const rgbMatch = color.match(/^rgb\((.+)\)$/i);
    if (rgbMatch) {
        return `rgba(${rgbMatch[1]}, ${alpha})`;
    }
    return '';
}

function applyTagColor(tag, color) {
    if (!color) return;
    const bg = toAlphaColor(color, 0.18);
    tag.style.color = color;
    tag.style.border = `1px solid ${color}`;
    if (bg) {
        tag.style.background = bg;
    }
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDateTime(timeString) {
    if (!timeString) return '';
    try {
        const date = new Date(timeString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}年${month}月${day}日 ${hours}:${minutes}:${seconds}`;
    } catch (e) {
        return String(timeString);
    }
}

function stringifyRaw(raw) {
    if (raw === undefined || raw === null) return '';
    try {
        return JSON.stringify(raw, null, 2);
    } catch (e) {
        return String(raw);
    }
}

function buildIpInfoTagsHtml(container, ip, info) {
    const nodes = container.querySelectorAll(`[data-ip-tags="${ip}"]`);
    if (!nodes.length) return;

    nodes.forEach(node => {
        node.innerHTML = '';
        const ipColor = node.getAttribute('data-ip-color');
        if (!info || info.error) {
            const tag = document.createElement('span');
            tag.className = 'ip-info-tag error';
            tag.textContent = '查询失败';
            node.appendChild(tag);
            return;
        }

        const tags = [];
        if (info.isp) {
            const tag = document.createElement('span');
            tag.className = 'ip-info-tag isp';
            tag.textContent = `运营商:${info.isp}`;
            tag.title = tag.textContent;
            tags.push(tag);
        }
        if (info.country) {
            const tag = document.createElement('span');
            tag.className = 'ip-info-tag country';
            tag.textContent = `国家:${info.country}`;
            tag.title = tag.textContent;
            tags.push(tag);
        }
        const regionParts = [info.region, info.city].filter(Boolean);
        if (regionParts.length) {
            const tag = document.createElement('span');
            tag.className = 'ip-info-tag region';
            tag.textContent = `地区:${regionParts.join(' ')}`;
            tag.title = tag.textContent;
            tags.push(tag);
        }
        if (info.ip_type) {
            const tag = document.createElement('span');
            tag.className = 'ip-info-tag type';
            tag.textContent = `类型:${info.ip_type}`;
            tag.title = tag.textContent;
            tags.push(tag);
        }
        if (!tags.length) {
            const tag = document.createElement('span');
            tag.className = 'ip-info-tag';
            tag.textContent = '未知';
            tag.title = tag.textContent;
            tags.push(tag);
        }
        tags.forEach(tag => {
            if (ipColor) {
                applyTagColor(tag, ipColor);
            }
            node.appendChild(tag);
        });
    });
}

function buildIpInfoDetailHtml(container, ip, info) {
    const nodes = container.querySelectorAll(`[data-ip-detail="${ip}"]`);
    if (!nodes.length) return;

    const isp = info && info.isp ? info.isp : '';
    const country = info && info.country ? info.country : '';
    const region = info && info.region ? info.region : '';
    const city = info && info.city ? info.city : '';
    const ipType = info && info.ip_type ? info.ip_type : '';
    const rawText = info ? stringifyRaw(info._raw) : '';
    const urlText = info && info._source_url ? info._source_url : '';
    const timeText = info && info._fetched_at ? formatDateTime(info._fetched_at) : '';
    const errorText = info && info.error ? info.error : '';

    const detailHtml = info
        ? `
            <div class="ip-info-detail-content">
                <div class="ip-info-detail-title">${errorText ? 'IP详情（查询失败）' : 'IP详情'}</div>
                ${errorText ? `<div class="ip-info-detail-error">错误信息：${escapeHtml(errorText)}</div>` : ''}
                <div class="ip-info-detail-raw">
                    <pre>${escapeHtml(rawText || '无')}</pre>
                </div>
                <div class="ip-info-detail-meta">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>请求URL：</span>
                        <span style="flex: 1; word-break: break-all;">${escapeHtml(urlText || '无')}</span>
                        ${urlText ? `<button class="btn btn-outline" onclick="window.DNSUtils.copyToClipboard('${escapeHtml(urlText)}', event)" style="padding: 2px 8px; font-size: 0.7rem; min-width: auto;" title="点击复制URL">复制</button>` : ''}
                    </div>
                    <div>查询时间：${escapeHtml(timeText || '无')}</div>
                </div>
                <div class="ip-info-detail-actions">
                    <button class="btn btn-outline ip-info-requery-btn" data-ip-requery="${escapeHtml(ip)}">重新查询</button>
                </div>
            </div>
        `
        : `
            <div class="ip-info-detail-content">
                <div class="ip-info-detail-title">IP详情</div>
                <div class="ip-info-detail-empty">查询中...</div>
                <div class="ip-info-detail-actions">
                    <button class="btn btn-outline ip-info-requery-btn" data-ip-requery="${escapeHtml(ip)}">重新查询</button>
                </div>
            </div>
        `;

    nodes.forEach(node => {
        node.innerHTML = detailHtml;
    });
}

function setIpInfoLoading(container, ip) {
    const nodes = container.querySelectorAll(`[data-ip-tags="${ip}"]`);
    if (!nodes.length) return;
    nodes.forEach(node => {
        if (node.childElementCount > 0) return;
        const tag = document.createElement('span');
        tag.className = 'ip-info-tag loading';
        tag.textContent = '查询中';
        node.appendChild(tag);
    });
}

async function requestIpInfo(ips, force) {
    let data = null;
    try {
        const response = await fetch('/query_ip_info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ips, force: !!force })
        });
        data = await response.json();
    } catch (e) {
        data = null;
    }
    return data;
}

async function refreshIpInfoTags(container) {
    const scope = container || document;
    const nodes = scope.querySelectorAll('[data-ip-tags]');
    if (!nodes.length) return;

    const ips = new Set();
    nodes.forEach(node => {
        const ip = node.getAttribute('data-ip-tags');
        if (window.DNSUtils.isLikelyIPv4(ip)) {
            ips.add(ip);
        }
    });

    const missing = [];
    ips.forEach(ip => {
        if (ipInfoCache.has(ip)) {
            const cached = ipInfoCache.get(ip);
            buildIpInfoTagsHtml(scope, ip, cached);
            buildIpInfoDetailHtml(scope, ip, cached);
        } else {
            setIpInfoLoading(scope, ip);
            buildIpInfoDetailHtml(scope, ip, null);
            missing.push(ip);
        }
    });

    if (!missing.length) return;

    const currentRequestId = ++ipInfoRequestId;
    const data = await requestIpInfo(missing, false);

    if (currentRequestId !== ipInfoRequestId) return;

    const results = data && data.results ? data.results : {};
    missing.forEach(ip => {
        const info = results[ip] || { error: '查询失败' };
        ipInfoCache.set(ip, info);
        buildIpInfoTagsHtml(scope, ip, info);
        buildIpInfoDetailHtml(scope, ip, info);
    });
}

function bindIpInfoRequery() {
    if (ipInfoRequeryBound) return;
    document.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-ip-requery]');
        if (!btn && event.target.closest('.ip-info-detail')) {
            event.stopPropagation();
            return;
        }
        if (!btn) return;
        event.stopPropagation();
        const ip = btn.getAttribute('data-ip-requery');
        if (!ip || !window.DNSUtils.isLikelyIPv4(ip)) return;
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = '查询中';
        const data = await requestIpInfo([ip], true);
        const results = data && data.results ? data.results : {};
        const info = results[ip] || { error: '查询失败' };
        ipInfoCache.set(ip, info);
        buildIpInfoTagsHtml(document, ip, info);
        buildIpInfoDetailHtml(document, ip, info);
        btn.disabled = false;
        btn.textContent = originalText;
    }, true);
    ipInfoRequeryBound = true;
}

/**
 * 绑定A记录悬停高亮和IP详情弹窗交互
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

    // 存储定时器
    const hideTimers = new Map();

    items.forEach(el => {
        const ip = el.getAttribute('data-a-ip');
        if (!ip) {
            return;
        }
        
        const tooltip = el.querySelector('.ip-info-detail');
        if (!tooltip) return;

        // 清除该IP的所有定时器
        const clearTimer = () => {
            const timer = hideTimers.get(ip);
            if (timer) {
                clearTimeout(timer);
                hideTimers.delete(ip);
            }
        };

        // 显示弹窗
        const showTooltip = () => {
            clearAll();
            clearTimer();
            const group = listByIp.get(ip);
            if (group) {
                group.forEach(node => {
                    node.classList.add('a-record-highlight');
                });
            }

            // 智能定位弹窗
            tooltip.style.display = 'block';
            tooltip.style.visibility = 'hidden';
            tooltip.style.opacity = '0';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.transform = 'translateY(-10px) scale(0.95)';

            const detailContent = tooltip.querySelector('.ip-info-detail-content');
            const maxWidth = Math.max(260, Math.min(520, window.innerWidth - 24));
            tooltip.style.maxWidth = `${maxWidth}px`;

            const rect = el.getBoundingClientRect();
            let tooltipRect = tooltip.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            const useAbove = spaceBelow < tooltipRect.height && spaceAbove > spaceBelow;
            if (useAbove) {
                tooltip.style.top = 'auto';
                tooltip.style.bottom = '100%';
                tooltip.style.marginBottom = '8px';
                tooltip.style.marginTop = '0';
            } else {
                tooltip.style.top = '100%';
                tooltip.style.bottom = 'auto';
                tooltip.style.marginTop = '8px';
                tooltip.style.marginBottom = '0';
            }

            if (rect.left + tooltipRect.width > window.innerWidth) {
                tooltip.style.left = 'auto';
                tooltip.style.right = '0';
            } else {
                tooltip.style.left = '0';
                tooltip.style.right = 'auto';
            }

            if (detailContent) {
                const verticalSpace = useAbove ? spaceAbove : spaceBelow;
                const maxHeight = Math.max(220, Math.min(480, verticalSpace - 16));
                detailContent.style.maxHeight = `${maxHeight}px`;
                detailContent.style.overflow = 'auto';
            }

            tooltip.style.visibility = 'visible';
            setTimeout(() => {
                tooltip.style.opacity = '1';
                tooltip.style.pointerEvents = 'auto';
                tooltip.style.transform = 'translateY(0) scale(1)';
            }, 10);
        };

        // 延迟隐藏弹窗
        const hideTooltip = () => {
            clearTimer();
            const timer = setTimeout(() => {
                tooltip.style.opacity = '0';
                tooltip.style.pointerEvents = 'none';
                tooltip.style.transform = 'translateY(-10px) scale(0.95)';
                setTimeout(() => {
                    tooltip.style.display = 'none';
                }, 300);
                clearAll();
            }, 150); // 150ms延迟，给用户时间移动到弹窗
            hideTimers.set(ip, timer);
        };

        el.addEventListener('mouseenter', showTooltip);
        el.addEventListener('mouseleave', hideTooltip);

        // 弹窗本身的交互
        tooltip.addEventListener('mouseenter', clearTimer);
        tooltip.addEventListener('mouseleave', hideTooltip);

        // 点击弹窗内容时阻止隐藏
        tooltip.addEventListener('click', (e) => {
            e.stopPropagation();
            clearTimer();
        });
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
                    <span class="stats-value">${Number(queryStats.duration).toFixed(2)}秒</span>
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

    container.innerHTML = '';

    // 渲染统计栏（仅在首次或强制重新创建时）
    if (queryStats && domainsToRender.length > 0) {
        renderStatsBar(container, queryStats);
    }

    if (window.AppState.isHorizontalView) {
        // 横排视图模式
        container.classList.add('horizontal-view');
        renderHorizontalView(container, resultsData, domainsToRender, dnsServers);
    } else {
        // 原始的卡片视图模式
        container.classList.remove('horizontal-view');
        renderCardView(container, resultsData, domainsToRender, dnsServers);
    }

    bindARecordHoverHighlight(container);
    bindIpInfoRequery(container);
    refreshIpInfoTags(container);
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
        const shownIpInfo = new Set();

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
                        const showInfo = display.copyable && !shownIpInfo.has(display.copy);
                        if (showInfo) {
                            shownIpInfo.add(display.copy);
                        }
                        const onClickAttr = display.copyable ? `onclick="window.DNSUtils.copyToClipboard('${display.copy}', event)" title="点击复制IP地址"` : '';
                        const containerClass = display.copyable ? 'a-record-container' : '';
                        const dataAttr = display.copyable ? `data-a-ip="${display.copy}"` : '';
                        const colorAttr = display.color ? `data-ip-color="${display.color}"` : '';
                        const tagHtml = showInfo ? `<span class="ip-info-tags" data-ip-tags="${display.copy}" ${colorAttr}></span>` : '';
                        const detailHtml = showInfo ? `<div class="ip-info-detail" data-ip-detail="${display.copy}"></div>` : '';
                        const tagsBlock = tagHtml ? `<div>${tagHtml}</div>` : '';

                        dnsContent += `<div class="${containerClass}" ${onClickAttr} ${dataAttr} style="margin-bottom: 4px;">
                            ${tagsBlock}
                            <div>
                                <span class="record-tag" style="font-size:0.6rem; padding:1px 6px;">A</span>
                                <span style="${display.style}">${display.text}</span>
                            </div>
                            ${detailHtml}
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
        const shownIpInfo = new Set();

        // 按照DNS配置的顺序显示结果
        dnsServers.forEach(dnsServerConfig => {
            if (results[dnsServerConfig]) {
                const records = results[dnsServerConfig];
                html += `<div class="detail-server-block"><div class="server-name">${dnsServerConfig}</div>`;

                if(records.A) {
                    const ips = Array.isArray(records.A) ? records.A : [records.A];
                    ips.forEach(ip => {
                        const display = formatARecordDisplay(ip, consistency);
                        const showInfo = display.copyable && !shownIpInfo.has(display.copy);
                        if (showInfo) {
                            shownIpInfo.add(display.copy);
                        }
                        const onClickAttr = display.copyable ? `onclick="window.DNSUtils.copyToClipboard('${display.copy}', event)" title="点击复制IP地址"` : '';
                        const containerClass = display.copyable ? 'a-record-container' : '';
                        const dataAttr = display.copyable ? `data-a-ip="${display.copy}"` : '';
                        const colorAttr = display.color ? `data-ip-color="${display.color}"` : '';
                        const tagHtml = showInfo ? `<span class="ip-info-tags" data-ip-tags="${display.copy}" ${colorAttr}></span>` : '';
                        const detailHtml = showInfo ? `<div class="ip-info-detail" data-ip-detail="${display.copy}"></div>` : '';
                        const tagsBlock = tagHtml ? `<div style="margin-bottom: 4px;">${tagHtml}</div>` : '';

                        html += `<div class="${containerClass}" ${onClickAttr} ${dataAttr} style="padding: 4px; border-radius: 4px;">
                            ${tagsBlock}
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="record-tag">A</span>
                                <span class="record-value" style="${display.style}">${display.text}</span>
                            </div>
                            ${detailHtml}
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
    refreshIpInfoTags,
    renderResults,
    toggleViewMode
};
