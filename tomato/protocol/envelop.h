#ifndef ENVELOP_H
#define ENVELOP_H
#include <stdint.h>
#include <stddef.h>
#define ENVELOP_MAX_PAYLOAD 512
#define ENVELOP_MAX_FRAME (ENVELOP_MAX_PAYLOAD + 10)
typedef struct { uint8_t bytes[ENVELOP_MAX_FRAME]; size_t used; } envelop_parser;
typedef void (*envelop_frame_fn)(void *context, uint8_t type, uint16_t route, const uint8_t *payload, size_t length);
void envelop_reset(envelop_parser *parser);
void envelop_feed(envelop_parser *parser, const uint8_t *bytes, size_t length, envelop_frame_fn callback, void *context);
size_t envelop_encode(uint8_t type, uint16_t route, const uint8_t *payload, size_t length, uint8_t *output, size_t capacity);
#endif
