"""Flask 应用入口：提供 DNS 查询、进度、配置与历史记录接口。"""
import signal
import sys
from flask import Flask, request, jsonify, render_template

from utils.history_service import add_dns_history

from utils.query_service import query_domains, get_query_progress, mark_error
from utils.storage import (
    DEFAULT_DNS_SERVERS,
    load_dns_config,
    load_dns_history,
    save_dns_config,
    save_dns_history,
)



app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/query_dns', methods=['POST'])
def query_dns_route():
    """DNS查询接口，支持带标签的DNS服务器配置。"""
    try:
        data = request.get_json()
        domains = data.get('domains', [])
        dns_servers_with_labels = data.get('dns_servers') or load_dns_config()

        # query_domains 现在返回 (results, duration_seconds)
        results, duration_seconds = query_domains(domains, dns_servers_with_labels)
        
        # 保存历史记录，包含耗时信息
        add_dns_history(domains, dns_servers_with_labels, results, duration_seconds)

        # 返回结果和统计信息
        return jsonify({
            'results': results,
            'stats': {
                'domain_count': len(domains),
                'dns_server_count': len(dns_servers_with_labels),
                'duration_seconds': round(duration_seconds, 2)
            }
        })
    except SystemExit:
        mark_error()
        return jsonify({"error": "查询已中断"}), 200
    except Exception as e:
        mark_error()
        return jsonify({"error": str(e)}), 500


@app.route('/get_query_progress', methods=['GET'])
def get_query_progress_route():
    try:
        progress = get_query_progress()
        return jsonify(progress)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/get_dns_config', methods=['GET'])
def get_dns_config():
    """获取当前DNS服务器配置。"""
    try:
        dns_servers = load_dns_config()
        return jsonify({"dns_servers": dns_servers})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/save_dns_config', methods=['POST'])
def save_dns_config_route():
    """保存DNS服务器配置。"""
    try:
        data = request.get_json()
        dns_servers = data.get('dns_servers', [])

        if not dns_servers:
            return jsonify({"error": "DNS服务器列表不能为空"}), 400

        success = save_dns_config(dns_servers)
        if success:
            return jsonify({"message": "DNS配置保存成功", "dns_servers": dns_servers})
        return jsonify({"error": "保存DNS配置失败"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/get_dns_history', methods=['GET'])
def get_dns_history_route():
    """获取DNS查询历史记录。"""
    try:
        from utils.history_service import get_dns_history
        history = get_dns_history()
        return jsonify({"history": history})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/clear_dns_history', methods=['POST'])
def clear_dns_history_route():
    """清空DNS查询历史记录。"""
    try:
        from utils.history_service import clear_dns_history
        clear_dns_history()
        return jsonify({"message": "历史记录已清空"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/delete_dns_history', methods=['POST'])
def delete_dns_history_route():
    """删除指定的DNS查询历史记录。"""
    try:
        from utils.history_service import delete_dns_history
        
        data = request.get_json()
        record_id = data.get('record_id')

        if not record_id:
            return jsonify({"error": "记录ID不能为空"}), 400

        success = delete_dns_history(record_id)
        
        if success:
            return jsonify({"message": "历史记录删除成功"})
        else:
            return jsonify({"error": "未找到指定的历史记录"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/clear_dns_cache', methods=['POST'])
def clear_dns_cache_route():
    """清理DNS缓存。"""
    try:
        import subprocess
        import platform
        
        system = platform.system()
        success = False
        message = ""
        
        if system == "Darwin":  # macOS
            try:
                subprocess.run(['sudo', 'dscacheutil', '-flushcache'], check=True, timeout=5)
                subprocess.run(['sudo', 'killall', '-HUP', 'mDNSResponder'], check=True, timeout=5)
                success = True
                message = "macOS DNS缓存已清理"
            except subprocess.CalledProcessError:
                message = "需要sudo权限清理macOS DNS缓存，请在终端执行：sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder"
            except subprocess.TimeoutExpired:
                message = "清理DNS缓存超时"
        elif system == "Linux":
            try:
                # 尝试清理systemd-resolved缓存
                result = subprocess.run(['systemd-resolve', '--flush-caches'], 
                                      capture_output=True, timeout=5)
                if result.returncode == 0:
                    success = True
                    message = "Linux DNS缓存已清理 (systemd-resolved)"
                else:
                    # 尝试nscd
                    result = subprocess.run(['nscd', '-i', 'hosts'], 
                                          capture_output=True, timeout=5)
                    if result.returncode == 0:
                        success = True
                        message = "Linux DNS缓存已清理 (nscd)"
                    else:
                        message = "请在终端执行：sudo systemd-resolve --flush-caches 或 sudo nscd -i hosts"
            except FileNotFoundError:
                message = "未找到DNS缓存服务，请手动清理：sudo systemd-resolve --flush-caches"
            except subprocess.TimeoutExpired:
                message = "清理DNS缓存超时"
        elif system == "Windows":
            try:
                subprocess.run(['ipconfig', '/flushdns'], check=True, timeout=5)
                success = True
                message = "Windows DNS缓存已清理"
            except subprocess.CalledProcessError:
                message = "需要管理员权限清理Windows DNS缓存，请以管理员身份运行"
            except subprocess.TimeoutExpired:
                message = "清理DNS缓存超时"
        else:
            message = f"不支持的操作系统: {system}"
        
        return jsonify({
            "success": success,
            "message": message,
            "system": system
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"清理DNS缓存失败: {str(e)}"
        }), 500


# 优雅处理Gunicorn的SIGTERM信号
def handle_sigterm(signum, frame):
    sys.exit(0)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, handle_sigterm)
    signal.signal(signal.SIGINT, handle_sigterm)
    app.run(debug=True, port=8000)
