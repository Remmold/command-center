# 05: Other keys

**What to build:** entries in a settings file the page has no control for are listed under Other keys with their raw value, editable and removable as JSON. Spec: `.scratch/claude-settings/spec.md` (user stories 42, 43); glossary "Other keys".

**Blocked by:** 04

**Status:** resolved

- [x] Every key without a control shows under Other keys in the edited layer, with its raw value in a small JSON box.
- [x] Editing parses the JSON before the change can be staged; invalid JSON shows the parse message.
- [x] Remove stages deleting the key.
- [x] Nothing in a file is ever hidden or dropped on save. Vitest covers which keys count as other keys.

## Comments

- Review left as judgement calls: invalid JSON is never staged, but Save does not warn that a box still holds bad text, so that edit is lost on Save. Worth a block on Save if it bites.
- Removing a key also removes the parent objects it empties (9d584e6). Spec says a patch touches only the paths it names; this one extra case is kept on purpose, but the spec or ADR 0006 could name it.
- Catalog settings with no plainer control (model picker list, spinner words, plugins on or off and others) now edit as raw JSON too, which goes a little past this ticket.
- Left as is: the "file now has" badge and the JSON box label repeat between the setting row and the Other keys row; the JSON box repeats the text field's class string.
