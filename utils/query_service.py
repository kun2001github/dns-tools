"""查询服务：并发查询多个域名/DNS，并跟踪进度。"""
import dns.resolver
import json
import os
import signal
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
PROGRESS_FILE = os.path.join(BASE_DIR, 'config', 'query_progress.json')
LAST_RESULT_FILE = os.path.join(BASE_DIR, 'config', 'last_query_result.json')


def _get_progress():
    """从文件读取进度信息。"""
    try:
        if os.path.exists(PROGRESS_FILE):
            with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return {'current': 0, 'total': 0, 'status': 'idle'}


def _save_progress(progress):
    """保存进度信息到文件。"""
    try:
        os.makedirs(os.path.dirname(PROGRESS_FILE), exist_ok=True)
        with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
            json.dump(progress, f)
    except Exception:
        pass


def _reset_progress(total):
    progress = {'current': 0, 'total': total, 'status': 'running' if total else 'idle'}
    _save_progress(progress)


def _increment_progress():
    progress = _get_progress()
    progress['current'] += 1
    _save_progress(progress)


def _mark_completed():
    progress = _get_progress()
    progress['status'] = 'completed'
    _save_progress(progress)


def _mark_error():
    progress = _get_progress()
    progress['status'] = 'error'
    _save_progress(progress)


def parse_dns_server_with_label(dns_line):
    """解析DNS服务器配置行，提取IP地址和标签。"""
    if '#' in dns_line:
        parts = dns_line.split('#', 1)
        ip_address = parts[0].strip()
        label = parts[1].strip()
        return ip_address, label
    return dns_line.strip(), ''


def get_query_progress():
    """获取查询进度（从文件读取）。"""
    progress = _get_progress()
    percentage = 0
    total = progress.get('total', 0)
    current = progress.get('current', 0)
    status = progress.get('status', 'idle')
    if total > 0:
        percentage = int((current / total) * 100)
    return {
        'current': current,
        'total': total,
        'percentage': percentage,
        'status': status
    }


def query_single_dns_server(domain, dns_server_with_label):
    """查询单个域名单个DNS服务器。"""
    dns_server, _ = parse_dns_server_with_label(dns_server_with_label)

    if not dns_server:
        return dns_server_with_label, {}

    resolver = dns.resolver.Resolver()
    resolver.nameservers = [dns_server]
    resolver.timeout = 2
    resolver.lifetime = 3
    server_results = {}

    # A 记录查询耗时（毫秒）
    a_query_time = None

    try:
        a_start = datetime.now()
        answers = resolver.resolve(domain, 'A')
        a_end = datetime.now()
        a_query_time = int((a_end - a_start).total_seconds() * 1000)
        ip_addresses = sorted([str(answer) for answer in answers])
        server_results['A'] = ip_addresses
    except dns.resolver.NXDOMAIN:
        server_results['A'] = '域名不存在'
        server_results['_a_status'] = 'error'
    except dns.resolver.NoAnswer:
        server_results['A'] = '没有 A 记录'
        server_results['_a_status'] = 'warning'
    except dns.resolver.Timeout:
        server_results['A'] = '查询超时'
        server_results['_a_status'] = 'warning'
    except Exception as e:
        server_results['A'] = str(e)
        server_results['_a_status'] = 'error'

    # 如果成功获取到A记录IP，添加查询耗时
    if a_query_time is not None and isinstance(server_results.get('A'), list):
        server_results['_a_query_time_ms'] = a_query_time

    try:
        answers = resolver.resolve(domain, 'CNAME')
        cname_records = [str(answer) for answer in answers]
        server_results['CNAME'] = cname_records
    except dns.resolver.NXDOMAIN:
        server_results['CNAME'] = '域名不存在'
        server_results['_cname_status'] = 'error'
    except dns.resolver.NoAnswer:
        server_results['CNAME'] = '没有 CNAME 记录'
        server_results['_cname_status'] = 'warning'
    except dns.resolver.Timeout:
        server_results['CNAME'] = '查询超时'
        server_results['_cname_status'] = 'warning'
    except Exception as e:
        server_results['CNAME'] = str(e)
        server_results['_cname_status'] = 'error'

    return dns_server_with_label, server_results


