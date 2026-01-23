"""历史记录服务：使用 SQLite 数据库管理 DNS 查询历史。"""
from datetime import datetime
from utils.database_service import (
    save_query_with_stats,
    get_all_queries,
    get_query_by_id,
    delete_query,
    clear_all_queries
)


def add_dns_history(domains, dns_servers=None, results=None, duration_seconds=0):
    """添加DNS查询历史记录（包含详细结果和统计信息）。
    
    Args:
        domains: 域名列表
        dns_servers: DNS服务器列表  
        results: 查询结果字典
        duration_seconds: 查询耗时（秒）
    
    Returns:
        dict: 新增的记录对象，失败返回None
    """
    try:
        # 生成查询ID
        query_id = datetime.now().strftime('%Y%m%d%H%M%S')
        
        # 保存到数据库
        success = save_query_with_stats(
            query_id=query_id,
            domains=domains,
            dns_servers=dns_servers or [],
            results=results or {},
            duration_seconds=duration_seconds
        )
        
        if success:
            # 返回刚保存的记录
            return get_query_by_id(query_id)
        return None
    except Exception as e:
        print(f"添加历史记录失败: {e}")
        return None


def get_dns_history(limit=100):
    """获取DNS查询历史记录列表。
    
    按域名组合分组，每个组合只保留最新记录（用于显示），
    但在返回数据中包含该组合的所有历史查询（用于时间轴）。
    
    Args:
        limit: 返回记录数量限制，默认100条
    
    Returns:
        list: 历史记录列表，每条记录包含time_nodes数组
    """
    # 获取所有记录
    all_records = get_all_queries(limit=500)
    
    if not all_records:
        return []
    
    # 按域名组合分组
    groups = {}
    for record in all_records:
        # 创建域名key（排序后用逗号连接）
        domains_key = ','.join(sorted(record.get('domains', [])))
        
        if domains_key not in groups:
            groups[domains_key] = {
                'domains': record.get('domains', []),
                'dns_servers': record.get('dns_servers', []),
                'date': record.get('date', ''),
                'time': record.get('time', ''),
                'timestamp': record.get('timestamp', ''),
                'id': record.get('id', ''),
                'stats': record.get('stats', None),
                'time_nodes': []
            }
        
        # 将记录添加到time_nodes
        groups[domains_key]['time_nodes'].append({
            'id': record.get('id', ''),
            'results': record.get('results', {}),
            'timestamp': record.get('timestamp', ''),
            'date': record.get('date', ''),
            'time': record.get('time', ''),
            'duration_seconds': record.get('stats', {}).get('duration_seconds', 0) if record.get('stats') else 0
        })
    
    # 转换为数组并按时间倒序排列
    result = list(groups.values())
    result.sort(key=lambda x: x.get('timestamp', x.get('id', '')), reverse=True)
    
    return result[:limit]


def delete_dns_history(record_id):
    """删除指定的历史记录。
    
    Args:
        record_id: 记录ID
    
    Returns:
        bool: 删除成功返回True
    """
    return delete_query(record_id)


def clear_dns_history():
    """清空所有历史记录。
    
    Returns:
        bool: 清空成功返回True
    """
    return clear_all_queries()
