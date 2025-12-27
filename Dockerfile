# 使用 Python 基础镜像
FROM python:3.13

# 设置工作目录
WORKDIR /app

# 复制项目文件到工作目录
COPY . /app

# 安装依赖
RUN pip install -r requirements.txt

# 暴露端口
EXPOSE 8000

# 启动 Gunicorn 服务器，增加超时时间和worker graceful shutdown
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "--timeout", "120", "--graceful-timeout", "30", "--worker-class", "sync", "--access-logfile", "-", "--error-logfile", "-", "app:app"]