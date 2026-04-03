"""请求统计服务：查询请求统计数据。"""
import sqlite3
import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional

# 数据库文件路径
DB_FILE = os.path.join('history', 'dns_history.db')


def get_daily_stats(start_date: str, end_date: str) -> List[Dict[str, Any]]:
    """获取每日请求数统计。
    
    Args:
        start_date: 开始日期 (YYYY-MM-DD)
        end_date: 结束日期 (YYYY-MM-DD)
    
    Returns:
        List[Dict]: 每日统计列表，包含date和count
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT date, COUNT(*) as count
            FROM request_logs
            WHERE date >= ? AND date <= ?
            GROUP BY date
            ORDER BY date
        ''', (start_date, end_date))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [{'date': row['date'], 'count': row['count']} for row in rows]
    except Exception as e:
        print(f"获取每日统计失败: {e}")
        return []


def get_type_stats(start_date: str, end_date: str) -> Dict[str, int]:
    """获取请求类型统计（按endpoint分组）。
    
    Args:
        start_date: 开始日期 (YYYY-MM-DD)
        end_date: 结束日期 (YYYY-MM-DD)
    
    Returns:
        Dict: endpoint到请求数的映射
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT endpoint, COUNT(*) as count
            FROM request_logs
            WHERE date >= ? AND date <= ?
            GROUP BY endpoint
            ORDER BY count DESC
        ''', (start_date, end_date))
        
        rows = cursor.fetchall()
        conn.close()
        
        return {row[0]: row[1] for row in rows}
    except Exception as e:
        print(f"获取类型统计失败: {e}")
        return {}


def get_hourly_stats(date: str) -> List[Dict[str, Any]]:
    """获取某天的每小时请求数统计。
    
    Args:
        date: 日期 (YYYY-MM-DD)
    
    Returns:
        List[Dict]: 每小时统计列表，包含hour和count
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT strftime('%H', time) as hour, COUNT(*) as count
            FROM request_logs
            WHERE date = ?
            GROUP BY hour
            ORDER BY hour
        ''', (date,))
        
        rows = cursor.fetchall()
        conn.close()
        
        # 填充缺失的小时
        result = {row['hour']: row['count'] for row in rows}
        return [{'hour': f'{h:02d}', 'count': result.get(f'{h:02d}', 0)} for h in range(24)]
    except Exception as e:
        print(f"获取小时统计失败: {e}")
        return []


def get_summary_stats(start_date: str, end_date: str) -> Dict[str, Any]:
    """获取汇总统计信息。
    
    Args:
        start_date: 开始日期 (YYYY-MM-DD)
        end_date: 结束日期 (YYYY-MM-DD)
    
    Returns:
        Dict: 汇总统计，包含total_requests, avg_response_time, error_rate, slowest_endpoint
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # 总请求数和平均响应时间
        cursor.execute('''
            SELECT 
                COUNT(*) as total_requests,
                AVG(response_time_ms) as avg_response_time,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
            FROM request_logs
            WHERE date >= ? AND date <= ?
        ''', (start_date, end_date))
        
        row = cursor.fetchone()
        total_requests = row[0] or 0
        avg_response_time = round(row[1], 2) if row[1] else 0
        error_count = row[2] or 0
        error_rate = round(error_count / total_requests * 100, 2) if total_requests > 0 else 0
        
        # 最慢的接口
        cursor.execute('''
            SELECT endpoint, AVG(response_time_ms) as avg_time
            FROM request_logs
            WHERE date >= ? AND date <= ? AND response_time_ms IS NOT NULL
            GROUP BY endpoint
            ORDER BY avg_time DESC
            LIMIT 1
        ''', (start_date, end_date))
        
        slowest_row = cursor.fetchone()
        slowest_endpoint = slowest_row[0] if slowest_row else None
        
        conn.close()
        
        return {
            'total_requests': total_requests,
            'avg_response_time': avg_response_time,
            'error_count': error_count,
            'error_rate': error_rate,
            'slowest_endpoint': slowest_endpoint
        }
    except Exception as e:
        print(f"获取汇总统计失败: {e}")
        return {
            'total_requests': 0,
            'avg_response_time': 0,
            'error_count': 0,
            'error_rate': 0,
            'slowest_endpoint': None
        }


def get_top_slow_requests(limit: int = 10) -> List[Dict[str, Any]]:
    """获取最慢的N个请求。
    
    Args:
        limit: 返回数量限制
    
    Returns:
        List[Dict]: 最慢请求列表
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT endpoint, method, ip_address, response_time_ms, status_code, timestamp
            FROM request_logs
            WHERE response_time_ms IS NOT NULL
            ORDER BY response_time_ms DESC
            LIMIT ?
        ''', (limit,))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in rows]
    except Exception as e:
        print(f"获取最慢请求失败: {e}")
        return []


def get_error_requests(start_date: str, end_date: str) -> List[Dict[str, Any]]:
    """获取错误请求（status >= 400）。
    
    Args:
        start_date: 开始日期 (YYYY-MM-DD)
        end_date: 结束日期 (YYYY-MM-DD)
    
    Returns:
        List[Dict]: 错误请求列表
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT endpoint, method, ip_address, status_code, response_time_ms, timestamp
            FROM request_logs
            WHERE date >= ? AND date <= ? AND status_code >= 400
            ORDER BY timestamp DESC
        ''', (start_date, end_date))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in rows]
    except Exception as e:
        print(f"获取错误请求失败: {e}")
        return []


