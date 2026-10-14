> From: https://chatgpt.com/g/g-p-6a4731eb0df081918f4e64005909762b-joe/c/6abb61fd-2fcc-83ec-9b1d-39f1ddbc00e3

# you asked

message time: 2026-09-29 14:00:09

bantu aku carikan AI tools seperti openclaw, hermes base on search web dan repo github untuk memastikannya bahwa yang di cari AI tools seperti openclaw dan hermes yang tinggal memasang otaknya melalui Api key/lokalhost

---

# chatgpt response

Aku akan cari **tool yang benar-benar agent runtime/shell**, bukan sekadar SDK/framework. Kriterianya: bisa jalan setelah diberi model lewat **API key atau endpoint lokal/OpenAI-compatible/Ollama/LM Studio**, lalu agent-nya yang menyediakan tool use, memory, browser/terminal, atau workflow.

Pola yang kamu maksud sudah terkonfirmasi: **“badan agent” sudah jadi—tools, memory, terminal/browser, UI/channel, scheduler—lalu model/otaknya tinggal dipasang lewat API key atau `base_url` localhost.** OpenClaw sendiri memang mendeskripsikan model/harness sebagai plugin yang bisa diganti, sedangkan Hermes menerima OpenAI-compatible endpoint termasuk Ollama/vLLM/llama.cpp/SGLang.

Ya. Aku sudah cek web + repository GitHub dengan kriteria yang kamu maksud: **bukan sekadar framework agent**, tetapi sudah punya “badan” agent dan kita tinggal memasang **otak/model** melalui API key, OAuth, atau endpoint lokal seperti `http://localhost:.../v1`.

