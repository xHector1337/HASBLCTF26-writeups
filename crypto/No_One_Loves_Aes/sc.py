# solve.py
iv = bytearray.fromhex("00112233445566778899aabbccddeeff")
old_plain = b"role=user"
new_plain = b"role=admi"

for i in range(len(new_plain)):
    iv[i] = iv[i] ^ old_plain[i] ^ new_plain[i]

print(f"Admin IV: {iv.hex()}")
