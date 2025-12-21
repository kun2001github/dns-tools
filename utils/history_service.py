"""历史记录服务：合并相同域名的查询并维护时间节点。"""
from datetime import datetime

from utils.storage import load_dns_history, save_dns_history


def add_dns_history(domains, dns_servers=None, results=None):
    """添加DNS查询历史记录（包含详细结果），相同域名会合并时间节点。"""
    try:
        history = load_dns_history()

        domains_key = ','.join(sorted(domains))
        new_record = {
            'id': datetime.now().strftime('%Y%m%d%H%M%S'),
            'domains': domains,
            'dns_servers': dns_servers or [],
            'results': results or {},
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'date': datetime.now().strftime('%Y-%m-%d'),
            'time': datetime.now().strftime('%H:%M:%S')
        }

        existing_index = None
        for i, record in enumerate(history):
            existing_domains_key = ','.join(sorted(record.get('domains', [])))
            if existing_domains_key == domains_key:
                existing_index = i
                break

        if existing_index is not None:
            existing_record = history[existing_index]

            if 'time_nodes' not in existing_record:
                existing_record['time_nodes'] = [{
                    'id': existing_record['id'],
                    'results': existing_record.get('results', {}),
                    'timestamp': existing_record['timestamp'],
                    'date': existing_record['date'],
                    'time': existing_record['time']
                }]
                existing_record.pop('results', None)
                existing_record.pop('id', None)

            existing_record['time_nodes'].insert(0, {
                'id': new_record['id'],
                'results': new_record.get('results', {}),
                'timestamp': new_record['timestamp'],
                'date': new_record['date'],
                'time': new_record['time']
            })

            existing_record['timestamp'] = new_record['timestamp']
            existing_record['date'] = new_record['date']
            existing_record['time'] = new_record['time']

            history.insert(0, history.pop(existing_index))
        else:
            history.insert(0, new_record)

        if len(history) > 30:
            history = history[:30]

        save_dns_history(history)
        return history[0]
    except Exception:
        return None
