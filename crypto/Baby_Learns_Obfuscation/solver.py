MOD  = 0x1337       
INV  = 4649         
ct = [3698, 3698, 3698, 3698, 3698, 3698, 3698, 3698, 3698, 3698, 3698, 3698,
      947, 947, 947, 947, 947, 947, 947, 947, 947, 947, 947,
      3024, 4536, 4117, 2368, 4773, 4536, 2532,
      3698, 3698, 3698, 3698, 3698, 3698, 3698, 3698, 3698, 3698, 3698, 3698, 3698,
      947, 947, 947, 947, 947, 947, 947, 947, 947, 947, 947, 947, 947,
      455, 1858, 765, 2933, 1184, 1275, 1111, 692, 2605, 1858, 2350,
      4281, 4773, 2350, 3607, 3188, 2860, 437, 2441, 1038, 765, 437,
      4190, 2277, 1767, 2605, 4518, 1184]

obf_str = ''.join(chr((v * INV) % MOD) for v in ct)

HEADER = "aaaaaaaaaaaabbbbbbbbbbbJohnDoeaaaaaaaaaaaaabbbbbbbbbbbbb"
scrambled = obf_str[len(HEADER):]

L = len(scrambled)
first_half  = scrambled[:L//2]
second_half = scrambled[L//2:]
flag = second_half + first_half[::-1]

print(flag)  # HASBL{0BFU5C473D_3NCRYP710N}
