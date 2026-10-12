# Register Analisis Source 216 Kandidat

**Status:** analisis statis terarah; bukan 216 instalasi dan bukan klaim seluruh repository dijalankan. Dokumen ini register keputusan, bukan plan batch tambahan.

Semua ID asli 1–216 dipertahankan. Detail commit, path source, cakupan pembacaan, pembanding Agent Core, dan batas lisensi ada di JSON pendamping. `extend` berarti ada mekanisme layak dipertimbangkan; bukan semua otomatis dipilih untuk integrasi. `reuse` harus berdasarkan kecukupan mekanisme, bukan keberadaan nama fitur saja.

**Pembagian eksekusi:** Batch 1 mengadopsi mekanisme #73, #133, dan #178 untuk satu jalur pembacaan web native. Batch 2 belum disusun; kandidat lain tidak otomatis dianggap sebagai pekerjaan implementasi yang tertunda.

## Jumlah keputusan

- defer: 54
- extend: 15
- no-source: 21
- reject: 38
- reuse: 88

## Ledger per kandidat

| ID | Kandidat | Keputusan source | Kedalaman inspeksi | Alokasi |
|---:|---|---|---|---|
| 1 | ACE — Agentic Context Engineering | reuse | code | Belum dialokasikan |
| 2 | MemRL | reuse | code | Belum dialokasikan |
| 3 | GEPA | reuse | code | Belum dialokasikan |
| 4 | DSPy / MIPROv2 | defer | code | Belum dialokasikan |
| 5 | Reflexion | reuse | code | Belum dialokasikan |
| 6 | ExpeL | reuse | code | Belum dialokasikan |
| 7 | Voyager | extend | code | Belum dialokasikan |
| 8 | TextGrad | defer | code | Belum dialokasikan |
| 9 | SICA — Self-Improving Coding Agent | defer | code | Belum dialokasikan |
| 10 | Darwin Gödel Machine / DGM | defer | code | Belum dialokasikan |
| 11 | Memento | reuse | code | Belum dialokasikan |
| 12 | ACON — Agent Context Optimization | defer | code | Belum dialokasikan |
| 13 | SkillRL | reuse | code | Belum dialokasikan |
| 14 | Agent Lightning | defer | code | Belum dialokasikan |
| 15 | Self-Refine | reuse | code | Belum dialokasikan |
| 16 | ReasoningBank | reuse | code | Belum dialokasikan |
| 17 | AutoSkill / SkillEvo | extend | code | Belum dialokasikan |
| 18 | Acontext | reuse | code | Belum dialokasikan |
| 19 | MetaClaw | reuse | code | Belum dialokasikan |
| 20 | Hermes Agent | reuse | code | Belum dialokasikan |
| 21 | OpenSkill | defer | code | Belum dialokasikan |
| 22 | Agent Workflow Memory / AWM | reuse | code | Belum dialokasikan |
| 23 | Agent Skill Induction | reuse | code | Belum dialokasikan |
| 24 | Skill-Pro / ProcMEM | defer | code | Belum dialokasikan |
| 25 | SimpleMem / EvolveMem | extend | code | Belum dialokasikan |
| 26 | memU | reuse | code | Belum dialokasikan |
| 27 | Hindsight | reuse | code | Belum dialokasikan |
| 28 | ReMe | reuse | code | Belum dialokasikan |
| 29 | Zep / Graphiti | reuse | code | Belum dialokasikan |
| 30 | Mem0 | reuse | code | Belum dialokasikan |
| 31 | A-MEM | reuse | code | Belum dialokasikan |
| 32 | Letta / MemGPT → Letta Code | reuse | code | Belum dialokasikan |
| 33 | Cognee | reuse | code | Belum dialokasikan |
| 34 | OpenViking | reuse | code | Belum dialokasikan |
| 35 | EverMemOS → EverOS | reuse | code | Belum dialokasikan |
| 36 | MemOS — local Reflect2Evolve | reuse | code | Belum dialokasikan |
| 37 | Memvid | reject | code | Belum dialokasikan |
| 38 | LangMem | reuse | code | Belum dialokasikan |
| 39 | OpenAI/Bain — Self-Evolving Agents | defer | code | Belum dialokasikan |
| 40 | OpenAI — Memory and Compaction | defer | code | Belum dialokasikan |
| 41 | OpenAI — Session Memory | defer | code | Belum dialokasikan |
| 42 | OpenAI — Reinforcement Fine-Tuning | defer | code | Belum dialokasikan |
| 43 | Anthropic — Client-side Memory Tool | reuse | code | Belum dialokasikan |
| 44 | Anthropic — skill-creator | defer | code | Belum dialokasikan |
| 45 | Anthropic — Long-Running Agent Harness | reuse | code | Belum dialokasikan |
| 46 | Anthropic — Claude Code Auto Memory | reuse | docs | Belum dialokasikan |
| 47 | xAI — Grok Build Memory | extend | code | Belum dialokasikan |
| 48 | xAI — Progressive Tool Disclosure | reuse | code | Belum dialokasikan |
| 49 | xAI — Multi-turn Conversation | defer | code-web-snapshot | Belum dialokasikan |
| 50 | DeepSeek-R1 / R1-Zero | defer | model-metadata | Belum dialokasikan |
| 51 | DeepSeekMath-V2 | defer | code | Belum dialokasikan |
| 52 | DeepSeek Engram | reject | code | Belum dialokasikan |
| 53 | DeepSeek Harness — MCP Memory | reject | code | Belum dialokasikan |
| 54 | EXAONE Deep | defer | model-metadata | Belum dialokasikan |
| 55 | Motif-2-12.7B-Reasoning — curriculum | defer | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 56 | Motif — budget dan repetition stop | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 57 | GLM-4.5 / GLM-4.5-Air | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 58 | GLM-Z1-Rumination-32B-0414 | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 59 | slime — ekosistem GLM | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 60 | SEAL — Self-Adapting Language Models | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 61 | SEAgent | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 62 | CoReaAgents | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 63 | Sai by Simular | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 64 | Agent S / Agent-S | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 65 | Simulang / simulang-js | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 66 | SAI — Stack of AI | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 67 | Sai — Rust coding workbench | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 68 | Atria Dawn Preview | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 69 | atria — terminal session manager | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 70 | AC — Wrtn Labs | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 71 | Agentica / MicroAgentica — Wrtn Labs | defer | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 72 | Evidence — Wrtn Labs | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 73 | web-content-extractor — Wrtn Labs | extend | focused-static-source-call-path; no donor execution | Batch 1 |
| 74 | Storm MCP Server — Sionic AI | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 75 | Document Parse — Upstage | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 76 | Studio + Agents API — Upstage | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 77 | CLOVA Studio / Skill Trainer — NAVER Cloud | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 78 | AI:GO — Lablup | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 79 | Brity Automation Agent — Samsung SDS | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 80 | Knowledge Studio — Saltlux | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 81 | Agent Studio — Saltlux | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 82 | AutoRAG 2.0 / AutoRAG Agent — Markr.AI | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 83 | Agent Memory Distillation / AMD — KAIST + DeepAuto.ai | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 84 | Personalize-then-Store / PerMemBench — KAIST | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 85 | Memory Transfer Learning / MTL — KAIST + NYU + DeepAuto.ai | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 86 | Membrane — KAIST AI + KakaoBank | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 87 | WorldMM — KAIST + NTU Singapore + DeepAuto.ai | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 88 | Sionic Maestro Skills — Sionic AI | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 89 | MCP-SIM — KAIST Mechanical Engineering | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 90 | EXAONE-Cookbook + K-EXAONE 2.0 — LG AI Research | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 91 | Solar Agent Cookbook + Document AI MCP — Upstage | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 92 | Dataverse — Upstage | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 93 | OmniServe + HyperCLOVA X SEED — NAVER | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 94 | Kanana + FunctionChat-Bench — Kakao | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 95 | A.X K2 — SK Telecom | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 96 | Saï / Sai / 사이 — Lumigloo Inc. | no-source | documentation-and-metadata-only-for-proposed-mechanism | Belum dialokasikan |
| 97 | PREPING — KAIST/DeepAuto | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 98 | HINT-SD — KAIST/DeepAuto | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 99 | Paper2Code / PaperCoder — KAIST/DeepAuto | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 100 | Super Library Agent / SLA — KAIST/DeepAuto | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 101 | AutoML-Agent — DeepAuto.ai + KAIST | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 102 | Agentic Predictor — DeepAuto | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 103 | ResearchAgent — kolaborasi KAIST | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 104 | Agent Distillation — kolaborasi KAIST | reject | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 105 | MetaSPO — KAIST/DeepAuto | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 106 | MPO — KAIST/DeepAuto | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 107 | UniversalRAG — KAIST/DeepAuto | defer | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 108 | Adaptive-RAG — kolaborasi KAIST | reuse | focused-static-source-call-path; no donor execution | Belum dialokasikan |
| 109 | DAQu — kolaborasi KAIST | reuse | code | Belum dialokasikan |
| 110 | CoLoR — kolaborasi KAIST/DeepAuto | defer | code | Belum dialokasikan |
| 111 | Sketch-of-Thought / SoT — kolaborasi internasional KAIST | reuse | code | Belum dialokasikan |
| 112 | SafeRoute — kolaborasi KAIST | reject | code | Belum dialokasikan |
| 113 | T-MAP — kolaborasi KAIST | reuse | code | Belum dialokasikan |
| 114 | KALMV — kolaborasi KAIST | reuse | code | Belum dialokasikan |
| 115 | KARD — kolaborasi KAIST | defer | code | Belum dialokasikan |
| 116 | Judge Code Efficiency — KAIST/DeepAuto | reject | code | Belum dialokasikan |
| 117 | NELLA — KISTI BLUESKY | defer | partial-code | Belum dialokasikan |
| 118 | DOREA-X / DOREA-XP — KISTI BLUESKY | reuse | partial-code | Belum dialokasikan |
| 119 | DURU — KISTI BLUESKY | no-source | docs-only | Belum dialokasikan |
| 120 | ParserTry — KISTI BLUESKY | extend | partial-code | Belum dialokasikan |
| 121 | rhwp Agent Skills — KISTI BLUESKY | reuse | code | Belum dialokasikan |
| 122 | Scarlet — KISTI BLUESKY | no-source | docs-only | Belum dialokasikan |
| 123 | Aspen-MCP — SNU EPEL | defer | code | Belum dialokasikan |
| 124 | Persode — peneliti institusi Korea | reject | code | Belum dialokasikan |
| 125 | PCBWorld — LG AI Research | defer | code | Belum dialokasikan |
| 126 | LLM-Agent-SAE — Samsung | reject | code | Belum dialokasikan |
| 127 | OpenChrome — maintainer berbasis Seoul | extend | code | Belum dialokasikan |
| 128 | oh-my-agent — FIRST FLUKE | reuse | code | Belum dialokasikan |
| 129 | MIMIC — FIRST FLUKE | reuse | code | Belum dialokasikan |
| 130 | Oh My OpenAgent / OmO — sebelumnya oh-my-opencode | reject | code | Belum dialokasikan |
| 131 | senpi — fork runtime oleh maintainer Seoul | extend | code | Belum dialokasikan |
| 132 | cc-plus — maintainer code-yeongyu | reuse | code | Belum dialokasikan |
| 133 | web-fetch — maintainer code-yeongyu | extend | code | Batch 1 |
| 134 | OMX / OMC — oh-my-codex + oh-my-claudecode | reuse | code | Belum dialokasikan |
| 135 | Ouroboros — maintainer Q00 | extend | code | Belum dialokasikan |
| 136 | AutoBE — Wrtn Labs | defer | docs-only | Belum dialokasikan |
| 137 | Connectors — Wrtn Labs | defer | docs-only | Belum dialokasikan |
| 138 | Sindie — Wrtn Labs | extend | code | Belum dialokasikan |
| 139 | vector-store — Wrtn Labs | defer | docs-only | Belum dialokasikan |
| 140 | OpenDataLoader PDF — Hancom | defer | code | Belum dialokasikan |
| 141 | PULSE / AutoCode — ETRI | reject | code | Belum dialokasikan |
| 142 | vesslctl + agent skill — VESSL | no-source | docs-only | Belum dialokasikan |
| 143 | Align SDK — Coxwave | reject | code | Belum dialokasikan |
| 144 | NomaDamas tools — MinSync / Jikji / slides-grab / k-skill | extend | code | Belum dialokasikan |
| 145 | MeshKit — maintainer Q00 | reuse | code | Belum dialokasikan |
| 146 | Zeude — ZEP Co., Ltd. | reject | code | Belum dialokasikan |
| 147 | AutoView CLI — Wrtn Labs | defer | docs-only | Belum dialokasikan |
| 148 | TencentDB Agent Memory — Tencent Cloud | reuse | code | Belum dialokasikan |
| 149 | RoMem — Tencent | defer | code | Belum dialokasikan |
| 150 | Mandol — ISCAS + Microsoft Research | reuse | code | Belum dialokasikan |
| 151 | openJiuwen — runtime + JiuwenMemory + JiuwenSwarm | reuse | code | Belum dialokasikan |
| 152 | MemoryOS — BAI-LAB | reuse | code | Belum dialokasikan |
| 153 | MemoryBank / SiliconFriend | reject | code | Belum dialokasikan |
| 154 | SelfMem — University of Macau + KAUST | no-source | paper-only | Belum dialokasikan |
| 155 | Trace2Skill — Alibaba Qwen Applications | reuse | code | Belum dialokasikan |
| 156 | SkillClaw — Alibaba AMAP / DreamX | reuse | code | Belum dialokasikan |
| 157 | SkillForge — Alibaba Cloud | no-source | paper-only | Belum dialokasikan |
| 158 | SkillNet / SkillNet-Gym / SkillNet-Fabric | defer | code | Belum dialokasikan |
| 159 | LearnAct — PKU + HKU + ByteDance | defer | code | Belum dialokasikan |
| 160 | AFlow — DeepWisdom dan kolaborator | reuse | code | Belum dialokasikan |
| 161 | AgentSquare — Tsinghua FIB Lab | reject | code | Belum dialokasikan |
| 162 | AgentEvolver — Alibaba Tongyi Lab | defer | code | Belum dialokasikan |
| 163 | AgentScope Tuner / Trinity-RFT — Alibaba | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 164 | Skill Self-Play / Skill-SP — Alibaba Qwen | extend | focused-static-source-call-path; no execution | Belum dialokasikan |
| 165 | TaskMem — ByteDance Seed | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 166 | M3-Agent — ByteDance Seed | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 167 | MiniMax Forge + self-evolution M2.7 | no-source | vendor-docs-only; no public engine verified | Belum dialokasikan |
| 168 | OpenSandbox — asal Alibaba | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 169 | AIO Sandbox — Agent Infra / diperkenalkan ByteDance OSS | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 170 | PaddleOCR / PaddleOCR MCP — Baidu | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 171 | Midscene — ByteDance Web Infra | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 172 | TARS — Agent TARS + UI-TARS Desktop/SDK | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 173 | AgentScope 2.0 — Alibaba Tongyi Lab | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 174 | Eino / Eino ADK — ByteDance CloudWeGo | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 175 | tRPC-Agent-Go — Tencent | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 176 | Qwen-Agent — Alibaba Qwen | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 177 | ModelScope-Agent → MS-Agent — Alibaba | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 178 | Qwen Code — Alibaba Qwen | extend | focused-static-source-call-path; no execution | Batch 1 |
| 179 | Trae Agent — ByteDance | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 180 | Kimi Code CLI — Moonshot AI | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 181 | MiniMax Code + MiniMax MCP | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 182 | OpenAgentCore — MiniMax | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 183 | DeerFlow 2.0 — ByteDance | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 184 | Coze Studio — ByteDance | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 185 | WeKnora — Tencent | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 186 | Tencent Cloud ADP | no-source | vendor-docs-only; no public engine verified | Belum dialokasikan |
| 187 | JoyAgent-JDGenie — JD.com | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 188 | MetaGPT / OpenManus — DeepWisdom | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 189 | AWorld — Ant Group / inclusionAI | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 190 | Open-AutoGLM — Z.ai / Zhipu | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 191 | OSWorld / OSWorld-Verified / OSWorld 2.0 | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 192 | Kagura Memory Cloud — Kagura AI | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 193 | TreeQuest / Adaptive Branching MCTS — Sakana AI | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 194 | ShinkaEvolve — Sakana AI | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 195 | SkillPort — gotalab | extend | focused-static-source-call-path; no execution | Belum dialokasikan |
| 196 | cc-sdd — gotalab | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 197 | Caty — self-growth-loop / context-kit / family-memory / harness | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 198 | Eidetic — maintainer issyuNaN | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 199 | BeliefMem — kolaborasi termasuk RIKEN AIP | no-source | paper-only; official release not verified | Belum dialokasikan |
| 200 | The AI Scientist v1 / v2 — Sakana AI | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 201 | ALE-Agent / ALE-Bench — Sakana AI | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 202 | Digital Red Queen / DRQ — MIT + Sakana AI | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 203 | EVE-Agent — Fujitsu / University of Tokyo / RIKEN | no-source | paper-only; official release not verified | Belum dialokasikan |
| 204 | Doc-to-LoRA / Text-to-LoRA — Sakana AI | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 205 | Neural Attention Memory Models / evo-memory — Sakana AI | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 206 | Fast-weight Product Key Memory — Sakana AI | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 207 | Transformer² / self-adaptive-llms — Sakana AI | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 208 | Fugu / TRINITY / Conductor — Sakana AI | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 209 | Optuna — Preferred Networks | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 210 | J-tau — SB Intuitions | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 211 | FlexEval — SB Intuitions | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |
| 212 | WebChoreArena — University of Tokyo | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 213 | HPC-Agentic-SDK — RIKEN R-CCS | defer | focused-static-source-call-path; no execution | Belum dialokasikan |
| 214 | Kozuchi Multi AI Agent Framework / self-evolving agents — Fujitsu | no-source | vendor-docs-only; no public engine verified | Belum dialokasikan |
| 215 | Felo API / LiveDoc / Felo Skills | reject | focused-static-source-call-path; no execution | Belum dialokasikan |
| 216 | ELYZA Agent Tasks / harness self-improvement | reuse | focused-static-source-call-path; no execution | Belum dialokasikan |

