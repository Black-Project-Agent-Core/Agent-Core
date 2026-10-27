# Third-party notices for selected adoption mechanisms

This file records notices for selected source-backed adaptations and direct helper dependencies; it is not an exhaustive license inventory of every transitive dependency. No Anthropic SDK runtime, Serena application runtime, SIE Python/AVO runtime, or MarkItDown Python/MCP/plugin runtime is bundled by these changes.

## Microsoft MarkItDown document-projection mechanism reference

Agent Core's native document-projection subsystem independently adapts converter negotiation, format-specific semantic projection, nested archive dispatch, stream/type evidence, and conversion-error privacy behaviors inspected in Microsoft MarkItDown revision `b8f79c57ebc0044be41323d89b2a45d3fda8460e`. The implementation is native TypeScript under Agent Core's existing `read_file` authority; no MarkItDown Python package, MCP server, arbitrary plugin loader, OCR model, cloud document provider, or hidden model call is bundled.

MarkItDown is licensed under the MIT License. Copyright (c) Microsoft Corporation. Permission is granted under the upstream MIT terms, including retention of its copyright and permission notice. The upstream MarkItDown checkout also contains separately attributed Apache-2.0-derived DOCX math code; Agent Core did not port that math code in this adoption.

Direct helper dependencies added for this capability are `@xmldom/xmldom` 0.9.12 (MIT), `node-html-markdown` 2.0.0 (MIT), `chardet` 2.2.0 (MIT), `cfb` 1.2.2 (Apache-2.0), and `@e965/xlsx` 0.20.3 (Apache-2.0) for bounded legacy BIFF/XLS semantic reading. Their package license files remain authoritative; the Apache-2.0 license text is also retained later in this notice file.

## Anthropic SDK mechanism references

Incremental response framing and ownership/file-stamp mechanisms were adapted independently to native Agent Core consumers. Reference revisions: Python 0af0190679a9e80388bd1b0328d557c9a91a11b2; TypeScript 3c5d9c0c15bb847a628f3f2876ac09719abe3012.

Copyright 2023 Anthropic, PBC.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


## SolidLSP text-position mechanism

TextStepper newline handling from src/solidlsp/ls_utils.py at Serena 9f19a79a045f3f2681ba7b58f88938b83a81ca8f informed the native UTF-16 implementation. Only the separately MIT-licensed SolidLSP component is referenced; the GPL Serena application is not transplanted.

MIT License

Copyright (c) 2025 Oraios AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Grafel selected provider adaptation

The isolated provider source retains its LICENSE. The selected process guard is copied from Grafel 5eb5be1255aa7583b6310daf6d98c4fa648c4031; incremental import finalization reuses the provider-owned classifier and resolver.

MIT License

Copyright (c) 2026 Jorge Cajas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Self-Improving Agent Ecosystem evidence semantics

Native Learning contracts and test cases are independently adapted from the reference mechanisms and adversarial examples at revision f06504750b32c3b6a6e06b56ee6e69dc4476f333. Source: Git-on-my-level/self-improving-agent-ecosystem. No upstream verifier, installer, autonomous loop or Python runtime is embedded.

MIT License

Copyright (c) 2026 David Zhang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## GEPA coverage-preserving redundancy reduction

`src/learning/retrieval-portfolio.ts` narrowly adapts `remove_dominated_programs` / `is_dominated` from `gepa-ai/gepa`, commit `d771eb21b5dd3228bc3f567293d2ccfc423fc900`, `src/gepa/gepa_utils.py`. The native implementation uses bounded inputs, stable report-ID ties and a monotone coverage-count pass. It is not conventional pairwise Pareto dominance, an optimizer, random selector or deployment controller. No GEPA runtime is installed.

Copyright © 2025 Lakshya A Agrawal

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


## Shiploop verification-output mechanism reference

