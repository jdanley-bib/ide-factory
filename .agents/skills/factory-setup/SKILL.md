---
name: factory-setup
description: >
  Record the project's test command and governance mode. Use when the user
  asks to set up the factory, or when doctor reports a missing test decision
  or a missing principal verifier.
---

# Factory setup

You confirm the test command and the governance mode with the human, then run one command. The IDE session model does the work. Do not hand-edit `.factory/checks.json` or `.factory/config.json`.

1. Run `idefactory setup --detect` and show the human each proposed command.
2. Ask which stacks to keep, which stack is `unit` when more than one is kept, and whether governance is lightweight or strict.
3. Do not run `idefactory setup` before the human confirms or corrects the command and the governance mode.
4. After that confirmation, run the writing form with an argv array, for example `idefactory setup --governance lightweight --map unit --argv dotnet --argv test`. For a command with a part that begins with `--`, or with spaces, pipes, or quotes, pass the whole command as one JSON array: `idefactory setup --governance lightweight --map unit --argv-json '["dotnet","test","--filter","Category=Unit | Category=Integration"]'`. The equals form `--argv=--filter` also works for one part. A flag that needs a value fails instead of storing a placeholder, so read the error rather than retrying a variation. Check the stored command with `idefactory checks preview`, which prints each registered argv as an exact JSON array.
5. Strict governance also needs one `--verifier-argv` flag per argv part. A project with no test command uses `--no-test` instead of `--map`.
6. When `run` or `next` stops with `setup-incomplete`, it has written nothing and started no session. Steps 1 to 5 answer it, then run the same `run` or `next` command again.
7. When `upgrade`, `init`, or `doctor` reports malformed instruction markers, the note names the file, the line numbers, and the edit that repairs them. Make that edit with your normal file tools, change nothing else in the file, and run `idefactory upgrade` again. Upgrade still never writes that file.

<!-- idefactory:owned -->
