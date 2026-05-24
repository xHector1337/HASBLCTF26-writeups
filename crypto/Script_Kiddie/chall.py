def fill_matrix(pt):
    matrix = [[0 for _ in range(20)] for _ in range(20)]
    L = len(pt)
    for i in range(20):
        for j in range(20):
            matrix[i][j] = (31 * (i + 1) * ord(pt[j % L])) % 256
    return matrix

def key_creation(mtx):
    key = [[0 for _ in range(20)] for _ in range(3)]

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
    C = [[0 for _ in range(20)] for _ in range(20)]
    for i in range(20):
        for j in range(20):
            for k in range(20):
                C[i][j] = (C[i][j] + A[i][k] * B[k][j]) % 256
    return C

def matrix_rounds(mtx):
    for _ in range(3):
        key, _ = key_creation(mtx)
        full_key = build_round_key(key)
        mtx = multiplication(mtx, full_key)
    return mtx

def final_xor(mtx, pt):
    key_stream = [ord(c) for c in pt[:4]] * 100
    flattened = [item for sublist in mtx for item in sublist]
    cipher = []
    for i in range(400):
        cipher.append(flattened[i] ^ key_stream[i])
    return ''.join(f'{x:02x}' for x in cipher)

def encrypt(data):
    initial_mtx = fill_matrix(data)
 
    _, (r0, r1, r2) = key_creation(initial_mtx)
    L = len(data)
    factor = 31 * (r0 + 1)
    debug_row = [(factor * ord(data[j])) % 256 for j in range(L)]
    print(f"[debug] Round 1 selected row index: {r0}")
    print(f"[debug] Initial matrix row {r0} (extended): {debug_row}")
    
    mtx = matrix_rounds(initial_mtx)
    return final_xor(mtx, data)

def main():
    plaintext = "[REDACTED]"
    result = encrypt(plaintext)
    print(f"Ciphertext: {result}")

if __name__ == "__main__":
    main()
