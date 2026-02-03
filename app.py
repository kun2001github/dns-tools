"""Flask 应用入口：提供 DNS 查询、进度、配置与历史记录接口。"""
import json
import os
import re
import signal
import sys
import urllib.error
import urllib.request
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
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
from utils.database_service import (
    get_ip_info_cache,
    save_ip_info_cache,
    delete_expired_ip_info_errors
)



app = Flask(__name__)
IP_INFO_TIMEOUT = 4
IP_INFO_ERROR_TTL_DAYS = 7
_ip_info_db_lock = Lock()


def _is_valid_ipv4(ip):
    if not isinstance(ip, str):
        return False
    return re.fullmatch(r'(?:\d{1,3}\.){3}\d{1,3}', ip) is not None


def _normalize_ip_type(value):
    if value is None:
        return ''
    if isinstance(value, (int, float)):
        if int(value) == 4:
            return 'IPv4'
        if int(value) == 6:
            return 'IPv6'
    text = str(value).strip()
    if not text:
        return ''
    upper = text.upper()
    if upper in ('4', 'IPV4', 'V4'):
        return 'IPv4'
    if upper in ('6', 'IPV6', 'V6'):
        return 'IPv6'
    if 'IPV4' in upper:
        return 'IPv4'
    if 'IPV6' in upper:
        return 'IPv6'
    return text


def _extract_ip_type(payload):
    if not isinstance(payload, dict):
        return ''
    keys = ('ip_type', 'ipType', 'type', 'version', 'ip_version', 'ipVersion', 'ipv', 'ipver')
    for key in keys:
        val = payload.get(key)
        if val:
            return _normalize_ip_type(val)
    containers = [payload]
    for key in ('data', 'location', 'ipdata', 'geo', 'geolocation'):
        child = payload.get(key)
        if isinstance(child, dict):
            containers.append(child)
    for container in containers:
        for key in keys:
            val = container.get(key)
            if val:
                return _normalize_ip_type(val)
    return ''


def _normalize_ip_info_fields(isp, country, region, city, ip_type=None):
    data = {
        "isp": isp or "",
        "country": country or "",
        "region": region or "",
        "city": city or ""
    }
    if ip_type:
        data["ip_type"] = ip_type
    if not any(data.values()):
        return {"error": "查询失败"}
    return data


def _parse_ipwhois(payload):
    if not isinstance(payload, dict):
        return {"error": "查询失败"}
    if payload.get('success') is False:
        return {"error": payload.get('message') or "查询失败"}
    return _normalize_ip_info_fields(
        payload.get('isp') or payload.get('org') or payload.get('organization') or '',
        payload.get('country') or payload.get('country_name') or '',
        payload.get('region') or payload.get('regionName') or payload.get('state_prov') or '',
        payload.get('city') or payload.get('city_name') or '',
        _extract_ip_type(payload)
    )


def _parse_ip_api(payload):
    if not isinstance(payload, dict):
        return {"error": "查询失败"}
    if payload.get('status') == 'fail':
        return {"error": payload.get('message') or "查询失败"}
    return _normalize_ip_info_fields(
        payload.get('isp') or payload.get('org') or '',
        payload.get('country') or payload.get('country_name') or '',
        payload.get('regionName') or payload.get('region') or '',
        payload.get('city') or '',
        _extract_ip_type(payload)
    )


def _parse_ipsb(payload):
    if not isinstance(payload, dict):
        return {"error": "查询失败"}
    message = payload.get('message') or payload.get('error')
    if message:
        return {"error": message}
    return _normalize_ip_info_fields(
        payload.get('isp') or payload.get('organization') or payload.get('org') or '',
        payload.get('country') or payload.get('country_name') or '',
        payload.get('region') or payload.get('region_name') or '',
        payload.get('city') or payload.get('city_name') or '',
        _extract_ip_type(payload)
    )


def _parse_ipapi_co(payload):
    if not isinstance(payload, dict):
        return {"error": "查询失败"}
    if payload.get('error'):
        return {"error": payload.get('reason') or "查询失败"}
    return _normalize_ip_info_fields(
        payload.get('org') or payload.get('isp') or '',
        payload.get('country_name') or payload.get('country') or '',
        payload.get('region') or payload.get('regionName') or '',
        payload.get('city') or '',
        _extract_ip_type(payload)
    )


