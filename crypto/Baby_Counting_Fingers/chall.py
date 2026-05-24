q_list = [31, 71, 19, 97, 47]
n_list = [127, 131, 137, 139, 149]

def encrypt(pt):
    ct = []
    for i, ch in enumerate(pt):
        finger = i % 5
        
        q = q_list[finger]
        n = n_list[finger]

        c = (ord(ch) * q) % n

        ct.append(c)
    return ct

def main():
    flag = "[REDACTED]"
    print(encrypt(flag))

if __name__ == "__main__":
    main()
