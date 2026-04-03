"""系统配置服务：管理系统参数的CRUD操作。"""
import sqlite3
import json
import os
from datetime import datetime
from typing import Dict, Optional, Any

# 数据库文件路径
DB_FILE = os.path.join('history', 'dns_history.db')

# 默认配置值
DEFAULT_CONFIGS = {
    'cache_ttl_days': ('30', 'IP信息缓存过期天数'),
    'error_cache_ttl_days': ('30', 'IP信息错误缓存过期天数'),
    'dns_query_timeout': ('5', 'DNS查询超时时间(秒)'),
    'api_request_timeout': ('3', 'API请求超时时间(秒)'),
    'gunicorn_workers': (str(min((os.cpu_count() or 1) * 2 + 1, 8)), 'Gunicorn工作进程数'),
    'gunicorn_port': ('8000', 'Gunicorn监听端口'),
    'gunicorn_timeout': ('120', 'Gunicorn请求超时时间(秒)'),
    'gunicorn_graceful_timeout': ('30', 'Gunicorn优雅关闭超时时间(秒)'),
    'rate_limit_per_minute': ('60', '每分钟请求速率限制'),
    'log_level': ('info', '日志级别'),
    'log_file': ('-', '日志文件路径(-表示标准输出)')
}


def get_all_config() -> Dict[str, Any]:
    """获取所有系统配置。
    
    Returns:
        Dict: 配置字典，key为配置名，value为配置值
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('SELECT config_key, config_value, description FROM system_config ORDER BY config_key')
        rows = cursor.fetchall()
        conn.close()
        
        config = {}
        for row in rows:
            config[row['config_key']] = {
                'value': row['config_value'],
                'description': row['description']
            }
        return config
    except Exception as e:
        print(f"获取系统配置失败: {e}")
        return {}


def get_config(key: str) -> Optional[str]:
    """获取单个配置值。
    
    Args:
        key: 配置键名
    
    Returns:
        str: 配置值，不存在返回None
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        cursor.execute('SELECT config_value FROM system_config WHERE config_key = ?', (key,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return row[0]
        return None
    except Exception as e:
        print(f"获取配置 {key} 失败: {e}")
        return None


def set_config(key: str, value: str, description: Optional[str] = None) -> bool:
    """更新单个配置。
    
    Args:
        key: 配置键名
        value: 配置值
        description: 配置描述(可选)
    
    Returns:
        bool: 更新成功返回True，失败返回False
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        if description:
            cursor.execute('''
                INSERT OR REPLACE INTO system_config (config_key, config_value, description, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ''', (key, value, description))
        else:
            cursor.execute('''
                UPDATE system_config SET config_value = ?, updated_at = CURRENT_TIMESTAMP
                WHERE config_key = ?
            ''', (value, key))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"更新配置 {key} 失败: {e}")
        return False


def set_config_batch(configs: Dict[str, str]) -> bool:
    """批量更新配置。
    
    Args:
        configs: 配置字典，key为配置名，value为配置值
    
    Returns:
        bool: 全部更新成功返回True，否则返回False
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        for key, value in configs.items():
            cursor.execute('''
                UPDATE system_config SET config_value = ?, updated_at = CURRENT_TIMESTAMP
                WHERE config_key = ?
            ''', (value, key))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"批量更新配置失败: {e}")
        return False


def reset_to_defaults() -> bool:
    """恢复所有配置到默认值。
    
    Returns:
        bool: 恢复成功返回True，失败返回False
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        for key, (value, description) in DEFAULT_CONFIGS.items():
            cursor.execute('''
                INSERT OR REPLACE INTO system_config (config_key, config_value, description, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ''', (key, value, description))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"恢复默认配置失败: {e}")
        return False
