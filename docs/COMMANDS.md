# Command Reference

This page is the reference for the shipped DevForge CLI commands.

## `devforge init`

Creates a new DevForge run for the current project by detecting the stack, collecting deployment preferences, and generating workflow files.

### Flags

- `--dry-run` - Simulate generation without writing files.
- `--force-detect` - Skip the detection cache and re-run project detection.
- `--preview` - Show the file preview before generating.

### Example

```bash
npx devforge init --preview
```

### Output

- Prints a detection summary and generation plan.
- Can show a full preview before any files are written.
- Writes workflow files and `.devforge/SECRETS_REQUIRED.md` unless dry-run is enabled.

## `devforge update`

Refreshes existing DevForge-managed workflows against the latest templates while preserving manually maintained sections.

### Flags

- `--dry-run` - Print the diff without writing files.

### Example

```bash
npx devforge update --dry-run
```

### Output

- Fails if there is no previous DevForge run to compare against.
- Compares the stored plan hash with the current template output.
- Prints unified diffs for changed files.
- Prompts before applying changes unless dry-run is used.

## `devforge audit`

Inspects `.github/workflows` and reports security and quality issues without changing any files.

### Flags

- `--fix` - Prints the current auto-fix stub message.

### Example

```bash
npx devforge audit --fix
```

### Output

- Scans `.github/workflows` for YAML files.
- Reports findings with severity levels from CRITICAL to INFO.
- Returns a non-zero exit code when high or critical issues are present.

## `devforge preview`

Shows a rendered preview of the files that would be generated, with no disk writes.

### Flags

- No command-specific flags are currently exposed.

### Example

```bash
npx devforge preview
```

### Output

- Shows generated file contents with line numbers.
- Summarizes how many files are ready to generate.
