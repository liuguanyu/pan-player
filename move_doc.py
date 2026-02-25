# -*- coding: utf-8 -*-
"""
移动需求文档到车载项目目录
"""
import shutil
import os

# 源文件路径
source_file = r"D:\devspace\dupan-player\车载同品需求.md"

# 目标目录路径
target_dir = r"D:\devspace\baidu-car-player"

# 目标文件路径
target_file = os.path.join(target_dir, "车载同品需求.md")

# 确保目标目录存在
os.makedirs(target_dir, exist_ok=True)

# 移动文件
if os.path.exists(source_file):
    shutil.copy2(source_file, target_file)
    print(f"✓ 文档已复制到: {target_file}")
    
    # 确认目标文件存在
    if os.path.exists(target_file):
        print(f"✓ 文件大小: {os.path.getsize(target_file)} 字节")
        print("✓ 移动成功！")
    else:
        print("✗ 移动失败：目标文件不存在")
else:
    print(f"✗ 源文件不存在: {source_file}")