def _parse_freeipapi(payload):
    if not isinstance(payload, dict):
        return {"error": "查询失败"}
    if payload.get('status') in ('fail', 'error') or payload.get('message'):
        return {"error": payload.get('message') or "查询失败"}
    return _normalize_ip_info_fields(
        payload.get('isp') or payload.get('organization') or payload.get('organisation') or '',
        payload.get('countryName') or payload.get('country_name') or payload.get('country') or '',
        payload.get('regionName') or payload.get('region') or '',
        payload.get('cityName') or payload.get('city') or '',
        _extract_ip_type(payload)
    )


def _parse_pconline(payload):
    if not isinstance(payload, dict):
        return {"error": "查询失败"}
    if payload.get('err'):
        return {"error": payload.get('err') or "查询失败"}
    addr = payload.get('addr') or ''
    country = payload.get('country') or ('中国' if '中国' in addr else '')
    region = payload.get('pro') or payload.get('province') or ''
    city = payload.get('city') or ''
    isp = payload.get('isp') or ''
    if not isp and addr:
        parts = addr.split()
        if parts:
            isp = parts[-1]
    return _normalize_ip_info_fields(isp, country, region, city, _extract_ip_type(payload))


def _parse_vore(payload):
    if not isinstance(payload, dict):
        return {"error": "查询失败"}
    if payload.get('code') not in (200, '200'):
        return {"error": payload.get('msg') or "查询失败"}
    ipdata = payload.get('ipdata') or {}
    ipinfo = payload.get('ipinfo') or {}
    country = '中国' if ipinfo.get('cnip') is True else ''
    return _normalize_ip_info_fields(
        ipdata.get('isp') or '',
        country,
        ipdata.get('info1') or '',
        ipdata.get('info2') or '',
        _extract_ip_type(payload)
    )


def _parse_generic(payload):
    if not isinstance(payload, dict):
        return {"error": "查询失败"}
    if payload.get('success') is False:
        return {"error": payload.get('message') or "查询失败"}
    if payload.get('status') == 'fail':
        return {"error": payload.get('message') or "查询失败"}
    if payload.get('error') and payload.get('error') is not False:
        if isinstance(payload.get('error'), str):
            return {"error": payload.get('error')}
        return {"error": payload.get('message') or "查询失败"}
    containers = [payload]
    for key in ('data', 'location', 'ipdata', 'geo', 'geolocation'):
        child = payload.get(key)
        if isinstance(child, dict):
            containers.append(child)
    def pick(keys):
        for container in containers:
            for key in keys:
                val = container.get(key)
                if val:
                    return val
        return ''
    return _normalize_ip_info_fields(
        pick(('isp', 'org', 'organization', 'as_name', 'asName', 'asn', 'as', 'operator', 'company')),
        pick(('country', 'country_name', 'countryName')),
        pick(('region', 'regionName', 'state_prov', 'province', 'pro')),
        pick(('city', 'city_name', 'cityName')),
        _extract_ip_type(payload)
    )


DEFAULT_IP_INFO_APIS = (
    {
        "name": "ipwhois",
        "url": "https://ipwhois.app/json/{ip}?format=json",
        "parser": _parse_ipwhois
    },
    {
        "name": "ip-api",
        "url": "http://ip-api.com/json/{ip}?lang=zh-CN",
        "parser": _parse_ip_api
    },
    {
        "name": "ip-sb",
        "url": "https://api.ip.sb/geoip/{ip}",
        "parser": _parse_ipsb
    },
    {
        "name": "ipapi-co",
        "url": "https://ipapi.co/{ip}/json/",
        "parser": _parse_ipapi_co
    },
    {
        "name": "freeipapi",
        "url": "https://freeipapi.com/api/json/{ip}",
        "parser": _parse_freeipapi
    },
    {
        "name": "pconline",
        "url": "https://whois.pconline.com.cn/ipJson.jsp?ip={ip}&json=true",
        "parser": _parse_pconline
    },
    {
        "name": "vore",
        "url": "https://api.vore.top/api/IPdata?ip={ip}",
        "parser": _parse_vore
    },
    {
        "name": "geojs",
        "url": "https://get.geojs.io/v1/ip/geo/{ip}.json",
        "parser": _parse_generic
    }
)


