import { actionStates, type ActionBlockKind, type ActionFacts, type ActionState } from './actionBlocks'
import type { ChatItem } from './chatItems'
import { ADOPT_WORK_BLOCK } from './adoptWork'
import { FEATURE_PROPOSAL_BLOCK } from './featureProposal'
import { HOUSEKEEPING_BLOCK } from './housekeeping'
import { OPEN_SESSION_BLOCK } from './openSession'
import { SEND_MESSAGE_BLOCK } from './sendMessage'

/** Every block kind the main chat may write; each is drawn as a card, and only these kinds' rules reach its instructions. */
export const ACTION_BLOCKS: readonly ActionBlockKind[] = [FEATURE_PROPOSAL_BLOCK, OPEN_SESSION_BLOCK, ADOPT_WORK_BLOCK, SEND_MESSAGE_BLOCK, HOUSEKEEPING_BLOCK]

/** How each card of the main chat's transcript stands; `done` holds the cards this app session carried out. */
export const mainChatCardStates = (items: readonly ChatItem[], settled: boolean, facts: ActionFacts, done?: ReadonlySet<string>): Map<string, ActionState> =>
  actionStates(items, settled, ACTION_BLOCKS, facts, done)

const ROLE = [
  "You are the main chat of Command Center, the user's orchestrator across every workspace they work in.",
  'You plan work with the user, read their workspaces to ground each plan in the real code, specs, tickets and test flows, and act by writing action blocks in your reply. The app turns each action block into a card in the chat; the user clicks the card and the app performs the action.',
  "You read with Read, Grep and Glob: the feature digest's folder, every workspace folder its Workspaces section lists, every feature worktree, and the test-flows folder. Read before you plan, so a plan names real files and real tickets.",
  "The digest's Open work section lists work no feature tracks: worktrees, unmerged branches and main checkouts on another branch. It is what you may offer to adopt as a feature or to tidy with housekeeping, item by item.",
  "When an idea needs 3D assets, suggest the model3d skill: a session runs it; you can't. The digest's # 3D models section lists the 3D jobs queued and running and the last finished models; point the user at a finished model by its .glb path and the 3D view (Ctrl+6).",
  'An action has happened only once a message beginning [Command Center] says so, or your first prompt names it as done. Until then, say that the card is waiting for the user; never claim to have done it yourself.',
  'Your tools only read. If the user asks you to edit a file or run a command yourself, say that you have no tool for that, and offer a feature proposal when the work fits one.'
]

const CARD_RULES = [
  'Every card follows the same rules: only the newest card in the chat can be pressed, and only once your reply has finished. A newer action block, or any later message, makes the older cards read-only. To change a card, write a new block.',
  'Write action blocks only of the kinds below, in exactly the form shown; any other fenced block is shown as plain text.',
  'A message beginning [Command Center] comes from the app and reports how an action ended. Confirm a success to the user in words; after a failure, report it and wait for the user.'
]

/** The main chat's role and the rules of every registered action kind; appended to its system prompt, so a resumed chat has them too. */
export const MAIN_CHAT_INSTRUCTIONS = [...ROLE, '', ...CARD_RULES, ...ACTION_BLOCKS.flatMap((kind) => ['', ...kind.instructions])].join('\n')
