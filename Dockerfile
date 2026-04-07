# 使用 Python 基础镜像
FROM python:3.13

# 设置工作目录
WORKDIR /app

# 复制项目文件到工作目录
COPY . /app

# 一步安装所有必需依赖 + 自动清理（无报错版本）
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Chrome 必需库
    libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    # Firefox / WebKit 必需库（替换了不存在的包）
    libxcursor1 libgtk-3-0 libgdk-pixbuf-xlib-2.0-0 \
    libx11-xcb1 libxcb-shm0 libxcb-randr0 libxcb-image0 libxcb-xfixes0 \
    libxcb-shape0 libxcb-render0 libxcb-keysyms1 libxcb-xinerama0 libxss1 \
    libsm6 libice6 \
    # 关键：安装后立即清理缓存，减小镜像体积
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖（无缓存）
RUN pip install --no-cache-dir -r requirements.txt

# 安装 Playwright 系统依赖 + 仅安装 Chromium
RUN playwright install-deps
RUN playwright install chromium

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "--timeout", "120", "--graceful-timeout", "30", "--worker-class", "sync", "--access-logfile", "-", "--error-logfile", "-", "app:app"]