# Implementation notes: require-profile-checks-before-review

## Migration for existing installs

`idefactory upgrade` does not rewrite `.factory/profiles.json`, because that file is team state. Existing installs that want items annotated `verificationProfile: cli` must add this entry by hand:

```json
"cli": {
  "checks": ["unit"],
  "humanGate": false
}
```

Until it is added, an item whose profile is `cli` is refused at review handoff and at completion, with an error that names the profile. Items on profiles already present in the file are checked against the union of profile and item checks.

Rollback: revert this change. Items that were handed off under the old rule are unaffected.
