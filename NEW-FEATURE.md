### New Features for v1.2.1
---

## Feature 1: Jenkins Pipeline Automation

### What it adds
- Jenkinsfile generation for all currently supported frameworks (React, Next.js, Express, NestJS, Vue, Angular, MERN).
- Automated Jenkins job creation via the Jenkins REST API (no manual UI clicking).
- Automatic detection of the project's GitHub repository URL from the local git remote, used to wire up SCM config and webhooks without any manual URL entry.
- Automated SCM/webhook wiring to the detected GitHub repo.
- A `devforge audit` mode for Jenkinsfiles, mirroring the existing GitHub Actions audit.

### Approach
Reuse the existing template + strict-allowlist rendering pipeline (same one used for GitHub Actions) for the Jenkinsfile itself. For job creation and repo wiring, talk to Jenkins over its REST API (`createItem`, credentials API, webhook registration) — no custom plugin involved. The GitHub repo URL needed for this wiring is obtained by reading the local git remote (e.g. `origin`) in the project directory — the same detection DevForge already relies on for GitHub Actions — rather than asking the user to type it in or hardcoding it into any file.

### Phases

**Phase 1 — Jenkinsfile Generation (Core)**
- Add Jenkinsfile templates per supported framework, parameterized through the existing variable allowlist.
- Map each deployment target (Vercel, Railway, Render, Firebase, AWS ECS/EKS/EC2, Docker) to corresponding pipeline stages.
- For AWS targets, reuse the already-generated Terraform/CDK/boto3 artifacts inside the deploy stage instead of duplicating logic.
- Deliverable: `devforge init` can emit a working Jenkinsfile alongside the GitHub Actions workflow.

**Phase 2 — Automated Job & Repo Setup**
- Detect the GitHub repository URL by reading the local git remote (`origin`), normalizing SSH/HTTPS forms as needed.
- Generate `config.xml` per job using the same template approach as the Jenkinsfile, substituting in the detected repo URL.
- Call the Jenkins REST API (`crumbIssuer` + `createItem`) to create the job programmatically.
- Auto-configure the SCM block with the detected repo URL and stored Jenkins credentials (credentials referenced, never injected as secrets — consistent with current secret-handling).
- Register a GitHub webhook pointing at the Jenkins controller, or use the GitHub Branch Source plugin for multibranch/PR builds.
- Deliverable: one command takes a project from "no Jenkins job" to "running pipeline, triggered on push."

**Phase 3 — Reproducible Jenkins Controllers (Optional)**
- Generate Jenkins Configuration-as-Code (JCasC) YAML so the whole controller (credentials, security, installed plugins) is reproducible, not just the job.
- Useful for teams spinning up fresh Jenkins instances as part of onboarding.

**Phase 4 — Jenkinsfile Audit Mode**
- Extend `devforge audit` to scan Jenkinsfiles for security, performance, and best-practice issues, reusing the same per-file report format used for GitHub Actions.

---

## Feature 2: Task-Wise Progress Updates for IaC Automation

### What it adds
A live, step-by-step status view of the IaC generation/verification/retry loop — instead of a single blocking call, the user sees each stage (detect → generate → scan → validate → retry → write) update in real time.

### Approach
Extend the same live-streaming pattern already used by the `deploy` command. Define an explicit task graph up front, emit structured status events as each task runs, and render those events as a live checklist in the terminal. A Trivy security scan now runs on the generated IaC config **before** it is validated/executed, so issues are caught and auto-remediated ahead of any actual Terraform execution rather than after.

### Phases

**Phase 1 — Task Graph Definition**
- Break the existing IaC flow into discrete, named tasks: `detect-iac`, `generate-config`, `trivy-scan`, `validate` (terraform validate / cdk synth / py_compile), `retry-with-llm-feedback` (conditional, up to `DEVFORGE_IAC_MAX_RETRY`), `write-files`.
- `trivy-scan` now runs immediately after `generate-config` and before `validate`, so the generated config is checked for security issues before any Terraform execution takes place — ensuring a safe execution path.
- `retry-with-llm-feedback` is triggered by either a failed `validate` or any findings from `trivy-scan`, so security issues are auto-remediated the same way validation errors are today.
- Each task gets a stable id, label, and status enum: `pending | running | success | failed | skipped`.

**Phase 2 — Structured Event Emission**
- Replace free-text logging in the IaC engine with structured events (`{ taskId, status, attempt, error? }`) emitted at each state change.
- Explicitly surface retry attempts (e.g. "Validating Terraform plan, attempt 1/2 — failed, retrying with corrected config") rather than looping silently.
- Explicitly surface Trivy findings as they're auto-remediated (e.g. "Trivy scan found 2 high-severity issues — retrying with corrected config before execution") so the user sees *why* a retry happened, not just that one did.

**Phase 3 — Live Terminal Rendering**
- Render the event stream as an in-place updating checklist (spinner → ✓/✗ per task), using a CLI task-list library such as `listr2`.
- Deliverable: running `devforge init` with IaC generation shows real-time progress instead of a single "please wait."

**Phase 4 — Persistent Task Log**
- Write the same structured events to a JSON log under `.devforge/` so a run can be replayed or reviewed later.
- Feeds into the existing compliance-scanning story (NIST/ISO) by giving auditors a record of exactly what happened during generation — including pre-execution Trivy findings and any auto-remediation — not just a terminal transcript.

**Phase 5 — Shared Task-Runner Abstraction**
- Generalize the task-runner built for IaC so it also drives Jenkins job creation/webhook setup (Feature 1, Phase 2) and the existing `deploy` command.
- One consistent progress/event model across `init`, `deploy`, and Jenkins automation, instead of three separate ad hoc implementations.

---

## Suggested Build Order

1. Feature 2, Phases 1–3 (task runner + live checklist, including the pre-execution Trivy scan) — smaller, self-contained, and produces the abstraction Feature 1 will reuse.
2. Feature 1, Phases 1–2 (Jenkinsfile generation + automated job/repo setup via local git remote detection) — the core production need.
3. Feature 2, Phase 4 and Feature 1, Phase 4 (persistent logs, Jenkinsfile audit) — compliance/observability layer.
4. Feature 1, Phase 3 (JCasC) and Feature 2, Phase 5 (shared task-runner everywhere) — consolidation.
