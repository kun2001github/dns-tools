"""存储层：负责 DNS 配置与历史记录的文件读写。"""
import json
import os

DNS_CONFIG_FILE = 'config.json'
HISTORY_FILE = os.path.join('history', 'dns_history.json')
DEFAULT_DNS_SERVERS = [
    '202.96.128.166 # 电信DNS',
    '183.240.8.114 # 联通DNS',
    '8.8.8.8 # 谷歌DNS'
]


def load_dns_config():
    """加载DNS服务器配置（带标签）。"""
    try:
        if os.path.exists(DNS_CONFIG_FILE):
            with open(DNS_CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return config.get('dns_servers', DEFAULT_DNS_SERVERS)
        return DEFAULT_DNS_SERVERS
    except Exception:
        return DEFAULT_DNS_SERVERS


def save_dns_config(dns_servers):
    """保存DNS服务器配置（带标签）。"""
    try:
        config = {'dns_servers': dns_servers}
        with open(DNS_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def load_dns_history():
    """加载DNS查询历史记录。"""
    try:
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    except Exception:
        return []


def save_dns_history(history):
    """保存DNS查询历史记录。"""
    try:
        os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False
