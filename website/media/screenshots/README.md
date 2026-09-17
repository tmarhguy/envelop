# Published screenshot derivatives

The Infinix files are optimized WebP derivatives of the sanitized originals in
`../../../docs/images/infinix/`. Published derivatives are RGB WebP with no
EXIF, XMP, ICC, comment, or application metadata.

The root README uses `../envelop-demo.gif` as its animated hero, linked to
`../envelop-demo.mp4`. The 640 × 432, 8 fps GIF is derived from the 14.7-second
root demo and remains below 2 MB. It shows the browser experience, not current
bridge availability or physical execution.

Approved derivatives:

- `envelop-landing-infinix.webp` — responsive landing page;
- `envelop-name-entry-infinix.webp` — mobile name entry;
- `envelop-conversation-list-unread-infinix.webp` — verified Tomato and unread
  state;
- `envelop-offline-queue-infinix.webp` — offline queue notice;
- `envelop-typing-infinix.webp` — typing feedback;
- `envelop-composer-gboard-infinix.webp` — real Infinix viewport with Gboard;
- `envelop-virtual-result-infinix.webp` — explicitly virtual chat preview;
- `envelop-compute-result-infinix.webp` — interpreted compute request and
  explicitly virtual result;
- `envelop-terminal-fallback-infinix.webp` — terminal hardware error and
  separate virtual fallback action;
- `envelop-home-desktop.webp` — desktop homepage proof;
- `envelop-name-entry-desktop.webp` — desktop chat entry;
- `envelop-browser-chat.webp` — deterministic local browser state matching the
  short exchange visible in the Tomato capture; no backend data was written;
- `envelop-tomato-fpga-framebuffer.webp` — supplied FPGA framebuffer capture
  of Envelop inside Tomato OS.
- `envelop-tomato-frameport.webp` — 1280 × 838 optimized derivative of the
  supplied FramePort capture used in the root README; physical evidence for its
  recorded setup, not current-online evidence.

The landing page pairs the synthetic verified/unread frame with the explicitly
virtual result; status uses the offline-queue and terminal-fallback frames;
platforms uses the Gboard composer frame. Other approved derivatives remain
catalog assets rather than decoration.

Do not caption a staged image as a delivered message, deployed service result,
or physical Tomato result. The mobile originals were rendered in Chrome 150 on
an ADB-connected Infinix X6831; connection identifiers are intentionally
omitted.
