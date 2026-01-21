/**
 * UI交互模块 - 处理通知、滚动等UI交互
 */

/**
 * 显示通知
 */
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
    
    return notification;
}

/**
 * 处理滚动事件 - 控制"返回顶部"按钮
 */
function handleScroll() {
    const backToTopBtn = document.getElementById('backToTopBtn');
    if (!backToTopBtn) return;

    // 当顶部"定义区域"（三栏配置区）看不到时才显示
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

/**
 * 滚动到顶部
 */
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

/**
 * 同步视图切换按钮UI
 */
function syncViewToggleUI() {
    const viewToggleBtn = document.getElementById('viewToggleBtn');
    const viewToggleText = document.getElementById('viewToggleText');
    const viewToggleIcon = document.getElementById('viewToggleIcon');
    if (!viewToggleBtn || !viewToggleText || !viewToggleIcon) return;

    viewToggleText.textContent = '视图切换';
}

// 导出函数到全局作用域
window.UIManager = {
    showNotification,
    handleScroll,
    scrollToTop,
    syncViewToggleUI
};