Sebagai baseline, **OpenClaw** memang memakai arsitektur model/harness yang bisa ditukar, termasuk local model lewat Ollama. **Hermes Agent** juga secara resmi mendukung OpenAI-compatible API serta local inference melalui Ollama, vLLM, llama.cpp, SGLang, dan lainnya. ([GitHub](https://github.com/openclaw/openclaw?utm_source=chatgpt.com))

### Kandidat yang benar-benar cocok

| Tool | Cara memasang “otak” | “Badan” yang sudah tersedia | Kecocokan |
|---|---|---|---|
| **Agent Zero** | OpenAI, Anthropic, OpenRouter, Google, OAuth account; lokal Ollama, LM Studio, llama.cpp, vLLM, dll. | Linux desktop, terminal, browser, files, project memory, skills, plugins, MCP, A2A, multi-agent, host-machine bridge | **Sangat dekat** |
| **nanobot** | OpenRouter/API provider, custom OpenAI-compatible endpoint, Ollama/vLLM/local | WebUI, CLI, gateway, chat apps, file/shell/web tools, MCP, cron, memory, subagents, automation | **Sangat dekat** |
| **goose** | API key atau OpenAI-compatible endpoint; Ollama lokal juga native | Desktop + CLI + API, terminal/code/files/workflow, MCP extensions | **Sangat dekat** |
| **Letta / Letta Code** | API sendiri atau custom OpenAI-compatible seperti vLLM, LM Studio, LocalAI | Persistent agents, long-term memory, learning, skills, App Server, channels | **Dekat, memory-first** |
| **Open Interpreter** | API key, ChatGPT sign-in, Ollama, LM Studio atau compatible provider | Terminal/computer coding agent, repository/files, command execution, diffs | **Dekat, computer/coding-first** |
| **OpenHands** | API provider atau localhost LM Studio/Ollama/vLLM/SGLang | Coding workspace, terminal, files, repo automation, Web UI | **Lebih coding-oriented** |
| **OpenManus** | `model + base_url + api_key`; compatible API | General agent, terminal, browser, MCP, data-analysis agent, multi-agent experimental | **Dekat dan sederhana** |
| **Agent TARS** | `provider + model + apiKey/base URL` | Browser + computer-use + vision + MCP + WebUI/CLI | **Bagus untuk GUI/computer-use** |

### 1. Agent Zero — kandidat yang sangat menarik untuk Agent Core



Ini salah satu yang paling pas dengan definisimu. Onboarding-nya secara eksplisit menawarkan tiga jalur: **Cloud**, **Account**, atau **Local**. Local bisa memakai Ollama, LM Studio, llama.cpp, vLLM, dan model server lainnya. ([GitHub](https://github.com/agent0ai/agent-zero/blob/main/docs/guides/onboarding.md?utm_source=chatgpt.com))

Yang sudah disediakan sebagai tubuh agent sangat banyak: full Linux desktop, browser DOM annotation, file/terminal, project isolation, memory, skills, plugin, MCP, A2A, multi-agent, bahkan bridge kembali ke host machine. ([GitHub](https://github.com/agent0ai/agent-zero?utm_source=chatgpt.com))

Secara konsep:

```text
Agent Zero
   │
   ├── Desktop / Browser
   ├── Terminal / Files
   ├── Memory
   ├── Skills
   ├── Plugins
   ├── MCP / A2A
   └── Multi-Agent
          ↑
          │
       MODEL
    API / localhost
```

**Ini masuk prioritas pertama untuk source-first steal/use audit.**

---

### 2. nanobot — mungkin yang paling dekat dengan filosofi OpenClaw



nanobot secara eksplisit mendeskripsikan dirinya sebagai **self-hosted personal AI agent runtime**. Ia sudah punya WebUI, terminal, Telegram/Discord/Slack/Email/dll, files, shell, web, MCP, cron, image generation, subagents, memory, long-running goals, dan automations. ([GitHub](https://github.com/HKUDS/nanobot?utm_source=chatgpt.com))

Untuk otaknya ada:

```text
OpenRouter
Anthropic
OpenAI
Bedrock
Ollama
vLLM
custom OpenAI-compatible
...
```

Custom provider bahkan memang ditujukan untuk **any OpenAI-compatible endpoint**. ([GitHub](https://github.com/HKUDS/nanobot/blob/main/docs/configuration.md?utm_source=chatgpt.com))

Ini sangat menarik untuk Agent Core karena core-nya relatif kecil dibanding beberapa platform besar, sehingga lebih gampang melakukan:

```text
source census
→ mechanism extraction
→ adapt
→ wiring native
```

daripada harus membedah platform raksasa.

---

### 3. goose — runtime agent matang dengan provider yang benar-benar modular



goose memiliki:

```text
Desktop App
CLI
API
MCP extensions
provider abstraction
tool execution
workflow automation
```

dan mendukung lebih dari 15 provider, termasuk OpenAI, Anthropic, Google, OpenRouter dan **Ollama**. OpenAI provider-nya juga dapat diarahkan ke endpoint OpenAI-compatible/self-hosted. ([GitHub](https://github.com/aaif-goose/goose?utm_source=chatgpt.com))

Bentuknya sangat sesuai konsep:

```text
         goose
           │
    ┌──────┼───────┐
    │      │       │
   CLI   Desktop   API
    │
   Tools/MCP
    │
   Agent Loop
    ↑
    │
MODEL PROVIDER
OpenRouter / Claude
OpenAI / Ollama
localhost / custom
```

Menurutku **Goose sangat menarik untuk melihat provider abstraction, extension lifecycle, MCP integration, dan portable agent runtime**.

---

### 4. Letta — kalau target utama memory + agent yang benar-benar persisten



Letta berbeda sedikit. Ia sangat kuat di konsep:

```text
agent identity
+
persistent memory
+
long-lived agent
+
learning
+
skills
```

dan bukan hanya session chatbot. Repo aktifnya menyediakan agent harness, TUI, App Server, channels, dan runtime. ([GitHub](https://github.com/letta-ai/letta?utm_source=chatgpt.com))

Local brain juga memungkinkan:

```text
vLLM
LM Studio
LocalAI
OpenAI-compatible custom endpoint
```

melalui `model_endpoint`. ([GitHub](https://github.com/letta-ai/skills/blob/main/letta/letta-configuration/references/custom-endpoints.md?utm_source=chatgpt.com))

Untuk Agent Core, Letta menarik bukan terutama untuk machine-control, tetapi untuk:

```text
persistent agent identity
memory lifecycle
long-lived cognition
cross-session continuity
learned skills
agent portability between models
```

---

### 5. Open Interpreter



Versi sekarang memang provider-agnostic. First-run bisa menggunakan API key atau model lokal melalui **Ollama / LM Studio**, dan provider bisa diganti kemudian. ([GitHub](https://github.com/openinterpreter/openinterpreter/blob/main/docs/quickstart.md?utm_source=chatgpt.com))

Tubuhnya lebih kecil:

```text
LLM
 ↓
Open Interpreter
 ├─ inspect repo
 ├─ edit files
 ├─ run commands
 ├─ review diff
 └─ resume sessions
```

Bagus kalau yang ingin kita curi adalah **minimal agent-computer loop** tanpa membawa platform besar.

---

### 6. OpenHands



OpenHands sekarang secara resmi memiliki jalur local LLM. Dokumentasinya menyebut LM Studio, Ollama, vLLM dan SGLang, dengan konfigurasi seperti:

```text
Base URL:
http://host.docker.internal:1234/v1

Model:
openai/<local-model>

API key:
local-llm
```

([GitHub](https://github.com/OpenHands/docs/blob/main/openhands/usage/llms/local-llms.mdx?utm_source=chatgpt.com))

Ini cocok dengan definisi **“pasang otaknya lewat localhost”**, tetapi tubuh OpenHands sangat berorientasi **software engineering/coding agent**, jadi bukan alternatif OpenClaw paling general.

---

### 7. OpenManus



Konfigurasinya persis pola yang kamu cari:

```toml
[llm]
model = "..."
base_url = "..."
api_key = "..."
```

lalu:

```bash
python main.py
```

([GitHub](https://github.com/FoundationAgents/OpenManus?utm_source=chatgpt.com))

Sudah mempunyai browser integration, MCP mode, general agent dan experimental multi-agent flow. Arsitekturnya relatif sederhana dibanding OpenClaw/Agent Zero sehingga **cukup menarik untuk steal/use secara mekanisme**.

---

### 8. Agent TARS / UI-TARS stack



Ini menarik kalau Agent Core suatu saat mau lebih kuat di **computer-use / GUI agent / browser vision**.

Agent TARS punya CLI + WebUI, hybrid browser agent, computer interaction dan MCP; provider/model/API key dapat dipasang dari luar. ([GitHub](https://github.com/bytedance/ui-tars-desktop?utm_source=chatgpt.com))

Untuk UI-TARS sendiri model dapat dihubungkan menggunakan:

```text
Base URL
API Key
Model Name
```

([GitHub](https://github.com/bytedance/UI-TARS-desktop/blob/main/docs/quick-start.md?utm_source=chatgpt.com))

Jadi agent body dan VLM brain memang terpisah.

---

Ada juga kandidat yang sangat mirip secara literal dengan OpenClaw/Hermes, yaitu **BajaClaw**: proyeknya bahkan menyebut dirinya standalone all-in-one personal agent yang terinspirasi OpenClaw, Hermes, dan Claude Cowork, dengan Web UI, Telegram/Discord, memory dan local OpenAI-compatible API. Tetapi dibanding kandidat di atas, aku akan menaruhnya sebagai **reference eksperimental**, bukan prioritas awal. ([GitHub](https://github.com/backyarddd/BajaClaw/?utm_source=chatgpt.com))

### Prioritas yang menurutku paling berguna untuk dibedah untuk Agent Core

Kalau tujuannya bukan hanya memakai tool tersebut, tetapi **mencari DNA terbaik untuk di-steal/use → adapt ke Agent Core**, urutan pemeriksaan source yang paling bernilai menurutku:

**Agent Zero → nanobot → goose → Letta → Open Interpreter → OpenHands → OpenManus → Agent TARS.**

Mereka punya DNA yang berbeda: Agent Zero kuat pada **body/computer environment**, nanobot pada **personal-agent runtime yang compact**, goose pada **provider/MCP runtime**, Letta pada **persistent cognition/memory**, Open Interpreter pada **minimal machine-agent loop**, OpenHands pada **workspace/coding execution**, OpenManus pada **simple general-agent orchestration**, dan Agent TARS pada **GUI/vision/computer-use**.

Yang sengaja **tidak aku prioritaskan** adalah CrewAI/AutoGen/LangGraph/smolagents. Mereka bagus, tetapi lebih merupakan **framework untuk membangun agent**; bukan kategori yang kamu minta yaitu “install badan agent → colok otaknya → langsung hidup”. Bahkan AutoGen sekarang berada dalam maintenance mode dan Microsoft mengarahkan proyek baru ke Microsoft Agent Framework. ([GitHub](https://github.com/microsoft/autogen/blob/main/README.md?utm_source=chatgpt.com))

Kalau target berikutnya adalah **mencari repo untuk dibongkar dan diadopsi ke Agent Core**, aku akan mulai dari **Agent Zero + nanobot + goose**. Tiga ini paling banyak berpotensi memberi mekanisme yang belum tentu sudah dimiliki Agent Core, tanpa terlalu bergantung pada satu model/provider.

---

# you asked

message time: 2026-09-29 14:04:35

yang lainnya, aku rasa ada banyak, aku butuh daftar nya, kamu tidak perlu menjelaskannya terlalu panjang yang terpenting AI tools yang aku sebut itu sesuai dengan yang aku cari

---

# chatgpt response

Bisa. Aku akan perluas pencarian dan hanya masukkan **AI agent runtime yang sudah punya “badan” sendiri**—jadi bukan library murni—serta bisa diberi model lewat **API key atau endpoint lokal/OpenAI-compatible**.

Ya, memang jauh lebih banyak. Di bawah ini **tambahan selain OpenClaw, Hermes, Agent Zero, nanobot, goose, Letta, Open Interpreter, OpenHands, OpenManus, dan Agent TARS** yang sudah kuseleksi karena sesuai pola yang kamu cari: **agent/harness sudah jadi, lalu “otaknya” bisa dipasang lewat API key, OpenAI-compatible endpoint, Ollama, LM Studio, vLLM, localhost, atau sejenisnya.**

| # | AI Tool | Model / “Otak” | Fokus |
|---:|---|---|---|
| 1 | **Personal AgentOS** | Ollama / OpenAI-compatible / Anthropic | Personal agent OS ([GitHub](https://github.com/Jongtae/agentos?utm_source=chatgpt.com)) |
| 2 | **gptme** | OpenAI / Anthropic / OpenRouter / Ollama / compatible | General terminal agent ([GitHub](https://github.com/gptme/gptme?utm_source=chatgpt.com)) |
| 3 | **SelfAgent** | OpenAI / Claude / Gemini / OpenRouter / Ollama | Personal computer assistant ([GitHub](https://github.com/oezercet/SelfAgent?utm_source=chatgpt.com)) |
| 4 | **MIRA** | OpenAI / Anthropic / OpenRouter / DeepSeek / local compatible | Personal AI runtime ([GitHub](https://github.com/Vexillon-ai/MIRA?utm_source=chatgpt.com)) |
| 5 | **CortexPrism** | 30+ providers / Ollama / LM Studio / OpenRouter | Agent operating system ([GitHub](https://github.com/CortexPrism/cortex?utm_source=chatgpt.com)) |
| 6 | **Pernix** | Ollama / OpenRouter / OpenAI-compatible / LM Studio / vLLM | Persistent personal agent server ([GitHub](https://github.com/calvincs/Pernix?utm_source=chatgpt.com)) |
| 7 | **AgentArk** | Ollama / OpenAI / Claude / Gemini / OpenRouter / compatible | Secure personal agent ([GitHub](https://github.com/agentark-ai/AgentArk?utm_source=chatgpt.com)) |
| 8 | **PocketPaw** | Anthropic / OpenAI / Ollama | Desktop personal agent ([GitHub](https://github.com/pocketpaw/pocketpaw?utm_source=chatgpt.com)) |
| 9 | **AutoMate** | Any OpenAI-compatible / Ollama / LM Studio | Multi-channel personal agent ([GitHub](https://github.com/supastishn/AutoMate?utm_source=chatgpt.com)) |
| 10 | **OpenJarvis** | Ollama / MLX / vLLM / llama.cpp / OpenAI / Claude | Local JARVIS-style assistant ([GitHub](https://github.com/Danush-Aries/OpenJarvis?utm_source=chatgpt.com)) |
| 11 | **Felix** | Claude / GPT / Gemini / Qwen / Ollama / LM Studio / compatible | Single-binary agent gateway ([GitHub](https://github.com/sausheong/felix/?utm_source=chatgpt.com)) |
| 12 | **Pan-Agent** | OpenAI-compatible / OpenRouter / Ollama / LM Studio / vLLM / llama.cpp | Full PC-control agent ([GitHub](https://github.com/Euraika-Labs/pan-agent?utm_source=chatgpt.com)) |
| 13 | **AgentBridge** | DeepSeek / Gemini / Anthropic / compatible / Ollama / local bridge | Agent server + MCP ([GitHub](https://github.com/graphene-Lab/AgentBridge?utm_source=chatgpt.com)) |
| 14 | **Mimir** | Ollama / llama.cpp / MLX-LM / OpenAI-compatible | Memory + MCP personal assistant ([GitHub](https://github.com/csornyei/mimir?utm_source=chatgpt.com)) |
| 15 | **PersonalAI** | Ollama / remote OpenAI-compatible | Local assistant + RAG + tools ([GitHub](https://github.com/lucianhanga/personal-ai?utm_source=chatgpt.com)) |
| 16 | **Billy** | Claude / any OpenAI-compatible / Ollama | Telegram personal agent + subagents ([GitHub](https://github.com/surfgolfski-dev/billy?utm_source=chatgpt.com)) |
| 17 | **assistant (cedricziel)** | Ollama | Self-improving local assistant + skills + MCP ([GitHub](https://github.com/cedricziel/assistant?utm_source=chatgpt.com)) |
| 18 | **AIOS** | OpenAI / Claude / Gemini / DeepSeek / Ollama / vLLM | AI Agent Operating System ([GitHub](https://github.com/Decentralised-AI/AIOS-AI-Agent-Operating-System?utm_source=chatgpt.com)) |
| 19 | **Zero** | OpenAI / Claude / Gemini / OpenRouter / Ollama / LM Studio / compatible | Coding/terminal agent runtime ([GitHub](https://github.com/gitlawb/zero?utm_source=chatgpt.com)) |
| 20 | **protoCLI** | Local / self-hosted / OpenAI-compatible / Claude / Gemini | Terminal agent ([GitHub](https://github.com/protoLabsAI/protoCLI?utm_source=chatgpt.com)) |
| 21 | **Wuwei AI** | Multiple cloud/local models / BYOK | Desktop + terminal coding agent ([GitHub](https://github.com/wuwei-io/wuwei?utm_source=chatgpt.com)) |
| 22 | **CodeAgent** | Ollama | Fully local coding agent ([GitHub](https://github.com/ssevera1/CodingAgent?utm_source=chatgpt.com)) |
| 23 | **Open·Agent / openrouter-agent** | OpenRouter / Ollama | Lightweight terminal/file agent ([GitHub](https://github.com/Micorlov/openrouter-agent?utm_source=chatgpt.com)) |
| 24 | **Cortex / CortexPrism** | OpenAI / Claude / Gemini / Ollama / many others | Full agent OS + memory/tools/multi-agent ([GitHub](https://github.com/CortexPrism/cortex?utm_source=chatgpt.com)) |

Kalau difilter **paling mirip OpenClaw/Hermes**, bukan sekadar coding agent, shortlist-ku sekarang adalah:

**Agent Zero, nanobot, Personal AgentOS, gptme, MIRA, CortexPrism, Pernix, AgentArk, PocketPaw, AutoMate, OpenJarvis, Felix, Pan-Agent, AgentBridge, SelfAgent, dan goose.**

Jadi setidaknya sudah ada **±25–30 kandidat serius** dalam kategori yang kamu maksud. Dan masih ada lagi—aku bisa lanjutkan pencarian sampai membuat **master list 50–100 repository**, khusus yang memenuhi filter **“body agent sudah jadi → tinggal colok API/local model”**, sambil membuang library/framework murni seperti LangGraph/CrewAI yang tidak sesuai kriteriamu.

---

# you asked

message time: 2026-09-29 14:06:25

ya berikan 50 daftar repo github yang sesuai dengan kriteria yang aku cari

---

# chatgpt response

Aku akan buat **master list 50 repo** dengan filter ketat: repo harus berupa **agent runtime / personal AI / autonomous assistant / computer agent yang sudah punya badan**, lalu modelnya bisa dipasang lewat **API key, OpenAI-compatible endpoint, Ollama, LM Studio, vLLM, llama.cpp, atau localhost**. Framework murni akan aku singkirkan.

Ya. Aku sudah memperketat kriterianya: **bukan sekadar SDK/library**, tetapi repo yang sudah memiliki agent loop/runtime, tools, UI/CLI/server, memory/workspace/browser/computer-use atau orchestration, lalu modelnya dapat dipasang lewat **API key dan/atau local endpoint seperti Ollama, LM Studio, vLLM, llama.cpp, OpenAI-compatible API**.

### 50 repo GitHub yang sesuai

| # | Repository | Tipe | Pasang “otak” |
|---:|---|---|---|
| 1 | **openclaw/openclaw** | Personal agent runtime | Ollama, LM Studio, vLLM, API/cloud ([GitHub](https://github.com/openclaw/openclaw/blob/main/docs/concepts/model-providers.md?utm_source=chatgpt.com)) |
| 2 | **NousResearch/hermes-agent** | General autonomous agent | API + Ollama/vLLM/llama.cpp/LM Studio/custom endpoint ([GitHub](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/integrations/providers.md?utm_source=chatgpt.com)) |
| 3 | **agent0ai/agent-zero** | General computer agent | Ollama, LM Studio, cloud API ([GitHub](https://github.com/agent0ai/agent-zero/discussions/357?utm_source=chatgpt.com)) |
| 4 | **HKUDS/nanobot** | Personal agent runtime | API + custom OpenAI-compatible + Ollama/vLLM/LM Studio ([GitHub](https://github.com/HKUDS/nanobot/blob/main/docs/provider-cookbook.md?utm_source=chatgpt.com)) |
| 5 | **aaif-goose/goose** | General/coding agent | API + Ollama + LM Studio + self-hosted OpenAI-compatible ([GitHub](https://github.com/aaif-goose/goose/blob/main/documentation/docs/getting-started/providers.md?utm_source=chatgpt.com)) |
| 6 | **letta-ai/letta** | Persistent-memory agent | API + vLLM + LM Studio + LocalAI/custom endpoint ([GitHub](https://github.com/letta-ai/skills/blob/main/letta/letta-configuration/references/custom-endpoints.md?utm_source=chatgpt.com)) |
| 7 | **openinterpreter/openinterpreter** | Computer/coding agent | API + Ollama + LM Studio/local provider ([GitHub](https://github.com/openinterpreter/openinterpreter/blob/main/docs/quickstart.md?utm_source=chatgpt.com)) |
| 8 | **All-Hands-AI/OpenHands** | Software-engineering agent | API + Ollama/LM Studio/vLLM/SGLang ([GitHub](https://github.com/OpenHands/docs/blob/main/openhands/usage/llms/local-llms.mdx?utm_source=chatgpt.com)) |
| 9 | **FoundationAgents/OpenManus** | General-purpose agent | `model + base_url + api_key` ([GitHub](https://github.com/FoundationAgents/OpenManus?utm_source=chatgpt.com)) |
| 10 | **bytedance/UI-TARS-desktop** | GUI/computer-use agent | OpenAI-compatible VLM endpoint + API key ([GitHub](https://github.com/bytedance/UI-TARS-desktop/blob/main/docs/setting.md?utm_source=chatgpt.com)) |
| 11 | **gptme/gptme** | General terminal agent | API + Ollama + any OpenAI-compatible server ([GitHub](https://github.com/gptme/gptme?utm_source=chatgpt.com)) |
| 12 | **oezercet/SelfAgent** | Personal computer assistant | OpenAI/Claude/Gemini/OpenRouter/Ollama ([GitHub](https://github.com/oezercet/SelfAgent?utm_source=chatgpt.com)) |
| 13 | **Vexillon-ai/MIRA** | Personal agent runtime | API + local/OpenAI-compatible server ([GitHub](https://github.com/Vexillon-ai/MIRA?utm_source=chatgpt.com)) |
| 14 | **calvincs/Pernix** | Headless personal-agent server | Ollama/OpenRouter/OpenAI-compatible/LM Studio/vLLM ([GitHub](https://github.com/calvincs/Pernix?utm_source=chatgpt.com)) |
| 15 | **agentark-ai/AgentArk** | Secure personal agent | Ollama/OpenRouter/OpenAI/Claude/custom compatible ([GitHub](https://github.com/agentark-ai/AgentArk?utm_source=chatgpt.com)) |
| 16 | **pocketpaw/pocketpaw** | Desktop personal/multi-agent | Anthropic/OpenAI/Gemini/Ollama ([GitHub](https://github.com/pocketpaw/pocketpaw?utm_source=chatgpt.com)) |
| 17 | **supastishn/AutoMate** | Personal agent gateway | Any OpenAI-compatible endpoint, Ollama, LM Studio ([GitHub](https://github.com/supastishn/AutoMate?utm_source=chatgpt.com)) |
| 18 | **Danush-Aries/OpenJarvis** | JARVIS-style assistant | Ollama/MLX/vLLM/llama.cpp/API fallback ([GitHub](https://github.com/Danush-Aries/OpenJarvis?utm_source=chatgpt.com)) |
| 19 | **sausheong/felix** | Single-binary agent gateway | Claude/GPT/Gemini/Qwen/Ollama/LM Studio/compatible ([GitHub](https://github.com/sausheong/felix/?utm_source=chatgpt.com)) |
| 20 | **Euraika-Labs/pan-agent** | Full PC-control agent | OpenAI-compatible/Ollama/LM Studio/vLLM/llama.cpp ([GitHub](https://github.com/Euraika-Labs/pan-agent?utm_source=chatgpt.com)) |
| 21 | **Graphene-Lab/AgentBridge** | Multi-agent server | Cloud API + Ollama/local models ([GitHub](https://github.com/graphene-Lab/AgentBridge?utm_source=chatgpt.com)) |
| 22 | **csornyei/mimir** | Memory-first personal assistant | Ollama/llama.cpp/MLX/OpenAI-compatible ([GitHub](https://github.com/csornyei/mimir?utm_source=chatgpt.com)) |
| 23 | **lucianhanga/personal-ai** | Local personal AI | Ollama + remote OpenAI-compatible ([GitHub](https://github.com/lucianhanga/personal-ai?utm_source=chatgpt.com)) |
| 24 | **surfgolfski-dev/billy** | Telegram personal agent | Cloud API + Ollama/OpenAI-compatible ([GitHub](https://github.com/surfgolfski-dev/billy?utm_source=chatgpt.com)) |
| 25 | **cedricziel/assistant** | Self-improving assistant | Ollama/OpenAI/Anthropic/Moonshot ([GitHub](https://github.com/cedricziel/assistant?utm_source=chatgpt.com)) |
| 26 | **Decentralised-AI/AIOS-AI-Agent-Operating-System** | Agent operating system | OpenAI/Claude/Gemini/DeepSeek/Ollama/vLLM etc. ([GitHub](https://github.com/Decentralised-AI/AIOS-AI-Agent-Operating-System?utm_source=chatgpt.com)) |
| 27 | **Gitlawb/zero** | Coding/terminal agent | API + Ollama + LM Studio + compatible endpoints ([GitHub](https://github.com/gitlawb/zero?utm_source=chatgpt.com)) |
| 28 | **protoLabsAI/protoCLI** | Terminal agent | OpenAI/Claude/Gemini/custom OpenAI-compatible ([GitHub](https://github.com/protoLabsAI/protoCLI?utm_source=chatgpt.com)) |
| 29 | **wuwei-io/wuwei** | Desktop + terminal coding agent | Claude/API + vLLM/Ollama/OpenAI-compatible ([GitHub](https://github.com/wuwei-io/wuwei?utm_source=chatgpt.com)) |
| 30 | **Micorlov/openrouter-agent** | Lightweight local agent | OpenRouter + Ollama ([GitHub](https://github.com/Micorlov/openrouter-agent?utm_source=chatgpt.com)) |
| 31 | **JuanVictorFY/Jarvis** | Autonomous desktop agent | Ollama + OpenAI/Claude/Gemini ([GitHub](https://github.com/JuanVictorFY/Jarvis?utm_source=chatgpt.com)) |
| 32 | **Somi-Project/Somi** | Local AI operating stack | Ollama/local models ([GitHub](https://github.com/Somi-Project/Somi?utm_source=chatgpt.com)) |
| 33 | **gagans23/agent-os** | Self-improving Agent OS | Ollama/OpenAI/Claude + any compatible endpoint ([GitHub](https://github.com/gagans23/agent-os?utm_source=chatgpt.com)) |
| 34 | **use-agent-os/agent-os** | Personal Agent OS | 20+ providers, Ollama/vLLM/LM Studio/API ([GitHub](https://github.com/use-agent-os/agent-os?utm_source=chatgpt.com)) |
| 35 | **ai-action/code-ollama** | Local coding agent | Ollama ([GitHub](https://github.com/ai-action/code-ollama?utm_source=chatgpt.com)) |
| 36 | **sketler/openclaude** | Coding-agent CLI | Ollama/OpenAI-compatible/Gemini/Codex/etc. ([GitHub](https://github.com/sketler/openclaude?utm_source=chatgpt.com)) |
| 37 | **vmullassery/ollama-browser-agent** | Browser-control agent | Any OpenAI-compatible endpoint/Ollama/LM Studio/vLLM ([GitHub](https://github.com/vmullassery/ollama-browser-agent?utm_source=chatgpt.com)) |
| 38 | **Taylor-Bayouth/browser-agent** | Browser agent | OpenAI/Anthropic/Gemini/Ollama ([GitHub](https://github.com/Taylor-Bayouth/browser-agent?utm_source=chatgpt.com)) |
| 39 | **browser-use/web-ui** | Browser agent WebUI | OpenAI/Claude/Gemini/DeepSeek/Ollama etc. ([GitHub](https://github.com/browser-use/web-ui?utm_source=chatgpt.com)) |
| 40 | **browser-use/browser-use** | Browser automation agent | 15+ providers incl. Ollama/OpenRouter/API ([GitHub](https://github.com/browser-use/browser-use/blob/main/skills/open-source/references/models.md?utm_source=chatgpt.com)) |
| 41 | **RECTDEV/serenity** | Personal AI agent | Local Ollama models ([GitHub](https://github.com/RECTDEV/serenity?utm_source=chatgpt.com)) |
| 42 | **yepmdg/ollama-agent** | Offline ReAct agent | Ollama ([GitHub](https://github.com/yepmdg/ollama-agent?utm_source=chatgpt.com)) |
| 43 | **algsoch/accomplish** | Desktop AI coworker | BYOK + Ollama/LM Studio/cloud APIs ([GitHub](https://github.com/algsoch/accomplish?utm_source=chatgpt.com)) |
| 44 | **Mintplex-Labs/anything-llm** | Local agent/workspace platform | Ollama/LM Studio/LocalAI/API providers ([GitHub](https://github.com/Mintplex-Labs/anything-llm?utm_source=chatgpt.com)) |
| 45 | **langgenius/dify** | Self-hosted agent/workflow runtime | Many cloud/self-hosted models + OpenAI-compatible providers ([GitHub](https://github.com/langgenius/dify?utm_source=chatgpt.com)) |
| 46 | **Significant-Gravitas/AutoGPT** | Autonomous-agent platform | Self-host + BYO model API keys ([GitHub](https://github.com/significant-gravitas/autogpt?utm_source=chatgpt.com)) |
| 47 | **microsoft/magentic-ui** | Computer/browser agent | Any `/v1/chat/completions` endpoint, incl. vLLM/local ([GitHub](https://github.com/microsoft/magentic-ui/blob/main/docs/configuration.md?utm_source=chatgpt.com)) |
| 48 | **camel-ai/owl** | General multi-agent automation | OpenAI/Claude/Gemini/DeepSeek/Ollama/compatible ([GitHub](https://github.com/camel-ai/owl?utm_source=chatgpt.com)) |
| 49 | **elizaOS/eliza** | Agentic operating system | Model-agnostic provider/plugin runtime, local/cloud providers ([GitHub](https://github.com/elizaOS/eliza?utm_source=chatgpt.com)) |
| 50 | **danny-avila/LibreChat** | Self-hosted agent platform | Custom OpenAI-compatible + Ollama/MLX/OpenRouter/etc. ([GitHub](https://github.com/danny-avila/LibreChat?utm_source=chatgpt.com)) |

Menurut kriteriamu, **yang paling layak dibedah lebih dulu untuk kebutuhan “steal & use → Agent Core”** menurutku bukan 50 sekaligus. Kelompok yang paling dekat dengan **OpenClaw/Hermes DNA** adalah:

**Agent Zero, nanobot, goose, gptme, MIRA, Pernix, AgentArk, PocketPaw, AutoMate, OpenJarvis, Felix, Pan-Agent, AgentBridge, AgentOS, SOMI, Letta, AIOS, SelfAgent, Open Interpreter, dan elizaOS.**

Itu **20 repo prioritas tinggi**; sisanya tetap memenuhi pola “badan agent + otak pluggable”, tetapi lebih terspesialisasi ke coding, browser/computer-use, atau platform/workflow.

---

# you asked

message time: 2026-09-29 16:39:18

mari kita sedikit beri scope nya ke ai tools seperti kriteria yang aku cari tapi lebih nge-depanin self-improvement/self-learning/use-knowledge-from-learning layaknya hermes karna jika AI tools seperti hermes lebih membantu meski autonomous, hermes memanfaatkan pengetahuan lokal/memory-local lebih utama, seperti mencari kemungkinan masalah sulit di pecahkan hingga benar benar ter-pecahkan karna benar benar seperti menyambungkan setiap masalahnya keseluruhan dan solving semua nya menjadi sebuah kemungkinan pasti bisa karna ada nya data dan juga fakta

---

# chatgpt response

Ya, scope-nya sekarang jauh lebih jelas. Kita bukan mencari “agent yang bisa pakai tool”, tapi **agent yang belajar dari pengalaman, menyimpan hasil belajar secara lokal/persisten, memakai kembali knowledge itu pada masalah berikutnya, dan mampu menggabungkan evidence + memory + tool feedback sampai menemukan solusi**—lebih dekat ke karakter Hermes daripada sekadar autonomous executor.

Ya, ini membuat scope pencarian kita jauh lebih tajam.

Yang kamu cari sebenarnya bukan sekadar **“autonomous AI agent”** dan bukan pula sekadar **“agent + memory”**. Target utamanya adalah **cumulative-learning agent**: semakin sering dipakai, semakin banyak pengetahuan lokal yang terkumpul, semakin kecil kemungkinan mengulang kesalahan yang sama, dan semakin mampu menyelesaikan masalah sulit dengan menghubungkan fakta, pengalaman, workflow, error, solusi lama, serta evidence baru.

Hermes adalah contoh yang sangat pas. Background review-nya memang meninjau percakapan setelah turn, lalu dapat menyimpan pelajaran menjadi **memory** atau memperbarui **skill**. Skill digunakan sebagai procedural memory untuk workflow yang pernah berhasil, termasuk jalur yang ditemukan setelah error/dead-end. ([GitHub](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory.md?utm_source=chatgpt.com))

### Jadi filter baru kita

Aku akan lebih memprioritaskan repository yang mempunyai sebanyak mungkin karakter berikut:

1. **Persistent local knowledge**
   - memory tersimpan lokal;
   - tetap hidup setelah restart/session baru;
   - bukan hanya context window.

2. **Experience → Learning**
   - setelah task selesai/gagal, agent melakukan reflection/review/evaluation;
   - mengambil pelajaran dari keberhasilan maupun kegagalan.

3. **Learning → Reuse**
   - pengalaman lama benar-benar dicari kembali saat menghadapi masalah baru;
   - bukan sekadar menumpuk chat history.

4. **Procedural knowledge / Skills**
   - solusi multi-step yang berhasil dapat menjadi:
     `skill`, `playbook`, `procedure`, `rule`, atau reusable workflow.

5. **Failure-driven improvement**
   - pola ideal:
```text
Problem
 ↓
Attempt
 ↓
Failure / evidence
 ↓
Diagnosis
 ↓
Search previous knowledge
 ↓
Changed strategy
 ↓
Retry
 ↓
Verified solution
 ↓
Store lesson
```

6. **Cross-session cumulative intelligence**
   - session ke-100 idealnya punya advantage nyata dibanding session pertama.

7. **Evidence/fact oriented**
   - memory dapat menyimpan:
     - fakta;
     - provenance/source;
     - error;
     - successful correction;
     - reusable procedure;
     - confidence/evidence.

8. **Model tidak menjadi identity utama**
   - badan agent tetap sama;
   - otaknya bisa diganti:
```text
Claude
GPT
Gemini
OpenRouter
Ollama
LM Studio
vLLM
llama.cpp
localhost OpenAI-compatible
```

9. **Agent benar-benar bertindak**
   - terminal/files/browser/MCP/code/tools;
   - bukan chatbot memory saja.

10. **Learning lifecycle**
    Idealnya ada:
```text
capture
→ classify
→ deduplicate
→ retrieve
→ reuse
→ evaluate
→ refine
→ consolidate/archive
```

### Repository tipe ini sekarang menjadi prioritas

Dari pencarian awal, beberapa yang jauh lebih dekat dengan filosofi tersebut adalah:

| Prioritas | Repo | Mengapa menarik |
|---|---|---|
| **S** | **NousResearch/hermes-agent** | background self-improvement + memory + self-managed skills |
| **S** | **Mohamedhasbini/hermes** | implementasi kecil fokus pada agent loop + SQLite memory + self-written/refined skills ([GitHub](https://github.com/Mohamedhasbini/hermes?utm_source=chatgpt.com)) |
| **S** | **melvenac/Self-Improving-Agent** | persistent learning, pattern recognition, compound knowledge lintas session ([GitHub](https://github.com/melvenac/Self-Improving-Agent?utm_source=chatgpt.com)) |
| **S** | **lythelab/autonomous-agent** | continuous autonomous loop + reflection + persistent SQLite memory + resumable sessions ([GitHub](https://github.com/lythelab/autonomous-agent?utm_source=chatgpt.com)) |
| **A** | **ygmrs/self-improving-agent** | belajar rules dari verified feedback dan hanya mempertahankan learning yang lolos gate ([GitHub](https://github.com/ygmrs/self-improving-agent?utm_source=chatgpt.com)) |
| **A** | **aryasingh21-code/self-improving-ai-agent** | plan → execution → criticism → reflection → memory → improved planning ([GitHub](https://github.com/aryasingh21-code/self-improving-ai-agent?utm_source=chatgpt.com)) |
| **A** | **Ritikgit789/Self-improving-ai-agent** | failure analysis → learner → persistent memory → planning berikutnya ([GitHub](https://github.com/Ritikgit789/Self-improving-ai-agent?utm_source=chatgpt.com)) |
| **A** | **Agent Zero** | persistent memory + agent/tool environment kuat; perlu dicek seberapa cumulative learning-nya |
| **A** | **Letta** | sangat kuat pada persistent agent identity/memory; learning loop perlu dibedah source |
| **A** | **OpenClaw** | tubuh agent kuat + local knowledge; perlu difilter bagian self-learning sebenarnya |
| **B+** | **agentmemory** | confidence + lifecycle + graph + hybrid retrieval; lebih merupakan memory brain daripada full autonomous agent ([GitHub](https://github.com/bumjinkim/ai-agentmemory?utm_source=chatgpt.com)) |
| **B+** | **Stash** | persistent episodes/facts + consolidation lintas session ([GitHub](https://github.com/alash3al/stash?utm_source=chatgpt.com)) |
| **B+** | **Osiris** | durable reasoning/decision/coordination graph, provenance + confidence ([GitHub](https://github.com/asuramaya/osiris?utm_source=chatgpt.com)) |
| **B+** | **Lethe** | durable self-hosted memory lintas model/session ([GitHub](https://github.com/openlethe/lethe?utm_source=chatgpt.com)) |
| **B+** | **Persistent-Memory** | episodic + semantic + procedural memory + lifecycle ([GitHub](https://github.com/kavishj/Persistent-Memory?utm_source=chatgpt.com)) |

Yang kategori **B+** belum tentu memenuhi target sendirian, tetapi sangat menarik untuk **steal & use sebagai “otak ingatan/knowledge substrate”** bagi agent lain.

### Yang sekarang akan aku turunkan prioritasnya

Tool seperti:

```text
browser-use
OpenHands
Open Interpreter
UI-TARS
Dify
AutoGPT
general coding agents
```

masih berguna, tetapi kalau mereka hanya:

```text
Task
→ execute
→ selesai
```

tanpa:

```text
experience
→ learn
→ persist
→ retrieve
→ refine future behavior
```

maka untuk pencarian ini mereka **bukan target utama**.

Begitu juga repo yang hanya mempunyai vector DB/RAG biasa:

```text
save document
→ semantic search
```

belum cukup.

Yang kita cari lebih dekat ke:

```text
                  LOCAL KNOWLEDGE
                       ▲
                       │
             facts / procedures /
          corrections / failures /
             successful solutions
                       │
                       │
USER → AGENT → PLAN → ACT → OBSERVE
                 ▲        │
                 │        ▼
              REUSE    EVALUATE
                 │        │
                 │        ▼
                 └──── LEARN
                          │
                          ▼
                    MEMORY / SKILL
```

Dan bagian yang menurutku paling penting dari penjelasanmu adalah **“menyambungkan setiap masalahnya keseluruhan.”**

Artinya target tertinggi kita sebaiknya bahkan lebih spesifik lagi: agent yang bukan cuma *remembering*, tetapi mampu melakukan **knowledge synthesis**:

```text
problem sekarang
+
error sekarang
+
source/fakta baru
+
problem lama yang mirip
+
solusi lama
+
skill yang pernah berhasil
+
dependency / hubungan antar konsep
            ↓
    hypothesis baru
            ↓
       experiment
            ↓
        evidence
            ↓
     revised knowledge
```

Jadi untuk pencarian berikutnya aku akan memakai empat label utama:

**Persistent Agent + Self-Learning + Procedural Memory + Evidence-Grounded Problem Solving.**

Itu jauh lebih dekat dengan Agent Core yang sedang kamu arahkan: bukan AI yang sekadar “pintar saat ini”, tetapi **sistem yang mengakumulasi kemampuan karena pekerjaan yang pernah diselesaikannya sendiri**.

---

# you asked

message time: 2026-09-29 16:42:28

betul banget, bisa tolong carikan AI tools nya di repo github atau dimana pun lalu berikan aku link nya langsung agar aku bisa langsung pelajari

---

# chatgpt response

Aku akan fokus cari repo yang benar-benar punya kombinasi **persistent local memory + reflection/self-learning + reusable skills/procedures + autonomous tool use**, lalu aku kasih **link langsung** supaya kamu bisa buka dan pelajari satu per satu. Aku akan pisahkan mana yang paling dekat dengan Hermes dan mana yang lebih berupa “building block” memory/learning.

Bisa. Setelah scope kamu dipersempit ke **agent yang benar-benar tumbuh dari pengalaman**—persistent memory, reflection, reusable skills/procedures, failure learning, cross-session knowledge, dan autonomous problem solving—daftarnya berubah cukup drastis.

Aku pisahkan menjadi dua kelompok supaya kamu tidak membuang waktu.

### Paling dekat dengan filosofi Hermes — pelajari ini dulu

1. **Hermes Agent — Nous Research**  
Self-improvement loop, persistent memory, agent-managed procedural skills, background review, session search. Ini tetap benchmark pembanding utama kita. ([GitHub](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md?utm_source=chatgpt.com))  


2. **SAKU — Self-Adapting Knowledge Unit** ⭐  
Menurutku salah satu temuan paling menarik. Local-first, journal, reflection malam hari, principles, `MEMORY.md`, wiki sendiri, self-model, autonomous research, child agents, bahkan membuat tools sendiri. Bisa memakai OpenAI-compatible API. ([GitHub](https://github.com/omohikane/saku?utm_source=chatgpt.com))  


3. **CortexPrism** ⭐  
5-tier memory: episodic, semantic, procedural, graph, reflection. Yang menarik: **skill dapat diekstrak otomatis dari successful tool-call sequences** dan kemudian dipakai ulang. ([GitHub](https://github.com/CortexPrism/cortex/blob/main/docs/SKILLS.md?utm_source=chatgpt.com))  


4. **Conscio** ⭐  
Persistent cognitive runtime: memory, attention, self-state, prediction, reflection, goals dan autonomous action. Bisa hidup terus sebagai service, bukan hanya chat session. ([GitHub](https://github.com/Libertai/conscio?utm_source=chatgpt.com))  


5. **Agent Zero** ⭐  
General autonomous computer agent dengan persistent memory, solutions/knowledge reuse, skills, subagents, browser, Linux desktop dan tools. Philosophy-nya memang agent yang “grows and learns with you.” ([GitHub](https://github.com/agent0ai/agent-zero/blob/main/docs/guides/memory.md?utm_source=chatgpt.com))  


6. **Memmy Agent** ⭐  
Menarik karena merupakan **personal AI agent sekaligus local memory hub**. Bisa dipakai sendiri atau berbagi memory dengan Hermes, OpenClaw, Claude Code, Codex, dan lain-lain; juga punya BYOK model runtime. ([GitHub](https://github.com/MemTensor/memmy-agent?utm_source=chatgpt.com))  


7. **Pernix**  
Persistent Markdown memory, hybrid semantic recall, skills, parallel workers, browser, web, shell/files dan MCP. Lebih seperti always-on personal AI workstation. ([GitHub](https://github.com/calvincs/Pernix?utm_source=chatgpt.com))  


8. **auton**  
Autonomous agent dengan persistent memory, goals, scheduling, MCP dan messaging; seluruh state agent disimpan lokal. ([GitHub](https://github.com/damionrashford/auton?utm_source=chatgpt.com))  


9. **Autonomous Agent — LytheLab**  
Continuous autonomous planning → execution → reflection → persistent memory updates, plus resumable sessions. Sangat relevan untuk mempelajari long-running problem-solving loop. ([GitHub](https://github.com/lythelab/autonomous-agent?utm_source=chatgpt.com))  


10. **BajaClaw**  
All-in-one personal agent dengan memory, learned skills, cowork mode, providers, channels dan local API. Lebih dekat ke OpenClaw-style body. ([GitHub](https://github.com/backyarddd/BajaClaw/?utm_source=chatgpt.com))  


---

### Self-improvement / learning mechanism yang sangat layak dibedah

11. **Self-Improving-Agent — melvenac** ⭐  
Persistent learning lintas coding session, pattern recognition, accumulated lessons dan automatic reusable-skill proposals. ([GitHub](https://github.com/melvenac/Self-Improving-Agent?utm_source=chatgpt.com))  


12. **TELL — Test-time Experiential Lifelong Learning** ⭐  
Agent belajar dari pengalaman **selama runtime**, memperbarui persistent memory berdasarkan hypothesis/testing tanpa fine-tuning. Sangat relevan dengan ide “problem sulit → evidence → hypothesis → knowledge baru.” ([GitHub](https://github.com/studio-dots-ai/TELL?utm_source=chatgpt.com))  


13. **AutoMemory** ⭐  
Agent yang bahkan **mendesain dan meningkatkan memory system-nya sendiri**: menulis code, menjalankan eksperimen, mengevaluasi failure, mengubah strategi, lalu mencoba lagi. ([GitHub](https://github.com/Shelter41/automemory?utm_source=chatgpt.com))  


14. **MemSkill**  
Belajar **cara mengingat** dari hard cases; memory skills sendiri berevolusi berdasarkan feedback task. Ini meta-memory/self-improvement yang cukup unik. ([GitHub](https://github.com/ViktorAxelsen/MemSkill?utm_source=chatgpt.com))  


15. **skillmem** ⭐  
Coding agents belajar skill setelah task, me-recall sebelum task berikutnya, skill diperkuat ketika terbukti bekerja dan decay kalau tidak berguna. Local SQLite, provenance dan evidence-based reinforcement. ([GitHub](https://github.com/liza-studio/skillmem?utm_source=chatgpt.com))  


16. **Self-Evolving Agents**  
Eksperimen structured working memory untuk long-running agent; agent dapat merapikan, mengubah dan mempertahankan knowledge core selama tugas panjang. ([GitHub](https://github.com/LukasB97/self-evolving-agents?utm_source=chatgpt.com))  


17. **Principles of Earned Autonomy Skills Suite**  
Trail, Improve, Retrospect, Probe, Destination dan Intent membentuk workflow persist → inspect → improve → learn lintas run. ([GitHub](https://github.com/ntholm86/principles-of-earned-autonomy-skills-suite?utm_source=chatgpt.com))  


18. **Consciousness Framework**  
Persistent identity, episodic memory, autonomous reflection cycles dan self-directed goals; berjalan di atas agent seperti OpenClaw. ([GitHub](https://github.com/BotThrop/consciousness-framework?utm_source=chatgpt.com))  


---

### “Otak memory/knowledge” yang sangat cocok dipasangkan ke agent seperti Hermes/Agent Core

19. **Hindsight** ⭐  
Salah satu yang paling penting untuk kamu pelajari. Fokusnya bukan sekadar recall tetapi **“agent memory that learns”**—remember what worked/failed dan gunakan kembali untuk meningkatkan konsistensi. Hermes sendiri punya native Hindsight provider. ([GitHub](https://github.com/vectorize-io/hindsight/blob/main/README.md?utm_source=chatgpt.com))  


20. **MemOS** ⭐  
Self-evolving memory OS: long-term memory + tool traces + knowledge + feedback/correction + **cross-task skill reuse**. Sudah punya local plugin untuk Hermes dan OpenClaw. ([GitHub](https://github.com/Terrygmx/memos?utm_source=chatgpt.com))  


21. **OpenViking** ⭐  
Context database yang menyatukan **memory + knowledge + skills** dalam filesystem `viking://`; agent bisa benar-benar browse/edit knowledge-nya sendiri dan retrieval trajectory dapat diinspeksi. ([GitHub](https://github.com/volcengine/OpenViking/?utm_source=chatgpt.com))  


22. **Supermemory**  
Memory/context engine yang dapat self-host lokal; punya plugin untuk Hermes/OpenClaw/Codex/Claude Code dan lifecycle seperti forgetting serta contradiction handling. ([GitHub](https://github.com/supermemoryai/supermemory?utm_source=chatgpt.com))  


23. **SuperMemory Agent Learning**  
Berbeda dari repo Supermemory di atas. Ini specifically menyimpan **distilled lessons dari failure/correction**, melakukan validation sebelum store, lalu menjalankan closed learning loop. ([GitHub](https://github.com/YashvantHange/SuperMemory?utm_source=chatgpt.com))  


24. **Honcho**  
Memory infrastructure yang membangun representation dari users/agents/projects seiring waktu; reasoning dilakukan secara background dan bisa self-host. ([GitHub](https://github.com/plastic-labs/honcho?utm_source=chatgpt.com))  


25. **Mem0**  
Production-grade persistent memory layer untuk agents; sangat matang sebagai komponen memory meskipun self-learning procedural-nya tidak sedalam Hermes. ([GitHub](https://github.com/orgs/mem0ai/repositories?utm_source=chatgpt.com))  


26. **Cognee**  
Knowledge engine yang mengubah raw information menjadi persistent/dynamic memory menggunakan vector + graph + self-improvement. ([GitHub](https://github.com/ctclg/cognee/blob/main/README.md?utm_source=chatgpt.com))  


27. **JiuwenMemory**  
Menyebut dirinya **AutoGenetic Memory system**: memory bukan hanya store, tetapi aset yang berevolusi dan dapat dibagikan/migrasi antar-agent. ([GitHub](https://github.com/openJiuwen-ai/agent-memory?utm_source=chatgpt.com))  


28. **brAIn**  
Working + episodic + semantic + procedural + contact memory, dengan **sleep-cycle consolidation**, decay dan automatic promotion. ([GitHub](https://github.com/glthr/brAIn?utm_source=chatgpt.com))  


29. **agent-memory — Zijian Ni**  
Episodic + semantic + procedural memory, forgetting curve, retrieval reinforcement, graph relation seperti `caused_by`, `supports`, `contradicts`. ([GitHub](https://github.com/Zijian-Ni/agent-memory?utm_source=chatgpt.com))  


30. **Episodic Memory — lantisprime**  
Keputusan, discoveries, root causes dan behavioral patterns dapat dipersist lintas Claude Code, Codex, Cursor, Windsurf, dan lainnya. ([GitHub](https://github.com/lantisprime/episodic-memory?utm_source=chatgpt.com))  


31. **Episodic Memory — obra**  
Lebih fokus pada **search-before-reinventing**: agent diwajibkan mencari percakapan lama sebelum menebak atau mengulang investigasi yang sama. ([GitHub](https://github.com/obra/episodic-memory/blob/main/skills/remembering-conversations/SKILL.md?plain=1&utm_source=chatgpt.com))  


---

### Kalau targetnya Agent Core, aku akan pelajari urutan ini dulu

Menurut scope yang baru kamu jelaskan, **10 repo yang paling menarik untuk dibedah source-first** adalah:

**1. SAKU** → autonomous reflection + Markdown knowledge growth  
**2. CortexPrism** → automatic procedural skill extraction  
**3. Hindsight** → memory that learns from experience  
**4. MemOS** → memory → policies/world model → skill reuse  
**5. Memmy Agent** → full agent runtime + shared local memory  
**6. Conscio** → persistent cognitive/runtime reflection loop  
**7. TELL** → experiential lifelong problem solving  
**8. AutoMemory** → experiment/evaluate/improve loop  
**9. skillmem** → evidence-based skill reinforcement/decay  
**10. OpenViking** → inspectable memory + knowledge + skills filesystem

Kalau tujuannya **mencuri mekanisme yang bisa membuat Agent Core semakin “susah menyerah” ketika problem kompleks**, aku terutama akan membandingkan:

**Hermes + SAKU + CortexPrism + TELL + Hindsight + AutoMemory.**

Keenamnya secara bersama-sama menutupi hampir seluruh loop yang kamu gambarkan:

`observe → remember → search old knowledge → hypothesize → act → fail → diagnose → retry differently → verify → crystallize lesson → reuse next time`.