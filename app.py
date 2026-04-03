"""Flask 应用入口：提供 DNS 查询、进度、配置与历史记录接口。"""
import json
import os
import random
import re
import signal
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
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
    delete_expired_ip_info_errors,
    delete_expired_ip_info_cache
)
from utils.request_logger import log_request, should_log_request



app = Flask(__name__)

# 请求日志中间件
@app.before_request
def before_request_logging():
    """记录请求开始时间和其他信息。"""
    if should_log_request(request.path):
        request._start_time = datetime.now()
        request._log_data = {
            'endpoint': request.path,
            'method': request.method,
            'ip_address': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', ''),
            'request_params': json.dumps(dict(request.args)) if request.args else None
        }

@app.after_request
def after_request_logging(response):
    """记录请求日志。"""
    if hasattr(request, '_start_time') and hasattr(request, '_log_data'):
        try:
            end_time = datetime.now()
            response_time_ms = int((end_time - request._start_time).total_seconds() * 1000)
            
            log_request(
                endpoint=request._log_data['endpoint'],
                method=request._log_data['method'],
                ip_address=request._log_data['ip_address'],
                user_agent=request._log_data['user_agent'],
                request_params=request._log_data['request_params'],
                response_time_ms=response_time_ms,
                status_code=response.status_code
            )
        except Exception as e:
            # 日志记录失败不影响正常请求
            print(f"请求日志记录失败: {e}")
    
    return response
IP_INFO_TIMEOUT = 3
IP_INFO_ERROR_TTL_DAYS = 30
IP_INFO_CACHE_TTL_DAYS = 30
_ip_info_db_lock = Lock()
_ip_api_order_lock = Lock()
_ip_api_rotate_seed = random.randint(0, 999999)


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
    path = os.path.join(os.path.dirname(__file__), 'config', 'ip_info_apis.json')
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


