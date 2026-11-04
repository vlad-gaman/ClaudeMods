# session-handoff

Writes a handoff file for the current session so a new chat can continue where this one stopped, without re-reading everything. It runs when you type `/handoff-session`, a few minutes before the prompt cache goes cold, and when the context passes 250k tokens. A panel above the prompt shows six numbered steps (read the conversation, find files, list skills, tools and links, write, save, check) and four buttons: Copy prompt, Start a new chat with it, Open file, Close. Handoffs are saved in `~/.claude/handoffs/`. Thresholds and the cache lifetime are set in the mod's options.
