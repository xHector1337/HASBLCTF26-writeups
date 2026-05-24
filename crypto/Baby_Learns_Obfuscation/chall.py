#flag format is HASBL{}

def obf(pt):
    obf_text = ""
    leng = len(pt)
    obf_text += "aaaaaaaaaaaabbbbbbbbbbbJohnDoeaaaaaaaaaaaaabbbbbbbbbbbbb"
    if leng%2 == 1:
        temp = pt[int(leng/2)]
        i = leng-int(leng/2)
        j = leng -1 
        while(j!= i):
            obf_text += pt[j]
            j -= 1
        j = 0
        while(j != i):
            obf_text += pt[j]
            j += 1
        obf_text += temp
        return obf_text
    if leng%2 == 0:
        i = leng-int(leng/2) 
        j = leng -1 
        while(j!= (i-1)):
            obf_text += pt[j]
            j -= 1
        j = 0
        while(j != i):
            obf_text += pt[j]
            j += 1
        return obf_text

def encrypt(ptt):
    ct = []
    obf_t = obf(ptt)
    for i in obf_t:
        val = (ord(i) * 0xDEADBEEF) % 0x1337
        ct.append(str(val))
    return ct

def main():
    pt = "[REDACTED]"
    print(encrypt(pt))

if __name__ == "__main__":
    main()
