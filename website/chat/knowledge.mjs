const freezeTree = value => {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) freezeTree(child);
  }
  return value;
};

const ask = (label, value) => ({type: 'ask', label, value});
const compute = (label, value) => ({type: 'compute', label, value});
const link = (label, href) => ({type: 'link', label, href});
const source = (label, href) => ({label, href});

export const LINKS = freezeTree({
  tomato: 'https://tomato.tmarhguy.com/',
  tomatoStatus: 'https://tomato.tmarhguy.com/status.html',
  tomatoArchitecture: 'https://tomato.tmarhguy.com/architecture.html',
  tomatoIsa: 'https://tomato.tmarhguy.com/isa.html',
  tomatoOs: 'https://tomato.tmarhguy.com/os.html',
  tomatoCompute: 'https://tomato.tmarhguy.com/compute.html',
  tomatoVerification: 'https://tomato.tmarhguy.com/verification.html',
  tomatoVirtual: 'https://tomato.tmarhguy.com/virtual.html',
  tomatoSource: 'https://github.com/tmarhguy/tomato',
  envelop: 'https://tmarhguy.github.io/envelop/',
  envelopStatus: '../status.html',
  envelopPrivacy: '../privacy.html',
  envelopSource: './knowledge.mjs',
  tyrone: 'https://tmarhguy.com/',
  tyroneAbout: 'https://tmarhguy.com/about/',
  tyroneProjects: 'https://tmarhguy.com/projects/',
  tyroneWikipedia: 'https://en.wikipedia.org/wiki/Tyrone_Marhguy',
  frameport: 'https://github.com/tmarhguy/frameport',
  udpStack: 'https://github.com/tmarhguy/udp-stack',
});

const common = {
  tomato: source('Tomato project', LINKS.tomato),
  tomatoStatus: source('Tomato status', LINKS.tomatoStatus),
  architecture: source('Tomato architecture', LINKS.tomatoArchitecture),
  isa: source('Tomato ISA', LINKS.tomatoIsa),
  os: source('Tomato OS', LINKS.tomatoOs),
  compute: source('Envelop compute boundary', LINKS.tomatoCompute),
  verification: source('Tomato verification', LINKS.tomatoVerification),
  envelop: source('Envelop', LINKS.envelop),
  privacy: source('Envelop privacy', LINKS.envelopPrivacy),
  tyrone: source('Tyrone Marhguy', LINKS.tyroneAbout),
};

