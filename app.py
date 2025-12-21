import dns.resolver
import json
import os
import threading
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

# DNS配置文件路径
DNS_CONFIG_FILE = 'dns_config.json'

# 历史记录文件路径
HISTORY_FILE = 'dns_history.json'

# 默认DNS服务器列表（带标签）
DEFAULT_DNS_SERVERS = ['202.96.128.166 # 电信DNS', '183.240.8.114 # 联通DNS', '8.8.8.8 # 谷歌DNS']

def parse_dns_server_with_label(dns_line):
    """
    解析DNS服务器配置行，提取IP地址和标签
    格式：IP地址 # 标签
    返回：(ip_address, label)
    """
    if '#' in dns_line:
        parts = dns_line.split('#', 1)
        ip_address = parts[0].strip()
        label = parts[1].strip()
        return ip_address, label
    else:
        return dns_line.strip(), ''

def load_dns_config():
    """
    加载DNS服务器配置（带标签）
    返回：包含IP地址和标签的完整字符串列表
    """
    try:
        if os.path.exists(DNS_CONFIG_FILE):
            with open(DNS_CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return config.get('dns_servers', DEFAULT_DNS_SERVERS)
        else:
            return DEFAULT_DNS_SERVERS
    except Exception:
        return DEFAULT_DNS_SERVERS

def save_dns_config(dns_servers):
    """保存DNS服务器配置（带标签）"""
    try:
        config = {'dns_servers': dns_servers}
        with open(DNS_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False

def load_dns_history():
    """加载DNS查询历史记录"""
    try:
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        else:
            return []
    except Exception:
        return []

def save_dns_history(history):
    """保存DNS查询历史记录"""
    try:
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False

# 全局变量用于跟踪查询进度
query_progress = {'current': 0, 'total': 0, 'status': 'idle'}

def query_single_dns_server(domain, dns_server_with_label):
    """
    查询单个域名单个DNS服务器
    返回：(dns_server_with_label, server_results)
    """
    dns_server, label = parse_dns_server_with_label(dns_server_with_label)
    
    if not dns_server:  # 跳过空行
        return dns_server_with_label, {}
        
    resolver = dns.resolver.Resolver()
    resolver.nameservers = [dns_server]
    resolver.timeout = 2  # 设置超时时间为2秒
    resolver.lifetime = 3  # 设置总超时时间为3秒
    server_results = {}

    # 查询 A 记录
    try:
        answers = resolver.resolve(domain, 'A')
        ip_addresses = [str(answer) for answer in answers]
        server_results['A'] = ip_addresses
    except dns.resolver.NXDOMAIN:
        server_results['A'] = '域名不存在'
    except dns.resolver.NoAnswer:
        server_results['A'] = '没有 A 记录'
    except dns.resolver.Timeout:
        server_results['A'] = '查询超时'
    except Exception as e:
        server_results['A'] = str(e)

    # 查询 CNAME 记录
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

def add_dns_history(domains, dns_servers=None, results=None):
    """
    添加DNS查询历史记录（包含详细结果）
    相同域名的查询会合并，保留最新的查询时间戳
    """
    try:
        history = load_dns_history()
        
        # 创建域名集合键，用于去重
        domains_key = ','.join(sorted(domains))
        
        # 创建新的历史记录
        new_record = {
            'id': datetime.now().strftime('%Y%m%d%H%M%S'),
            'domains': domains,
            'dns_servers': dns_servers or [],
            'results': results or {},
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'date': datetime.now().strftime('%Y-%m-%d'),
            'time': datetime.now().strftime('%H:%M:%S')
        }
        
        # 检查是否已存在相同域名的记录
        existing_index = None
        for i, record in enumerate(history):
            existing_domains_key = ','.join(sorted(record.get('domains', [])))
            if existing_domains_key == domains_key:
                existing_index = i
                break
        
        if existing_index is not None:
            # 如果存在相同域名的记录，在原有记录的基础上添加时间节点
            existing_record = history[existing_index]
            
            # 如果没有时间节点列表，创建一个
            if 'time_nodes' not in existing_record:
                # 将原有记录转为时间节点
                existing_record['time_nodes'] = [{
                    'id': existing_record['id'],
                    'results': existing_record.get('results', {}),
                    'timestamp': existing_record['timestamp'],
                    'date': existing_record['date'],
                    'time': existing_record['time']
                }]
                # 清理原有字段
                del existing_record['results']
                del existing_record['id']
            
            # 添加新的时间节点
            existing_record['time_nodes'].insert(0, {
                'id': new_record['id'],
                'results': new_record.get('results', {}),
                'timestamp': new_record['timestamp'],
                'date': new_record['date'],
                'time': new_record['time']
            })
            
            # 更新时间戳为最新的
            existing_record['timestamp'] = new_record['timestamp']
            existing_record['date'] = new_record['date']
            existing_record['time'] = new_record['time']
            
            # 将记录移到最前面
            history.insert(0, history.pop(existing_index))
        else:
            # 新记录，直接添加到开头
            history.insert(0, new_record)
        
        # 限制历史记录数量，最多保留30条
        if len(history) > 30:
            history = history[:30]
        
        save_dns_history(history)
        return history[0]
    except Exception:
        return None

# 添加首页路由
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/query_dns', methods=['POST'])
def query_dns():
    """
    DNS查询接口，支持带标签的DNS服务器配置
    返回查询结果，并自动记录查询历史
    """
    try:
        data = request.get_json()
        domains = data.get('domains', [])
        # 如果前端没有提供DNS服务器，则使用保存的配置或默认值
        dns_servers_with_labels = data.get('dns_servers') or load_dns_config()
        
        # 初始化进度跟踪
        global query_progress
        query_progress['current'] = 0
        query_progress['total'] = len(domains) * len([s for s in dns_servers_with_labels if s.strip()])
        query_progress['status'] = 'running'
        
        results = {}
        
        # 使用线程池进行并行查询
        max_workers = min(20, len(domains) * len(dns_servers_with_labels))  # 最大20个线程
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for domain in domains:
                domain_results = {}
                futures = []
                
                # 为每个域名的每个DNS服务器提交查询任务
                for dns_server_with_label in dns_servers_with_labels:
                    if dns_server_with_label.strip():  # 跳过空行
                        future = executor.submit(query_single_dns_server, domain, dns_server_with_label)
                        futures.append(future)
                
                # 等待所有查询完成
                a_record_comparison = {}  # 用于存储A记录，检测一致性
                
                for future in as_completed(futures):
                    dns_server_with_label, server_results = future.result()
                    domain_results[dns_server_with_label] = server_results
                    
                    # 存储A记录用于一致性比较
                    if server_results.get('A') and isinstance(server_results['A'], list):
                        a_record_comparison[dns_server_with_label] = set(server_results['A'])
                    
                    # 更新进度
                    query_progress['current'] += 1
                
                # 检测A记录一致性并添加标记
                if a_record_comparison and len(a_record_comparison) > 1:
                    # 找出有效的A记录（非错误信息）
                    valid_a_records = {}
                    for dns_server, ip_set in a_record_comparison.items():
                        if isinstance(ip_set, set) and ip_set:
                            valid_a_records[dns_server] = ip_set
                    
                    if len(valid_a_records) > 1:
                        # 检查是否有多个DNS服务器返回相同的A记录
                        ip_to_servers = {}
                        for dns_server, ip_set in valid_a_records.items():
                            for ip in ip_set:
                                if ip not in ip_to_servers:
                                    ip_to_servers[ip] = []
                                ip_to_servers[ip].append(dns_server)
                        
                        # 找出一致的A记录
                        consistent_ips = {ip: servers for ip, servers in ip_to_servers.items() if len(servers) > 1}
                        
                        # 前端按“跨 DNS 一致的 A 记录”进行颜色标记，这里不再拼接“(一致)”文本
                        # 保持A记录原样返回
                        for dns_server_with_label, server_results in domain_results.items():
                            if 'A' in server_results and isinstance(server_results['A'], list):
                                server_results['A'] = [ip for ip in server_results['A']]


                results[domain] = domain_results

        query_progress['status'] = 'completed'

        # 添加查询历史记录（包含详细结果）
        add_dns_history(domains, dns_servers_with_labels, results)

        return jsonify(results)
    except Exception as e:
        query_progress['status'] = 'error'
        # 捕获外层异常并返回 JSON 格式的错误信息
        return jsonify({"error": str(e)}), 500

@app.route('/get_query_progress', methods=['GET'])
def get_query_progress():
    """获取查询进度"""
    try:
        progress_percentage = 0
        if query_progress['total'] > 0:
            progress_percentage = int((query_progress['current'] / query_progress['total']) * 100)
        
        return jsonify({
            "current": query_progress['current'],
            "total": query_progress['total'],
            "percentage": progress_percentage,
            "status": query_progress['status']
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/get_dns_config', methods=['GET'])
def get_dns_config():
    """获取当前DNS服务器配置"""
    try:
        dns_servers = load_dns_config()
        return jsonify({"dns_servers": dns_servers})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/save_dns_config', methods=['POST'])
def save_dns_config_route():
    """保存DNS服务器配置"""
    try:
        data = request.get_json()
        dns_servers = data.get('dns_servers', [])
        
        if not dns_servers:
            return jsonify({"error": "DNS服务器列表不能为空"}), 400
        
        success = save_dns_config(dns_servers)
        if success:
            return jsonify({"message": "DNS配置保存成功", "dns_servers": dns_servers})
        else:
            return jsonify({"error": "保存DNS配置失败"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/get_dns_history', methods=['GET'])
def get_dns_history():
    """获取DNS查询历史记录"""
    try:
        history = load_dns_history()
        return jsonify({"history": history})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/clear_dns_history', methods=['POST'])
def clear_dns_history():
    """清空DNS查询历史记录"""
    try:
        save_dns_history([])
        return jsonify({"message": "历史记录已清空"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/delete_dns_history', methods=['POST'])
def delete_dns_history():
    """删除指定的DNS查询历史记录"""
    try:
        data = request.get_json()
        record_id = data.get('record_id')
        
        if not record_id:
            return jsonify({"error": "记录ID不能为空"}), 400
        
        history = load_dns_history()
        
        # 找到并删除指定ID的记录
        original_length = len(history)
        history = [record for record in history if record.get('id') != record_id]
        
        if len(history) == original_length:
            return jsonify({"error": "未找到指定的历史记录"}), 404
        
        save_dns_history(history)
        return jsonify({"message": "历史记录删除成功"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)