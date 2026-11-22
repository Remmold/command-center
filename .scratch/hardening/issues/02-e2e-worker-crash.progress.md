Done: root cause found. Node 24.15's libuv overruns the stack on a Windows loopback connect (nodejs/node#63620), so the worker dies when it connects to the app. pnpm e2e now warns on affected Node versions. On Node 24.22.3, 10 of 10 full runs were green.
Next step: Andreas upgrades the machine's Node to 24.16 or later. The guard warning then goes away.
Open reds: none on the fixed Node. Two app-side flakes were seen once each on 24.15 (`delayClaudeStart` "Resulting promise was garbage collected"; slash-menu Tab left the prompt empty). They were not seen in the 10 proof runs.
