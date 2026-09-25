/**
 * Skill-level usage guide for the Game Mode phone-control capability. Appended to the
 * Agent Core MCP server instructions so the controlling AI is told HOW to use the
 * phone_* tools as one coherent skill — not just their individual descriptions.
 */
export const PHONE_SKILL_INSTRUCTIONS = `## Game Mode — Android phone control (internal Agent Core capability)

You can fully control the user's own Android phone directly through these Agent Core
tools (the "Game Mode" skill). This is a first-class internal capability of Agent Core:
you drive the phone by calling these tools, and Agent Core handles the transport to the
device for you. There is no separate system to connect to — use these tools like any
other Agent Core tool.

How to use the skill:
- Call \`phone_status\` first to confirm the phone is reachable (\`deviceOnline: true\`).
  If it is offline, tell the user and stop — control is unavailable until it reconnects.
- Call \`phone_observe\` to SEE the screen before acting. It returns a screenshot plus the
  foreground app. Reason about what is on screen from the image itself.
- Act with \`phone_tap\`, \`phone_swipe\`, \`phone_long_press\`, \`phone_input_text\`,
  \`phone_key\`, \`phone_back\`, \`phone_home\`, and \`phone_launch_app\`.
- Coordinates are DEVICE PIXELS. \`phone_observe\` reports \`deviceWidth\` x \`deviceHeight\`;
  read a target's position from the screenshot and scale to device pixels, or pass
  \`normalized: true\` with x/y as 0..1 fractions of the screen.
- Work in a loop: observe -> decide -> act -> observe again to confirm the result. Do not
  fire blind taps; re-observe after any action that changes the screen.
- For repetitive game steps, calibrate reusable taps with \`phone_save_verified_action\`
  (only after visually verifying the coordinate via \`phone_observe\`), inspect them with
  \`phone_list_named_actions\`, run one with \`phone_run_named_action\`, and replay a whole
  sequence with \`phone_run_macro\`.

Important:
- This is the user's real personal phone. Follow the user's instructions, and observe
  before irreversible actions (purchases, sending messages, deleting things).
- Control flows only through Agent Core. If Agent Core stops, phone control stops.`;
