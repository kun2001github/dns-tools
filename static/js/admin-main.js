/**
 * DNS Tools 管理后台 - 主入口
 * 负责Tab切换和页面初始化
 */

document.addEventListener('DOMContentLoaded', function() {
    // Tab 切换
    const navBtns = document.querySelectorAll('.nav-btn[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            
            // 更新导航按钮状态
            navBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // 更新Tab内容显示
            tabContents.forEach(content => {
                content.classList.remove('active');
            });
            const targetTab = document.getElementById(`tab-${tabId}`);
            if (targetTab) {
                targetTab.classList.add('active');
            }
            
            // 触发Tab切换事件
            document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tab: tabId } }));
        });
    });
    
    // 显示消息提示
    window.showMessage = function(message, type = 'success') {
        // 移除现有消息
        const existingMessage = document.querySelector('.message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // 创建新消息
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        messageEl.textContent = message;
        
        // 插入到主内容区顶部
        const mainEl = document.querySelector('.admin-main');
        mainEl.insertBefore(messageEl, mainEl.firstChild);
        
        // 3秒后自动消失
        setTimeout(() => {
            messageEl.remove();
        }, 3000);
    };
    
    // 显示加载状态
    window.showLoading = function(container) {
        container.innerHTML = '<div class="loading">加载中...</div>';
    };
    
    // 格式化数字
    window.formatNumber = function(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    };
    
    // 格式化时间（毫秒）
    window.formatTime = function(ms) {
        if (ms >= 1000) {
            return (ms / 1000).toFixed(2) + 's';
        }
        return ms + 'ms';
    };
    
    console.log('DNS Tools 管理后台已初始化');
});
