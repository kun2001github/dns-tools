"""请求日志中间件：自动记录所有API请求到request_logs表。"""
import sqlite3
import json
import os
from datetime import datetime
from typing import Optional

# 数据库文件路径
DB_FILE = os.path.join('history', 'dns_history.db')


def log_request(
    endpoint: str,
    method: str,
    ip_address: Optional[str],
    user_agent: Optional[str],
    request_params: Optional[str],
    response_time_ms: Optional[int],
    status_code: Optional[int]
) -> bool:
    """记录请求日志到request_logs表。
    
    Args:
        endpoint: 请求路径
        method: HTTP方法
        ip_address: 客户端IP
        user_agent: User-Agent头
        request_params: 请求参数(JSON字符串)
        response_time_ms: 响应时间(毫秒)
        status_code: HTTP状态码
    
    Returns:
        bool: 保存成功返回True，失败返回False
    """
    try:
        # 确保数据库目录存在
        os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # 生成时间戳信息
        now = datetime.now()
        timestamp = now.strftime('%Y-%m-%d %H:%M:%S')
        date = now.strftime('%Y-%m-%d')
        time = now.strftime('%H:%M:%S')
        
        cursor.execute('''
            INSERT INTO request_logs 
            (endpoint, method, ip_address, user_agent, request_params, response_time_ms, status_code, timestamp, date, time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (endpoint, method, ip_address, user_agent, request_params, response_time_ms, status_code, timestamp, date, time))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"记录请求日志失败: {e}")
        return False


def should_log_request(path: str) -> bool:
    """判断是否应该记录该请求的日志。
    
    Args:
        path: 请求路径
    
    Returns:
        bool: 应该记录返回True，否则返回False
    """
    # 排除静态文件请求
    if path.startswith('/static/'):
        return False
    # 排除管理后台统计API（避免无限循环）
    if path.startswith('/api/admin/stats/'):
        return False
    return True