const baseCards = {
  tomato: {
    answer: 'Tomato is Tyrone Marhguy’s custom 32-bit computer architecture: a complete FPGA computer, a browser ISA emulator, and an in-progress discrete build centered on a Dual-LUT ALU.',
    provenance: common.tomato,
    actions: [ask('Is it real hardware?', 'Is Tomato real hardware?'), ask('See its architecture', 'How does Tomato work?'), link('Explore Tomato', LINKS.tomato)],
  },
  tyrone: {
    answer: 'Tyrone Marhguy is a Ghanaian Computer Engineering student at Penn who builds computer systems from transistor logic through RTL, FPGA, and physical chip design. He designed Tomato and Envelop.',
    provenance: common.tyrone,
    actions: [ask('What has he built?', 'What other projects has Tyrone built?'), ask('Open-source work', 'What open-source projects has Tyrone contributed to?'), link('Public biography', LINKS.tyroneWikipedia)],
  },
  tyroneProjects: {
    answer: 'Past builds include Tomato, a 100 Mbps FPGA UDP/IP stack, a 22 nm SRAM macro, a Sky130 BFloat16 MAC, a NASDAQ hardware parser, an 8-bit transistor ALU, FramePort, and hardware/software tooling.',
    provenance: source('Tyrone’s projects', LINKS.tyroneProjects),
    actions: [ask('100 Mbps UDP/IP stack', 'What is Tyrone’s UDP stack?'), ask('What is FramePort?', 'What is FramePort?'), ask('Open-source contributions', 'What has Tyrone contributed to open source?'), link('Browse all projects', LINKS.tyroneProjects)],
  },
  openSource: {
    answer: 'Tyrone has published fixes for LibreLane synthesis checks, Verilator Linux memory statistics, OpenROAD LEF58 parsing, and OpenFPGA documentation and interconnect examples.',
    provenance: source('Published contribution links', 'https://tmarhguy.com/projects/#open-source-title'),
    actions: [link('Contribution links', 'https://tmarhguy.com/projects/#open-source-title'), ask('Past projects', 'What other projects has Tyrone built?'), ask('What is Tomato?', 'What is Tomato?')],
  },
  udpStack: {
    answer: 'Tyrone’s UDP stack is a 100 Mbps FPGA networking design covering RMII, Ethernet MAC, ARP, IPv4, and UDP, with a published sub-200 ns loopback target and cocotb verification.',
    provenance: source('UDP/IP stack source', LINKS.udpStack),
    actions: [link('Inspect the UDP stack', LINKS.udpStack), ask('Past projects', 'What other projects has Tyrone built?'), ask('How does Envelop communicate?', 'How does a message reach Tomato?')],
  },
  envelop: {
    answer: 'Envelop is a browser messenger around Tomato. It queues messages and bounded compute jobs through a nearby verified bridge, and labels browser execution separately as Virtual Tomato.',
    provenance: common.envelop,
    actions: [ask('How messages travel', 'How does a message reach Tomato?'), ask('Physical or Virtual?', 'What is the difference between Physical and Virtual Tomato?'), link('How Envelop works', LINKS.envelop)],
  },
  tryTomato: {
    answer: 'Use Envelop’s browser chat for source-backed questions, messages, and bounded compute. Use Virtual Tomato to explore the full Tomato OS manually; virtual execution remains clearly labeled as browser emulation.',
    provenance: common.envelop,
    actions: [compute('Run 23 + 19', '23 + 19'), link('Open Virtual Tomato', LINKS.tomatoVirtual), ask('What can I ask?', 'What can you do?')],
  },
  distribution: {
    answer: 'There is no documented retail Tomato computer or public native Envelop app. The browser experience is public, and Tomato’s hardware, software, documentation, and build sources are available for study.',
    provenance: source('Envelop platforms', '../platforms.html'),
    actions: [link('Public platforms', '../platforms.html'), link('Tomato source', LINKS.tomatoSource), link('Run Virtual Tomato', LINKS.tomatoVirtual)],
  },
  sources: {
    answer: 'Tomato’s public repository contains its RTL, boards, ISA, assembler, OS, emulator, and tests. Envelop’s deployed behavior rules are directly inspectable as JavaScript, with status and architecture pages describing their boundaries.',
    provenance: source('Tomato source', LINKS.tomatoSource),
    actions: [link('Tomato repository', LINKS.tomatoSource), link('Inspect behavior rules', './knowledge.mjs'), link('Current Tomato status', LINKS.tomatoStatus)],
  },
  learning: {
    answer: 'Start with current status, then architecture, ISA, Tomato OS, compute boundaries, and verification. The dated project journal is useful for history, but current source and status take precedence.',
    provenance: source('Tomato documentation', 'https://github.com/tmarhguy/tomato/blob/main/docs/README.md'),
    actions: [link('Current status', LINKS.tomatoStatus), link('Architecture', LINKS.tomatoArchitecture), link('Verification', LINKS.tomatoVerification)],
  },
  frameport: {
    answer: 'FramePort is Tyrone’s VS Code extension for viewing HDMI or USB capture, inspecting pixels, saving PNG screenshots, and recording silent MP4. Device capture is currently macOS-only; test patterns work elsewhere.',
    provenance: source('FramePort source', LINKS.frameport),
    actions: [link('Explore FramePort', LINKS.frameport), ask('Can I see Tomato’s screen?', 'Can I see Tomato’s screen?'), ask('Who is Tyrone?', 'Who is Tyrone Marhguy?')],
  },
  capability: {
    answer: 'Here you can ask source-backed questions about Tomato and Tyrone, send Tomato a message, or run bounded 32-bit arithmetic, logic, memory, and raw compute programs. This deterministic layer does not generate answers with AI.',
    provenance: common.compute,
    actions: [compute('Run 23 + 19', '23 + 19'), ask('Browse Tomato programs', 'What programs are on Tomato?'), ask('See compute limits', 'What are the compute limits?')],
  },
  hardware: {
    answer: 'Yes. The complete Tomato computer runs on a Nexys A7 FPGA. A physical 8-bit discrete Dual-LUT ALU slice is also assembled; the complete discrete computer is not finished.',
    provenance: common.tomatoStatus,
    actions: [ask('Physical vs Virtual', 'What is the difference between Physical and Virtual Tomato?'), ask('What remains discrete?', 'How much of discrete Tomato is complete?'), link('Inspect current evidence', LINKS.tomatoStatus)],
  },
  discrete: {
    answer: 'The assembled discrete hardware is an 8-bit Dual-LUT ALU slice. Register, memory, control, and peripheral boards remain in progress; the FPGA is the complete running Tomato computer.',
    provenance: common.tomatoStatus,
    actions: [link('See hardware status', LINKS.tomatoStatus), ask('What is FPGA Tomato?', 'What is FPGA Tomato?'), ask('How is it verified?', 'How is Tomato verified?')],
  },
  fpga: {
    answer: 'FPGA Tomato is the complete machine implemented for a Nexys A7-100T: CPU, memory, framebuffer, keypad, DVI output, compiler FSM, radio mailbox, and Tomato OS.',
    provenance: common.tomatoStatus,
    actions: [ask('What OS runs?', 'What operating system does Tomato run?'), ask('How fast is it?', 'How fast is Tomato?'), link('FPGA source', 'https://github.com/tmarhguy/tomato/tree/main/hardware/fpga/core')],
  },
  availability: {
    answer: 'Repository files cannot prove Tomato is online now. Physical availability requires a current authenticated bridge lease after exact ENVELOP/1 identity verification; the status shown in chat is the live evidence.',
    provenance: source('Envelop status contract', LINKS.envelopStatus),
    actions: [link('Read status definitions', LINKS.envelopStatus), ask('How does the bridge work?', 'How does Envelop reach hardware?'), ask('What if it times out?', 'What happens if hardware times out?')],
  },
  location: {
    answer: 'Tomato’s firmware describes a dorm table as home, but repository source does not establish a current physical location. Envelop only relies on the live verified-bridge state shown in chat.',
    provenance: source('Tomato status boundary', LINKS.tomatoStatus),
    actions: [ask('Is it online?', 'Is Physical Tomato online right now?'), ask('How the route works', 'How does Envelop reach hardware?'), link('Read current status', LINKS.tomatoStatus)],
  },
  physicalVirtual: {
    answer: 'Physical Tomato means a completed backend job returned through the verified FPGA route. Virtual Tomato is functional browser ISA emulation—not RTL and not hardware. Envelop labels the two paths separately.',
    provenance: common.compute,
    actions: [link('Run Virtual Tomato', LINKS.tomatoVirtual), ask('How is physical proven?', 'What makes a result Physical Tomato?'), ask('What happens on timeout?', 'What happens if hardware times out?')],
  },
  architecture: {
    answer: 'Tomato is a 32-bit multi-cycle Von Neumann machine. Its main path is program counter → unified memory → instruction register → three-read/one-write register file → Dual-LUT ALU, shifter, or multiply/divide unit → writeback or memory. Framebuffer, input, timer, compiler, and radio are memory-mapped around that core.',
    provenance: common.architecture,
    actions: [ask('Why Dual-LUT?', 'Why did Tomato use a Dual-LUT ALU?'), ask('Why 256 registers?', 'Why does Tomato have 256 registers?'), ask('Instruction layout', 'How is a Tomato instruction laid out?'), link('Architecture diagram', LINKS.tomatoArchitecture)],
  },
  alu: {
    answer: 'Tomato’s Dual-LUT ALU makes the logic function programmable instead of dedicating separate hardware to each named operation. Every output bit evaluates two three-input truth tables, then adds their 32-bit results with carry: out = f(A,B,C) + g(A,B,C) + carry. Arithmetic, Boolean logic, and useful composed operations can share that same path.',
    provenance: common.architecture,
    actions: [ask('How many settings?', 'Does Tomato have 524288 instructions?'), ask('What are composed operations?', 'What are masks and composed operations?'), link('Try the ALU playground', 'https://tomato.tmarhguy.com/playground.html')],
  },
  aluSettings: {
    answer: 'A three-input LUT has eight input combinations, so its eight output bits describe 2⁸ = 256 possible Boolean functions. Tomato selects two LUTs and one of eight carry sources: 256 × 256 × 8 = 524,288 control combinations. This is a configuration space, with duplicate behaviors possible; the installed ISA names 61 instructions plus NOP.',
    provenance: common.isa,
    actions: [ask('Installed instructions', 'How many Tomato instructions are there?'), ask('How the ALU works', 'What makes Tomato’s ALU unusual?'), link('Read the ISA', LINKS.tomatoIsa)],
  },
  instructionCount: {
    answer: 'The current Tomato ISA has 61 instructions plus NOP: 62 burned rows in a 512-row control ROM. The larger 524,288 number describes possible ALU controls, not installed instructions.',
    provenance: common.isa,
    actions: [link('Inspect the ISA', LINKS.tomatoIsa), ask('Why 524,288?', 'Does Tomato have 524288 instructions?'), ask('What can Envelop run?', 'Which raw instructions can Envelop run?')],
  },
  registers: {
    answer: 'Full FPGA Tomato has 256 × 32-bit register entries: each instruction’s five-bit register fields select one of 32 entries, while a three-bit bank selects one of eight banks. That 32 × 8 structure fits the 32-bit instruction design and gives software named spill space without widening the datapath. Envelop exposes only R0 through R7 as private job registers.',
    provenance: source('32-bit register design note', 'https://github.com/tmarhguy/tomato/blob/main/docs/log/2026-07-31%20-%20Falling%20back%20to%2032b.md'),
    actions: [ask('Instruction layout', 'How is a Tomato instruction laid out?'), ask('Sandbox registers', 'How many registers can I use here?'), ask('What is r0?', 'Is Tomato r0 always zero?'), link('Inspect the register design', LINKS.tomatoArchitecture)],
  },
  instructionWord: {
    answer: 'A Tomato instruction is one 32-bit word. Nine bits select one of 512 control-ROM rows; four five-bit fields provide register-shaped operands; and three bank bits select a register bank. Immediate, branch, and jump classes overlay those low fields differently, so one word format serves several instruction shapes.',
    provenance: common.architecture,
    actions: [ask('Why 256 registers?', 'Why does Tomato have 256 registers?'), ask('Installed instructions', 'How many Tomato instructions are there?'), ask('Memory map', 'How is Tomato memory mapped?'), link('Read the ISA', LINKS.tomatoIsa)],
  },
  sandboxRegisters: {
    answer: 'Envelop compute exposes R0 through R7 as eight private, writable virtual registers. They are cleared for each job and are not the same as Tomato’s full banked physical register file.',
    provenance: common.compute,
    actions: [compute('Run a register program', '/run; R0=23; R1=19; ADD R0,R0,R1; RETURN R0'), ask('Private memory', 'What memory can an Envelop program access?'), ask('Full Tomato registers', 'How many registers does Tomato have?')],
  },
  zeroRegister: {
    answer: 'In full FPGA Tomato, index-zero in every register bank reads as zero and ignores writes. Envelop’s sandbox R0 is different: it is a writable virtual register used by remote jobs.',
    provenance: common.tomatoStatus,
    actions: [ask('Full register count', 'How many registers does Tomato have?'), ask('Sandbox limits', 'What are the compute limits?'), link('Inspect architecture', LINKS.tomatoArchitecture)],
  },
  memory: {
    answer: 'Full FPGA Tomato has 16,384 32-bit RAM words—64 KiB—plus memory-mapped framebuffer and peripheral windows. Envelop jobs cannot access those areas.',
    provenance: common.architecture,
    actions: [ask('Sandbox memory', 'What memory can an Envelop program access?'), ask('Framebuffer', 'How does Tomato’s framebuffer work?'), link('Architecture map', LINKS.tomatoArchitecture)],
  },
  sandboxMemory: {
    answer: 'Each Envelop job gets 256 private 32-bit memory words at offsets 0 through 255. The area is cleared before valid execution and cannot reach Tomato OS RAM, the framebuffer, MMIO, or radio state.',
    provenance: common.compute,
    actions: [compute('Store and load', '/run; R0=42; STORE [7],R0; LOAD R1,[7]; RETURN R1'), ask('All compute limits', 'What are the compute limits?'), ask('Full Tomato memory', 'How much memory does Tomato have?')],
  },
  os: {
    answer: 'Tomato runs TOMATO OS v3.0, written in Tomato assembly. Its current desktop exposes 14 menu entries; Desktop v1.2 is the interface revision, not a different OS version.',
    provenance: common.os,
    actions: [ask('List all 14 programs', 'What programs are on Tomato?'), link('Run Virtual Tomato', LINKS.tomatoVirtual), link('Read the OS guide', LINKS.tomatoOs)],
  },
  programs: {
    answer: 'Tomato OS v3.0 has 14 entries: System info, Tribonacci, Font chart, Keypad test, Fibonacci, Snake, Tetris, About Tomato, Memory map, Sudoku, ALU Studio, Racer, Compiler, and Envelop.',
    provenance: common.os,
    actions: [ask('Tell me about Snake', 'What is Snake on Tomato?'), ask('What is ALU Studio?', 'What is ALU Studio?'), link('Explore in Virtual Tomato', LINKS.tomatoVirtual)],
  },
  screen: {
    answer: 'Tomato renders an 80×60 character-cell framebuffer through a 640×480 DVI-style display path. Envelop has published captures, but this chat cannot stream or remotely control the live physical screen.',
    provenance: common.architecture,
    actions: [link('Run Virtual Tomato', LINKS.tomatoVirtual), link('Read the OS display guide', LINKS.tomatoOs), ask('What is FramePort?', 'What is FramePort?')],
  },
  speed: {
    answer: 'The FPGA CPU defaults to 6.25 MHz from a 100 MHz board oscillator; the pixel clock is 25 MHz. Throughput depends on each instruction’s cycle count, so one clock figure is not a universal performance claim.',
    provenance: common.tomatoStatus,
    actions: [ask('Architecture', 'How does Tomato work?'), ask('Verification', 'How is Tomato verified?'), link('Current status', LINKS.tomatoStatus)],
  },
  numbers: {
    answer: 'Envelop compute uses 32-bit bit patterns. Literals may be decimal, hexadecimal with 0x, or binary with 0b, from −2³¹ through 2³²−1. Results are shown as unsigned decimal and eight-digit hexadecimal.',
    provenance: common.compute,
    actions: [ask('Negative numbers', 'How do negative numbers work?'), compute('Compare literal forms', '42 + 0x2A + 0b101010'), compute('Wrap past 32 bits', '4294967295 + 1')],
  },
  negative: {
    answer: 'Negative literals use two’s-complement 32-bit encoding. Bitwise operations act on that bit pattern, so −1 is 0xFFFFFFFF and −1 & 0xFF produces 0x000000FF.',
    provenance: common.compute,
    actions: [compute('Try −1 & 0xFF', '-1 & 0xFF'), ask('Overflow behavior', 'What happens when a result overflows 32 bits?'), ask('Number formats', 'How are integers represented?')],
  },
  overflow: {
    answer: 'Arithmetic wraps modulo 2³². For example, 4,294,967,295 + 1 becomes 0, while 0 − 1 becomes the bit pattern 0xFFFFFFFF.',
    provenance: common.compute,
    actions: [compute('Try unsigned wrap', '4294967295 + 1'), compute('Try subtraction wrap', '0 - 1'), ask('Negative values', 'How do negative numbers work?')],
  },
  operators: {
    answer: 'The shared native compute ABI supports SET, ADD, SUB, AND, OR, XOR, MASKADD, XORAND, ANDADD, ORADD, XORADD, ANDN, ORN, private LOAD/STORE, and final RETURN. Higher-level NOT, NAND, NOR, and XNOR lower into those primitives.',
    provenance: common.compute,
    actions: [ask('Masks and composed work', 'What are masks and composed operations?'), ask('Why no modulo?', 'Does Envelop support modulo percent?'), ask('Raw program syntax', 'Which raw instructions can Envelop run?')],
  },
  masks: {
    answer: 'Masks select bits with AND. Envelop also exposes Dual-LUT-shaped forms: MASKADD(a,b,c)=a+(b&c), XORAND=(a^b^c)+(a&b&c), ANDADD=(a&b)+c, ORADD=(a|b)+c, XORADD=(a^b)+c, ANDN=a&~b, and ORN=a|~b. Results wrap to 32 bits.',
    provenance: common.compute,
    actions: [compute('Try MASKADD', 'maskadd(8, 13, 5)'), compute('Try XORAND', 'xorand(0xF0, 0xAA, 0x0F)'), ask('Why Dual-LUT?', 'What makes Tomato’s ALU unusual?')],
  },
  multiplication: {
    answer: 'The browser compiler accepts multiplication only when at least one factor is a non-negative constant, then lowers it into ADD operations that Tomato executes. Arbitrary register-by-register multiplication is not an Envelop bytecode operation.',
    provenance: common.compute,
    actions: [compute('Try 34 × 3', '34 * 3'), ask('Division support', 'Does Envelop support division?'), ask('Native operations', 'Which operators are supported?')],
  },
  division: {
    answer: 'Browser compute accepts only two non-negative constants with a nonzero divisor and a quotient small enough for the 32-instruction budget. It unrolls bounded subtraction; dynamic division is not an Envelop bytecode operation.',
    provenance: common.compute,
    actions: [compute('Try bounded division', '345 / 345'), ask('Why no modulo?', 'Does Envelop support modulo percent?'), ask('Compute limits', 'What are the compute limits?')],
  },
  modulo: {
    answer: 'General % is not supported by the current Envelop bytecode ABI. Dynamic remainder needs comparison and control flow or a native remainder operation, so Envelop rejects it instead of guessing or changing Tomato OS.',
    provenance: common.compute,
    actions: [compute('Use a power-of-two mask', '345 & 0xFF'), ask('How masks work', 'What are masks and composed operations?'), ask('Supported operators', 'Which operators are supported?')],
  },
  computeLimits: {
    answer: 'A job gets eight private registers, 256 private 32-bit memory words, at most 32 straight-line records, and a mandatory final RETURN. It cannot use loops, branches, arbitrary machine code, raw LUT controls, OS memory, framebuffer, or MMIO.',
    provenance: common.compute,
    actions: [ask('Raw instructions', 'Which raw instructions can Envelop run?'), compute('Run a bounded program', '/run; R0=42; RETURN R0'), link('Read the boundary', LINKS.tomatoCompute)],
  },
  rawInstructions: {
    answer: 'Raw /run accepts SET, ADD, SUB, AND, OR, XOR, MASKADD, XORAND, ANDADD, ORADD, XORADD, ANDN, ORN, LOAD, STORE, and final RETURN, plus reviewed aliases such as LI, LD, ST, MOV, and CLR.',
    provenance: common.compute,
    actions: [compute('Run ADD', '/run; R0=23; R1=19; ADD R0,R0,R1; RETURN R0'), compute('Run memory', '/run; R0=42; STORE [7],R0; LOAD R1,[7]; RETURN R1'), ask('Sandbox limits', 'What are the compute limits?')],
  },
  compiler: {
    answer: '“Compiler” can mean three different things here: Envelop’s deterministic language-to-bytecode compiler, Tomato’s assembler, or the Tomato OS Compiler app that searches 65,536 LUT pairs for one fixed input/output example.',
    provenance: common.os,
    actions: [ask('Compiler menu app', 'What does the Compiler program on Tomato do?'), ask('Is Envelop AI?', 'Does Envelop use AI?'), link('Try the LUT playground', 'https://tomato.tmarhguy.com/playground.html')],
  },
  deterministic: {
    answer: 'Envelop runs without AI. It was designed as deterministic software: reviewed rules select source-linked answers, and its controlled compiler emits inspectable Tomato bytecode.',
    provenance: source('Envelop source', LINKS.envelopSource),
    actions: [ask('How it routes a question', 'How does this deterministic chat work?'), link('Inspect the source', LINKS.envelopSource), ask('How compute is verified', 'How is Tomato verified?')],
  },
  deterministicRoute: {
    answer: 'Input is normalized, checked against explicit tested rules, then routed to a reviewed answer, a supported action, deterministic compute compilation, or a clear fallback. The same input, state, and version take the same path.',
    provenance: source('Behavior source', './knowledge.mjs'),
    actions: [ask('Is this AI?', 'Does Envelop use AI?'), ask('Compute language', 'How does Envelop understand calculations?'), link('Inspect the rules', './knowledge.mjs')],
  },
  messagePath: {
    answer: 'A message travels from the browser to a durable backend queue, then through a nearby verified bridge to Envelop inside Tomato OS. Replies return through the same labeled route.',
    provenance: common.envelop,
    actions: [ask('What delivered means', 'Does delivered mean Tomato read it?'), ask('What online means', 'Is Physical Tomato online right now?'), link('See the architecture', LINKS.envelop)],
  },
  bridge: {
    answer: 'The nearby bridge holds an authenticated backend lease, connects to Tomato over BLE UART, and verifies the exact ENVELOP/1 device identity before carrying frames. That identity check is not cryptographic attestation.',
    provenance: source('Envelop architecture', '../#path'),
    actions: [ask('Message path', 'How does a message reach Tomato?'), ask('Online meaning', 'What does online mean in Envelop?'), link('Read the architecture', '../#path')],
  },
  delivered: {
    answer: 'No. Delivered means Tomato acknowledged the frame and the bridge recorded backend acceptance. Envelop does not currently define a separate human read receipt.',
    provenance: source('Envelop status contract', LINKS.envelopStatus),
    actions: [ask('How messages travel', 'How does a message reach Tomato?'), ask('Delivery reliability', 'Is Envelop delivery exactly once?'), link('Read status definitions', LINKS.envelopStatus)],
  },
  deliveryReliability: {
    answer: 'Delivery is not globally exactly once. Retries are deduplicated within the active session, but reconnect or power loss can allow repeated display. The documented behavior is bounded retry with session-local deduplication.',
    provenance: source('Envelop status contract', LINKS.envelopStatus),
    actions: [ask('What delivered means', 'Does delivered mean Tomato read it?'), ask('Timeout behavior', 'What happens if hardware times out?'), link('Read status definitions', LINKS.envelopStatus)],
  },
  timeout: {
    answer: 'A hardware timeout means the outcome is unknown. Envelop does not silently replay that job virtually; Virtual Tomato becomes a separate explicit action only after a confirmed terminal non-result.',
    provenance: common.compute,
    actions: [ask('Physical vs Virtual', 'What is the difference between Physical and Virtual Tomato?'), link('Read compute provenance', LINKS.tomatoCompute), ask('Is Tomato online?', 'Is Physical Tomato online right now?')],
  },
  privacy: {
    answer: 'Envelop is not end-to-end encrypted. Messages and operational state are readable application data, so do not send secrets. The privacy page lists stored identity, conversations, messages, presence, bridge, and compute state.',
    provenance: common.privacy,
    actions: [link('Read the privacy policy', LINKS.envelopPrivacy), ask('What data is stored?', 'What data does Envelop store?'), ask('How do I delete data?', 'How do I delete my Envelop data?')],
  },
  storedData: {
    answer: 'Envelop stores the anonymous profile and display name, conversations, messages, queue and delivery state, presence, bridge leases, and compute jobs/results needed to operate the service.',
    provenance: common.privacy,
    actions: [ask('Delete my data', 'How do I delete my Envelop data?'), ask('Is it encrypted?', 'Is Envelop end-to-end encrypted?'), link('Privacy details', LINKS.envelopPrivacy)],
  },
  deleteData: {
    answer: '“Leave Envelop” requests deletion of your profile and related chats. “Forget this identity” only clears this browser’s local credentials; closing the tab is not a deletion request.',
    provenance: common.privacy,
    actions: [link('Read deletion details', LINKS.envelopPrivacy), ask('Stored data', 'What data does Envelop store?'), ask('Privacy boundary', 'Is Envelop end-to-end encrypted?')],
  },
  verification: {
    answer: 'Evidence is target-specific: directed and random RTL tests, OS and whole-machine simulations, ALU formal checks, a recorded 130-billion-vector ALU run, FPGA display recordings, and physical ALU-board photographs. None proves current online availability or a complete discrete CPU.',
    provenance: common.verification,
    actions: [link('Inspect verification', LINKS.tomatoVerification), ask('Whole CPU formal?', 'Is the whole Tomato CPU formally verified?'), ask('Current availability', 'Is Physical Tomato online right now?')],
  },
  formal: {
    answer: 'No whole-CPU formal proof is claimed. Formal checks cover stated ALU properties; whole-machine confidence currently comes from focused RTL simulation, OS tests, ISA checks, and FPGA evidence.',
    provenance: common.verification,
    actions: [link('Verification scope', LINKS.tomatoVerification), ask('Other evidence', 'How is Tomato verified?'), ask('Can I build it?', 'Can I build Tomato?')],
  },
  build: {
    answer: 'Yes. Tomato’s repository includes schematics, KiCad boards, FPGA RTL, ISA tables, assembler, OS assembly, browser emulation, tests, and open-source build flows. A successful build still does not prove a board is programmed now.',
    provenance: source('Tomato source', LINKS.tomatoSource),
    actions: [link('Open Tomato source', LINKS.tomatoSource), link('Read architecture', LINKS.tomatoArchitecture), ask('Verification evidence', 'How is Tomato verified?')],
  },
  assistantIdentity: {
    answer: 'This local voice is Envelop’s deterministic response program. Tomato is the 32-bit computer that receives messages and executes the labeled jobs.',
    provenance: source('Envelop source', LINKS.envelopSource),
    actions: [ask('What is Tomato?', 'What is Tomato?'), ask('Why no AI?', 'Does Envelop use AI?'), link('Inspect Envelop', LINKS.envelopSource)],
  },
  memoryBoundary: {
    answer: 'I only use the profile and conversation state Envelop actually stores. I do not infer private facts, and this deterministic answer layer has no learned memory or hidden personal model.',
    provenance: common.privacy,
    actions: [ask('What data is stored?', 'What data does Envelop store?'), link('Read privacy details', LINKS.envelopPrivacy), ask('Is this AI?', 'Does Envelop use AI?')],
  },
  thanks: {
    answer: 'You’re welcome. Try another calculation or explore a Tomato topic whenever you’re ready.',
    provenance: source('Deterministic local response', LINKS.envelopSource),
    actions: [ask('What can I ask?', 'What can you do?'), compute('Run 23 + 19', '23 + 19'), link('Explore Tomato', LINKS.tomato)],
  },
  praise: {
    answer: 'Glad you’re enjoying it. You can inspect the instructions behind every calculation.',
    provenance: source('Deterministic local response', LINKS.envelopSource),
    actions: [ask('Show how it works', 'How does this deterministic chat work?'), link('Inspect the source', LINKS.envelopSource), ask('See verification', 'How is Tomato verified?')],
  },
  frustration: {
    answer: 'Let’s make this easier. Start with an example, or ask about a specific part of Tomato. I can help with calculations and the topics listed in Help.',
    provenance: source('Deterministic local response', LINKS.envelopSource),
    actions: [ask('What can I ask?', 'What can you do?'), ask('Browse programs', 'What programs are on Tomato?'), compute('Try a known job', '23 + 19')],
  },
  goodbye: {
    answer: 'See you next time. Your conversation will be here when you return.',
    provenance: source('Deterministic local response', LINKS.envelopSource),
    actions: [link('Explore Tomato', LINKS.tomato), link('Open Envelop home', LINKS.envelop)],
  },
  unknownPerson: {
    answer: 'I only have reviewed local identity answers for Tyrone Marhguy and the projects documented here. I will not invent a biography for an unknown person.',
    provenance: source('Deterministic scope', LINKS.envelopSource),
    actions: [ask('Who is Tyrone?', 'Who is Tyrone Marhguy?'), ask('What is Tomato?', 'What is Tomato?'), link('About Tyrone', LINKS.tyroneAbout)],
  },
  clarification: {
    answer: 'I do not have a source-backed local answer for that yet. Ask about Tyrone, Tomato, Envelop, Tomato OS programs, architecture, compute, verification, privacy, or the physical and virtual routes.',
    provenance: source('Deterministic scope', LINKS.envelopSource),
    actions: [ask('What can I ask?', 'What can you do?'), ask('Browse programs', 'What programs are on Tomato?'), ask('Who is Tyrone?', 'Who is Tyrone Marhguy?')],
  },
};

