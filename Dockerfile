# 使用 Python 基础镜像
FROM python:3.13
#FROM playwright/chromium:playwright-1.56.1

# 设置工作目录
WORKDIR /app

# 复制项目文件到工作目录
COPY . /app


#安装 chromium 依赖核心库
RUN apt-get update && apt-get install -y \
    libnspr4 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2

# 安装依赖
RUN pip install -r requirements.txt

# 暴露端口
EXPOSE 8000

#安装playwright install chromium
RUN playwright install chromium
RUN playwright install 


# 启动 Gunicorn 服务器，增加超时时间和worker graceful shutdown 
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "--timeout", "120", "--graceful-timeout", "30", "--worker-class", "sync", "--access-logfile", "-", "--error-logfile", "-", "app:app"]