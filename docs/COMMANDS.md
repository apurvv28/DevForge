# 💻 Command Reference

This page is the comprehensive reference for all shipped DevForge CLI commands, grouped by functionality.

---

## 🗺️ Command Summary

| Command | Description | Category |
| :--- | :--- | :---: |
| [`devforge init`](#devforge-init) | Initialize a new CI/CD workflow configuration | Core |
| [`devforge update`](#devforge-update) | Update existing workflow files with latest templates | Core |
| [`devforge preview`](#devforge-preview) | Preview generated workflows before writing to disk | Core |
| [`devforge audit`](#devforge-audit) | Audit workflows for security & compliance | Security |
| [`devforge deploy`](#devforge-deploy) | Automate AWS deployment steps from generated guide | Deployment |
| [`devforge diagnose`](#devforge-diagnose) | Run pipeline failure diagnosis | Diagnostics |
| [`devforge rollback`](#devforge-rollback) | Rollback a previous generation transaction | Core |
| [`devforge agent status`](#devforge-agent-status) | Show AI provider config and cache stats | Agent |
| [`devforge agent reset`](#devforge-agent-reset) | Clear AI provider credentials & reconfigure | Agent |
| [`devforge agent graph status`](#devforge-agent-graph-status) | Show LangGraph run metadata & checkpoints | Agent |
| [`devforge agent graph reset`](#devforge-agent-graph-reset) | Clear graph memory and checkpoints | Agent |
| [`devforge cache clear`](#devforge-cache-clear) | Clear the agent LLM response cache | Cache |
| [`devforge cache stats`](#devforge-cache-stats) | Show cache usage statistics | Cache |
| [`devforge cache test-elasticache`](#devforge-cache-test-elasticache) | Test Amazon ElastiCache Redis connectivity | Cache |
| [`devforge memory:stats`](#devforge-memorystats) | Show agent memory statistics (Elasticsearch) | Memory |
| [`devforge recommendations`](#devforge-recommendations) | List stored pipeline recommendations | Agent |
| [`devforge recommendations dismiss <id>`](#devforge-recommendations-dismiss-id) | Dismiss a stored recommendation by id | Agent |

---

## 🛠️ Core Commands

### `devforge init`

Creates a new DevForge run for the current project by detecting the stack, collecting deployment preferences, and generating workflow files.

#### Flags

- `--dry-run` - Simulate generation without writing files.
- `--force-detect` - Skip the detection cache and re-run project detection.
- `--preview` - Show the file preview before generating.
- `--timing` / `--verbose` - Show execution duration per phase.
- `--no-agent` - Skip agent logic and run in offline/v1 mode for this session.
- `--no-report` - Skip printing the expected pipeline output report.

> [!NOTE]
> By default, the initialization agent runs in the background. Use `--no-agent` if you want to bypass LLM logic completely and rely on the local rule-based engine.

#### Example

```bash
npx devforge init --preview --timing
```

#### Output

- Prints a detection summary and generation plan.
- Can show a full preview before any files are written.
- Writes workflow files and `.devforge/SECRETS_REQUIRED.md` unless dry-run is enabled.

---

### `devforge update`

Refreshes existing DevForge-managed workflows against the latest templates while preserving manually maintained sections.

#### Flags

- `--dry-run` - Print the diff without writing files.
- `--no-report` - Skip printing the expected pipeline output report.

#### Example

```bash
npx devforge update --dry-run
```

#### Output

- Fails if there is no previous DevForge run to compare against.
- Compares the stored plan hash with the current template output.
- Prints unified diffs for changed files.
- Prompts before applying changes unless dry-run is used.

---

### `devforge preview`

Shows a rendered preview of the files that would be generated, with no disk writes.

#### Example

```bash
npx devforge preview
```

#### Output

- Shows generated file contents with line numbers.
- Summarizes how many files are ready to generate.

---

### `devforge rollback`

Rolls back a previous code generation transaction. This is useful for reverting code generation if you decide not to proceed.

#### Flags

- `--tx <file>` - Path to the transaction log file (relative to project root). Defaults to the latest transaction file under `.devforge/transactions`.
- `--dry-run` - Do not modify disk; show what would be done.

> [!WARNING]
> Rolling back will overwrite or delete generated files to restore the workspace to its exact state prior to the transaction. Verify files before execution!

#### Example

```bash
npx devforge rollback --dry-run
```

---

## 🔒 Security & Compliance

### `devforge audit`

Inspects `.github/workflows` and reports security, performance, and compliance issues without changing any files.

#### Flags

- `--fix` - Apply deterministic auto-fixes for security violations (like adding missing permissions or pinning actions).
- `--security` - Run NIST SP 800-53 + ISO 27001 compliance scan via `SecurityComplianceAgent`.
- `--yes` - Auto-approve security fixes (required for non-interactive CI environments).

#### Example

```bash
npx devforge audit --security --fix --yes
```

#### Output

- Scans `.github/workflows` for YAML files.
- Reports findings with severity levels from CRITICAL to INFO.
- Returns a non-zero exit code when high or critical issues are present.

---

## 🚀 Deployment & Diagnostics

### `devforge deploy`

Automates the execution of AWS deployment steps directly from the local workspace when the AWS CLI is logged in.

#### Flags

- `--dry-run` - Show the deployment commands that would be executed without running them.
- `--yes` - Automatically approve all non-destructive deployment steps.
- `--plan <file>` - Path to a custom deployment plan file (defaults to `.devforge/deploy-plan.json`).

> [!IMPORTANT]
> The deployment command runs real AWS CLI, Docker, and kubectl commands against your current environment/profile. Make sure your local terminal environment has the necessary IAM credentials and binaries installed.

#### Example

```bash
npx devforge deploy --yes
```

#### Output

- Loads and validates the deployment plan (`.devforge/deploy-plan.json`).
- Verifies AWS CLI authentication and local prerequisites (e.g. `docker`, `kubectl`).
- Executes step-by-step deployment tasks (e.g. ECR login, Docker build/push, ECS service updates, K8s manifest application) with live terminal logs.
- Triggers reverse-order rollbacks on failure or manual cancellation.

---

### `devforge diagnose`

Runs pipeline failure diagnosis without regenerating files, parsing logs to pinpoint build or deploy failures.

#### Flags

- `--no-agent` - Use deterministic failure detection only, bypassing LLM-based graphs.
- `--json` - Print machine-readable JSON output instead of human-friendly console output.

#### Example

```bash
npx devforge diagnose --json
```

#### Output

- Analyzes pipeline logs and system context.
- Prints a structured list of failures and remediation steps.

---

## 🧠 Agent & Memory Management

### `devforge agent status`

Reports the current agent status, active provider configuration, and memory health.

#### Example

```bash
npx devforge agent status
```

---

### `devforge agent reset`

Clears stored credentials and reconfigures the AI provider.

#### Example

```bash
npx devforge agent reset
```

---

### `devforge agent graph status`

Shows the last LangGraph run metadata and checkpoint availability.

#### Example

```bash
npx devforge agent graph status
```

---

### `devforge agent graph reset`

Clears LangGraph memory and checkpoints for the current project.

#### Example

```bash
npx devforge agent graph reset
```

---

### `devforge cache clear`

Clears cached detection and template artifacts used by DevForge.

#### Example

```bash
npx devforge cache clear
```

---

### `devforge cache stats`

Shows current cache usage, hit/miss metrics, and stale entry counts.

#### Example

```bash
npx devforge cache stats
```

---

### `devforge cache test-elasticache`

Tests connectivity to the configured Amazon ElastiCache Redis cluster (used for distributed checkpointing).

#### Example

```bash
npx devforge cache test-elasticache
```

---

### `devforge memory:stats`

Shows agent memory statistics (Elasticsearch counts, estimated size, project key).

#### Example

```bash
npx devforge memory:stats
```

---

### `devforge recommendations`

Lists all stored pipeline recommendations produced by the Recommendation Agent.

#### Example

```bash
npx devforge recommendations
```

---

### `devforge recommendations dismiss <id>`

Dismisses a stored recommendation by its unique ID so that it is not reported in future runs.

#### Arguments

- `<id>` - The ID of the recommendation to dismiss.

#### Example

```bash
npx devforge recommendations dismiss rec_01h87b927a
```
