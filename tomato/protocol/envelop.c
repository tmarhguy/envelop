#include "envelop.h"
#include <string.h>
static uint16_t word(const uint8_t *p) { return (uint16_t)((uint16_t)p[0] << 8 | p[1]); }
static uint16_t crc(const uint8_t *p, size_t n) {
    uint16_t result = 0xffff;
    for (size_t i=0; i<n; ++i) {
        result ^= (uint16_t)((uint16_t)p[i] << 8);
        for (unsigned b=0;b<8;++b) result = (uint16_t)((result & 0x8000) ? (result << 1)^0x1021 : result << 1);
    }
    return result;
}
void envelop_reset(envelop_parser *p) { p->used=0; }
static void discard(envelop_parser *p, size_t n) { p->used-=n; memmove(p->bytes,p->bytes+n,p->used); }
static int valid_type(uint8_t type) { return (type>=1 && type<=12) || type==32 || type==33; }
void envelop_feed(envelop_parser *p, const uint8_t *bytes, size_t length, envelop_frame_fn callback, void *context) {
    for (size_t i=0;i<length;++i) {
        p->bytes[p->used++]=bytes[i];
        while (p->used>=2) {
            if (p->bytes[0]!=0x50 || p->bytes[1]!=0x47) { discard(p,1); continue; }
            if (p->used<8) break;
            size_t n=word(p->bytes+6);
            if (p->bytes[2]!=1 || !valid_type(p->bytes[3]) || n>ENVELOP_MAX_PAYLOAD) { discard(p,1); continue; }
            if (p->used<n+10) break;
            if (crc(p->bytes,n+8)!=word(p->bytes+n+8)) { discard(p,1); continue; }
            if (callback) callback(context,p->bytes[3],word(p->bytes+4),p->bytes+8,n);
            discard(p,n+10);
        }
    }
}
size_t envelop_encode(uint8_t type,uint16_t route,const uint8_t *payload,size_t length,uint8_t *out,size_t capacity) {
    if (!valid_type(type) || length>ENVELOP_MAX_PAYLOAD || capacity<length+10 || (!payload && length) || !out) return 0;
    out[0]=0x50;out[1]=0x47;out[2]=1;out[3]=type;
    out[4]=(uint8_t)(route>>8);out[5]=(uint8_t)route;out[6]=(uint8_t)(length>>8);out[7]=(uint8_t)length;
    if (length) memcpy(out+8,payload,length);
    uint16_t sum=crc(out,length+8);out[length+8]=(uint8_t)(sum>>8);out[length+9]=(uint8_t)sum;
    return length+10;
}