const programFacts = {
  'system-info': ['System info', 'summarizes Tomato’s architecture, Dual-LUT ALU, register file, immediates, shifter, and author. Left or Center returns to the menu.'],
  tribonacci: ['Tribonacci', 'iteratively explores the 0,0,1 sequence from T(0) through T(38). Up/Down changes n, Right adds 10, Enter resets, and Left exits.'],
  'font-chart': ['Font chart', 'shows all 256 project-specific 8-bit framebuffer glyph slots, including intentionally blank ROM entries. Left or Enter exits.'],
  'keypad-test': ['Keypad test', 'displays each five-button keypad input as a glyph and hexadecimal keycode. Left is shown and then returns to the menu.'],
  fibonacci: ['Fibonacci', 'iteratively explores F(0) through F(46), opening at F(10)=55. Up/Down changes the term, Right adds 10, Enter replays, and Left exits.'],
  snake: ['Snake', 'is a 40×20 tile game with food, scoring, wall and self collision, and a bounded body. Arrow keys steer, immediate reversal is blocked, and Enter exits or restarts after loss.'],
  tetris: ['Tetris', 'uses a 10×20 board, all seven tetrominoes, rotation, soft drop, collision, and multi-line clearing. It has no hard drop, wall kicks, or next-piece preview.'],
  'about-tomato': ['About Tomato', 'presents the project story, architecture summary, credits, and Penn attribution. Left or Center returns to the menu.'],
  'memory-map': ['Memory map', 'shows Tomato’s principal RAM, framebuffer, keypad/timer, compiler, and radio regions. It is an explanatory OS screen, not remote memory access.'],
  sudoku: ['Sudoku', 'contains one fixed 9×9 puzzle with immutable clues, value cycling, conflict checks, reset, and completion validation. “New puzzle” resets the same givens.'],
  'alu-studio': ['ALU Studio', 'compares native MASKADD or XORAND with reference instruction sequences. A changes from 0–255, Right switches operation, and B=13/C=5 stay fixed.'],
  racer: ['Racer', 'is a five-lane traffic-avoidance game with two cars, collision, restart, and a cars-passed score. Left/Right steers and Up advances traffic.'],
  compiler: ['Compiler', 'searches all 65,536 LUT-pair settings for the first match to one fixed A/B/C/carry/output example. It is not a language or assembly compiler.'],
  envelop: ['Envelop', 'is Tomato OS’s contacts and chat app. It handles messages and bounded compute frames, but remote users cannot inject keypad input or launch other menu apps.'],
};

