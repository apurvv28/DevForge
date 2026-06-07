# DevForge — Phase 3.5: Pre-Phase 4 Feature Extensions

> **Project:** DevForge — AI-Powered Agentic CI/CD Pipeline Generator  
> **Scope:** Three new features to be built after Phase 3 + LangGraph integration and before Phase 4 begins  
> **Builds on:** v2 Agentic core (Phases 1–3), LangGraph orchestration (Tasks 1–5 complete)  
> **Principle:** Same as always — agents augment, templates stay deterministic, `--no-agent` always works

---

## Context

Phases 1–3 and the full LangGraph integration plan (Tasks 1–5) are complete. The graph is composed, checkpointed, and running as the default orchestration layer. Before moving into Phase 4 (Python frameworks + extended detection), three new features are being added:

1. **Trivy Integration** — vulnerability scanning of Docker base images, libraries, and environment dependencies
2. **IaC Automation** — if IaC is already present (Terraform/CDK/boto3 scripts), directly automate the pipeline via those tools based on the deployment platform
3. **IaC Generation** — if IaC is not present, generate it (Terraform/CDK/boto3), verify it, and wire it into the pipeline

These are independent enough to not require Phase 4 features but are tightly coupled to the LangGraph graph and the SecurityComplianceAgent from Phase 3.

---

## Feature Structure

| Feature | Focus |
|---------|-------|
| Feature 3.5-A | Trivy Vulnerability Scanner Integration |
| Feature 3.5-B | IaC Detection & Automated Pipeline Execution |
| Feature 3.5-C | IaC Generation, Verification & Pipeline Wiring |

Each feature has 5 tasks matching the plan format.

---

---

## Feature 3.5-A — Trivy Vulnerability Scanner Integration

