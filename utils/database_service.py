"""数据库服务：SQLite 数据库操作，用于存储 DNS 查询历史和统计信息。"""
import sqlite3
import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional

# 数据库文件路径
DB_FILE = os.path.join('history', 'dns_history.db')


def init_database():
    """初始化数据库，创建必要的表结构。"""
    os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 创建查询记录表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS queries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_id TEXT UNIQUE NOT NULL,
            domains TEXT NOT NULL,
            dns_servers TEXT NOT NULL,
            results TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 创建查询统计表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS query_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_id TEXT NOT NULL,
            domain_count INTEGER NOT NULL,
            dns_server_count INTEGER NOT NULL,
            duration_seconds REAL NOT NULL,
            query_time TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (query_id) REFERENCES queries(query_id) ON DELETE CASCADE
        )
    ''')
    
    # 创建索引以提高查询性能
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_queries_timestamp 
        ON queries(timestamp DESC)
    ''')
    
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_queries_query_id 
        ON queries(query_id)
    ''')
    
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_stats_query_id 
        ON query_stats(query_id)
    ''')
    
    conn.commit()
    conn.close()


def save_query_with_stats(
    query_id: str,
    domains: List[str],
    dns_servers: List[str],
    results: Dict[str, Any],
    duration_seconds: float
) -> bool:
    """保存查询记录及其统计信息到数据库。
    
    Args:
        query_id: 查询ID (格式: YYYYMMDDHHmmss)
        domains: 域名列表
        dns_servers: DNS服务器列表
        results: 查询结果字典
        duration_seconds: 查询耗时(秒)
    
    Returns:
        bool: 保存成功返回True，失败返回False
    """
    try:
        init_database()
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # 生成时间戳信息
        now = datetime.now()
        timestamp = now.strftime('%Y-%m-%d %H:%M:%S')
        date = now.strftime('%Y-%m-%d')
        time = now.strftime('%H:%M:%S')
        
        # 序列化列表和字典为JSON
        domains_json = json.dumps(domains, ensure_ascii=False)
        dns_servers_json = json.dumps(dns_servers, ensure_ascii=False)
        results_json = json.dumps(results, ensure_ascii=False)
        
        # 插入查询记录
        cursor.execute('''
            INSERT OR REPLACE INTO queries 
            (query_id, domains, dns_servers, results, timestamp, date, time)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (query_id, domains_json, dns_servers_json, results_json, timestamp, date, time))
        
        # 插入统计信息
        cursor.execute('''
            INSERT INTO query_stats 
            (query_id, domain_count, dns_server_count, duration_seconds, query_time)
            VALUES (?, ?, ?, ?, ?)
        ''', (query_id, len(domains), len(dns_servers), duration_seconds, timestamp))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"保存查询记录失败: {e}")
        return False


def get_all_queries(limit: int = 30) -> List[Dict[str, Any]]:
    """获取所有查询记录（包含统计信息），按时间倒序排列。
    
    Args:
        limit: 返回记录数量限制，默认30条
    
    Returns:
        List[Dict]: 查询记录列表
    """
    try:
        init_database()
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row  # 使结果可以像字典一样访问
        cursor = conn.cursor()
        
        # 左连接获取查询记录及其统计信息
        cursor.execute('''
            SELECT 
                q.query_id as id,
                q.domains,
                q.dns_servers,
                q.results,
                q.timestamp,
                q.date,
                q.time,
                s.domain_count,
                s.dns_server_count,
                s.duration_seconds,
                s.query_time
            FROM queries q
            LEFT JOIN query_stats s ON q.query_id = s.query_id
            ORDER BY q.timestamp DESC
            LIMIT ?
        ''', (limit,))
        
        rows = cursor.fetchall()
        conn.close()
        
        # 转换为字典列表
        queries = []
        for row in rows:
            query = {
                'id': row['id'],
                'domains': json.loads(row['domains']),
                'dns_servers': json.loads(row['dns_servers']),
                'results': json.loads(row['results']),
                'timestamp': row['timestamp'],
                'date': row['date'],
                'time': row['time'],
                'stats': {
                    'domain_count': row['domain_count'],
                    'dns_server_count': row['dns_server_count'],
                    'duration_seconds': row['duration_seconds'],
                    'query_time': row['query_time']
                } if row['domain_count'] is not None else None
            }
            queries.append(query)
        
        return queries
    except Exception as e:
        print(f"获取查询记录失败: {e}")
        return []


def get_query_by_id(query_id: str) -> Optional[Dict[str, Any]]:
    """根据查询ID获取单条查询记录。
    
    Args:
        query_id: 查询ID
    
    Returns:
        Dict: 查询记录，如果不存在返回None
    """
    try:
        init_database()
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                q.query_id as id,
                q.domains,
                q.dns_servers,
                q.results,
                q.timestamp,
                q.date,
                q.time,
                s.domain_count,
                s.dns_server_count,
                s.duration_seconds,
                s.query_time
            FROM queries q
            LEFT JOIN query_stats s ON q.query_id = s.query_id
            WHERE q.query_id = ?
        ''', (query_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                'id': row['id'],
                'domains': json.loads(row['domains']),
                'dns_servers': json.loads(row['dns_servers']),
                'results': json.loads(row['results']),
                'timestamp': row['timestamp'],
                'date': row['date'],
                'time': row['time'],
                'stats': {
                    'domain_count': row['domain_count'],
                    'dns_server_count': row['dns_server_count'],
                    'duration_seconds': row['duration_seconds'],
                    'query_time': row['query_time']
                } if row['domain_count'] is not None else None
            }
        return None
    except Exception as e:
        print(f"获取查询记录失败: {e}")
        return None


def delete_query(query_id: str) -> bool:
    """删除指定的查询记录（级联删除统计信息）。
    
    Args:
        query_id: 查询ID
    
    Returns:
        bool: 删除成功返回True，失败返回False
    """
    try:
        init_database()
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # 由于设置了 ON DELETE CASCADE，删除queries记录时会自动删除关联的stats记录
        cursor.execute('DELETE FROM queries WHERE query_id = ?', (query_id,))
        
        conn.commit()
        affected_rows = cursor.rowcount
        conn.close()
        
        return affected_rows > 0
    except Exception as e:
        print(f"删除查询记录失败: {e}")
        return False


def clear_all_queries() -> bool:
    """清空所有查询记录。
    
    Returns:
        bool: 清空成功返回True，失败返回False
    """
    try:
        init_database()
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # 级联删除所有记录
        cursor.execute('DELETE FROM queries')
        cursor.execute('DELETE FROM query_stats')
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"清空查询记录失败: {e}")
        return False


def get_query_stats_summary() -> Dict[str, Any]:
    """获取查询统计摘要信息。
    
    Returns:
        Dict: 包含总查询次数、平均耗时等统计信息
    """
    try:
        init_database()
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                COUNT(*) as total_queries,
                AVG(duration_seconds) as avg_duration,
                MIN(duration_seconds) as min_duration,
                MAX(duration_seconds) as max_duration
            FROM query_stats
        ''')
        
        row = cursor.fetchone()
        conn.close()
        
        return {
            'total_queries': row[0] or 0,
            'avg_duration': round(row[1], 2) if row[1] else 0,
            'min_duration': round(row[2], 2) if row[2] else 0,
            'max_duration': round(row[3], 2) if row[3] else 0
        }
    except Exception as e:
        print(f"获取统计摘要失败: {e}")
        return {
            'total_queries': 0,
            'avg_duration': 0,
            'min_duration': 0,
            'max_duration': 0
        }
