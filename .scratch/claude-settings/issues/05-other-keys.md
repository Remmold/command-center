# 05: Other keys

**What to build:** entries in a settings file the page has no control for are listed under Other keys with their raw value, editable and removable as JSON. Spec: `.scratch/claude-settings/spec.md` (user stories 42, 43); glossary "Other keys".

**Blocked by:** 04

**Status:** in-progress — built and committed in 8f6a55f; code review not yet applied

- [ ] Every key without a control shows under Other keys in the edited layer, with its raw value in a small JSON box.
- [ ] Editing parses the JSON before the change can be staged; invalid JSON shows the parse message.
- [ ] Remove stages deleting the key.
- [ ] Nothing in a file is ever hidden or dropped on save. Vitest covers which keys count as other keys.
