---
id: TASK-7
title: '[3.3] Add doctor, approvals, lockout, and upgrade'
status: Done
assignee: []
created_date: '2026-10-20T19:18:00Z'
updated_date: '2026-10-20T19:25:00Z'
labels:
  - ide-native-factory
  - factory
dependencies:
  - TASK-1
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
openspec-task: 3.3

Change: openspec/changes/ide-native-factory
Spec tasks.md checkbox 3.3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 doctor fails when empty and passes after init; two approvals remain; upgrade keeps a custom decision.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
doctor fails when empty and passes after init. Approvals append. Upgrade keeps a custom decision. Lockout writes a note.
<!-- SECTION:FINAL_SUMMARY:END -->
