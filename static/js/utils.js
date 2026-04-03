/**
 * 工具函数模块 - 存放通用的辅助函数
 */

/**
 * 根据IP地址生成颜色
 */
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

/**
 * 清理A记录值（去除一致性标记）
 */
function cleanARecordValue(value) {
    return String(value || '').replace(/\s*\(一致\)\s*/g, '').trim();
}

/**
 * 判断是否为IPv4地址
 */
function isLikelyIPv4(value) {
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

/**
 * 判断A记录是否为不可复制的错误状态
 */
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

/**
 * 复制到剪贴板
 */
function copyToClipboard(text, event) {
    // 尝试使用现代API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showCopyNotification(text, event);
        }).catch(err => {
            console.warn('Clipboard API失败，尝试备用方法:', err);
            fallbackCopy(text, event);
        });
    } else {
        fallbackCopy(text, event);
    }
}

/**
 * 备用复制方法
 */
function fallbackCopy(text, event) {
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        
        if (successful) {
            showCopyNotification(text, event);
        } else {
            alert('复制失败，请手动复制');
        }
    } catch (err) {
        console.error('备用复制方法失败:', err);
        alert('复制失败，请手动复制');
    }
}

/**
 * 显示复制成功提示
 */
function showCopyNotification(text, event) {
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
    notification.textContent = `已复制: ${text}`;
    document.body.appendChild(notification);
    
    const mouseX = event ? event.clientX : window.innerWidth / 2;
    const mouseY = event ? event.clientY : window.innerHeight / 2;
    
    const rect = notification.getBoundingClientRect();
    let left = mouseX + 15;
    let top = mouseY - rect.height - 10;
    
    if (left + rect.width > window.innerWidth - 10) {
        left = mouseX - rect.width - 15;
    }
    
    if (top < 10) {
        top = mouseY + 15;
    }
    
    notification.style.left = left + 'px';
    notification.style.top = top + 'px';
    
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 1500);
}

/**
 * 添加DNS服务器
 */
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

/**
 * 切换常用DNS服务器下拉菜单
 */
function toggleDnsDropdown() {
    const content = document.getElementById('dnsDropdownContent');
    const arrow = document.getElementById('dnsDropdownArrow');
    
    if (!content || !arrow) return;
    
    if (content.style.maxHeight === '0px' || content.style.maxHeight === '') {
        content.style.maxHeight = '300px';
        arrow.style.transform = 'rotate(180deg)';
    } else {
        content.style.maxHeight = '0px';
        arrow.style.transform = 'rotate(0deg)';
    }
}

// 导出函数到全局作用域
window.DNSUtils = {
    colorFromIp,
    cleanARecordValue,
    isLikelyIPv4,
    isARecordNonCopyable,
    copyToClipboard,
    addDNS,
    toggleDnsDropdown
};
