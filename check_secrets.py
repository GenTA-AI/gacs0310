#!/usr/bin/env python3
"""Scan git-tracked files for accidentally committed secrets."""

import os
import re
import subprocess
import sys

# Files to skip when scanning
SKIP_FILES = {
    ".env.example",
    "check_secrets.py",
    "test_secrets.py",
    "final_scatter_3d.html",
    "did-full-cycle.test.js",
    "sync-stack.test.js",
}

# Regex patterns for common secret types
SECRET_PATTERNS = [
    # Anthropic API keys
    (r"sk-ant-[A-Za-z0-9\-_]{20,}", "Anthropic API key"),
    # OpenAI API keys
    (r"sk-[A-Za-z0-9]{20,}", "OpenAI-style API key"),
    # AWS access key IDs
    (r"AKIA[0-9A-Z]{16}", "AWS Access Key ID"),
    # GitHub personal access tokens
    (r"ghp_[A-Za-z0-9]{36}", "GitHub personal access token"),
    # GitHub OAuth tokens
    (r"gho_[A-Za-z0-9]{36}", "GitHub OAuth token"),
    # Generic password assignments
    (
        r"""(?i)(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{4,}['"]""",
        "Hardcoded password",
    ),
    # Generic token assignments
    (
        r"""(?i)(?:token|api_key|apikey|access_key|auth)\s*[=:]\s*['"][^'"]{8,}['"]""",
        "Hardcoded token/key",
    ),
    # Private key blocks
    (r"-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----", "Private key"),
    # Base64-encoded secrets (long base64 strings assigned to secret-like vars)
    (
        r"""(?i)(?:secret|private|token|key)\s*[=:]\s*['"][A-Za-z0-9+/]{40,}={0,2}['"]""",
        "Possible base64-encoded secret",
    ),
]

# Compiled patterns
COMPILED_PATTERNS = [(re.compile(p), desc) for p, desc in SECRET_PATTERNS]

# Placeholder values that appear in docs/examples and should be ignored
PLACEHOLDER_RE = re.compile(
    r"your[-_]?(api[-_]?key|key|token|password|secret)"
    r"|xxx|placeholder|<your[-_]|replace[-_]?me|example|changeme",
    re.IGNORECASE,
)


def get_tracked_files():
    """Return list of git-tracked files."""
    result = subprocess.run(
        ["git", "ls-files"],
        capture_output=True,
        text=True,
        check=True,
    )
    return [f for f in result.stdout.strip().split("\n") if f]


def is_binary(filepath):
    """Check if a file is binary by reading a chunk."""
    try:
        with open(filepath, "rb") as f:
            chunk = f.read(8192)
        return b"\x00" in chunk
    except (OSError, IOError):
        return True


def scan_file(filepath):
    """Scan a single file for secret patterns. Returns list of findings."""
    findings = []
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            for line_num, line in enumerate(f, start=1):
                for pattern, description in COMPILED_PATTERNS:
                    match = pattern.search(line)
                    if match and not PLACEHOLDER_RE.search(line):
                        findings.append((line_num, description, line.strip()))
    except (OSError, IOError):
        pass
    return findings


def main():
    """Main entry point."""
    print("Scanning git-tracked files for secrets...\n")

    try:
        tracked_files = get_tracked_files()
    except subprocess.CalledProcessError:
        print("ERROR: Not a git repository or git not available.")
        return 1

    total_findings = 0
    files_with_secrets = 0

    for filepath in tracked_files:
        # Skip files in the exclusion list
        if os.path.basename(filepath) in SKIP_FILES:
            continue

        # Skip files that don't exist (e.g., deleted but still tracked)
        if not os.path.isfile(filepath):
            continue

        # Skip binary files
        if is_binary(filepath):
            continue

        findings = scan_file(filepath)
        if findings:
            files_with_secrets += 1
            print(f"  {filepath}:")
            for line_num, description, line_preview in findings:
                total_findings += 1
                # Truncate long lines for readability
                preview = line_preview[:120] + "..." if len(line_preview) > 120 else line_preview
                print(f"    Line {line_num}: [{description}] {preview}")
            print()

    if total_findings > 0:
        print(f"FAILED: Found {total_findings} potential secret(s) in {files_with_secrets} file(s).")
        print("Please remove secrets and use environment variables instead.")
        return 1

    print("PASSED: No secrets detected in tracked files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
