def encrypt(pt):
    ct = []
    for i, char in enumerate(pt):
        res = (ord(char) * 1337 + i) ^ 0x42
        ct.append(hex(res))
    return "".join(ct).replace("0x", " ")

def main():
    flag = "[REDACTED]"
    print(encrypt(flag))

if __name__ == "__main__":
    main()
