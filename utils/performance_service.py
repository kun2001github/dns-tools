"""网址请求分析服务 - 使用 Playwright 模拟浏览器并获取真实的 Performance API 数据。"""
import platform
import threading
import time
from urllib.parse import urlparse

from utils.database_service import save_performance_analysis

# 用于存储每个分析任务的结果
_performance_results = {}
_performance_lock = threading.Lock()

# 用于存储每个分析任务的步骤进度
_performance_steps = {}
_steps_lock = threading.Lock()

# Playwright 超时时间
PLAYWRIGHT_TIMEOUT = 60000  # 60秒

# 获取系统平台
SYSTEM_PLATFORM = platform.system()

# 定义分析步骤
ANALYSIS_STEPS = [
    'init',
    'launch_browser',
    'create_context',
    'navigate',
    'wait_loading',
    'get_perf_data',
    'process_requests',
    'calc_domain_stats',
    'save_result',
    'complete'
]

STEP_LABELS = {
    'init': '[1/10] 正在初始化...',
    'launch_browser': '[2/10] 正在启动浏览器...',
    'create_context': '[3/10] 正在创建浏览器上下文...',
    'navigate': '[4/10] 正在输入域名并导航...',
    'wait_loading': '[5/10] 正在等待页面加载...',
    'get_perf_data': '[6/10] 正在获取性能数据...',
    'process_requests': '[7/10] 正在处理网络请求...',
    'calc_domain_stats': '[8/10] 正在计算域名统计...',
    'save_result': '[9/10] 正在保存结果...',
    'complete': '[10/10] 分析完成！'
}


def _update_step(task_id, step, error=None):
    """更新任务步骤进度。"""
    with _steps_lock:
        _performance_steps[task_id] = {
            'step': step,
            'label': STEP_LABELS.get(step, step),
            'error': error
        }


def _normalize_url(url_input):
    """规范化用户输入的 URL 或域名。"""
    url_input = url_input.strip()
    if url_input.startswith(('http://', 'https://')):
        return url_input
    return f'https://{url_input}'


def _extract_base_domain(url):
    """提取域名的二级域名部分（如 adspower.com）。"""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc or url
        domain = domain.lower().split(':')[0]
        
        # 移除子域名，获取基础域名
        # 例如: download.adspower.com -> adspower.com
        parts = domain.split('.')
        if len(parts) >= 2:
            # 返回最后两部分作为基础域名
            return parts[-2] + '.' + parts[-1]
        return domain
    except Exception:
        return url


def _extract_domain(url):
    """提取域名的基础部分。"""
    try:
        parsed = urlparse(url)
        return parsed.netloc or url
    except Exception:
        return url


def _classify_domain(request_domain, base_domain, main_domain):
    """分类域名：请求域名、子域名、第三方域名。
    
    - main: 用户请求的域名本身（如 gog.adspower.com）
    - related: 基础域名的其他子域名（如 deo.adspower.com，当 base_domain 是 adspower.com）
    - third_party: 其他所有域名
    """
    request_domain = request_domain.lower().split(':')[0]
    base_domain = base_domain.lower().split(':')[0]
    main_domain = (main_domain or '').lower().split(':')[0]
    
    # 请求域名：与用户输入的域名完全匹配
    if request_domain == main_domain:
        return 'main'
    
    # 子域名：基础域名的子域名（但不是用户请求的域名）
    if base_domain and request_domain.endswith(f'.{base_domain}'):
        return 'related'
    
    return 'third_party'


