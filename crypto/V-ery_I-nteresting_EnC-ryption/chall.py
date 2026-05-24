CHECKERBOARD_SINGLE = list('ETAOINSH')
CHECKERBOARD_SINGLE_CODES = ['0', '1', '2', '4', '5', '7', '8', '9']
CHECKERBOARD_ROW3 = list('RDBCFGJKLM')
CHECKERBOARD_ROW6 = list('PQUVWXYZ')

ENCODE_TABLE = {}
DECODE_TABLE = {}

for i, ch in enumerate(CHECKERBOARD_SINGLE):
    code = CHECKERBOARD_SINGLE_CODES[i]
    ENCODE_TABLE[ch] = code
    DECODE_TABLE[code] = ch

for i, ch in enumerate(CHECKERBOARD_ROW3):
    code = '3' + str(i)
    ENCODE_TABLE[ch] = code
    DECODE_TABLE[code] = ch

for i, ch in enumerate(CHECKERBOARD_ROW6):
    code = '6' + str(i)
    ENCODE_TABLE[ch] = code
    DECODE_TABLE[code] = ch

SPECIAL_TO_WORD = {
    '{': 'LCURL', '}': 'RCURL', '_': 'SCORE',
    '0': 'ZERO',  '1': 'ONE',   '2': 'TWO',   '3': 'THREE',
    '4': 'FOUR',  '5': 'FIVE',  '6': 'SIX',   '7': 'SEVEN',
    '8': 'EIGHT', '9': 'NINE',
}

KEY = "PHANTOM"
FLAG = "[REDACTED]"

def preprocess(text):
    result = ''
    for ch in text.upper():
        if ch in SPECIAL_TO_WORD:
            result += SPECIAL_TO_WORD[ch]
        elif ch.isalpha():
            result += ch
        else:
            raise ValueError(f"unsupported character: {ch!r}")
    return result


def checkerboard_encode(text):
    return ''.join(ENCODE_TABLE[ch] for ch in text)


def chain_addition(seq, length):
    seq = list(seq)
    while len(seq) < length:
        seq.append((seq[-2] + seq[-1]) % 10)
    return seq


def key_to_seed(key):
    return [ord(ch) - ord('A') for ch in key.upper() if ch.isalpha()]


def add_keystream(digit_str, key):
    keystream = chain_addition(key_to_seed(key), len(digit_str))
    return ''.join(str((int(c) + keystream[i]) % 10) for i, c in enumerate(digit_str))


def encrypt(plaintext, key):
    preprocessed = preprocess(plaintext)
    encoded = checkerboard_encode(preprocessed)
    return add_keystream(encoded, key)

if __name__ == '__main__':
    ciphertext = encrypt(FLAG, KEY)
    print(f"KEY:        {KEY}")
    print(f"CIPHERTEXT: {ciphertext}")