The explicit verification-output compactor was independently reimplemented for Agent Core after source study of Shiploop `templates/govern/verify-filter.sh` at revision `a238ad853916fd92319c20b83646abd0cde251cc`. No Shiploop runtime, Bash governor, hook, worker, or dependency is bundled.

shiploop
Copyright 2026 Ansh Saxena

This product includes software developed by Ansh Saxena
(https://github.com/anshss/shiploop).

Licensed under the Apache License, Version 2.0.

## Reef behavioral-effect evidence reference

The RF-P3 Learning effect-evidence boundary was independently adapted from behavioral-review semantics in Reef history available from the retained reference at `5ffac29acddeda199eca369aaf7edf837f642a80`. No Reef trainer, inference runtime, executor, service, model, or dependency is bundled.

Reef is licensed under the Apache License, Version 2.0.
Copyright 2025 Zhipu AI.

## Apache License, Version 2.0

The following Apache License text is retained for the Apache-2.0 source references in this file.

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2025 Zhipu AI

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
## GenericAgent checkpoint/rewind mechanism reference

Agent Core's native file-checkpoint service was independently adapted from the content-addressed checkpoint-tree behavior inspected in GenericAgent revision \`e86ca723a9439acef38349180b33ee31f45e3388\`, especially \`frontends/worldline.py\`. No GenericAgent runtime is installed.

MIT License — Copyright (c) 2025 lsdefine. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to inclusion of the copyright and permission notice. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## AutoResearchClaw verified-value mechanism reference

The Learning numeric-provenance registry independently adapts the verified-value/provenance behavior inspected in AutoResearchClaw revision \`be4ba4755bf1b52220f25e13b2293b5956590070\`, especially \`researchclaw/pipeline/verified_registry.py\`. No AutoResearchClaw runtime, literature pipeline, or repair agent is installed.

MIT License — Copyright (c) 2026 Aiming Lab. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to inclusion of the copyright and permission notice. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## atomic-hermes result-budget and process-lifecycle mechanism references

The native MCP result-budget and process-ledger mechanisms independently adapt bounded result spill and crash-recoverable process-registry behavior inspected in atomic-hermes revision \`d73323210d1f6e01325f4e112371a14fede93c78\`, especially \`tools/tool_result_storage.py\` and \`tools/process_registry.py\`. No atomic-hermes agent/gateway runtime is installed.

MIT License — Copyright (c) 2025 Nous Research. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to inclusion of the copyright and permission notice. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## EvoAgentX quality-diversity and convergence evidence references

The offline Learning diversity archive and stability advisory independently adapt behavior inspected in EvoAgentX revision \`d77fd6b9a3e76c8dd83bebe3374c53a3f5d16f54\`, including \`optimizers/map_elites_optimizer.py\` and the AFlow-derived \`utils/aflow_utils/convergence_utils.py\`. No EvoAgentX optimizer, workflow runtime, model client, or vector store is installed.

EvoAgentX: MIT License — Copyright (c) 2025 EvoAgentX. AFlow-derived portions retain their MIT attribution to Chenglin Wu / MetaGPT AFlow as recorded by the upstream EvoAgentX LICENSE. Native Agent Core code is bounded and independently implemented.

## OpenViking behavioral reference boundary

OpenViking revision \`184a5cecef0612a893a8db5718674b3084c6811b\` is GNU AGPL-3.0. No OpenViking source code, package, server, VFS, memory engine, or runtime is incorporated into Agent Core. Its task-lifecycle/concurrency tests were used only as behavioral evidence for a clean-room TypeScript hardening of Agent Core's own process ledger. This provenance note does not relicense Agent Core or imply redistribution of OpenViking code.


## Memori BM25 lexical-ranking mechanism reference

Agent Core's optional `memory_search(rankingProfile="bm25")` profile independently adapts the bounded BM25 lexical-scoring and short-query weighting behavior inspected in Memori's `memori/search/_lexical.py`, `memori/search/_core.py`, and `core/src/retrieval/pipeline.rs`. No Memori runtime, database layer, cloud service, Rust engine, storage adapter, or model integration is bundled.

The inspected checkout's Git object store was degraded, so source-byte anchors are retained instead of claiming a healthy Git revision: `_lexical.py` SHA-256 `930165C2CD24A94676B31D473B51960E2A7D740B1940BE7EA719253FC98E2725`; `_core.py` SHA-256 `4C2C39F38D40BADFA11D7CE3C7F6160A0ED6F563E994DDF9D5FFF73F768FEB8F`; Rust retrieval pipeline SHA-256 `06FA968C97E451D63A81CE6D8D45B8E77EE63B65275B883073A9E093B439A6CA`.

Memori is licensed under the Apache License, Version 2.0. Copyright 2025 Memori Team. The Apache-2.0 license text is retained in this file above.


## Jev Ultrafast structured-browser mechanism reference

Agent Core's native `browser_control` structured-DOM lane independently adapts bounded observed-action, live-node identity, semantic freshness, current-geometry/occlusion, no-blind-mutation-retry, short autocomplete settling, and independent final-state verification behavior inspected in Browser Use Jev Ultrafast revision `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`. No TypeSafe decision service, hidden text model, Python agent runtime, Browser Harness runtime, demo server, or site-specific Google Flights logic is bundled.

Source-byte anchors retained before reference retirement: `jev_ultrafast/snapshot.js` SHA-256 `900217823BBDC13DD7ACC738BF93D77AE427BBAB0CAE167E213C45B887C7DD2F`; `jev_ultrafast/browser.py` SHA-256 `243C2D37946DD144A70B416B5D6F7103047A5CF22A954542BF2064EC127C1624`; `jev_ultrafast/agent.py` SHA-256 `F903E3587D7995DF6ECEEBFADBD90D653675F3EF84FA73B7346D912CBBCE29E5`; `tests/test_agent.py` SHA-256 `7214B11827B58C39F487523EBBEF9EC708748255E712BB328821293B8EC6B48A`; `scripts/check_guards.py` SHA-256 `EEDCDD8A2DB76547BB9C42430AC3975061917ABC40E16DDC3D799775609A599A`.

Jev Ultrafast is licensed under the MIT License. Copyright (c) 2026 Browser Use. Permission is granted under the upstream MIT terms, including retention of its copyright and permission notice.

## GitHub Spec Kit security/tooling mechanism references

Agent Core's Semantic IDE archive preflight hardening and read-only adoption-plan readiness inspector independently adapt bounded download/archive validation, portable path collision checks, no-overwrite/read-only prerequisite evidence, and machine-readable inspection behavior examined in GitHub Spec Kit revision `307b3a537fb39721adc7c00aa18adfa1582649aa`. No Spec Kit workflow/DAG engine, extension/preset/bundle marketplace, `.specify` project authority, auth store, event bus, or hidden integration router is installed.

Source-byte anchors: `src/specify_cli/_download_security.py` SHA-256 `62CC2B246EBCCF0800B4781BB4B88CCA71B8C4E131699A83F838A1CBC47595D0`; `tests/test_download_security.py` SHA-256 `A21DDE731422017699F3ABE5CA19A26F80A7DC98BE0475F6DA118FCE7E20ACDD`; `scripts/python/setup_plan.py` SHA-256 `4371353B509FF352DA27846E6E68D495FCE2F9EEDA87C28A39F8DC9D5354E438`; `scripts/python/check_prerequisites.py` SHA-256 `368E364D1E08E67AE7C19B46B4E41A35596D6A9468CA7CB391C23E7BF0AE1B88`.

GitHub Spec Kit is licensed under the MIT License. Copyright GitHub, Inc. Permission is granted under the upstream MIT terms, including retention of its copyright and permission notice.


## Graft changed-symbol review mechanism reference

Agent Core's native changeset review projection independently adapts the changed-hunk to innermost-symbol seeding, bounded review evidence, behavioral test-reach classification, and bounded Git ownership ideas inspected in Graft / Context Graph Engine revision `65c29667bd59d7137caba8f6f5b5790e2d1f9404`. Agent Core continues to use Grafel as its only structural graph provider and does not bundle Graft's graph store, parser fleet, MCP server, model transports, app, or telemetry runtime.

Graft / Context Graph Engine is licensed under the MIT License. Copyright (c) 2026 Context Graph Engine contributors. Permission is granted under the upstream MIT terms, including retention of the copyright and permission notice.

## Graphify graph-integrity and source-coverage mechanism references

Agent Core's native Code Intelligence observability independently adapts fail-closed accepted-graph shrink detection, incomplete-build preservation, per-source under-production evidence, and explicit unclassified/source-representation reporting inspected in Graphify revision `26b02b5e3430e4ab85dd7e72c7b98836d8e65c48`. No Graphify Python runtime, NetworkX graph store, parser fleet, Neo4j/FalkorDB backend, MCP server, LLM backend, host installer, watcher, exporter, or work-memory layer is bundled.

Graphify is licensed under the Apache License, Version 2.0. Copyright 2026 Safi Shamsi and the Graphify contributors. Portions were contributed under MIT before relicensing, as recorded by the upstream NOTICE; the Apache-2.0 license text is retained earlier in this notice file.


## ShinkaEvolve Pareto mechanism adaptation

Agent Core's native `src/learning/retrieval-pareto.ts` independently adapts the pairwise non-dominance and maximize/minimize orientation mechanism inspected in `shinka/plots/plot_pareto.py` at revision `fd583c15ebcb12ec662a7cd921baf4203572e492`. Native validation, comparison-group boundaries, explicit missingness, dominance witnesses, resource provenance, and immutable CLI report handling are Agent Core modifications. No Shinka evolution runtime, Python plotting dependencies, scheduler, model selector, or autonomous experiment generator is installed.

ShinkaEvolve: Copyright 2025 Sakana AI. Licensed under the Apache License, Version 2.0. The Apache-2.0 license text is retained earlier in this file. The inspected local fork origin is N-I-ckel/shinkaevolve; its package metadata points to SakanaAI/ShinkaEvolve.

## SystemOneHarness browser mechanisms adaptation

Agent Core's native browser-control helpers independently adapt current-control-state projection, quantized canvas observation, enumerated tab navigation, and finite press/hold/back primitives inspected in `systemone_harness/envs/browser.py` at revision `ab8e8f08b4a6268c0633a474423d556599ee06a4` (HarnessRouter/SystemOneHarness). The native implementation changes identity binding, visibility/value safety, alpha handling, output budgets, focus/history checks and guaranteed best-effort key release. It does not copy the donor confidence gate, autonomous controller, Browser Use runtime, UHP server, extension, provider/credential stack, or model-generated success semantics.

SystemOneHarness is licensed under the Apache License, Version 2.0. The Apache-2.0 license text is retained earlier in this file. Donor file/revision evidence remains in the source-grounded integration plan and audit inventory.

## A-Evolve descriptive curve conventions

The native `src/learning/retrieval-curve.ts` is an independent implementation of the reviewed mathematical definitions: last-minus-first score and mean of prefix means (the donor's named AULC convention, not trapezoidal area). The design reference is A-EVO-Lab/a-evolve revision `18ba996dac9843f2759b2cdf8a94022f58fbfeb9`, particularly `agent_evolve/utils/metrics.py` and score-curve/history readers. No donor source was copied verbatim. Its inspected package metadata declares MIT, but a complete LICENSE/NOTICE was absent; no missing copyright notice is invented here. No A-Evolve optimizer, Python runtime, automatic rollback or model provider is bundled.

## AgentOS byte references and selected-tool membership

The native verified-result-artifact reader/writer integration and credential tool-grant membership adapt design mechanisms inspected in smartcomputer-ai/agent-os revision `ec63cb775306f0728a65a4045b6b0457a025af36`: host output materialization, filesystem CAS byte checks, tool registry validation, and selected-tool batch dispatch. Native changes add bounded same-descriptor reads and snapshot pagination, redacted JSON references, bearer/OAuth metadata integration, and SDK enforcement before mutation admission. No donor Rust/AIR kernel, CAS database, governance runtime, fabric cluster or model service is bundled. Credential binding is an Agent Core extension, not a claim that the donor implements scoped bearer keys.

AgentOS executable code: Copyright (c) 2025 Smart Computer Co. and the AgentOS contributors. Licensed under the Apache License, Version 2.0; the full Apache-2.0 terms are retained earlier in this file. The separate AIR/schema specification license was not used to claim that code and specification licenses are interchangeable. The absent smolvm submodule was not copied or bundled.

## AGiXT resolve-and-pin design reference

The optional public-only URL read lane is an independent native implementation informed by `agixt/XT.py` at AGiXT revision `3a3202419a962aa815d139849d6f218d3f81c998`: validate resolved addresses, bind the connection to a selected address, and validate redirects. The inspected root MIT notice names Copyright (c) DevXT LLC 2025. No AGiXT Python source, runtime, trusted-local bypass, bot, provider, cache or installer is bundled by this adaptation. Agent Core adds its own conservative address profile, native TLS/peer checks, streaming bounds and byte-only format handling. The IANA IPv4 and IPv6 special-purpose registries were consulted as address-allocation references, not copied as code or treated as proof of remote content trust.

## AIOS workbook-rule design reference

The explicit native workbook assertion CLI independently implements selected artifact comparisons informed by `aios/tool/virtual_env/evaluators/metrics/table.py` at agiresearch/AIOS revision `292d98f78c835499df18cdb6de6325bba1895862`. No Python evaluator, pandas/openpyxl stack, OSWorld VM, scheduler or model runtime is copied or bundled. Existing ExcelJS, ZIP/XML and native file guards retain their existing dependency licences.

The inspected AIOS root LICENSE contains only whitespace. The Apache-2.0 declaration in its experimental Rust scaffold does not establish a blanket licence for its Python or embedded evaluator sources. This adaptation uses independent native implementation and does not invent absent copyright attribution or transfer linked/embedded components under the scaffold's metadata.

## CORAL local evidence-reference mechanism

The explicit native evidence-link verifier is independently implemented from the local source-reference checking idea inspected in `coral/template/skills/deep-research/scripts/check_grounding.py`, CORAL revision `0123dfb939b35228cf2c1fde224cd0561e727408` (Human-Agent-Society/CORAL). Native changes replace inferred Markdown and confidence scores with operator-declared document hashes, literal paths and line ranges, bounded descriptor snapshots, full-byte freshness checks, and explicit unavailable outcomes. No CORAL hub, template runtime, grader, sandbox, model or agent is bundled.

The inspected CORAL root licence is Apache License, Version 2.0; its full terms are retained earlier in this file. Separately licensed vendor/example/template material is not incorporated by this change.

## GEA task-success-vector novelty mechanism

The pure `retrieval-novelty.ts` analysis adapts nearest-neighbor cosine distance and performance-times-square-root-novelty arithmetic inspected in `GEA_outer.py::select_parents_by_performance_novelty` at GEA revision `d185edffd1f9fbd2297f4de8c6c9f94547448b6d` (UCSB-AI/GEA). Native modifications use verified profile cases, deterministic ties, conservative cohort/split partitions, explicit undefined zero vectors and bounded pair work. It never selects parents, generates candidates or runs the GEA optimizer, Docker tools or benchmark harness.

The inspected GEA root licence is Apache License, Version 2.0; its full terms are retained earlier in this file.

## MetaClaw stale-subject feedback design reference

The optional Memory body-digest feedback guard independently applies the stale-subject evidence principle inspected in MetaClaw revision `e727cf86842b6411ad13591859349bb5a1fe3e69` (qhz991029/metaclaw), particularly `data_formatter.py::ConversationSample`, `api_server.py` sample tagging, and `trainer.py` generation filtering. Agent Core uses an exact ID/body digest and its existing canonical lock, not a generation counter, trainer, skill mutator, inference proxy, scheduler or online-RL process. No MetaClaw Python source is copied verbatim.

The inspected MetaClaw MIT notice names Copyright (c) 2026 Peng Xia, Jianwen Chen, Xinyu Yang, Siwei Han, Shi Qiu, Zeyu Zheng, Cihang Xie, Huaxiu Yao. The upstream MIT permission and disclaimer are preserved with the source evidence; native design additions do not claim a transferred RL implementation.

## Batch 1: native public web evidence

### web-fetch envelope mechanism reference

Agent Core independently adapts result/provenance/error-envelope semantics inspected in `code-yeongyu/web-fetch`, revision `9af775ff57af401afcce20b7ce5c53a051c630d2`, `scripts/web_fetch.py`. Its Python runtime, browser impersonation and dependencies are not bundled. The existing Agent Core public-address transport remains the network authority. Upstream license notice:

MIT License

Copyright (c) 2026 Yeongyu Kim

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### Wrtn web-content-extractor

Density and ancestor/subtree-selection mechanisms in `src/rdc/document-projection/html-main-content.ts` are adapted from `wrtnlabs/web-content-extractor` revision `4cdefff7726a9612bb828d1416becfc5715f8310`, `src/compute-text-density.ts` and `src/extract-content.ts`. Agent Core uses its existing public node-html-markdown hooks, explicit main scope, bounded traversal and conservative full-content fallback. No donor parser package or separate service is installed.

MIT License

Copyright (c) 2025 Wrtn Technologies

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


### Qwen Code bounded text prefix

The safe UTF-16 prefix and bounded truncation notice in `src/web-research/service.ts` adapt `packages/core/src/core/tool-hook-context.ts` from `QwenLM/qwen-code`, revision `e9789d091133d9753decfc139df64c935a1866e6`. Copyright 2026 Qwen Team. Licensed under Apache-2.0; the full Apache License 2.0 is retained above in this file. Agent Core changes the context to web content, applies redaction before truncation, retains a bounded visible notice and reports explicit truncation metadata. No Qwen hook engine or model runtime is bundled.


## Batch 5: bounded lexical fusion diversity

The missing-vector redundancy mechanism in `SubProject/agent-core-memory/src/memory/retrieval.ts` adapts token-set Jaccard selection from xAI Grok Build, `crates/codegen/xai-grok-memory/src/mmr.rs`, revision `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`. Copyright 2023-2026 SpaceXAI. Licensed under Apache-2.0; the full Apache License 2.0 is retained above. Agent Core preserves native vector/vector cosine and MMR relevance, adds invocation-local content/token/pair limits and incremental maxima, and treats empty or incomplete token sets as unavailable. No donor crate, database, configuration or runtime is bundled. A root NOTICE was not found at the inspected pin; that observation does not describe every donor subtree.

## Batch 6: bounded PDF evidence patterns

The capability/result declaration pattern from ParserTry (`leeryong/ParserTry`, revision `efc01d8ab1a350f14d74f614443f01bcba5d1071`) and metadata-preserving serialization pattern from OpenDataLoader PDF (`opendataloader-project/opendataloader-pdf`, revision `2fd4b076f7e175aa33cd4d4e51f72a9447c51920`, Apache-2.0) inform an independent implementation in the existing Agent Core PDF owner. No substantive donor source is copied; ParserTry licensing remains unresolved. Agent Core continues to use the existing MIT-licensed `@opendocsg/pdf2md` 0.2.9 dependency, without an additional parser, OCR engine or runtime.

## Batch 2: native Skill discovery and revision-bound reads

These mechanisms are independently implemented in TypeScript in Agent Core's existing SkillService and context owners. No donor runtime, database, Python module, or substantial donor source is bundled.

- SkillPort, `gotalab/skillport` revision `51334ae94919fc1c261673ffefdce9176c9094ef`: metadata-first search and selected loading inspected in `packages/skillport-core/src/skillport/interfaces/mcp/tools.py` and `modules/indexing/internal/search_service.py`. MIT, Copyright (c) 2025 Gota. Agent Core retains its own digest, grants and lifecycle.
- Voyager, `MineDojo/Voyager` revision `55e45a880755d0c8c66ca7fb5fe7962ac8974f89`: description-based semantic candidate retrieval inspected in `voyager/agents/skill.py`. MIT, Copyright (c) 2023 MineDojo Team. Agent Core uses explicit opt-in, its existing embedder and bounded ephemeral vectors; no Chroma, Minecraft or generated-description pipeline.
- AutoSkill, `ECNU-ICALK/AutoSkill` revision `94c47ca488d4ba4117d20272e66d49b9877e68cf`: descriptor/applicability design inspected in `autoskill/interactive/selection.py` and `retrieval.py`. A root license was not available in the inspected revision. No source is copied; applicability parsing is an independent implementation over Agent Core's existing Trigger/Non-trigger sections.

The MIT permission and warranty disclaimer reproduced in this file apply to the MIT-licensed reference notices above; attribution does not assert inclusion of their complete implementations.

## REA (morluto/rea), selected static artifact-analysis mechanisms — 2026-10-15

Native Agent Core `src/artifact-analysis/` independently adapts bounded directory/ASAR admission, JavaScript/Electron static declaration analysis and PE/CLI managed metadata/native-boundary patterns inspected from `morluto/rea` at commit `788964d52c62aa5b29b342e31b37fe63a27d69d1` (REA 6.5.0). The adaptation uses the existing Agent Core identity, authorization, worker lifecycle and TypeScript runtime; the donor REA runtime, binary engine registry, CLR execution, commercial engines, decompiler and entire dependency tree are **not** bundled. See `docs/Batch13-Hooks-REA-Windows-Implementation-20261015.md` for scope and limitations.

The selected upstream REA-authored source is licensed under the **MIT License**, Copyright (c) 2026 morluto. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

This attribution does **not** license third-party target artifacts. The provenance concerns only the selected REA-authored mechanisms; vendor/dependency licenses remain independent.


## Open Browser Use internal browser transport — 2026-10-18

`src/rdc/browser-control/open-browser-use-rpc.ts` adapts framing and pending-request correlation from `iFurySt/open-browser-use`, revision `b136cac71a3c497b5696aefd871dd15cba7d7559` (`packages/open-browser-use-js/src/index.ts` and `internal/wire/frame.go`). Upstream: https://github.com/iFurySt/open-browser-use. MIT License, Copyright (c) 2026 Leo; the complete permission and warranty notice is retained in `src/rdc/browser-control/open-browser-use-LICENSE.txt` and must accompany distribution.

Agent Core adds bounded framing, its own session/turn identity, filtered tab events, unknown-outcome handling and owned helper lifecycle. The stdlib Go IPC helper is independently authored. The optional managed lifecycle also adapts `internal/host/relay.go` into `src/launcher/BrowserUseNativeHost.cs`, and bundles the selected `apps/chrome-extension` assets under `extensions/agent-core-open-browser-use` with their full MIT notice. That dedicated-profile copy changes its native host name and retains the upstream public extension key. The donor CLI, SDK package, MCP server and setup/registry writer are not bundled. Existing BrowserControlService owns the capability and public action evidence.
# Bundled REA Skill instructions

`runtime/skills/capability-packs/reverse-engineer-anything` retains the MIT license in its `LICENSE` file and operational references matching `rea-agents@6.5.0` (upstream Skill revision 42). The adapted launcher reuses an existing isolated runtime; the distribution includes a pinned dependency manifest/lockfile, not a decompiler or native provider. Runtime dependencies retain their own licenses when restored. The performance Skill is the user's supplied artifact; no additional third-party license is asserted for it.
