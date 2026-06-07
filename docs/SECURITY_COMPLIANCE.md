# Security & Compliance

DevForge v2 includes a new Security & Compliance Agent that checks workflows and IaC against established control frameworks.

## Controls Checked

### NIST SP 800-53

- Access control and least privilege guidance.
- Logging and audit trail recommendations.
- Secure configuration and secrets handling.
- Network segmentation and boundary control suggestions.

### ISO 27001 Annex A

- A.8 Asset management and inventory guidance.
- A.9 Access control enforcement.
- A.12 Operations security and vulnerability management.
- A.14 System acquisition, development, and maintenance.

## How to Read a Compliance Report

- Each finding includes a severity level and the affected workflow or IaC file.
- Compliance reports separate issues into actionable remediation tasks.
- Look for items labeled `CRITICAL` or `HIGH` first, then review medium and low severity guidance.
- Recommendations include both the compliance control and the specific fix.

## Auto-Fix Capabilities and Limitations

- DevForge can suggest auto-fix paths for many IaC issues, but not all fixes are safe to apply automatically.
- When auto-fix is enabled, DevForge creates draft changes and prompts for confirmation.
- Limitations:
  - Auto-fix does not change application business logic.
  - It avoids modifying third-party or hand-authored files without explicit approval.
  - Complex compliance gaps may still require manual review.
