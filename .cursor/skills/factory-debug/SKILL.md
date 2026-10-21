---
name: factory-debug
description: >
  Trace a failing factory test to its cause before changing code. Use when a
  verification command fails and no systematic-debugging skill is installed.
---

# Factory debug

<!-- idefactory:owned -->

1. Reproduce the failure with one command.
2. Read the error before choosing a fix.
3. Trace the failing path to the line that is wrong.
4. Add a failing test for that cause if the current test does not already show it.
5. Fix the cause and run the same command again.
6. If the failure is outside the task, stop and report it. Do not expand the product.
