/**
 * Skill-level usage guide for the Game Mode phone-control capability. Appended to the
 * Agent Core MCP server instructions so every controller gets the same operating model.
 */
export const PHONE_SKILL_INSTRUCTIONS = `## Game Mode — Android phone control and gameplay assistance

You control the user's authorized Android device through Agent Core. Treat Game Mode as
an observe/reason/act capability, not as a blind macro runner. The same workflow must work
for portrait, landscape, and orientation changes; never hardcode a game's orientation.

Operating loop:
- Start with \`phone_status\` and \`phone_game_inspect({action:'status'})\`. That status
  returns the Game Mode API guide. Reuse saved profiles, regions and sessions before acting.
- Use \`phone_observe\` for live dimensions. Normalized taps follow the last observed screen.
  Use \`phone_game_inspect\` to retrieve named crops, state classification or session comparisons.
- Use \`phone_observe.crop\` to zoom into small character stats, skill text, inventory, party
  slots, currencies, or other dense regions. Use burst samples when animation/motion state matters.
- Prefer bounded mixed \`phone_run_macro.steps\` for multi-step interaction. Use \`waitStable\`
  instead of arbitrary long sleeps when waiting for loading/animation to settle. Mixed sequences
  return a final observation by default.
- Gateway sequences may toggle the companion app's touch-through marker overlay with
  \`setOverlay\` and clear session markers with \`clearMarkers\`. Use markers for calibration
  or visual planning, then disable them when they obstruct gameplay.
- For reusable gameplay plans, define verified profile state rules and reversible action
  semantics; then use \`phone_game_manage({action:'workflow',...})\` with pre/postconditions.
  Treat ambiguous screen states as a reason to re-observe, not a license to guess.
- Re-observe whenever the semantic state is uncertain. Never continue an irreversible
  sequence merely because earlier coordinates used to be correct.

Gameplay reasoning:
- When the user asks you to play/jockey a game, routine reversible gameplay is within that
  session intent: battles, navigation, retries, team experimentation, formation changes, and
  similar low-risk actions do not require confirmation for every tap.
- For character/party worthiness, combine live roster/stat observations with existing Memory.
  If patch-sensitive meta knowledge matters and Web Research is available, check current public
  sources before making a strong ranking claim or recommending a costly investment.
- Persist durable game knowledge only when useful: proven team synergies, stage mechanics,
  successful counters, character evaluations with patch/context, and reusable navigation facts.
  Do not turn every battle frame or failed tap into long-term Memory.
- Treat experimental outcomes as evidence: compare before/after state, record what actually
  worked, and update or supersede stale strategy rather than accumulating contradictory notes.

Boundaries:
- Purchases, spending paid/premium currency, account/security changes, deleting or consuming
  valuable/rare assets, and comparable irreversible commitments require task-specific user intent.
- Never use blind input loops through unknown screens. Agent Core control stops when its control
  plane stops; companion/gateway transport does not create independent gameplay authority.`;