def _load_ip_info_apis():
    parser_map = {
        "ipwhois": _parse_ipwhois,
        "ip-api": _parse_ip_api,
        "ip-sb": _parse_ipsb,
        "ipapi-co": _parse_ipapi_co,
        "freeipapi": _parse_freeipapi,
        "pconline": _parse_pconline,
        "vore": _parse_vore,
        "geojs": _parse_generic
    }
    path = os.path.join(os.path.dirname(__file__), 'ip_info_apis.json')
    apis = []
    try:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        else:
            data = None
    except Exception:
        data = None
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            url = item.get('url')
            parser_key = item.get('parser')
            parser = parser_map.get(parser_key)
            if not url or not parser:
                continue
            apis.append({
                "name": item.get('name') or parser_key,
                "url": url,
                "parser": parser
            })
    if not apis:
        return list(DEFAULT_IP_INFO_APIS)
    return apis


IP_INFO_APIS = _load_ip_info_apis()


def _safe_json_loads(text):
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                return None
    return None


def _request_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'dns-tools'})
    try:
        with urllib.request.urlopen(req, timeout=IP_INFO_TIMEOUT) as resp:
            raw = resp.read()
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None, None
    text = None
    for encoding in ('utf-8', 'gbk'):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = raw.decode('utf-8', errors='ignore')
    return _safe_json_loads(text), text


def _fetch_ip_info(ip):
    last_error = None
    last_meta = None
    for api in IP_INFO_APIS:
        url = api['url'].format(ip=ip)
        payload, _ = _request_json(url)
        if payload is None:
            continue
        info = api['parser'](payload)
        meta = {
            "_raw": payload,
            "_source_url": url,
            "_fetched_at": datetime.now().strftime('%H:%M:%S')
        }
        if info and not info.get("error"):
            info.update(meta)
            return info
        if info and info.get("error"):
            last_error = info.get("error")
            last_meta = meta
    result = {"error": last_error or "查询失败"}
    if last_meta:
        result.update(last_meta)
    return result


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


@app.route('/query_ip_info', methods=['POST'])
def query_ip_info_route():
    try:
        data = request.get_json() or {}
        ips = data.get('ips', [])
        force = bool(data.get('force'))
        if not isinstance(ips, list):
            return jsonify({"error": "参数格式错误"}), 400

        with _ip_info_db_lock:
            delete_expired_ip_info_errors(IP_INFO_ERROR_TTL_DAYS)

        results = {}
        missing = []

        for raw_ip in ips:
            ip = str(raw_ip).strip()
            if not ip:
                continue
            if not _is_valid_ipv4(ip):
                results[ip] = {"error": "非法IP"}
                continue
            if not force:
                cached = get_ip_info_cache(ip)
                if cached:
                    results[ip] = cached
                    continue
            missing.append(ip)

        if missing:
            max_workers = min(8, max(2, len(missing)))
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_ip = {executor.submit(_fetch_ip_info, ip): ip for ip in missing}
                for future in as_completed(future_to_ip):
                    ip = future_to_ip[future]
                    try:
                        info = future.result()
                    except Exception:
                        info = {"error": "查询失败"}
                    results[ip] = info
                    save_ip_info_cache(ip, info)

        return jsonify({"results": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/get_ip_info_error_ttl', methods=['GET'])
def get_ip_info_error_ttl_route():
    return jsonify({"days": IP_INFO_ERROR_TTL_DAYS})


@app.route('/set_ip_info_error_ttl', methods=['POST'])
def set_ip_info_error_ttl_route():
    try:
        global IP_INFO_ERROR_TTL_DAYS
        data = request.get_json() or {}
        days = data.get('days', IP_INFO_ERROR_TTL_DAYS)
        days = int(days)
        if days < 1:
            return jsonify({"error": "天数必须大于0"}), 400
        IP_INFO_ERROR_TTL_DAYS = days
        return jsonify({"days": IP_INFO_ERROR_TTL_DAYS})
    except Exception as e:
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
