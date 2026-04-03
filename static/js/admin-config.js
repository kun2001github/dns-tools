/**
 * DNS Tools 管理后台 - 配置管理模块
 * 负责DNS配置、IP API配置、系统参数管理
 */

document.addEventListener('DOMContentLoaded', function() {
    // 加载配置数据
    loadAllConfigs();
    
    // 监听Tab切换事件
    document.addEventListener('tabChanged', function(e) {
        if (e.detail.tab === 'config') {
            loadAllConfigs();
        }
    });
    
    // 绑定保存按钮事件
    document.getElementById('save-dns-config').addEventListener('click', saveDnsConfig);
    document.getElementById('save-ip-apis').addEventListener('click', saveIpApis);
    document.getElementById('test-all-ip-apis').addEventListener('click', testAllIpApis);
    document.getElementById('save-system-config').addEventListener('click', saveSystemConfig);
    document.getElementById('reset-system-config').addEventListener('click', resetSystemConfig);
});

async function loadAllConfigs() {
    await Promise.all([
        loadDnsConfig(),
        loadIpApis(),
        loadSystemConfig()
    ]);
}

async function loadDnsConfig() {
    try {
        const response = await fetch('/api/admin/dns-config');
        const data = await response.json();
        
        const textarea = document.getElementById('dns-config-textarea');
        if (data.config && Array.isArray(data.config)) {
            textarea.value = data.config.join('\n');
        }
    } catch (error) {
        console.error('加载DNS配置失败:', error);
        showMessage('加载DNS配置失败', 'error');
    }
}

async function saveDnsConfig() {
    const textarea = document.getElementById('dns-config-textarea');
    const servers = textarea.value.split('\n').filter(line => line.trim());
    
    try {
        const response = await fetch('/api/admin/dns-config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ servers })
        });
        
        const data = await response.json();
        if (response.ok) {
            showMessage('DNS配置保存成功');
        } else {
            showMessage(data.error || '保存失败', 'error');
        }
    } catch (error) {
        console.error('保存DNS配置失败:', error);
        showMessage('保存DNS配置失败', 'error');
    }
}

async function loadIpApis() {
    try {
        const response = await fetch('/api/admin/ip-apis');
        const data = await response.json();
        
        const container = document.getElementById('ip-api-list');
        container.innerHTML = '';
        
        if (data.apis && Array.isArray(data.apis)) {
            data.apis.forEach((api, index) => {
                const item = document.createElement('div');
                item.className = 'api-item';
                item.dataset.index = index;
                item.dataset.name = api.name || '';
                item.dataset.url = api.url || '';
                item.dataset.parser = api.parser || 'generic';
                
                item.innerHTML = `
                    <div class="api-info">
                        <span class="api-name">${api.name || '未命名'}</span>
                        <input type="text" value="${api.url || ''}" class="api-url" placeholder="API URL">
                    </div>
                    <div class="api-actions">
                        <span class="api-status" data-index="${index}">未测试</span>
                        <button class="test-single-btn" data-index="${index}" title="测试此API">测试</button>
                        <button class="edit-api-btn" data-index="${index}" title="编辑API">编辑</button>
                        <button class="delete-api-btn" data-index="${index}" title="删除API">删除</button>
                    </div>
                `;
                container.appendChild(item);
            });
            
            // 绑定单个测试按钮事件
            container.querySelectorAll('.test-single-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const index = this.dataset.index;
                    testSingleApi(index);
                });
            });
            
            container.querySelectorAll('.edit-api-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const index = this.dataset.index;
                    editApi(index);
                });
            });
            
            container.querySelectorAll('.delete-api-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const index = this.dataset.index;
                    deleteApi(index);
                });
            });
        }
        
        const addBtn = document.createElement('button');
        addBtn.id = 'add-ip-api-btn';
        addBtn.className = 'add-api-btn';
        addBtn.textContent = '+ 添加新API';
        addBtn.addEventListener('click', addNewApi);
        container.appendChild(addBtn);
        
    } catch (error) {
        console.error('加载IP API配置失败:', error);
        showMessage('加载IP API配置失败', 'error');
    }
}

