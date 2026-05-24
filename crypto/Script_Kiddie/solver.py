"""
CTF Challenge Solver
====================
Recovers the plaintext flag from the ciphertext + debug hint in output.txt.

Attack summary:
  The debug output leaks initial_matrix_row[r0] extended over the full
  plaintext length.  Because matrix[r0][j] = (31*(r0+1) * ord(pt[j])) % 256
  and gcd(31*(r0+1), 256) = 1, we can invert the multiplication mod 256
  and read every plaintext byte directly.
"""

import math


def mod_inverse(a, m):
    for x in range(1, m):
        if (a * x) % m == 1:
            return x
    raise ValueError(f"{a} has no inverse mod {m}")


# ── Original encryption (verification only) ───────────────────────────────────

def fill_matrix(pt):
    matrix = [[0]*20 for _ in range(20)]
    L = len(pt)
    for i in range(20):
        for j in range(20):
            matrix[i][j] = (31 * (i + 1) * ord(pt[j % L])) % 256
    return matrix

def key_creation(mtx):
    key = [[0]*20 for _ in range(3)]
    r0 = sum(mtx[i][0] for i in range(20)) % 20
    r1 = (sum(mtx[i][1] for i in range(20)) + 7) % 20
    r2 = (sum(mtx[i][2] for i in range(20)) + 13) % 20
    for j in range(20):
        key[0][j] = mtx[r0][j]
        key[1][j] = mtx[r1][j]
        key[2][j] = mtx[r2][j]
    return key, (r0, r1, r2)

def build_round_key(key):
    full_key = [[1 if i == j else 0 for j in range(20)] for i in range(20)]
    for k in range(20):
        for j in range(3):
            full_key[k][j] = key[j][k]
    return full_key

def multiplication(A, B):
    C = [[0]*20 for _ in range(20)]
    for i in range(20):
        for j in range(20):
            for k in range(20):
                C[i][j] = (C[i][j] + A[i][k] * B[k][j]) % 256
    return C

def encrypt(data):
    mtx = fill_matrix(data)
    for _ in range(3):
        key, _ = key_creation(mtx)
        full_key = build_round_key(key)
        mtx = multiplication(mtx, full_key)
    key_stream = [ord(c) for c in data[:4]] * 100
    flattened = [item for sublist in mtx for item in sublist]
    return ''.join(f'{(flattened[i] ^ key_stream[i]):02x}' for i in range(400))


# ── Solve ─────────────────────────────────────────────────────────────────────

def solve():
    ciphertext = (
        "22610fbc7ca47e2865af94c3455cbdadf8e87eac9c01ebbe208b0996129ddd40"
        "527b8f9c2813099e762147b8d4eed47ccf8b06c16f16998f58bad488e0c123ba"
        "98d5e7eafcf94f467c35ebfe88e5e7fa5ae19fb44c38b250a9e7b0c709d0f5e9"
        "380cb2e434817bb6701f5d3e46d5f94406efc7d868b75dd6aea1d7b0240268a4"
        "73c322c5138ad1cb98de68c01841b3b2e8693b1220316b4a20a9233ac8093b32"
        "f2616fac9c4cc6f8dd1faccb3d440d2578b0c61c6c01cbae40b391668a0d9548"
        "ca631f14a8db910ec621a7a87496bccca77bdec9c77e6907d802bc78b0c103aa"
        "38fd4fba5469074ed41d7b7608ad4f6a2ae1ffa4ece01a20015748cfe1384561"
        "b8d41a5484815ba690c7258e3e45b14cfed75750e87f25467ea137a0442af074"
        "ebb3facd8bf2a14318a6f0b0e84193a2081183e298a123529891b3b248d183a2"
        "42614f9c3c74ae48b58f64d395ac9d9df878ae8c3c012b9ee05b793662fdad50"
        "a24bef8c28a379fe9621879894be049c1feb96d1bf66f9ff58ca04e800c1639a"
        "58a5d70accd9df564c05cbee8875d7da"
    ).replace('\n', '')

    r0        = 4
    debug_row = [152, 91, 65, 246, 4, 121, 225, 18, 225, 166, 227, 133,
                 65, 145, 166, 171, 112, 77, 225, 166, 133, 145, 124, 58,
                 133, 124, 16, 4, 18, 225, 133, 171, 77, 175]

    print("=" * 60)
    print("  CTF SOLVER — Custom Matrix Cipher")
    print("=" * 60)

    factor = 31 * (r0 + 1)
    g      = math.gcd(factor, 256)
    print(f"\n[+] r0 = {r0}  ->  factor = 31x{r0+1} = {factor}")
    print(f"[+] gcd({factor}, 256) = {g}  ->  {'invertible' if g == 1 else 'NOT invertible'}")

    inv      = mod_inverse(factor, 256)
    print(f"[+] {factor}^-1 mod 256 = {inv}")

    pt_bytes = [(inv * v) % 256 for v in debug_row]
    flag     = ''.join(chr(b) for b in pt_bytes)
    print(f"\n[+] Recovered bytes : {pt_bytes}")
    print(f"[+] Recovered flag  : {flag}")

    ct = encrypt(flag)
    ok = (ct == ciphertext)
    print(f"\n[+] Ciphertext check: {'MATCH' if ok else 'NO MATCH'}")
    print(f"\n{'='*60}")
    print(f"  FLAG: {flag}")
    print(f"{'='*60}")

if __name__ == "__main__":
    solve()
