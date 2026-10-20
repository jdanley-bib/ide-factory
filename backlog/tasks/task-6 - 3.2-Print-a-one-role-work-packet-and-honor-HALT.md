---
id: TASK-6
title: '[3.2] Print a one-role work packet and honor HALT'
status: Done
assignee: []
created_date: '2026-10-20T19:18:00Z'
updated_date: '2026-10-20T19:25:00Z'
labels:
  - ide-native-factory
  - factory
dependencies:
  - TASK-5
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
openspec-task: 3.2

Change: openspec/changes/ide-native-factory
Spec tasks.md checkbox 3.2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 next names only the engineer charter, and HALT blocks next and sync-tasks without running a model binary.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
next prints a single engineer packet. HALT blocks next and sync-tasks. A fake model binary on PATH is not executed.
<!-- SECTION:FINAL_SUMMARY:END -->
