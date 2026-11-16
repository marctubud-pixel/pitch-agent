"""Write the first owner's verifier to a new private environment file."""
import argparse
import getpass
import hashlib
import os
import re
import secrets
import sys

parser = argparse.ArgumentParser(description="为单用户门户生成私有登录配置")
parser.add_argument("env_file")
parser.add_argument("hostname", help="已确定的公网域名，例如 pitch.example.com")
args = parser.parse_args()
host = args.hostname.lower()
if len(host) > 253 or not re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?", host):
    sys.exit("请输入域名，不含协议、端口和路径")
account = input("账号（英文字母、数字、点、短横线或下划线）：").strip()
if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", account):
    sys.exit("账号格式有误")
password = getpass.getpass("新密码（至少 12 个字符）：")
if len(password) < 12 or password != getpass.getpass("再次输入密码："):
    sys.exit("密码长度不足或两次输入不一致")
salt = secrets.token_bytes(16)
digest = hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=1, dklen=32, maxmem=64*1024*1024)
with os.fdopen(os.open(args.env_file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "w") as out:
    out.write(f"ONEPITCH_ORIGIN=https://{host}\nONEPITCH_ACCOUNT={account}\nONEPITCH_SALT={salt.hex()}\nONEPITCH_VERIFIER={digest.hex()}\n")
