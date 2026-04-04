/**
 * 域名格式化模块 - 处理域名的格式化和预览
 */

/**
 * 域名格式化函数 - 单个域名
 */
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

/**
 * 批量格式化域名
 */
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

/**
 * 切换预览显示/隐藏
 */
function togglePreview() {
    window.AppState.previewVisible = !window.AppState.previewVisible;
    const previewDiv = document.getElementById('formatPreview');
    const previewIcon = document.getElementById('previewIcon');
    const previewText = document.getElementById('previewText');
    
    if (window.AppState.previewVisible) {
        previewDiv.style.display = 'block';
        previewIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        `;
        previewText.textContent = '隐藏格式化预览';
    } else {
        previewDiv.style.display = 'none';
        previewIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a10.07 10.07 0 0 1-5.94-1.94"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
        previewText.textContent = '显示格式化预览';
    }
}

/**
 * 实时更新预览
 */
function updatePreview() {
    if (!window.AppState.previewVisible) return;
    
    const domainInput = document.getElementById('domains').value.trim();
    const rawDomains = domainInput
        .split(/[\s,\u3001，]+/) // 支持空格、逗号、顿号、中文逗号分隔
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

// 导出函数到全局作用域
window.DomainFormatter = {
    normalizeDomain,
    normalizeDomains,
    togglePreview,
    updatePreview
};