def query_domains(domains, dns_servers_with_labels):
    """并行查询多个域名和DNS服务器，返回结果字典及查询耗时。
    
    Returns:
        tuple: (results, duration_seconds) - 查询结果字典和查询耗时（秒）
    """
    # 记录开始时间
    start_time = time.time()
    
    valid_servers = [s for s in dns_servers_with_labels if s.strip()]
    total_tasks = len(domains) * len(valid_servers)
    _reset_progress(total_tasks)

    results = {}

    if total_tasks == 0:
        _mark_completed()
        duration = time.time() - start_time
        return results, duration

    # 限制并发线程数，避免内存溢出
    # 根据任务数量动态调整，但最多不超过10个
    max_workers = min(10, max(5, len(domains)))

    try:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # 一次性提交所有任务，简化逻辑
            futures = []
            future_to_domain_server = {}

            # 提交所有查询任务
            for domain in domains:
                for dns_server_with_label in valid_servers:
                    future = executor.submit(query_single_dns_server, domain, dns_server_with_label)
                    futures.append(future)
                    future_to_domain_server[future] = (domain, dns_server_with_label)

            # 处理所有完成的任务
            try:
                for completed_future in as_completed(futures, timeout=60):
                    try:
                        dns_server_with_label, server_results = completed_future.result()
                        domain, _ = future_to_domain_server[completed_future]

                        if domain not in results:
                            results[domain] = {}

                        results[domain][dns_server_with_label] = server_results
                        _increment_progress()
                    except Exception as e:
                        # 记录单个任务的错误
                        try:
                            domain, dns_server_with_label = future_to_domain_server[completed_future]
                            if domain not in results:
                                results[domain] = {}
                            error_msg = f'查询错误: {str(e)}'
                            results[domain][dns_server_with_label] = {'A': error_msg, 'CNAME': error_msg}
                            _increment_progress()
                        except KeyError:
                            # future不在映射表中，跳过
                            pass
            except TimeoutError:
                # as_completed超时，处理所有未完成的future
                for future in futures:
                    if not future.done():
                        # 取消未完成的任务
                        future.cancel()
                        # 记录超时结果
                        if future in future_to_domain_server:
                            domain, dns_server_with_label = future_to_domain_server[future]
                            if domain not in results:
                                results[domain] = {}
                            results[domain][dns_server_with_label] = {'A': '查询超时', 'CNAME': '查询超时'}
                            _increment_progress()

        # 对每个域名的A记录进行排序和一致性检查
        for domain in domains:
            if domain in results:
                domain_results = results[domain]
                a_record_comparison = {}

                for dns_server_with_label, server_results in domain_results.items():
                    if server_results.get('A') and isinstance(server_results['A'], list):
                        a_record_comparison[dns_server_with_label] = set(server_results['A'])

                if a_record_comparison and len(a_record_comparison) > 1:
                    valid_a_records = {
                        dns_server: ip_set
                        for dns_server, ip_set in a_record_comparison.items()
                        if isinstance(ip_set, set) and ip_set
                    }
                    if len(valid_a_records) > 1:
                        ip_to_servers = {}
                        for dns_server, ip_set in valid_a_records.items():
                            for ip in ip_set:
                                ip_to_servers.setdefault(ip, []).append(dns_server)

                        consistent_ips = {
                            ip: servers for ip, servers in ip_to_servers.items() if len(servers) > 1
                        }
                        if consistent_ips:
                            for server_key, server_results in domain_results.items():
                                if 'A' in server_results and isinstance(server_results['A'], list):
                                    server_results['A'] = sorted(server_results['A'])
        
        # 任务完成后才标记完成，由外层调用
        # _mark_completed() 
        
        # 计算总耗时
        duration = time.time() - start_time
        return results, duration
    except (KeyboardInterrupt, SystemExit):
        _mark_error()
        duration = time.time() - start_time
        return results, duration


from utils.history_service import add_dns_history

def run_query_task(domains, dns_servers_with_labels):
    """在后台运行查询任务，并保存结果和历史。"""
    try:
        results, duration_seconds = query_domains(domains, dns_servers_with_labels)
        
        # 保存结果到文件
        result_data = {
            'results': results,
            'stats': {
                'domain_count': len(domains),
                'dns_server_count': len(dns_servers_with_labels),
                'duration_seconds': round(duration_seconds, 2)
            },
            'timestamp': time.time()
        }
        
        os.makedirs(os.path.dirname(LAST_RESULT_FILE), exist_ok=True)
        with open(LAST_RESULT_FILE, 'w', encoding='utf-8') as f:
            json.dump(result_data, f, ensure_ascii=False)
            
        # 保存历史记录
        add_dns_history(domains, dns_servers_with_labels, results, duration_seconds)
        
        # 标记完成
        _mark_completed()
        
    except Exception as e:
        print(f"后台查询任务失败: {e}")
        _mark_error()

def start_query_task(domains, dns_servers_with_labels):
    """启动后台查询任务。"""
    # 清除旧结果
    if os.path.exists(LAST_RESULT_FILE):
        try:
            os.remove(LAST_RESULT_FILE)
        except:
            pass
            
    # 启动线程
    thread = threading.Thread(
        target=run_query_task,
        args=(domains, dns_servers_with_labels)
    )
    thread.daemon = True
    thread.start()

def get_last_result():
    """获取最后一次查询的结果。"""
    try:
        if os.path.exists(LAST_RESULT_FILE):
            with open(LAST_RESULT_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return None

def mark_error():
    _mark_error()
