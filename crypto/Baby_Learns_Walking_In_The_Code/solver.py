raw = "1784a 15338 1b13f 158f7 18cb2 2822a ffad 1f06c 16ddc 10a26 10a27 18cb5 1f071 16373 ffb5 1d65b 1d658 1d0a0 1f07b 1c630 1785e 10a32 19736 1f07c 10043 1f002 1b1d7 10a34 10a35 1f006 10ff0 1f004 18d4e fa93 fa90 1a1b1 28cbb"

ct = [int(x, 16) for x in raw.split()]

flag = []
for i, val in enumerate(ct):
    inner = (val ^ 0x42) - i
    flag.append(chr(inner // 1337))

print(''.join(flag))  # HASBL{1_F33L_D1ZZY_WH3N_1_S33_4_L00P}
