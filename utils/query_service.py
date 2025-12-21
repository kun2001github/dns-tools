"""查询服务：并发查询多个域名/DNS，并跟踪进度。"""
import dns.resolver
from concurrent.futures import ThreadPoolExecutor, as_completed

query_progress = {'current': 0, 'total': 0, 'status': 'idle'}


def parse_dns_server_with_label(dns_line):
    """解析DNS服务器配置行，提取IP地址和标签。"""
    if '#' in dns_line:
        parts = dns_line.split('#', 1)
        ip_address = parts[0].strip()
        label = parts[1].strip()
        return ip_address, label
    return dns_line.strip(), ''


def _reset_progress(total):
    query_progress['current'] = 0
    query_progress['total'] = total
    query_progress['status'] = 'running' if total else 'idle'


def _increment_progress():
    query_progress['current'] += 1


def _mark_completed():
    query_progress['status'] = 'completed'


def _mark_error():
    query_progress['status'] = 'error'


def get_query_progress():
    percentage = 0
    total = query_progress.get('total', 0)
    current = query_progress.get('current', 0)
    status = query_progress.get('status', 'idle')
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

    try:
        answers = resolver.resolve(domain, 'A')
        ip_addresses = sorted([str(answer) for answer in answers])
        server_results['A'] = ip_addresses
    except dns.resolver.NXDOMAIN:
        server_results['A'] = '域名不存在'

    except dns.resolver.NoAnswer:
        server_results['A'] = '没有 A 记录'
    except dns.resolver.Timeout:
        server_results['A'] = '查询超时'
    except Exception as e:
        server_results['A'] = str(e)

    try:
        answers = resolver.resolve(domain, 'CNAME')
        cname_records = [str(answer) for answer in answers]
        server_results['CNAME'] = cname_records
    except dns.resolver.NXDOMAIN:
        server_results['CNAME'] = '域名不存在'
    except dns.resolver.NoAnswer:
        server_results['CNAME'] = '没有 CNAME 记录'
    except dns.resolver.Timeout:
        server_results['CNAME'] = '查询超时'
    except Exception as e:
        server_results['CNAME'] = str(e)

    return dns_server_with_label, server_results


def query_domains(domains, dns_servers_with_labels):
    """并行查询多个域名和DNS服务器，返回结果字典。"""
    valid_servers = [s for s in dns_servers_with_labels if s.strip()]
    total_tasks = len(domains) * len(valid_servers)
    _reset_progress(total_tasks)

    results = {}

    if total_tasks == 0:
        _mark_completed()
        return results

    max_workers = min(20, total_tasks)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        for domain in domains:
            domain_results = {}
            futures = []

            for dns_server_with_label in valid_servers:
                future = executor.submit(query_single_dns_server, domain, dns_server_with_label)
                futures.append(future)

            a_record_comparison = {}
            for future in as_completed(futures):
                dns_server_with_label, server_results = future.result()
                domain_results[dns_server_with_label] = server_results

                if server_results.get('A') and isinstance(server_results['A'], list):
                    a_record_comparison[dns_server_with_label] = set(server_results['A'])

                _increment_progress()

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


            results[domain] = domain_results

    _mark_completed()
    return results


def mark_error():
    _mark_error()
