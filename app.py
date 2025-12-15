import dns.resolver
import json
import os
from datetime import datetime
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

def add_dns_history(domains, dns_servers=None, results=None):
    """
    添加DNS查询历史记录（包含详细结果）
    domains: 查询的域名列表
    dns_servers: 使用的DNS服务器列表
    results: 查询结果详情
    """
    try:
        history = load_dns_history()
        
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
        
        # 将新记录添加到历史记录开头
        history.insert(0, new_record)
        
        # 限制历史记录数量，最多保留30条（包含详细结果，减少存储量）
        if len(history) > 30:
            history = history[:30]
        
        save_dns_history(history)
        return new_record
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
        results = {}

        for domain in domains:
            domain_results = {}
            for dns_server_with_label in dns_servers_with_labels:
                # 解析DNS服务器配置，提取IP地址和标签
                dns_server, label = parse_dns_server_with_label(dns_server_with_label)
                
                if not dns_server:  # 跳过空行
                    continue
                    
                resolver = dns.resolver.Resolver()
                resolver.nameservers = [dns_server]
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

                # 在结果中保存原始配置行（包含标签）
                domain_results[dns_server_with_label] = server_results

            results[domain] = domain_results

        # 添加查询历史记录（包含详细结果）
        add_dns_history(domains, dns_servers_with_labels, results)

        return jsonify(results)
    except Exception as e:
        # 捕获外层异常并返回 JSON 格式的错误信息
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