---
id: TASK-2
title: '[1.2] Preserve existing project memory on re-init'
status: Done
assignee: []
created_date: '2026-10-20T19:18:00Z'
updated_date: '2026-10-20T19:25:00Z'
labels:
  - ide-native-factory
  - factory
dependencies:
  - TASK-1
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
openspec-task: 1.2

Change: openspec/changes/ide-native-factory
Spec tasks.md checkbox 1.2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Second init keeps decisions, histories, .squad/team.md bytes, and original AGENTS.md text.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Re-init keeps decisions, histories, .squad bytes, and original AGENTS.md text. Covered by test/install.test.mjs.
<!-- SECTION:FINAL_SUMMARY:END -->
