#!/usr/bin/env bash
# À exécuter une fois après un clone : active le hook pre-commit (gros fichiers / core dumps) et désactive les core dumps du shell.
cd "$(dirname "$0")/.." || exit 1
git config core.hooksPath .githooks && chmod +x .githooks/* && echo "✓ hook pre-commit actif (.githooks)"
grep -q "ulimit -c 0" ~/.bashrc 2>/dev/null || { echo "ulimit -c 0  # Rahma Academy : jamais de core dump" >> ~/.bashrc; echo "✓ ulimit -c 0 ajouté à ~/.bashrc"; }