def _analyze_with_playwright(url, task_id):
    """使用 Playwright 进行网址请求分析，获取真实的 Performance API 数据。"""
    result = {
        'task_id': task_id,
        'url': url,
        'main_domain': _extract_domain(url),
        'base_domain': _extract_base_domain(url),  # 基础域名（如 adspower.com）
        'requests': [],
        'domain_stats': {},
        'timing': {},
        'error': None
    }
    
    # 初始化步骤
    _update_step(task_id, 'init')
    
    try:
        from playwright.sync_api import sync_playwright
        
        # 启动浏览器
        _update_step(task_id, 'launch_browser')
        
        # 根据操作系统调整浏览器启动参数
        browser_args = [
            '--disable-dev-shm-usage',
            '--disable_gpu',
            '--disable-web-security',
        ]
        
        # Linux 环境需要额外的 sandbox 参数
        if SYSTEM_PLATFORM == 'Linux':
            browser_args.extend([
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-features=VizDisplayCompositor',
            ])
        else:
            # Windows/macOS
            browser_args.extend([
                '--no-sandbox',
            ])
        
        with sync_playwright() as p:
            # 启动浏览器
            browser = p.chromium.launch(
                headless=True,
                args=browser_args
            )
            
            # 创建浏览器上下文
            _update_step(task_id, 'create_context')
            
            context = browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                ignore_https_errors=True,
                java_script_enabled=True,
            )
            
            page = context.new_page()
            
            # 用于收集请求数据
            all_requests = []
            
            def handle_request(request):
                """记录每个请求的详细信息。"""
                # 过滤掉内部 blob/data URL
                url = request.url
                if url.startswith(('blob:', 'data:', 'chrome:', 'about:')):
                    return
                
                # 获取请求开始时间
                request_start_time = time.time()
                
                req_data = {
                    'url': url,
                    'method': request.method,
                    'resource_type': request.resource_type,
                    'domain': _extract_domain(url),
                    'timestamp': request_start_time,
                    'start_time': request_start_time,
                    'redirect_response': None
                }
                all_requests.append(req_data)
            
            def handle_response(response):
                """记录响应信息。"""
                try:
                    response_end_time = time.time()
                    for req in reversed(all_requests):
                        if req['url'] == response.url:
                            req['status'] = response.status
                            req['status_text'] = response.status_text
                            req['content_type'] = response.headers.get('content-type', '')
                            req['redirect_url'] = response.headers.get('location', '')
                            req['end_time'] = response_end_time
                            break
                except Exception:
                    pass
            
            # 注册事件监听
            page.on('request', handle_request)
            page.on('response', handle_response)
            
            # 导航到目标页面
            _update_step(task_id, 'navigate')
            page.goto(url, wait_until='domcontentloaded', timeout=PLAYWRIGHT_TIMEOUT)
            
            # 等待一段时间让资源加载完成
            _update_step(task_id, 'wait_loading')
            page.wait_for_timeout(3000)
            
            # 获取 Performance API 数据
            _update_step(task_id, 'get_perf_data')
            perf_data = page.evaluate('''() => {
                const timing = window.performance.timing;
                const navigation = window.performance.getEntriesByType('navigation')[0];
                const resources = window.performance.getEntriesByType('resource');
                
                // 计算各阶段时间
                return {
                    // Navigation Timing
                    unload: timing.unloadEventEnd - timing.unloadEventStart,
                    redirect: timing.redirectEnd - timing.redirectStart,
                    appCache: timing.fetchStart - timing.domainLookupStart,
                    dns: timing.domainLookupEnd - timing.domainLookupStart,
                    tcp: timing.connectEnd - timing.connectStart,
                    ssl: timing.secureConnectionStart > 0 ? timing.connectEnd - timing.secureConnectionStart : 0,
                    ttfb: timing.responseStart - timing.requestStart,
                    transfer: timing.responseEnd - timing.responseStart,
                    domInteractive: timing.domInteractive - timing.navigationStart,
                    domComplete: timing.domComplete - timing.navigationStart,
                    dcl: timing.domContentLoadedEventEnd - timing.navigationStart,
                    load: timing.loadEventEnd - timing.navigationStart,
                    total: timing.loadEventEnd - timing.navigationStart,
                    
                    // Navigation API (更精确)
                    navRedirect: navigation ? navigation.redirectEnd - navigation.redirectStart : 0,
                    navDns: navigation ? navigation.domainLookupEnd - navigation.domainLookupStart : 0,
                    navTcp: navigation ? navigation.connectEnd - navigation.connectStart : 0,
                    navSsl: navigation ? (navigation.secureConnectionStart > 0 ? navigation.connectEnd - navigation.secureConnectionStart : 0) : 0,
                    navTtfb: navigation ? navigation.responseStart - navigation.requestStart : 0,
                    navTransfer: navigation ? navigation.responseEnd - navigation.responseStart : 0,
                    navDcl: navigation ? navigation.domContentLoadedEventEnd - navigation.fetchStart : 0,
                    navLoad: navigation ? navigation.loadEventEnd - navigation.fetchStart : 0,
                    navTotal: navigation ? navigation.loadEventEnd - navigation.fetchStart : 0,
                    
                    // 资源列表
                    resources: resources.map(r => ({
                        name: r.name,
                        type: r.initiatorType,
                        duration: r.duration,
                        transferSize: r.transferSize || 0,
                        decodedBodySize: r.decodedBodySize || 0,
                        startTime: r.startTime,
                        responseEnd: r.responseEnd
                    }))
                };
            }''')
            
            # 处理请求数据，添加耗时信息
            _update_step(task_id, 'process_requests')
            main_domain = result['main_domain'].lower().split(':')[0]
            base_domain = _extract_base_domain(url)
            resources_data = perf_data.get('resources', [])
            
            for req in all_requests:
                domain = req.get('domain', '').lower().split(':')[0]
                category = _classify_domain(domain, base_domain, main_domain)
                req['category'] = category
                
                # 匹配资源耗时
                req_duration = 0
                for res in resources_data:
                    if req['url'] in res['name'] or res['name'] in req['url']:
                        req_duration = res.get('duration', 0)
                        break
                req['duration'] = req_duration
            
            result['requests'] = all_requests
            
            # 域名耗时统计（基于真实请求耗时）
            domain_stats_map = {}
            
            # 收集每个请求的开始时间和结束时间，用于计算并发
            all_req_times = []
            
            for req in all_requests:
                domain = req.get('domain', '').lower().split(':')[0]
                category = req.get('category', 'third_party')
                duration = req.get('duration', 0) or 0
                
                if not domain:
                    continue
                
                # 获取请求的开始时间
                start_time = req.get('start_time', req.get('timestamp', 0))
                end_time = start_time + (duration / 1000)  # 转换为秒
                
                all_req_times.append({
                    'domain': domain,
                    'start': start_time,
                    'end': end_time,
                    'duration': duration
                })
                
                if domain not in domain_stats_map:
                    domain_stats_map[domain] = {
                        'domain': domain,
                        'category': category,
                        'count': 0,
                        'total_duration': 0,
                        'durations': []
                    }
                
                domain_stats_map[domain]['count'] += 1
                domain_stats_map[domain]['total_duration'] += duration
                domain_stats_map[domain]['durations'].append(duration)
            
            # 找出整体的时间范围
            if all_req_times:
                min_time = min(r['start'] for r in all_req_times)
                max_time = max(r['end'] for r in all_req_times)
            else:
                min_time = 0
                max_time = 0
            
            # 计算域名耗时统计
            _update_step(task_id, 'calc_domain_stats')
            domain_duration_list = []
            INTERVAL = 0.001  # 1毫秒
            
            for domain, stats in domain_stats_map.items():
                # 平均累加耗时
                total_duration = stats['total_duration']
                avg_duration = total_duration / stats['count'] if stats['count'] > 0 else 0
                
                # 平均并发耗时：统计各时间段内的并发请求数，计算平均值
                concurrent_counts = []
                concurrent_time = 0  # 累计并发时间（毫秒）
                current_time = min_time
                while current_time < max_time:
                    count = 0
                    for req in all_req_times:
                        if req['domain'] == domain:
                            if req['start'] <= current_time < req['end']:
                                count += 1
                    if count > 0:
                        concurrent_counts.append(count)
                        concurrent_time += INTERVAL * 1000  # 转换为毫秒
                    current_time += INTERVAL
                
                avg_concurrent = sum(concurrent_counts) / len(concurrent_counts) if concurrent_counts else 0
                # 平均并发耗时（毫秒）：累计并发时间 / 请求数
                avg_concurrent_duration = concurrent_time / stats['count'] if stats['count'] > 0 else 0
                
                domain_duration_list.append({
                    'domain': domain,
                    'category': stats['category'],
                    'count': stats['count'],
                    'total_duration': total_duration,
                    'avg_duration': avg_duration,
                    'avg_concurrent': avg_concurrent,
                    'avg_concurrent_duration': avg_concurrent_duration
                })
            
            domain_duration_list.sort(key=lambda x: x['total_duration'], reverse=True)
            domain_duration_list = domain_duration_list[:20]
            
            result['domain_duration_stats'] = domain_duration_list
            
            # 原有分类统计（保留）
            domain_stats = {
                'main': {'domains': [], 'count': 0, 'total_time': 0, 'requests': []},
                'related': {'domains': [], 'count': 0, 'total_time': 0, 'requests': []},
                'third_party': {'domains': [], 'count': 0, 'total_time': 0, 'requests': []}
            }
            
            for req in all_requests:
                domain = req.get('domain', '').lower().split(':')[0]
                category = req.get('category', 'third_party')
                duration = req.get('duration', 0)
                
                if domain and domain not in domain_stats[category]['domains']:
                    domain_stats[category]['domains'].append(domain)
                
                domain_stats[category]['count'] += 1
                domain_stats[category]['total_time'] += duration
            
            # 计算平均耗时
            for category in domain_stats:
                domain_stats[category]['domains'] = list(set(domain_stats[category]['domains']))
                if domain_stats[category]['count'] > 0:
                    domain_stats[category]['avg_time'] = domain_stats[category]['total_time'] / domain_stats[category]['count']
                else:
                    domain_stats[category]['avg_time'] = 0
            
            result['domain_stats'] = domain_stats
            
            # 使用 Navigation API 数据（更准确）
            result['timing'] = {
                'unload': max(0, perf_data.get('unload', 0)),
                'redirect': max(0, perf_data.get('redirect', 0)),
                'appCache': max(0, perf_data.get('appCache', 0)),
                'dns': max(0, perf_data.get('navDns', perf_data.get('dns', 0))),
                'tcp': max(0, perf_data.get('navTcp', perf_data.get('tcp', 0))),
                'ssl': max(0, perf_data.get('navSsl', perf_data.get('ssl', 0))),
                'ttfb': max(0, perf_data.get('navTtfb', perf_data.get('ttfb', 0))),
                'transfer': max(0, perf_data.get('navTransfer', perf_data.get('transfer', 0))),
                'domInteractive': max(0, perf_data.get('domInteractive', 0)),
                'domComplete': max(0, perf_data.get('domComplete', 0)),
                'dcl': max(0, perf_data.get('dcl', perf_data.get('navDcl', 0))),
                'load': max(0, perf_data.get('load', perf_data.get('navLoad', 0))),
                'total': max(0, perf_data.get('total', perf_data.get('navTotal', 0)))
            }
            
            result['resources'] = resources_data
            
            # 保存结果
            _update_step(task_id, 'save_result')
            
            # 关闭浏览器
            context.close()
            browser.close()
    
    except Exception as e:
        result['error'] = str(e)
        _update_step(task_id, 'error', error=str(e))
    
    # 完成
    _update_step(task_id, 'complete')
    
    # 保存结果
    with _performance_lock:
        _performance_results[task_id] = result
    
    return result


def start_performance_analysis(url, task_id):
    """启动网址请求分析任务。"""
    normalized_url = _normalize_url(url)
    result = _analyze_with_playwright(normalized_url, task_id)
    
    # 保存到数据库
    if not result.get('error'):
        analysis_id = task_id.replace('task_', 'performance_')
        save_performance_analysis(
            analysis_id=analysis_id,
            url=result.get('url', normalized_url),
            total_requests=len(result.get('requests', [])),
            total_duration_ms=int(result.get('timing', {}).get('total', 0)),
            domain_stats=result.get('domain_duration_stats', []),
            timing_data=result.get('timing', {}),
            requests_data=result.get('requests', [])
        )
    
    return result


def get_performance_result(task_id):
    """获取性能分析结果。"""
    with _performance_lock:
        return _performance_results.get(task_id)


def get_performance_step(task_id):
    """获取任务当前步骤。"""
    with _steps_lock:
        return _performance_steps.get(task_id)