**Goal:** Integrate [Trivy](https://github.com/aquasecurity/trivy) as a security scanning step inside the DevForge pipeline. Trivy scans the Docker base image, OS packages, language-specific libraries (npm, pip, etc.), and other environment dependencies for known CVEs. The results are fed into the existing `SecurityComplianceAgent` graph node as additional context and surface in the Compliance Report.

**Why here:** The SecurityComplianceAgent currently does static YAML analysis and LLM-assisted config scanning. Trivy fills the gap it cannot — actual known CVE data for the runtime environment. This slots directly into the LangGraph `securityNode` and the `StaticSecurityScanner` pipeline without requiring any new agent architecture.

---

### Task A.1 — Trivy Runner: Installation Check and Scan Executor

**Description:**
Build a `TrivyRunner` module that checks if Trivy is installed on the host, executes scans, and returns structured JSON output. DevForge never installs Trivy automatically — it checks, guides the user to install it if missing, and gracefully skips scanning if unavailable (never blocking pipeline generation).

**Implementation Prompt:**
```
You are adding Trivy vulnerability scanning to DevForge v2.

Task: Create src/agent/security/TrivyRunner.ts

Requirements:
1. Export class TrivyRunner:
   async isAvailable(): Promise<boolean>
     Run: child_process.execFile('trivy', ['--version'], timeout: 5000)
     Returns true if exit code 0, false otherwise. Never throws.

   async scanImage(imageName: string): Promise<TrivyScanResult>
     Runs: trivy image --format json --exit-code 0 --quiet <imageName>
     Parses stdout as JSON → TrivyScanResult
     Timeout: 120 seconds (image pulls can be slow)

   async scanFilesystem(projectRoot: string): Promise<TrivyScanResult>
     Runs: trivy fs --format json --exit-code 0 --quiet --scanners vuln,secret <projectRoot>
     Scans: package-lock.json, requirements.txt, Pipfile.lock, yarn.lock
     Timeout: 60 seconds

   async scanConfig(workflowDir: string): Promise<TrivyScanResult>
     Runs: trivy config --format json --exit-code 0 --quiet <workflowDir>
     Scans: .github/workflows/, Dockerfile, docker-compose.yml for misconfigurations
     Timeout: 30 seconds

2. Define TrivyScanResult in src/agent/security/trivyTypes.ts:
   interface TrivyScanResult {
     SchemaVersion: number;
     ArtifactName: string;
     ArtifactType: 'container_image' | 'filesystem' | 'config';
     Results: TrivyResult[];
   }

   interface TrivyResult {
     Target: string;
     Class: 'os-pkgs' | 'lang-pkgs' | 'config';
     Type: string;  // e.g. 'node-pkg', 'pip', 'ubuntu'
     Vulnerabilities: TrivyVulnerability[] | null;
     Misconfigurations: TrivyMisconfiguration[] | null;
   }

   interface TrivyVulnerability {
     VulnerabilityID: string;  // CVE-XXXX-XXXXX
     PkgName: string;
     InstalledVersion: string;
     FixedVersion: string;
     Severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
     Title: string;
     Description: string;
     References: string[];
   }

   interface TrivyMisconfiguration {
     Type: string;
     ID: string;
     Title: string;
     Severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
     Message: string;
     Resolution: string;
   }

3. All child_process.execFile calls must:
   - Use the array args form (never shell: true)
   - Sanitize imageName and projectRoot through sanitizer.ts before passing as args
   - Cap stdout read at 10MB (prevent memory exhaustion on large scan output)

4. If trivy is not available, TrivyRunner.isAvailable() returns false.
   Callers handle this — TrivyRunner never installs Trivy or modifies the system.

Output: src/agent/security/TrivyRunner.ts, src/agent/security/trivyTypes.ts,
        tests/agent/security/TrivyRunner.test.ts
```

---

### Task A.2 — Trivy Result Normalizer: CVE → ComplianceViolation Bridge

**Description:**
Convert Trivy's raw JSON output into the `ComplianceViolation` format that the existing `SecurityComplianceAgent`, `SecurityReporter`, and `ComplianceReportGenerator` already understand. This bridge means zero changes to downstream reporting code — Trivy findings flow through the exact same pipeline as NIST/ISO static findings.

**Implementation Prompt:**
```
You are building the Trivy → ComplianceViolation bridge for DevForge v2.

Task: Create src/agent/security/TrivyNormalizer.ts

Requirements:
1. Export function normalizeTrivyResults(scanResult: TrivyScanResult): ComplianceViolation[]

2. Mapping rules for Vulnerabilities:
   - controlId: CVE ID (e.g. "CVE-2023-44487")
   - standard: 'NIST' (map to NIST SI-2: Flaw Remediation)
   - title: TrivyVulnerability.Title
   - description: "Package <PkgName> <InstalledVersion> is vulnerable. Fix: upgrade to <FixedVersion>"
   - affectedFile: TrivyResult.Target (e.g. "package-lock.json", "node:20-slim (ubuntu 22.04)")
   - severity: map Trivy severity → ComplianceViolation severity:
       CRITICAL → 'critical', HIGH → 'high', MEDIUM → 'medium', LOW → 'low'
   - remediation: "Upgrade <PkgName> to version <FixedVersion> or later"
   - autoFixAvailable: false (Trivy never auto-upgrades packages)

3. Mapping rules for Misconfigurations:
   - controlId: Trivy misconfiguration ID (e.g. "DS026")
   - standard: 'NIST' (NIST CM-6: Configuration Settings)
   - title: TrivyMisconfiguration.Title
   - description: TrivyMisconfiguration.Message
   - affectedFile: TrivyResult.Target
   - severity: same severity mapping as above
   - remediation: TrivyMisconfiguration.Resolution
   - autoFixAvailable: false

4. Deduplication:
   - If the same CVE appears in multiple targets (e.g. both package-lock.json and
     the Docker image layer), merge into one violation with affectedFile listing both:
     "package-lock.json, node:20-slim (ubuntu 22.04)"

5. Export function getTrivySummary(violations: ComplianceViolation[]): TrivySummary:
   interface TrivySummary {
     totalVulnerabilities: number;
     critical: number; high: number; medium: number; low: number;
     fixableCount: number; // where FixedVersion is not empty
     topPackages: string[]; // top 5 most-violated package names
   }

Output: src/agent/security/TrivyNormalizer.ts,
        tests/agent/security/TrivyNormalizer.test.ts
```

---

### Task A.3 — LangGraph Trivy Node

**Description:**
Add a `trivyNode` to the LangGraph `securityRemediationGraph` that runs before the `staticScanNode`. Extend `DevForgeGraphState` with Trivy results. The node is skipped gracefully when Trivy is not installed.

**Implementation Prompt:**
```
You are adding a Trivy scan node to the DevForge LangGraph pipeline.

Task: Create src/agent/graph/nodes/trivyNode.ts and update securityRemediationGraph.ts

Requirements:
1. trivyNode(state: DevForgeGraphState): Promise<Partial<DevForgeGraphState>>
   Step 1: Check TrivyRunner.isAvailable()
     If false:
       - logger.warn('[trivy] Trivy not found — skipping vulnerability scan')
       - logger.info('[trivy] Install guide: https://aquasecurity.github.io/trivy/latest/getting-started/installation/')
       - Return state unchanged (trivyViolations: [], trivySkipped: true)

   Step 2: Extract Docker image name from generated Dockerfile (if exists):
     Read first FROM line: FROM <image>
     Pass image name to TrivyRunner.scanImage()

   Step 3: Run TrivyRunner.scanFilesystem(context.config.projectRoot)

   Step 4: Run TrivyRunner.scanConfig('.github/workflows/')

   Step 5: Normalize all results via TrivyNormalizer.normalizeTrivyResults()

   Step 6: Return:
     trivyViolations: ComplianceViolation[]
     trivySkipped: false
     trivySummary: TrivySummary

2. Extend DevForgeGraphState in src/agent/graph/types.ts:
   trivyViolations: ComplianceViolation[];
   trivySkipped: boolean;
   trivySummary: TrivySummary | null;

3. Update securityRemediationGraph.ts to add trivyNode before staticScanNode:
   START → check_enabled → trivy_scan → static_scan → llm_scan → (violations?) → ...

4. In securityNode (postInitGraph): merge trivyViolations into the security result's
   recommendations before calling SecurityReporter:
   const allViolations = [...staticViolations, ...state.trivyViolations];

5. In ComplianceReportGenerator: add a new section:
   ## Trivy Vulnerability Scan
   | CVE ID | Package | Installed | Fix Version | Severity |
   |--------|---------|-----------|-------------|----------|
   (one row per critical/high Trivy violation; medium/low in a collapsed details section)

Output: src/agent/graph/nodes/trivyNode.ts,
        updated src/agent/graph/types.ts,
        updated src/agent/graph/securityRemediationGraph.ts,
        updated src/agent/security/ComplianceReportGenerator.ts,
        tests/agent/graph/nodes/trivyNode.test.ts
```

---

### Task A.4 — Trivy in the Generated CI Workflow

**Description:**
Optionally inject a Trivy scan step into the generated GitHub Actions CI workflow. This is an opt-in feature the user is asked about during `devforge init`. If enabled, a `security-scan` job is appended to the generated workflow that runs `aquasecurity/trivy-action` on the built Docker image.

**Implementation Prompt:**
```
You are adding an optional Trivy step to DevForge's generated CI workflows.

Task: Create src/templates/security/trivyWorkflowStep.ts and wire into template renderer.

Requirements:
1. Define TRIVY_WORKFLOW_JOB string template:
   security-scan:
     name: Trivy Vulnerability Scan
     runs-on: ubuntu-latest
     needs: [build]  # depends on the build job producing a Docker image
     permissions:
       contents: read
       security-events: write  # for GitHub Security tab upload
     steps:
       - uses: actions/checkout@v4
       - name: Run Trivy on built image
         uses: aquasecurity/trivy-action@0.28.0
         with:
           image-ref: '{{ECR_REGISTRY}}/{{IMAGE_NAME}}:${{ github.sha }}'
           format: 'sarif'
           output: 'trivy-results.sarif'
           severity: 'CRITICAL,HIGH'
           exit-code: '{{TRIVY_EXIT_CODE}}'
       - name: Upload Trivy SARIF to GitHub Security
         uses: github/codeql-action/upload-sarif@v3
         if: always()
         with:
           sarif_file: 'trivy-results.sarif'

   Non-Docker projects: use filesystem scan instead of image-ref:
     scan-type: 'fs', scan-ref: '.', format: 'table'
     Remove upload-sarif step (not applicable for fs table output)

2. Add inquirer prompt in src/cli/prompts.ts:
   "Include Trivy vulnerability scanning in the generated pipeline? [y/N]"
   Store as config.user.enableTrivyScan: boolean

3. Substitution variables: {{TRIVY_EXIT_CODE}} (default '0', user can set '1' to
   fail the pipeline on CRITICAL findings), {{ECR_REGISTRY}}, {{IMAGE_NAME}}

4. Add TRIVY_EXIT_CODE to the SECRETS_REQUIRED.md? No — it's a config value not a secret.
   Instead write a comment in the generated workflow:
   # Set exit-code to '1' to fail the pipeline on CRITICAL vulnerabilities

5. Wire into templateRenderer.ts:
   After rendering the base CI workflow, if enableTrivyScan:
   - Parse the rendered YAML with js-yaml
   - Append the trivy job to jobs:
   - Re-serialize with js-yaml.dump
   - Validate through yamlValidator.ts

Output: src/templates/security/trivyWorkflowStep.ts,
        updated src/cli/prompts.ts, updated src/types/index.ts,
        updated src/engine/templateRenderer.ts,
        tests/templates/trivyWorkflowStep.test.ts
```

---

### Task A.5 — Trivy CLI Command and Audit Integration

**Description:**
Add `devforge audit --trivy` as a standalone command to run Trivy scans on demand without regenerating the pipeline. Integrate Trivy summary into `devforge audit --security` output and update `COMPLIANCE_REPORT.md` generation to always include the Trivy section if Trivy is available.

**Implementation Prompt:**
```
You are integrating Trivy into DevForge's audit command and compliance reporting.

Task: Update src/cli/auditCommand.ts and add Trivy to the audit output.

Requirements:
1. Add --trivy flag to devforge audit:
   devforge audit --trivy
     Runs all three Trivy scans (image, filesystem, config) on the current project
     Prints a table of CRITICAL and HIGH findings
     Exits with code 1 if any CRITICAL finding found (configurable via --fail-on flag)

   devforge audit --security --trivy
     Runs both NIST/ISO static scan + Trivy, merges results, prints unified report
     Generates COMPLIANCE_REPORT.md with both sections

2. Standalone Trivy output format:
   ┌─────────────────────────────────────────────────────────────┐
   │  DevForge Trivy Scan Results                                │
   ├──────────────┬──────────┬──────────────┬───────────────────┤
   │  CVE ID      │ Package  │ Severity     │ Fix Available     │
   ├──────────────┼──────────┼──────────────┼───────────────────┤
   │  CVE-2024-.. │ express  │ CRITICAL     │ Yes (4.21.2)      │
   └──────────────┴──────────┴──────────────┴───────────────────┘
   Use cli-table3. Print summary line: "Found 2 CRITICAL, 5 HIGH, 11 MEDIUM, 4 LOW"

3. If Trivy not installed, print:
   ⚠ Trivy not found. Install it to enable vulnerability scanning.
   Install guide: https://aquasecurity.github.io/trivy/latest/getting-started/installation/
   Never fail the command — exit 0 and continue.

4. Add Trivy summary to devforge audit --security output (even without --trivy flag):
   If Trivy available → auto-run fs scan → append results to the security report
   If Trivy not available → print one-line install hint at the bottom of the report

5. Update the LangGraph securityRemediationGraph:
   devforge audit --security --fix now runs:
   trivy_node → static_scan → llm_scan → auto_fix → re_scan (Trivy re-run included)
   Re-scan includes TrivyRunner.scanFilesystem() again to verify no new CVEs after fix

Output: updated src/cli/auditCommand.ts,
        tests/cli/auditCommand.trivy.test.ts
```

---

---

## Feature 3.5-B — IaC Detection & Automated Pipeline Execution

**Goal:** Detect if the user's project already has Infrastructure-as-Code (Terraform, AWS CDK, boto3 scripts, Pulumi) present. If IaC is detected and ready, DevForge automates pipeline execution via those tools directly — running `terraform apply`, `cdk deploy`, or `boto3` Python scripts via the Automated Pipeline Execution Engine, based on the deployment platform.

**Why here:** Phase 2 (Task 6.2 of the original plan) built the GitHub Actions-based `PipelineExecutionEngine`. This extends that concept to the IaC layer — if a user already has Terraform for their EKS cluster, DevForge should use it, not work around it. This integrates deeply with the LangGraph `postInitGraph` as a conditional branch.

---

### Task B.1 — IaC Detector

**Description:**
Build an `IaCDetector` that scans the project for existing IaC configurations across all major tools. Detection is confidence-scored like the v1 framework detector. Output feeds into a new `iacContext` field on `DevForgeConfig` that controls all downstream IaC behavior.

**Implementation Prompt:**
```
You are building the IaC detection layer for DevForge v2.

Task: Create src/detector/iacDetector.ts

Requirements:
1. Export async function detectIaC(fs: DevForgeFS): Promise<IaCDetectionResult>

2. interface IaCDetectionResult {
     detected: boolean;
     tool: 'terraform' | 'cdk' | 'boto3' | 'pulumi' | 'ansible' | null;
     confidence: number; // 0–100
     entryPoints: string[]; // detected IaC file paths (relative)
     deploymentPlatform: 'aws' | 'gcp' | 'azure' | 'generic' | null;
     isDeployReady: boolean; // see readiness rules below
     readinessBlockers: string[]; // reasons why isDeployReady is false
   }

3. Detection signals:
   Terraform:
     - *.tf files in root or infra/ or terraform/ → +60
     - terraform.tfstate present → +20 (already initialized)
     - .terraform/ directory → +20 (providers downloaded)
     - main.tf present → +10
   CDK:
     - cdk.json present → +70
     - 'aws-cdk-lib' in package.json dependencies → +30
     - bin/*.ts or lib/*.ts containing 'new Stack' → +20
   boto3:
     - deploy.py or scripts/deploy.py containing 'import boto3' → +70
     - requirements.txt containing 'boto3' → +20
   Pulumi:
     - Pulumi.yaml present → +80
     - 'pulumi' in package.json dependencies → +20
   Ansible:
     - playbook.yml or ansible/ directory → +60
     - inventory.ini or inventory/ → +20

4. isDeployReady rules:
   Terraform: true if .terraform/ exists AND terraform.tfstate exists AND
     no *.tf file contains '<PLACEHOLDER>' or 'TODO' (grep check)
   CDK: true if node_modules/aws-cdk-lib exists (cdk installed)
   boto3: true if deploy.py exists AND 'boto3' is importable
     (check requirements.txt for boto3, can't verify Python env from CLI)
   Pulumi: true if Pulumi.yaml exists AND stack is selected (Pulumi.*.yaml exists)
   Not ready → isDeployReady: false, readinessBlockers lists what's missing

5. Integrate into src/detector/index.ts:
   Run detectIaC() in parallel with existing detectors.
   Add iacContext: IaCDetectionResult | null to DetectedProject.

6. Add to DevForgeConfig: iacContext (optional field, Zod schema updated).

Output: src/detector/iacDetector.ts, updated src/detector/index.ts,
        updated src/types/index.ts,
        tests/detector/iacDetector.test.ts
```

---

### Task B.2 — IaC Executor: terraform, cdk, boto3

**Description:**
Build an `IaCExecutor` that runs the appropriate IaC tool based on the detected result. Each executor wraps a subprocess call with proper timeout, streaming output to the terminal, and structured result capture. The executor is the engine behind "if IaC is ready → directly automate the pipeline."

**Implementation Prompt:**
```
You are building the IaC execution layer for DevForge v2.

Task: Create src/engine/IaCExecutor.ts

Requirements:
1. Export class IaCExecutor:
   constructor(projectRoot: string, dryRun: boolean)

   async execute(detection: IaCDetectionResult, target: DeploymentTarget): Promise<IaCExecuteResult>
     Dispatches to the correct executor based on detection.tool
     Returns IaCExecuteResult

   interface IaCExecuteResult {
     tool: string;
     success: boolean;
     exitCode: number;
     output: string; // last 200 lines of stdout/stderr combined
     duration: number; // ms
     dryRun: boolean;
   }

2. Implement private executors:

   executeTerraform(detection: IaCDetectionResult): Promise<IaCExecuteResult>
     Commands (in order):
       terraform init -input=false (if .terraform/ missing)
       terraform plan -out=devforge.tfplan -input=false
       If dryRun: stop here, print plan output
       terraform apply -auto-approve -input=false devforge.tfplan
     Timeout: 600 seconds (infra provisioning can take time)

   executeCDK(detection: IaCDetectionResult, target: DeploymentTarget): Promise<IaCExecuteResult>
     Commands:
       npx cdk diff (if dryRun: print diff and stop)
       npx cdk deploy --require-approval never --all
     Timeout: 600 seconds

   executeBoto3(detection: IaCDetectionResult): Promise<IaCExecuteResult>
     Command: python deploy.py (or scripts/deploy.py, from detection.entryPoints)
     If dryRun: python deploy.py --dry-run (pass flag; if deploy.py doesn't accept it,
       warn user and skip execution)
     Timeout: 300 seconds

   executePulumi(detection: IaCDetectionResult): Promise<IaCExecuteResult>
     Commands:
       pulumi preview (if dryRun: print and stop)
       pulumi up --yes
     Timeout: 600 seconds

3. All subprocess calls must use child_process.spawn (not exec) for streaming:
   - Stream stdout/stderr lines through logger.info() in real-time
   - Capture last 200 lines in result.output for logging
   - Use sanitizePath() on all path arguments

4. If dryRun=true: print what would be executed but do not run it.
   Print: "[dry-run] Would execute: terraform apply -auto-approve ..."

5. If tool binary not found (e.g. terraform not in PATH):
   Return IaCExecuteResult { success: false, exitCode: 127,
     output: "terraform not found in PATH. Install from https://terraform.io" }

Output: src/engine/IaCExecutor.ts,
        tests/engine/IaCExecutor.test.ts
```

---

### Task B.3 — LangGraph IaC Execution Node

**Description:**
Add an `iacExecutionNode` to the `postInitGraph` LangGraph. This node fires after generation completes if IaC is detected and ready. It presents the user with a confirmation gate (human-in-the-loop) before executing any IaC tool — preserving the `approvalNode` pattern already in the `securityRemediationGraph`.

**Implementation Prompt:**
```
You are adding an IaC execution node to the DevForge LangGraph.

Task: Create src/agent/graph/nodes/iacExecutionNode.ts and update postInitGraph.ts

Requirements:
1. iacExecutionNode(state: DevForgeGraphState): Promise<Partial<DevForgeGraphState>>
   Step 1: Check state.context.config.detected.iacContext
     If null or !detected → return state unchanged (iacSkipped: true)
     If !isDeployReady:
       Print readinessBlockers to terminal as warnings
       Return state (iacSkipped: true, iacBlockers: readinessBlockers)

   Step 2: Print detection summary:
     ✓ IaC detected: Terraform (confidence: 90%)
     Entry points: infra/main.tf, infra/variables.tf
     Deployment target: AWS (EKS)
     Status: Ready to deploy

   Step 3: Human-in-the-loop gate (reuse approvalNode pattern):
     "DevForge detected existing Terraform configuration.
      Automate deployment now? This will run: terraform init → plan → apply [y/N]"
     If --yes flag passed: auto-approve
     If user says N: set iacSkipped: true, return

   Step 4: Instantiate IaCExecutor(projectRoot, dryRun=state.context.config.dryRun)
     Call executor.execute(iacContext, deploymentTarget)
     Store result in state.iacExecuteResult

   Step 5: Print result summary:
     ✓ Terraform apply completed in 87s
     Or: ✗ Terraform apply failed (exit code 1). See output above.

2. Extend DevForgeGraphState in types.ts:
   iacSkipped: boolean;
   iacBlockers: string[];
   iacExecuteResult: IaCExecuteResult | null;

3. Update postInitGraph.ts:
   Previous flow: START → check_enabled → recommend → security → END
   New flow:
   START → check_enabled → recommend → security → iac_execution → END

4. Wire --yes flag from CLI:
   devforge init --yes skips all confirmation prompts including IaC execution gate
   Already exists in v2 CLI — pass it through to graph state as autoApprove: boolean

5. Tests: mock IaCExecutor; verify:
   - iacExecutionNode skips when iacContext is null
   - iacExecutionNode prints blockers and skips when !isDeployReady
   - Human gate with --yes auto-approves
   - Human gate with user saying N skips execution
   - Successful execution stores result in state

Output: src/agent/graph/nodes/iacExecutionNode.ts,
        updated src/agent/graph/types.ts,
        updated src/agent/graph/postInitGraph.ts,
        tests/agent/graph/nodes/iacExecutionNode.test.ts
```

---

### Task B.4 — IaC-Aware Template Renderer

**Description:**
When IaC is detected, generated CI workflows should reference the IaC tool rather than duplicating deployment logic. For example, if Terraform is detected, the generated GitHub Actions deploy job should run `terraform apply` instead of a direct `kubectl` or `aws ecs update-service` command. Existing templates need an IaC-aware rendering path.

**Implementation Prompt:**
```
You are making DevForge's CI templates IaC-aware.

Task: Create src/templates/iac/ — IaC-aware CI job templates.

Requirements:
1. Create IaC deploy job templates (TypeScript string literals):

   src/templates/iac/terraformDeployJob.ts:
     deploy:
       name: Terraform Deploy
       runs-on: ubuntu-latest
       needs: [build]
       environment: {{ENVIRONMENT}}
       steps:
         - uses: actions/checkout@v4
         - uses: hashicorp/setup-terraform@v3
           with: { terraform_version: '{{TERRAFORM_VERSION}}' }
         - name: Configure AWS credentials
           uses: aws-actions/configure-aws-credentials@v4
           with: { role-to-assume: '{{DEPLOY_ROLE_ARN}}', aws-region: '{{AWS_REGION}}' }
         - run: terraform init -input=false
           working-directory: {{TERRAFORM_DIR}}
         - run: terraform apply -auto-approve -input=false
           working-directory: {{TERRAFORM_DIR}}

   src/templates/iac/cdkDeployJob.ts:
     deploy:
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
         - run: npm ci
         - run: npx cdk deploy --require-approval never --all
           env: { AWS_DEFAULT_REGION: '{{AWS_REGION}}' }

   src/templates/iac/boto3DeployJob.ts:
     deploy:
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-python@v5
         - run: pip install -r requirements.txt
         - run: python {{BOTO3_DEPLOY_SCRIPT}}
           env: { AWS_DEFAULT_REGION: '{{AWS_REGION}}' }

2. In templateRenderer.ts:
   After rendering base CI template, check config.detected.iacContext:
   - If detected and tool is terraform/cdk/boto3:
     Replace the 'deploy' job in the rendered YAML with the IaC deploy job
     (parse with js-yaml, replace jobs.deploy key, re-serialize, re-validate)
   - If not detected: keep original deploy job

3. Substitution variables per template:
   Terraform: {{TERRAFORM_VERSION}} (default '1.9.0'), {{TERRAFORM_DIR}} (default './infra'),
              {{DEPLOY_ROLE_ARN}}, {{ENVIRONMENT}}, {{AWS_REGION}}
   CDK: {{AWS_REGION}}
   boto3: {{BOTO3_DEPLOY_SCRIPT}} (from detection.entryPoints[0]), {{AWS_REGION}}

4. All substitutions go through the existing allowlist in templateRenderer.ts.
   Add new variables to the allowlist.

5. Tests: render each IaC template, validate YAML output, check that the deploy job
   exists in the rendered workflow and uses the correct IaC command.

Output: src/templates/iac/*.ts, updated src/engine/templateRenderer.ts,
        tests/templates/iac*.test.ts
```

---

### Task B.5 — IaC Audit Command and Status Reporting

**Description:**
Add `devforge audit --iac` to scan the existing IaC configuration for security issues (using Trivy's config scanner) and readiness problems. Surface blockers that prevent automated deployment, and provide a `devforge iac status` command showing the full detection result and execution history.

**Implementation Prompt:**
```
You are adding IaC audit and status commands to DevForge v2.

Task: Update src/cli/auditCommand.ts and add src/cli/iacCommand.ts

Requirements:
1. devforge audit --iac:
   Step 1: Run IaCDetector on current project
   Step 2: If no IaC detected: print "No IaC configuration found in this project."
   Step 3: If detected: print detection summary (tool, confidence, entryPoints, isDeployReady)
   Step 4: If Trivy available: run TrivyRunner.scanConfig() on IaC directories
     Print misconfigurations from Trivy (filtered to HIGH/CRITICAL)
   Step 5: Print readiness blockers if !isDeployReady
   Step 6: Print: "Run devforge iac deploy to execute when ready."

2. devforge iac status:
   Prints the full IaC detection result in a formatted table:
   ┌───────────────────────────────────────────────┐
   │  DevForge IaC Status                          │
   ├──────────────────────┬────────────────────────┤
   │  Tool                │ Terraform              │
   │  Confidence          │ 90%                    │
   │  Entry Points        │ infra/main.tf          │
   │  Deployment Platform │ AWS                    │
   │  Deploy Ready        │ ✓ Yes                  │
   │  Last Executed       │ 2026-06-07 14:30:00    │
   │  Last Exit Code      │ 0 (success)            │
   └──────────────────────┴────────────────────────┘

3. devforge iac deploy:
   Runs IaCExecutor directly without re-running the full init flow
   Asks for confirmation (same gate as iacExecutionNode)
   Streams output to terminal

4. Persist last execution result to .devforge/iac-history.json:
   Array of IaCExecuteResult records (max 10 retained)
   Read by devforge iac status to show last execution details.

5. Wire into devforge --help:
   IaC Commands:
     iac status          Show IaC detection and last execution status
     iac deploy          Execute detected IaC deployment
     audit --iac         Scan IaC configuration for issues

Output: src/cli/iacCommand.ts, updated src/cli/auditCommand.ts,
        updated src/cli/index.ts,
        tests/cli/iacCommand.test.ts
```

---

---

## Feature 3.5-C — IaC Generation, Verification & Pipeline Wiring

**Goal:** When IaC is NOT detected (or is detected but not ready), DevForge can generate the IaC configuration from scratch using the LLM + deterministic templates. The user opts in, DevForge generates Terraform/CDK/boto3 code, verifies it (Terraform validate, CDK synth, static linting), and wires it into the generated CI pipeline. This completes the "if IaC not ready → create it, generate it, verify everything" requirement from the notebook.

**Why here:** This is the most complex of the three features. It requires the IaC detector (Feature B), the IaC-aware template renderer (Feature B), and the LangGraph orchestration to produce, validate, and iterate on generated IaC.

---

### Task C.1 — IaC Generation Agent

**Description:**
Build `IaCGenerationAgent` extending `BaseAgent`. Given the detected framework and deployment target, the agent generates Terraform, CDK (TypeScript), or boto3 deployment scripts using the LLM. The agent uses structured prompts with strict output constraints — it never generates free-form code; it assembles from a library of verified building blocks.

**Implementation Prompt:**
```
You are building the IaC Generation Agent for DevForge v2.

Task: Create src/agent/agents/IaCGenerationAgent.ts

Requirements:
1. class IaCGenerationAgent extends BaseAgent:
   systemPrompt = `You are a DevOps infrastructure expert. You generate Infrastructure-as-Code
   configurations for cloud deployments. You ONLY output the specific file contents requested,
   in JSON format. You never generate shell scripts inline. You always follow the exact schema
   provided. Respond only with valid JSON matching the IaCGenerationOutput schema.`

2. interface IaCGenerationOutput {
     tool: 'terraform' | 'cdk' | 'boto3';
     files: IaCGeneratedFile[];
     installInstructions: string[];  // e.g. ["npm install aws-cdk-lib", "terraform init"]
     notes: string[];               // warnings or manual steps needed
   }

   interface IaCGeneratedFile {
     relativePath: string;  // e.g. "infra/main.tf"
     content: string;
     description: string;  // what this file does
   }

3. run(context: AgentContext): Promise<AgentResult>
   Step 1: Determine IaC tool to generate based on context:
     - If context.config.user.iacTool is set (user chose during prompts) → use that
     - If deployment target is AWS_EKS or AWS_ECS → prefer Terraform
     - If Node.js project → prefer CDK
     - If Python project → prefer boto3
     Store preference in state.

   Step 2: Build prompt including:
     - Detected framework, deployment target, cloud provider
     - If EKS: "Generate Terraform for EKS cluster + ECR repo + IAM roles"
     - If ECS: "Generate Terraform for ECS Fargate cluster + ECR + task execution role"
     - If Vercel/Railway/Render: "These platforms don't need IaC — skip"
     - Max prompt length: 3000 chars

   Step 3: Call this.chat(prompt), parse JSON response as IaCGenerationOutput
     Validate with Zod schema before using — if invalid JSON, retry once

   Step 4: Return AgentResult with recommendations = [] and
     messages: one message per generated file listing the path

4. fallback(context): Return a static AgentResult with message:
   "IaC generation requires an online LLM provider. Run in online mode."
   Set success: false.

5. IaC tool selection prompt in src/cli/prompts.ts:
   "Which IaC tool do you want DevForge to generate?" → Terraform / CDK / boto3 / Skip
   Only shown when iacContext.detected = false OR !isDeployReady

Output: src/agent/agents/IaCGenerationAgent.ts,
        updated src/cli/prompts.ts, updated src/types/index.ts,
        tests/agent/agents/IaCGenerationAgent.test.ts
```

---

### Task C.2 — IaC Verifier: Validate, Lint, Dry-Run

**Description:**
All LLM-generated IaC must pass a verification step before being written to disk. The `IaCVerifier` runs tool-native validation commands: `terraform validate`, `cdk synth --quiet`, and static linting for boto3 scripts. This is the "verify everything" step from the notebook.

**Implementation Prompt:**
```
You are building the IaC verification layer for DevForge v2.

Task: Create src/engine/IaCVerifier.ts

Requirements:
1. Export class IaCVerifier:
   constructor(projectRoot: string)

   async verify(output: IaCGenerationOutput, tempDir: string): Promise<IaCVerifyResult>
     Dispatches to the correct verifier based on output.tool

   interface IaCVerifyResult {
     tool: string;
     passed: boolean;
     errors: IaCVerifyError[];
     warnings: IaCVerifyWarning[];
     verifiedAt: string;
   }

   interface IaCVerifyError {
     file: string;
     line?: number;
     message: string;
     fatal: boolean;
   }

2. Implement private verifiers:

   verifyTerraform(files: IaCGeneratedFile[], tempDir: string): Promise<IaCVerifyResult>
     Step 1: Write all .tf files to tempDir (using DevForgeFS)
     Step 2: execFile('terraform', ['init', '-backend=false', '-input=false'], { cwd: tempDir })
       -backend=false avoids needing real cloud credentials
     Step 3: execFile('terraform', ['validate'], { cwd: tempDir })
     Step 4: execFile('terraform', ['fmt', '-check', '-recursive'], { cwd: tempDir })
       Format check only — never auto-format generated code without user knowledge
     Parse stdout/stderr for errors. Timeout: 60 seconds each step.

   verifyCDK(files: IaCGeneratedFile[], tempDir: string): Promise<IaCVerifyResult>
     Step 1: Write files to tempDir
     Step 2: npm install (with package.json from generated files)
     Step 3: npx cdk synth --quiet
     Timeout: 120 seconds

   verifyBoto3(files: IaCGeneratedFile[], tempDir: string): Promise<IaCVerifyResult>
     Step 1: Write files to tempDir
     Step 2: python -m py_compile <each .py file> (syntax check)
     Step 3: If pylint available: pylint --errors-only <deploy.py>
     Timeout: 30 seconds

3. tempDir management:
   Create at: /tmp/devforge-iac-verify-<uuid>
   Always clean up after verification (success or failure)
   Never write to projectRoot during verification

4. If the verification tool binary is missing (terraform/cdk/python not in PATH):
   Return IaCVerifyResult { passed: false, errors: [{message: "<tool> not found in PATH..."}] }

Output: src/engine/IaCVerifier.ts,
        tests/engine/IaCVerifier.test.ts
```

---

### Task C.3 — LangGraph IaC Generation & Verify Loop

**Description:**
Add a `iacGenerationGraph` subgraph to LangGraph that orchestrates: generate IaC → verify → if failed → regenerate with error context → verify again — up to `DEVFORGE_IAC_MAX_RETRY` attempts (default 2). Only after verification passes does the IaC get written to disk.

**Implementation Prompt:**
```
You are building the IaC generation and verification loop as a LangGraph subgraph.

Task: Create src/agent/graph/iacGenerationGraph.ts and supporting nodes.

Requirements:
1. Extend DevForgeGraphState:
   iacGenerationOutput: IaCGenerationOutput | null;
   iacVerifyResult: IaCVerifyResult | null;
   iacGenerationAttempt: number;
   iacGenerationMaxAttempts: number; // from DEVFORGE_IAC_MAX_RETRY env, default 2

2. Create nodes:

   src/agent/graph/nodes/iacGenerateNode.ts:
     Instantiates IaCGenerationAgent, calls run(context)
     If attempt > 1: prepends previous verify errors to the LLM prompt:
       "Previous generation failed verification with these errors: <list>. Fix them."
     Parses IaCGenerationOutput from AgentResult
     Sets state.iacGenerationOutput, increments state.iacGenerationAttempt

   src/agent/graph/nodes/iacVerifyNode.ts:
     Instantiates IaCVerifier, calls verify(iacGenerationOutput, tempDir)
     Sets state.iacVerifyResult

   src/agent/graph/nodes/iacWriteNode.ts:
     Only runs when iacVerifyResult.passed = true
     Writes all IaCGeneratedFile[] to disk via DevForgeFS (atomic, dry-run safe)
     Prints: "✓ Generated <n> IaC files" with file list

3. Compile iacGenerationGraph:
   START → iac_generate → iac_verify → (passed?) 
     → yes  → iac_write → END
     → no   → (attempts < max?) 
                → yes → iac_generate (loop back with error context)
                → no  → END (failure, no files written, print errors)

4. Wire into postInitGraph.ts:
   When iacContext.detected=false AND user chose an IaC tool:
   After recommendation + security nodes:
     postInitGraph tail → iac_generation_subgraph → iac_execution_node → END

5. Print progress during generation loop:
   ⟳ Generating Terraform configuration (attempt 1/2)...
   ✗ Verification failed: invalid resource reference in main.tf
   ⟳ Regenerating with error context (attempt 2/2)...
   ✓ Terraform configuration verified successfully

Output: src/agent/graph/iacGenerationGraph.ts,
        src/agent/graph/nodes/iacGenerateNode.ts,
        src/agent/graph/nodes/iacVerifyNode.ts,
        src/agent/graph/nodes/iacWriteNode.ts,
        updated src/agent/graph/postInitGraph.ts,
        updated src/agent/graph/types.ts,
        tests/agent/graph/iacGenerationGraph.test.ts
```

---

### Task C.4 — IaC Template Library (Deterministic Building Blocks)

**Description:**
To reduce LLM hallucination in generated IaC, the `IaCGenerationAgent` assembles code from a library of verified, parameterized Terraform modules and CDK constructs. The LLM's job is to select which building blocks to combine and what parameters to fill in — not to generate raw HCL or CDK from scratch.

**Implementation Prompt:**
```
You are building the IaC template library for DevForge v2.

Task: Create src/templates/iac-blocks/ — parameterized IaC building blocks.

Requirements:
1. Terraform building blocks (HCL string templates):

   src/templates/iac-blocks/terraform/ecr-repo.tf.ts:
     resource "aws_ecr_repository" "{{REPO_NAME}}" {
       name                 = "{{REPO_NAME}}"
       image_tag_mutability = "MUTABLE"
       image_scanning_configuration { scan_on_push = true }
     }

   src/templates/iac-blocks/terraform/ecs-cluster.tf.ts:
     resource "aws_ecs_cluster" "{{CLUSTER_NAME}}" {
       name = "{{CLUSTER_NAME}}"
       setting { name = "containerInsights" value = "enabled" }
     }

   src/templates/iac-blocks/terraform/ecs-task-def.tf.ts:
     Full ECS task definition resource with Fargate, log group, IAM role.

   src/templates/iac-blocks/terraform/variables.tf.ts:
     Standard variables file: region, project_name, environment, image_tag.

   src/templates/iac-blocks/terraform/outputs.tf.ts:
     Standard outputs: ECR repo URL, ECS cluster ARN, service name.

2. CDK building blocks (TypeScript string templates):

   src/templates/iac-blocks/cdk/ecr-stack.ts.tpl:
     EcrStack extending Stack: creates ECR repo with lifecycle rules, scan on push.

   src/templates/iac-blocks/cdk/ecs-stack.ts.tpl:
     EcsStack: Fargate cluster, TaskDefinition, FargateService with ALB.

3. boto3 building blocks (Python string templates):

   src/templates/iac-blocks/boto3/ecr-create.py.tpl:
     create_repository() with image scanning, lifecycle policy.

   src/templates/iac-blocks/boto3/ecs-deploy.py.tpl:
     register_task_definition() + update_service() pattern.

4. IaC Block Registry in src/templates/iac-blocks/registry.ts:
   Map of: deployment target + tool → required blocks
   Example: AWS_ECS + terraform → [ecr-repo, ecs-cluster, ecs-task-def, variables, outputs]

5. Update IaCGenerationAgent.run():
   Instead of asking LLM to write raw HCL/Python:
   - Look up required blocks from the registry
   - Render each block with substitution variables (same templateRenderer pattern)
   - LLM fills in: parameter values and any custom additions
   Prompt becomes: "Given these rendered blocks, fill in the substitution values:
   PROJECT_NAME=?, CLUSTER_NAME=?, etc."
   This confines LLM generation to parameter values, not code structure.

Output: src/templates/iac-blocks/ (all files), src/templates/iac-blocks/registry.ts,
        updated src/agent/agents/IaCGenerationAgent.ts,
        tests/templates/iac-blocks/registry.test.ts
```

---

### Task C.5 — IaC Generation E2E Tests and Docs

**Description:**
Write end-to-end tests for the full IaC generation + verification + write pipeline for both the happy path (verify passes first attempt) and the retry path (verify fails once, succeeds on retry). Update documentation to cover all three new features.

**Implementation Prompt:**
```
You are writing E2E tests and documentation for DevForge v2 IaC generation.

Task: Create tests/e2e/iacGeneration.test.ts and update docs/.

Requirements:
1. E2E test scenarios in tests/e2e/iacGeneration.test.ts:

   T1 (Terraform happy path):
     - Fixture: ECS deployment target, no IaC detected
     - Mock IaCGenerationAgent to return valid Terraform files
     - Mock IaCVerifier to return passed=true on first attempt
     - Assert: infra/main.tf, infra/variables.tf, infra/outputs.tf written to output dir
     - Assert: CI workflow deploy job uses terraform apply command

   T2 (Terraform retry path):
     - Mock verifier: passes=false on attempt 1, passes=true on attempt 2
     - Mock agent: on attempt 2, prompt includes the error from attempt 1
     - Assert: iacGenerationAttempt = 2 in final graph state
     - Assert: files still written after successful second attempt

   T3 (Terraform max retries exceeded):
     - Mock verifier: always returns passed=false
     - Assert: no files written to disk
     - Assert: error message printed to terminal
     - Assert: graph exits cleanly (no unhandled rejection)

   T4 (IaC already detected and ready):
     - Fixture: project with infra/main.tf and .terraform/ directory
     - Assert: IaCGenerationAgent is NOT invoked (iacExecutionNode used instead)
     - Assert: IaCExecutor is invoked (mocked)

   T5 (Offline mode):
     - Credentials: provider = 'offline'
     - Assert: IaCGenerationAgent returns fallback result
     - Assert: no IaC files generated
     - Assert: message "IaC generation requires an online LLM provider" printed

   T6 (boto3 generation):
     - Deployment target: generic AWS, Python project detected
     - Mock agent returns boto3 deploy.py
     - Mock verifier: python -m py_compile passes
     - Assert: scripts/deploy.py written to output dir

2. Unit tests for IaC Block Registry:
   - Assert that each deployment target + tool combination maps to correct blocks
   - Assert rendered blocks contain substitution vars (no empty {{}} placeholders)

3. Docs update — create docs/IAC.md:
   ## DevForge IaC Integration
   ### Detecting existing IaC
   ### Automated execution (IaC ready)
   ### IaC generation (IaC not present)
   ### Supported IaC tools and deployment targets table
   ### Trivy scanning of IaC configurations
   ### Verification steps per tool
   ### Manual steps after generation (things DevForge cannot verify)
   ### Environment variables: DEVFORGE_IAC_MAX_RETRY

4. Update README.md:
   Add IaC section under Features:
   ✦ IaC detection (Terraform, CDK, boto3, Pulumi, Ansible)
   ✦ Automated deployment via detected IaC
   ✦ LLM-assisted IaC generation with verification loop
   Update supported deployment targets table to mention IaC automation column.

Output: tests/e2e/iacGeneration.test.ts, tests/templates/iac-blocks/registry.test.ts,
        docs/IAC.md, updated README.md
```

---

---

## Integration Summary: Where These Features Fit in the Graph

After all three features are implemented, the full `postInitGraph` flow looks like this:

```
devforge init
  │
  ├─ (v1 deterministic core)
  │   Detection → Rule Engine → Generator → Secrets → Rollback
  │
  └─ (LangGraph postInitGraph — if agents enabled)
      │
      ├── check_enabled ──── [offline / --no-agent] ──→ END (v1 output only)
      │
      ├── trivy_node         ← Feature 3.5-A: scan image + fs + config
      │
      ├── recommend_node     ← Phase 2: RecommendationAgent
      │
      ├── security_node      ← Phase 3: SecurityComplianceAgent (merges Trivy violations)
      │
      ├── iac_detection      ← Feature 3.5-B/C: evaluate IaC context
      │     │
      │     ├── [IaC ready]     → iac_execution_node  → execute terraform/cdk/boto3
      │     │
      │     └── [IaC not ready] → iac_generation_graph (subgraph)
      │                             generate → verify → (retry loop) → write
      │
      └── END
```

**Key invariants maintained:**
- `--no-agent` or `provider: offline` → skips the entire graph, v1 output only
- All file writes go through `DevForgeFS` (path traversal guard, atomic, dry-run safe)
- LLM never generates raw workflow YAML or Dockerfiles — only IaC (Terraform/CDK/boto3) using verified building blocks
- Trivy never blocks pipeline generation — scanner unavailability is a soft warning
- IaC execution is always gated by human-in-the-loop confirmation (or `--yes` to auto-approve)

---

## Appendix: New Dependencies

| Package | Purpose | Feature |
|---------|---------|---------|
| None (Trivy is a binary) | Trivy is invoked via `child_process.execFile` | 3.5-A |
| `@hashicorp/js-waypoint-sdk` | Optional Terraform plan parsing | 3.5-B (optional) |
| `uuid` | Already in v2 | Reused for tempDir naming in IaCVerifier |

No new npm dependencies required for Trivy (binary invocation). IaC executor also uses only `child_process`. The IaC block templates are pure TypeScript string templates — no new template engines needed.