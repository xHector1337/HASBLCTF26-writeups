#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>

#ifdef _WIN32
  #include <winsock2.h>
  #pragma comment(lib, "ws2_32.lib")
#else
  #include <arpa/inet.h>
#endif

#define TAPS 0x80200003UL

static uint32_t g_state[2];

static inline uint32_t lfsr_step(uint32_t s)
{
    return (s & 1u) ? ((s >> 1) ^ TAPS) : (s >> 1);
}

static uint8_t ks_byte(void)
{
    uint8_t out = 0;
    int i;
    for (i = 0; i < 8; i++) {
        g_state[0] = lfsr_step(g_state[0]);
        g_state[1] = lfsr_step(g_state[1]);
        out = (uint8_t)((out << 1) | ((g_state[0] ^ g_state[1]) & 1u));
    }
    return out;
}

static void init_cipher(uint64_t key)
{
    uint32_t hi = (uint32_t)(key >> 32);
    uint32_t lo = (uint32_t)(key & 0xFFFFFFFFULL);

    g_state[0] = htonl(hi);
    g_state[1] = lo;
}

static void process(FILE *fin, FILE *fout)
{
    int c;
    while ((c = fgetc(fin)) != EOF) {
        uint8_t k = ks_byte();
        fputc((unsigned char)(c ^ k), fout);
    }
}

static uint64_t parse_key(const char *s)
{
    uint64_t k = 0; 
    if (s[0] == '0' && (s[1] == 'x' || s[1] == 'X'))
        s += 2;
    while (*s) {
        char c = *s++;
        uint8_t nibble;
        if      (c >= '0' && c <= '9') nibble = (uint8_t)(c - '0');
        else if (c >= 'a' && c <= 'f') nibble = (uint8_t)(c - 'a' + 10);
        else if (c >= 'A' && c <= 'F') nibble = (uint8_t)(c - 'A' + 10);
        else { fprintf(stderr, "Invalid key character: %c\n", c); exit(1); }
        k = (k << 4) | nibble;
    }
    return k;
}

int main(int argc, char *argv[])
{
    if (argc != 4) {
        fprintf(stderr, "Usage: %s <hex-key> <infile> <outfile>\n", argv[0]);
        return 1;
    }

    uint64_t key = parse_key(argv[1]);

    FILE *fin  = fopen(argv[2], "rb");
    FILE *fout = fopen(argv[3], "wb");

    if (!fin  ) { perror(argv[2]); return 1; }
    if (!fout ) { perror(argv[3]); return 1; }

    init_cipher(key);
    process(fin, fout);

    fclose(fin);
    fclose(fout);
    return 0;
}
