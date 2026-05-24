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

WORD_TO_SPECIAL = {v: k for k, v in SPECIAL_TO_WORD.items()}

KNOWN_WORDS = sorted(WORD_TO_SPECIAL.keys(), key=len, reverse=True)

KEY = "PHANTOM"
CIPHERTEXT = "498617096752072960505459675014205450305667501423412988064723675014294044925927261862072417698459212283351426145617881454"


def checkerboard_decode(digit_str):
    result = ''
    i = 0
    while i < len(digit_str):
        if digit_str[i] in ('3', '6'):
            token = digit_str[i:i+2]
            result += DECODE_TABLE[token]
            i += 2
        else:
            result += DECODE_TABLE[digit_str[i]]
            i += 1
    return result


def chain_addition(seq, length):
    seq = list(seq)
    while len(seq) < length:
        seq.append((seq[-2] + seq[-1]) % 10)
    return seq


def key_to_seed(key):
    return [ord(ch) - ord('A') for ch in key.upper() if ch.isalpha()]


def remove_keystream(digit_str, key):
    keystream = chain_addition(key_to_seed(key), len(digit_str))
    return ''.join(str((int(c) - keystream[i]) % 10) for i, c in enumerate(digit_str))


def postprocess(text):
    result = ''
    i = 0
    while i < len(text):
        matched = False
        for word in KNOWN_WORDS:
            if text[i:i+len(word)] == word:
                result += WORD_TO_SPECIAL[word]
                i += len(word)
                matched = True
                break
        if not matched:
            result += text[i]
            i += 1
    return result


def decrypt(ciphertext, key):
    stripped = remove_keystream(ciphertext, key)
    letter_text = checkerboard_decode(stripped)
    return postprocess(letter_text)


if __name__ == '__main__':
    print(f"KEY:        {KEY}")
    print(f"CIPHERTEXT: {CIPHERTEXT}")
    print()
    stripped = remove_keystream(CIPHERTEXT, KEY)
    print(f"Keystream removed: {stripped}")
    letter_text = checkerboard_decode(stripped)
    print(f"Checkerboard decoded: {letter_text}")
    flag = postprocess(letter_text)
    print(f"Flag: {flag}")