function addNewApi() {
    const name = prompt('请输入API名称:');
    if (!name) return;
    
    const url = prompt('请输入API URL (使用 {ip} 作为IP占位符):');
    if (!url) return;
    
    const parser = prompt('请输入解析器名称 (如: ipwhois, ip-api, generic):', 'generic');
    
    const container = document.getElementById('ip-api-list');
    const items = container.querySelectorAll('.api-item');
    const apis = [];
    
    items.forEach(item => {
        apis.push({
            name: item.dataset.name,
            url: item.querySelector('.api-url').value,
            parser: item.dataset.parser
        });
    });
    
    apis.push({ name, url, parser: parser || 'generic' });
    saveIpApisData(apis);
}

function editApi(index) {
    const item = document.querySelector(`.api-item[data-index="${index}"]`);
    if (!item) return;
    
    const currentName = item.dataset.name;
    const currentUrl = item.querySelector('.api-url').value;
    const currentParser = item.dataset.parser;
    
    const newName = prompt('API名称:', currentName);
    if (newName === null) return;
    
    const newUrl = prompt('API URL (使用 {ip} 作为IP占位符):', currentUrl);
    if (newUrl === null) return;
    
    const newParser = prompt('解析器名称:', currentParser);
    if (newParser === null) return;
    
    item.dataset.name = newName;
    item.dataset.parser = newParser;
    item.querySelector('.api-name').textContent = newName;
    item.querySelector('.api-url').value = newUrl;
    saveAllIpApis();
}

function deleteApi(index) {
    if (!confirm('确定要删除此API吗？')) return;
    
    const item = document.querySelector(`.api-item[data-index="${index}"]`);
    if (item) {
        item.remove();
        saveAllIpApis();
    }
}

function saveAllIpApis() {
    const container = document.getElementById('ip-api-list');
    const items = container.querySelectorAll('.api-item');
    const apis = [];
    
    items.forEach(item => {
        apis.push({
            name: item.dataset.name,
            url: item.querySelector('.api-url').value,
            parser: item.dataset.parser
        });
    });
    
    saveIpApisData(apis);
}

async function saveIpApisData(apis) {
    try {
        const response = await fetch('/api/admin/ip-apis', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apis })
        });
        
        const data = await response.json();
        if (response.ok) {
            showMessage('IP API配置保存成功');
            loadIpApis();
        } else {
            showMessage(data.error || '保存失败', 'error');
        }
    } catch (error) {
        console.error('保存IP API配置失败:', error);
        showMessage('保存IP API配置失败', 'error');
    }
}

async function saveIpApis() {
    const inputs = document.querySelectorAll('.api-url');
    const apis = Array.from(inputs).map(input => input.value.trim()).filter(v => v);
    
    try {
        const response = await fetch('/api/admin/ip-apis', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apis })
        });
        
        const data = await response.json();
        if (response.ok) {
            showMessage('IP API配置保存成功');
        } else {
            showMessage(data.error || '保存失败', 'error');
        }
    } catch (error) {
        console.error('保存IP API配置失败:', error);
        showMessage('保存IP API配置失败', 'error');
    }
}

async function testSingleApi(index) {
    const input = document.querySelector(`.api-url[data-index="${index}"]`);
    const status = document.querySelector(`.api-status[data-index="${index}"]`);
    const apiName = input.dataset.name || input.value.split('/').pop();
    
    status.textContent = '测试中...';
    status.className = 'api-status';
    
    try {
        const response = await fetch('/check_ip_info_api_status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_name: apiName, test_ip: '8.8.8.8' })
        });
        
        const data = await response.json();
        
        if (data.status === 'available') {
            status.textContent = `可用 (${data.response_time.toFixed(2)}s)`;
            status.className = 'api-status ok';
        } else if (data.status === 'unavailable') {
            status.textContent = '不可用';
            status.className = 'api-status error';
        } else {
            status.textContent = data.message || '错误';
            status.className = 'api-status error';
        }
    } catch (error) {
        status.textContent = '请求失败';
        status.className = 'api-status error';
        console.error('测试API失败:', error);
    }
}