const programCards = Object.fromEntries(Object.entries(programFacts).map(([id, [name, detail]]) => [
  `program-${id}`,
  {
    answer: `${name} ${detail} Envelop cannot launch this physical menu app remotely; use Virtual Tomato for manual interaction.`,
    provenance: common.os,
    actions: [link('Run Virtual Tomato', LINKS.tomatoVirtual), ask('List all programs', 'What programs are on Tomato?'), link('Read the OS guide', LINKS.tomatoOs)],
  },
]));

export const CARDS = freezeTree({...baseCards, ...programCards});
export const PROGRAM_IDS = freezeTree(Object.keys(programFacts));

export const MATCHERS = freezeTree([
  ['openSource', /\b(?:open source|opensource)\b.*\b(?:tyrone|marhguy|contribut|work|fix)|\bwhat has tyrone contributed\b/i],
  ['udpStack', /\b(?:tyrone.s |100 mbps |fpga )?(?:udp|udp\/ip) stack\b/i],
  ['tyroneProjects', /\b(?:other projects?|what else)\b.*\b(?:tyrone|marhguy|built|made|created)\b|\bprojects? (?:has|did) tyrone\b/i],
  ['tyrone', /\bwho (?:is|was) tyrone(?: iras)?(?: marhguy)?\b|\b(?:about|tell me about) tyrone(?: marhguy)?\b|\bwho (?:built|made|created|designed|wrote)\b.*\b(?:tomato|envelop|processor|os)\b/i],
  ['frameport', /\bframe\s*port\b|\bframeport\b/i],
  ['tryTomato', /\bhow (?:can|do) i (?:try|use|play with|run) (?:it|tomato|envelop)\b|\bwhere can i try\b/i],
  ['distribution', /\b(?:can i|where (?:can|do) i)\b.*\b(?:buy|download|install|get)\b.*\b(?:tomato|envelop)\b|\bpublic native app\b/i],
  ['sources', /\bwhere (?:is|are|can i find)\b.*\b(?:source|code|repository|repo|documentation)\b|\bshow (?:me )?the source\b/i],
  ['learning', /\b(?:how can i|i want to|where can i)\b.*\blearn more\b|\bwhat should i read\b/i],
  ['deterministicRoute', /\bhow (?:does|do) (?:this|the) deterministic (?:chat|program|response|routing)\b|\bhow (?:are|do) (?:questions|answers) (?:routed|matched)\b/i],
  ['deterministic', /\b(?:is|are|does|do)\b.*\b(?:ai|artificial intelligence|llm|language model|chatgpt|neural|generative)\b|\bno black box\b|\bopen compute\b/i],
  ['assistantIdentity', /\bwho are you\b|\bwhat are you\b|\bwhat is your name\b|\bare you (?:alive|human|a bot)\b/i],
  ['physicalVirtual', /\bphysical (?:or|vs|versus|and) virtual\b|\bdifference\b.*\bphysical\b.*\bvirtual\b|\bwhat (?:is|does) virtual tomato\b/i],
  ['availability', /\b(?:is|are|does)\b.*\b(?:physical tomato|tomato|hardware)\b.*\b(?:online|available|connected|live|up right now)\b|\bwhat does online mean\b/i],
  ['location', /\bwhere (?:is|does)\b.*\b(?:tomato|computer|hardware|machine)\b|\b(?:tomato|computer)\b.*\b(?:location|located|dorm)\b/i],
  ['discrete', /\b(?:discrete|74xx)\b.*\b(?:complete|finished|built|physical|computer|tomato)\b|\bhow much\b.*\bdiscrete tomato\b/i],
  ['fpga', /\bwhat is fpga tomato\b|\bnexys a7\b|\bfpga implementation\b/i],
  ['hardware', /\bis tomato (?:real|physical|hardware|a real computer|an? fpga)\b|\breal hardware\b|\bphysical hardware\b/i],
  ['aluSettings', /\b524[,. ]?288\b|\bhow many\b.*\b(?:alu )?(?:settings|configurations)\b/i],
  ['instructionCount', /\bhow many\b.*\b(?:instructions?|opcodes?|burned rows?)\b/i],
  ['alu', /\b(?:what|why|how)\b.*\b(?:dual[- ]lut|two (?:three.input )?luts?)\b|\bwhat makes\b.*\balu\b|\bhow does\b.*\balu\b/i],
  ['architecture', /\b(?:architecture|microarchitecture|von neumann|processor design|how does tomato work)\b/i],
  ['instructionWord', /\b(?:instruction|machine word)\b.*\b(?:layout|format|laid out|fields?|bits?)\b|\bhow is\b.*\b(?:instruction|opcode)\b.*\b(?:laid out|encoded)\b/i],
  ['sandboxRegisters', /\b(?:registers? can i use|sandbox registers?|compute abi exposes|r0 through r7)\b/i],
  ['zeroRegister', /\b(?:zero register|r0 always zero|hardwired zero)\b/i],
  ['registers', /\b(?:how many|why (?:does )?(?:full )?tomato (?:have|use))\b.*\bregisters?\b|\b256 registers?\b|\bfull tomato registers?\b|\bregister file\b/i],
  ['sandboxMemory', /\b(?:memory can i use|sandbox memory|private memory|memory can an envelop)\b/i],
  ['memory', /\b(?:how much memory|memory map|ram capacity|full tomato memory)\b/i],
  ['programs', /\b(?:what|which|list|show)\b.*\b(?:programs?|apps?|applications?|menu entries)\b.*\b(?:tomato|os)?\b|\bwhat does tomato os run\b/i],
  ['os', /\b(?:what|which)\b.*\b(?:operating system|tomato os|os version)\b|\bwhat os\b/i],
  ['screen', /\b(?:screen|display|framebuffer|video output|hdmi|dvi|see tomato)\b/i],
  ['speed', /\bhow fast\b.*\btomato\b|\b(?:clock speed|mhz|mips)\b/i],
  ['negative', /\b(?:negative|signed|two.?s complement)\b.*\b(?:number|integer|value|work|represent)\b|\bhow do negative numbers\b/i],
  ['overflow', /\b(?:overflows?|overflowed|wrapping|wraps?|modulo 2|2\^?32)\b/i],
  ['numbers', /\b(?:represent(?:ed|ation)?|formats?|decimal|hexadecimal|binary|integer range)\b.*\b(?:numbers?|integers?|literals?|values?)\b|\bhow are (?:numbers|integers) represented\b/i],
  ['masks', /\b(?:masks?|maskadd|xorand|andadd|oradd|xoradd|andn|orn|composed operations?)\b/i],
  ['modulo', /\b(?:modulo|remainder|percent operator|support %|% supported)\b|%/i],
  ['multiplication', /\b(?:multiplication|multiply|support \*)\b/i],
  ['division', /\b(?:division|divide|support \/)\b/i],
  ['rawInstructions', /\b(?:raw instructions?|\/run syntax|which instructions?.*(?:run|support)|raw program)\b/i],
  ['computeLimits', /\b(?:compute|sandbox|program|job)\b.*\b(?:limits?|bounded|cannot|can.t|restrictions?)\b/i],
  ['operators', /\b(?:which|what|supported|available)\b.*\b(?:operators?|operations?)\b|\b(?:operators?|operations?)\b.*\b(?:support|available|can)\b/i],
  ['compiler', /\b(?:compiler program|hardware compiler|what does.*compiler|which compiler|compiler menu)\b/i],
  ['bridge', /\b(?:how does envelop reach hardware|nearby bridge|bridge lease|envelop\/1 identity|authenticated bridge)\b/i],
  ['messagePath', /\bhow does\b.*\bmessage\b.*\b(?:reach|travel|get to)\b.*\btomato\b|\bmessage path\b/i],
  ['deliveryReliability', /\b(?:exactly once|duplicate message|delivery retries|at least once)\b/i],
  ['delivered', /\b(?:does|what does)\b.*\bdelivered\b.*\b(?:read|mean|receipt|ack)\b/i],
  ['timeout', /\b(?:hardware|tomato|job)\b.*\b(?:timeout|times out|timed out)\b/i],
  ['storedData', /\bwhat data\b.*\b(?:store|keep|save|collect)\b/i],
  ['deleteData', /\b(?:delete|erase|remove|forget)\b.*\b(?:my )?(?:data|profile|identity|account|messages?)\b/i],
  ['privacy', /\b(?:privacy|private|end.to.end encrypted|e2ee|encryption|send secrets)\b/i],
  ['formal', /\b(?:whole|entire)\b.*\b(?:cpu|computer|tomato)\b.*\bformal(?:ly)?\b|\bformally verified\b/i],
  ['verification', /\b(?:verify|verified|verification|evidence|proof|tested|130 billion)\b/i],
  ['build', /\b(?:can i|how (?:do|can) i)\b.*\b(?:build|reproduce|download|clone)\b.*\btomato\b/i],
  ['envelop', /\bwhat is envelop\b|\bhow does envelop work\b|\btell me about envelop\b/i],
  ['tomato', /\bwhat is tomato\b|\btell me about tomato\b|\bwho is tomato\b/i],
  ['capability', /\bwhat (?:can|does) (?:you|tomato|envelop) (?:do|run)\b|\b(?:capabilities|what can i ask)\b/i],
  ['memoryBoundary', /\b(?:do you|can you)\b.*\b(?:remember|know my name|know me|store memories)\b/i],
  ['thanks', /^(?:thanks|thank you|thx|cheers)[!. ]*$/i],
  ['praise', /\b(?:i love this|amazing|awesome|great job|good job|well done|this is cool)\b/i],
  ['frustration', /\b(?:this is broken|doesn.t work|not helpful|useless|frustrated|annoying)\b/i],
  ['goodbye', /^(?:bye|goodbye|see you|later|good night)[!. ]*$/i],
]);

export function programIntentFor(value) {
  const text = String(value || '').trim().toLowerCase();
  const aliases = {
    'system-info': /\bsystem info(?:rmation)?\b/,
    tribonacci: /\btribonacci\b/,
    'font-chart': /\bfont chart\b|\bglyph chart\b/,
    'keypad-test': /\bkeypad test\b|\bbutton test\b/,
    fibonacci: /\bfibonacci\b/,
    snake: /\bsnake\b/,
    tetris: /\btetris\b/,
    'about-tomato': /\babout tomato (?:program|app|screen|menu)\b/,
    'memory-map': /\bmemory map (?:program|app|screen|menu)\b/,
    sudoku: /\bsudoku\b/,
    'alu-studio': /\balu studio\b/,
    racer: /\bracer\b|\bracing game\b/,
    compiler: /\bcompiler (?:program|app|screen|menu)\b/,
    envelop: /\benvelop (?:program|app|inside tomato|on tomato os)\b/,
  };
  for (const [id, pattern] of Object.entries(aliases)) {
    if (pattern.test(text)) return `program-${id}`;
  }
  return null;
}
