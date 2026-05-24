import struct
 
TAPS = 0x80200003
 
def lfsr_step(s: int) -> int:
    return ((s >> 1) ^ TAPS) & 0xFFFFFFFF if (s & 1) else (s >> 1) & 0xFFFFFFFF
 
def ks_byte(state: list) -> int:
    out = 0
    for _ in range(8):
        state[0] = lfsr_step(state[0])
        state[1] = lfsr_step(state[1])
        out = (out << 1) | ((state[0] ^ state[1]) & 1)
    return out & 0xFF
 
def htonl(x: int) -> int:
    """little-endian host'ta htonl = 32-bit byte-swap"""
    return struct.unpack('>I', struct.pack('<I', x & 0xFFFFFFFF))[0]
 
def decrypt(ciphertext: bytes, key: int) -> bytes:
    hi = (key >> 32) & 0xFFFFFFFF
    lo =  key        & 0xFFFFFFFF
 
    state = [htonl(hi), lo]
 
    out = bytearray()
    for b in ciphertext:
        out.append(b ^ ks_byte(state))
    return bytes(out)
 
if __name__ == "__main__":
    KEY = 0xDEADBEEFCAFEBABE
    enc = bytes.fromhex(
        "6217af381b120f8545bc4403cd9a7d7086de496854a1b1cb5b04e50af42ccc6ebc"
    )
    result = decrypt(enc, KEY)
    print("Flag:", result.decode())