def _get_ordered_ip_info_apis():
    apis = list(IP_INFO_APIS)
    if len(apis) <= 1:
        return apis
    with _ip_api_order_lock:
        global _ip_api_rotate_seed
        _ip_api_rotate_seed = (_ip_api_rotate_seed + 1) % len(apis)
        rotate_index = (_ip_api_rotate_seed + random.randint(0, len(apis) - 1)) % len(apis)
    ordered = apis[rotate_index:] + apis[:rotate_index]
    if len(ordered) > 2:
        head = ordered[:2]
        tail = ordered[2:]
        random.shuffle(tail)
        ordered = head + tail
    return ordered


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
    # 限制尝试次数，防止超时
    max_retries = 3
    tried_count = 0
    
    for api in _get_ordered_ip_info_apis():
        if tried_count >= max_retries:
            break
        tried_count += 1
        
        url = api['url'].format(ip=ip)
        payload, _ = _request_json(url)
        if payload is None:
            continue
        info = api['parser'](payload)
        meta = {
            "_raw": payload,
            "_source_url": url,
            "_fetched_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
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
        
        from utils.query_service import start_query_task
        
        # 启动后台查询任务
        start_query_task(domains, dns_servers_with_labels)

        # 立即返回，告知前端查询已启动
        return jsonify({
            'status': 'started',
            'message': '查询任务已在后台启动'
        })
    except SystemExit:
        mark_error()
        return jsonify({"error": "查询已中断"}), 200
    except Exception as e:
        mark_error()
        return jsonify({"error": str(e)}), 500

@app.route('/get_last_query_result', methods=['GET'])
def get_last_query_result_route():
    """获取最后一次查询的结果。"""
    try:
        from utils.query_service import get_last_result
        result = get_last_result()
        if result:
            return jsonify(result)
        return jsonify({"error": "暂无结果"}), 404
    except Exception as e:
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
            delete_expired_ip_info_cache(IP_INFO_CACHE_TTL_DAYS)
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


@app.route('/get_ip_info_apis', methods=['GET'])
def get_ip_info_apis_route():
    """获取归属地查询API列表。"""
    try:
        apis = []
        for api in IP_INFO_APIS:
            apis.append({
                "name": api["name"],
                "url": api["url"],
                "parser": api["parser"].__name__
            })
        return jsonify({"apis": apis})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/check_ip_info_api_status', methods=['POST'])
def check_ip_info_api_status_route():
    """检查指定归属地查询API的状态。"""
    try:
        data = request.get_json() or {}
        api_name = data.get('api_name')
        test_ip = data.get('test_ip', '8.8.8.8')
        
        if not api_name:
            return jsonify({"error": "API名称不能为空"}), 400
        
        # 查找对应的API
        target_api = None
        for api in IP_INFO_APIS:
            if api["name"] == api_name:
                target_api = api
                break
        
        if not target_api:
            return jsonify({"error": f"未找到API: {api_name}"}), 404
        
        # 测试API
        url = target_api['url'].format(ip=test_ip)
        start_time = datetime.now()
        payload, raw_text = _request_json(url)
        elapsed = (datetime.now() - start_time).total_seconds()
        
        if payload is None:
            return jsonify({
                "api_name": api_name,
                "status": "unavailable",
                "message": "请求失败或超时",
                "response_time": elapsed
            })
        
        # 尝试解析
        info = target_api['parser'](payload)
        if info and not info.get("error"):
            return jsonify({
                "api_name": api_name,
                "status": "available",
                "message": "API可用",
                "response_time": elapsed,
                "sample_data": info
            })
        else:
            return jsonify({
                "api_name": api_name,
                "status": "error",
                "message": info.get("error", "解析失败") if info else "解析失败",
                "response_time": elapsed
            })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/check_all_ip_info_apis', methods=['POST'])
def check_all_ip_info_apis_route():
    """检查所有归属地查询API的状态。"""
    try:
        data = request.get_json() or {}
        test_ip = data.get('test_ip', '8.8.8.8')
        results = []
        
        for api in IP_INFO_APIS:
            url = api['url'].format(ip=test_ip)
            start_time = datetime.now()
            payload, raw_text = _request_json(url)
            elapsed = (datetime.now() - start_time).total_seconds()
            
            status_info = {
                "api_name": api["name"],
                "url": api["url"],
                "response_time": round(elapsed, 3)
            }
            
            if payload is None:
                status_info["status"] = "unavailable"
                status_info["message"] = "请求失败或超时"
            else:
                info = api['parser'](payload)
                if info and not info.get("error"):
                    status_info["status"] = "available"
                    status_info["message"] = "API可用"
                else:
                    status_info["status"] = "error"
                    status_info["message"] = info.get("error", "解析失败") if info else "解析失败"
            
            results.append(status_info)
        
        return jsonify({"results": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/save_ip_info_apis', methods=['POST'])
def save_ip_info_apis_route():
    """保存归属地查询API配置。"""
    try:
        data = request.get_json() or {}
        apis = data.get('apis', [])
        
        if not apis:
            return jsonify({"error": "API列表不能为空"}), 400
        
        # 验证每个API配置
        valid_apis = []
        for api in apis:
            if not isinstance(api, dict):
                continue
            name = api.get('name')
            url = api.get('url')
            if not name or not url:
                continue
            valid_apis.append({
                "name": name,
                "url": url,
                "parser": api.get('parser', 'generic')
            })
        
        if not valid_apis:
            return jsonify({"error": "没有有效的API配置"}), 400
        
        # 保存到配置文件
        config_path = os.path.join(os.path.dirname(__file__), 'config', 'ip_info_apis.json')
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(valid_apis, f, ensure_ascii=False, indent=2)
        
        # 重新加载API配置
        global IP_INFO_APIS
        IP_INFO_APIS = _load_ip_info_apis()
        
        return jsonify({
            "message": "API配置保存成功",
            "apis": valid_apis
        })
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


# ==================== 管理后台 API 路由 ====================

from utils.system_config_service import get_all_config, get_config, set_config, set_config_batch, reset_to_defaults
from utils.request_stats_service import get_daily_stats, get_type_stats, get_hourly_stats, get_summary_stats, get_top_slow_requests, get_error_requests, get_ip_stats, get_ip_detail_stats
from utils.database_service import get_all_queries, get_query_by_id


@app.route('/admin')
def admin_dashboard():
    """管理后台页面。"""
    return render_template('admin.html')


# --- 统计仪表盘 API ---

@app.route('/api/admin/stats/daily')
def admin_stats_daily():
    """获取每日请求数统计。"""
    try:
        start = request.args.get('start', (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'))
        end = request.args.get('end', datetime.now().strftime('%Y-%m-%d'))
        
        data = get_daily_stats(start, end)
        return jsonify({
            'data': data,
            'meta': {'start': start, 'end': end, 'total': len(data)}
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/stats/types')
def admin_stats_types():
    """获取请求类型分布。"""
    try:
        start = request.args.get('start', (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'))
        end = request.args.get('end', datetime.now().strftime('%Y-%m-%d'))
        
        data = get_type_stats(start, end)
        return jsonify({
            'data': data,
            'meta': {'start': start, 'end': end, 'total': sum(data.values())}
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/stats/hourly')
def admin_stats_hourly():
    """获取某天的每小时请求数统计。"""
    try:
        date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
        
        data = get_hourly_stats(date)
        return jsonify({
            'data': data,
            'meta': {'date': date, 'total': sum(item['count'] for item in data)}
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/stats/summary')
def admin_stats_summary():
    """获取汇总统计信息。"""
    try:
        start = request.args.get('start', (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'))
        end = request.args.get('end', datetime.now().strftime('%Y-%m-%d'))
        
        data = get_summary_stats(start, end)
        return jsonify({'data': data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/stats/slow')
def admin_stats_slow():
    """获取最慢的N个请求。"""
    try:
        limit = int(request.args.get('limit', 10))
        data = get_top_slow_requests(limit)
        return jsonify({'data': data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/stats/errors')
def admin_stats_errors():
    """获取错误请求列表。"""
    try:
        start = request.args.get('start', (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'))
        end = request.args.get('end', datetime.now().strftime('%Y-%m-%d'))
        
        data = get_error_requests(start, end)
        return jsonify({
            'data': data,
            'meta': {'start': start, 'end': end, 'total': len(data)}
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/stats/by-ip')
def admin_stats_by_ip():
    """按IP汇总统计请求来源。"""
    try:
        start = request.args.get('start', (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'))
        end = request.args.get('end', datetime.now().strftime('%Y-%m-%d'))
        
        data = get_ip_stats(start, end)
        return jsonify({
            'data': data,
            'meta': {'start': start, 'end': end, 'total': len(data)}
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/stats/by-ip-detail')
def admin_stats_by_ip_detail():
    """获取指定IP的详细请求记录。"""
    try:
        ip = request.args.get('ip')
        if not ip:
            return jsonify({'error': 'IP parameter is required'}), 400
        
        start = request.args.get('start', (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'))
        end = request.args.get('end', datetime.now().strftime('%Y-%m-%d'))
        
        data = get_ip_detail_stats(ip, start, end)
        return jsonify({
            'data': data,
            'meta': {'ip': ip, 'start': start, 'end': end, 'total': len(data)}
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# --- 配置管理 API ---

@app.route('/api/admin/system-config', methods=['GET'])
def admin_get_system_config():
    """获取所有系统参数。"""
    try:
        config = get_all_config()
        return jsonify({'config': config})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/system-config', methods=['PUT'])
def admin_update_system_config():
    """批量更新系统参数。"""
    try:
        data = request.get_json()
        configs = data.get('configs', {})
        
        if not configs:
            return jsonify({'error': 'No configs provided'}), 400
        
        success = set_config_batch(configs)
        if success:
            return jsonify({'message': 'Config updated successfully'})
        else:
            return jsonify({'error': 'Failed to update config'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/system-config/reset', methods=['POST'])
def admin_reset_system_config():
    """恢复系统参数到默认值。"""
    try:
        success = reset_to_defaults()
        if success:
            return jsonify({'message': 'Config reset to defaults'})
        else:
            return jsonify({'error': 'Failed to reset config'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/dns-config', methods=['GET'])
def admin_get_dns_config():
    """获取DNS配置。"""
    try:
        config = load_dns_config()
        return jsonify({'config': config})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/dns-config', methods=['PUT'])
def admin_update_dns_config():
    """更新DNS配置。"""
    try:
        data = request.get_json()
        servers = data.get('servers', [])
        
        if not servers:
            return jsonify({'error': 'No servers provided'}), 400
        
        success = save_dns_config(servers)
        if success:
            return jsonify({'message': 'DNS config updated successfully'})
        else:
            return jsonify({'error': 'Failed to update DNS config'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/ip-apis', methods=['GET'])
def admin_get_ip_apis():
    """获取IP归属地API列表。"""
    try:
        with open('config/ip_info_apis.json', 'r', encoding='utf-8') as f:
            apis = json.load(f)
        return jsonify({'apis': apis})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/ip-apis', methods=['PUT'])
def admin_update_ip_apis():
    """更新IP归属地API列表。"""
    try:
        data = request.get_json()
        apis = data.get('apis', [])
        
        if not isinstance(apis, list):
            return jsonify({'error': 'Invalid apis format'}), 400
        
        with open('config/ip_info_apis.json', 'w', encoding='utf-8') as f:
            json.dump(apis, f, ensure_ascii=False, indent=2)
        
        return jsonify({'message': 'IP APIs updated successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# --- 历史对比 API ---

@app.route('/api/admin/history/list')
def admin_history_list():
    """获取查询记录列表。"""
    try:
        limit = int(request.args.get('limit', 50))
        date = request.args.get('date')
        
        queries = get_all_queries(limit)
        
        # 如果指定了日期，过滤
        if date:
            queries = [q for q in queries if q.get('date') == date]
        
        return jsonify({
            'history': queries,
            'total': len(queries)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/history/compare')
def admin_history_compare():
    """对比两次查询的结果差异。"""
    try:
        from_id = request.args.get('from_id')
        to_id = request.args.get('to_id')
        
        if not from_id or not to_id:
            return jsonify({'error': 'from_id and to_id are required'}), 400
        
        from_query = get_query_by_id(from_id)
        to_query = get_query_by_id(to_id)
        
        if not from_query or not to_query:
            return jsonify({'error': 'Query not found'}), 404
        
        # 对比逻辑
        from_results = from_query.get('results', {})
        to_results = to_query.get('results', {})
        
        added = []
        removed = []
        changed = []
        
        # 找出新增和变更的域名
        for domain, to_data in to_results.items():
            if domain not in from_results:
                added.append({'domain': domain, 'result': to_data})
            else:
                from_data = from_results[domain]
                if from_data != to_data:
                    changed.append({
                        'domain': domain,
                        'from': from_data,
                        'to': to_data
                    })
        
        # 找出删除的域名
        for domain, from_data in from_results.items():
            if domain not in to_results:
                removed.append({'domain': domain, 'result': from_data})
        
        return jsonify({
            'comparison': {
                'added': added,
                'removed': removed,
                'changed': changed
            },
            'from': {'id': from_id, 'timestamp': from_query.get('timestamp')},
            'to': {'id': to_id, 'timestamp': to_query.get('timestamp')}
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/history/dns-compare')
def admin_history_dns_compare():
    """同一查询中不同DNS服务器的结果对比。"""
    try:
        query_id = request.args.get('query_id')
        domain = request.args.get('domain')
        
        if not query_id or not domain:
            return jsonify({'error': 'query_id and domain are required'}), 400
        
        query = get_query_by_id(query_id)
        if not query:
            return jsonify({'error': 'Query not found'}), 404
        
        results = query.get('results', {})
        domain_results = results.get(domain, {})
        
        # 按DNS服务器组织结果
        dns_servers = query.get('dns_servers', [])
        comparison = []
        
        for server in dns_servers:
            server_result = domain_results.get(server, {})
            comparison.append({
                'dns_server': server,
                'result': server_result,
                'ips': server_result.get('ips', []) if isinstance(server_result, dict) else []
            })
        
        return jsonify({
            'domain': domain,
            'query_id': query_id,
            'comparison': comparison
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# 优雅处理Gunicorn的SIGTERM信号
def handle_sigterm(signum, frame):
    sys.exit(0)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, handle_sigterm)
    signal.signal(signal.SIGINT, handle_sigterm)
    app.run(debug=True, port=8000)
