# DevForge Security Model

DevForge is designed to inspect project metadata and generate deterministic workflow files without changing your source code or reaching out to external services during generation.

## What DevForge Reads

DevForge reads project configuration files such as `package.json`, lockfiles, workflow YAML, and related config files needed to detect the stack and generate workflows.

DevForge never reads your source code. It only reads `package.json` and config files.

## What DevForge Does Not Do

- DevForge never makes network requests during generation.
- DevForge never stores real credentials in generated files.
- DevForge never injects secrets into workflow content; it only emits placeholder references like `${{ secrets.NAME }}`.

## Safe Defaults

- All writes go through a guarded file system abstraction.
- Generated templates are static and deterministic.
- Update and audit flows are read-only until you explicitly approve changes.

## Accepted Risks

The current local audit run reports one high-severity advisory in the npm toolchain's transitive dependency tree. It is not accepted as a release risk; treat it as a toolchain issue that must be reviewed before publishing.

Any future audit exception should be documented here with the rationale, scope, and mitigation plan.

