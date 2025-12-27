import multiprocessing

# 工作进程数
workers = multiprocessing.cpu_count() * 2 + 1
if workers > 8:
    workers = 8

# 绑定地址
bind = "0.0.0.0:8000"

# 工作模式
worker_class = "sync"

# 超时时间（秒）
timeout = 120

# 优雅关闭超时时间（秒）
graceful_timeout = 30

# 保持连接超时
keepalive = 5

# 最大请求数后重启worker
max_requests = 1000
max_requests_jitter = 50

# 日志配置
accesslog = "-"
errorlog = "-"

# 日志级别
loglevel = "info"

# 预加载应用（减少内存使用，但代码修改后需要重启）
preload_app = False

# 进程名称
proc_name = "dns-tools"

# 启动钩子
def on_starting(server):
    """启动时的钩子"""
    pass

def on_reload(server):
    """重载时的钩子"""
    pass

def worker_int(worker):
    """worker收到SIGINT信号"""
    pass

def worker_abort(worker):
    """worker收到SIGABRT信号"""
    pass