## Batas kesimpulan

- Source tidak tersedia publik, hanya dokumentasi/paper, dan kegagalan akses dibedakan pada detail setiap entri. Kegagalan clone tidak membuktikan tidak ada codebase.
- Beberapa entri merujuk repo yang sama; beberapa entri memiliki banyak repo. Jumlah clone tidak sama dengan jumlah kandidat.
- Source donor dibaca tanpa menjalankan dependency, training, model, atau daemon donor.
- Tidak ada klaim kecepatan, ketepatan, atau kualitas terukur dari pembacaan source saja.
- Perbedaan yang mengarah pada penggantian implementasi harus mempertahankan izin, riwayat, kontrak, dan satu owner. Jalur lama yang digantikan tidak menjadi fallback tersembunyi.
- Plan integrasi P0–P5 terdahulu tetap ditutup; register ini menilai improvement berikutnya.

Detail: [JSON source review](candidate-source-review-216-20261012.json).


## Kelanjutan Batch 3–4 — draft 12 Oktober 2026

Perencanaan lanjutan 12 Oktober 2026 memakai asumsi Batch 2 sudah terpasang sesuai kontraknya; ini baseline desain, bukan klaim aktivasi Windows. Urutan rencana 2 → 3 → 4. Batch 3 memilih #25 SimpleMem dalam enam fase untuk menghubungkan rencana 2–4 subpertanyaan eksplisit ke recall Memory canonical berbatas melalui controller context existing. Tidak mengubah ranking global, tidak memakai planner LLM, dan mempertahankan snapshot/discovery Skill, digest, grants serta receipt Batch 2. #47 lexical MMR tetap gap tersendiri di luar batch. Batch 4 memilih #138 Sindie dalam lima fase untuk review visual per kriteria yang terikat source digest dan view overview/crop milik image_inspect existing; penilaian tetap berasal dari controller, bukan quality oracle atau gate ekspor. Batch 4 tidak mengubah retrieval Batch 3. Keduanya tanpa runtime donor, dependency produksi, store paralel, atau perubahan nama runtime/memory. Keenam kandidat Batch 1–2 sudah diimplementasikan pada source Linux; dua kandidat baru hanya dialokasikan ke draft, 208 entri lainnya tetap di ledger dengan keputusan masing-masing. Dua plan menunggu review pengguna; tidak ada implementasi Batch 3/4 atau pemasangan Windows pada pekerjaan perencanaan ini.

- [Batch 3 — Retrieval Memory multi-query berbatas](../plans/2026-10-12-batch-03-bounded-memory-subquestions.md): #25; enam fase; owner ExternalControllerLearningService dan dispatcher/Memory canonical existing.
- [Batch 4 — Review visual terikat gambar dan view](../plans/2026-10-12-batch-04-view-bound-visual-review.md): #138; lima fase; owner image_inspect existing.

Keputusan mekanisme pada 216 entri tetap 88 reuse / 54 defer / 15 extend / 38 reject / 21 no-source. Alokasi draft tidak mengubahnya menjadi implementasi atau bukti manfaat. Entri #47, #120, #127, #131, #135, #144, dan #164 tetap kandidat extend yang belum dialokasikan; tidak disisipkan ke dua plan baru untuk menambah jumlah adopsi. Baseline source terinspeksi 1657e52be193c8f55cb306397b5d0004d595bd8b; laporan Windows Batch 2 diselaraskan sebagai bukti aktual tersendiri saat diterima.
