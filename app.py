"""Flask 应用入口：提供 DNS 查询、进度、配置与历史记录接口。"""
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

        results = query_domains(domains, dns_servers_with_labels)
        add_dns_history(domains, dns_servers_with_labels, results)

        return jsonify(results)
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
        history = load_dns_history()
        return jsonify({"history": history})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/clear_dns_history', methods=['POST'])
def clear_dns_history_route():
    """清空DNS查询历史记录。"""
    try:
        save_dns_history([])
        return jsonify({"message": "历史记录已清空"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/delete_dns_history', methods=['POST'])
def delete_dns_history_route():
    """删除指定的DNS查询历史记录。"""
    try:
        data = request.get_json()
        record_id = data.get('record_id')

        if not record_id:
            return jsonify({"error": "记录ID不能为空"}), 400

        history = load_dns_history()
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
