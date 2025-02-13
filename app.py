import dns.resolver
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

# 添加首页路由
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/query_dns', methods=['POST'])
def query_dns():
    try:
        data = request.get_json()
        domains = data.get('domains', [])
        dns_servers = data.get('dns_servers', ['202.96.128.166', '183.240.8.114', '8.8.8.8'])
        results = {}

        for domain in domains:
            domain_results = {}
            for dns_server in dns_servers:
                resolver = dns.resolver.Resolver()
                resolver.nameservers = [dns_server]
                server_results = {}

                # 查询 A 记录
                try:
                    answers = resolver.query(domain, 'A')
                    ip_addresses = [str(answer) for answer in answers]
                    server_results['A'] = ip_addresses
                except dns.resolver.NXDOMAIN:
                    server_results['A'] = '域名不存在'
                except dns.resolver.NoAnswer:
                    server_results['A'] = '没有 A 记录'
                except dns.resolver.Timeout:
                    server_results['A'] = '查询超时'
                except Exception as e:
                    server_results['A'] = str(e)

                # 查询 CNAME 记录
                try:
                    answers = resolver.query(domain, 'CNAME')
                    cname_records = [str(answer) for answer in answers]
                    server_results['CNAME'] = cname_records
                except dns.resolver.NXDOMAIN:
                    server_results['CNAME'] = '域名不存在'
                except dns.resolver.NoAnswer:
                    server_results['CNAME'] = '没有 CNAME 记录'
                except dns.resolver.Timeout:
                    server_results['CNAME'] = '查询超时'
                except Exception as e:
                    server_results['CNAME'] = str(e)

                domain_results[dns_server] = server_results

            results[domain] = domain_results

        return jsonify(results)
    except Exception as e:
        # 捕获外层异常并返回 JSON 格式的错误信息
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)