/**
 * 主入口文件 - 初始化应用并绑定全局事件
 * 依赖模块: config.js, utils.js, format.js, ui.js, display.js, history.js, query.js
 */

// ============================================
// 全局函数代理 - 将模块函数暴露到全局作用域
// ============================================

// Utils模块
function colorFromIp(ip) { return window.DNSUtils.colorFromIp(ip); }
function cleanARecordValue(value) { return window.DNSUtils.cleanARecordValue(value); }
function isLikelyIPv4(value) { return window.DNSUtils.isLikelyIPv4(value); }
function isARecordNonCopyable(value) { return window.DNSUtils.isARecordNonCopyable(value); }
function copyToClipboard(text, event) { return window.DNSUtils.copyToClipboard(text, event); }
function addDNS(dnsServer) { return window.DNSUtils.addDNS(dnsServer); }

// Format模块
function normalizeDomain(domain) { return window.DomainFormatter.normalizeDomain(domain); }
function normalizeDomains(domains) { return window.DomainFormatter.normalizeDomains(domains); }
function togglePreview() { return window.DomainFormatter.togglePreview(); }
function updatePreview() { return window.DomainFormatter.updatePreview(); }

// UI模块
function showNotification(message) { return window.UIManager.showNotification(message); }
function handleScroll() { return window.UIManager.handleScroll(); }
function scrollToTop() { return window.UIManager.scrollToTop(); }
function syncViewToggleUI() { return window.UIManager.syncViewToggleUI(); }

// Display模块
function buildAConsistency(domainResults, dnsServers) { return window.DisplayManager.buildAConsistency(domainResults, dnsServers); }
function formatARecordDisplay(rawValue, consistency) { return window.DisplayManager.formatARecordDisplay(rawValue, consistency); }
function bindARecordHoverHighlight(root) { return window.DisplayManager.bindARecordHoverHighlight(root); }
function renderResults(data, domainOrder) { return window.DisplayManager.renderResults(data, domainOrder); }
function toggleViewMode() { return window.DisplayManager.toggleViewMode(); }

// History模块
function loadHistory() { return window.HistoryManager.loadHistory(); }
function displayHistory(history) { return window.HistoryManager.displayHistory(history); }
function toggleHistoryDetail(id) { return window.HistoryManager.toggleHistoryDetail(id); }
function showTimeNodeDetail(nodeId) { return window.HistoryManager.showTimeNodeDetail(nodeId); }
function copyToDomains(text) { return window.HistoryManager.copyToDomains(text); }
function loadHistoryResult(recordId) { return window.HistoryManager.loadHistoryResult(recordId); }
function deleteHistoryItem(recordId) { return window.HistoryManager.deleteHistoryItem(recordId); }
function clearHistory() { return window.HistoryManager.clearHistory(); }

// Query模块
function loadDNSConfig() { return window.QueryManager.loadDNSConfig(); }
function saveDNSConfig() { return window.QueryManager.saveDNSConfig(); }
function queryDNS() { return window.QueryManager.queryDNS(); }
function clearDNSCache() { return window.QueryManager.clearDNSCache(); }

// ============================================
// 应用初始化
// ============================================

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