def get_ip_stats(start_date: str, end_date: str) -> List[Dict[str, Any]]:
    """按IP汇总统计请求来源。
    
    Args:
        start_date: 开始日期 (YYYY-MM-DD)
        end_date: 结束日期 (YYYY-MM-DD)
    
    Returns:
        List[Dict]: IP统计列表，包含ip, request_count, domains
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # 获取每个IP的请求次数
        cursor.execute('''
            SELECT 
                ip_address,
                COUNT(*) as request_count,
                GROUP_CONCAT(DISTINCT endpoint) as endpoints
            FROM request_logs
            WHERE date >= ? AND date <= ? AND ip_address IS NOT NULL AND ip_address != ''
            GROUP BY ip_address
            ORDER BY request_count DESC
        ''', (start_date, end_date))
        
        rows = cursor.fetchall()
        
        # 从request_params中解析域名信息
        result = []
        for row in rows:
            ip = row['ip_address']
            request_count = row['request_count']
            endpoints = row['endpoints'].split(',') if row['endpoints'] else []
            
            # 获取该IP请求过的域名
            cursor.execute('''
                SELECT DISTINCT request_params
                FROM request_logs
                WHERE date >= ? AND date <= ? AND ip_address = ? AND request_params IS NOT NULL
            ''', (start_date, end_date, ip))
            
            param_rows = cursor.fetchall()
            domains = set()
            
            for param_row in param_rows:
                try:
                    params = json.loads(param_row['request_params'])
                    if 'domains' in params:
                        domain_list = params['domains']
                        if isinstance(domain_list, list):
                            domains.update(domain_list)
                except (json.JSONDecodeError, TypeError):
                    pass
            
            result.append({
                'ip': ip,
                'request_count': request_count,
                'endpoints': endpoints,
                'domains': list(domains),
                'domain_count': len(domains)
            })
        
        conn.close()
        return result
    except Exception as e:
        print(f"获取IP统计失败: {e}")
        return []


def get_ip_detail_stats(ip: str, start_date: str, end_date: str) -> List[Dict[str, Any]]:
    """获取指定IP的详细请求记录。
    
    Args:
        ip: IP地址
        start_date: 开始日期 (YYYY-MM-DD)
        end_date: 结束日期 (YYYY-MM-DD)
    
    Returns:
        List[Dict]: 详细请求记录列表
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                timestamp,
                endpoint,
                method,
                ip_address,
                request_params,
                response_time_ms,
                status_code
            FROM request_logs
            WHERE date >= ? AND date <= ? AND ip_address = ?
            ORDER BY timestamp DESC
            LIMIT 100
        ''', (start_date, end_date, ip))
        
        rows = cursor.fetchall()
        conn.close()
        
        result = []
        for row in rows:
            record = dict(row)
            # 解析请求参数中的域名
            try:
                params = json.loads(record['request_params']) if record['request_params'] else {}
                record['domains'] = params.get('domains', [])
            except (json.JSONDecodeError, TypeError):
                record['domains'] = []
            result.append(record)
        
        return result
    except Exception as e:
        print(f"获取IP详细统计失败: {e}")
        return []
