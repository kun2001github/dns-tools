# DNS Tools - DNS批量查询工具

一个功能强大的DNS批量查询工具，支持多DNS服务器并行查询、历史记录管理、DNS标签配置等功能。

## 功能特性

- 🚀 **批量DNS查询**：支持同时查询多个域名的DNS记录
- 🌐 **多DNS服务器**：可配置多个DNS服务器进行并行查询
- 🏷️ **标签管理**：支持为DNS服务器添加自定义标签注释
- 📊 **实时进度**：查询过程中显示实时进度条
- 📝 **历史记录**：完整的查询历史记录和详细结果展示
- 🗑️ **记录管理**：支持单条删除和批量清空历史记录
- 📱 **响应式设计**：三栏式布局，适配不同屏幕尺寸
- 💾 **数据持久化**：DNS配置和历史记录自动保存

## 功能展示图

![DNS Tools](./Images/home.png)
![DNS Tools](./Images/content.png)

## 安装与运行

### Windows 本地调试

```bash
# 确保使用 Python 3.11
python3.11

# 安装依赖
pip install flask dnspython

# 启动应用
python app.py
```

### Linux 生产部署

```bash
# 安装依赖（包括 gunicorn）
pip install -r requirements.txt

# 使用 gunicorn 启动（推荐）
gunicorn -w 4 -b 0.0.0.0:8000 app:app
```

**gunicorn 参数说明：**
- `-w 4`：指定工作进程数量，可根据服务器CPU核心数调整
- `-b 0.0.0.0:8000`：绑定到所有网络接口，监听8000端口
- `app:app`：指定Flask应用文件名（app.py）和应用实例名（app）

### Docker 部署

```bash
# 构建镜像（注意：Docker名称必须小写）
docker build -t dns-tool .

# 运行容器
docker run -p 8000:8000 dns-tool
```

## 使用说明

### DNS服务器配置

支持为DNS服务器添加标签，格式：`IP地址 # 标签注释`

例如：
- `202.96.128.166 # 电信DNS`
- `183.240.8.114 # 联通DNS` 
- `8.8.8.8 # 谷歌DNS`

### 域名查询

支持多种输入格式：
- 换行分隔：每行一个域名
- 逗号分隔：使用英文逗号分隔多个域名
- 混合格式：同时支持换行和逗号分隔

### 界面布局

应用采用三栏式布局：
- **左侧**：DNS服务器配置管理
- **中间**：域名输入和查询功能
- **右侧**：历史记录查看和管理

## 项目结构

```
dns-tools/
├── app.py              # 主应用文件
├── requirements.txt     # Python依赖包
├── dns_config.json     # DNS服务器配置（自动生成）
├── dns_history.json     # 查询历史记录（自动生成）
├── Dockerfile          # Docker构建文件
├── templates/
│   └── index.html      # 前端界面
└── README.md           # 项目说明文档
```

## 技术栈

- **后端**：Flask (Python Web框架)
- **DNS解析**：dnspython (DNS查询库)
- **前端**：HTML5 + CSS3 + JavaScript
- **部署**：gunicorn (WSGI服务器) + Docker
- **数据存储**：JSON文件

## API接口

- `GET /` - 主页面
- `GET /get_dns_config` - 获取DNS服务器配置
- `POST /add_dns_server` - 添加DNS服务器
- `DELETE /delete_dns_server` - 删除DNS服务器
- `POST /query_dns` - 执行DNS查询
- `GET /get_dns_history` - 获取查询历史
- `DELETE /delete_dns_history` - 删除历史记录

## 注意事项

1. 首次运行时会自动创建配置文件和历史记录文件
2. DNS配置和历史记录会自动保存，重启应用后数据不会丢失
3. 在生产环境中建议使用gunicorn而不是直接运行Flask开发服务器
4. Docker部署时注意镜像命名必须使用小写字母
