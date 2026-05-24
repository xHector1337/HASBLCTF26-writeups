from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import base64, sys

FLAG = "[REDACTED]"

def verify_token(key: bytes, iv_hex: str, ct_b64: str) -> str:
    try:
        iv = bytes.fromhex(iv_hex)
        ct = base64.b64decode(ct_b64)
        cipher = AES.new(key, AES.MODE_CBC, iv)
        pt = unpad(cipher.decrypt(ct), 16).decode(errors="replace")
    except Exception as e:
        return f"Invalid token: {e}"

    print(f"Decrypted token: {pt!r}")

    params = {}
    for part in pt.split("&"):
        if "=" in part:
            k, v = part.split("=", 1)
            params[k] = v

    role = params.get("role", "")
    if role == "admi":
        return f"Welcome, Administrator! Here is your flag: {FLAG}"
    elif role == "user":
        return "Access denied. You are not an administrator."
    else:
        return f"Unknown role: {role!r}"


if __name__ == "__main__": 
    KEY = bytes.fromhex("4a7d9f2b1c8e3a056b4f9d2e7c1a8b3f")

    if len(sys.argv) == 3:
        iv_hex = sys.argv[1]
        ct_b64 = sys.argv[2]
    else:
        iv_hex = "00112233445566778899aabbccddeeff"
        ct_b64 = "hpyxuX57ay5OF1KisNAfo33ikcvyJ7pSArYC5MSCoPrfDDj9CxrXZcC1T9+aUDHI"

    print(verify_token(KEY, iv_hex, ct_b64))
