"""数据迁移脚本：将现有 JSON 历史记录迁移到 SQLite 数据库。"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from utils.database_service import init_database, save_query_with_stats


def migrate_json_to_sqlite():
    """迁移 JSON 历史记录到 SQLite 数据库。"""
    json_file = os.path.join('history', 'dns_history.json')
    
    if not os.path.exists(json_file):
        print(f"未找到 JSON 历史文件: {json_file}")
        return
    
    print("开始迁移历史记录...")
    print(f"读取 JSON 文件: {json_file}")
    
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            history = json.load(f)
        
        if not isinstance(history, list):
            print("JSON 文件格式不正确,应该是一个列表")
            return
        
        print(f"找到 {len(history)} 条历史记录")
        
        init_database()
        print("数据库初始化完成")
        
        migrated_count = 0
        skipped_count = 0
        
        for record in history:
            try:
                if 'time_nodes' in record and record['time_nodes']:
                    for node in record['time_nodes']:
                        query_id = node.get('id')
                        domains = record.get('domains', [])
                        dns_servers = record.get('dns_servers', [])
                        results = node.get('results', {})
                        duration_seconds = 0
                        
                        if query_id and domains and results:
                            success = save_query_with_stats(
                                query_id=query_id,
                                domains=domains,
                                dns_servers=dns_servers,
                                results=results,
                                duration_seconds=duration_seconds
                            )
                            
                            if success:
                                migrated_count += 1
                                print(f"✓ 迁移记录: {query_id}")
                            else:
                                skipped_count += 1
                                print(f"✗ 跳过记录: {query_id} (保存失败)")
                        else:
                            skipped_count += 1
                            print(f"✗ 跳过记录 (数据不完整)")
                else:
                    query_id = record.get('id')
                    domains = record.get('domains', [])
                    dns_servers = record.get('dns_servers', [])
                    results = record.get('results', {})
                    duration_seconds = 0
                    
                    if query_id and domains and results:
                        success = save_query_with_stats(
                            query_id=query_id,
                            domains=domains,
                            dns_servers=dns_servers,
                            results=results,
                            duration_seconds=duration_seconds
                        )
                        
                        if success:
                            migrated_count += 1
                            print(f"✓ 迁移记录: {query_id}")
                        else:
                            skipped_count += 1
                            print(f"✗ 跳过记录: {query_id} (保存失败)")
                    else:
                        skipped_count += 1
                        print(f"✗ 跳过记录 (数据不完整)")
                        
            except Exception as e:
                skipped_count += 1
                print(f"✗ 处理记录时出错: {e}")
        
        print(f"\n迁移完成!")
        print(f"成功迁移: {migrated_count} 条")
        print(f"跳过记录: {skipped_count} 条")
        
        backup_file = json_file + '.backup'
        os.rename(json_file, backup_file)
        print(f"\nJSON 文件已备份至: {backup_file}")
        
    except Exception as e:
        print(f"迁移失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    migrate_json_to_sqlite()
