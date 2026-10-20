---
name: factory-tdd
description: >
  Write a failing test before production code for a factory task. Use when
  factory-build is implementing and no test-driven-development skill is installed.
---

# Factory test-first

<!-- idefactory:owned -->

1. Restate the backlog acceptance criterion as one observable behavior.
2. Write a failing test that fails because the behavior is missing, not because the test is broken.
3. Run that test and read the failure.
4. Write the minimum production code that makes the test pass.
5. Run the test again and keep the output.
6. Do not add production code for behavior the test does not cover yet.

Never call Ollama. Never invent a product from the web.
