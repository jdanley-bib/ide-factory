---
id: TASK-5
title: '[3.1] Sync OpenSpec checkboxes into Backlog.md'
status: Done
assignee: []
created_date: '2026-10-20T19:18:00Z'
updated_date: '2026-10-20T19:25:00Z'
labels:
  - ide-native-factory
  - factory
dependencies:
  - TASK-1
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
openspec-task: 3.1

Change: openspec/changes/ide-native-factory
Spec tasks.md checkbox 3.1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Unchecked boxes become labeled tasks once, checked boxes are skipped, and .factory has no backlog.md.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
sync-tasks creates one labeled Backlog task per unchecked box, skips checked boxes and duplicates, and does not write .factory/backlog.md.
<!-- SECTION:FINAL_SUMMARY:END -->
