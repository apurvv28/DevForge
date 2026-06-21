# [1.3.0](https://github.com/apurvv28/DevForge/compare/v1.2.0...v1.3.0) (2026-06-21)


### Bug Fixes

* release and ci pipelines ([889b163](https://github.com/apurvv28/DevForge/commit/889b163cd42129072851af768a0c37b28d7be266))


### Features

* implement jenkinsfile generation (phase 1) and disable release workflow ([84666b4](https://github.com/apurvv28/DevForge/commit/84666b411d59091adc71edd0d240ebee340de7db))
* jenkins automated pipelines integration ([f58966a](https://github.com/apurvv28/DevForge/commit/f58966a760c3e33eb42c1f9320209d46b65fdddc))

# [1.3.0](https://github.com/apurvv28/DevForge/compare/v1.2.0...v1.3.0) (2026-06-19)


### Features

* **jenkins:** implement automated Jenkins job & repository setup CLI command (`devforge jenkins setup`)
* **jenkins:** automatically generate configuration-as-code (`jenkins.yaml`) for Jenkins controllers
* **jenkins:** extend `devforge audit` to scan Jenkinsfile contents for hardcoded credentials, unpinned tools, missing concurrency prevention, and other performance/security best practices
* **git:** add Git utility helpers for remote origin detection and parsing

# [1.2.0](https://github.com/apurvv28/DevForge/compare/v1.1.5...v1.2.0) (2026-06-13)


### Features

* add deploy command, AWS deploy executor, deploy plan, and fix release smoke test ([0651ccf](https://github.com/apurvv28/DevForge/commit/0651ccfea21622706f8c49d2b3a3866b1f6a1e83))
* add Grok provider and AWS CLI deployment guide generation ([ee55af5](https://github.com/apurvv28/DevForge/commit/ee55af58abdbc11920951dd96ba53366ad26eeed))

## [1.1.5](https://github.com/apurvv28/DevForge/compare/v1.1.4...v1.1.5) (2026-06-10)


### Bug Fixes

* extend patch script to cover langgraph graph.cjs and messages_reducer.cjs ([834c8cf](https://github.com/apurvv28/DevForge/commit/834c8cf0eaad2ddd74893d5d3049f9b56cefc69b))

## [1.1.2](https://github.com/apurvv28/DevForge/compare/v1.1.1...v1.1.2) (2026-06-10)


### Bug Fixes

* remove uuid override and direct dep, regenerate lock file ([0792556](https://github.com/apurvv28/DevForge/commit/079255610af223dee49f3453430f090a823802ea))
* uuid package issues ([5c09ae9](https://github.com/apurvv28/DevForge/commit/5c09ae9602da5f65c3bc62c9e62d1aba1ad57cd6))

## [1.1.1](https://github.com/apurvv28/DevForge/compare/v1.1.0...v1.1.1) (2026-06-10)


### Bug Fixes

* config ([38dfb31](https://github.com/apurvv28/DevForge/commit/38dfb3132e2da2b4c0b61d7eec591f1483fcc406))
* pckg config ([43382c4](https://github.com/apurvv28/DevForge/commit/43382c4629faf12dd43c0189ef1da2a3e75e6bf2))

# [1.1.0](https://github.com/apurvv28/DevForge/compare/v1.0.1...v1.1.0) (2026-06-10)


### Bug Fixes

* bug-fixed ([9e76bc7](https://github.com/apurvv28/DevForge/commit/9e76bc7ab4ca9fe5398da796640bb02b15966340))
* bugfixes ([06ba02b](https://github.com/apurvv28/DevForge/commit/06ba02bce99afaa8aa5f0dcd8ceea7381ec807cb))
* ecs, eks yaml file checks ([873b7e1](https://github.com/apurvv28/DevForge/commit/873b7e1b85db36f19bd741a15995d255d681ae3a))
* **release:** updated release pipeline ([6537b7f](https://github.com/apurvv28/DevForge/commit/6537b7fb8b5a0897ae8c3110a20a267e40c39581))
* resolve IaC executor and template renderer linting issues ([f104e5f](https://github.com/apurvv28/DevForge/commit/f104e5f8f0131fca526935e9c56cfc6bf09e2165))
* resolve pipeline and test failures ([adcb033](https://github.com/apurvv28/DevForge/commit/adcb0333df1acd953fa2eb1147a034a126c43ad2))
* updated pckg ([df7fb42](https://github.com/apurvv28/DevForge/commit/df7fb420ddc97d10f3c61b1615c6519c321b9e5d))


### Features

* **security:** add Trivy vulnerability scanner integration (Feature 3.5-A) ([809642c](https://github.com/apurvv28/DevForge/commit/809642ccc5af4e2c22e00ed0148fcccc5f8c7229))

# 2.1.0 (2026-06-07)

## v2.0.0 — Agentic Edition

- Multi-LLM provider support (Amazon Nova Pro, Gemini, OpenAI, Anthropic, Bedrock)
- Recommendation Agent (auto-invoked on init)
- Security & Compliance Agent (NIST SP 800-53 / ISO 27001)
- Python framework support (FastAPI, Django, Flask)
- Amazon EKS and ECS deployment targets
- Jenkins CI integration
- Agent memory with Amazon Elastic
- Automated Pipeline Execution Engine

### Features

* **agent-graph:** LangGraph orchestration for init, diagnose, and security remediation loops
* **cli:** add `devforge diagnose`, `devforge agent graph status|reset`, and `audit --yes`
* **docs:** add `docs/AGENT_GRAPH.md` for graph configuration and persistence

# 1.0.0 (2026-06-07)


### Bug Fixes

* **ci:** add build step before test job to ensure dist/ exists ([2e75cac](https://github.com/omkarP-bit/devForge/commit/2e75cacff91f94544d27fe5086cf432cd6c5dadf))
* **ci:** resolve security audit and test failures ([0d76247](https://github.com/omkarP-bit/devForge/commit/0d7624736db303b2da1aa4de3464db593449339e))
* **cli:** handle CI environment in updateCommand to avoid inquirer hang ([52487d6](https://github.com/omkarP-bit/devForge/commit/52487d66cb8bf2ddbbfeb50c7c3e1b0f82ef477c))
* **cli:** move process.exit to CLI entrypoint and remove any; satisfy ESLint ([0aa7ba0](https://github.com/omkarP-bit/devForge/commit/0aa7ba0dcf8ba5c723fb062e45efa445b76289e8))
* **detector:** fix eslint warning and update placeholders test for runDetection changes ([c5a6cbf](https://github.com/omkarP-bit/devForge/commit/c5a6cbf07858b2cee1b9b456deeef50b76090121))
* **detector:** fix node version parsing validation and nvmrc path in tests ([ecc41f7](https://github.com/omkarP-bit/devForge/commit/ecc41f73a3ff4fdfac2f67dfe8c9429e3c2d4f78))
* **env:** fixed template variable issues, multi env deployment, test updates ([d6783fa](https://github.com/omkarP-bit/devForge/commit/d6783fa9f38223586ef8da36614fccdddd1a03ec))
* **lint:** address ESLint/TS errors in validator and secrets analyzer ([f8bfb19](https://github.com/omkarP-bit/devForge/commit/f8bfb19623a5d4c4266550b9a7c6eb31139d6232))
* refactor template renderer to eliminate linting errors ([8a50cdc](https://github.com/omkarP-bit/devForge/commit/8a50cdc195b403756b3fd0671ac3f908a79bcba2))
* **release:** disable npm publishing and make NPM_TOKEN optional ([fc489d7](https://github.com/omkarP-bit/devForge/commit/fc489d7b648062d44de148d5e664b6d5d1ad1735))
* **release:** ignore semantic-release commits in commitlint ([17c1215](https://github.com/omkarP-bit/devForge/commit/17c1215ceebb570d78a5089c2ec9edf2d31f87e8))
* **release:** use default release-notes-generator config ([8857a93](https://github.com/omkarP-bit/devForge/commit/8857a93aff235d2383a4fa54e14a445de248e6b8))
* Resolve ESLint errors and TypeScript type issues in Phase 4 code ([4a29bbc](https://github.com/omkarP-bit/devForge/commit/4a29bbc4787b385ecef67c350731f53ca2fab058))
* resolve linting errors and unused imports ([b884246](https://github.com/omkarP-bit/devForge/commit/b8842463e6759f702f527e1cfb531d2c874c8f84))
* **test:** add pretest hook to ensure dist files exist before tests ([81f1748](https://github.com/omkarP-bit/devForge/commit/81f17481dd6a251bb2a9b4cd2d6eb17120bb3990))
* update placeholder test for getTemplate ([d27c038](https://github.com/omkarP-bit/devForge/commit/d27c03821421ced8b5694cc19bec2c627a9fc9d5))
* update vulnerable dependencies (fast-xml-parser, js-yaml, uuid) ([7621b39](https://github.com/omkarP-bit/devForge/commit/7621b392f91677d2a429fb834575104ac20acee3))


### Features

* **ci:** add test infrastructure, CI workflow, and CLI smoke tests ([11e3005](https://github.com/omkarP-bit/devForge/commit/11e3005553cce22c150e7495f4ab7630fa7431a8))
* Complete Phase 4.4 & 4.5 - Secrets analyzer and devforge init command ([85bea26](https://github.com/omkarP-bit/devForge/commit/85bea26e6a440f321f589ae2d95726ef39674639))
* **detector:** implement detectionCaching with forceDetect option and tests ([d700bb1](https://github.com/omkarP-bit/devForge/commit/d700bb1f95d43b43fa494f722ac552a9d97f8301))
* **detector:** implement framework fingerprinting engine with project meta detection ([95c480b](https://github.com/omkarP-bit/devForge/commit/95c480bc4c037882025b066ba18035891db99fc9))
* **detector:** implement package manager and node version detection ([1b22dd1](https://github.com/omkarP-bit/devForge/commit/1b22dd1a3524b75ade4ba12c25bbf0a716bdcb9d))
* **detector:** implement runDetection orchestrator and tests ([136f36e](https://github.com/omkarP-bit/devForge/commit/136f36eb6b0abf031f8066b3674f33f6bde3d5ea))
* **detector:** implement security-hardened package.json parser ([e7e13f8](https://github.com/omkarP-bit/devForge/commit/e7e13f87489c3388ace60178b488d134656c277e))
* **fs:** implement secure file system abstraction layer ([2a85388](https://github.com/omkarP-bit/devForge/commit/2a853888b4c9c17ad11fe0c06e424ad2b571bda6))
* **generator:** add rollback unit tests and CLI rollback command; complete Phase 5 ([8d18dd1](https://github.com/omkarP-bit/devForge/commit/8d18dd13810072d60e6f150f04d5ac24e4e271db))
* **generator:** add transaction rollback utilities and record previous contents; add FS removeFile ([f82a64c](https://github.com/omkarP-bit/devForge/commit/f82a64caf9292379c2ac1c6bb3aa3678991e2564))
* implement CLI entry point, command router, and sanitizers ([48c1903](https://github.com/omkarP-bit/devForge/commit/48c19039a4d263d3815196cbd9d6112d054ff071))
* implement phase 1-3.3 complete ([8045579](https://github.com/omkarP-bit/devForge/commit/8045579c4735ff9bef37aebe0da0f9c9ebe471ec))
* implement phase 3.5 generation plan preview renderer ([31c9223](https://github.com/omkarP-bit/devForge/commit/31c922355d63883b6e9b8b9c51ae95137c13e86b))
* **types:** define DevForgeConfig data schemas and validation ([74c1490](https://github.com/omkarP-bit/devForge/commit/74c149046f61f60f605ccf1161d699dfcdfe3fd0))

# 1.0.0 (2026-06-01)


### Bug Fixes

* **ci:** add build step before test job to ensure dist/ exists ([2e75cac](https://github.com/apurvv28/DevForge/commit/2e75cacff91f94544d27fe5086cf432cd6c5dadf))
* **ci:** resolve security audit and test failures ([0d76247](https://github.com/apurvv28/DevForge/commit/0d7624736db303b2da1aa4de3464db593449339e))
* **cli:** handle CI environment in updateCommand to avoid inquirer hang ([52487d6](https://github.com/apurvv28/DevForge/commit/52487d66cb8bf2ddbbfeb50c7c3e1b0f82ef477c))
* **cli:** move process.exit to CLI entrypoint and remove any; satisfy ESLint ([0aa7ba0](https://github.com/apurvv28/DevForge/commit/0aa7ba0dcf8ba5c723fb062e45efa445b76289e8))
* **detector:** fix eslint warning and update placeholders test for runDetection changes ([c5a6cbf](https://github.com/apurvv28/DevForge/commit/c5a6cbf07858b2cee1b9b456deeef50b76090121))
* **detector:** fix node version parsing validation and nvmrc path in tests ([ecc41f7](https://github.com/apurvv28/DevForge/commit/ecc41f73a3ff4fdfac2f67dfe8c9429e3c2d4f78))
* **env:** fixed template variable issues, multi env deployment, test updates ([d6783fa](https://github.com/apurvv28/DevForge/commit/d6783fa9f38223586ef8da36614fccdddd1a03ec))
* **lint:** address ESLint/TS errors in validator and secrets analyzer ([f8bfb19](https://github.com/apurvv28/DevForge/commit/f8bfb19623a5d4c4266550b9a7c6eb31139d6232))
* refactor template renderer to eliminate linting errors ([8a50cdc](https://github.com/apurvv28/DevForge/commit/8a50cdc195b403756b3fd0671ac3f908a79bcba2))
* **release:** disable npm publishing and make NPM_TOKEN optional ([fc489d7](https://github.com/apurvv28/DevForge/commit/fc489d7b648062d44de148d5e664b6d5d1ad1735))
* **release:** ignore semantic-release commits in commitlint ([17c1215](https://github.com/apurvv28/DevForge/commit/17c1215ceebb570d78a5089c2ec9edf2d31f87e8))
* **release:** use default release-notes-generator config ([8857a93](https://github.com/apurvv28/DevForge/commit/8857a93aff235d2383a4fa54e14a445de248e6b8))
* Resolve ESLint errors and TypeScript type issues in Phase 4 code ([4a29bbc](https://github.com/apurvv28/DevForge/commit/4a29bbc4787b385ecef67c350731f53ca2fab058))
* **test:** add pretest hook to ensure dist files exist before tests ([81f1748](https://github.com/apurvv28/DevForge/commit/81f17481dd6a251bb2a9b4cd2d6eb17120bb3990))
* update placeholder test for getTemplate ([d27c038](https://github.com/apurvv28/DevForge/commit/d27c03821421ced8b5694cc19bec2c627a9fc9d5))


### Features

* **ci:** add test infrastructure, CI workflow, and CLI smoke tests ([11e3005](https://github.com/apurvv28/DevForge/commit/11e3005553cce22c150e7495f4ab7630fa7431a8))
* Complete Phase 4.4 & 4.5 - Secrets analyzer and devforge init command ([85bea26](https://github.com/apurvv28/DevForge/commit/85bea26e6a440f321f589ae2d95726ef39674639))
* **detector:** implement detectionCaching with forceDetect option and tests ([d700bb1](https://github.com/apurvv28/DevForge/commit/d700bb1f95d43b43fa494f722ac552a9d97f8301))
* **detector:** implement framework fingerprinting engine with project meta detection ([95c480b](https://github.com/apurvv28/DevForge/commit/95c480bc4c037882025b066ba18035891db99fc9))
* **detector:** implement package manager and node version detection ([1b22dd1](https://github.com/apurvv28/DevForge/commit/1b22dd1a3524b75ade4ba12c25bbf0a716bdcb9d))
* **detector:** implement runDetection orchestrator and tests ([136f36e](https://github.com/apurvv28/DevForge/commit/136f36eb6b0abf031f8066b3674f33f6bde3d5ea))
* **detector:** implement security-hardened package.json parser ([e7e13f8](https://github.com/apurvv28/DevForge/commit/e7e13f87489c3388ace60178b488d134656c277e))
* **fs:** implement secure file system abstraction layer ([2a85388](https://github.com/apurvv28/DevForge/commit/2a853888b4c9c17ad11fe0c06e424ad2b571bda6))
* **generator:** add rollback unit tests and CLI rollback command; complete Phase 5 ([8d18dd1](https://github.com/apurvv28/DevForge/commit/8d18dd13810072d60e6f150f04d5ac24e4e271db))
* **generator:** add transaction rollback utilities and record previous contents; add FS removeFile ([f82a64c](https://github.com/apurvv28/DevForge/commit/f82a64caf9292379c2ac1c6bb3aa3678991e2564))
* implement CLI entry point, command router, and sanitizers ([48c1903](https://github.com/apurvv28/DevForge/commit/48c19039a4d263d3815196cbd9d6112d054ff071))
* implement phase 1-3.3 complete ([8045579](https://github.com/apurvv28/DevForge/commit/8045579c4735ff9bef37aebe0da0f9c9ebe471ec))
* implement phase 3.5 generation plan preview renderer ([31c9223](https://github.com/apurvv28/DevForge/commit/31c922355d63883b6e9b8b9c51ae95137c13e86b))
* **types:** define DevForgeConfig data schemas and validation ([74c1490](https://github.com/apurvv28/DevForge/commit/74c149046f61f60f605ccf1161d699dfcdfe3fd0))

# Changelog

All notable changes to this project will be documented in this file.

## v2.0.0 — Agentic Edition

- Multi-LLM provider support (Amazon Nova Pro, Gemini, OpenAI, Anthropic, Bedrock)
- Recommendation Agent (auto-invoked on init)
- Security & Compliance Agent (NIST SP 800-53 / ISO 27001)
- Python framework support (FastAPI, Django, Flask)
- Amazon EKS and ECS deployment targets
- Jenkins CI integration
- Agent memory with Amazon Elastic
- Automated Pipeline Execution Engine

## [1.0.0] - 2026-06-01

- Initial public release of DevForge.
- Added workflow generation, update, audit, preview, and rollback support.
- Added template preservation, secret analysis, and release hardening.
