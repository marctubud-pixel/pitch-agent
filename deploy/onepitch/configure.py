"""Write the first owner's verifier to a new private environment file."""
import getpass
import hashlib
import os
import re
import secrets
import sys

account = input("账号（英文字母、数字、点、短横线或下划线）：").strip()
if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", account):
    sys.exit("账号格式有误")
password = getpass.getpass("新密码（至少 12 个字符）：")
if len(password) < 12 or password != getpass.getpass("再次输入密码："):
    sys.exit("密码长度不足或两次输入不一致")
salt = secrets.token_bytes(16)
digest = hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=1, dklen=32, maxmem=64*1024*1024)
with os.fdopen(os.open(sys.argv[1], os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "w") as out:
    out.write(f"ONEPITCH_ORIGIN=https://onepitch.cn\nONEPITCH_ACCOUNT={account}\nONEPITCH_SALT={salt.hex()}\nONEPITCH_VERIFIER={digest.hex()}\n")