async function testAllIpApis() {
    const statuses = document.querySelectorAll('.api-status');
    statuses.forEach(status => {
        status.textContent = '测试中...';
        status.className = 'api-status';
    });
    
    try {
        const response = await fetch('/check_all_ip_info_apis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test_ip: '8.8.8.8' })
        });
        
        const data = await response.json();
        
        if (data.results) {
            data.results.forEach((result, index) => {
                const status = document.querySelector(`.api-status[data-index="${index}"]`);
                if (status) {
                    if (result.status === 'available') {
                        status.textContent = `可用 (${result.response_time.toFixed(2)}s)`;
                        status.className = 'api-status ok';
                    } else if (result.status === 'unavailable') {
                        status.textContent = '不可用';
                        status.className = 'api-status error';
                    } else {
                        status.textContent = result.message || '错误';
                        status.className = 'api-status error';
                    }
                }
            });
        }
        showMessage('全部API测试完成');
    } catch (error) {
        showMessage('测试API失败', 'error');
        console.error('测试全部API失败:', error);
    }
}

async function loadSystemConfig() {
    try {
        const response = await fetch('/api/admin/system-config');
        const data = await response.json();
        
        const container = document.getElementById('system-config-form');
        container.innerHTML = '';
        
        if (data.config) {
            // 分类显示
            const categories = {
                '缓存配置': ['cache_ttl_days', 'error_cache_ttl_days'],
                '超时配置': ['dns_query_timeout', 'api_request_timeout'],
                'Gunicorn配置': ['gunicorn_workers', 'gunicorn_port', 'gunicorn_timeout', 'gunicorn_graceful_timeout'],
                '其他配置': ['rate_limit_per_minute', 'log_level', 'log_file']
            };
            
            for (const [category, keys] of Object.entries(categories)) {
                const categoryDiv = document.createElement('div');
                categoryDiv.className = 'config-category';
                categoryDiv.innerHTML = `<h4>${category}</h4>`;
                
                keys.forEach(key => {
                    if (data.config[key]) {
                        const item = document.createElement('div');
                        item.className = 'config-item';
                        item.innerHTML = `
                            <label>${data.config[key].description || key}</label>
                            <input type="text" name="${key}" value="${data.config[key].value}" data-key="${key}">
                        `;
                        categoryDiv.appendChild(item);
                    }
                });
                
                container.appendChild(categoryDiv);
            }
        }
    } catch (error) {
        console.error('加载系统参数失败:', error);
        showMessage('加载系统参数失败', 'error');
    }
}

async function saveSystemConfig() {
    const inputs = document.querySelectorAll('#system-config-form input');
    const configs = {};
    
    inputs.forEach(input => {
        configs[input.dataset.key] = input.value;
    });
    
    try {
        const response = await fetch('/api/admin/system-config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ configs })
        });
        
        const data = await response.json();
        if (response.ok) {
            showMessage('系统参数保存成功');
        } else {
            showMessage(data.error || '保存失败', 'error');
        }
    } catch (error) {
        console.error('保存系统参数失败:', error);
        showMessage('保存系统参数失败', 'error');
    }
}

async function resetSystemConfig() {
    if (!confirm('确定要恢复所有系统参数到默认值吗？')) {
        return;
    }
    
    try {
        const response = await fetch('/api/admin/system-config/reset', {
            method: 'POST'
        });
        
        const data = await response.json();
        if (response.ok) {
            showMessage('系统参数已恢复默认值');
            loadSystemConfig(); // 重新加载
        } else {
            showMessage(data.error || '恢复失败', 'error');
        }
    } catch (error) {
        console.error('恢复系统参数失败:', error);
        showMessage('恢复系统参数失败', 'error');
    }
}
